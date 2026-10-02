import { Prisma, type OrderStatus } from '@prisma/client';
import { canTransition, type OrderDTO, type Paginated } from '@gcs/types';
import type { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { AppError, notFound } from '../utils/errors';
import { orderInclude, serializeOrder, serializePublicOrder } from '../utils/serializers';
import type { createOrderSchema, listOrdersQuerySchema } from '../validators/orders';
import { emitOrderCreated, emitOrderUpdated } from '../websocket';
import { announcePaid, newPayment, settleOrder, voidUnpaidOrder } from './payment.service';
import { type PricingProduct, priceOrder } from './pricing';
import { getShopSettings } from './settings.service';
import { verifySmileToken } from './smileToken';

type Tx = Prisma.TransactionClient;
type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const SMILE_DISCOUNT_REASON = 'Smile discount';

/** Smile discount on offer: needs a rate in settings and the shared secret with the vision service. */
function smileRateOnOffer(settingsRate: number): number {
  return env.SMILE_TOKEN_SECRET ? settingsRate : 0;
}

function checkSmile(token: string | undefined) {
  return verifySmileToken(token, env.SMILE_TOKEN_SECRET, env.SMILE_TOKEN_MAX_AGE_SECONDS * 1000);
}

/** Loads current catalog data (prices, availability, option rules) for pricing. */
async function loadPricingProducts(client: Tx | typeof prisma, productIds: string[]) {
  const products = await client.product.findMany({
    where: { id: { in: [...new Set(productIds)] } },
    include: {
      category: { select: { active: true } },
      optionGroups: { include: { group: { include: { options: true } } } },
    },
  });
  return new Map<string, PricingProduct>(
    products.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        price: p.price,
        available: p.available,
        categoryActive: p.category.active,
        groups: p.optionGroups.map(({ group }) => ({
          id: group.id,
          name: group.name,
          selectionType: group.selectionType,
          required: group.required,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          options: group.options.map((o) => ({
            id: o.id,
            name: o.name,
            priceDelta: o.priceDelta,
            available: o.available,
          })),
        })),
      },
    ]),
  );
}

/** Server-side price calculation without creating anything (used by the confirmation screen). */
export async function quoteOrder(input: CreateOrderInput) {
  const settings = await getShopSettings();
  const products = await loadPricingProducts(
    prisma,
    input.items.map((i) => i.productId),
  );
  const smileRate = smileRateOnOffer(settings.smileDiscountRate);
  // The quote only checks the token; it is redeemed when the order is placed.
  const smileApplied = smileRate > 0 && checkSmile(input.smileToken) !== null;
  const priced = priceOrder(input.items, products, settings.taxRate, smileApplied ? smileRate : 0);
  return {
    lines: priced.lines.map(({ unitCents: _u, lineCents: _l, ...line }) => line),
    subtotal: priced.subtotal,
    discount: priced.discount,
    discountReason: smileApplied ? SMILE_DISCOUNT_REASON : null,
    smileDiscountRate: smileRate,
    smileApplied,
    tax: priced.tax,
    total: priced.total,
    taxRate: priced.taxRate,
  };
}

async function resolveKiosk(client: Tx, code: string | undefined): Promise<string | null> {
  if (!code) return null;
  const kiosk = await client.kiosk.findUnique({ where: { code } });
  if (!kiosk) return null;
  if (!kiosk.active) throw new AppError(403, 'FORBIDDEN', 'This kiosk is currently disabled');
  return kiosk.id;
}

/**
 * Creates an order atomically: order number, items, selected options, totals and
 * the first status-history entry are written in one transaction (all or nothing).
 */
export async function createOrder(input: CreateOrderInput): Promise<OrderDTO> {
  const order = await prisma
    .$transaction(
      async (tx) => {
        const settings = await getShopSettings(tx);
        const products = await loadPricingProducts(
          tx,
          input.items.map((i) => i.productId),
        );
        const smileRate = smileRateOnOffer(settings.smileDiscountRate);
        const smile = input.smileToken && smileRate > 0 ? checkSmile(input.smileToken) : null;
        if (input.smileToken && smileRate > 0 && !smile) {
          // The customer was shown a discounted total — never silently charge more.
          throw new AppError(
            422,
            'SMILE_DISCOUNT_INVALID',
            'Your smile discount has expired. Please smile again.',
          );
        }
        const priced = priceOrder(input.items, products, settings.taxRate, smile ? smileRate : 0);
        const payFirst = settings.requirePayment && priced.totalCents > 0;
        const status: OrderStatus = payFirst ? 'PENDING_PAYMENT' : 'NEW';
        const kioskId = await resolveKiosk(tx, input.kioskCode);

        const seq = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_number_seq')`;
        const orderNumber = `${settings.orderNumberPrefix}${seq[0]!.nextval.toString()}`;

        const created = await tx.order.create({
          data: {
            orderNumber,
            status,
            subtotal: priced.subtotal,
            discount: priced.discount,
            discountReason: smile ? SMILE_DISCOUNT_REASON : null,
            smileNonce: smile?.nonce ?? null,
            tax: priced.tax,
            total: priced.total,
            taxRate: priced.taxRate,
            kioskId,
            items: {
              create: priced.lines.map((line, index) => ({
                productId: line.productId,
                productName: line.productName,
                quantity: line.quantity,
                basePrice: line.basePrice,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
                notes: input.items[index]?.notes ?? null,
                options: {
                  create: line.options.map((o) => ({
                    optionId: o.optionId,
                    groupName: o.groupName,
                    optionName: o.optionName,
                    priceDelta: o.priceDelta,
                  })),
                },
              })),
            },
            ...(payFirst
              ? { payment: { create: newPayment(priced.total, settings.currency, orderNumber) } }
              : {}),
            statusHistory: {
              create: {
                status,
                note: payFirst
                  ? 'Order placed at kiosk — waiting for QR payment'
                  : 'Order placed at kiosk',
              },
            },
          },
          include: orderInclude,
        });

        if (kioskId)
          await tx.kiosk.update({ where: { id: kioskId }, data: { lastSeenAt: new Date() } });
        return created;
      },
      { isolationLevel: 'ReadCommitted', timeout: 10_000 },
    )
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '');
        if (target.includes('smileNonce')) {
          throw new AppError(
            422,
            'SMILE_DISCOUNT_INVALID',
            'This smile discount was already used. Please smile again.',
          );
        }
      }
      throw error;
    });

  const dto = serializeOrder(order);
  // Unpaid orders stay off the kitchen display until the payment is confirmed.
  if (order.status === 'NEW') emitOrderCreated(dto, serializePublicOrder(order));
  return dto;
}

export async function listOrders(
  query: z.infer<typeof listOrdersQuerySchema>,
): Promise<Paginated<OrderDTO>> {
  const where: Prisma.OrderWhereInput = {
    ...(query.status ? { status: { in: query.status } } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
    ...(query.search
      ? { orderNumber: { contains: query.search.replace(/^#/, ''), mode: 'insensitive' } }
      : {}),
  };
  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: {
        createdAt: query.status?.every((s) => s !== 'COMPLETED' && s !== 'CANCELLED')
          ? 'asc'
          : 'desc',
      },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { items: orders.map(serializeOrder), total, page: query.page, pageSize: query.pageSize };
}

export async function getOrder(id: string, { includeHistory }: { includeHistory: boolean }) {
  const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) throw notFound('Order');
  const dto = serializeOrder(order);
  if (!includeHistory) delete dto.statusHistory;
  return dto;
}

export async function getPublicStatus(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!order) throw notFound('Order');
  return serializePublicOrder(order);
}

/** Moves an order to a new status (validated transition) and records the audit trail. */
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  userId: string | null,
  note?: string,
): Promise<OrderDTO> {
  let paidNow = false;
  const order = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw notFound('Order');
    if (current.status === 'PENDING_PAYMENT' && status === 'NEW') {
      // Staff took the payment another way (e.g. cash at the counter).
      paidNow = true;
      return settleOrder(tx, id, {
        note: note ?? 'Cash received at the counter',
        userId,
        provider: 'cash',
      });
    }
    if (current.status === 'PENDING_PAYMENT' && status === 'CANCELLED') {
      const voided = await voidUnpaidOrder(tx, id, {
        reason: 'CANCELLED',
        userId,
        note: note ?? 'Cancelled by staff before payment',
      });
      if (!voided)
        throw new AppError(409, 'CONFLICT', 'Order was updated by someone else. Please refresh.');
      return voided;
    }
    if (!canTransition(current.status, status)) {
      throw new AppError(
        409,
        'INVALID_STATUS_TRANSITION',
        `Cannot change order from ${current.status} to ${status}`,
      );
    }
    // Optimistic concurrency: only succeeds if nobody changed the status meanwhile.
    const updated = await tx.order.updateMany({
      where: { id, status: current.status },
      data: { status, ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) },
    });
    if (updated.count === 0) {
      throw new AppError(409, 'CONFLICT', 'Order was updated by someone else. Please refresh.');
    }
    await tx.orderStatusHistory.create({
      data: { orderId: id, status, changedById: userId, note: note ?? null },
    });
    return tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
  });

  if (paidNow) announcePaid(order);
  else emitOrderUpdated(serializeOrder(order), serializePublicOrder(order)); // also drops voided cash orders from the counter
  return serializeOrder(order);
}
