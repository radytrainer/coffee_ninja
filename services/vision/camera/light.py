"""Low-light detection.

A dark image is the most common reason gestures "stop working": the hand can't
be found, and many webcams drop to a few frames per second in low light
(longer exposure). The kiosk shows a "too dark" hint instead of silently
ignoring the customer.
"""

from __future__ import annotations

import numpy as np


class LightMeter:
    def __init__(self, dark_below: float = 40.0, bright_above: float = 55.0, interval_s: float = 0.5) -> None:
        # Hysteresis: the hint doesn't flicker around a single threshold.
        self.dark_below = dark_below
        self.bright_above = bright_above
        self.interval_s = interval_s
        self.brightness: float | None = None  # mean pixel value, 0..255
        self.dark = False
        self._last = -1e9

    def update(self, frame: np.ndarray, now_s: float) -> None:
        if now_s - self._last < self.interval_s:
            return
        self._last = now_s
        self.brightness = float(frame[::8, ::8].mean())  # a sparse sample is plenty
        if self.dark and self.brightness > self.bright_above:
            self.dark = False
        elif not self.dark and self.brightness < self.dark_below:
            self.dark = True

    def reset(self) -> None:
        self.brightness = None
        self.dark = False
        self._last = -1e9
