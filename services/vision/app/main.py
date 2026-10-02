"""HTTP + WebSocket API of the vision service.

    GET  /health               liveness
    GET  /status               camera / tracking / calibration status
    GET  /config               current gesture tuning
    PUT  /config               update tuning (live, persisted)
    GET  /calibration          current calibration
    POST /calibration          set 4-corner calibration (persisted)
    DELETE /calibration        reset to default mapping
    GET  /camera/devices       available camera indexes
    POST /camera/select        switch camera
    POST /camera/restart       restart camera
    GET  /debug/frame.jpg      one annotated snapshot (troubleshooting only)
    WS   /ws/gesture           gesture event stream
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from typing import Any, Protocol

from fastapi import FastAPI, HTTPException, WebSocket, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field, ValidationError

from config.settings import GestureTuning, Settings, get_settings
from gestures.calibration import CalibrationPoint
from websocket.broadcaster import Broadcaster

from .pipeline import VisionPipeline

log = logging.getLogger("vision.api")


class PipelineLike(Protocol):
    """What the API needs from the pipeline (lets tests use a fake without a camera)."""

    tuning: GestureTuning
    fps: float
    model_ready: bool

    def start(self) -> None: ...
    def stop(self) -> None: ...
    def status_event(self) -> dict[str, Any]: ...
    def apply_tuning(self, tuning: GestureTuning) -> None: ...
    def save(self) -> None: ...
    def restart_camera(self) -> bool: ...
    def select_camera(self, index: int) -> bool: ...
    def debug_frame(self) -> bytes | None: ...


class Point(BaseModel):
    x: float = Field(ge=-0.05, le=1.05)
    y: float = Field(ge=-0.05, le=1.05)


class CalibrationPair(BaseModel):
    camera: Point
    screen: Point


class CalibrationRequest(BaseModel):
    points: list[CalibrationPair] = Field(min_length=4, max_length=4)


class CameraSelect(BaseModel):
    index: int = Field(ge=0, le=16)


def quiet_disconnects(loop: asyncio.AbstractEventLoop, context: dict[str, Any]) -> None:
    """Browsers closing a tab reset the socket; on Windows asyncio logs that as a full
    traceback (WinError 10054). It's a normal disconnect — ignore it, keep real errors."""
    if isinstance(context.get("exception"), (ConnectionResetError, ConnectionAbortedError)):
        log.debug("client connection reset: %s", context.get("message"))
        return
    loop.default_exception_handler(context)


def create_app(settings: Settings | None = None, pipeline: PipelineLike | None = None) -> FastAPI:
    settings = settings or get_settings()
    broadcaster = Broadcaster()
    pipe: PipelineLike = pipeline or VisionPipeline(settings, broadcaster.publish_threadsafe)

    async def heartbeat() -> None:
        while True:
            broadcaster.publish(pipe.status_event())
            await asyncio.sleep(1.0)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        loop = asyncio.get_running_loop()
        loop.set_exception_handler(quiet_disconnects)
        broadcaster.bind_loop(loop)
        pipe.start()
        task = asyncio.create_task(heartbeat())
        log.info("vision service ready on %s:%s", settings.vision_host, settings.vision_port)
        try:
            yield
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            await asyncio.to_thread(pipe.stop)

    app = FastAPI(title="Gesture Coffee — Vision Service", version="1.0.0", lifespan=lifespan)
    app.state.pipeline = pipe
    app.state.broadcaster = broadcaster
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/status")
    def get_status() -> dict[str, Any]:
        event = pipe.status_event()
        mapper = getattr(pipe, "mapper", None)
        camera = getattr(pipe, "camera", None)
        return {
            "camera": event["camera"],
            "message": event["message"],
            "fps": event["fps"],
            "calibrated": event["calibrated"],
            "lowLight": event.get("lowLight", False),
            "modelReady": pipe.model_ready,
            "handDetected": getattr(getattr(pipe, "engine", None), "hand_detected", False),
            "clients": broadcaster.client_count,
            "cameraIndex": getattr(camera, "index", None),
            "resolution": getattr(camera, "actual_resolution", None),
            "calibration": mapper.to_dict() if mapper else None,
            "tuning": pipe.tuning.model_dump(),
        }

    @app.get("/config")
    def get_config() -> dict[str, Any]:
        return pipe.tuning.model_dump()

    @app.put("/config")
    def put_config(update: dict[str, Any]) -> dict[str, Any]:
        try:
            tuning = GestureTuning(**{**pipe.tuning.model_dump(), **update})
        except ValidationError as exc:
            detail = [{"loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors(include_url=False)]
            raise HTTPException(422, detail) from exc
        pipe.apply_tuning(tuning)
        return tuning.model_dump()

    @app.get("/calibration")
    def get_calibration() -> dict[str, Any]:
        mapper = getattr(pipe, "mapper", None)
        return mapper.to_dict() if mapper else {"calibrated": False, "points": []}

    @app.post("/calibration")
    def set_calibration(body: CalibrationRequest) -> dict[str, Any]:
        mapper = getattr(pipe, "mapper", None)
        if mapper is None:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "calibration not available")
        try:
            mapper.set_points(
                [CalibrationPoint(camera=(p.camera.x, p.camera.y), screen=(p.screen.x, p.screen.y)) for p in body.points]
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        pipe.save()
        broadcaster.publish(pipe.status_event())
        return mapper.to_dict()

    @app.delete("/calibration")
    def reset_calibration() -> dict[str, Any]:
        mapper = getattr(pipe, "mapper", None)
        if mapper is not None:
            mapper.reset()
            pipe.save()
        broadcaster.publish(pipe.status_event())
        return mapper.to_dict() if mapper else {"calibrated": False, "points": []}

    @app.get("/camera/devices")
    async def camera_devices() -> dict[str, Any]:
        camera = getattr(pipe, "camera", None)
        devices = await asyncio.to_thread(camera.list_devices) if camera else []
        return {"devices": devices, "active": getattr(camera, "index", None)}

    @app.post("/camera/select")
    async def camera_select(body: CameraSelect) -> dict[str, Any]:
        ok = await asyncio.to_thread(pipe.select_camera, body.index)
        broadcaster.publish(pipe.status_event())
        return {"ok": ok, **pipe.status_event()}

    @app.post("/camera/restart")
    async def camera_restart() -> dict[str, Any]:
        ok = await asyncio.to_thread(pipe.restart_camera)
        broadcaster.publish(pipe.status_event())
        return {"ok": ok, **pipe.status_event()}

    if settings.vision_debug_endpoints:

        @app.get("/debug/frame.jpg")
        def debug_frame() -> Response:
            data = pipe.debug_frame()
            if data is None:
                raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "no frame available")
            return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "no-store"})

    @app.websocket("/ws/gesture")
    async def gesture_socket(websocket: WebSocket) -> None:
        origin = websocket.headers.get("origin")
        # Browsers always send Origin; only the configured kiosk origins may subscribe.
        if origin and origin not in settings.allowed_origins:
            await websocket.close(code=1008)
            return
        await broadcaster.serve(websocket, initial=lambda: [pipe.status_event()])

    return app


app = create_app()
