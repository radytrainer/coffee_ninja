"""Stable-gesture detection: a pose must be held continuously for a minimum
duration before it fires, fires only once per hold, and must be released
before it can fire again. Prevents e.g. an open palm from triggering "back"
every frame or while the customer is just moving their hand.
"""

from __future__ import annotations


class HoldDetector:
    def __init__(self, hold_ms: int, min_confidence: float = 0.6, release_ms: int = 250) -> None:
        self.hold_ms = hold_ms
        self.min_confidence = min_confidence
        self.release_ms = release_ms
        self._since: float | None = None
        self._fired = False
        self._absent_since: float | None = None

    def reset(self) -> None:
        self._since = None
        self._fired = False
        self._absent_since = None

    def progress(self, now_ms: float) -> float:
        if self._since is None or self._fired:
            return 0.0
        return min(1.0, (now_ms - self._since) / self.hold_ms)

    def update(self, active: bool, confidence: float, now_ms: float) -> bool:
        """Returns True exactly once when the pose has been held long enough."""
        if active and confidence >= self.min_confidence:
            self._absent_since = None
            if self._since is None:
                self._since = now_ms
            if not self._fired and now_ms - self._since >= self.hold_ms:
                self._fired = True
                return True
            return False

        # Tolerate brief detection dropouts (a frame or two) without restarting the hold.
        if self._absent_since is None:
            self._absent_since = now_ms
        if now_ms - self._absent_since >= self.release_ms:
            self._since = None
            self._fired = False
        return False
