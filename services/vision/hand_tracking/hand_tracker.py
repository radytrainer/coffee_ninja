"""Hand landmark detection with the MediaPipe Tasks HandLandmarker."""

from __future__ import annotations

import logging
import shutil
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from . import landmarks as L

log = logging.getLogger("vision.hand")


@dataclass(frozen=True)
class HandObservation:
    """One detected hand.

    `points` are normalized image coordinates (x, y in 0..1, z relative depth),
    already mirrored if the camera is mirrored. `aspect` = width / height and is
    used to compute distances in an undistorted (square) space.
    """

    points: np.ndarray  # shape (21, 3)
    score: float
    handedness: str
    aspect: float = 4 / 3

    @property
    def index_tip(self) -> tuple[float, float]:
        return float(self.points[L.INDEX_TIP, 0]), float(self.points[L.INDEX_TIP, 1])

    @property
    def thumb_tip(self) -> tuple[float, float]:
        return float(self.points[L.THUMB_TIP, 0]), float(self.points[L.THUMB_TIP, 1])

    @property
    def wrist(self) -> tuple[float, float]:
        return float(self.points[L.WRIST, 0]), float(self.points[L.WRIST, 1])

    def square(self) -> np.ndarray:
        """2D points with x scaled by the aspect ratio so distances are isotropic."""
        pts = self.points[:, :2].astype(np.float64).copy()
        pts[:, 0] *= self.aspect
        return pts


def ensure_model(path: Path, url: str) -> bool:
    """Downloads a MediaPipe model on first run if it is missing."""
    if path.exists() and path.stat().st_size > 1_000_000:
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    log.info("downloading model to %s", path)
    try:
        with urllib.request.urlopen(url, timeout=60) as response, tempfile.NamedTemporaryFile(
            delete=False, dir=path.parent, suffix=".part"
        ) as tmp:
            shutil.copyfileobj(response, tmp)
            tmp_path = Path(tmp.name)
        tmp_path.replace(path)
        return True
    except Exception as exc:
        log.error("could not download model: %s", exc)
        return False


class HandTracker:
    """Wraps MediaPipe HandLandmarker in VIDEO mode (synchronous, tracking between frames)."""

    def __init__(self, model_path: Path, min_detection_confidence: float = 0.6, min_tracking_confidence: float = 0.5):
        # Imported lazily so unit tests of the gesture logic do not need MediaPipe.
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision

        self._mp = mp
        options = vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=2,  # so the cursor can stay on the customer's hand when another hand appears
            min_hand_detection_confidence=min_detection_confidence,
            min_hand_presence_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
        self._landmarker = vision.HandLandmarker.create_from_options(options)
        self._last_ts = -1

    def process(self, frame_bgr: np.ndarray, timestamp_ms: int) -> list[HandObservation]:
        """Returns every detected hand (0, 1 or 2)."""
        # MediaPipe requires strictly increasing timestamps in VIDEO mode.
        ts = max(timestamp_ms, self._last_ts + 1)
        self._last_ts = ts
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect_for_video(image, ts)
        h, w = frame_bgr.shape[:2]
        hands: list[HandObservation] = []
        for i, hand in enumerate(result.hand_landmarks or []):
            points = np.array([[lm.x, lm.y, lm.z] for lm in hand], dtype=np.float64)
            category = result.handedness[i][0] if result.handedness and len(result.handedness) > i and result.handedness[i] else None
            hands.append(
                HandObservation(
                    points=points,
                    score=float(category.score) if category else 1.0,
                    handedness=str(category.category_name) if category else "Unknown",
                    aspect=w / h,
                )
            )
        return hands

    def close(self) -> None:
        self._landmarker.close()
