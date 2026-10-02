"""Webcam access with graceful failure handling.

The camera may be missing, busy or unplugged at any time. CameraManager never
raises on those conditions: it reports a status and lets the pipeline retry.
"""

from __future__ import annotations

import logging
import sys
import threading
from enum import Enum
from typing import Callable

import cv2
import numpy as np

log = logging.getLogger("vision.camera")

_BACKENDS = {
    "dshow": cv2.CAP_DSHOW,
    "msmf": cv2.CAP_MSMF,
    "v4l2": cv2.CAP_V4L2,
    "any": cv2.CAP_ANY,
}


class CameraStatus(str, Enum):
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    UNAVAILABLE = "unavailable"


def _default_backend() -> int:
    # DirectShow opens much faster than MSMF on Windows; V4L2 is the Linux default.
    if sys.platform.startswith("win"):
        return cv2.CAP_DSHOW
    if sys.platform.startswith("linux"):
        return cv2.CAP_V4L2
    return cv2.CAP_ANY


CaptureFactory = Callable[[int, int], "cv2.VideoCapture"]


class CameraManager:
    """Opens, reads, restarts and releases a camera device."""

    MAX_CONSECUTIVE_FAILURES = 15

    def __init__(
        self,
        index: int = 0,
        width: int = 640,
        height: int = 480,
        fps: int = 30,
        mirror: bool = True,
        backend: str = "auto",
        capture_factory: CaptureFactory | None = None,
    ) -> None:
        self.index = index
        self.width = width
        self.height = height
        self.fps = fps
        self.mirror = mirror
        self.backend = _BACKENDS.get(backend.lower(), _default_backend()) if backend != "auto" else _default_backend()
        self._factory: CaptureFactory = capture_factory or (lambda i, b: cv2.VideoCapture(i, b))
        self._cap: cv2.VideoCapture | None = None
        self._lock = threading.RLock()
        self._failures = 0
        self.status = CameraStatus.STOPPED
        self.last_error: str | None = None
        self.actual_resolution: tuple[int, int] | None = None

    # ------------------------------------------------------------------ lifecycle
    def start(self) -> bool:
        with self._lock:
            self._release()
            self.status = CameraStatus.STARTING
            try:
                cap = self._factory(self.index, self.backend)
                if cap is None or not cap.isOpened():
                    return self._fail(f"Camera {self.index} could not be opened (not connected or in use)")
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                cap.set(cv2.CAP_PROP_FPS, self.fps)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # always process the freshest frame
                ok, frame = cap.read()
                if not ok or frame is None:
                    cap.release()
                    return self._fail(f"Camera {self.index} opened but returned no image (check permissions)")
                self._cap = cap
                self._failures = 0
                self.actual_resolution = (int(frame.shape[1]), int(frame.shape[0]))
                self.status = CameraStatus.RUNNING
                self.last_error = None
                log.info("camera %s started at %sx%s", self.index, *self.actual_resolution)
                return True
            except Exception as exc:  # OpenCV can raise on broken drivers
                return self._fail(f"Camera error: {exc}")

    def stop(self) -> None:
        with self._lock:
            self._release()
            self.status = CameraStatus.STOPPED

    def restart(self) -> bool:
        log.info("restarting camera %s", self.index)
        return self.start()

    def select(self, index: int) -> bool:
        """Switch to another camera device."""
        with self._lock:
            self.index = index
            return self.start()

    # ------------------------------------------------------------------ frames
    def read(self) -> np.ndarray | None:
        """Returns the latest BGR frame (mirrored if configured) or None."""
        with self._lock:
            if self._cap is None or self.status != CameraStatus.RUNNING:
                return None
            try:
                ok, frame = self._cap.read()
            except Exception as exc:  # pragma: no cover - driver specific
                ok, frame = False, None
                self.last_error = str(exc)
            if not ok or frame is None:
                self._failures += 1
                if self._failures >= self.MAX_CONSECUTIVE_FAILURES:
                    self._fail("Camera stopped sending frames (disconnected?)")
                return None
            self._failures = 0
            return cv2.flip(frame, 1) if self.mirror else frame

    # ------------------------------------------------------------------ discovery
    def list_devices(self, max_index: int = 5) -> list[int]:
        """Probes device indexes 0..max_index-1. The active device is always included."""
        found: list[int] = []
        for i in range(max_index):
            if i == self.index and self.status == CameraStatus.RUNNING:
                found.append(i)
                continue
            try:
                cap = self._factory(i, self.backend)
                if cap is not None and cap.isOpened():
                    found.append(i)
                if cap is not None:
                    cap.release()
            except Exception:
                continue
        return found

    # ------------------------------------------------------------------ internals
    def _fail(self, message: str) -> bool:
        self._release()
        self.status = CameraStatus.UNAVAILABLE
        self.last_error = message
        log.warning(message)
        return False

    def _release(self) -> None:
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:  # pragma: no cover
                pass
        self._cap = None
