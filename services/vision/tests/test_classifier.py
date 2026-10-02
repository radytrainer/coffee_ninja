import pytest

from gestures.classifier import Pose, classify_pose
from gestures.geometry import finger_extension, hand_size, pinch_ratio

from . import hands


@pytest.mark.parametrize(
    ("factory", "expected"),
    [
        (hands.open_palm, Pose.OPEN_PALM),
        (hands.point, Pose.POINT),
        (hands.fist, Pose.FIST),
        (hands.thumbs_up, Pose.THUMBS_UP),
        (hands.two_fingers, Pose.TWO_FINGERS),
    ],
)
def test_classifies_basic_poses(factory, expected):
    result = classify_pose(factory().square(), 0.95)
    assert result.pose == expected
    assert result.confidence > 0.6


def test_pointing_reports_index_extended():
    assert classify_pose(hands.point().square()).index_extended is True
    assert classify_pose(hands.fist().square()).index_extended is False


def test_geometry_is_scale_and_position_invariant():
    obs = hands.open_palm()
    pts = obs.square()
    moved = hands.open_palm(offset=(0.2, -0.1)).square()
    assert hand_size(pts) == pytest.approx(0.2, abs=1e-6)
    assert pinch_ratio(pts) == pytest.approx(pinch_ratio(moved), abs=1e-9)
    # Scaling the whole hand does not change the normalized ratio.
    center = pts.mean(axis=0)
    scaled = (pts - center) * 1.7 + center
    assert pinch_ratio(scaled) == pytest.approx(pinch_ratio(pts), rel=1e-9)


def test_finger_extension_scores():
    pts = hands.point().square()
    assert finger_extension(pts, "index") == pytest.approx(1.0)
    assert finger_extension(pts, "middle") == pytest.approx(0.0)


def test_pinch_ratio_small_when_fingers_touch():
    assert pinch_ratio(hands.pinch().square()) < 0.15
    assert pinch_ratio(hands.open_palm().square()) > 0.6


def test_low_detection_score_lowers_confidence():
    assert classify_pose(hands.open_palm().square(), 0.5).confidence < classify_pose(hands.open_palm().square(), 1.0).confidence
