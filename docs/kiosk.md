# Kiosk

## Screens

| Route | Screen |
|---|---|
| `/` | Welcome — hand detection status, START, help; camera-required panel if the camera is unavailable |
| `/menu` | Category rail (Popular + categories) and product cards (image, name, description, price, availability) |
| `/product/:id` | Product details + customization (options with prices, live price, quantity, add/update) |
| `/cart` | Lines with options, quantity ±, edit, remove (with undo), subtotal/tax/total, checkout |
| `/checkout` | Order confirmation — **server-calculated** totals, hold-to-confirm |
| `/order/:id` | Order confirmed (#A1025), live status tracker, auto-reset countdown |
| `/help` | Point → Pinch → Order tutorial |
| `/calibration` | Staff: corner calibration, sensitivity, sound |
| error / not-found | friendly error screens with "Start over" |

Every screen has loading, error, empty and disabled states.
Layout is fluid (root font scales with the viewport) and verified at **1920×1080** and
**1280×720**; content that doesn't fit scrolls with large gesture-friendly page buttons.

## Input modes

| Mode | Use | How to select |
|---|---|---|
| `GESTURE` | production kiosk | default (`NEXT_PUBLIC_INPUT_MODE=gesture`) or per kiosk in Admin → Settings |
| `MOUSE` | development / demo / touch screens | `?mode=mouse`, **Ctrl+Shift+M**, "Use touch / mouse" on the camera screen, or per kiosk |

**Camera off → automatic mouse/touch fallback.** If a gesture kiosk's camera or vision
service is unavailable for 3 s, the kiosk switches itself to mouse/touch: the pointer is
shown, START and every button work normally, and a notice ("Camera off — using mouse /
touch") offers *Try again*. The vision connection keeps retrying; when the camera is back,
gesture mode resumes automatically. Nothing is saved — it is a temporary fallback.

**Mouse any time.** Even with the camera working, moving a real mouse reveals the pointer
and hover highlights (hidden again after 4 s idle), so staff can always use a mouse.

The keyboard always works: **arrows** move focus spatially, **Enter** selects,
**Esc** goes back. In gesture mode customers scroll lists with a ✌️ two-finger gesture and
browse the menu slideshow by moving an open hand ✋ left/right (see
[gesture-system.md](gesture-system.md#scroll-and-slideshow---)). Mouse and touch also work in gesture mode.

## Sessions

- The cart is kept in memory and `sessionStorage` (survives an accidental reload).
- After an order: cart and customer state are cleared immediately; the success screen
  returns to Welcome after `successResetSeconds` (default 20 s) or on "Start new order".
- Inactivity: after `sessionTimeoutSeconds` (default 60 s) without pointer, key or hand
  movement, an "Are you still there?" dialog counts down 10 s, then resets. Not applied on
  the welcome, order-status and calibration screens.
- Both timeouts are configured per kiosk in Admin → Settings (fetched at start-up and every
  minute; the fetch also reports the kiosk as online).

## Windows kiosk setup

1. Install Node.js 22, Python 3.11+, Git, Edge or Chrome. Plug in the webcam (above or
   below the screen, facing the customer, ~0.5–1.5 m reach).
2. Clone the repo, `cp .env.example .env`, point `NEXT_PUBLIC_API_URL` at the shop server
   (or run everything on this PC), then:
   ```powershell
   npm install
   npm run setup:vision
   npm run build -w kiosk
   ```
3. Test manually: `powershell -ExecutionPolicy Bypass -File scripts\windows\start-kiosk.ps1`
   - starts the vision service (hidden), the kiosk server (production build) and the browser
     in full-screen kiosk mode with `--autoplay-policy=no-user-gesture-required` (sounds),
     pinch-zoom and swipe navigation disabled;
   - a watchdog restarts anything that exits; logs go to `logs/`.
   - `-Browser chrome`, `-KioskUrl http://shop-server:3000 -SkipKioskApp` (kiosk UI served
     by another machine; the vision service must still run locally).
4. Auto-start at sign-in: `powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1`
   (remove with `uninstall-autostart.ps1`). Configure Windows to sign the kiosk user in
   automatically, disable sleep/screen saver, and hide notifications (Focus Assist).
5. Open `/calibration` once (with the camera in its final position) and calibrate.

To exit kiosk mode for maintenance: **Alt+F4** (browser relaunches after 10 s — stop the
scheduled task first: `Stop-ScheduledTask GestureCoffeeKiosk`).
