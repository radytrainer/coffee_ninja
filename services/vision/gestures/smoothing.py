"""Cursor smoothing.

Exponential moving average:
    smoothed = previous * smoothing + current * (1 - smoothing)

Raw fingertip coordinates jitter by a few pixels even when the hand is still.
A fixed heavy smoothing factor removes jitter but makes fast movements laggy,
so the factor is reduced automatically when the finger moves quickly
(adaptive EMA). With `adaptive=False` it is the plain formula above.
"""

from __future__ import annotations

import math


class CursorSmoother:
    def __init__(self, smoothing: float = 0.55, adaptive: bool = True, fast_speed: float = 1.5) -> None:
        self.smoothing = smoothing
        self.adaptive = adaptive
        # Normalized screen-widths per second at which smoothing is mostly disabled.
        self.fast_speed = fast_speed
        self._x: float | None = None
        self._y: float | None = None
        self._t: float | None = None

    def reset(self) -> None:
        self._x = self._y = self._t = None

    def effective_factor(self, speed: float) -> float:
        if not self.adaptive:
            return self.smoothing
        # Linearly relax smoothing as speed approaches fast_speed (never below 25% of it).
        relax = min(speed / self.fast_speed, 1.0)
        return self.smoothing * (1.0 - 0.75 * relax)

    def update(self, x: float, y: float, t: float) -> tuple[float, float]:
        if self._x is None or self._y is None or self._t is None:
            self._x, self._y, self._t = x, y, t
            return x, y
        dt = max(t - self._t, 1e-3)
        speed = math.hypot(x - self._x, y - self._y) / dt
        a = self.effective_factor(speed)
        self._x = self._x * a + x * (1.0 - a)
        self._y = self._y * a + y * (1.0 - a)
        self._t = t
        return self._x, self._y


class OneEuroFilter:
    """1€ filter (Casiez et al., 2012): an adaptive low-pass filter for noisy input.

    When the signal moves slowly the cutoff frequency is low (strong smoothing →
    no jitter); when it moves fast the cutoff rises (little smoothing → no lag).
    Used for the ✌️ scroll / swipe hand position.
    """

    def __init__(self, min_cutoff: float = 1.0, beta: float = 0.0, d_cutoff: float = 1.0) -> None:
        self.min_cutoff = min_cutoff  # Hz — lower = smoother at rest
        self.beta = beta  # how quickly the cutoff rises with speed
        self.d_cutoff = d_cutoff
        self._x: float | None = None
        self._dx = 0.0
        self._t: float | None = None

    @staticmethod
    def _alpha(cutoff: float, dt: float) -> float:
        tau = 1.0 / (2 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def reset(self) -> None:
        self._x = None
        self._dx = 0.0
        self._t = None

    def __call__(self, x: float, t: float) -> float:
        if self._x is None or self._t is None:
            self._x, self._t = x, t
            return x
        dt = max(t - self._t, 1e-3)
        dx = (x - self._x) / dt
        a_d = self._alpha(self.d_cutoff, dt)
        self._dx = a_d * dx + (1 - a_d) * self._dx
        cutoff = self.min_cutoff + self.beta * abs(self._dx)
        a = self._alpha(cutoff, dt)
        self._x = a * x + (1 - a) * self._x
        self._t = t
        return self._x
