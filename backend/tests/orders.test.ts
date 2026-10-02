import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN,
  STAFF,
  app,
  getProductByName,
  loginAs,
  optionId,
  prisma,
  resetDatabase,
  payOrder,
} from './helpers';

let staffCookie: string;
let adminCookie: string;

beforeAll(async () => {
  await resetDatabase();
  staffCookie = await loginAs(STAFF);
  adminCookie = await loginAs(ADMIN);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function latteLine(quantity = 1) {
  const latte = await getProductByName('Latte');
  return {
    productId: latte.id,
    quantity,
    optionIds: [
      optionId(latte, 'Size', 'Large'),
      optionId(latte, 'Milk', 'Oat Milk'),
      optionId(latte, 'Sugar', '2'),
      optionId(latte, 'Temperature', 'Hot'),
    ],
  };
}

async function croissantLine() {
  const croissant = await getProductByName('Croissant');
  return {
    productId: croissant.id,
    quantity: 1,
    optionIds: [optionId(croissant, 'Serving', 'Warmed')],
  };
}

describe('order creation', () => {
  it('quotes prices server-side without creating an order', async () => {
    const before = await prisma.order.count();
    const res = await request(app)
      .post('/api/orders/quote')
      .send({ items: [await latteLine(2)] });
    expect(res.status).toBe(200);
    // Latte 2.50 + Large 1.00 + Oat 0.50 = 4.00 × 2 = 8.00; tax 10% = 0.80
    expect(res.body.data).toMatchObject({ subtotal: 8, tax: 0.8, total: 8.8, taxRate: 0.1 });
    expect(await prisma.order.count()).toBe(before);
  });

  it('creates an order with human-friendly sequential numbers and server prices', async () => {
    const first = await request(app)
      .post('/api/orders')
      .send({ items: [await latteLine(1), await croissantLine()], kioskCode: 'KIOSK-01' });
    expect(first.status).toBe(201);
    expect(first.body.data.orderNumber).toBe('A1001');
    // Pay first: the order waits for the QR payment before reaching the kitchen.
    expect(first.body.data.status).toBe('PENDING_PAYMENT');
    // 4.00 + 1.80 = 5.80, tax 0.58, total 6.38
    expect(first.body.data).toMatchObject({ subtotal: 5.8, tax: 0.58, total: 6.38 });
    expect(
      first.body.data.items[0].options.map((o: { optionName: string }) => o.optionName),
    ).toEqual(['Large', 'Oat Milk', '2', 'Hot']);

    const second = await request(app)
      .post('/api/orders')
      .send({ items: [await croissantLine()] });
    expect(second.body.data.orderNumber).toBe('A1002');

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: first.body.data.id },
      include: { items: { include: { options: true } }, statusHistory: true, kiosk: true },
    });
    expect(stored.items).toHaveLength(2);
    expect(stored.items[0]!.options).toHaveLength(4);
    expect(stored.statusHistory.map((h) => h.status)).toEqual(['PENDING_PAYMENT']);
    expect(stored.kiosk?.code).toBe('KIOSK-01');
  });

  it('ignores/rejects client-supplied prices (price manipulation)', async () => {
    const line = { ...(await latteLine(1)), price: 0.01, unitPrice: 0.01 };
    const res = await request(app)
      .post('/api/orders')
      .send({ items: [line] });
    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe(4.4);

    const withTotal = await request(app)
      .post('/api/orders')
      .send({ items: [await latteLine(1)], total: 0.01 });
    expect(withTotal.status).toBe(400);
  });

  it('uses the latest database price', async () => {
    const croissant = await getProductByName('Croissant');
    await request(app)
      .put(`/api/products/${croissant.id}`)
      .set('Cookie', adminCookie)
      .send({ price: 2.2 });
    const res = await request(app)
      .post('/api/orders/quote')
      .send({ items: [await croissantLine()] });
    expect(res.body.data.subtotal).toBe(2.2);
    await request(app)
      .put(`/api/products/${croissant.id}`)
      .set('Cookie', adminCookie)
      .send({ price: 1.8 });
  });

  it('validates cart contents', async () => {
    const empty = await request(app).post('/api/orders').send({ items: [] });
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toMatch(/empty/i);

    const badQty = await request(app)
      .post('/api/orders')
      .send({ items: [{ ...(await latteLine()), quantity: 0 }] });
    expect(badQty.status).toBe(400);

    const latte = await getProductByName('Latte');
    const missingRequired = await request(app)
      .post('/api/orders')
      .send({ items: [{ productId: latte.id, quantity: 1, optionIds: [] }] });
    expect(missingRequired.status).toBe(422);
    expect(missingRequired.body.error.code).toBe('INVALID_OPTIONS');

    const croissant = await getProductByName('Croissant');
    const foreignOption = await request(app)
      .post('/api/orders')
      .send({
        items: [
          {
            productId: croissant.id,
            quantity: 1,
            optionIds: [optionId(croissant, 'Serving', 'Warmed'), optionId(latte, 'Size', 'Large')],
          },
        ],
      });
    expect(foreignOption.status).toBe(422);
  });

  it('rejects unavailable products', async () => {
    const croissant = await getProductByName('Croissant');
    await prisma.product.update({ where: { id: croissant.id }, data: { available: false } });
    const res = await request(app)
      .post('/api/orders')
      .send({ items: [await croissantLine()] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PRODUCT_UNAVAILABLE');
    await prisma.product.update({ where: { id: croissant.id }, data: { available: true } });
  });

  it('rolls back the whole order if any part fails', async () => {
    // A trigger that fails when a specific option snapshot is inserted, i.e. AFTER the
    // Order and OrderItem rows were inserted inside the same transaction.
    const croissant = await getProductByName('Croissant');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_option_insert() RETURNS trigger AS $$
      BEGIN
        IF NEW."optionName" = 'Room Temperature' THEN RAISE EXCEPTION 'simulated failure'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;`);
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER fail_option_insert BEFORE INSERT ON "OrderItemOption" FOR EACH ROW EXECUTE FUNCTION fail_option_insert();`,
    );
    const orders = await prisma.order.count();
    const items = await prisma.orderItem.count();
    try {
      const res = await request(app)
        .post('/api/orders')
        .send({
          items: [
            await latteLine(),
            {
              productId: croissant.id,
              quantity: 1,
              optionIds: [optionId(croissant, 'Serving', 'Room Temperature')],
            },
          ],
        });
      expect(res.status).toBe(500);
      expect(res.body.error.message).not.toMatch(/simulated|trigger|sql/i);
      expect(await prisma.order.count()).toBe(orders);
      expect(await prisma.orderItem.count()).toBe(items);
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS fail_option_insert ON "OrderItemOption"`,
      );
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS fail_option_insert()`);
    }
  });

  it('rejects orders from a disabled kiosk', async () => {
    await prisma.kiosk.update({ where: { code: 'KIOSK-01' }, data: { active: false } });
    const res = await request(app)
      .post('/api/orders')
      .send({ items: [await croissantLine()], kioskCode: 'KIOSK-01' });
    expect(res.status).toBe(403);
    await prisma.kiosk.update({ where: { code: 'KIOSK-01' }, data: { active: true } });
  });
});

describe('order status', () => {
  async function newOrder() {
    const res = await request(app)
      .post('/api/orders')
      .send({ items: [await croissantLine()] });
    await payOrder(res.body.data.id);
    return res.body.data.id as string;
  }

  it('lets customers read status but not list orders', async () => {
    const id = await newOrder();
    const status = await request(app).get(`/api/orders/${id}/status`);
    expect(status.body.data).toMatchObject({ status: 'NEW', message: 'Order received' });
    const order = await request(app).get(`/api/orders/${id}`);
    expect(order.status).toBe(200);
    expect(order.body.data.statusHistory).toBeUndefined();
    expect((await request(app).get('/api/orders')).status).toBe(401);
    expect(
      (await request(app).patch(`/api/orders/${id}/status`).send({ status: 'ACCEPTED' })).status,
    ).toBe(401);
  });

  it('walks the full lifecycle and records audit history', async () => {
    const id = await newOrder();
    for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED']) {
      const res = await request(app)
        .patch(`/api/orders/${id}/status`)
        .set('Cookie', staffCookie)
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(status);
    }
    const full = await request(app).get(`/api/orders/${id}`).set('Cookie', staffCookie);
    const history = full.body.data.statusHistory as {
      status: string;
      changedBy: { name: string } | null;
    }[];
    expect(history.map((h) => h.status)).toEqual([
      'PENDING_PAYMENT',
      'NEW',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'COMPLETED',
    ]);
    expect(history[2]!.changedBy?.name).toBe('Barista Dara'); // first staff change after payment
    const stored = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(stored.completedAt).not.toBeNull();
  });

  it('rejects invalid transitions', async () => {
    const id = await newOrder();
    const skip = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'COMPLETED' });
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'CANCELLED' });
    const reopen = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'NEW' });
    expect(reopen.status).toBe(409);

    const bogus = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Cookie', staffCookie)
      .send({ status: 'EATEN' });
    expect(bogus.status).toBe(400);
  });

  it('lists and filters orders for staff', async () => {
    const res = await request(app)
      .get('/api/orders?status=NEW,ACCEPTED&pageSize=5')
      .set('Cookie', staffCookie);
    expect(res.status).toBe(200);
    expect(
      res.body.data.items.every((o: { status: string }) => ['NEW', 'ACCEPTED'].includes(o.status)),
    ).toBe(true);
    expect(res.body.data.pageSize).toBe(5);

    const search = await request(app).get('/api/orders?search=A1001').set('Cookie', staffCookie);
    expect(search.body.data.items[0].orderNumber).toBe('A1001');

    const invalid = await request(app).get('/api/orders?status=FOO').set('Cookie', staffCookie);
    expect(invalid.status).toBe(400);
  });

  it('returns kiosk configuration', async () => {
    const res = await request(app).get('/api/kiosk/config?code=KIOSK-01');
    expect(res.body.data.shop).toMatchObject({
      shopName: 'PNC Coffee',
      taxRate: 0.1,
      currency: 'USD',
    });
    expect(res.body.data.kiosk).toMatchObject({ code: 'KIOSK-01', sessionTimeoutSeconds: 60 });
  });
});
