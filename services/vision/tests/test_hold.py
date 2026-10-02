from gestures.hold import HoldDetector


def test_fires_once_after_hold_duration():
    h = HoldDetector(hold_ms=1000, min_confidence=0.6)
    fired = [h.update(True, 0.9, t) for t in range(0, 2001, 100)]
    assert fired.count(True) == 1
    assert fired.index(True) == 10  # at t=1000ms


def test_short_pose_does_not_fire():
    h = HoldDetector(hold_ms=1000)
    assert not any(h.update(True, 0.9, t) for t in range(0, 800, 100))


def test_low_confidence_does_not_count():
    h = HoldDetector(hold_ms=500, min_confidence=0.6)
    assert not any(h.update(True, 0.3, t) for t in range(0, 2000, 100))


def test_brief_dropout_is_tolerated():
    h = HoldDetector(hold_ms=1000, release_ms=250)
    for t in range(0, 600, 100):
        h.update(True, 0.9, t)
    h.update(False, 0.0, 600)  # one missed frame
    assert h.update(True, 0.9, 700) is False
    assert any(h.update(True, 0.9, t) for t in range(800, 1100, 100))


def test_must_release_before_firing_again():
    h = HoldDetector(hold_ms=500, release_ms=200)
    assert any(h.update(True, 0.9, t) for t in range(0, 600, 100))
    assert not any(h.update(True, 0.9, t) for t in range(600, 3000, 100))
    for t in range(3000, 3400, 100):
        h.update(False, 0.0, t)
    assert any(h.update(True, 0.9, t) for t in range(3400, 4000, 100))
