"""Close-eyes gesture: both eyes held closed → "back".

Natural blinks last 100–300 ms, so the eyes must stay closed for
`eyes_closed_hold_ms` (default 0.6 s) before the gesture fires. It also only arms
after the eyes have been seen *open*, so a face that appears with eyes already
"closed" (e.g. someone looking down at their phone) never triggers it, and it
fires once per closure — the eyes must open again before it can repeat.
"""

from __future__ import annotations

from hand_tracking.face_tracker import FaceObservation

from .hold import HoldDetector

EYES_OPEN_BELOW = 0.3  # blink score under which an eye counts as open


class EyesClosedDetector:
    def __init__(self, hold_ms: int = 600, threshold: float = 0.5) -> None:
        self.threshold = threshold
        # Short dropouts (one eye flickering above the threshold) don't restart the hold.
        self._hold = HoldDetector(hold_ms, min_confidence=0.0, release_ms=150)
        self._armed = False

    @property
    def hold_ms(self) -> int:
        return self._hold.hold_ms

    @hold_ms.setter
    def hold_ms(self, value: int) -> None:
        self._hold.hold_ms = value

    def reset(self) -> None:
        self._hold.reset()
        self._armed = False

    def progress(self, now_ms: float) -> float:
        return self._hold.progress(now_ms) if self._armed else 0.0

    def update(self, face: FaceObservation | None, now_ms: float, allowed: bool = True) -> bool:
        """Returns True exactly once when the eyes have been closed long enough."""
        if face is None:
            self.reset()
            return False
        score = face.eyes_closed_score
        if score < EYES_OPEN_BELOW:
            self._armed = True
        closed = self._armed and score >= self.threshold
        fired = self._hold.update(closed and allowed, 1.0, now_ms)
        if fired:
            self._armed = False  # must open the eyes before it can fire again
        return fired
