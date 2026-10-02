"""Gesture engine: turns per-frame hand observations into lightweight events.

Output events (JSON-serialisable dicts) follow the contract in
packages/types/src/gestures.ts:

    {"type": "cursor", "x", "y", "rawX", "rawY", "handDetected", "pointing",
     "pinching", "pinchStrength", "scrolling", "swiping", "timestamp"}
    {"type": "gesture", "gesture": "pinch" | "open_palm" | "thumbs_up" | "eyes_closed",
     "confidence", "x"?, "y"?, "timestamp"}
    {"type": "scroll", "phase": "start" | "move" | "end", "dx", "dy", "x", "y", "timestamp"}
    {"type": "swipe", "phase": "start" | "move" | "end", "dx", "x", "y", "timestamp"}
    {"type": "hand", "handDetected", "timestamp"}
    {"type": "face", "faceDetected", "smile", "smileProgress", "timestamp"}   (throttled)
    {"type": "smile", "token", "timestamp"}   (signed; redeemable once for the smile discount)

Gestures:
  • one hand, index finger        → cursor;  pinch → click;  open palm (held still) → back;  thumbs up (held) → confirm
  • one hand, open palm moved sideways → swipe (menu slideshow); blocks "back" for that palm
  • one hand, ✌️ index + middle   → scroll / swipe (content follows the hand; dx and dy)
  • face: both eyes closed (held)  → back (same as open palm)
  • face: smile (held)             → signed smile token (the kiosk offers a discount at checkout)

No business logic lives here — the kiosk decides what a gesture means.
"""

from __future__ import annotations

import math
import time
from collections import deque

import numpy as np

from config.settings import GestureTuning
from hand_tracking import landmarks as L
from hand_tracking.face_tracker import FaceObservation
from hand_tracking.hand_tracker import HandObservation

from .calibration import CalibrationMapper
from .classifier import Pose, classify_pose
from .face import EyesClosedDetector
from .geometry import hand_size, pinch_ratio
from .hold import HoldDetector
from .palm_swipe import PalmSwipe
from .pinch import PinchDetector
from .smile import SmileDetector, sign_smile_token
from .smoothing import CursorSmoother, OneEuroFilter

Observations = HandObservation | list[HandObservation] | None

FACE_EVENT_INTERVAL_MS = 125  # ~8 face updates/s is plenty for on-screen feedback
SMILING_BLOCKS_EYES = 0.35  # a big smile squints the eyes — never read that as "eyes closed"


def _now_ms() -> int:
    return int(time.time() * 1000)


class GestureEngine:
    def __init__(
        self, tuning: GestureTuning, mapper: CalibrationMapper | None = None, smile_secret: str | None = None
    ) -> None:
        self.mapper = mapper or CalibrationMapper()
        self.smoother = CursorSmoother(tuning.cursor_smoothing)
        self.pinch = PinchDetector(
            tuning.pinch_threshold,
            tuning.pinch_release_threshold,
            tuning.pinch_cooldown_ms,
            tuning.pinch_min_frames,
            tuning.gesture_confidence,
        )
        self.palm_hold = HoldDetector(tuning.open_palm_hold_ms, tuning.gesture_confidence)
        self.thumbs_hold = HoldDetector(tuning.thumbs_up_hold_ms, tuning.gesture_confidence)
        self.scroll_hold = HoldDetector(tuning.scroll_activation_ms, tuning.gesture_confidence, release_ms=0)
        self.palm_swipe = PalmSwipe()
        self.eyes = EyesClosedDetector(tuning.eyes_closed_hold_ms, tuning.eyes_closed_threshold)
        self.smile = SmileDetector(tuning.smile_hold_ms, tuning.smile_threshold)
        self.smile_secret = smile_secret or None
        self._face_seen = False
        self._last_face_event_ms = -1e12
        self.tuning = tuning
        self.hand_detected = False
        self.last_pose: Pose = Pose.NONE
        self._history: deque[tuple[float, float, float]] = deque(maxlen=64)  # (t_ms, x, y) camera space
        self._anchor: tuple[float, float] | None = None
        self._mid_start: tuple[float, float] | None = None
        self._last_action_ms = -1e12
        self._primary_wrist: np.ndarray | None = None
        # Adaptive filter (strong smoothing when slow, responsive when fast) for scroll / swipe.
        self._scroll_fx = OneEuroFilter(min_cutoff=1.5, beta=8.0)
        self._scroll_fy = OneEuroFilter(min_cutoff=1.5, beta=8.0)
        # scroll state
        self._scrolling = False
        self._scroll_last: tuple[float, float] | None = None
        self._scroll_absent = 0
        # After scrolling, a still-pinched hand must open before it can click again.
        self._pinch_needs_release = False

    # ------------------------------------------------------------------ config
    def configure(self, tuning: GestureTuning) -> None:
        """Applies new tuning values live (called from the HTTP API)."""
        self.tuning = tuning
        self.smoother.smoothing = tuning.cursor_smoothing
        self.pinch.threshold = tuning.pinch_threshold
        self.pinch.release_threshold = tuning.pinch_release_threshold
        self.pinch.cooldown_ms = tuning.pinch_cooldown_ms
        self.pinch.min_frames = tuning.pinch_min_frames
        self.pinch.min_confidence = tuning.gesture_confidence
        self.palm_hold.hold_ms = tuning.open_palm_hold_ms
        self.palm_hold.min_confidence = tuning.gesture_confidence
        self.thumbs_hold.hold_ms = tuning.thumbs_up_hold_ms
        self.thumbs_hold.min_confidence = tuning.gesture_confidence
        self.scroll_hold.hold_ms = tuning.scroll_activation_ms
        self.scroll_hold.min_confidence = tuning.gesture_confidence
        self.eyes.hold_ms = tuning.eyes_closed_hold_ms
        self.eyes.threshold = tuning.eyes_closed_threshold
        self.smile.hold_ms = tuning.smile_hold_ms
        self.smile.threshold = tuning.smile_threshold

    @property
    def scrolling(self) -> bool:
        return self._scrolling

    def update_face(self, face: FaceObservation | None, now_ms: float) -> list[dict]:
        """Face gestures: close eyes → back, held smile → signed smile token, plus throttled face state."""
        events: list[dict] = []
        ts = _now_ms()
        events += self._update_eyes(face, now_ms)
        if self.smile_secret:
            if self.smile.update(face, now_ms):
                events.append({"type": "smile", "token": sign_smile_token(self.smile_secret), "timestamp": ts})
            if face is not None and (now_ms - self._last_face_event_ms >= FACE_EVENT_INTERVAL_MS or events):
                self._last_face_event_ms = now_ms
                self._face_seen = True
                events.insert(0, {
                    "type": "face", "faceDetected": True, "smile": round(face.smile_score, 3),
                    "smileProgress": round(self.smile.progress(now_ms), 3), "timestamp": ts,
                })
            elif face is None and self._face_seen:
                self._face_seen = False
                events.append({"type": "face", "faceDetected": False, "smile": 0.0, "smileProgress": 0.0, "timestamp": ts})
        return events

    def _update_eyes(self, face: FaceObservation | None, now_ms: float) -> list[dict]:
        """Close eyes → back. Shares the back/confirm cooldown; ignored mid-pinch/scroll and while smiling."""
        if not self.tuning.eyes_closed_back or face is None:
            self.eyes.reset()
            return []
        busy = self.pinch.pinching or self._scrolling or face.smile_score >= SMILING_BLOCKS_EYES
        allowed = not busy and now_ms - self._last_action_ms >= self.tuning.gesture_cooldown_ms
        if not self.eyes.update(face, now_ms, allowed):
            return []
        self._last_action_ms = now_ms
        return [{"type": "gesture", "gesture": "eyes_closed", "confidence": round(face.eyes_closed_score, 3), "timestamp": _now_ms()}]

    # ------------------------------------------------------------------ helpers
    def _lookback(self, now_ms: float) -> tuple[float, float] | None:
        target = now_ms - self.tuning.pinch_lookback_ms
        best = None
        for t, x, y in self._history:
            if t <= target:
                best = (x, y)
            else:
                break
        if best is None and self._history:
            _, x, y = self._history[0]
            best = (x, y)
        return best

    def _pick_hand(self, hands: list[HandObservation]) -> HandObservation:
        """The hand that was driving the cursor (nearest wrist); other hands in view are ignored."""
        if self._primary_wrist is not None and len(hands) > 1:
            hands = sorted(hands, key=lambda h: float(np.linalg.norm(h.square()[L.WRIST] - self._primary_wrist)))
        elif len(hands) > 1:
            hands = sorted(hands, key=lambda h: -hand_size(h.square()))  # closest (largest) first
        primary = hands[0]
        self._primary_wrist = primary.square()[L.WRIST]
        return primary

    def _end_scroll(self, ts: int) -> list[dict]:
        if not self._scrolling:
            self.scroll_hold.reset()
            return []
        self._scrolling = False
        self._scroll_last = None
        self._scroll_absent = 0
        self.scroll_hold.reset()
        self._pinch_needs_release = True
        return [{"type": "scroll", "phase": "end", "dx": 0.0, "dy": 0.0, "x": 0.5, "y": 0.5, "timestamp": ts}]

    def _lose_hand(self) -> list[dict]:
        events: list[dict] = []
        ts = _now_ms()
        events += self._end_scroll(ts)
        events += self.palm_swipe.end(ts)
        if self.hand_detected:
            self.hand_detected = False
            self.pinch.reset()
            self.palm_hold.reset()
            self.thumbs_hold.reset()
            self.smoother.reset()
            self._history.clear()
            self._anchor = self._mid_start = None
            self._primary_wrist = None
            self._pinch_needs_release = False
            events.append({"type": "hand", "handDetected": False, "timestamp": ts})
            events.append(self._cursor(0.5, 0.5, 0.5, 0.5, False, False, False, 0.0, ts))
        return events

    def _cursor(self, x, y, raw_x, raw_y, detected, pointing, pinching, strength, ts) -> dict:  # noqa: ANN001
        return {
            "type": "cursor",
            "x": round(x, 4),
            "y": round(y, 4),
            "rawX": round(raw_x, 4),
            "rawY": round(raw_y, 4),
            "handDetected": detected,
            "pointing": pointing,
            "pinching": pinching,
            "pinchStrength": round(strength, 3),
            "scrolling": self._scrolling,
            "swiping": self.palm_swipe.active,
            "timestamp": ts,
        }

    def _palm_center(self, hand: HandObservation) -> tuple[float, float]:
        """Wrist + knuckles in screen space: steady even while the fingers flex."""
        idx = [L.WRIST, L.INDEX_MCP, L.MIDDLE_MCP, L.PINKY_MCP]
        return self.mapper.map(float(hand.points[idx, 0].mean()), float(hand.points[idx, 1].mean()))

    def _filtered_scroll_point(self, mid: tuple[float, float], now_ms: float) -> tuple[float, float]:
        sx, sy = self.mapper.map(float(mid[0]), float(mid[1]))
        t = now_ms / 1000
        return self._scroll_fx(sx, t), self._scroll_fy(sy, t)

    # ------------------------------------------------------------------ main
    def update(self, obs: Observations, now_ms: float) -> list[dict]:
        hands = [] if obs is None else (obs if isinstance(obs, list) else [obs])
        hands = [h for h in hands if h.score >= self.tuning.gesture_confidence * 0.5]
        if not hands:
            return self._lose_hand()

        events: list[dict] = []
        ts = _now_ms()
        if not self.hand_detected:
            self.hand_detected = True
            events.append({"type": "hand", "handDetected": True, "timestamp": ts})

        primary = self._pick_hand(hands)
        pts = primary.square()
        pose = classify_pose(pts, primary.score)
        self.last_pose = pose.pose
        ratio = pinch_ratio(pts)
        index, thumb = primary.index_tip, primary.thumb_tip

        # ---------------- one hand: ✌️ scroll ----------------
        two_pose = pose.pose == Pose.TWO_FINGERS
        mid = (
            (primary.points[L.INDEX_TIP, 0] + primary.points[L.MIDDLE_TIP, 0]) / 2,
            (primary.points[L.INDEX_TIP, 1] + primary.points[L.MIDDLE_TIP, 1]) / 2,
        )
        if self._scrolling:
            if two_pose:
                self._scroll_absent = 0
                sx, sy = self._filtered_scroll_point(mid, now_ms)
                last = self._scroll_last or (sx, sy)
                dx, dy = sx - last[0], sy - last[1]
                self._scroll_last = (sx, sy)
                # Filtered signal → send every real change, however small (no stop-start).
                if math.hypot(dx, dy) > 0.0002:
                    events.append(
                        {"type": "scroll", "phase": "move", "dx": round(dx, 4), "dy": round(dy, 4),
                         "x": round(sx, 4), "y": round(sy, 4), "timestamp": ts}
                    )
            else:
                self._scroll_absent += 1
                if self._scroll_absent >= 3:  # tolerate brief classification dropouts
                    events += self._end_scroll(ts)
        elif self.scroll_hold.update(two_pose and not self.pinch.pinching, pose.confidence, now_ms):
            self._scrolling = True
            self._scroll_fx.reset()
            self._scroll_fy.reset()
            sx, sy = self._filtered_scroll_point(mid, now_ms)
            self._scroll_last = (sx, sy)
            self._scroll_absent = 0
            cx, cy = self.mapper.map(*self.smoother.update(index[0], index[1], now_ms / 1000))
            events.append({"type": "scroll", "phase": "start", "dx": 0.0, "dy": 0.0, "x": round(cx, 4), "y": round(cy, 4), "timestamp": ts})

        # ---------------- one hand: ✋ palm swipe (sideways) ----------------
        palm_pose = pose.pose == Pose.OPEN_PALM
        events += self.palm_swipe.update(palm_pose and not self._scrolling, self._palm_center(primary), now_ms, ts)

        # ---------------- one hand: pinch click (never while scrolling / in V pose) ----------------
        if self._pinch_needs_release and ratio > self.pinch.release_threshold:
            self._pinch_needs_release = False
        pinch_allowed = not self._scrolling and not two_pose and not self.palm_swipe.active and not self._pinch_needs_release
        pinch = self.pinch.update(ratio if pinch_allowed else max(ratio, self.pinch.release_threshold + 0.01), now_ms, primary.score)

        mid_pinch = ((index[0] + thumb[0]) / 2, (index[1] + thumb[1]) / 2)
        if pinch.edge == "start":
            # Click where the cursor was just before the fingers closed.
            self._anchor = self._lookback(now_ms) or index
            self._mid_start = mid_pinch
            self.smoother.reset()
            self.smoother.update(self._anchor[0], self._anchor[1], now_ms / 1000)
        elif pinch.edge == "end":
            self._anchor = self._mid_start = None

        if pinch.pinching and self._anchor and self._mid_start:
            # While held, follow the pinch midpoint relative to where the pinch began.
            src = (self._anchor[0] + mid_pinch[0] - self._mid_start[0], self._anchor[1] + mid_pinch[1] - self._mid_start[1])
        else:
            src = index

        raw_x, raw_y = self.smoother.update(src[0], src[1], now_ms / 1000)
        if not pinch.pinching:
            self._history.append((now_ms, raw_x, raw_y))
        x, y = self.mapper.map(raw_x, raw_y)
        events.append(
            self._cursor(x, y, raw_x, raw_y, True, pose.index_extended or pose.pose == Pose.POINT, pinch.pinching, pinch.strength, ts)
        )

        if pinch.edge == "start":
            ax, ay = self.mapper.map(*self._anchor) if self._anchor else (x, y)
            events.append(
                {"type": "gesture", "gesture": "pinch", "confidence": pinch.confidence, "x": round(ax, 4), "y": round(ay, 4), "timestamp": ts}
            )

        # ---------------- back / confirm: held poses, never while pinching or scrolling ----------------
        can_act = not pinch.pinching and not self._scrolling and now_ms - self._last_action_ms >= self.tuning.gesture_cooldown_ms
        # A palm that moved (swipe) is never "back" — back needs a still palm.
        palm_fired = self.palm_hold.update(palm_pose and not self.palm_swipe.blocks_back and can_act, pose.confidence, now_ms)
        thumbs_fired = self.thumbs_hold.update(pose.pose == Pose.THUMBS_UP and can_act, pose.confidence, now_ms)
        for fired, name in ((palm_fired, "open_palm"), (thumbs_fired, "thumbs_up")):
            if fired:
                self._last_action_ms = now_ms
                events.append({"type": "gesture", "gesture": name, "confidence": pose.confidence, "timestamp": ts})
        return events
