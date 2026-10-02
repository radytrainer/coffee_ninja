import type { Locator, Page } from '@playwright/test';

export const API = 'http://localhost:4000/api';
export const SIM = 'http://127.0.0.1:8765';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sim(path: string, body: unknown) {
  const res = await fetch(SIM + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 404)
    throw new Error(
      'Gesture simulator not running on :8765 (stop the real vision service and run: npm run dev:vision:sim)',
    );
  return res;
}

export async function simulatorAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${SIM}/simulate/hand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"detected":false}',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Waits until the kiosk page has opened its WebSocket to the simulator. */
export async function waitForKioskConnection(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = (await (await fetch(`${SIM}/status`)).json()) as { clients: number };
    if (status.clients > 0) return;
    await sleep(200);
  }
  throw new Error('kiosk did not connect to the gesture simulator');
}

/** Moves the simulated fingertip onto an element and rests there (hover delay). */
export async function pointAt(page: Page, target: Locator, restMs = 450) {
  const box = await target.boundingBox();
  if (!box) throw new Error('target not visible');
  const vp = page.viewportSize()!;
  const x = (box.x + box.width / 2) / vp.width;
  const y = (box.y + box.height / 2) / vp.height;
  for (let t = 0; t < restMs; t += 50) {
    await sim('/simulate/cursor', { x, y });
    await sleep(50);
  }
  return { x, y };
}

export async function pinch(page: Page, target: Locator) {
  const p = await pointAt(page, target);
  await sim('/simulate/gesture', { gesture: 'pinch', ...p });
  await sleep(700); // selection cooldown
}

/**
 * Brings a product to the front of the menu slideshow (pressing "Next product"
 * by gesture pinch or mouse) and returns its card. Only the front card is
 * exposed to assistive tech, so the card is "visible" once it's in front.
 */
export async function showProduct(page: Page, name: string, via: 'gesture' | 'mouse') {
  const card = page.getByRole('button', { name: new RegExp(`^${name},`) });
  const next = page.getByRole('button', { name: 'Next product' });
  for (let i = 0; i < 15 && !(await card.isVisible()); i++) {
    if (via === 'gesture') await pinch(page, next);
    else await next.click();
    await sleep(500); // slide animation
  }
  return card;
}

/**
 * Pays the order shown on the kiosk's QR payment screen, like a customer's phone
 * would: opens the link encoded in the QR and confirms (demo payment provider).
 */
export async function payShownOrder(page: Page): Promise<string> {
  await page.waitForURL(/\/pay\/[a-z0-9]+/);
  const orderId = page.url().split('/pay/')[1]!.split('?')[0]!;
  const payment = (
    (await (await fetch(`${API}/orders/${orderId}/payment`)).json()) as {
      data: { qrPayload: string };
    }
  ).data;
  await payByQr(payment.qrPayload);
  return orderId;
}

/** Confirms a demo QR payment by its link (host swapped for this machine's API). */
export async function payByQr(qrPayload: string) {
  const reference = qrPayload.split('/pay/')[1]!;
  const res = await fetch(`${API.replace(/\/api$/, '')}/pay/${reference}`, {
    method: 'POST',
    redirect: 'manual',
  });
  if (res.status !== 303) throw new Error(`demo payment failed: ${res.status}`);
}

/** Holds a press (mouse) on the hold-to-confirm button. */
export async function holdButton(page: Page, target: Locator, ms = 1500) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(ms);
  await page.mouse.up();
}
