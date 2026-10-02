import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../config/logger';
import { confirmPayment, getPaymentByReference } from '../services/payment.service';
import { getShopSettings } from '../services/settings.service';
import { AppError } from '../utils/errors';
import { decimalToNumber } from '../utils/money';

/**
 * Demo payment page — what the kiosk QR code opens on the customer's phone when
 * PAYMENT_PROVIDER=demo. Plain server-rendered HTML (no JS) so it works on any phone.
 * It moves no real money: a real bank provider replaces this with its own app/QR.
 */
export const payRouter = Router();

// Own CSP: inline styles only, form posts to itself, and no upgrade-insecure-requests
// (the page is served over plain HTTP on the shop LAN; upgrading would break the form).
payRouter.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
  next();
});

const referenceParams = z.object({ reference: z.string().regex(/^[a-f0-9]{32}$/) });

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; --bg:#faf5ef; --card:#fff; --fg:#2b1b12; --muted:#7a6557; --brand:#c77d2e; --good:#1f9d6a; --bad:#c2410c; }
  @media (prefers-color-scheme: dark) { :root { --bg:#1b120c; --card:#2a1d15; --fg:#f7ecdd; --muted:#c9b39f; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:16px; background:var(--bg); color:var(--fg);
         font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
  main { width:100%; max-width:420px; background:var(--card); border-radius:20px; padding:28px 22px; box-shadow:0 10px 40px rgba(0,0,0,.12); text-align:center; }
  h1 { margin:0 0 4px; font-size:1.2rem; } .muted { color:var(--muted); margin:0; }
  .amount { font-size:2.6rem; font-weight:700; margin:18px 0 6px; font-variant-numeric:tabular-nums; }
  ul { list-style:none; padding:0; margin:14px 0 0; color:var(--muted); font-size:.95rem; }
  button { margin-top:22px; width:100%; min-height:56px; border:0; border-radius:14px; background:var(--brand); color:#fff; font-size:1.15rem; font-weight:700; cursor:pointer; }
  .badge { display:inline-block; margin-top:18px; padding:8px 16px; border-radius:999px; font-weight:700; }
  .ok { background:rgba(31,157,106,.15); color:var(--good); } .no { background:rgba(194,65,12,.12); color:var(--bad); }
  .demo { margin-top:18px; font-size:.8rem; color:var(--muted); }
</style></head><body><main>${body}
<p class="demo">Demo payment — no real money is charged.</p></main></body></html>`;
}

async function render(req: Request, res: Response, notice?: string) {
  const parsed = referenceParams.safeParse(req.params);
  const payment = parsed.success ? await getPaymentByReference(parsed.data.reference) : null;
  if (!payment) {
    res
      .status(404)
      .type('html')
      .send(
        page(
          'Payment not found',
          '<h1>Payment not found</h1><p class="muted">Please scan the QR code on the kiosk again.</p>',
        ),
      );
    return;
  }
  const shop = await getShopSettings();
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: payment.currency,
  }).format(decimalToNumber(payment.amount));
  const items = payment.order.items
    .map((i) => `<li>${i.quantity} × ${esc(i.productName)}</li>`)
    .join('');
  const header = `<h1>${esc(shop.shopName)}</h1><p class="muted">Order #${esc(payment.order.orderNumber)}</p>
    <div class="amount">${esc(amount)}</div><ul>${items}</ul>`;

  let action: string;
  if (payment.status === 'PAID') {
    action = '<div class="badge ok">✓ Paid — your order is being prepared</div>';
  } else if (payment.status === 'PENDING') {
    action = `<form method="post"><button type="submit">Pay ${esc(amount)}</button></form>`;
  } else {
    action =
      '<div class="badge no">This payment request has expired</div><p class="muted" style="margin-top:10px">Please order again at the kiosk.</p>';
  }
  res
    .status(200)
    .type('html')
    .send(
      page(
        `Pay ${amount}`,
        `${header}${notice ? `<p class="muted">${esc(notice)}</p>` : ''}${action}`,
      ),
    );
}

payRouter.get('/:reference', (req, res) => render(req, res));

payRouter.post('/:reference', async (req, res) => {
  const parsed = referenceParams.safeParse(req.params);
  if (parsed.success) {
    try {
      await confirmPayment(parsed.data.reference);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      logger.info({ code: error.code }, 'demo payment not confirmed');
    }
  }
  // Post/Redirect/Get: refreshing the result page never re-submits the payment.
  res.redirect(303, req.originalUrl);
});
