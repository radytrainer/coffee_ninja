'use client';

import {
  ORDER_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  type OrderDTO,
  type OrderStatus,
  type Paginated,
} from '@gcs/types';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, ErrorBanner, Modal, PageHeader, TableShell } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, money, time } from '@/lib/format';
import { errorMessage, useResource } from '@/lib/hooks';

const statusTone: Record<OrderStatus, 'warn' | 'info' | 'brand' | 'good' | 'neutral' | 'bad'> = {
  PENDING_PAYMENT: 'neutral',
  NEW: 'warn',
  ACCEPTED: 'info',
  PREPARING: 'brand',
  READY: 'good',
  COMPLETED: 'neutral',
  CANCELLED: 'bad',
};

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={statusTone[status]}>{status === 'PENDING_PAYMENT' ? 'UNPAID' : status}</Badge>
  );
}

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<OrderDTO | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status) params.set('status', status);
  if (query) params.set('search', query);
  const { data, error, loading, reload } = useResource<Paginated<OrderDTO>>(
    `/orders?${params.toString()}`,
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader title="Orders" subtitle={data ? `${data.total} orders` : undefined} />
      {error ? <ErrorBanner message={error} onRetry={() => void reload()} /> : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form
          className="relative w-full sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <Search className="absolute left-3 top-2.5 size-4 text-ink-3" aria-hidden />
          <input
            className="input w-full pl-9 sm:w-56"
            placeholder="Order number, e.g. A1025"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search orders"
          />
        </form>
        <select
          className="input w-full sm:w-44"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'PENDING_PAYMENT' ? 'UNPAID (waiting for QR payment)' : s}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[44rem]">
          <thead className="border-b border-line bg-canvas/60">
            <tr>
              <th className="th">Order</th>
              <th className="th">Placed</th>
              <th className="th">Items</th>
              <th className="th">Status</th>
              <th className="th text-right">Total</th>
            </tr>
          </thead>
          <TableShell loading={loading && !data} empty={data?.items.length === 0} colSpan={5}>
            {data?.items.map((o) => (
              <tr
                key={o.id}
                className="cursor-pointer hover:bg-canvas/60"
                onClick={() => setSelected(o)}
              >
                <td className="td font-semibold">#{o.orderNumber}</td>
                <td className="td text-ink-2">{dateTime(o.createdAt)}</td>
                <td className="td text-ink-2">
                  {o.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}
                </td>
                <td className="td">
                  <StatusBadge status={o.status} />
                </td>
                <td className="td text-right tabular-nums">{money(o.total)}</td>
              </tr>
            ))}
          </TableShell>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3 text-sm text-ink-3">
        Page {page} of {pages}
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          aria-label="Previous page"
          icon={<ChevronLeft className="size-4" aria-hidden />}
        />
        <Button
          variant="secondary"
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
          aria-label="Next page"
          icon={<ChevronRight className="size-4" aria-hidden />}
        />
      </div>

      {selected ? (
        <OrderDetail
          orderId={selected.id}
          onClose={() => setSelected(null)}
          onChanged={() => void reload()}
        />
      ) : null}
    </>
  );
}

function OrderDetail({
  orderId,
  onClose,
  onChanged,
}: {
  orderId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data: order, error, reload } = useResource<OrderDTO>(`/orders/${orderId}`);
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const change = async (status: OrderStatus) => {
    setBusy(status);
    setActionError(null);
    try {
      await api.patch(`/orders/${orderId}/status`, { status, note: 'Updated from admin' });
      await reload();
      onChanged();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title={order ? `Order #${order.orderNumber}` : 'Order'} onClose={onClose} wide>
      {error ? <ErrorBanner message={error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {!order ? (
        <p className="text-ink-3">Loading…</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <StatusBadge status={order.status} />
              <span className="text-sm text-ink-3">{dateTime(order.createdAt)}</span>
            </div>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-4 px-4 py-3 text-sm">
                  <div>
                    <p className="font-semibold">
                      {i.quantity}× {i.productName}
                    </p>
                    <p className="text-ink-3">
                      {i.options
                        .map(
                          (o) =>
                            `${o.groupName}: ${o.optionName}${o.priceDelta ? ` (+${money(o.priceDelta)})` : ''}`,
                        )
                        .join(' · ') || 'No options'}
                    </p>
                  </div>
                  <span className="tabular-nums">{money(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between text-ink-2">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{money(order.subtotal)}</dd>
              </div>
              {order.discount > 0 ? (
                <div className="flex justify-between text-good">
                  <dt>{order.discountReason ?? 'Discount'}</dt>
                  <dd className="tabular-nums">−{money(order.discount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-ink-2">
                <dt>Tax ({Math.round(order.taxRate * 1000) / 10}%)</dt>
                <dd className="tabular-nums">{money(order.tax)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(order.total)}</dd>
              </div>
              <div className="flex justify-between text-ink-3">
                <dt>Payment</dt>
                <dd>
                  {order.paidAt
                    ? `Paid ${order.payment?.provider === 'cash' ? 'in cash' : 'by QR'} · ${time(order.paidAt)}`
                    : order.status === 'PENDING_PAYMENT'
                      ? order.payment?.provider === 'cash'
                        ? 'Paying cash at the counter'
                        : 'Waiting for QR payment'
                      : 'Not paid'}
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              {ORDER_STATUS_TRANSITIONS[order.status].map((next) => (
                <Button
                  key={next}
                  variant={next === 'CANCELLED' ? 'danger' : 'primary'}
                  busy={busy === next}
                  onClick={() => void change(next)}
                >
                  {order.status === 'PENDING_PAYMENT' && next === 'NEW'
                    ? 'Mark paid (cash)'
                    : `Mark ${next.toLowerCase()}`}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="label">Status history</h3>
            <ol className="relative mt-2 space-y-4 border-l-2 border-line pl-4">
              {order.statusHistory?.map((h) => (
                <li key={h.id} className="text-sm">
                  <span className="absolute -left-[7px] mt-1.5 size-3 rounded-full bg-brand" />
                  <p className="font-semibold">{h.status}</p>
                  <p className="tabular-nums text-ink-3">{time(h.createdAt)}</p>
                  <p className="text-ink-3">
                    {h.changedBy?.name ?? 'Kiosk'}
                    {h.note ? ` · ${h.note}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
}
