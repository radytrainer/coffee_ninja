"""Eye and smile state from the MediaPipe Tasks FaceLandmarker.

Used for the "close eyes → back" gesture and the smile discount. Only the eye-blink
and mouth-smile blendshape scores leave this module — no face image,
landmarks or identity information is kept or sent anywhere.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

log = logging.getLogger("vision.face")


@dataclass(frozen=True)
class FaceObservation:
    """Blendshape scores for the customer's face (0..1).

    blink_*: 0 = eye wide open, 1 = fully closed.  smile_*: mouth corner raised.
    """

    blink_left: float
    blink_right: float
    smile_left: float = 0.0
    smile_right: float = 0.0

    @property
    def eyes_closed_score(self) -> float:
        """Both eyes must be closed — the less-closed eye decides (ignores winks)."""
        return min(self.blink_left, self.blink_right)

    @property
    def smile_score(self) -> float:
        """A real smile raises both mouth corners."""
        return min(self.smile_left, self.smile_right)


class FaceTracker:
    """Wraps MediaPipe FaceLandmarker in VIDEO mode with blendshapes enabled."""

    def __init__(self, model_path: Path, min_detection_confidence: float = 0.6, min_tracking_confidence: float = 0.5):
        # Imported lazily so unit tests of the gesture logic do not need MediaPipe.
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision

        self._mp = mp
        options = vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_faces=1,  # the customer in front of the kiosk
            min_face_detection_confidence=min_detection_confidence,
            min_face_presence_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
            output_face_blendshapes=True,
        )
        self._landmarker = vision.FaceLandmarker.create_from_options(options)
        self._last_ts = -1

    def process(self, frame_bgr: np.ndarray, timestamp_ms: int) -> FaceObservation | None:
        ts = max(timestamp_ms, self._last_ts + 1)  # strictly increasing in VIDEO mode
        self._last_ts = ts
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect_for_video(image, ts)
        if not result.face_blendshapes:
            return None
        scores = {c.category_name: float(c.score) for c in result.face_blendshapes[0]}
        return FaceObservation(
            scores.get("eyeBlinkLeft", 0.0),
            scores.get("eyeBlinkRight", 0.0),
            scores.get("mouthSmileLeft", 0.0),
            scores.get("mouthSmileRight", 0.0),
        )

    def close(self) -> None:
        self._landmarker.close()
