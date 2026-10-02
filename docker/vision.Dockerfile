# syntax=docker/dockerfile:1
# Vision service container — Linux hosts only (needs /dev/video0 passthrough).
# On Windows/macOS kiosks run the service natively: npm run dev:vision
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libegl1 libgles2 libglib2.0-0 curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /service
COPY services/vision/requirements.txt .
RUN pip install -r requirements.txt
# Bake the hand and face (close-eyes gesture) models into the image (no download at runtime).
RUN mkdir -p models && curl -fsSL -o models/hand_landmarker.task \
    https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task \
 && curl -fsSL -o models/face_landmarker.task \
    https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
COPY services/vision/ .
RUN useradd --system --uid 10001 vision && mkdir -p /data && chown -R vision /service /data
USER vision
ENV VISION_HOST=0.0.0.0 VISION_PORT=8765 CALIBRATION_FILE=/data/calibration.json CAMERA_BACKEND=v4l2
EXPOSE 8765
HEALTHCHECK --interval=15s --timeout=5s CMD curl -fs http://127.0.0.1:8765/health || exit 1
CMD ["python", "-m", "app"]
