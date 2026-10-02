import { expect, test } from '@playwright/test';
import { API, holdButton, payShownOrder } from './helpers';

test.describe('customer ordering with mouse (demo mode)', () => {
  test('welcome → menu → customize → cart → checkout → order number', async ({ page }) => {
    await page.goto('/?mode=mouse');
    await page.getByRole('button', { name: /START/ }).click();
    await expect(page).toHaveURL(/\/menu$/);

    await page.getByRole('button', { name: /^Latte,/ }).click();
    await expect(page.locator('#product-name')).toHaveText('Latte');

    // Dynamic price: 2.50 + Large 1.00 + Oat 0.50 + Vanilla 0.30 = 4.30
    await page.getByRole('radio', { name: /Large/ }).click();
    await page.getByRole('radio', { name: /Oat Milk/ }).click();
    await page.getByRole('radio', { name: /^2$/ }).click();
    await page.getByRole('checkbox', { name: /Vanilla/ }).click();
    await expect(page.getByText('$4.30', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Increase quantity' }).click();
    await expect(page.getByText('$8.60', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Add to cart/ }).click();

    await expect(page).toHaveURL(/\/menu$/);
    await page.getByRole('button', { name: /View order/ }).click();
    await expect(page.getByText('Large • Oat Milk • Sugar 2', { exact: false })).toBeVisible();

    // Remove + undo keeps the item.
    await page.getByRole('button', { name: /Remove/ }).click();
    await expect(page.getByText('Your cart is empty')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('heading', { name: 'Latte', exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Checkout/ }).click();
    await expect(page.getByText('Order summary')).toBeVisible();
    // Server-calculated total: 8.60 + 10% = 9.46
    await expect(page.getByText('$9.46').first()).toBeVisible();

    // A single click must NOT place the order.
    const hold = page.getByRole('button', { name: /Hold to pay/ });
    await hold.click();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/checkout$/);

    await holdButton(page, hold);

    // Pay first: the QR payment screen, and the order is not in the kitchen yet.
    await expect(page.getByTestId('payment-qr')).toBeVisible();
    await expect(page.getByTestId('payment-amount')).toHaveText('$9.46');
    const pendingId = page.url().split('/pay/')[1]!.split('?')[0]!;
    expect((await (await fetch(`${API}/orders/${pendingId}/status`)).json()).data.status).toBe(
      'PENDING_PAYMENT',
    );

    await payShownOrder(page);
    await expect(page.getByText('Order confirmed')).toBeVisible();
    await expect(page.getByLabel(/Order number A\d+/)).toBeVisible();
    await expect(page.getByText('Paid ✓')).toBeVisible();

    // Order persisted with server price, released to the kitchen after payment.
    const id = page.url().split('/').pop()!.split('?')[0]!;
    const res = await (await fetch(`${API}/orders/${id}/status`)).json();
    expect(res.data).toMatchObject({ status: 'NEW', total: 9.46 });
  });

  test('the cart survives a page reload and "Start new order" resets the session', async ({
    page,
  }) => {
    await page.goto('/menu?mode=mouse');
    await page.getByRole('button', { name: /Bakery/ }).click();
    await page.getByRole('button', { name: /^Croissant,/ }).click();
    await page.getByRole('button', { name: /Add to cart/ }).click();
    await expect(page).toHaveURL(/\/menu$/);
    await expect(page.getByRole('button', { name: /View order/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /View order/ })).toContainText('1 item');
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page.getByRole('button', { name: /START/ })).toBeVisible();
  });

  test('menu slideshow: one product at a time, arrows and mouse drag', async ({ page }) => {
    await page.goto('/menu?mode=mouse');
    const latte = page.getByRole('button', { name: /^Latte,/ });
    const cappuccino = page.getByRole('button', { name: /^Cappuccino,/ });
    await expect(latte).toBeVisible();
    await expect(cappuccino).toBeHidden(); // only the front card is a product choice
    await expect(page.getByRole('button', { name: 'Previous product' })).toBeDisabled();

    await page.getByRole('button', { name: 'Next product' }).click();
    await expect(cappuccino).toBeVisible();

    // Drag right with the mouse → previous card (and the drag is not a click).
    const box = (await page.getByTestId('product-carousel').boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, y, { steps: 8 });
    await page.mouse.move(box.x + box.width * 0.75, y, { steps: 8 });
    await page.mouse.up();
    await expect(latte).toBeVisible();
    await expect(page).toHaveURL(/\/menu/);
  });

  test('no horizontal overflow on the menu', async ({ page }) => {
    await page.goto('/menu?mode=mouse');
    await expect(page.getByRole('button', { name: /^Latte,/ })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});
