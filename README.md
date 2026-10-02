# ☕ Gesture Coffee Shop — Touchless Ordering

Customers order coffee at a kiosk **without touching the screen**. A webcam tracks the
hand: the index finger drives a virtual cursor, a **thumb + index pinch** clicks, an
**still open palm** goes back, an **open palm moved left/right** browses the menu slideshow,
a **thumbs-up** confirms, **✌️ two fingers** scroll lists, and **closing both eyes** also goes back. Customers **pay by
QR code on their phone or with cash at the counter** before the order is prepared, and **smiling at checkout takes 5 % off**.
Paid orders flow in real time to a kitchen display; an admin dashboard manages the menu, staff
and reports.

| App | URL (dev) | Who |
|---|---|---|
| Kiosk (`apps/kiosk`) | http://localhost:3000 | Customers |
| Admin (`apps/admin`) | http://localhost:3010 | Admins |
| Kitchen display (`apps/kitchen`) | http://localhost:3020 | Staff / baristas |
| REST + Socket.IO API (`backend`) | http://localhost:4000 | — |
| Vision service (`services/vision`) | http://localhost:8765 | Runs on the kiosk PC |

Default accounts (from the seed — **change them in production**):
`admin@pnccoffee.local / Admin@12345` · `barista@pnccoffee.local / Staff@12345`

---

## Architecture

```
 Webcam ─► Vision service (Python: OpenCV + MediaPipe + FastAPI)
              │  lightweight JSON events over WebSocket (cursor, pinch, palm, eyes…) — no video leaves the PC
              ▼
 Kiosk (Next.js) ── gesture layer → UI interaction → cart/business rules
              │  REST (ids + quantities only — never prices)
              ▼
 Backend (Express + Prisma) ── validates, prices server-side, transactional orders
              │                         │ Socket.IO (order created / status)
              ▼                         ▼
          PostgreSQL            Kitchen display · Admin dashboard · Kiosk order status
```

Each part has one responsibility: the vision service never knows about orders, the
kiosk never touches the database, and prices are always computed by the backend.
Details: [docs/architecture.md](docs/architecture.md).

## Technology

- **Kiosk / Admin / Kitchen:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Recharts (admin)
- **Backend:** Node.js 22, Express 5, Prisma 6, PostgreSQL 17, Zod 4, Socket.IO 4, JWT (httpOnly cookie), bcrypt
- **Vision:** Python 3.11+, OpenCV, MediaPipe Tasks (HandLandmarker), NumPy, FastAPI, WebSocket
- **Quality:** ESLint, Prettier, Vitest, Pytest, Playwright, Docker Compose

## Requirements

- Node.js **22.12+** and npm 10+
- Docker Desktop (PostgreSQL; optional full-stack containers)
- Python **3.11+** (vision service) and a webcam on the kiosk PC
- Chrome or Edge for the kiosk

Check your machine: `npm run verify`

## Installation

```bash
git clone <repo> gesture-coffee-shop && cd gesture-coffee-shop
cp .env.example .env          # then edit secrets (JWT_SECRET, passwords)
npm install                   # installs all workspaces and builds shared types
npm run setup:vision          # creates services/vision/.venv and installs Python deps
```

### Environment setup

All components read the single root `.env` (see [.env.example](.env.example) — every
variable is documented there). Generate a JWT secret:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### Database setup

```bash
npm run db:up        # PostgreSQL in Docker (host port 5440) + test database
npm run db:deploy    # apply migrations
npm run db:seed      # categories, 17 products, options, users, kiosk, demo sales history
```

Schema and design notes: [docs/database.md](docs/database.md).

## Running (development)

```bash
npm run dev            # backend + kiosk + admin + kitchen together
npm run dev:vision     # vision service with the real webcam (separate terminal)
```

Or individually: `npm run dev:backend`, `npm run dev:kiosk`, `npm run dev:admin`,
`npm run dev:kitchen`.

**No webcam?** Open the kiosk in mouse/demo mode: http://localhost:3000/?mode=mouse
(or press **Ctrl + Shift + M**). The kiosk also works with the keyboard
(arrows, Enter, Esc). To exercise gesture mode without a camera run the **gesture
simulator** instead of the vision service: `npm run dev:vision:sim` and inject events
(see [docs/gesture-system.md](docs/gesture-system.md#simulator)).

## Running with Docker

```bash
docker compose up -d --build                     # postgres, backend, kiosk, admin, kitchen
docker compose --profile vision up -d --build    # + vision service (Linux host with /dev/video0)
```

The backend container applies migrations and (by default) seeds on start. On Windows
or macOS kiosks run the vision service natively — containers cannot reach the webcam.
See [docs/deployment.md](docs/deployment.md).

## Testing

```bash
npm test               # backend (Vitest + real Postgres), kiosk & kitchen unit/component tests
npm run test:vision    # Pytest: pinch, smoothing, mapping, classification, API
npm run test:e2e       # Playwright: mouse, keyboard, gesture (simulator), kitchen flows
npm run typecheck && npm run lint
```

Stop the real vision service before `test:e2e` (the simulator uses port 8765).
Full strategy and the manual test checklist: [docs/testing.md](docs/testing.md).

## Windows kiosk

`scripts/windows/start-kiosk.ps1` starts the vision service, the kiosk app and Edge/Chrome
in full-screen kiosk mode, with a watchdog. `install-autostart.ps1` runs it at sign-in.
See [docs/kiosk.md](docs/kiosk.md).

## Troubleshooting

Camera not detected, cursor jittery, pinch not registering, port conflicts, Prisma
errors on Windows… → [docs/troubleshooting.md](docs/troubleshooting.md).

## Production deployment

Build (`npm run build`), set `NODE_ENV=production`, `COOKIE_SECURE=true` behind HTTPS,
strong secrets, rotate seed passwords, schedule `npm run db:backup`.
Checklist: [docs/deployment.md](docs/deployment.md).

## Documentation

| | |
|---|---|
| [architecture.md](docs/architecture.md) | Components, data flow, responsibilities |
| [database.md](docs/database.md) | Models, constraints, order numbers, snapshots |
| [api.md](docs/api.md) | REST endpoints, WebSocket events, error format |
| [gesture-system.md](docs/gesture-system.md) | Vision pipeline, gestures, safety rules, tuning, simulator |
| [payments.md](docs/payments.md) | Pay-first QR flow, payment providers, smile discount & its security |
| [kiosk.md](docs/kiosk.md) | Screens, input modes, sessions, Windows kiosk setup |
| [deployment.md](docs/deployment.md) | Docker, production, security, backups |
| [testing.md](docs/testing.md) | Test suites and manual QA checklist |
| [troubleshooting.md](docs/troubleshooting.md) | Common problems and fixes |
