# API

Base URL: `http://localhost:4000/api`. JSON everywhere.

## Conventions

Success:

```json
{ "success": true, "data": { … } }
```

Error (never contains stack traces, SQL or secrets):

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "price: Invalid product price: must be greater than zero",
    "details": [{ "path": "price", "message": "Invalid product price: must be greater than zero" }]
  }
}
```

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | invalid body / params / query / JSON |
| 401 | `UNAUTHORIZED` | no/invalid/expired/revoked session |
| 403 | `FORBIDDEN` | wrong role, disabled kiosk |
| 404 | `NOT_FOUND` | unknown id or route |
| 409 | `CONFLICT` / `INVALID_STATUS_TRANSITION` | duplicates, referenced records, illegal status change |
| 422 | `PRODUCT_UNAVAILABLE` / `INVALID_OPTIONS` | cart no longer valid |
| 429 | `RATE_LIMITED` | too many requests |
| 500 | `INTERNAL_ERROR` | unexpected (logged server-side) |

**Auth:** `POST /auth/login` sets an httpOnly `gcs_session` cookie (send requests with
`credentials: 'include'`). The token is also returned for `Authorization: Bearer <token>`.

Roles: 🌐 public · 👩‍🍳 staff or admin · 🔑 admin.

## Authentication

| Method | Path | | Body / notes |
|---|---|---|---|
| POST | `/auth/login` | 🌐 | `{ email, password }` → `{ user, token, expiresIn }` (rate limited) |
| POST | `/auth/logout` | 🌐 | clears cookie, revokes all of the user's tokens |
| GET | `/auth/me` | 👩‍🍳 | current user |

## Catalog

| Method | Path | | Notes |
|---|---|---|---|
| GET | `/categories` | 🌐 | active only; `?all=true` (admin) includes inactive |
| GET | `/categories/:id` | 🌐 | |
| POST / PUT / DELETE | `/categories[/:id]` | 🔑 | `{ name, description?, image?, sortOrder?, active? }`; delete refuses if products exist (409) |
| GET | `/products` | 🌐 | `?categoryId=&available=&featured=&search=&all=` — includes option groups + options |
| GET | `/products/:id` | 🌐 | |
| POST / PUT / DELETE | `/products[/:id]` | 🔑 | `{ name, description?, price, image?, categoryId, available?, featured?, sortOrder?, optionGroupIds? }` — price > 0, ≤ 2 decimals |
| GET | `/option-groups[/:id]` | 🌐 | |
| POST / PUT / DELETE | `/option-groups[/:id]` | 🔑 | `{ name, selectionType, required, minSelect, maxSelect, options? }` |
| POST | `/option-groups/:id/options` | 🔑 | `{ name, priceDelta, isDefault?, available? }` |
| PUT / DELETE | `/options/:id` | 🔑 | |

## Orders

| Method | Path | | Notes |
|---|---|---|---|
| POST | `/orders/quote` | 🌐 | same body as create; returns server-calculated lines and totals, creates nothing |
| POST | `/orders` | 🌐 | `{ items: [{ productId, quantity, optionIds, notes? }], kioskCode? }` — **no prices accepted** (extra top-level fields → 400) |
| GET | `/orders/:id` | 🌐/👩‍🍳 | order; staff also get `statusHistory` |
| GET | `/orders/:id/status` | 🌐 | public status `{ orderNumber, status, message, total }` |
| GET | `/orders/:id/payment` | 🌐 | QR payment `{ status, amount, qrSvg, qrPayload, expiresAt }` — see [payments.md](payments.md) |
| POST | `/orders/:id/cancel` | 🌐 | cancel an unpaid order (`PENDING_PAYMENT` only) |
| GET | `/orders` | 👩‍🍳 | `?status=NEW,READY&from=&to=&search=A1025&page=&pageSize=` |
| PATCH | `/orders/:id/status` | 👩‍🍳 | `{ status, note? }` — allowed transitions only |

Status machine: `NEW → ACCEPTED → PREPARING → READY → COMPLETED`; `NEW` may skip to
`PREPARING`; `NEW/ACCEPTED/PREPARING → CANCELLED`. Every change is recorded in history.

Price calculation: `unit = product.price + Σ option.priceDelta`, `line = unit × quantity`,
`tax = round(subtotal × taxRate)` — all in integer cents.

## Kiosk

| GET | `/kiosk/config?code=KIOSK-01` | 🌐 | shop settings + kiosk config; also updates `lastSeenAt` (heartbeat) |

## Admin

| Method | Path | | Notes |
|---|---|---|---|
| GET/POST/PUT/DELETE | `/users[/:id]` | 🔑 | staff management; password ≥ 8 chars with letter + digit; cannot delete/demote yourself or the last admin |
| GET/POST/PUT/DELETE | `/inventory[/:id]` | 🔑 | |
| POST | `/inventory/:id/adjust` | 🔑 | `{ delta }` — atomic, never below zero |
| GET/POST/PUT/DELETE | `/kiosks[/:id]` | 🔑 | `inputMode`, timeouts, `hoverDelayMs`, `active` |
| GET / PUT | `/settings` | 🔑 | `shopName, currency, taxRate (0–0.5), orderNumberPrefix, timezone` |
| GET | `/reports/dashboard` | 🔑 | today's orders/revenue + live status counts |
| GET | `/reports/sales` | 🔑 | `?from=YYYY-MM-DD&to=YYYY-MM-DD` (shop-local dates, default 14 days) — one row per day |
| GET | `/reports/products` | 🔑 | top products `?from&to&limit` (default 30 days) |
| GET | `/reports/orders` | 🔑 | by status, by category, average order value |

Revenue always excludes cancelled orders. Ranges > 366 days are rejected.

## Other

| GET | `/health` | 🌐 | `{ status, database, uptimeSeconds }` (503 if DB down) |
| GET | `/static/products/*.svg` | 🌐 | product artwork |

## Socket.IO (same origin as the API)

| Event (server → client) | Room | Payload |
|---|---|---|
| `order:created` | `kitchen` | `OrderDTO` |
| `order:updated` | `kitchen` | `OrderDTO` |
| `order:status` | `order:<id>` | `PublicOrderStatusDTO` |

| Event (client → server) | Payload |
|---|---|
| `order:subscribe` / `order:unsubscribe` | order id |

Staff sockets join `kitchen` automatically when the handshake carries a valid session
cookie (`withCredentials: true`) or `auth: { token }`.

## Vision service (local, port 8765)

| | Path | |
|---|---|---|
| GET | `/health`, `/status` | liveness; camera, fps, calibration, tuning |
| GET/PUT | `/config` | gesture tuning (validated, persisted) |
| GET/POST/DELETE | `/calibration` | 4-point calibration |
| GET | `/camera/devices` · POST `/camera/select` `{index}` · POST `/camera/restart` | |
| GET | `/debug/frame.jpg` | one annotated snapshot (disable: `VISION_DEBUG_ENDPOINTS=false`) |
| WS | `/ws/gesture` | event stream — see [gesture-system.md](gesture-system.md) |
