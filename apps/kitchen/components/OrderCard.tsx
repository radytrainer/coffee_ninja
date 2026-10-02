'use client';

import type { OrderDTO, OrderStatus } from '@gcs/types';
import { Clock, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { elapsedLabel, nextAction, urgency } from '@/lib/board';

const urgencyStyle = {
  fresh: 'text-mint-300 bg-mint-500/10',
  waiting: 'text-caramel-300 bg-caramel-500/15',
  late: 'text-berry-300 bg-berry-500/20 animate-pulse',
};

const actionStyle: Record<string, string> = {
  ACCEPTED: 'bg-sky-400 text-espresso-950 hover:brightness-110',
  PREPARING: 'bg-caramel-400 text-espresso-950 hover:bg-caramel-300',
  READY: 'bg-mint-400 text-espresso-950 hover:bg-mint-300',
  COMPLETED: 'bg-crema-100 text-espresso-950 hover:bg-crema-50',
};

interface Props {
  order: OrderDTO;
  now: number;
  fresh: boolean;
  busy: boolean;
  onStatus: (order: OrderDTO, status: OrderStatus) => void;
}

export function OrderCard({ order, now, fresh, busy, onStatus }: Props) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const action = nextAction(order.status);
  const level = urgency(order.createdAt, now);

  useEffect(() => {
    if (!confirmCancel) return;
    const t = window.setTimeout(() => setConfirmCancel(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmCancel]);

  return (
    <article
      className={`card flex flex-col gap-4 rounded-2xl p-5 ${fresh ? 'animate-arrive ring-2 ring-caramel-400' : ''}`}
      aria-label={`Order ${order.orderNumber}, ${order.status.toLowerCase()}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-4xl font-semibold leading-none text-crema-50">
            #{order.orderNumber}
          </h3>
          {order.status === 'ACCEPTED' ? (
            <span className="mt-2 inline-block rounded-full bg-sky-400/15 px-2.5 py-0.5 text-sm font-medium text-sky-400">
              Accepted — not started
            </span>
          ) : null}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-base font-semibold tabular-nums ${urgencyStyle[level]}`}
        >
          <Clock className="size-4" aria-hidden /> {elapsedLabel(order.createdAt, now)}
        </span>
      </header>

      <ul className="flex flex-col gap-2.5">
        {order.items.map((item) => (
          <li key={item.id} className="leading-snug">
            <p className="text-xl font-semibold text-crema-50">
              <span className="mr-2 text-caramel-300">{item.quantity}×</span>
              {item.productName}
            </p>
            {item.options.length > 0 ? (
              <p className="text-base text-crema-300">
                {item.options
                  .map((o) =>
                    /^\d+$/.test(o.optionName) ? `${o.groupName} ${o.optionName}` : o.optionName,
                  )
                  .join(' • ')}
              </p>
            ) : null}
            {item.notes ? (
              <p className="text-base italic text-caramel-300">“{item.notes}”</p>
            ) : null}
          </li>
        ))}
      </ul>

      <footer className="mt-auto flex gap-2">
        {action ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus(order, action.status)}
            className={`kbtn flex-1 text-xl uppercase tracking-wide ${actionStyle[action.status]}`}
          >
            {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
            {action.label}
          </button>
        ) : null}
        {order.status !== 'READY' ? (
          confirmCancel ? (
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
              aria-label={`Cancel order ${order.orderNumber}`}
              onClick={() => setConfirmCancel(true)}
              className="kbtn bg-crema-50/5 px-3 text-crema-300 hover:bg-berry-500/20 hover:text-berry-300"
            >
              <X className="size-5" aria-hidden />
            </button>
          )
        ) : null}
      </footer>
    </article>
  );
}
