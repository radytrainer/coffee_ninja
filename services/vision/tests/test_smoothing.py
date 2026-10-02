import random
import statistics

import pytest

from gestures.smoothing import CursorSmoother


def test_first_sample_passes_through():
    s = CursorSmoother(0.6)
    assert s.update(0.3, 0.4, 0.0) == (0.3, 0.4)


def test_plain_ema_formula_when_not_adaptive():
    s = CursorSmoother(0.5, adaptive=False)
    s.update(0.0, 0.0, 0.0)
    x, y = s.update(1.0, 1.0, 0.033)
    # smoothed = previous * 0.5 + current * 0.5
    assert (x, y) == pytest.approx((0.5, 0.5))


def test_reduces_jitter_of_a_still_hand():
    rng = random.Random(1)
    s = CursorSmoother(0.6)
    raw, smooth = [], []
    for i in range(300):
        x = 0.5 + rng.gauss(0, 0.004)
        raw.append(x)
        smooth.append(s.update(x, 0.5, i / 30)[0])
    assert statistics.pstdev(smooth[30:]) < statistics.pstdev(raw[30:]) * 0.6


def test_converges_to_a_new_position():
    s = CursorSmoother(0.6)
    s.update(0.2, 0.2, 0.0)
    for i in range(1, 30):
        x, y = s.update(0.8, 0.8, i / 30)
    assert x == pytest.approx(0.8, abs=0.01)


def test_adaptive_smoothing_reduces_lag_for_fast_moves():
    fixed = CursorSmoother(0.7, adaptive=False)
    adaptive = CursorSmoother(0.7, adaptive=True)
    for s in (fixed, adaptive):
        s.update(0.1, 0.5, 0.0)
    # A fast sweep across the screen.
    for i in range(1, 6):
        target = 0.1 + i * 0.15
        fx, _ = fixed.update(target, 0.5, i / 30)
        ax, _ = adaptive.update(target, 0.5, i / 30)
    assert abs(0.85 - ax) < abs(0.85 - fx)


def test_zero_smoothing_is_raw():
    s = CursorSmoother(0.0)
    s.update(0.1, 0.1, 0)
    assert s.update(0.9, 0.2, 0.033) == pytest.approx((0.9, 0.2))
