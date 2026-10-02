'use client';

import type { OrderDTO } from '@gcs/types';
import { ORDER_STATUS_MESSAGES } from '@gcs/types';
import { Banknote, Check, RotateCcw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { StatusTracker } from '@/components/kiosk/StatusTracker';
import { useKioskAction } from '@/components/providers/ActionsProvider';
import { useKioskConfig, useMoney } from '@/components/providers/KioskConfigProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useOrderStatus } from '@/hooks/useOrderStatus';
import { api, ApiError } from '@/lib/api';
import { sounds } from '@/lib/sound';

const CONFETTI = Array.from({ length: 18 }, (_, i) => i);

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const { resetSession } = useSession();
  const { successResetSeconds } = useKioskConfig();
  const money = useMoney();
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const { status } = useOrderStatus(id);
  const [secondsLeft, setSecondsLeft] = useState(successResetSeconds);
  const lastStatus = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .order(id)
      .then((o) => !cancelled && setOrder(o))
      .catch(
        (e: unknown) =>
          !cancelled &&
          setError(e instanceof ApiError ? e : new ApiError('Order not found', 'NOT_FOUND', 404)),
      );
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Automatically return to the welcome screen for the next customer.
  useEffect(() => {
    const timer = window.setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (secondsLeft <= 0) resetSession();
  }, [secondsLeft, resetSession]);

  const currentStatus = status?.status ?? order?.status ?? 'NEW';
  useEffect(() => {
    const previous = lastStatus.current;
    if (
      previous &&
      previous !== currentStatus &&
      (currentStatus === 'READY' || previous === 'PENDING_PAYMENT')
    )
      sounds.success(); // ready for pickup, or cash received at the counter
    lastStatus.current = currentStatus;
  }, [currentStatus]);

  useKioskAction('back', resetSession);
  useKioskAction('confirm', resetSession);

  if (error) {
    return (
      <ErrorState
        message={error.message}
        network={error.isNetwork}
        extra={<Button onClick={resetSession}>Start over</Button>}
      />
    );
  }
  if (!order) return <LoadingState label="Confirming your order…" />;

  const ready = currentStatus === 'READY';
  const awaitingCash = currentStatus === 'PENDING_PAYMENT';
  // Paid by QR/cash (the initial fetch may predate a live "cash received").
  const paid =
    order.paidAt !== null ||
    (order.payment !== null && !awaitingCash && currentStatus !== 'CANCELLED');

  if (awaitingCash) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center px-8 text-center"
        data-testid="cash-pending"
      >
        <div className="relative flex animate-fade-up flex-col items-center">
          <div className="mb-5 flex size-24 animate-pop items-center justify-center rounded-full bg-caramel-400 text-espresso-950 shadow-[0_0_60px_rgba(243,192,122,0.45)]">
            <Banknote className="size-14" aria-hidden />
          </div>
          <p className="text-2xl font-medium uppercase tracking-[0.5em] text-caramel-300">
            Pay at the counter
          </p>
          <p
            className="text-display mt-2 text-[8rem] font-semibold leading-none text-crema-50"
            aria-label={`Order number ${order.orderNumber}`}
          >
            #{order.orderNumber}
          </p>
          <p className="text-display mt-4 text-5xl text-crema-100">
            Please pay <span className="font-semibold text-caramel-300">{money(order.total)}</span>{' '}
            in cash
          </p>
          <p className="mt-4 max-w-3xl text-2xl text-crema-300">
            Tell the barista your order number. We start making your order as soon as you&apos;ve
            paid.
          </p>
          <div className="mt-10 flex items-center gap-6">
            <Button
              onClick={resetSession}
              variant="secondary"
              icon={<RotateCcw className="size-6" aria-hidden />}
            >
              Done
            </Button>
            <p className="text-lg text-crema-400" aria-live="off">
              Returning to start in{' '}
              <span className="tabular-nums text-crema-200">{Math.max(0, secondsLeft)}</span>s
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-8 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {CONFETTI.map((i) => (
          <span
            key={i}
            className="absolute size-3 animate-steam rounded-sm"
            style={{
              left: `${(i * 53) % 100}%`,
              top: `${20 + ((i * 37) % 60)}%`,
              background: ['#f3c07a', '#6fd6a8', '#f7ecdd', '#eaa54f'][i % 4],
              animationDelay: `${(i % 6) * 0.35}s`,
              animationDuration: `${2.4 + (i % 5) * 0.4}s`,
              rotate: `${i * 29}deg`,
            }}
          />
        ))}
      </div>

      <div className="relative flex animate-fade-up flex-col items-center">
        <div className="relative mb-5 flex size-24 animate-pop items-center justify-center rounded-full bg-mint-400 text-espresso-950 shadow-[0_0_60px_rgba(111,214,168,0.5)]">
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-mint-400/40" />
          <Check className="relative size-14" strokeWidth={3} aria-hidden />
        </div>
        <p className="text-2xl font-medium uppercase tracking-[0.5em] text-mint-300">
          Order confirmed
        </p>
        <p
          className="text-display mt-2 text-[8rem] font-semibold leading-none text-crema-50"
          aria-label={`Order number ${order.orderNumber}`}
        >
          #{order.orderNumber}
        </p>
        <p className="text-display mt-3 text-5xl text-crema-100">Thank you!</p>
        <p
          className={`mt-3 text-3xl ${ready ? 'animate-pop font-semibold text-mint-300' : 'text-crema-300'}`}
          aria-live="polite"
        >
          {currentStatus === 'NEW'
            ? 'Your order is being prepared.'
            : ORDER_STATUS_MESSAGES[currentStatus]}
        </p>

        <div className="glass mt-8 w-[min(64rem,90vw)] rounded-[2rem] px-10 py-7">
          <StatusTracker status={currentStatus} />
          <p className="mt-6 text-lg text-crema-300">
            {order.items.reduce((n, i) => n + i.quantity, 0)} item(s) · Total{' '}
            <span className="font-semibold text-crema-50">{money(order.total)}</span>
            {order.discount > 0 ? (
              <span className="text-mint-300">
                {' '}
                · 😊 {order.discountReason ?? 'Discount'} −{money(order.discount)}
              </span>
            ) : null}
            {paid ? (
              <span className="font-semibold text-mint-300"> · Paid ✓</span>
            ) : (
              ' · Please pay at the counter'
            )}
          </p>
        </div>

        <div className="mt-8 flex items-center gap-6">
          <Button
            onClick={resetSession}
            variant="secondary"
            icon={<RotateCcw className="size-6" aria-hidden />}
          >
            Start new order
          </Button>
          <p className="text-lg text-crema-400" aria-live="off">
            Returning to start in{' '}
            <span className="tabular-nums text-crema-200">{Math.max(0, secondsLeft)}</span>s
          </p>
        </div>
      </div>
    </div>
  );
}
