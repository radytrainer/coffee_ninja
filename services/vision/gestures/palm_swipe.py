"""✋ Palm swipe: an open hand moved sideways drives the menu slideshow.

An open palm has two meanings, told apart by movement:
  • held still (~1 s)  → "back" (the existing held gesture)
  • moved sideways     → swipe; once the palm has moved, "back" is blocked until
                         the hand closes or leaves, so swiping never goes back.

The palm centre (wrist + knuckles) is used instead of a fingertip: it barely
jitters and stays stable while the hand moves fast. It is One-Euro filtered, and
the start event carries the movement made before the threshold was crossed, so
the cards start moving without a jump.

Direction is judged on the *recent* movement (last ~0.3 s), not the total travel
since the palm appeared: customers raise the hand into view first (a big vertical
move), and that must not stop the sideways swipe that follows.

One sweep = one swipe. People "wipe": sweep one way, then bring the hand back.
When the hand clearly turns around, the swipe ends at that point (the cards snap
forward) and the return stroke is ignored for a moment, so it can't drag the
cards back. A deliberate swipe the other way after a short pause still works.
"""

from __future__ import annotations

import math
from collections import deque

from .smoothing import OneEuroFilter


class PalmSwipe:
    def __init__(
        self,
        start_distance: float = 0.035,
        still_radius: float = 0.03,
        dropout_frames: int = 3,
        active_dropout_frames: int = 6,
        window_ms: float = 300,
        reverse_distance: float = 0.04,
        return_ignore_ms: float = 700,
    ) -> None:
        self.start_distance = start_distance  # screen widths of sideways travel before it counts as a swipe
        self.still_radius = still_radius  # moving further than this cancels "back" for this palm
        self.dropout_frames = dropout_frames  # tolerate brief pose misclassification…
        self.active_dropout_frames = active_dropout_frames  # …more once swiping (motion blur, palm turning)
        self.window_ms = window_ms  # recent movement used to decide "this is a sideways swipe"
        self._recent: deque[tuple[float, float, float]] = deque()
        self.reverse_distance = reverse_distance  # turning back this far ends the sweep
        self.return_ignore_ms = return_ignore_ms  # the return stroke is ignored this long
        self._direction = 0  # +1 right / -1 left while a sweep is active
        self._extreme = 0.0  # furthest x reached in the sweep direction
        self._blocked_direction = 0  # the return stroke's direction…
        self._blocked_until = -1e12  # …ignored until this time
        self._fx = OneEuroFilter(min_cutoff=1.5, beta=8.0)
        self._fy = OneEuroFilter(min_cutoff=1.5, beta=8.0)
        self._origin: tuple[float, float] | None = None
        self._last: tuple[float, float] | None = None
        self._absent = 0
        self.active = False
        self.moved = False

    @property
    def blocks_back(self) -> bool:
        return self.moved or self.active

    def reset(self) -> None:
        self._origin = self._last = None
        self._absent = 0
        self._recent.clear()
        self.active = self.moved = False
        self._direction = 0
        self._blocked_direction = 0
        self._blocked_until = -1e12

    def end(self, ts: int) -> list[dict]:
        events = [self._event("end", 0.0, self._last or (0.5, 0.5), ts)] if self.active else []
        self.reset()
        return events

    def update(self, palm: bool, center: tuple[float, float] | None, now_ms: float, ts: int) -> list[dict]:
        """`center`: palm centre in screen space (None = no hand)."""
        if not palm or center is None:
            if self._origin is None:
                return []
            self._absent += 1
            limit = self.active_dropout_frames if self.active else self.dropout_frames
            if center is not None and self._absent < limit:
                return []
            return self.end(ts)

        self._absent = 0
        t = now_ms / 1000
        if self._origin is None:
            self._fx.reset()
            self._fy.reset()
            self._origin = self._last = (self._fx(center[0], t), self._fy(center[1], t))
            self._recent.append((now_ms, *self._origin))
            return []
        x, y = self._fx(center[0], t), self._fy(center[1], t)

        if not self.active:
            ox, oy = self._origin
            if math.hypot(x - ox, y - oy) > self.still_radius:
                self.moved = True  # blocks "back" for this palm
            self._recent.append((now_ms, x, y))
            while self._recent and now_ms - self._recent[0][0] > self.window_ms:
                self._recent.popleft()
            _, rx, ry = self._recent[0]
            dx, dy = x - rx, y - ry  # recent movement only
            returning = (1 if dx > 0 else -1) == self._blocked_direction and now_ms < self._blocked_until
            if abs(dx) >= self.start_distance and abs(dx) > 1.2 * abs(dy) and not returning:
                self.active = True
                self._direction = 1 if dx > 0 else -1
                self._extreme = x
                self._last = (x, y)
                # Include the travel so far: the content catches up with the hand smoothly.
                return [self._event("start", 0.0, (x, y), ts), self._event("move", dx, (x, y), ts)]
            return []

        # The hand turned around → this sweep is done; ignore the return stroke.
        if (x - self._extreme) * self._direction > 0:
            self._extreme = x
        elif (self._extreme - x) * self._direction > self.reverse_distance:
            return self._finish_sweep(now_ms, ts)

        dx = x - self._last[0] if self._last else 0.0
        self._last = (x, y)
        return [self._event("move", dx, (x, y), ts)] if abs(dx) > 0.0002 else []

    def _finish_sweep(self, now_ms: float, ts: int) -> list[dict]:
        events = [self._event("end", 0.0, self._last or (0.5, 0.5), ts)]
        self._blocked_direction = -self._direction
        self._blocked_until = now_ms + self.return_ignore_ms
        self.active = False
        self._direction = 0
        self._recent.clear()
        # The palm stays up: keep tracking (and keep "back" blocked — it moved).
        return events

    @staticmethod
    def _event(phase: str, dx: float, at: tuple[float, float], ts: int) -> dict:
        return {"type": "swipe", "phase": phase, "dx": round(dx, 4), "x": round(at[0], 4), "y": round(at[1], 4), "timestamp": ts}
