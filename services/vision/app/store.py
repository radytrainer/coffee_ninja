"""Local persistence of calibration + tuning (a small JSON file on the kiosk)."""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path

from config.settings import GestureTuning
from gestures.calibration import CalibrationMapper, CalibrationPoint

log = logging.getLogger("vision.store")


def load_state(path: Path, default_tuning: GestureTuning, mapper: CalibrationMapper) -> GestureTuning:
    """Loads saved tuning and calibration; falls back to defaults on any problem."""
    if not path.exists():
        return default_tuning
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        log.warning("ignoring unreadable calibration file %s: %s", path, exc)
        return default_tuning

    tuning = default_tuning
    try:
        if isinstance(data.get("tuning"), dict):
            tuning = GestureTuning(**{**default_tuning.model_dump(), **data["tuning"]})
    except ValueError as exc:
        log.warning("ignoring invalid saved tuning: %s", exc)

    points = data.get("calibration", {}).get("points") if isinstance(data.get("calibration"), dict) else None
    if points:
        try:
            mapper.set_points(
                [CalibrationPoint(camera=tuple(p["camera"]), screen=tuple(p["screen"])) for p in points]
            )
        except (ValueError, KeyError, TypeError) as exc:
            log.warning("ignoring invalid saved calibration: %s", exc)
    return tuning


def save_state(path: Path, tuning: GestureTuning, mapper: CalibrationMapper) -> None:
    """Atomically writes the state file (write temp file, then rename)."""
    payload = {"tuning": tuning.model_dump(), "calibration": mapper.to_dict()}
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
        os.replace(tmp, path)
    except OSError:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
