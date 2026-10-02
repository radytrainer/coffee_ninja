# Payment (QR or cash) & smile discount

## Pay first, then prepare

```
Kiosk: "Hold to pay"  ──►  Order PENDING_PAYMENT + Payment PENDING   (QR on screen, countdown)
                                  │
     phone scans QR, pays  ───────┤──►  Payment PAID, Order NEW  ──►  kitchen display (real time)
     customer picks cash ─────────┤──►  "Pay at the counter" + order number; counter sees it under
                                  │     "Awaiting cash" → staff press Cash received → Order NEW
     customer cancels (back) ─────┤──►  Payment CANCELLED, Order CANCELLED
     no payment in time ──────────┘──►  Payment EXPIRED,   Order CANCELLED   ("Nothing was charged")
```

- **The kitchen never sees unpaid orders.** They are excluded from the board, from
  Socket.IO `order:created`, and from revenue in reports and the dashboard.
- **Cart stays until paid.** Cancelling on the payment screen (open palm, close eyes, or
  *Cancel*) returns to checkout with the cart intact.
- **Timeout:** `PAYMENT_TIMEOUT_SECONDS` (default 300). The API cancels expired orders
  every 15 s and before every payment read or confirmation, so a late payment is refused.
- **Cash at the counter:** the payment screen offers **Pay with cash at the counter**. The
  kiosk shows the order number and the amount due, then resets for the next customer. The
  kitchen display chimes and lists the order in an **Awaiting cash payment** strip, not in
  the make queue. The barista takes the money and presses **Cash received**, the order
  moves to *New*, and the customer's screen (if still open) switches to "Paid ✓". Cash
  orders get `CASH_PAYMENT_TIMEOUT_SECONDS` (default 900 = 15 min) before they are cancelled.
  Turn off with Admin → Settings → *Also accept cash*.
- **Admin:** Admin → Orders → an *UNPAID* order → **Mark paid (cash)** does the same.
  The payment is recorded as `cash`.
- **Turn off:** Admin → Settings → uncheck *Pay by QR before preparing* ("pay at the
  counter"). Orders then go straight to the kitchen.

### Providers

`backend/src/services/payment.service.ts` defines a small `PaymentProvider` interface:
`createCharge({ reference, amount, currency, description }) → { qrPayload }`.

| Provider | QR contains | Confirms via |
|---|---|---|
| `demo` (default) | `PAYMENT_PUBLIC_URL/pay/<reference>` — a test page with a **Pay** button | the page's form POST |
| `cash` | — (no QR) | staff *Cash received* (kitchen) / *Mark paid (cash)* (admin) |

⚠️ **`demo` moves no money.** Anyone who opens the link can mark the order paid. It is
for testing and demos only; the API logs a warning when it runs in production.

A real bank QR (e.g. KHQR / Bakong) plugs in as another provider. `createCharge`
returns the bank's QR string, and the bank's callback or status check calls
`confirmPayment(reference)`.

**Demo on a phone:** the phone must reach the API. Set
`PAYMENT_PUBLIC_URL=http://<kiosk-PC-LAN-IP>:4000` (auto-detected when the API runs
outside Docker), keep the phone on the same Wi-Fi, and allow inbound port 4000 in
Windows Firewall.

## Smile discount (5 %)

At checkout, the kiosk offers *"Smile for 5% off!"* while the camera is active.

1. The vision service reads MediaPipe's `mouthSmileLeft/Right` blendshape scores.
   Both corners must be ≥ 0.5 for `smile_hold_ms` (800 ms). The face must be relaxed
   first, and it fires once per smile.
2. It emits `{"type":"smile","token":…}`. The token is
   `v1.<nonce>.<issuedAtMs>.<HMAC-SHA256>`, signed with `SMILE_TOKEN_SECRET`.
3. The kiosk re-quotes with the token. The API verifies the signature and age
   (`SMILE_TOKEN_MAX_AGE_SECONDS`, default 600) and shows the discount.
4. On *Hold to pay*, the API redeems the token. `Order.smileNonce` is unique, so a
   smile can't be reused. The discount comes off the subtotal **before tax**, and
   the QR charges the discounted total.

**Why a signed token?** The order API is public (kiosks don't log in). Without a
signature, anyone could post "I smiled" and get the discount. The secret lives only in
the vision service and the API (both read the root `.env`).

- A forged, expired or reused token is rejected with `422 SMILE_DISCOUNT_INVALID`. The
  kiosk says so and lets the customer smile again. It never charges a different total
  from the one shown.
- A big laughing smile squints the eyes, so **close-eyes → back is ignored while
  smiling**.
- Rate: Admin → Settings → *Smile discount (%)* (0 = off). With no `SMILE_TOKEN_SECRET`
  the offer is hidden.
- Privacy: only two smile scores and two blink scores are used per frame. No face
  images or identity data are stored or sent.

## API

| Method | Path | Who | |
|---|---|---|---|
| POST | `/api/orders/quote` | 🌐 | `{ items, smileToken? }` → `{ subtotal, discount, discountReason, tax, total, smileDiscountRate, smileApplied }` |
| POST | `/api/orders` | 🌐 | `{ items, kioskCode?, smileToken? }` → order (`PENDING_PAYMENT` when payment is required) |
| GET | `/api/orders/:id/payment` | 🌐 | `{ status, amount, currency, qrSvg, qrPayload, expiresAt, paidAt, provider }` |
| POST | `/api/orders/:id/payment/cash` | 🌐 | pay cash at the counter instead (403 if the shop doesn't accept cash) |
| POST | `/api/orders/:id/cancel` | 🌐 | cancel an **unpaid** order (409 once paid) |
| PATCH | `/api/orders/:id/status` | 👩‍🍳 | `PENDING_PAYMENT → NEW` = mark paid (cash); `→ CANCELLED` = void |
| GET/POST | `/pay/:reference` | 🌐 | demo pay page (HTML, no JS) |

Simulator: `POST /simulate/smile {"progress": 0.5}` fills the meter; `{"progress": 1}`
also issues a signed token (needs `SMILE_TOKEN_SECRET`).
