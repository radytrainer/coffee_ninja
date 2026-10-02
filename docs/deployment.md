# Deployment

## Topology

```
Shop server (Docker):  postgres · backend :4000 · admin :3010 · kitchen :3020 · (kiosk :3000)
Kiosk PC(s):           vision service :8765 (native, needs the webcam) · browser in kiosk mode
Kitchen tablet/PC:     browser → kitchen :3020
```

The kiosk UI can be served by the shop server or by the kiosk PC itself
(`start-kiosk.ps1` runs the production build locally).

## Development mode

```bash
npm run db:up && npm run db:deploy && npm run db:seed
npm run dev            # backend + kiosk + admin + kitchen (hot reload)
npm run dev:vision     # or: npm run dev:vision:sim (no camera)
```

## Production with Docker Compose

1. `cp .env.example .env` and set **real** values:
   `POSTGRES_PASSWORD`, `JWT_SECRET` (≥ 32 random chars), `SEED_ADMIN_PASSWORD`,
   `SEED_STAFF_PASSWORD`, `CORS_ORIGINS` (the exact browser origins), `NEXT_PUBLIC_API_URL`
   (the URL browsers use to reach the API), `COOKIE_SECURE=true` when served over HTTPS,
   `TRUST_PROXY=true` behind a reverse proxy.
2. `docker compose up -d --build`
   - backend: runs `prisma migrate deploy`, then the idempotent seed if `SEED_ON_START=true`
     (demo orders only if `SEED_DEMO_ORDERS=true`), then the API; health-checked.
   - Next.js apps: standalone builds (`NEXT_PUBLIC_*` values are baked in at build time —
     rebuild after changing them).
3. Linux kiosk with webcam: `docker compose --profile vision up -d --build`
   (passes `/dev/video0`; calibration persisted in the `visiondata` volume).
   Windows/macOS: run the vision service natively (Docker can't access the webcam).
4. Sign in to Admin, **change the seeded passwords** (Staff → Edit), configure Settings
   (tax, currency, timezone) and the kiosks.

Put the stack behind HTTPS (Caddy, nginx, Traefik). Browsers require a secure context
for many features; cookies must be `Secure` on HTTPS.

## Without Docker

```bash
npm ci && npm run build
npm run db:deploy
NODE_ENV=production node backend/dist/src/server.js
PORT=3000 node apps/kiosk/.next/standalone/apps/kiosk/server.js   # copy .next/static + public next to it
```

## Security checklist

- [ ] Strong unique `JWT_SECRET`, DB password, seed passwords changed after first login
- [ ] `.env` never committed (it is git-ignored); secrets injected by the host
- [ ] HTTPS + `COOKIE_SECURE=true`; `CORS_ORIGINS` lists only your origins
- [ ] PostgreSQL not exposed publicly (remove the `ports:` mapping in production)
- [ ] Vision service bound to `127.0.0.1` on kiosks (`VISION_HOST`), `VISION_DEBUG_ENDPOINTS=false`
- [ ] Rate limits active (login 10 / 15 min, orders 30 / min per IP, API 600 / min)
- [ ] Kiosk PCs: auto-login to a limited Windows account, kiosk-mode browser

Known advisory: `npm audit` reports `deepmerge-ts` (GHSA-ggr8-5vv4-36mx) inside the
**Prisma CLI** config loader. It only processes the project's own config at development /
migration time — never untrusted input — and cannot be patched without breaking Prisma 6.
Re-check when upgrading Prisma.

### Known audit findings

- `npm audit` reports `deepmerge-ts` < 8 (GHSA-ggr8-5vv4-36mx, stack exhaustion on
  recursive objects) via `prisma` → `@prisma/config`. It runs only in the Prisma **CLI**
  (migrate / generate / seed), merging our own `prisma.config.ts` — never in the API at
  runtime and never on user input, so it is not exploitable here. Forcing 8.x with an npm
  override breaks the Prisma 6 CLI (the package is then not installed); it goes away with
  the Prisma 7 upgrade.
- ESLint is pinned to 9 (npm prints "no longer supported") because ESLint 10 breaks
  `eslint-config-next`.

## Performance

- Vision: ~17 ms per MediaPipe inference on a normal laptop CPU → 30–60 fps. Poor lighting
  makes webcams lower their own frame rate (e.g. 15 fps) — add light.
- Only small JSON events leave the vision process (~30/s, < 300 bytes each).
- Kiosk cursor updates bypass React rendering (direct transform in `requestAnimationFrame`).
- Menu is loaded once per session and refreshed in the background after each order.

## Backups

```bash
npm run db:backup                 # docker exec pg_dump -Fc → ./backups (keeps newest 14)
```

Schedule it (Windows Task Scheduler / cron) at least daily and copy `backups/` off the
machine. Restore:

```bash
docker exec -i gesture-coffee-shop-postgres-1 pg_restore -U coffee -d gesture_coffee --clean < backups/<file>.dump
```

Test a restore periodically on a spare database.
