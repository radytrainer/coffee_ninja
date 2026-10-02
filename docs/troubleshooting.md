# Troubleshooting

## Camera / gestures

| Symptom | Fix |
|---|---|
| Kiosk shows "Camera off — using mouse / touch" | The kiosk still works with mouse/touch (automatic fallback). To restore gestures: is the vision service running? `curl localhost:8765/status`. Check `camera` and `message`. Another app (Teams, Zoom, browser tab) may hold the camera — close it, then press TRY AGAIN. |
| Kiosk shows "Camera too dark" / gestures ignored, very low FPS | The camera image is nearly black: lens covered, privacy shutter or laptop lid closed, or the room is dark. Webcams drop to 1–10 fps in the dark. Uncover the camera and add light in front of the customer (not behind). Check `http://localhost:8765/debug/frame.jpg`; `/status` shows `lowLight`. |
| `Camera 0 could not be opened` | Wrong device: `curl localhost:8765/camera/devices`, then set `CAMERA_INDEX` or `POST /camera/select {"index":1}`. On Windows allow desktop apps to use the camera (Settings → Privacy → Camera). |
| Camera opens but no hand detected | Improve lighting (face a window/lamp, avoid strong backlight); keep the hand 0.5–1.5 m away, palm facing the camera. View `http://localhost:8765/debug/frame.jpg` to see what the camera sees and the detected landmarks. |
| Low FPS (≈15) | Webcams halve their frame rate in dim light — add light. Close CPU-heavy apps. Lower `CAMERA_WIDTH/HEIGHT` to 640×480. |
| Cursor jittery | Increase smoothing (calibration screen or `CURSOR_SMOOTHING=0.65`). |
| Cursor laggy | Decrease smoothing (0.4). |
| Can't reach screen edges / cursor too sensitive | Calibrate (`/calibration`). Reset with "Reset to default" if a bad calibration was saved. |
| Pinch not registering | Increase pinch sensitivity (calibration screen) or `PINCH_THRESHOLD=0.38`. Make sure you rest on the button first — the ring must fill before a pinch counts. |
| Accidental clicks | Increase the hover delay (Admin → Settings → kiosk "Hover delay") and/or lower pinch sensitivity. |
| Closing eyes goes "back" by accident / never | Adjust *Close-eyes back* on the calibration screen (longer hold, or Off). Needs the face visible and reasonably lit; glasses with strong glare can hide the eyes. `FACE_GESTURES=false` removes the feature. |
| Open palm triggers "back" too easily | Increase "Back gesture hold" on the calibration screen (`OPEN_PALM_HOLD_MS`). |
| `Hand-tracking model is missing` | First run downloads `hand_landmarker.task` from Google storage. Offline? Copy the file into `services/vision/models/`. |
| WebSocket closes immediately (code 1008) | The browser origin is not in `VISION_ALLOWED_ORIGINS`. |
| No sounds on the kiosk | Browsers block audio until a user click — launch the browser with `--autoplay-policy=no-user-gesture-required` (the Windows script does). Sound can be toggled on the calibration screen. |

## Payment & smile discount

| Symptom | Fix |
|---|---|
| Phone can't open the page from the QR | The phone must reach the API: same Wi-Fi, `PAYMENT_PUBLIC_URL=http://<PC-LAN-IP>:4000` in `.env` (then `docker compose up -d backend`), and allow inbound TCP 4000 in Windows Firewall. The API logs the pay-page address at start. |
| Paid but the kiosk still waits | The kiosk gets the update over Socket.IO, with a 10 s poll as fallback. Check the order in Admin → Orders. *Mark paid (cash)* releases it manually. |
| Orders never reach the kitchen | They wait for payment (status *UNPAID*). Pay, mark paid in Admin, or turn off *Pay by QR before preparing* in Admin → Settings. |
| No "Smile for 5% off" at checkout | Needs gesture mode with the camera running, a rate > 0 in Admin → Settings, and the same `SMILE_TOKEN_SECRET` in `.env` for the API and the vision service. Restart both after changing it. |
| "Your smile discount has expired" | Tokens last 10 min (`SMILE_TOKEN_MAX_AGE_SECONDS`) and work once. Smile again, or hold to pay without the discount. |

## Backend / database

| Symptom | Fix |
|---|---|
| `Invalid environment configuration` at start | A required variable is missing (message lists which). `cp .env.example .env`. `JWT_SECRET` must be ≥ 32 characters. |
| `Can't reach database server` | `npm run db:up`; check `docker ps` and the port in `DATABASE_URL` (default 5440). |
| Port already allocated (5432/5433/3001…) | Another program uses it. This project uses 5440/4000/3000/3010/3020/8765; change `POSTGRES_PORT` / ports in `.env` and `package.json` scripts if needed. |
| `EPERM … query_engine-windows.dll.node` during `prisma generate` | Windows locks the Prisma engine while the API is running. Stop `npm run dev` / the backend, then re-run. |
| Backend tests fail with `TEST_DATABASE_URL must be set` | Add it to `.env` (see `.env.example`). The test DB is created by the Postgres init script; for an existing volume run `docker exec gesture-coffee-shop-postgres-1 createdb -U coffee gesture_coffee_test`. |
| Browser requests blocked by CORS | Add the exact origin (scheme + host + port) to `CORS_ORIGINS` and restart the API. |
| Logged in but API returns 401 | Session revoked (logout elsewhere, password/role change) or expired (`JWT_EXPIRES_IN`) — sign in again. Cross-domain deployments need HTTPS + `COOKIE_SECURE=true` and sites on the same registrable domain. |
| `429 RATE_LIMITED` on login | 10 failed attempts per 15 min per IP — wait, or restart the API in development. |

## Frontends

| Symptom | Fix |
|---|---|
| Kiosk shows "Menu unavailable" | API unreachable from the browser: check `NEXT_PUBLIC_API_URL` (baked in at build time — rebuild after changing) and the API health. |
| Kitchen doesn't update live ("Reconnecting…") | Socket.IO blocked by a proxy — allow WebSocket upgrade on `/socket.io/`. The board resyncs automatically on reconnect. |
| Admin charts empty | No orders in the selected range; seed demo data with `SEED_DEMO_ORDERS=true npm run db:seed` on an empty order table. |
| Stuck in mouse mode | The mode override is saved in the browser: open `/?mode=gesture` or press Ctrl+Shift+M. |
