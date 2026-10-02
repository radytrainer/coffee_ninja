"""Camera → screen coordinate mapping.

Customers can't comfortably reach the edges of the camera frame, so a smaller
"active region" of the camera image is mapped onto the whole screen.

- Default: a centred rectangle (margins) is stretched to the screen.
- Calibrated: the four corner points captured on the calibration screen define
  a perspective transform (homography) from camera space to screen space.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

SCREEN_CORNERS = np.array([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]])  # TL, TR, BR, BL


@dataclass
class CalibrationPoint:
    camera: tuple[float, float]
    screen: tuple[float, float]


def homography(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """Solves the 3×3 perspective transform mapping 4 src points to 4 dst points (DLT)."""
    if src.shape != (4, 2) or dst.shape != (4, 2):
        raise ValueError("exactly four point pairs are required")
    rows = []
    for (x, y), (u, v) in zip(src, dst):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    a = np.array(rows, dtype=np.float64)
    _, s, vt = np.linalg.svd(a)
    if s[-2] < 1e-9:
        raise ValueError("calibration points are degenerate (collinear or duplicated)")
    h = vt[-1].reshape(3, 3)
    if abs(h[2, 2]) < 1e-12:
        raise ValueError("calibration produced an invalid transform")
    return h / h[2, 2]


def _polygon_area(pts: np.ndarray) -> float:
    x, y = pts[:, 0], pts[:, 1]
    return 0.5 * float(abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))))


class CalibrationMapper:
    def __init__(self, margin_x: float = 0.18, margin_y: float = 0.15) -> None:
        self.margin_x = margin_x
        self.margin_y = margin_y
        self._h: np.ndarray | None = None
        self.points: list[CalibrationPoint] = []

    @property
    def calibrated(self) -> bool:
        return self._h is not None

    def reset(self) -> None:
        self._h = None
        self.points = []

    def set_points(self, points: list[CalibrationPoint]) -> None:
        if len(points) != 4:
            raise ValueError("exactly four calibration points are required")
        src = np.array([p.camera for p in points], dtype=np.float64)
        dst = np.array([p.screen for p in points], dtype=np.float64)
        if np.any(src < -0.05) or np.any(src > 1.05):
            raise ValueError("camera coordinates must be normalized (0..1)")
        # The captured area must be a reasonably sized region, otherwise tiny
        # hand movements would fling the cursor across the screen.
        if _polygon_area(src) < 0.02:
            raise ValueError("calibration area is too small — move your finger further toward each corner")
        self._h = homography(src, dst)
        self.points = points

    def map(self, x: float, y: float) -> tuple[float, float]:
        """Maps normalized camera coordinates to normalized screen coordinates (clamped 0..1)."""
        if self._h is None:
            sx = (x - self.margin_x) / (1.0 - 2 * self.margin_x)
            sy = (y - self.margin_y) / (1.0 - 2 * self.margin_y)
        else:
            vec = self._h @ np.array([x, y, 1.0])
            if abs(vec[2]) < 1e-12:
                return 0.5, 0.5
            sx, sy = vec[0] / vec[2], vec[1] / vec[2]
        return float(min(1.0, max(0.0, sx))), float(min(1.0, max(0.0, sy)))

    def to_dict(self) -> dict:
        return {
            "calibrated": self.calibrated,
            "points": [{"camera": list(p.camera), "screen": list(p.screen)} for p in self.points],
            "margins": {"x": self.margin_x, "y": self.margin_y},
        }
