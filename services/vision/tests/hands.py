"""Synthetic hand landmark fixtures (no camera needed).

Hands are built in 'square' space (x already corrected for aspect ratio), then
converted to normalized image coordinates like MediaPipe returns them.
Hand size (wrist → middle MCP) is 0.2.
"""

from __future__ import annotations

import numpy as np

from hand_tracking import landmarks as L
from hand_tracking.hand_tracker import HandObservation

ASPECT = 4 / 3
WRIST = (0.5, 0.80)
MCP_X = {"index": 0.44, "middle": 0.50, "ring": 0.55, "pinky": 0.60}
MCP_Y = {"index": 0.62, "middle": 0.60, "ring": 0.61, "pinky": 0.64}


def _finger(pts: dict[int, tuple[float, float]], name: str, extended: bool) -> None:
    mcp, pip, tip = L.FINGERS[name]
    dip = tip - 1
    x, y = MCP_X[name], MCP_Y[name]
    pts[mcp] = (x, y)
    if extended:
        pts[pip], pts[dip], pts[tip] = (x, y - 0.06), (x, y - 0.10), (x, y - 0.14)
    else:
        pts[pip], pts[dip], pts[tip] = (x, y - 0.05), (x + 0.01, y - 0.01), (x, y + 0.04)


def _thumb(pts: dict[int, tuple[float, float]], mode: str) -> None:
    pts[L.THUMB_CMC] = (0.44, 0.76)
    if mode == "out":
        pts[L.THUMB_MCP], pts[L.THUMB_IP], pts[L.THUMB_TIP] = (0.38, 0.70), (0.34, 0.65), (0.30, 0.60)
    elif mode == "up":
        pts[L.THUMB_MCP], pts[L.THUMB_IP], pts[L.THUMB_TIP] = (0.42, 0.66), (0.42, 0.56), (0.42, 0.46)
    else:  # tucked across the palm
        pts[L.THUMB_MCP], pts[L.THUMB_IP], pts[L.THUMB_TIP] = (0.43, 0.72), (0.45, 0.69), (0.47, 0.66)


def build(
    fingers: dict[str, bool],
    thumb: str,
    offset: tuple[float, float] = (0.0, 0.0),
    score: float = 0.95,
    pinch: bool = False,
    scale: float = 1.0,
) -> HandObservation:
    pts: dict[int, tuple[float, float]] = {L.WRIST: WRIST}
    for name, extended in fingers.items():
        _finger(pts, name, extended)
    _thumb(pts, thumb)
    if pinch:
        # Thumb tip touches the index tip.
        ix, iy = pts[L.INDEX_TIP]
        pts[L.THUMB_TIP] = (ix - 0.01, iy + 0.005)
        pts[L.THUMB_IP] = (ix - 0.05, iy + 0.06)
    arr = np.zeros((21, 3))
    wx, wy = WRIST
    for i, (x, y) in pts.items():
        # scale around the wrist (a hand closer to / further from the camera)
        x, y = wx + (x - wx) * scale, wy + (y - wy) * scale
        arr[i] = ((x + offset[0]) / ASPECT, y + offset[1], 0.0)
    return HandObservation(points=arr, score=score, handedness="Right", aspect=ASPECT)


def open_palm(**kw) -> HandObservation:
    return build({f: True for f in MCP_X}, "out", **kw)


def point(**kw) -> HandObservation:
    return build({"index": True, "middle": False, "ring": False, "pinky": False}, "tucked", **kw)


def fist(**kw) -> HandObservation:
    return build({f: False for f in MCP_X}, "tucked", **kw)


def thumbs_up(**kw) -> HandObservation:
    return build({f: False for f in MCP_X}, "up", **kw)


def pinch(**kw) -> HandObservation:
    return build({"index": True, "middle": False, "ring": False, "pinky": False}, "out", pinch=True, **kw)


def two_fingers(**kw) -> HandObservation:
    """✌️ index + middle extended, ring + pinky curled (scroll pose)."""
    return build({"index": True, "middle": True, "ring": False, "pinky": False}, "tucked", **kw)
