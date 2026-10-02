"""Gesture simulator — a drop-in replacement for the vision service that needs
no camera. It speaks the same WebSocket protocol on the same port, and events
are injected over HTTP. Used by end-to-end tests and for development without
a webcam.

    python -m app.simulator            # listens on VISION_HOST:VISION_PORT

    POST /simulate/hand     {"detected": true}
    POST /simulate/cursor   {"x": 0.5, "y": 0.4, "pinching": false}
    POST /simulate/gesture  {"gesture": "pinch", "x": 0.5, "y": 0.4}
    POST /simulate/camera   {"status": "unavailable", "message": "..."}
    POST /simulate/scroll   {"phase": "start" | "move" | "end", "dy": -0.05, "x": 0.5, "y": 0.5}
    POST /simulate/swipe    {"phase": "start" | "move" | "end", "dx": -0.03}   (✋ palm sideways)
    POST /simulate/smile    {"progress": 1.0}   (1.0 also issues a signed smile token)
"""

from __future__ import annotations

import logging
import time
from typing import Any, Literal

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel, Field

from config.settings import GestureTuning, Settings, get_settings
from gestures.calibration import CalibrationMapper
from gestures.smile import sign_smile_token

from .main import create_app


def _ts() -> int:
    return int(time.time() * 1000)


class SimulatedPipeline:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.mapper = CalibrationMapper()
        self.tuning = settings.default_tuning()
        self.fps = 30.0
        self.model_ready = True
        self.camera_status = "running"
        self.message: str | None = None
        self.low_light = False

    def start(self) -> None: ...
    def stop(self) -> None: ...

    def status_event(self) -> dict[str, Any]:
        return {
            "type": "status",
            "camera": self.camera_status,
            "message": self.message,
            "fps": self.fps if self.camera_status == "running" else 0.0,
            "calibrated": self.mapper.calibrated,
            "lowLight": self.low_light,
            "timestamp": _ts(),
        }

    def apply_tuning(self, tuning: GestureTuning) -> None:
        self.tuning = tuning

    def save(self) -> None:
        # The simulator never overwrites the real kiosk calibration file.
        pass

    def restart_camera(self) -> bool:
        self.camera_status, self.message = "running", None
        return True

    def select_camera(self, index: int) -> bool:
        return self.restart_camera()

    def debug_frame(self) -> bytes | None:
        return None


class HandBody(BaseModel):
    detected: bool = True


class CursorBody(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    rawX: float | None = None
    rawY: float | None = None
    pinching: bool = False
    pinchStrength: float | None = None
    scrolling: bool = False
    swiping: bool = False


class GestureBody(BaseModel):
    gesture: Literal["pinch", "open_palm", "thumbs_up", "eyes_closed"]
    x: float | None = None
    y: float | None = None
    confidence: float = 0.95


class ScrollBody(BaseModel):
    phase: Literal["start", "move", "end"]
    dx: float = 0.0
    dy: float = 0.0
    x: float = Field(0.5, ge=0, le=1)
    y: float = Field(0.5, ge=0, le=1)


class SwipeBody(BaseModel):
    phase: Literal["start", "move", "end"]
    dx: float = 0.0
    x: float = Field(0.5, ge=0, le=1)
    y: float = Field(0.5, ge=0, le=1)


class SmileBody(BaseModel):
    progress: float = Field(1.0, ge=0, le=1)


class CameraBody(BaseModel):
    status: Literal["running", "unavailable", "stopped", "starting"]
    message: str | None = None
    lowLight: bool = False


def create_simulator(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    pipe = SimulatedPipeline(settings)
    app = create_app(settings, pipe)
    publish = app.state.broadcaster.publish

    @app.post("/simulate/hand")
    def sim_hand(body: HandBody) -> dict[str, bool]:
        publish({"type": "hand", "handDetected": body.detected, "timestamp": _ts()})
        if not body.detected:
            publish(
                {"type": "cursor", "x": 0.5, "y": 0.5, "rawX": 0.5, "rawY": 0.5, "handDetected": False,
                 "pointing": False, "pinching": False, "pinchStrength": 0.0, "timestamp": _ts()}
            )
        return {"ok": True}

    @app.post("/simulate/cursor")
    def sim_cursor(body: CursorBody) -> dict[str, bool]:
        publish(
            {
                "type": "cursor",
                "x": body.x,
                "y": body.y,
                "rawX": body.rawX if body.rawX is not None else body.x,
                "rawY": body.rawY if body.rawY is not None else body.y,
                "handDetected": True,
                "pointing": not body.pinching,
                "pinching": body.pinching,
                "pinchStrength": body.pinchStrength if body.pinchStrength is not None else (1.0 if body.pinching else 0.0),
                "scrolling": body.scrolling,
                "swiping": body.swiping,
                "timestamp": _ts(),
            }
        )
        return {"ok": True}

    @app.post("/simulate/gesture")
    def sim_gesture(body: GestureBody) -> dict[str, bool]:
        event: dict[str, Any] = {"type": "gesture", "gesture": body.gesture, "confidence": body.confidence, "timestamp": _ts()}
        if body.x is not None and body.y is not None:
            event.update(x=body.x, y=body.y)
        publish(event)
        return {"ok": True}

    @app.post("/simulate/scroll")
    def sim_scroll(body: ScrollBody) -> dict[str, bool]:
        publish({"type": "scroll", **body.model_dump(), "timestamp": _ts()})
        return {"ok": True}

    @app.post("/simulate/swipe")
    def sim_swipe(body: SwipeBody) -> dict[str, bool]:
        publish({"type": "swipe", **body.model_dump(), "timestamp": _ts()})
        return {"ok": True}

    @app.post("/simulate/smile")
    def sim_smile(body: SmileBody) -> dict[str, bool]:
        publish({"type": "face", "faceDetected": True, "smile": 0.8, "smileProgress": body.progress, "timestamp": _ts()})
        if body.progress >= 1.0 and settings.smile_token_secret:
            publish({"type": "smile", "token": sign_smile_token(settings.smile_token_secret), "timestamp": _ts()})
        return {"ok": True}

    @app.post("/simulate/camera")
    def sim_camera(body: CameraBody) -> dict[str, bool]:
        pipe.camera_status, pipe.message = body.status, body.message
        pipe.low_light = body.lowLight
        publish(pipe.status_event())
        return {"ok": True}

    return app


def main() -> None:
    settings = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    logging.getLogger("vision.api").info("GESTURE SIMULATOR (no camera) — inject events via POST /simulate/*")
    uvicorn.run(create_simulator(settings), host=settings.vision_host, port=settings.vision_port, log_level="warning")


if __name__ == "__main__":
    main()
