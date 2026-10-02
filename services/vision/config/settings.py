"""Configuration for the vision service.

Values come from environment variables (or the repository-root .env file).
Gesture tuning values can also be changed at runtime through the HTTP API and
are then persisted in the local calibration file.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = SERVICE_DIR.parent.parent


class GestureTuning(BaseModel):
    """Live-tunable gesture parameters (also exposed via GET/PUT /config)."""

    cursor_smoothing: float = Field(0.55, ge=0.0, le=0.95, description="0 = raw, higher = smoother but laggier")
    pinch_threshold: float = Field(0.33, gt=0.05, lt=1.0, description="thumb-index distance / hand size to start a pinch")
    pinch_release_threshold: float = Field(0.48, gt=0.05, lt=1.5, description="ratio above which a pinch is released")
    pinch_cooldown_ms: int = Field(450, ge=0, le=5000)
    pinch_min_frames: int = Field(2, ge=1, le=10, description="consecutive frames required to confirm a pinch")
    gesture_confidence: float = Field(0.6, ge=0.0, le=1.0)
    open_palm_hold_ms: int = Field(1000, ge=200, le=5000)
    thumbs_up_hold_ms: int = Field(900, ge=200, le=5000)
    gesture_cooldown_ms: int = Field(1500, ge=0, le=10000, description="minimum time between back/confirm gestures")
    pinch_lookback_ms: int = Field(120, ge=0, le=500, description="click at the cursor position from before the pinch closed")
    scroll_activation_ms: int = Field(150, ge=0, le=2000, description="hold the ✌️ pose this long before scrolling starts")
    eyes_closed_back: bool = Field(True, description="close both eyes (held) to go back")
    eyes_closed_hold_ms: int = Field(600, ge=300, le=5000, description="eyes closed this long -> back (blinks are 0.1-0.3 s)")
    eyes_closed_threshold: float = Field(0.5, ge=0.2, le=0.95, description="blink score (0..1) that counts as closed")
    smile_hold_ms: int = Field(800, ge=300, le=5000, description="hold a smile this long for the smile discount")
    smile_threshold: float = Field(0.5, ge=0.2, le=0.95, description="mouth-smile score (0..1) that counts as smiling")

    @field_validator("pinch_release_threshold")
    @classmethod
    def release_above_threshold(cls, v: float, info):  # noqa: ANN001
        start = info.data.get("pinch_threshold")
        if start is not None and v <= start:
            raise ValueError("pinch_release_threshold must be greater than pinch_threshold (hysteresis)")
        return v


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(REPO_ROOT / ".env"), str(SERVICE_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    vision_host: str = "127.0.0.1"
    vision_port: int = 8765
    vision_allowed_origins: str = "http://localhost:3000"
    vision_debug_endpoints: bool = True
    log_level: str = "info"

    camera_index: int = 0
    camera_width: int = 640
    camera_height: int = 480
    camera_fps: int = 30
    camera_mirror: bool = True
    camera_backend: str = "auto"  # auto | dshow | msmf | v4l2 | any

    model_path: str = "models/hand_landmarker.task"
    model_url: str = (
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/"
        "hand_landmarker.task"
    )
    # Face model for the close-eyes gesture (only eye-blink scores are used).
    face_gestures: bool = True
    # Shared with the API: signs smile-discount tokens. Empty = no smile discount.
    smile_token_secret: str = ""
    face_model_path: str = "models/face_landmarker.task"
    face_model_url: str = (
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/"
        "face_landmarker.task"
    )
    min_detection_confidence: float = 0.6
    min_tracking_confidence: float = 0.5

    calibration_file: str = "calibration.json"

    # Defaults for GestureTuning (env names match the kiosk documentation)
    cursor_smoothing: float = 0.55
    pinch_threshold: float = 0.33
    pinch_release_threshold: float = 0.48
    pinch_cooldown: int = 450
    gesture_confidence: float = 0.6
    open_palm_hold_ms: int = 1000
    thumbs_up_hold_ms: int = 900
    eyes_closed_hold_ms: int = 600

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.vision_allowed_origins.split(",") if o.strip()]

    @property
    def model_file(self) -> Path:
        path = Path(self.model_path)
        return path if path.is_absolute() else SERVICE_DIR / path

    @property
    def face_model_file(self) -> Path:
        path = Path(self.face_model_path)
        return path if path.is_absolute() else SERVICE_DIR / path

    @property
    def calibration_path(self) -> Path:
        path = Path(self.calibration_file)
        return path if path.is_absolute() else SERVICE_DIR / path

    def default_tuning(self) -> GestureTuning:
        return GestureTuning(
            cursor_smoothing=self.cursor_smoothing,
            pinch_threshold=self.pinch_threshold,
            pinch_release_threshold=self.pinch_release_threshold,
            pinch_cooldown_ms=self.pinch_cooldown,
            gesture_confidence=self.gesture_confidence,
            open_palm_hold_ms=self.open_palm_hold_ms,
            thumbs_up_hold_ms=self.thumbs_up_hold_ms,
            eyes_closed_hold_ms=self.eyes_closed_hold_ms,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
