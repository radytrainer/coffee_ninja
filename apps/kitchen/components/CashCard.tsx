'use client';

import type { OrderDTO, OrderStatus } from '@gcs/types';
import { Banknote, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  order: OrderDTO;
  now: number;
  busy: boolean;
  money: (value: number) => string;
  onStatus: (order: OrderDTO, status: OrderStatus) => void;
}

/** Unpaid order whose customer is coming to the counter to pay cash. */
export function CashCard({ order, now, busy, money, onStatus }: Props) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const items = order.items.reduce((n, i) => n + i.quantity, 0);
  const secondsLeft = order.payment
    ? Math.max(0, Math.round((Date.parse(order.payment.expiresAt) - now) / 1000))
    : 0;

  useEffect(() => {
    if (!confirmCancel) return;
    const t = window.setTimeout(() => setConfirmCancel(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmCancel]);

  return (
    <article
      className="card flex min-w-[17rem] flex-col gap-3 rounded-2xl p-4 ring-1 ring-caramel-400/40"
      aria-label={`Order ${order.orderNumber}, awaiting cash`}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-3xl font-semibold leading-none text-crema-50">
          #{order.orderNumber}
        </h3>
        <p
          className="text-3xl font-bold tabular-nums text-caramel-300"
          aria-label={`Amount due ${money(order.total)}`}
        >
          {money(order.total)}
        </p>
      </header>
      <p className="truncate text-base text-crema-300">
        {items} item{items === 1 ? '' : 's'} · {order.items.map((i) => i.productName).join(', ')}
      </p>
      <p className="text-sm tabular-nums text-crema-400">
        Cancels automatically in {Math.floor(secondsLeft / 60)}:
        {String(secondsLeft % 60).padStart(2, '0')}
      </p>
      <footer className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onStatus(order, 'NEW')}
          className="kbtn flex-1 bg-mint-400 text-lg uppercase tracking-wide text-espresso-950 hover:bg-mint-300"
        >
          {busy ? (
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
          ) : (
            <Banknote className="size-5" aria-hidden />
          )}
          Cash received
        </button>
        {confirmCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus(order, 'CANCELLED')}
            className="kbtn bg-berry-500 text-white hover:bg-berry-400"
          >
            Confirm cancel
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            aria-label={`Cancel unpaid order ${order.orderNumber}`}
            onClick={() => setConfirmCancel(true)}
            className="kbtn bg-crema-50/5 px-3 text-crema-300 hover:bg-berry-500/20 hover:text-berry-300"
          >
            <X className="size-5" aria-hidden />
          </button>
        )}
      </footer>
    </article>
  );
}
