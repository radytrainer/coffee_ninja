import type { Prisma } from '@prisma/client';
import type {
  CategoryReportRow,
  DashboardStatsDTO,
  OrdersReportDTO,
  ProductReportRow,
  SalesReportRow,
} from '@gcs/types';
import { prisma } from '../config/prisma';
import { badRequest } from '../utils/errors';
import { getShopSettings } from './settings.service';

/**
 * Reporting queries. A report range is a pair of calendar dates in the shop's
 * local timezone (inclusive); orders are bucketed by their local date.
 * Cancelled orders never count toward revenue. All values are parameterized.
 */

export interface DateRange {
  /** YYYY-MM-DD (inclusive, shop-local) */
  from: string;
  to: string;
  timezone: string;
}

const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

const money = (v: Prisma.Decimal | number | string | null) =>
  v === null ? 0 : Math.round(Number(v) * 100) / 100;
const int = (v: bigint | number | null) => (v === null ? 0 : Number(v));

/** Today's date (YYYY-MM-DD) in a timezone. */
export function localToday(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Applies defaults (last `defaultDays` days up to today) and validates the range. */
export async function resolveRange(
  query: { from?: string; to?: string },
  defaultDays: number,
): Promise<DateRange> {
  const { timezone } = await getShopSettings();
  const to = query.to ?? localToday(timezone);
  const from = query.from ?? addDays(to, -(defaultDays - 1));
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
  if (span < 0) throw badRequest('"from" must be on or before "to"');
  if (span >= MAX_RANGE_DAYS) throw badRequest(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  return { from, to, timezone };
}

export async function dashboard(): Promise<DashboardStatsDTO> {
  const { timezone } = await getShopSettings();
  const [today] = await prisma.$queryRaw<
    { orders: bigint; revenue: Prisma.Decimal | null; completed: bigint; cancelled: bigint }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('CANCELLED', 'PENDING_PAYMENT'))    AS orders,
      SUM(total) FILTER (WHERE status NOT IN ('CANCELLED', 'PENDING_PAYMENT'))  AS revenue,
      COUNT(*) FILTER (WHERE status = 'COMPLETED')     AS completed,
      COUNT(*) FILTER (WHERE status = 'CANCELLED' AND NOT EXISTS (
        SELECT 1 FROM "Payment" p WHERE p."orderId" = "Order".id AND p.status IN ('EXPIRED', 'CANCELLED'))) AS cancelled
    FROM "Order"
    WHERE ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date = ${localToday(timezone)}::date`;
  const active = await prisma.order.groupBy({
    by: ['status'],
    where: { status: { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] } },
    _count: { _all: true },
  });
  const count = (s: string) => active.find((a) => a.status === s)?._count._all ?? 0;
  return {
    todayOrders: int(today?.orders ?? 0),
    todayRevenue: money(today?.revenue ?? null),
    pending: count('NEW'),
    accepted: count('ACCEPTED'),
    preparing: count('PREPARING'),
    ready: count('READY'),
    completed: int(today?.completed ?? 0),
    cancelled: int(today?.cancelled ?? 0),
  };
}

export async function salesByDay({ from, to, timezone }: DateRange): Promise<SalesReportRow[]> {
  const rows = await prisma.$queryRaw<
    { day: Date; orders: bigint; revenue: Prisma.Decimal | null }[]
  >`
    WITH days AS (
      SELECT generate_series(${from}::date, ${to}::date, interval '1 day')::date AS day
    ),
    sales AS (
      SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date AS day,
             COUNT(*) AS orders, SUM(total) AS revenue
      FROM "Order"
      WHERE status NOT IN ('CANCELLED', 'PENDING_PAYMENT')
        AND ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1
    )
    SELECT days.day, COALESCE(sales.orders, 0) AS orders, COALESCE(sales.revenue, 0) AS revenue
    FROM days LEFT JOIN sales ON sales.day = days.day
    ORDER BY days.day`;
  return rows.map((r) => ({
    date: r.day.toISOString().slice(0, 10),
    orders: int(r.orders),
    revenue: money(r.revenue),
  }));
}

export async function topProducts(
  { from, to, timezone }: DateRange,
  limit = 10,
): Promise<ProductReportRow[]> {
  const rows = await prisma.$queryRaw<
    { productId: string | null; productName: string; quantity: bigint; revenue: Prisma.Decimal }[]
  >`
    SELECT i."productId", i."productName", SUM(i.quantity) AS quantity, SUM(i."lineTotal") AS revenue
    FROM "OrderItem" i
    JOIN "Order" o ON o.id = i."orderId"
    WHERE o.status NOT IN ('CANCELLED', 'PENDING_PAYMENT')
      AND (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY i."productId", i."productName"
    ORDER BY quantity DESC, revenue DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    quantity: int(r.quantity),
    revenue: money(r.revenue),
  }));
}

export async function ordersReport({ from, to, timezone }: DateRange): Promise<OrdersReportDTO> {
  const byStatus = await prisma.$queryRaw<{ status: string; count: bigint }[]>`
    SELECT status::text AS status, COUNT(*) AS count
    FROM "Order"
    WHERE ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY status
    ORDER BY status`;
  const [totals] = await prisma.$queryRaw<{ orders: bigint; average: Prisma.Decimal | null }[]>`
    SELECT COUNT(*) AS orders, AVG(total) AS average
    FROM "Order"
    WHERE status NOT IN ('CANCELLED', 'PENDING_PAYMENT')
      AND ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date`;
  const categories = await prisma.$queryRaw<
    {
      categoryId: string | null;
      categoryName: string | null;
      orders: bigint;
      quantity: bigint;
      revenue: Prisma.Decimal;
    }[]
  >`
    SELECT c.id AS "categoryId", c.name AS "categoryName",
           COUNT(DISTINCT o.id) AS orders, SUM(i.quantity) AS quantity, SUM(i."lineTotal") AS revenue
    FROM "OrderItem" i
    JOIN "Order" o ON o.id = i."orderId"
    LEFT JOIN "Product" p ON p.id = i."productId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    WHERE o.status NOT IN ('CANCELLED', 'PENDING_PAYMENT')
      AND (o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY c.id, c.name
    ORDER BY revenue DESC`;
  const byCategory: CategoryReportRow[] = categories.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName ?? 'Uncategorized',
    orders: int(r.orders),
    quantity: int(r.quantity),
    revenue: money(r.revenue),
  }));
  return {
    byStatus: byStatus.map((s) => ({ status: s.status, count: int(s.count) })),
    byCategory,
    averageOrderValue: money(totals?.average ?? null),
    totalOrders: int(totals?.orders ?? 0),
  };
}
