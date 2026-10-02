# syntax=docker/dockerfile:1
# One Dockerfile for the three Next.js apps:  --build-arg APP=kiosk|admin|kitchen
ARG APP=kiosk

# ---------- build ----------
FROM node:22-alpine AS build
ARG APP
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY backend/package.json backend/
COPY apps/kiosk/package.json apps/kiosk/
COPY apps/admin/package.json apps/admin/
COPY apps/kitchen/package.json apps/kitchen/
RUN npm ci --workspace=apps/${APP} --workspace=@gcs/types --workspace=@gcs/config --include-workspace-root --ignore-scripts
COPY packages ./packages
COPY apps/${APP} ./apps/${APP}
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_VISION_WS_URL=ws://localhost:8765/ws/gesture
ARG NEXT_PUBLIC_VISION_HTTP_URL=http://localhost:8765
ARG NEXT_PUBLIC_INPUT_MODE=gesture
ARG NEXT_PUBLIC_KIOSK_CODE=KIOSK-01
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_VISION_WS_URL=$NEXT_PUBLIC_VISION_WS_URL \
    NEXT_PUBLIC_VISION_HTTP_URL=$NEXT_PUBLIC_VISION_HTTP_URL \
    NEXT_PUBLIC_INPUT_MODE=$NEXT_PUBLIC_INPUT_MODE \
    NEXT_PUBLIC_KIOSK_CODE=$NEXT_PUBLIC_KIOSK_CODE \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @gcs/types && npm run build -w apps/${APP}

# ---------- runtime (standalone server, no node_modules install) ----------
FROM node:22-alpine
ARG APP
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=app:app /repo/apps/${APP}/public ./apps/${APP}/public
USER app
ENV APP_DIR=apps/${APP}
CMD ["sh", "-c", "node ${APP_DIR}/server.js"]
