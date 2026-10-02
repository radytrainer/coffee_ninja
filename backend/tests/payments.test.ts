import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { expireStalePayments } from '../src/services/payment.service';
import { signSmileToken, verifySmileToken } from '../src/services/smileToken';
import {
  ADMIN,
  STAFF,
  app,
  getProductByName,
  loginAs,
  optionId,
  payOrder,
  prisma,
  resetDatabase,
} from './helpers';

let adminCookie = '';
let staffCookie = '';

const smile = (issuedAt = Date.now(), secret = env.SMILE_TOKEN_SECRET!) =>
  signSmileToken(secret, randomBytes(16).toString('hex'), issuedAt);

async function croissantItems() {
  const croissant = await getProductByName('Croissant');
  return [
    { productId: croissant.id, quantity: 1, optionIds: [optionId(croissant, 'Serving', 'Warmed')] },
  ];
}

async function placeOrder(extra: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/orders')
    .send({ items: await croissantItems(), ...extra });
  return res;
}

beforeAll(async () => {
  await resetDatabase();
  adminCookie = await loginAs(ADMIN);
  staffCookie = await loginAs(STAFF);
});

beforeEach(async () => {
  await request(app)
    .put('/api/settings')
    .set('Cookie', adminCookie)
    .send({ requirePayment: true, allowCashPayment: true, smileDiscountRate: 0.05 });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('smile tokens', () => {
  it('accepts a fresh token signed with the shared secret only', () => {
    const now = Date.now();
    expect(verifySmileToken(smile(now), env.SMILE_TOKEN_SECRET, 600_000, now)).not.toBeNull();
    expect(
      verifySmileToken(
        smile(now, 'another-secret-that-is-long-enough-000000'),
        env.SMILE_TOKEN_SECRET,
        600_000,
        now,
      ),
    ).toBeNull();
    expect(verifySmileToken(smile(now - 700_000), env.SMILE_TOKEN_SECRET, 600_000, now)).toBeNull(); // expired
    expect(verifySmileToken(smile(now + 600_000), env.SMILE_TOKEN_SECRET, 600_000, now)).toBeNull(); // from the future
    expect(verifySmileToken('v1.smile.please', env.SMILE_TOKEN_SECRET, 600_000, now)).toBeNull();
    expect(verifySmileToken(smile(now), undefined, 600_000, now)).toBeNull(); // feature off without a secret
  });
});

describe('smile discount', () => {
  it('quotes 5 % off the subtotal, with tax on the discounted amount', async () => {
    const items = await croissantItems();
    const plain = await request(app).post('/api/orders/quote').send({ items });
    expect(plain.body.data).toMatchObject({
      subtotal: 1.8,
      discount: 0,
      smileDiscountRate: 0.05,
      smileApplied: false,
    });

    const smiled = await request(app)
      .post('/api/orders/quote')
      .send({ items, smileToken: smile() });
    // 1.80 − 0.09 = 1.71; tax 10 % = 0.17; total 1.88
    expect(smiled.body.data).toMatchObject({
      subtotal: 1.8,
      discount: 0.09,
      tax: 0.17,
      total: 1.88,
      smileApplied: true,
      discountReason: 'Smile discount',
    });
  });

  it('applies the discount to the order and never lets a smile be used twice', async () => {
    const token = smile();
    const first = await placeOrder({ smileToken: token });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      discount: 0.09,
      total: 1.88,
      discountReason: 'Smile discount',
    });
    const payment = await request(app).get(`/api/orders/${first.body.data.id}/payment`);
    expect(payment.body.data.amount).toBe(1.88); // the QR charges the discounted total

    const reused = await placeOrder({ smileToken: token });
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe('SMILE_DISCOUNT_INVALID');
  });

  it('rejects forged or expired smile tokens instead of charging a different total', async () => {
    const forged = await placeOrder({
      smileToken: smile(Date.now(), 'attacker-secret-that-is-long-enough-00000'),
    });
    expect(forged.status).toBe(422);
    const expired = await placeOrder({ smileToken: smile(Date.now() - 3_600_000) });
    expect(expired.status).toBe(422);
    const quote = await request(app)
      .post('/api/orders/quote')
      .send({ items: await croissantItems(), smileToken: 'nope' });
    expect(quote.body.data).toMatchObject({ discount: 0, smileApplied: false }); // quotes never fail on a bad token
  });

  it('can be switched off in settings', async () => {
    await request(app)
      .put('/api/settings')
      .set('Cookie', adminCookie)
      .send({ smileDiscountRate: 0 });
    const quote = await request(app)
      .post('/api/orders/quote')
      .send({ items: await croissantItems(), smileToken: smile() });
    expect(quote.body.data).toMatchObject({
      discount: 0,
      smileDiscountRate: 0,
      smileApplied: false,
    });
    const order = await placeOrder({ smileToken: smile() });
    expect(order.status).toBe(201);
    expect(order.body.data.discount).toBe(0);
  });
});

describe('QR payment before preparation', () => {
  it('holds the order until the QR payment is confirmed', async () => {
    const order = (await placeOrder()).body.data;
    expect(order.status).toBe('PENDING_PAYMENT');

    const kitchen = await request(app)
      .get('/api/orders?status=NEW,ACCEPTED,PREPARING,READY')
      .set('Cookie', staffCookie);
    expect(kitchen.body.data.items.some((o: { id: string }) => o.id === order.id)).toBe(false);

    const payment = await request(app).get(`/api/orders/${order.id}/payment`);
    expect(payment.status).toBe(200);
    expect(payment.body.data).toMatchObject({
      status: 'PENDING',
      amount: order.total,
      currency: 'USD',
      provider: 'demo',
    });
    expect(payment.body.data.qrSvg).toContain('<svg');

    const stored = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(stored.qrPayload).toBe(`http://pay.test/pay/${stored.reference}`);
    const page = await request(app).get(`/pay/${stored.reference}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`#${order.orderNumber}`);
    expect(page.text).toContain('$1.98');

    await payOrder(order.id);
    const paid = await request(app).get(`/api/orders/${order.id}`);
    expect(paid.body.data.status).toBe('NEW');
    expect(paid.body.data.paidAt).not.toBeNull();
    expect((await request(app).get(`/api/orders/${order.id}/payment`)).body.data).toMatchObject({
      status: 'PAID',
      qrSvg: null,
    });

    // Paying again is harmless (the page just shows "Paid").
    const again = await request(app).post(`/pay/${stored.reference}`);
    expect(again.status).toBe(303);
    expect((await request(app).get(`/pay/${stored.reference}`)).text).toContain('Paid');
  });

  it('lets the customer cancel an unpaid order, but not a paid one', async () => {
    const unpaid = (await placeOrder()).body.data;
    const cancelled = await request(app).post(`/api/orders/${unpaid.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId: unpaid.id } })).status).toBe(
      'CANCELLED',
    );

    const paid = (await placeOrder()).body.data;
    await payOrder(paid.id);
    expect((await request(app).post(`/api/orders/${paid.id}/cancel`)).status).toBe(409);
  });

  it('cancels orders whose payment times out; a late payment is refused', async () => {
    const order = (await placeOrder()).body.data;
    await prisma.payment.update({
      where: { orderId: order.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await expireStalePayments()).toBeGreaterThanOrEqual(1);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe('EXPIRED');
    await request(app).post(`/pay/${payment.reference}`);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe('CANCELLED');
    expect((await request(app).get(`/pay/${payment.reference}`)).text).toContain('expired');
  });

  it('lets staff take payment another way (e.g. cash) and release the order', async () => {
    const order = (await placeOrder()).body.data;
    const res = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'NEW' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('NEW');
    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payment).toMatchObject({ status: 'PAID', provider: 'cash' });
  });

  it('lets the customer choose cash: unpaid until staff take the money', async () => {
    const order = (await placeOrder()).body.data;
    const cash = await request(app).post(`/api/orders/${order.id}/payment/cash`);
    expect(cash.status).toBe(200);
    expect(cash.body.data).toMatchObject({
      provider: 'cash',
      status: 'PENDING',
      qrSvg: null,
      qrPayload: null,
    });
    // Longer window to walk to the counter.
    expect(Date.parse(cash.body.data.expiresAt) - Date.now()).toBeGreaterThan(10 * 60_000);

    // Staff see it as unpaid cash, not as something to prepare.
    const listed = await request(app)
      .get('/api/orders?status=PENDING_PAYMENT')
      .set('Cookie', staffCookie);
    const row = listed.body.data.items.find((o: { id: string }) => o.id === order.id);
    expect(row).toMatchObject({
      status: 'PENDING_PAYMENT',
      payment: { provider: 'cash', status: 'PENDING' },
    });

    const received = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'NEW' });
    expect(received.body.data).toMatchObject({
      status: 'NEW',
      payment: { provider: 'cash', status: 'PAID' },
    });
    expect(received.body.data.paidAt).not.toBeNull();
    expect((await request(app).post(`/api/orders/${order.id}/payment/cash`)).status).toBe(409);
  });

  it('refuses cash when the shop only takes QR', async () => {
    await request(app)
      .put('/api/settings')
      .set('Cookie', adminCookie)
      .send({ allowCashPayment: false });
    const order = (await placeOrder()).body.data;
    expect((await request(app).post(`/api/orders/${order.id}/payment/cash`)).status).toBe(403);
  });

  it('skips payment when the shop turns it off (pay at the counter)', async () => {
    await request(app)
      .put('/api/settings')
      .set('Cookie', adminCookie)
      .send({ requirePayment: false });
    const order = (await placeOrder()).body.data;
    expect(order.status).toBe('NEW');
    expect(await prisma.payment.findUnique({ where: { orderId: order.id } })).toBeNull();
  });

  it('keeps unpaid orders out of revenue', async () => {
    const before = (await request(app).get('/api/reports/dashboard').set('Cookie', adminCookie))
      .body.data;
    await placeOrder(); // never paid
    const after = (await request(app).get('/api/reports/dashboard').set('Cookie', adminCookie)).body
      .data;
    expect(after.todayRevenue).toBe(before.todayRevenue);
    expect(after.todayOrders).toBe(before.todayOrders);
  });
});
