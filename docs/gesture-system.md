# Gesture system

## Gestures

| Gesture | How | Meaning on the kiosk |
|---|---|---|
| **Point** | index finger extended | moves the virtual cursor (landmark 8, index fingertip) |
| **Pinch** | thumb tip (4) touches index tip (8) | click the button under the cursor |
| **Pinch & hold** | keep the pinch closed | "press" — used by *Hold to place order* |
| **Open palm (still)** | all five fingers spread, held still ~1 s | back / cancel (or "I'm still here" in the inactivity dialog) |
| **Close eyes** | close both eyes, keep them closed ~0.6 s (normal blinks, winks and faces that arrive with eyes already closed are ignored) | back — hands-free alternative to the open palm |
| **Smile** | big smile held ~0.8 s (checkout only) | smile discount — signed token, see [payments.md](payments.md) |
| **Thumbs up** | fist with thumb up, held ~0.9 s | confirm (checkout, welcome screen) |
| **✌️ Two fingers** | index + middle up (ring & pinky curled), move the hand up/down | scroll the list under the cursor — content follows the hand, glides on release |
| **✋ Open palm, moved sideways** | open hand moved left/right (anywhere on the menu screen) | browse the product slideshow — next / previous card. A palm that moved is never "back" |
| **✌️ Two fingers, sideways** | same pose over the menu, move the hand left/right | also moves the slideshow |

## Event protocol (`ws://localhost:8765/ws/gesture`)

```json
{"type":"cursor","x":0.52,"y":0.38,"rawX":0.49,"rawY":0.41,"handDetected":true,
 "pointing":true,"pinching":false,"pinchStrength":0.12,"timestamp":1790000000000}
{"type":"gesture","gesture":"pinch","confidence":0.94,"x":0.52,"y":0.38,"timestamp":…}
{"type":"gesture","gesture":"open_palm","confidence":0.88,"timestamp":…}
{"type":"scroll","phase":"move","dx":0.0,"dy":-0.021,"x":0.5,"y":0.6,"timestamp":…}   // phase: start | move | end
{"type":"swipe","phase":"move","dx":-0.012,"x":0.52,"y":0.6,"timestamp":…}              // ✋ palm sideways; phase: start | move | end
{"type":"hand","handDetected":false,"timestamp":…}
{"type":"status","camera":"running","message":null,"fps":29.8,"calibrated":true,"timestamp":…}
```

Cursor events also carry `scrolling` / `swiping` flags; while either is set the kiosk
disables hover and clicks. `x/y` are normalized **screen** coordinates (after calibration); `rawX/rawY` are camera
coordinates (used by calibration). A status heartbeat is sent every second. The TypeScript
contract lives in `packages/types/src/gestures.ts`.

## Pipeline (vision service)

| Stage | Module | Details |
|---|---|---|
| Camera | `camera/camera_manager.py` | DirectShow on Windows / V4L2 on Linux; mirrored; buffer size 1 (freshest frame); after 15 failed reads → `unavailable`; the pipeline retries every 2 s so unplug/replug recovers automatically |
| Landmarks | `hand_tracking/hand_tracker.py` | MediaPipe Tasks `HandLandmarker`, VIDEO mode, up to 2 hands (the cursor stays on the customer's hand; other hands are ignored); model auto-downloaded to `models/` on first run |
| Geometry | `gestures/geometry.py` | distances in aspect-corrected space; normalized by hand size (wrist → middle MCP) so gestures work near and far from the camera |
| Poses | `gestures/classifier.py` | finger-extension scores → point / ✌️ two fingers / open palm / thumbs up / fist + confidence |
| Pinch | `gestures/pinch.py` | hysteresis, debounce, cooldown (below) |
| Holds | `gestures/hold.py` | pose must be held continuously; fires once; must be released before firing again; tolerates 1–2 dropped frames |
| Smoothing | `gestures/smoothing.py` | adaptive EMA (below) |
| Mapping | `gestures/calibration.py` | active-region default or 4-point homography |
| Engine | `gestures/engine.py` | combines everything, emits events |

CV work runs in a background thread; the asyncio server only moves small JSON messages.

## Safety rules (why nothing is clicked by accident)

1. **Hover ≠ click.** Entering a button only highlights it (`data-gesture-hover`).
2. **Hover delay.** A pinch only activates a button after the cursor has rested on it for
   `HOVER_DELAY` (default 250 ms; per kiosk in Admin → Settings). The cursor shows a
   progress ring; the button glows brighter when armed.
3. **Stable click position.** Closing the fingers drags the fingertip toward the thumb. The
   click uses the cursor position from `pinch_lookback_ms` (120 ms) *before* the pinch
   closed, and while a pinch is held the cursor follows the pinch midpoint.
4. **Pinch debounce + hysteresis.** Start below `PINCH_THRESHOLD` (0.33 × hand size) for
   `pinch_min_frames` (2) consecutive frames; release only above
   `PINCH_RELEASE_THRESHOLD` (0.48). One pinch = one click, never repeated while held.
5. **Cooldowns.** `PINCH_COOLDOWN` (450 ms) in the vision service and a 650 ms selection
   cooldown in the kiosk (cursor turns grey = DISABLED).
6. **Confidence.** Detections below `GESTURE_CONFIDENCE` (0.6) are ignored.
7. **Held gestures.** Back/confirm require holding the pose (`OPEN_PALM_HOLD_MS`,
   `THUMBS_UP_HOLD_MS`, `EYES_CLOSED_HOLD_MS`) plus a 1.5 s cooldown between actions (shared, so
   palm + eyes never go back twice); never while pinching or scrolling.
9. **Close-eyes back.** `gestures/face.py` reads only the MediaPipe FaceLandmarker eye-blink
   scores (`models/face_landmarker.task`, downloaded on first run). Both eyes must score ≥ 0.5
   for `EYES_CLOSED_HOLD_MS`; the eyes must be seen open first and must reopen before it can
   fire again. No face image or identity data is kept. Toggle on the calibration screen
   (*Close-eyes back* → Off) or disable entirely with `FACE_GESTURES=false`.
8. **Deliberate confirmation.** Orders require *pinch-and-hold* for 1.2 s (or a held
   thumbs-up). A single pinch or click on the confirm button does nothing.

Invalid gestures get subtle feedback: a red wobble on the cursor plus a hint toast
("Point at a button, then pinch", "Hold still on the button for a moment, then pinch").

## Scroll and slideshow (✌️ / ✋)

- The pose must be held `scroll_activation_ms` (150 ms) before it starts; brief
  classification dropouts (≤ 2 frames) don't end it. Pinch clicks and back/confirm are
  disabled meanwhile, and a hand that is still pinched afterwards must open before it can
  click again. Scroll events carry both `dx` and `dy` (One-Euro filtered).
- **✋ Palm swipe** (`gestures/palm_swipe.py`): the palm centre (wrist + knuckles — steady
  even while fingers flex) is One-Euro filtered. Once it has travelled 0.035 screen widths
  sideways within the last 0.3 s (more sideways than vertical — raising the hand into view
  first doesn't count) a swipe starts, including the travel so far, so there is no jump.
  **One sweep = one move:** when the hand turns around by 0.04, the swipe ends there and
  the return stroke is ignored for 0.7 s, so the natural "wipe and bring the hand back"
  motion doesn't drag the cards back. A hand sweep moves on after 30 % of a card. Moving more than 0.03 from where the palm appeared cancels "back" for
  that palm; "back" needs a still palm. Up to 2 misclassified frames (motion blur) are
  tolerated (5 once swiping); closing the hand or lowering it ends the swipe.
- **Menu slideshow:** products are shown one big card at a time, with neighbours peeking
  at the sides. ✋ palm swipes (anywhere on screen) and ✌️ over the slideshow drag the cards sideways
  (`SWIPE_GAIN` 1.6 × screen width). Hand updates only set a target: the cards ease toward
  it every animation frame (60 ms time constant), so they glide at the screen's frame rate
  instead of stepping at the camera's 15–30 fps. On release they snap to the nearest card; a quick
  flick always moves one card, and the first/last card resist being pulled past
  (`apps/kiosk/lib/carousel.ts`). The ◀ ▶ arrows (pinch), pinching a peeking neighbour,
  and mouse/touch drag also work. The cursor shows a ⇆ badge while swiping.
- **Lists everywhere else** (cart, options, category list): ✌️ scrolls the area under
  the cursor vertically with a 2.2× gain, eased per frame, plus inertia.
- Other hands in view (the customer's second hand, or someone behind them) are ignored;
  the cursor stays on the hand that was already driving it.

## Smoothing

```
smoothed = previous × s + current × (1 − s)
```

`s = CURSOR_SMOOTHING` (default 0.55). To avoid lag, `s` is reduced automatically as the
finger moves faster (down to 25 % of the setting at ~1.5 screen-widths/s). The kiosk adds a
light per-frame interpolation so the 30 fps stream renders as a fluid 60 fps cursor.

## Calibration

Default mapping stretches the central region of the camera (18 % horizontal / 15 %
vertical margins) to the full screen, so customers don't have to reach the frame edges.

The calibration screen (`/calibration`, "Calibrate" link on the welcome screen) asks the
user to point at four corner targets; each is captured when the fingertip holds still for
1.2 s (Space captures immediately). The service fits a perspective transform
(homography) and saves it with the tuning values to `services/vision/calibration.json`
on the kiosk PC. Degenerate or tiny capture areas are rejected.

The same screen tunes smoothing, pinch sensitivity and back-gesture hold time live, and
toggles sound feedback.

## Configuration (.env)

| Variable | Default | |
|---|---|---|
| `CAMERA_INDEX` / `CAMERA_WIDTH` / `CAMERA_HEIGHT` / `CAMERA_FPS` / `CAMERA_MIRROR` | 0 / 640 / 480 / 30 / true | |
| `CURSOR_SMOOTHING` | 0.55 | 0 = raw … 0.95 = very smooth |
| `PINCH_THRESHOLD` / `PINCH_RELEASE_THRESHOLD` | 0.33 / 0.48 | release must be larger (hysteresis) |
| `PINCH_COOLDOWN` | 450 | ms |
| `GESTURE_CONFIDENCE` | 0.6 | |
| `OPEN_PALM_HOLD_MS` / `THUMBS_UP_HOLD_MS` | 1000 / 900 | ms |
| `EYES_CLOSED_HOLD_MS` | 600 | ms both eyes closed → back |
| `FACE_GESTURES` | true | false = don't load the face model at all |
| `HOVER_DELAY` | 250 | ms (kiosk: `NEXT_PUBLIC_HOVER_DELAY` or per-kiosk admin setting) |
| `VISION_ALLOWED_ORIGINS` | http://localhost:3000 | browser origins allowed to open the WebSocket |

Live-tunable via `PUT /config` (persisted): `scroll_activation_ms` (150), plus the
pinch/smoothing/hold values above.

## Simulator

`npm run dev:vision:sim` starts a camera-less drop-in replacement on the same port. Inject
events with HTTP:

```bash
curl -X POST localhost:8765/simulate/hand    -H "Content-Type: application/json" -d '{"detected":true}'
curl -X POST localhost:8765/simulate/cursor  -H "Content-Type: application/json" -d '{"x":0.5,"y":0.8}'
curl -X POST localhost:8765/simulate/gesture -H "Content-Type: application/json" -d '{"gesture":"pinch","x":0.5,"y":0.8}'
curl -X POST localhost:8765/simulate/camera  -H "Content-Type: application/json" -d '{"status":"unavailable"}'
curl -X POST localhost:8765/simulate/scroll  -H "Content-Type: application/json" -d '{"phase":"move","dy":-0.05}'
curl -X POST localhost:8765/simulate/scroll  -H "Content-Type: application/json" -d '{"phase":"move","dx":-0.03}'   # swipe
```

The Playwright gesture tests (`apps/kiosk/e2e/gesture.spec.ts`) drive the kiosk this way.
