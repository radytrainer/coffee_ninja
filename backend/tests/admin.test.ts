import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

let adminCookie: string;
let staffCookie: string;

async function placeCroissantOrder(quantity = 1) {
  const croissant = await getProductByName('Croissant');
  const res = await request(app)
    .post('/api/orders')
    .send({
      items: [
        {
          productId: croissant.id,
          quantity,
          optionIds: [optionId(croissant, 'Serving', 'Warmed')],
        },
      ],
    });
  await payOrder(res.body.data.id);
  return res.body.data as { id: string; total: number };
}

beforeAll(async () => {
  await resetDatabase();
  adminCookie = await loginAs(ADMIN);
  staffCookie = await loginAs(STAFF);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('reports', () => {
  it('are admin-only', async () => {
    expect((await request(app).get('/api/reports/dashboard')).status).toBe(401);
    expect(
      (await request(app).get('/api/reports/dashboard').set('Cookie', staffCookie)).status,
    ).toBe(403);
  });

  it('dashboard counts today, revenue excludes cancelled orders', async () => {
    const a = await placeCroissantOrder(2); // 3.60 + 0.36 tax = 3.96
    const b = await placeCroissantOrder(1); // 1.98
    await request(app)
      .patch(`/api/orders/${b.id}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'CANCELLED' });
    await request(app)
      .patch(`/api/orders/${a.id}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'PREPARING' });

    const res = await request(app).get('/api/reports/dashboard').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      todayOrders: 1,
      todayRevenue: 3.96,
      preparing: 1,
      cancelled: 1,
      pending: 0,
    });
  });

  it('sales by day returns one row per day including empty days', async () => {
    const res = await request(app).get('/api/reports/sales').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(14);
    const total = res.body.data.reduce((s: number, r: { revenue: number }) => s + r.revenue, 0);
    expect(total).toBeCloseTo(3.96, 2);
  });

  it('top products and orders by category', async () => {
    const products = await request(app)
      .get('/api/reports/products?limit=5')
      .set('Cookie', adminCookie);
    expect(products.body.data[0]).toMatchObject({
      productName: 'Croissant',
      quantity: 2,
      revenue: 3.6,
    });

    const orders = await request(app).get('/api/reports/orders').set('Cookie', adminCookie);
    expect(orders.body.data.byCategory[0]).toMatchObject({ categoryName: 'Bakery', quantity: 2 });
    expect(orders.body.data.totalOrders).toBe(1);
    expect(orders.body.data.averageOrderValue).toBe(3.96);
    expect(orders.body.data.byStatus).toEqual(
      expect.arrayContaining([
        { status: 'PREPARING', count: 1 },
        { status: 'CANCELLED', count: 1 },
      ]),
    );
  });

  it('validates date ranges', async () => {
    const bad = await request(app)
      .get('/api/reports/sales?from=2026-05-10&to=2026-05-01')
      .set('Cookie', adminCookie);
    expect(bad.status).toBe(400);
    const tooLong = await request(app)
      .get('/api/reports/sales?from=2020-01-01&to=2026-01-01')
      .set('Cookie', adminCookie);
    expect(tooLong.status).toBe(400);
    const malformed = await request(app)
      .get('/api/reports/sales?from=yesterday')
      .set('Cookie', adminCookie);
    expect(malformed.status).toBe(400);
    const explicit = await request(app)
      .get('/api/reports/sales?from=2026-01-01&to=2026-01-07')
      .set('Cookie', adminCookie);
    expect(explicit.body.data.map((r: { date: string }) => r.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
    ]);
  });
});

describe('inventory', () => {
  it('supports CRUD, adjustments and low-stock flags', async () => {
    const created = await request(app)
      .post('/api/inventory')
      .set('Cookie', adminCookie)
      .send({ name: 'Paper Straws', unit: 'pcs', quantity: 10, lowStockThreshold: 20 });
    expect(created.status).toBe(201);
    expect(created.body.data.lowStock).toBe(true);
    const id = created.body.data.id as string;

    const added = await request(app)
      .post(`/api/inventory/${id}/adjust`)
      .set('Cookie', adminCookie)
      .send({ delta: 50 });
    expect(added.body.data).toMatchObject({ quantity: 60, lowStock: false });

    const tooMuch = await request(app)
      .post(`/api/inventory/${id}/adjust`)
      .set('Cookie', adminCookie)
      .send({ delta: -100 });
    expect(tooMuch.status).toBe(400);

    const negative = await request(app)
      .put(`/api/inventory/${id}`)
      .set('Cookie', adminCookie)
      .send({ quantity: -1 });
    expect(negative.status).toBe(400);

    expect(
      (await request(app).delete(`/api/inventory/${id}`).set('Cookie', adminCookie)).status,
    ).toBe(200);
    expect((await request(app).get('/api/inventory').set('Cookie', staffCookie)).status).toBe(403);
  });
});

describe('kiosks & settings', () => {
  it('configures a kiosk, reflected in the public kiosk config', async () => {
    const list = await request(app).get('/api/kiosks').set('Cookie', adminCookie);
    const kiosk = list.body.data.find((k: { code: string }) => k.code === 'KIOSK-01');
    const updated = await request(app)
      .put(`/api/kiosks/${kiosk.id}`)
      .set('Cookie', adminCookie)
      .send({ inputMode: 'MOUSE', sessionTimeoutSeconds: 90, hoverDelayMs: 300 });
    expect(updated.status).toBe(200);
    const config = await request(app).get('/api/kiosk/config?code=KIOSK-01');
    expect(config.body.data.kiosk).toMatchObject({
      inputMode: 'MOUSE',
      sessionTimeoutSeconds: 90,
      hoverDelayMs: 300,
    });

    const invalid = await request(app)
      .put(`/api/kiosks/${kiosk.id}`)
      .set('Cookie', adminCookie)
      .send({ sessionTimeoutSeconds: 1 });
    expect(invalid.status).toBe(400);

    const created = await request(app)
      .post('/api/kiosks')
      .set('Cookie', adminCookie)
      .send({ code: 'KIOSK-02', name: 'Patio' });
    expect(created.status).toBe(201);
    expect(
      (
        await request(app)
          .post('/api/kiosks')
          .set('Cookie', adminCookie)
          .send({ code: 'KIOSK-02', name: 'Dup' })
      ).status,
    ).toBe(409);
  });

  it('updates shop settings with validation; tax rate applies to new orders', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Cookie', adminCookie)
      .send({ taxRate: 0.05, shopName: 'PNC Coffee Lab' });
    expect(res.body.data).toMatchObject({ taxRate: 0.05, shopName: 'PNC Coffee Lab' });

    const croissant = await getProductByName('Croissant');
    const quote = await request(app)
      .post('/api/orders/quote')
      .send({
        items: [
          {
            productId: croissant.id,
            quantity: 1,
            optionIds: [optionId(croissant, 'Serving', 'Warmed')],
          },
        ],
      });
    expect(quote.body.data).toMatchObject({ subtotal: 1.8, tax: 0.09, total: 1.89 });

    for (const body of [
      { taxRate: -0.1 },
      { currency: 'dollars' },
      { timezone: 'Mars/Olympus' },
      { orderNumberPrefix: 'a1' },
    ]) {
      expect(
        (await request(app).put('/api/settings').set('Cookie', adminCookie).send(body)).status,
      ).toBe(400);
    }
    await request(app)
      .put('/api/settings')
      .set('Cookie', adminCookie)
      .send({ taxRate: 0.1, shopName: 'PNC Coffee' });
  });
});
