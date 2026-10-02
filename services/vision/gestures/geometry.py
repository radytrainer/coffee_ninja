"""Scale-invariant hand geometry helpers (operate on 'square' 2D points)."""

from __future__ import annotations

import numpy as np

from hand_tracking import landmarks as L


def dist(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))


def hand_size(pts: np.ndarray) -> float:
    """Reference length: wrist → middle-finger MCP (stable regardless of finger pose)."""
    return max(dist(pts[L.WRIST], pts[L.MIDDLE_MCP]), 1e-6)


def pinch_ratio(pts: np.ndarray) -> float:
    """Thumb-tip ↔ index-tip distance normalized by hand size (≈0 when pinching)."""
    return dist(pts[L.THUMB_TIP], pts[L.INDEX_TIP]) / hand_size(pts)


def finger_extension(pts: np.ndarray, finger: str) -> float:
    """0 = fully curled … 1 = clearly extended.

    A finger is extended when its tip is much farther from the wrist than its PIP joint.
    """
    _mcp, pip, tip = L.FINGERS[finger]
    wrist = pts[L.WRIST]
    ratio = dist(wrist, pts[tip]) / max(dist(wrist, pts[pip]), 1e-6)
    # ratio ≈ 0.8 curled, ≈ 1.35+ straight
    return float(np.clip((ratio - 0.95) / 0.3, 0.0, 1.0))


def thumb_extension(pts: np.ndarray) -> float:
    """0 = thumb tucked … 1 = thumb clearly out, away from the palm."""
    size = hand_size(pts)
    away = dist(pts[L.THUMB_TIP], pts[L.INDEX_MCP]) / size
    beyond_ip = dist(pts[L.THUMB_TIP], pts[L.PINKY_MCP]) - dist(pts[L.THUMB_IP], pts[L.PINKY_MCP])
    if beyond_ip <= 0:
        return 0.0
    return float(np.clip((away - 0.45) / 0.35, 0.0, 1.0))


def thumb_pointing_up(pts: np.ndarray) -> float:
    """1 when the thumb points straight up (image y decreases toward the tip)."""
    tip, ip, mcp = pts[L.THUMB_TIP], pts[L.THUMB_IP], pts[L.THUMB_MCP]
    vec = tip - mcp
    length = max(float(np.linalg.norm(vec)), 1e-6)
    up = -vec[1] / length  # cos(angle to "up")
    ordered = tip[1] < ip[1] < mcp[1]
    above_hand = tip[1] < pts[L.INDEX_MCP][1]
    if not (ordered and above_hand):
        return 0.0
    return float(np.clip((up - 0.6) / 0.35, 0.0, 1.0))
