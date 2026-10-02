/**
 * End-to-end integration through a real HTTP + Socket.IO server:
 * Customer → Product → Cart → Order → Database → Kitchen (real time) → Customer status.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { OrderDTO, PublicOrderStatusDTO } from '@gcs/types';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeRealtime, initRealtime } from '../src/websocket';
import {
  STAFF,
  app,
  getProductByName,
  loginAs,
  optionId,
  payOrder,
  prisma,
  resetDatabase,
} from './helpers';

let server: Server;
let url: string;
let staffCookie: string;
const sockets: Socket[] = [];

function socket(options: Parameters<typeof connect>[1] = {}): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = connect(url, { transports: ['websocket'], reconnection: false, ...options });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function next<T>(
  s: Socket,
  event: string,
  predicate: (payload: T) => boolean = () => true,
  timeoutMs = 4000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    const handler = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      s.off(event, handler);
      resolve(payload);
    };
    s.on(event, handler);
  });
}

beforeAll(async () => {
  await resetDatabase();
  staffCookie = await loginAs(STAFF);
  server = createServer(app);
  initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await closeRealtime();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

describe('customer → kitchen real-time flow', () => {
  it('delivers new orders to the kitchen and status updates to the customer', async () => {
    const kitchen = await socket({ extraHeaders: { Cookie: staffCookie } });
    const anonymous = await socket();
    // Give the server a moment to process the kitchen room join.
    await new Promise((r) => setTimeout(r, 150));

    // 1. Customer browses and builds a cart (menu from the public API).
    const menu = await request(app).get('/api/products');
    expect(menu.body.data.length).toBeGreaterThan(5);
    const latte = await getProductByName('Latte');

    const kitchenReceived = next<OrderDTO>(kitchen, 'order:created');
    let anonymousGotOrder = false;
    anonymous.on('order:created', () => (anonymousGotOrder = true));

    // 2. Checkout — prices come from the server only.
    const created = await request(app)
      .post('/api/orders')
      .send({
        kioskCode: 'KIOSK-01',
        items: [
          {
            productId: latte.id,
            quantity: 2,
            optionIds: [
              optionId(latte, 'Size', 'Medium'),
              optionId(latte, 'Milk', 'Oat Milk'),
              optionId(latte, 'Sugar', '1'),
              optionId(latte, 'Temperature', 'Iced'),
            ],
          },
        ],
      });
    expect(created.status).toBe(201);
    const order = created.body.data as OrderDTO;
    // (2.50 + 0.50 + 0.50 + 0.20) × 2 = 7.40 + 10% tax = 8.14
    expect(order).toMatchObject({
      orderNumber: 'A1001',
      subtotal: 7.4,
      tax: 0.74,
      total: 8.14,
      status: 'PENDING_PAYMENT',
    });

    // 3. Database contains the order with items, options and audit history.
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: { include: { options: true } }, statusHistory: true },
    });
    expect(stored.items[0]!.options).toHaveLength(4);
    expect(stored.statusHistory).toHaveLength(1);

    // 4. Nothing reaches the kitchen until the customer pays by QR; then it arrives without refreshing.
    let kitchenEarly = false;
    void kitchenReceived.then(() => (kitchenEarly = true));
    await new Promise((r) => setTimeout(r, 150));
    expect(kitchenEarly).toBe(false);
    await payOrder(order.id);
    const pushed = await kitchenReceived;
    expect(pushed.status).toBe('NEW');
    expect(pushed.paidAt).not.toBeNull();
    expect(pushed.id).toBe(order.id);
    expect(pushed.items[0]!.productName).toBe('Latte');
    await new Promise((r) => setTimeout(r, 100));
    expect(anonymousGotOrder).toBe(false);

    // 5. Customer subscribes to their order and follows every status change.
    const customer = await socket();
    customer.emit('order:subscribe', order.id);
    await new Promise((r) => setTimeout(r, 100));

    for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'] as const) {
      const customerUpdate = next<PublicOrderStatusDTO>(
        customer,
        'order:status',
        (s) => s.status === status,
      );
      const kitchenUpdate = next<OrderDTO>(kitchen, 'order:updated', (o) => o.status === status);
      const res = await request(app)
        .patch(`/api/orders/${order.id}/status`)
        .set('Cookie', staffCookie)
        .send({ status });
      expect(res.status).toBe(200);
      const [c, k] = await Promise.all([customerUpdate, kitchenUpdate]);
      expect(c.orderNumber).toBe('A1001');
      expect(c).not.toHaveProperty('items'); // customers only get the public status
      expect(k.statusHistory?.at(-1)?.changedBy?.name).toBe('Barista Dara');
    }

    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => h.status)).toEqual([
      'PENDING_PAYMENT',
      'NEW',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'COMPLETED',
    ]);
  });

  it('does not let an unauthenticated socket join the kitchen with a forged token', async () => {
    const forged = await socket({ auth: { token: 'not-a-real-token' } });
    let received = false;
    forged.on('order:created', () => (received = true));
    const croissant = await getProductByName('Croissant');
    await request(app)
      .post('/api/orders')
      .send({
        items: [
          {
            productId: croissant.id,
            quantity: 1,
            optionIds: [optionId(croissant, 'Serving', 'Warmed')],
          },
        ],
      });
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toBe(false);
  });
});
