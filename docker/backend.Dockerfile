# syntax=docker/dockerfile:1
# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /repo
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY backend/package.json backend/
COPY apps/kiosk/package.json apps/kiosk/
COPY apps/admin/package.json apps/admin/
COPY apps/kitchen/package.json apps/kitchen/
# Install backend + shared packages only (skip the Next.js apps).
RUN npm ci --workspace=backend --workspace=@gcs/types --workspace=@gcs/config --include-workspace-root --ignore-scripts
COPY packages ./packages
COPY backend ./backend
RUN npm run build -w @gcs/types && npm run build -w backend

# ---------- runtime ----------
FROM node:22-alpine
WORKDIR /repo
RUN apk add --no-cache openssl tini && addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/backend ./backend
COPY docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-entrypoint.sh && chown -R app:app /repo/backend
USER app
WORKDIR /repo/backend
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--", "backend-entrypoint.sh"]
