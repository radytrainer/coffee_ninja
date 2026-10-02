# Testing

| Suite | Command | What it covers |
|---|---|---|
| Backend | `npm test -w backend` | Vitest + Supertest against a real PostgreSQL test database (`gesture_coffee_test`, migrated automatically, truncated + re-seeded per file) |
| Vision | `npm run test:vision` | Pytest with synthetic hand landmarks — no camera needed |
| Kiosk | `npm test -w kiosk` | cart & price logic, gesture safety controller, spatial keyboard navigation, components (hold-to-confirm, stepper, status) |
| Kitchen | `npm test -w kitchen` | real-time board reducer, columns, next actions, urgency |
| E2E | `npm run test:e2e` | Playwright against the running stack + gesture simulator, 1920×1080 and 1280×720 |
| Static | `npm run typecheck && npm run lint` | TypeScript strict + ESLint (Next core-web-vitals, React Compiler rules) |

## Backend

- **Auth:** login, httpOnly/SameSite cookie, case-insensitive email, identical errors for
  unknown email vs wrong password, bcrypt storage, Bearer tokens, tampered / expired /
  wrong-secret tokens, logout revocation, deactivation revokes sessions.
- **Authorization:** staff vs admin on every protected resource; last-admin & self protection.
- **Catalog:** CRUD, validation (prices, ids, ranges), conflicts, partial updates keep
  omitted fields, inactive categories hidden.
- **Orders:** server-side pricing (client prices ignored/rejected), latest DB prices,
  sequential numbers, option rules, unavailable products, disabled kiosks, **transaction
  rollback** (a DB trigger fails the last insert — no rows remain), status transitions,
  audit history.
- **Integration:** real HTTP + Socket.IO server: order → DB → kitchen socket in real time →
  status changes → customer socket; anonymous/forged sockets cannot join the kitchen.
- **Admin/reports:** timezone-correct daily sales incl. empty days, cancelled orders
  excluded, top products, categories, inventory adjustments, kiosk & settings validation.

## Vision

Pinch debounce, hysteresis, cooldown, one-click-per-pinch, confidence gating; smoothing
(formula, jitter reduction, convergence, adaptive lag); coordinate mapping (default region,
homography corners, monotonic, degenerate rejection); pose classification (point, open palm,
thumbs up, fist; scale/position invariance); hold detection; engine events (lookback click
position, hand loss reset, live reconfiguration); camera failures (never raises, disconnect
detection, restart/select); API + WebSocket (origin check, validation, persistence).

## E2E

- `customer-mouse.spec.ts` — full order, dynamic price, remove/undo, server total, single
  click does not order, hold confirms, persisted in DB; reload keeps cart; no horizontal
  overflow (both resolutions).
- `keyboard.spec.ts` — arrows / Enter / Esc.
- `gesture.spec.ts` — hover never clicks, too-fast pinch ignored with hint, empty-space
  pinch hint, full order by gestures incl. open palm back and pinch-and-hold, thumbs-up
  confirm, camera failure screen and recovery.
- `kitchen.spec.ts` — staff login, order appears without refresh, Accept/Start/Ready/
  Complete, customer screen updates live.

Before running E2E: `npm run db:up`, migrations + seed applied, and the **real vision
service stopped** (the simulator takes port 8765). Servers are started automatically if
not already running. Report: `apps/kiosk/playwright-report`.

## Manual test checklist (real camera)

1. `npm run dev` + `npm run dev:vision`; open http://localhost:3000 in Chrome, full screen.
2. Stand ~1 m from the camera, raise your hand → "Hand detected", cursor appears.
3. Move the index finger: cursor follows smoothly; lower `CURSOR_SMOOTHING` if it lags.
4. Rest on START → ring fills, button glows; pinch → menu. Pinch on empty space → hint.
5. Choose a category, a product, options (price updates), quantity; add to cart.
6. Hold an open palm ~1 s → goes back. Cart → edit → update; remove → undo.
7. Checkout: single pinch on "Hold to place order" does nothing; pinch and hold → order
   number. Try a thumbs-up on another order.
8. Kitchen (http://localhost:3020, barista account): new order chimes; Accept → Start →
   Ready → Complete; the kiosk status updates.
9. Walk away from the menu for 60 s → "Are you still there?" → reset.
10. Unplug the camera → camera-required screen; plug back in → recovers within seconds.
11. `/calibration`: calibrate the four corners; cursor reaches every edge comfortably.
12. Admin (http://localhost:3010): edit a price → kiosk shows it after the next session;
    make a product unavailable → "Sold out"; reports show today's orders.
