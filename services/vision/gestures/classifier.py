"""Static hand-pose classification from landmarks."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np

from .geometry import finger_extension, pinch_ratio, thumb_extension, thumb_pointing_up


class Pose(str, Enum):
    NONE = "none"
    POINT = "point"
    TWO_FINGERS = "two_fingers"  # ✌️ index + middle extended — used for scrolling
    OPEN_PALM = "open_palm"
    THUMBS_UP = "thumbs_up"
    FIST = "fist"


@dataclass(frozen=True)
class PoseResult:
    pose: Pose
    confidence: float
    index_extended: bool


def classify_pose(pts: np.ndarray, detection_score: float = 1.0) -> PoseResult:
    """Classifies a hand pose. `pts` are 'square' 2D landmark coordinates."""
    ext = {f: finger_extension(pts, f) for f in ("index", "middle", "ring", "pinky")}
    thumb = thumb_extension(pts)
    others = (ext["middle"], ext["ring"], ext["pinky"])
    index_extended = ext["index"] > 0.5

    # Open palm: all five digits extended and spread (thumb away from index finger).
    palm = min(ext["index"], *others, thumb)
    if palm > 0.5 and pinch_ratio(pts) > 0.6:
        return PoseResult(Pose.OPEN_PALM, round(palm * detection_score, 3), index_extended)

    # Thumbs up: thumb out and pointing up, other four fingers curled.
    curled = 1.0 - max(ext["index"], *others)
    up = thumb_pointing_up(pts)
    thumbs = min(curled, up, thumb)
    if thumbs > 0.5:
        return PoseResult(Pose.THUMBS_UP, round(thumbs * detection_score, 3), False)

    # Two fingers (V): index + middle extended, ring + pinky curled.
    two = min(ext["index"], ext["middle"], 1.0 - max(ext["ring"], ext["pinky"]))
    if two > 0.5:
        return PoseResult(Pose.TWO_FINGERS, round(two * detection_score, 3), True)

    # Point: index extended, other fingers curled.
    point = min(ext["index"], 1.0 - max(others))
    if point > 0.5:
        return PoseResult(Pose.POINT, round(point * detection_score, 3), True)

    # Fist: everything curled.
    if curled > 0.6 and thumb < 0.5:
        return PoseResult(Pose.FIST, round(curled * detection_score, 3), False)

    return PoseResult(Pose.NONE, 0.0, index_extended)
