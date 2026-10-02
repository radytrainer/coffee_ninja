import pytest

from gestures.calibration import CalibrationMapper, CalibrationPoint


def corners(tl, tr, br, bl):
    return [
        CalibrationPoint(camera=tl, screen=(0.0, 0.0)),
        CalibrationPoint(camera=tr, screen=(1.0, 0.0)),
        CalibrationPoint(camera=br, screen=(1.0, 1.0)),
        CalibrationPoint(camera=bl, screen=(0.0, 1.0)),
    ]


def test_default_mapping_uses_active_region():
    m = CalibrationMapper(margin_x=0.2, margin_y=0.1)
    assert m.map(0.5, 0.5) == pytest.approx((0.5, 0.5))
    assert m.map(0.2, 0.1) == pytest.approx((0.0, 0.0))
    assert m.map(0.8, 0.9) == pytest.approx((1.0, 1.0))
    # Outside the active region is clamped to the screen edge.
    assert m.map(0.0, 1.0) == (0.0, 1.0)


def test_four_corner_calibration_maps_corners_exactly():
    m = CalibrationMapper()
    m.set_points(corners((0.25, 0.2), (0.75, 0.22), (0.78, 0.8), (0.22, 0.78)))
    assert m.calibrated
    assert m.map(0.25, 0.2) == pytest.approx((0.0, 0.0), abs=1e-6)
    assert m.map(0.75, 0.22) == pytest.approx((1.0, 0.0), abs=1e-6)
    assert m.map(0.78, 0.8) == pytest.approx((1.0, 1.0), abs=1e-6)
    assert m.map(0.22, 0.78) == pytest.approx((0.0, 1.0), abs=1e-6)
    cx, cy = m.map(0.5, 0.5)
    assert 0.4 < cx < 0.6 and 0.4 < cy < 0.6


def test_calibration_is_monotonic():
    m = CalibrationMapper()
    m.set_points(corners((0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)))
    xs = [m.map(x, 0.5)[0] for x in (0.35, 0.45, 0.55, 0.65)]
    assert xs == sorted(xs)


def test_rejects_degenerate_or_tiny_calibration():
    m = CalibrationMapper()
    with pytest.raises(ValueError):
        m.set_points(corners((0.5, 0.5), (0.5, 0.5), (0.5, 0.5), (0.5, 0.5)))
    with pytest.raises(ValueError):
        m.set_points(corners((0.49, 0.49), (0.51, 0.49), (0.51, 0.51), (0.49, 0.51)))
    with pytest.raises(ValueError):
        m.set_points(corners((0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7))[:3])
    assert not m.calibrated


def test_reset_restores_default():
    m = CalibrationMapper()
    m.set_points(corners((0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)))
    m.reset()
    assert not m.calibrated
    assert m.to_dict()["points"] == []
