"""Pinch (virtual click) detection with hysteresis, debounce and cooldown.

- Hysteresis: a pinch STARTS below `threshold` but only ENDS above the larger
  `release_threshold`, so a ratio hovering around the threshold cannot toggle
  rapidly.
- Debounce: the ratio must stay below the threshold for `min_frames`
  consecutive frames before the pinch is confirmed.
- Cooldown: after a pinch, a new one cannot start for `cooldown_ms`.
- One pinch = one click: the "start" edge is reported exactly once; holding
  the pinch never repeats it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class PinchUpdate:
    edge: Literal["start", "end"] | None
    pinching: bool
    strength: float  # 0..1, 1 = fingers touching
    confidence: float


class PinchDetector:
    def __init__(
        self,
        threshold: float = 0.33,
        release_threshold: float = 0.48,
        cooldown_ms: int = 450,
        min_frames: int = 2,
        min_confidence: float = 0.6,
    ) -> None:
        if release_threshold <= threshold:
            raise ValueError("release_threshold must be greater than threshold")
        self.threshold = threshold
        self.release_threshold = release_threshold
        self.cooldown_ms = cooldown_ms
        self.min_frames = min_frames
        self.min_confidence = min_confidence
        self.pinching = False
        self._below = 0
        self._last_start_ms: float = -1e12

    def reset(self) -> PinchUpdate | None:
        """Hand lost: end any active pinch."""
        was = self.pinching
        self.pinching = False
        self._below = 0
        return PinchUpdate("end", False, 0.0, 0.0) if was else None

    def strength(self, ratio: float) -> float:
        """Maps the ratio to 0..1 for UI feedback (1 at/under threshold, 0 at release)."""
        span = self.release_threshold * 1.6 - self.threshold
        return float(min(1.0, max(0.0, (self.release_threshold * 1.6 - ratio) / span)))

    def confidence(self, ratio: float, detection_score: float) -> float:
        """How clearly below the threshold we are, weighted by detection confidence."""
        depth = min(1.0, max(0.0, (self.threshold - ratio) / self.threshold + 0.5))
        return round(depth * detection_score, 3)

    def update(self, ratio: float, now_ms: float, detection_score: float = 1.0) -> PinchUpdate:
        strength = self.strength(ratio)
        if self.pinching:
            if ratio > self.release_threshold:
                self.pinching = False
                self._below = 0
                return PinchUpdate("end", False, strength, 0.0)
            return PinchUpdate(None, True, strength, self.confidence(ratio, detection_score))

        if ratio < self.threshold and detection_score >= self.min_confidence:
            self._below += 1
        else:
            self._below = 0

        in_cooldown = now_ms - self._last_start_ms < self.cooldown_ms
        if self._below >= self.min_frames and not in_cooldown:
            conf = self.confidence(ratio, detection_score)
            if conf >= self.min_confidence:
                self.pinching = True
                self._last_start_ms = now_ms
                return PinchUpdate("start", True, strength, conf)
        return PinchUpdate(None, False, strength, 0.0)
