# Architecture

## Components

| Component | Path | Responsibility | Talks to |
|---|---|---|---|
| Vision service | `services/vision` | Webcam → hand landmarks → gesture events. **No business logic.** | Kiosk (WebSocket, HTTP) |
| Kiosk | `apps/kiosk` | Customer UI; turns gesture events into UI interaction; cart; checkout | Vision (WS), Backend (REST, Socket.IO) |
| Backend | `backend` | Auth, catalog, pricing, orders, status, reports, real-time fan-out | PostgreSQL, all frontends |
| Kitchen display | `apps/kitchen` | Staff order board | Backend (REST, Socket.IO) |
| Admin | `apps/admin` | Menu, options, staff, inventory, kiosks, settings, reports | Backend (REST, Socket.IO) |
| Shared types | `packages/types` | DTOs, status rules, event contracts shared by all TS code | — |

## Layering (the rule the code follows)

```
COMPUTER VISION   services/vision/{camera,hand_tracking}
      ↓
GESTURE EVENTS    services/vision/gestures  →  {"type":"cursor"|"gesture"|"hand"|"status"}
      ↓
UI INTERACTION    apps/kiosk/components/gesture (GestureLayer, VirtualCursor, SelectionController)
      ↓
BUSINESS LOGIC    apps/kiosk/lib/cart.ts (estimates)  ·  backend/src/services (authoritative)
      ↓
REST API          backend/src/routes → controllers → services
      ↓
DATABASE          PostgreSQL via Prisma (parameterized queries only)
```

- The vision service only emits *what the hand did*. The kiosk decides what that means
  on each screen (e.g. open palm = "back" on the menu, "keep session" in a dialog).
- The kiosk sends **product ids, option ids and quantities** — never prices. The backend
  loads current prices and rules from the database, validates options (required groups,
  max selections, availability) and computes totals in integer cents.
- Order creation is one database transaction (order number, items, option snapshots,
  totals, first status-history row). Any failure rolls everything back.

## Real-time

Socket.IO on the backend:

| Room | Who joins | Receives |
|---|---|---|
| `kitchen` | Authenticated staff/admin sockets (session cookie checked on connect) | `order:created`, `order:updated` (full order) |
| `order:<id>` | Anyone holding the (unguessable) order id — the kiosk success screen | `order:status` (public status only) |

The kiosk also polls the status endpoint every 10 s as a fallback; the kitchen re-syncs on
every reconnect.

## Gesture event path (per camera frame, ~30 fps)

1. `CameraManager.read()` — mirrored BGR frame (auto-reconnect if unplugged).
2. `HandTracker.process()` — MediaPipe HandLandmarker (VIDEO mode) → 21 landmarks.
3. `GestureEngine.update()` — pose classification, pinch hysteresis/debounce/cooldown,
   adaptive smoothing, calibration mapping, hold detection → events.
4. `Broadcaster` — bounded per-client queues; stale cursor events may be dropped, gesture
   events never are.
5. Kiosk `VisionProvider` → `GestureLayer` → hit-testing, hover timer, activation rules.

Frames never leave the vision process (a single annotated debug snapshot endpoint exists
for troubleshooting and can be disabled with `VISION_DEBUG_ENDPOINTS=false`).

## Security model

- Customers are anonymous; staff/admin authenticate with email + password (bcrypt).
- Sessions: HS256 JWT in an **httpOnly, SameSite=Lax** cookie (Bearer also accepted).
  Each user has a `sessionVersion`; logout, password change, role change and
  deactivation increment it and revoke every issued token immediately.
- Role-based authorization on every non-public route (`requireStaff`, `requireAdmin`).
- Zod validation of body, params and query; consistent error envelope; no stack traces
  or SQL in responses; secrets redacted from logs.
- Helmet headers, CORS allow-list, rate limits (login, order creation, global).
