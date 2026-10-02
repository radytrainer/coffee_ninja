import { expect, test } from '@playwright/test';
import { API, payByQr } from './helpers';

interface Product {
  id: string;
  name: string;
  optionGroups: { required: boolean; options: { id: string; isDefault: boolean }[] }[];
}

async function placeOrder() {
  const products = ((await (await fetch(`${API}/products`)).json()) as { data: Product[] }).data;
  const mocha = products.find((p) => p.name === 'Mocha')!;
  const optionIds = mocha.optionGroups
    .filter((g) => g.required)
    .map((g) => (g.options.find((o) => o.isDefault) ?? g.options[0]!).id);
  const res = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kioskCode: 'KIOSK-01',
      items: [{ productId: mocha.id, quantity: 1, optionIds }],
    }),
  });
  return ((await res.json()) as { data: { id: string; orderNumber: string } }).data;
}

test('staff: receive → accept → prepare → ready → complete; customer sees each status', async ({
  browser,
}) => {
  const kitchen = await browser.newPage();
  await kitchen.goto('http://localhost:3020/');
  await expect(kitchen).toHaveURL(/\/login$/);
  await kitchen.fill('#email', 'barista@pnccoffee.local');
  await kitchen.fill('#password', 'Staff@12345');
  await kitchen.click('button[type=submit]');
  await expect(kitchen.getByText('Live')).toBeVisible();

  const order = await placeOrder();
  const card = kitchen.getByRole('article', { name: new RegExp(`Order ${order.orderNumber}`) });
  // Unpaid orders never reach the kitchen…
  await kitchen.waitForTimeout(1000);
  await expect(card).toHaveCount(0);
  // …they arrive in real time the moment the QR payment is confirmed.
  const payment = (
    (await (await fetch(`${API}/orders/${order.id}/payment`)).json()) as {
      data: { qrPayload: string };
    }
  ).data;
  await payByQr(payment.qrPayload);
  await expect(card).toBeVisible(); // no refresh

  const customer = await browser.newPage();
  await customer.goto(`/order/${order.id}?mode=mouse`);
  await expect(customer.getByText('Order confirmed')).toBeVisible();

  for (const [action, message] of [
    ['Accept', 'Order accepted by our baristas'],
    ['Start', 'Preparing your order...'],
    ['Ready', 'Your order is ready for pickup!'],
  ] as const) {
    await card.getByRole('button', { name: new RegExp(`^${action}$`, 'i') }).click();
    await expect(customer.getByText(message)).toBeVisible();
  }
  await card.getByRole('button', { name: /^Complete$/i }).click();
  await expect(card).toBeHidden();
  await expect(customer.getByText('Order completed. Enjoy!')).toBeVisible();
});

test('cash at the counter: customer picks cash → counter takes the money → order goes to New', async ({
  browser,
}) => {
  const kitchen = await browser.newPage();
  await kitchen.goto('http://localhost:3020/');
  await expect(kitchen).toHaveURL(/\/login$/);
  await kitchen.fill('#email', 'barista@pnccoffee.local');
  await kitchen.fill('#password', 'Staff@12345');
  await kitchen.click('button[type=submit]');
  await expect(kitchen.getByText('Live')).toBeVisible();

  // Customer checks out at the kiosk and chooses cash on the payment screen.
  const order = await placeOrder();
  const customer = await browser.newPage();
  await customer.goto(`/pay/${order.id}?mode=mouse`);
  await customer.getByRole('button', { name: /Pay with cash at the counter/ }).click();
  await expect(customer.getByTestId('cash-pending')).toBeVisible();
  await expect(customer.getByLabel(`Order number ${order.orderNumber}`)).toBeVisible();

  // The counter sees who is coming to pay — not yet in the make queue.
  const cashCard = kitchen.getByRole('article', {
    name: `Order ${order.orderNumber}, awaiting cash`,
  });
  await expect(cashCard).toBeVisible();
  await expect(
    kitchen.getByRole('article', { name: new RegExp(`Order ${order.orderNumber}, new`) }),
  ).toHaveCount(0);

  await cashCard.getByRole('button', { name: /Cash received/ }).click();
  await expect(cashCard).toBeHidden();
  await expect(
    kitchen.getByRole('article', { name: new RegExp(`Order ${order.orderNumber}, new`) }),
  ).toBeVisible();

  // The customer's screen switches to "Order confirmed · Paid" live.
  await expect(customer.getByText('Order confirmed')).toBeVisible();
  await expect(customer.getByText('Paid ✓')).toBeVisible();
  const status = (
    (await (await fetch(`${API}/orders/${order.id}`)).json()) as {
      data: { status: string; payment: { provider: string } };
    }
  ).data;
  expect(status).toMatchObject({ status: 'NEW', payment: { provider: 'cash' } });
});
