import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { seedDatabase } from '../prisma/seed-data';

export const app = createApp();
export { prisma };

export const ADMIN = { email: 'admin@test.local', password: 'Admin@12345' };
export const STAFF = { email: 'staff@test.local', password: 'Staff@12345' };

/** Wipes every table, restarts the order number sequence and re-seeds the catalog. */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "order_number_seq" RESTART WITH 1001`);
  await seedDatabase(prisma, {
    adminEmail: ADMIN.email,
    adminPassword: ADMIN.password,
    staffEmail: STAFF.email,
    staffPassword: STAFF.password,
    bcryptRounds: 4,
    demoOrders: false,
  });
}

/** Pays an order's QR payment the way a customer does (demo pay page). */
export async function payOrder(orderId: string): Promise<void> {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId } });
  const res = await request(app).post(`/pay/${payment.reference}`);
  if (res.status !== 303) throw new Error(`payment failed: ${res.status}`);
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true },
  });
  if (order.status !== 'NEW') throw new Error(`order not released after payment: ${order.status}`);
}

/** Logs in and returns the session cookie header for authenticated requests. */
export async function loginAs(who: { email: string; password: string }): Promise<string> {
  const res = await request(app).post('/api/auth/login').send(who);
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = setCookie?.find((c) => c.startsWith('gcs_session='));
  if (!cookie) throw new Error('no session cookie');
  return cookie.split(';')[0]!;
}

export async function getProductByName(name: string) {
  return prisma.product.findUniqueOrThrow({
    where: { name },
    include: { optionGroups: { include: { group: { include: { options: true } } } } },
  });
}

export function optionId(
  product: Awaited<ReturnType<typeof getProductByName>>,
  groupName: string,
  optionName: string,
): string {
  const link = product.optionGroups.find((l) => l.group.name === groupName);
  const option = link?.group.options.find((o) => o.name === optionName);
  if (!option) throw new Error(`option ${groupName}/${optionName} not on ${product.name}`);
  return option.id;
}
