import pytest

from gestures.pinch import PinchDetector


def run(detector: PinchDetector, ratios, start_ms=0, step_ms=33):
    edges = []
    for i, r in enumerate(ratios):
        update = detector.update(r, start_ms + i * step_ms, 0.95)
        edges.append(update.edge)
    return edges


def test_requires_consecutive_frames_debounce():
    d = PinchDetector(threshold=0.33, release_threshold=0.48, min_frames=3, cooldown_ms=0)
    assert run(d, [0.1, 0.1]) == [None, None]
    assert d.pinching is False
    assert d.update(0.1, 100, 0.95).edge == "start"


def test_single_frame_dip_does_not_click():
    d = PinchDetector(min_frames=2, cooldown_ms=0)
    assert run(d, [0.6, 0.1, 0.6, 0.1, 0.6]) == [None] * 5


def test_one_pinch_produces_exactly_one_click():
    d = PinchDetector(min_frames=2, cooldown_ms=0)
    edges = run(d, [0.6, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.6])
    assert edges.count("start") == 1
    assert edges.count("end") == 1


def test_hysteresis_prevents_flicker_around_threshold():
    d = PinchDetector(threshold=0.33, release_threshold=0.48, min_frames=1, cooldown_ms=0)
    # Starts below 0.33, then hovers between thresholds: must stay pinched.
    edges = run(d, [0.2, 0.35, 0.40, 0.36, 0.45, 0.34, 0.44])
    assert edges == ["start", None, None, None, None, None, None]
    assert d.pinching
    assert d.update(0.5, 1000, 0.95).edge == "end"


def test_cooldown_blocks_rapid_repeat():
    d = PinchDetector(min_frames=1, cooldown_ms=450)
    assert d.update(0.1, 0, 0.95).edge == "start"
    assert d.update(0.6, 50, 0.95).edge == "end"
    assert d.update(0.1, 100, 0.95).edge is None  # still cooling down
    assert d.update(0.1, 500, 0.95).edge == "start"


def test_low_detection_confidence_is_ignored():
    d = PinchDetector(min_frames=1, cooldown_ms=0, min_confidence=0.6)
    assert d.update(0.1, 0, 0.3).edge is None
    assert d.pinching is False


def test_reset_ends_active_pinch_when_hand_lost():
    d = PinchDetector(min_frames=1, cooldown_ms=0)
    d.update(0.1, 0, 0.95)
    update = d.reset()
    assert update is not None and update.edge == "end"
    assert d.reset() is None


def test_invalid_thresholds_rejected():
    with pytest.raises(ValueError):
        PinchDetector(threshold=0.5, release_threshold=0.4)


def test_strength_feedback_range():
    d = PinchDetector()
    assert d.strength(0.0) == 1.0
    assert d.strength(2.0) == 0.0
    assert 0 < d.strength(0.5) < 1
