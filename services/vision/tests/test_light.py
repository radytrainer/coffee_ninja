import numpy as np

from camera.light import LightMeter


def frame(level: int) -> np.ndarray:
    return np.full((480, 640, 3), level, dtype=np.uint8)


def test_dark_image_is_flagged_and_clears_when_light_returns():
    m = LightMeter()
    m.update(frame(120), 0.0)
    assert not m.dark
    m.update(frame(27), 1.0)  # covered camera / lights off (measured on a real kiosk: 27)
    assert m.dark and round(m.brightness) == 27
    m.update(frame(50), 2.0)  # between thresholds → stays dark (no flicker)
    assert m.dark
    m.update(frame(90), 3.0)
    assert not m.dark


def test_measures_at_most_twice_a_second():
    m = LightMeter()
    m.update(frame(120), 0.0)
    m.update(frame(10), 0.2)  # too soon — ignored
    assert not m.dark
    m.update(frame(10), 0.6)
    assert m.dark
