"""API tests with a fake pipeline (no camera, no MediaPipe)."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.store import load_state, save_state
from config.settings import GestureTuning, Settings
from gestures.calibration import CalibrationMapper
from gestures.engine import GestureEngine


class FakePipeline:
    def __init__(self, path: Path):
        self.path = path
        self.mapper = CalibrationMapper()
        self.tuning = GestureTuning()
        self.engine = GestureEngine(self.tuning, self.mapper)
        self.fps = 30.0
        self.model_ready = True
        self.started = self.stopped = False
        self.restarts = 0

    def start(self):
        self.started = True

    def stop(self):
        self.stopped = True

    def status_event(self):
        return {"type": "status", "camera": "running", "message": None, "fps": self.fps, "calibrated": self.mapper.calibrated, "timestamp": 0}

    def apply_tuning(self, tuning):
        self.tuning = tuning
        self.engine.configure(tuning)
        self.save()

    def save(self):
        save_state(self.path, self.tuning, self.mapper)

    def restart_camera(self):
        self.restarts += 1
        return True

    def select_camera(self, index):
        return index == 0

    def debug_frame(self):
        return None


@pytest.fixture()
def client(tmp_path):
    pipe = FakePipeline(tmp_path / "calibration.json")
    app = create_app(Settings(vision_allowed_origins="http://localhost:3000"), pipe)
    with TestClient(app) as c:
        c.pipe = pipe
        yield c
    assert pipe.stopped


def test_health_and_status(client):
    assert client.get("/health").json() == {"status": "ok"}
    status = client.get("/status").json()
    assert status["camera"] == "running"
    assert status["tuning"]["pinch_threshold"] == pytest.approx(0.33)
    assert client.pipe.started


def test_update_config_validates_and_persists(client):
    res = client.put("/config", json={"cursor_smoothing": 0.3, "pinch_threshold": 0.3})
    assert res.status_code == 200
    assert client.pipe.engine.smoother.smoothing == 0.3
    assert client.pipe.path.exists()

    bad = client.put("/config", json={"pinch_threshold": 0.5, "pinch_release_threshold": 0.4})
    assert bad.status_code == 422
    too_smooth = client.put("/config", json={"cursor_smoothing": 1.5})
    assert too_smooth.status_code == 422


def test_calibration_roundtrip(client, tmp_path):
    pts = [
        {"camera": {"x": 0.25, "y": 0.2}, "screen": {"x": 0, "y": 0}},
        {"camera": {"x": 0.75, "y": 0.2}, "screen": {"x": 1, "y": 0}},
        {"camera": {"x": 0.75, "y": 0.8}, "screen": {"x": 1, "y": 1}},
        {"camera": {"x": 0.25, "y": 0.8}, "screen": {"x": 0, "y": 1}},
    ]
    res = client.post("/calibration", json={"points": pts})
    assert res.status_code == 200 and res.json()["calibrated"]

    # Stored locally and reloaded on the next start.
    mapper = CalibrationMapper()
    tuning = load_state(client.pipe.path, GestureTuning(), mapper)
    assert mapper.calibrated and tuning == client.pipe.tuning

    tiny = [{**p, "camera": {"x": 0.5 + i * 0.001, "y": 0.5}} for i, p in enumerate(pts)]
    assert client.post("/calibration", json={"points": tiny}).status_code == 422
    assert client.post("/calibration", json={"points": pts[:3]}).status_code == 422

    assert client.delete("/calibration").json()["calibrated"] is False


def test_camera_restart(client):
    assert client.post("/camera/restart").json()["ok"] is True
    assert client.pipe.restarts == 1


def test_websocket_streams_events(client):
    with client.websocket_connect("/ws/gesture", headers={"origin": "http://localhost:3000"}) as ws:
        first = ws.receive_json()
        assert first["type"] == "status"
        client.app.state.broadcaster.publish({"type": "gesture", "gesture": "pinch", "confidence": 0.9, "timestamp": 1})
        # Heartbeat status events may interleave; find the gesture.
        for _ in range(5):
            event = ws.receive_json()
            if event["type"] == "gesture":
                assert event["gesture"] == "pinch"
                break
        else:
            pytest.fail("gesture event not received")


def test_websocket_rejects_foreign_origin(client):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/gesture", headers={"origin": "https://evil.example"}) as ws:
            ws.receive_json()


def test_corrupt_state_file_falls_back_to_defaults(tmp_path):
    path = tmp_path / "calibration.json"
    path.write_text("{not json", encoding="utf-8")
    mapper = CalibrationMapper()
    assert load_state(path, GestureTuning(), mapper) == GestureTuning()
    assert not mapper.calibrated


def test_client_disconnect_noise_is_ignored_but_real_errors_are_logged():
    import asyncio
    from unittest.mock import MagicMock

    from app.main import quiet_disconnects

    loop = MagicMock(spec=asyncio.AbstractEventLoop)
    quiet_disconnects(loop, {"message": "reset", "exception": ConnectionResetError(10054, "forcibly closed")})
    loop.default_exception_handler.assert_not_called()
    real = {"message": "boom", "exception": RuntimeError("real bug")}
    quiet_disconnects(loop, real)
    loop.default_exception_handler.assert_called_once_with(real)
