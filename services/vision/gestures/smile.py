"""Smile detection for the smile discount, and the signed token that proves it.

The customer must hold a real smile (both mouth corners up) for `smile_hold_ms`;
it fires once per smile — the face must relax before it can fire again. Each
detection produces a token the kiosk sends with the order:

    v1.<nonce>.<issued_at_ms>.<hex HMAC-SHA256(secret, "v1.<nonce>.<issued_at_ms>")>

Only the vision service and the API know SMILE_TOKEN_SECRET, so the discount
can't be claimed by calling the public order API directly. The API redeems each
nonce once and rejects old tokens.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time

from hand_tracking.face_tracker import FaceObservation

from .hold import HoldDetector

NEUTRAL_BELOW = 0.25  # smile score under which the face counts as relaxed


def sign_smile_token(secret: str, issued_at_ms: int | None = None, nonce: str | None = None) -> str:
    issued = int(time.time() * 1000) if issued_at_ms is None else int(issued_at_ms)
    body = f"v1.{nonce or secrets.token_hex(16)}.{issued}"
    signature = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


class SmileDetector:
    def __init__(self, hold_ms: int = 800, threshold: float = 0.5) -> None:
        self.threshold = threshold
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

    def update(self, face: FaceObservation | None, now_ms: float) -> bool:
        """Returns True exactly once when a smile has been held long enough."""
        if face is None:
            self.reset()
            return False
        score = face.smile_score
        if score < NEUTRAL_BELOW:
            self._armed = True
        fired = self._hold.update(self._armed and score >= self.threshold, 1.0, now_ms)
        if fired:
            self._armed = False  # relax the face before the next smile counts
        return fired
