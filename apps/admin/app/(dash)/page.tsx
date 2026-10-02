'use client';

import type {
  DashboardStatsDTO,
  OrdersReportDTO,
  ProductReportRow,
  SalesReportRow,
  ShopSettingsDTO,
} from '@gcs/types';
import { SOCKET_EVENTS } from '@gcs/types';
import { BellRing, ChefHat, CircleCheck, Coffee, DollarSign, Receipt } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { ColumnChart, RankedBars } from '@/components/charts';
import { ErrorBanner, PageHeader } from '@/components/ui';
import { API_URL } from '@/lib/api';
import { money, shortDate } from '@/lib/format';
import { useResource } from '@/lib/hooks';

function Stat({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: 'neutral' | 'warn' | 'info' | 'good';
}) {
  const tones = {
    neutral: 'bg-brand-soft text-brand',
    warn: 'bg-warn-soft text-warn',
    info: 'bg-info-soft text-info',
    good: 'bg-good-soft text-good',
  };
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`flex size-11 items-center justify-center rounded-xl ${tones[tone]}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const stats = useResource<DashboardStatsDTO>('/reports/dashboard');
  const sales = useResource<SalesReportRow[]>('/reports/sales');
  const products = useResource<ProductReportRow[]>('/reports/products?limit=8');
  const orders = useResource<OrdersReportDTO>('/reports/orders');
  const settings = useResource<ShopSettingsDTO>('/settings');
  const currency = settings.data?.currency ?? 'USD';
  const fmt = (v: number) => money(v, currency);

  // Live: refresh the counters whenever an order is created or changes status.
  const reloadStats = stats.reload;
  useEffect(() => {
    const socket = io(API_URL, { withCredentials: true, transports: ['websocket', 'polling'] });
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void reloadStats(), 400);
    };
    socket.on(SOCKET_EVENTS.ORDER_CREATED, refresh);
    socket.on(SOCKET_EVENTS.ORDER_UPDATED, refresh);
    return () => {
      window.clearTimeout(timer);
      socket.disconnect();
    };
  }, [reloadStats]);

  const s = stats.data;
  const error = stats.error ?? sales.error ?? products.error ?? orders.error;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Today at a glance · updates live" />
      {error ? (
        <ErrorBanner
          message={error}
          onRetry={() => {
            void stats.reload();
            void sales.reload();
            void products.reload();
            void orders.reload();
          }}
        />
      ) : null}

      <section
        className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-6"
        aria-label="Today's statistics"
      >
        <Stat
          label="Today's orders"
          value={s ? s.todayOrders : '—'}
          icon={<Receipt className="size-5" aria-hidden />}
        />
        <Stat
          label="Today's revenue"
          value={s ? fmt(s.todayRevenue) : '—'}
          icon={<DollarSign className="size-5" aria-hidden />}
        />
        <Stat
          label="Pending"
          value={s ? s.pending : '—'}
          tone="warn"
          icon={<BellRing className="size-5" aria-hidden />}
        />
        <Stat
          label="Preparing"
          value={s ? s.accepted + s.preparing : '—'}
          tone="info"
          icon={<ChefHat className="size-5" aria-hidden />}
        />
        <Stat
          label="Ready"
          value={s ? s.ready : '—'}
          tone="good"
          icon={<Coffee className="size-5" aria-hidden />}
        />
        <Stat
          label="Completed today"
          value={s ? s.completed : '—'}
          tone="good"
          icon={<CircleCheck className="size-5" aria-hidden />}
        />
      </section>

      <section className="card mt-6 p-6" aria-labelledby="sales-title">
        <h2 id="sales-title" className="font-semibold">
          Revenue by day
        </h2>
        <p className="mb-4 text-sm text-ink-3">Last 14 days · excludes cancelled orders</p>
        {sales.data ? (
          <ColumnChart data={sales.data} x="date" y="revenue" format={fmt} formatX={shortDate} />
        ) : (
          <div className="h-[260px] animate-pulse rounded-xl bg-canvas" />
        )}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-6" aria-labelledby="popular-title">
          <h2 id="popular-title" className="font-semibold">
            Popular products
          </h2>
          <p className="mb-4 text-sm text-ink-3">Units sold · last 30 days</p>
          {products.data?.length ? (
            <RankedBars
              data={products.data}
              label="productName"
              value="quantity"
              format={(v) => `${v}`}
            />
          ) : products.data ? (
            <p className="py-10 text-center text-ink-3">No sales yet.</p>
          ) : (
            <div className="h-64 animate-pulse rounded-xl bg-canvas" />
          )}
        </section>
        <section className="card p-6" aria-labelledby="category-title">
          <h2 id="category-title" className="font-semibold">
            Revenue by category
          </h2>
          <p className="mb-4 text-sm text-ink-3">Last 30 days</p>
          {orders.data?.byCategory.length ? (
            <RankedBars
              data={orders.data.byCategory}
              label="categoryName"
              value="revenue"
              format={fmt}
            />
          ) : orders.data ? (
            <p className="py-10 text-center text-ink-3">No sales yet.</p>
          ) : (
            <div className="h-64 animate-pulse rounded-xl bg-canvas" />
          )}
        </section>
      </div>
    </>
  );
}
