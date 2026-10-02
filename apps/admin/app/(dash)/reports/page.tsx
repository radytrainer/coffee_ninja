'use client';

import type { OrdersReportDTO, ProductReportRow, SalesReportRow } from '@gcs/types';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { ColumnChart } from '@/components/charts';
import { Button, ErrorBanner, PageHeader } from '@/components/ui';
import { downloadCsv, isoDay, money, shortDate, toCsv } from '@/lib/format';
import { useResource } from '@/lib/hooks';

const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

export default function ReportsPage() {
  const [from, setFrom] = useState(isoDay(-29));
  const [to, setTo] = useState(isoDay(0));
  const range = `from=${from}&to=${to}`;
  const sales = useResource<SalesReportRow[]>(`/reports/sales?${range}`);
  const products = useResource<ProductReportRow[]>(`/reports/products?${range}&limit=20`);
  const orders = useResource<OrdersReportDTO>(`/reports/orders?${range}`);
  const error = sales.error ?? products.error ?? orders.error;

  const totalRevenue = sales.data?.reduce((s, r) => s + r.revenue, 0) ?? 0;
  const totalOrders = sales.data?.reduce((s, r) => s + r.orders, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Dates are in the shop's timezone · cancelled orders excluded from revenue"
        actions={
          <Button
            variant="secondary"
            icon={<Download className="size-4" aria-hidden />}
            disabled={!sales.data}
            onClick={() =>
              sales.data &&
              downloadCsv(
                `sales_${from}_${to}.csv`,
                toCsv(
                  sales.data.map((r) => ({ date: r.date, orders: r.orders, revenue: r.revenue })),
                ),
              )
            }
          >
            Export sales CSV
          </Button>
        }
      />

      {/* Filters: one row above the charts */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label>
          <span className="label">From</span>
          <input
            type="date"
            className="input"
            value={from}
            max={to}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
          />
        </label>
        <label>
          <span className="label">To</span>
          <input
            type="date"
            className="input"
            value={to}
            min={from}
            onChange={(e) => e.target.value && setTo(e.target.value)}
          />
        </label>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <Button
              key={p.days}
              variant="secondary"
              onClick={() => {
                setFrom(isoDay(-(p.days - 1)));
                setTo(isoDay(0));
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>
      {error ? <ErrorBanner message={error} /> : null}

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Totals">
        <div className="card p-5">
          <p className="label">Revenue</p>
          <p className="text-2xl font-semibold tabular-nums">{money(totalRevenue)}</p>
        </div>
        <div className="card p-5">
          <p className="label">Orders</p>
          <p className="text-2xl font-semibold tabular-nums">{totalOrders}</p>
        </div>
        <div className="card p-5">
          <p className="label">Average order</p>
          <p className="text-2xl font-semibold tabular-nums">
            {money(orders.data?.averageOrderValue ?? 0)}
          </p>
        </div>
      </section>

      <section className="card mt-6 overflow-x-auto p-6" aria-labelledby="daily">
        <h2 id="daily" className="mb-4 font-semibold">
          Revenue by day
        </h2>
        {sales.data ? (
          <ColumnChart
            data={sales.data}
            x="date"
            y="revenue"
            format={(v) => money(v)}
            formatX={shortDate}
          />
        ) : (
          <div className="h-[260px] animate-pulse rounded-xl bg-canvas" />
        )}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-brand">Show table</summary>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th text-right">Orders</th>
                <th className="th text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sales.data?.map((r) => (
                <tr key={r.date}>
                  <td className="td">{r.date}</td>
                  <td className="td text-right tabular-nums">{r.orders}</td>
                  <td className="td text-right tabular-nums">{money(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card overflow-x-auto p-6" aria-labelledby="top-products">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="top-products" className="font-semibold">
              Products
            </h2>
            <Button
              variant="ghost"
              disabled={!products.data?.length}
              onClick={() =>
                products.data &&
                downloadCsv(
                  `products_${from}_${to}.csv`,
                  toCsv(
                    products.data.map((p) => ({
                      product: p.productName,
                      quantity: p.quantity,
                      revenue: p.revenue,
                    })),
                  ),
                )
              }
            >
              CSV
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Product</th>
                <th className="th text-right">Sold</th>
                <th className="th text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.data?.length === 0 ? (
                <tr>
                  <td className="td text-ink-3" colSpan={3}>
                    No sales in this period.
                  </td>
                </tr>
              ) : null}
              {products.data?.map((p) => (
                <tr key={`${p.productId}-${p.productName}`}>
                  <td className="td">{p.productName}</td>
                  <td className="td text-right tabular-nums">{p.quantity}</td>
                  <td className="td text-right tabular-nums">{money(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card overflow-x-auto p-6" aria-labelledby="by-category">
          <h2 id="by-category" className="mb-3 font-semibold">
            Orders by category
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Category</th>
                <th className="th text-right">Orders</th>
                <th className="th text-right">Items</th>
                <th className="th text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.data?.byCategory.map((c) => (
                <tr key={c.categoryName}>
                  <td className="td">{c.categoryName}</td>
                  <td className="td text-right tabular-nums">{c.orders}</td>
                  <td className="td text-right tabular-nums">{c.quantity}</td>
                  <td className="td text-right tabular-nums">{money(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="label mt-6">Orders by status</h3>
          <div className="flex flex-wrap gap-2">
            {orders.data?.byStatus.map((s) => (
              <span key={s.status} className="rounded-lg border border-line px-3 py-1.5 text-sm">
                {s.status} <span className="font-semibold tabular-nums">{s.count}</span>
              </span>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
