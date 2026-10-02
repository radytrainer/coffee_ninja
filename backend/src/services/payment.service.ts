import { randomBytes } from 'node:crypto';
import os from 'node:os';
import type { Prisma } from '@prisma/client';
import type { PaymentDTO } from '@gcs/types';
import QRCode from 'qrcode';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { AppError, notFound } from '../utils/errors';
import { decimalToNumber } from '../utils/money';
import {
  orderInclude,
  serializeOrder,
  serializePublicOrder,
  type OrderWithRelations,
} from '../utils/serializers';
import { emitOrderCreated, emitOrderUpdated } from '../websocket';
import { getShopSettings } from './settings.service';

type Tx = Prisma.TransactionClient;

/**
 * QR payment flow:
 *   kiosk places order → Order PENDING_PAYMENT + Payment PENDING (QR shown on screen)
 *   provider confirms  → Payment PAID, Order NEW → appears on the kitchen display
 *   customer picks cash → provider "cash", longer timeout; the counter sees it under
 *                         "Awaiting cash" and presses Cash received → Order NEW
 *   timeout / cancel   → Payment EXPIRED|CANCELLED, Order CANCELLED (never reaches the kitchen)
 */

// ------------------------------------------------------------------ providers

export interface ChargeRequest {
  reference: string;
  amount: number;
  currency: string;
  description: string;
}

export interface PaymentProvider {
  readonly name: string;
  /** Returns what the QR code encodes (a payment URL, or a bank QR string such as KHQR). */
  createCharge(request: ChargeRequest): { qrPayload: string };
}

/** Private LAN address of this machine, so a phone on the same Wi-Fi can open the demo pay page. */
function lanAddress(): string {
  const candidates = Object.entries(os.networkInterfaces())
    .filter(([name]) => !/vEthernet|docker|wsl|virtualbox|vmware|loopback/i.test(name))
    .flatMap(([, addrs]) => addrs ?? [])
    .filter((a) => a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
  return (
    candidates.find((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a)) ??
    candidates[0] ??
    'localhost'
  );
}

export function paymentPublicUrl(): string {
  return (env.PAYMENT_PUBLIC_URL ?? `http://${lanAddress()}:${env.PORT}`).replace(/\/+$/, '');
}

/**
 * Demo provider: the QR opens a "Pay" page served by this API. Anyone who opens it
 * can confirm, so it moves no real money — for testing and demos only.
 */
const demoProvider: PaymentProvider = {
  name: 'demo',
  createCharge: ({ reference }) => ({ qrPayload: `${paymentPublicUrl()}/pay/${reference}` }),
};

const PROVIDERS: Record<typeof env.PAYMENT_PROVIDER, PaymentProvider> = { demo: demoProvider };

export function paymentProvider(): PaymentProvider {
  return PROVIDERS[env.PAYMENT_PROVIDER];
}

// ------------------------------------------------------------------ creation

/** Payment row data for a new order (created inside the order transaction). */
export function newPayment(amount: number, currency: string, orderNumber: string) {
  const provider = paymentProvider();
  const reference = randomBytes(16).toString('hex');
  const { qrPayload } = provider.createCharge({
    reference,
    amount,
    currency,
    description: `Order #${orderNumber}`,
  });
  return {
    provider: provider.name,
    reference,
    qrPayload,
    amount,
    currency,
    expiresAt: new Date(Date.now() + env.PAYMENT_TIMEOUT_SECONDS * 1000),
  };
}

// ------------------------------------------------------------------ state changes

/**
 * Marks an unpaid order as paid and releases it to the kitchen (PENDING_PAYMENT → NEW).
 * Used by payment confirmation and by staff taking payment manually.
 */
export async function settleOrder(
  tx: Tx,
  orderId: string,
  { note, userId, provider }: { note: string; userId: string | null; provider?: string },
): Promise<OrderWithRelations> {
  const now = new Date();
  const moved = await tx.order.updateMany({
    where: { id: orderId, status: 'PENDING_PAYMENT' },
    data: { status: 'NEW', paidAt: now },
  });
  if (moved.count === 0)
    throw new AppError(409, 'CONFLICT', 'This order is not waiting for payment');
  await tx.payment.updateMany({
    where: { orderId, status: 'PENDING' },
    data: { status: 'PAID', paidAt: now, ...(provider ? { provider } : {}) },
  });
  await tx.orderStatusHistory.create({
    data: { orderId, status: 'NEW', note, changedById: userId },
  });
  return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}

/** Cancels an unpaid order (customer backed out, or the payment timed out). */
export async function voidUnpaidOrder(
  tx: Tx,
  orderId: string,
  {
    reason,
    userId,
    note,
  }: { reason: 'CANCELLED' | 'EXPIRED'; userId: string | null; note: string },
): Promise<OrderWithRelations | null> {
  const moved = await tx.order.updateMany({
    where: { id: orderId, status: 'PENDING_PAYMENT' },
    data: { status: 'CANCELLED' },
  });
  if (moved.count === 0) return null;
  await tx.payment.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: reason } });
  await tx.orderStatusHistory.create({
    data: { orderId, status: 'CANCELLED', note, changedById: userId },
  });
  return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}

/** Unpaid order voided: customer status, and the counter drops it from "Awaiting cash". */
function announceVoided(order: OrderWithRelations): void {
  emitOrderUpdated(serializeOrder(order), serializePublicOrder(order));
}

/** The kitchen learns about an order only once it has been paid. */
export function announcePaid(order: OrderWithRelations): void {
  emitOrderCreated(serializeOrder(order), serializePublicOrder(order));
}

/** Confirms a payment by its reference (called by the provider / demo pay page). */
export async function confirmPayment(reference: string): Promise<OrderWithRelations> {
  await expireStalePayments();
  const order = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { reference } });
    if (!payment) throw notFound('Payment');
    if (payment.status === 'PAID') {
      throw new AppError(409, 'CONFLICT', 'This order has already been paid');
    }
    if (payment.status !== 'PENDING') {
      throw new AppError(
        410,
        'PAYMENT_EXPIRED',
        'This payment request has expired. Please order again at the kiosk.',
      );
    }
    return settleOrder(tx, payment.orderId, {
      note: `Paid by QR (${payment.provider})`,
      userId: null,
    });
  });
  announcePaid(order);
  logger.info({ orderId: order.id, orderNumber: order.orderNumber }, 'order paid');
  return order;
}

/** Customer cancelled on the payment screen. */
export async function cancelUnpaid(orderId: string): Promise<void> {
  const order = await prisma.$transaction((tx) =>
    voidUnpaidOrder(tx, orderId, {
      reason: 'CANCELLED',
      userId: null,
      note: 'Cancelled at kiosk before payment',
    }),
  );
  if (!order) {
    const exists = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (!exists) throw notFound('Order');
    throw new AppError(409, 'CONFLICT', 'Only unpaid orders can be cancelled here');
  }
  announceVoided(order);
}

/** Cancels orders whose QR payment timed out. Runs periodically and before payment reads. */
export async function expireStalePayments(now = new Date()): Promise<number> {
  const stale = await prisma.payment.findMany({
    where: { status: 'PENDING', expiresAt: { lt: now } },
    select: { orderId: true },
    take: 100,
  });
  let expired = 0;
  for (const { orderId } of stale) {
    const order = await prisma.$transaction((tx) =>
      voidUnpaidOrder(tx, orderId, {
        reason: 'EXPIRED',
        userId: null,
        note: 'Payment not received in time',
      }),
    );
    if (order) {
      expired += 1;
      announceVoided(order);
    }
  }
  if (expired) logger.info({ expired }, 'expired unpaid orders');
  return expired;
}

/**
 * Customer chose to pay cash at the counter instead of scanning the QR. The order
 * stays unpaid (not prepared) until staff press "Cash received".
 */
export async function chooseCash(orderId: string): Promise<PaymentDTO> {
  const settings = await getShopSettings();
  if (!settings.allowCashPayment)
    throw new AppError(403, 'FORBIDDEN', 'Cash payment is not available at this shop');
  await expireStalePayments();
  const switched = await prisma.payment.updateMany({
    where: { orderId, status: 'PENDING', order: { status: 'PENDING_PAYMENT' } },
    data: {
      provider: 'cash',
      expiresAt: new Date(Date.now() + env.CASH_PAYMENT_TIMEOUT_SECONDS * 1000),
    },
  });
  if (switched.count === 0) {
    const payment = await prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw notFound('Payment');
    if (payment.status === 'PAID')
      throw new AppError(409, 'CONFLICT', 'This order has already been paid');
    throw new AppError(410, 'PAYMENT_EXPIRED', 'This order has expired. Please order again.');
  }
  await prisma.orderStatusHistory.create({
    data: { orderId, status: 'PENDING_PAYMENT', note: 'Customer will pay cash at the counter' },
  });
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: orderInclude,
  });
  // Alert the counter: someone is on their way to pay (chime + "Awaiting cash").
  emitOrderCreated(serializeOrder(order), serializePublicOrder(order));
  return getPaymentForOrder(orderId);
}

// ------------------------------------------------------------------ reads

async function qrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1b120c', light: '#ffffff' },
  });
}

type PaymentWithOrder = Prisma.PaymentGetPayload<{
  include: { order: { select: { orderNumber: true } } };
}>;

async function serializePayment(p: PaymentWithOrder): Promise<PaymentDTO> {
  return {
    id: p.id,
    orderId: p.orderId,
    orderNumber: p.order.orderNumber,
    provider: p.provider,
    status: p.status,
    amount: decimalToNumber(p.amount),
    currency: p.currency,
    qrSvg: p.status === 'PENDING' && p.provider !== 'cash' ? await qrSvg(p.qrPayload) : null,
    qrPayload: p.status === 'PENDING' && p.provider !== 'cash' ? p.qrPayload : null,
    expiresAt: p.expiresAt.toISOString(),
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
  };
}

/** Payment for the kiosk's payment screen (by unguessable order id). */
export async function getPaymentForOrder(orderId: string): Promise<PaymentDTO> {
  await expireStalePayments();
  const payment = await prisma.payment.findUnique({
    where: { orderId },
    include: { order: { select: { orderNumber: true } } },
  });
  if (!payment) throw notFound('Payment');
  return serializePayment(payment);
}

/** Payment details for the demo pay page (by unguessable reference). */
export async function getPaymentByReference(reference: string) {
  await expireStalePayments();
  return prisma.payment.findUnique({
    where: { reference },
    include: {
      order: {
        select: { orderNumber: true, items: { select: { productName: true, quantity: true } } },
      },
    },
  });
}
