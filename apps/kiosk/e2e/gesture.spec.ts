import { expect, test } from '@playwright/test';
import {
  API,
  payShownOrder,
  pinch,
  pointAt,
  showProduct,
  sim,
  simulatorAvailable,
  sleep,
  waitForKioskConnection,
} from './helpers';

/** Drives the kiosk exclusively with simulated vision events (no mouse clicks). */
test.describe('gesture control (via the gesture simulator)', () => {
  test.beforeAll(async () => {
    test.skip(!(await simulatorAvailable()), 'gesture simulator not running on :8765');
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/?mode=gesture');
    await waitForKioskConnection();
    // Re-send until this page (not a previous test's closing page) has received it.
    await expect
      .poll(
        async () => {
          await sim('/simulate/camera', { status: 'running' });
          await sim('/simulate/hand', { detected: true });
          await sim('/simulate/cursor', { x: 0.5, y: 0.2 });
          return page.getByText('Hand detected').isVisible();
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  });

  test('hover highlights but never clicks; pinch selects', async ({ page }) => {
    const start = page.getByRole('button', { name: /START/ });
    await pointAt(page, start, 1200);
    await expect(start).toHaveAttribute('data-gesture-hover', 'true');
    await expect(page).not.toHaveURL(/\/menu/);
    await pinch(page, start);
    await expect(page).toHaveURL(/\/menu$/);
  });

  test('a pinch before the hover delay is ignored with feedback', async ({ page }) => {
    const start = page.getByRole('button', { name: /START/ });
    const box = (await start.boundingBox())!;
    const vp = page.viewportSize()!;
    const p = { x: (box.x + box.width / 2) / vp.width, y: (box.y + box.height / 2) / vp.height };
    await sim('/simulate/cursor', p);
    await sim('/simulate/gesture', { gesture: 'pinch', ...p });
    await expect(page.getByText('Hold still on the button')).toBeVisible();
    await expect(page).not.toHaveURL(/\/menu/);
  });

  test('pinching empty space shows a hint', async ({ page }) => {
    await sim('/simulate/cursor', { x: 0.05, y: 0.5 });
    await sleep(400);
    await sim('/simulate/gesture', { gesture: 'pinch', x: 0.05, y: 0.5 });
    await expect(page.getByText('Point at a button')).toBeVisible();
  });

  test('full order by gestures, including pinch-and-hold confirmation', async ({ page }) => {
    await pinch(page, page.getByRole('button', { name: /START/ }));
    await pinch(page, page.getByRole('button', { name: /^Latte,/ }));
    await pinch(page, page.getByRole('button', { name: /Add to cart/ }));
    await expect(page).toHaveURL(/\/menu$/);

    // Open palm = back to the welcome screen.
    await sim('/simulate/gesture', { gesture: 'open_palm' });
    await expect(page.getByRole('button', { name: /START/ })).toBeVisible();

    // Closing both eyes is the hands-free alternative for back.
    await pinch(page, page.getByRole('button', { name: /START/ }));
    await expect(page).toHaveURL(/\/menu$/);
    await sim('/simulate/gesture', { gesture: 'eyes_closed' });
    await expect(page.getByRole('button', { name: /START/ })).toBeVisible();

    await pinch(page, page.getByRole('button', { name: /START/ }));
    await pinch(page, page.getByRole('button', { name: /View order/ }));
    await pinch(page, page.getByRole('button', { name: /Checkout/ }));
    const hold = page.getByRole('button', { name: /Hold to pay/ });
    await expect(hold).toBeVisible();

    // One pinch is not enough.
    await pinch(page, hold);
    await expect(page).toHaveURL(/\/checkout$/);

    const p = await pointAt(page, hold, 400);
    for (let t = 0; t < 1600; t += 50) {
      await sim('/simulate/cursor', { ...p, pinching: true });
      await sleep(50);
    }
    await sim('/simulate/cursor', { ...p, pinching: false });
    await expect(page.getByTestId('payment-qr')).toBeVisible();
    await payShownOrder(page);
    await expect(page.getByText('Order confirmed')).toBeVisible();
  });

  test('thumbs up confirms on the checkout screen', async ({ page }) => {
    await pinch(page, page.getByRole('button', { name: /START/ }));
    await pinch(page, await showProduct(page, 'Cappuccino', 'gesture'));
    await pinch(page, page.getByRole('button', { name: /Add to cart/ }));
    await page.goto('/checkout?mode=gesture');
    await expect(page.getByText('Order summary')).toBeVisible();
    await sim('/simulate/gesture', { gesture: 'thumbs_up' });
    await payShownOrder(page);
    await expect(page.getByText('Order confirmed')).toBeVisible();
  });

  test('smiling at checkout takes 5% off, and the QR charges the discounted total', async ({
    page,
  }) => {
    await pinch(page, page.getByRole('button', { name: /START/ }));
    await pinch(page, await showProduct(page, 'Cappuccino', 'gesture'));
    await pinch(page, page.getByRole('button', { name: /Add to cart/ }));
    await page.goto('/checkout?mode=gesture');
    await expect(page.getByTestId('smile-offer')).toBeVisible();
    await expect(page.getByTestId('smile-offer')).toContainText('Smile for 5% off');

    // A partial smile only fills the meter.
    await sim('/simulate/smile', { progress: 0.5 });
    await expect(page.getByRole('progressbar', { name: 'Smile detected' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    await expect(page.getByTestId('discount-row')).toHaveCount(0);

    // Held smile → signed token → server-side discount.
    await sim('/simulate/smile', { progress: 1 });
    await expect(page.getByTestId('smile-applied')).toBeVisible();
    await expect(page.getByTestId('discount-row')).toBeVisible();

    await sim('/simulate/gesture', { gesture: 'thumbs_up' });
    await expect(page.getByTestId('payment-qr')).toBeVisible();
    const id = page.url().split('/pay/')[1]!.split('?')[0]!;
    const order = (
      (await (await fetch(`${API}/orders/${id}`)).json()) as {
        data: { discount: number; subtotal: number; total: number };
      }
    ).data;
    expect(order.discount).toBe(Math.round(Math.round(order.subtotal * 100) * 0.05) / 100); // cents, half-up
    const payment = (
      (await (await fetch(`${API}/orders/${id}/payment`)).json()) as { data: { amount: number } }
    ).data;
    expect(payment.amount).toBe(order.total);
    await payShownOrder(page);
    await expect(page.getByText('Order confirmed')).toBeVisible();
  });

  test('backing out of the QR payment cancels the unpaid order and keeps the cart', async ({
    page,
  }) => {
    await pinch(page, page.getByRole('button', { name: /START/ }));
    await pinch(page, page.getByRole('button', { name: /^Latte,/ }));
    await pinch(page, page.getByRole('button', { name: /Add to cart/ }));
    await page.goto('/checkout?mode=gesture');
    await expect(page.getByText('Order summary')).toBeVisible();
    await sim('/simulate/gesture', { gesture: 'thumbs_up' });
    await expect(page.getByTestId('payment-qr')).toBeVisible();
    const id = page.url().split('/pay/')[1]!.split('?')[0]!;

    await sim('/simulate/gesture', { gesture: 'open_palm' });
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByText('Order summary')).toBeVisible(); // cart kept for another try
    const status = (
      (await (await fetch(`${API}/orders/${id}/status`)).json()) as { data: { status: string } }
    ).data;
    expect(status.status).toBe('CANCELLED');
  });

  test('camera off → kiosk falls back to mouse/touch; camera back → gestures resume', async ({
    page,
  }) => {
    await sim('/simulate/camera', {
      status: 'unavailable',
      message: 'Camera 0 could not be opened',
    });
    await expect(page.getByText('Camera unavailable — use the mouse or touch screen')).toBeVisible({
      timeout: 8000,
    });
    await expect(page.locator('html')).toHaveAttribute('data-input-mode', 'mouse');
    // The OS pointer is visible again and a real mouse click works.
    expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).not.toBe('none');
    await expect(page.getByText('Tap START to begin your order')).toBeVisible();

    await sim('/simulate/camera', { status: 'running' });
    await expect(page.getByText('Camera unavailable — use the mouse or touch screen')).toBeHidden({
      timeout: 8000,
    });
    await expect(page.locator('html')).toHaveAttribute('data-input-mode', 'gesture');
  });

  test('ordering works with the mouse while the camera is off', async ({ page }) => {
    await sim('/simulate/camera', { status: 'unavailable' });
    await expect(page.locator('html')).toHaveAttribute('data-input-mode', 'mouse', {
      timeout: 8000,
    });
    await page.getByRole('button', { name: /START/ }).click();
    await expect(page).toHaveURL(/\/menu$/);
    await expect(page.getByText('Camera off · mouse')).toBeVisible();
    await page.getByRole('button', { name: /^Latte,/ }).click();
    await expect(page.locator('#product-name')).toHaveText('Latte');
    await sim('/simulate/camera', { status: 'running' });
  });

  test('a dark camera image shows a "too dark" hint instead of silently ignoring the hand', async ({
    page,
  }) => {
    await sim('/simulate/hand', { detected: false }); // nothing seen — the camera is dark
    await sim('/simulate/camera', { status: 'running', lowLight: true });
    await expect(page.getByText('Camera too dark — add light or uncover the camera')).toBeVisible();
    await sim('/simulate/camera', { status: 'running', lowLight: false });
    await expect(page.getByText('Camera too dark')).toBeHidden();
  });

  test('a real mouse can be used at any time, even with the camera working', async ({ page }) => {
    const hidden = () => page.evaluate(() => getComputedStyle(document.body).cursor === 'none');
    expect(await hidden()).toBe(true); // gesture mode: only the virtual cursor
    await page.mouse.move(200, 200);
    await page.mouse.move(400, 300);
    await expect.poll(hidden).toBe(false);
    await page.getByRole('button', { name: /START/ }).click();
    await expect(page).toHaveURL(/\/menu$/);
  });

  test('✋ open hand left / right moves the product slideshow; a still palm still goes back', async ({
    page,
  }) => {
    await pinch(page, page.getByRole('button', { name: /START/ }));
    const latte = page.getByRole('button', { name: /^Latte,/ });
    const cappuccino = page.getByRole('button', { name: /^Cappuccino,/ });
    await expect(latte).toBeVisible();
    await expect(page.getByText('Move your open hand left or right')).toBeVisible();

    const palmSwipe = async (dx: number) => {
      await sim('/simulate/cursor', { x: 0.5, y: 0.5, swiping: true });
      await sim('/simulate/swipe', { phase: 'start' });
      for (let i = 1; i <= 8; i++) {
        await sim('/simulate/swipe', { phase: 'move', dx });
        await sleep(33);
      }
      await sim('/simulate/swipe', { phase: 'end' });
      await sim('/simulate/cursor', { x: 0.5, y: 0.5, swiping: false });
    };

    await palmSwipe(-0.025); // hand moves left → next card slides in
    await expect(cappuccino).toBeVisible();
    await expect(latte).toBeHidden();
    await expect(page).toHaveURL(/\/menu$/); // no click while swiping

    await palmSwipe(0.025); // hand moves right → back to the first card
    await expect(latte).toBeVisible();

    // ✌️ over the slideshow works too.
    const box = (await page.getByTestId('product-carousel').boundingBox())!;
    const vp = page.viewportSize()!;
    const at = { x: (box.x + box.width / 2) / vp.width, y: (box.y + box.height / 2) / vp.height };
    await sim('/simulate/scroll', { phase: 'start', ...at });
    for (let i = 1; i <= 6; i++) {
      await sim('/simulate/scroll', { phase: 'move', dx: -0.03, dy: 0, ...at });
      await sleep(40);
    }
    await sim('/simulate/scroll', { phase: 'end', ...at });
    await expect(cappuccino).toBeVisible();

    // A still open palm is still "back".
    await sim('/simulate/gesture', { gesture: 'open_palm' });
    await expect(page.getByRole('button', { name: /START/ })).toBeVisible();
  });
});
