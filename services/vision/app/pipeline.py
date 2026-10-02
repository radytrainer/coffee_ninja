"""Capture → track → gesture pipeline running in a background thread.

Computer vision is CPU-bound and blocking; running it in its own thread keeps
the asyncio server (HTTP + WebSocket) responsive. Only small JSON events leave
this thread — frames are never streamed.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Callable

import cv2
import numpy as np

from camera.camera_manager import CameraManager, CameraStatus
from camera.light import LightMeter
from config.settings import GestureTuning, Settings
from gestures.calibration import CalibrationMapper
from gestures.engine import GestureEngine
from hand_tracking import landmarks as L
from hand_tracking.face_tracker import FaceObservation, FaceTracker
from hand_tracking.hand_tracker import HandObservation, HandTracker, ensure_model

from .store import load_state, save_state

log = logging.getLogger("vision.pipeline")

Publish = Callable[[dict[str, Any]], None]


class VisionPipeline:
    CAMERA_RETRY_SECONDS = 2.0

    def __init__(self, settings: Settings, publish: Publish, camera: CameraManager | None = None) -> None:
        self.settings = settings
        self.publish = publish
        self.camera = camera or CameraManager(
            index=settings.camera_index,
            width=settings.camera_width,
            height=settings.camera_height,
            fps=settings.camera_fps,
            mirror=settings.camera_mirror,
            backend=settings.camera_backend,
        )
        self.mapper = CalibrationMapper()
        self.tuning: GestureTuning = load_state(settings.calibration_path, settings.default_tuning(), self.mapper)
        self.engine = GestureEngine(self.tuning, self.mapper, smile_secret=settings.smile_token_secret)
        self.tracker: HandTracker | None = None
        self.face_tracker: FaceTracker | None = None
        self.model_ready = False
        self.message: str | None = None
        self.fps = 0.0
        self.light = LightMeter()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_camera_attempt = 0.0
        self._frame_lock = threading.Lock()
        self._last_frame: np.ndarray | None = None
        self._last_obs: list[HandObservation] = []

    # ------------------------------------------------------------------ lifecycle
    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="vision-pipeline", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
        self.camera.stop()
        if self.tracker:
            self.tracker.close()
            self.tracker = None
        if self.face_tracker:
            self.face_tracker.close()
            self.face_tracker = None

    def restart_camera(self) -> bool:
        self._last_camera_attempt = time.monotonic()
        return self.camera.restart()

    def select_camera(self, index: int) -> bool:
        self._last_camera_attempt = time.monotonic()
        return self.camera.select(index)

    # ------------------------------------------------------------------ config
    def apply_tuning(self, tuning: GestureTuning) -> None:
        self.tuning = tuning
        self.engine.configure(tuning)
        save_state(self.settings.calibration_path, self.tuning, self.mapper)

    def save(self) -> None:
        save_state(self.settings.calibration_path, self.tuning, self.mapper)

    # ------------------------------------------------------------------ status
    @property
    def camera_state(self) -> str:
        if not self.model_ready and self.message:
            return CameraStatus.UNAVAILABLE.value
        return self.camera.status.value

    def status_event(self) -> dict[str, Any]:
        return {
            "type": "status",
            "camera": self.camera_state,
            "message": self.message or self.camera.last_error,
            "fps": round(self.fps, 1),
            "calibrated": self.mapper.calibrated,
            # Too dark to see hands (covered camera, lights off) → the kiosk shows a hint.
            "lowLight": self.light.dark and self.camera.status == CameraStatus.RUNNING,
            "timestamp": int(time.time() * 1000),
        }

    def debug_frame(self) -> bytes | None:
        """A single annotated JPEG for troubleshooting (not a video stream)."""
        with self._frame_lock:
            frame = None if self._last_frame is None else self._last_frame.copy()
            obs = self._last_obs
        if frame is None:
            return None
        h, w = frame.shape[:2]
        for hand in obs:
            pts = [(int(p[0] * w), int(p[1] * h)) for p in hand.points]
            for a, b in L.CONNECTIONS:
                cv2.line(frame, pts[a], pts[b], (80, 200, 255), 2)
            for i, p in enumerate(pts):
                color = (0, 220, 120) if i in (L.THUMB_TIP, L.INDEX_TIP) else (255, 255, 255)
                cv2.circle(frame, p, 6 if i in (L.THUMB_TIP, L.INDEX_TIP) else 3, color, -1)
        if obs:
            mode = "swipe" if self.engine.palm_swipe.active else "scroll" if self.engine.scrolling else self.engine.last_pose.value
            cv2.putText(frame, f"hands: {len(obs)}  mode: {mode}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 220, 120), 2)
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return buf.tobytes() if ok else None

    # ------------------------------------------------------------------ loop
    def _init_tracker(self) -> bool:
        if not ensure_model(self.settings.model_file, self.settings.model_url):
            self.message = "Hand-tracking model is missing and could not be downloaded"
            return False
        try:
            self.tracker = HandTracker(
                self.settings.model_file,
                self.settings.min_detection_confidence,
                self.settings.min_tracking_confidence,
            )
        except Exception as exc:
            self.message = f"Could not load hand-tracking model: {exc}"
            log.exception("tracker init failed")
            return False
        self.model_ready = True
        self.message = None
        self._init_face_tracker()
        return True

    def _init_face_tracker(self) -> None:
        """Optional: the close-eyes gesture. Hand control works without it."""
        if not self.settings.face_gestures:
            return
        if not ensure_model(self.settings.face_model_file, self.settings.face_model_url):
            log.warning("face model unavailable - close-eyes gesture disabled")
            return
        try:
            self.face_tracker = FaceTracker(
                self.settings.face_model_file,
                self.settings.min_detection_confidence,
                self.settings.min_tracking_confidence,
            )
        except Exception:
            log.exception("face tracker init failed - close-eyes gesture disabled")

    def _run(self) -> None:
        while not self._stop.is_set() and not self._init_tracker():
            self._stop.wait(30)

        last_status = 0.0
        last_frame_time = time.monotonic()
        while not self._stop.is_set():
            now = time.monotonic()
            if self.camera.status != CameraStatus.RUNNING:
                if now - self._last_camera_attempt >= self.CAMERA_RETRY_SECONDS:
                    self._last_camera_attempt = now
                    self.camera.start()
                if self.camera.status != CameraStatus.RUNNING:
                    for event in self.engine.update(None, now * 1000):
                        self.publish(event)
                    self.fps = 0.0
                    self._stop.wait(0.2)
                    continue

            frame = self.camera.read()
            if frame is None:
                self._stop.wait(0.01)
                continue
            was_dark = self.light.dark
            self.light.update(frame, time.monotonic())
            if self.light.dark != was_dark:
                log.warning("camera image %s (brightness %.0f/255)", "too dark" if self.light.dark else "OK again", self.light.brightness or 0)
                self.publish(self.status_event())

            now_ms = time.monotonic() * 1000
            try:
                obs = self.tracker.process(frame, int(now_ms)) if self.tracker else []
            except Exception:  # never let one bad frame kill the loop
                log.exception("hand tracking failed on a frame")
                obs = []
            for event in self.engine.update(obs, now_ms):
                self.publish(event)

            face: FaceObservation | None = None
            if self.face_tracker and (self.tuning.eyes_closed_back or self.engine.smile_secret):
                try:
                    face = self.face_tracker.process(frame, int(now_ms))
                except Exception:
                    log.exception("face tracking failed on a frame")
            for event in self.engine.update_face(face, now_ms):
                self.publish(event)

            with self._frame_lock:
                self._last_frame = frame
                self._last_obs = obs

            elapsed = time.monotonic() - last_frame_time
            last_frame_time = time.monotonic()
            if elapsed > 0:
                instant = 1.0 / elapsed
                self.fps = instant if self.fps == 0 else self.fps * 0.9 + instant * 0.1
            if last_frame_time - last_status > 5:
                last_status = last_frame_time
                log.debug("pipeline fps %.1f", self.fps)
