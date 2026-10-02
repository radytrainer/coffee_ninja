'use client';

import type { PaymentDTO } from '@gcs/types';
import { Banknote, Clock, RotateCcw, ScanLine, Smartphone, TimerOff, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from '@/components/kiosk/TopBar';
import { useKioskAction } from '@/components/providers/ActionsProvider';
import { useCart } from '@/components/providers/CartProvider';
import { useKioskConfig, useMoney } from '@/components/providers/KioskConfigProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState, Spinner } from '@/components/ui/States';
import { useOrderStatus } from '@/hooks/useOrderStatus';
import { api, ApiError } from '@/lib/api';
import { sounds } from '@/lib/sound';

/** Seconds left until `iso`, never negative. */
function secondsUntil(iso: string, now: number) {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Pay-first screen: shows the QR code for the order and waits for the payment
 * provider to confirm it (pushed over Socket.IO). Only then does the order reach
 * the kitchen and the customer see their order number.
 */
export default function PayPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const money = useMoney();
  const { successResetSeconds, shop } = useKioskConfig();
  const { resetSession } = useSession();
  const { dispatch } = useCart();
  const { status } = useOrderStatus(id);
  const [payment, setPayment] = useState<PaymentDTO | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [choosingCash, setChoosingCash] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const done = useRef(false);

  const load = useCallback(async () => {
    try {
      setPayment(await api.payment(id));
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError('Payment not found', 'NOT_FOUND', 404));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const orderStatus = status?.status;
  const paid =
    payment?.status === 'PAID' ||
    (orderStatus !== undefined && orderStatus !== 'PENDING_PAYMENT' && orderStatus !== 'CANCELLED');
  const expired =
    payment?.status === 'EXPIRED' || payment?.status === 'CANCELLED' || orderStatus === 'CANCELLED';
  const secondsLeft = payment ? secondsUntil(payment.expiresAt, now) : 0;

  // Paid → the order goes to the baristas; show the confirmation with the order number.
  useEffect(() => {
    if (!paid || done.current) return;
    done.current = true;
    sounds.success();
    dispatch({ type: 'clear' });
    router.replace(`/order/${id}`);
  }, [dispatch, id, paid, router]);

  // Countdown reached zero: ask the server (it cancels unpaid orders when they time out).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (payment?.status === 'PENDING' && secondsLeft === 0) void load();
  }, [load, payment?.status, secondsLeft]);

  const cancel = useCallback(async () => {
    if (cancelling || paid) return;
    setCancelling(true);
    try {
      await api.cancelUnpaid(id);
    } catch {
      /* already paid/expired — the status update decides what to show */
    }
    done.current = true;
    router.replace('/checkout'); // cart is still there: change the order or pay again
  }, [cancelling, id, paid, router]);

  /** Pay at the counter instead: the order waits there until staff take the cash. */
  const payCash = useCallback(async () => {
    if (choosingCash || paid) return;
    setChoosingCash(true);
    setCashError(null);
    try {
      await api.payCash(id);
      done.current = true;
      sounds.success();
      dispatch({ type: 'clear' }); // the order is placed; only the payment is outstanding
      router.replace(`/order/${id}`);
    } catch (e) {
      sounds.invalid();
      setCashError(
        e instanceof ApiError ? e.message : 'Could not switch to cash. Please try again.',
      );
      setChoosingCash(false);
    }
  }, [choosingCash, dispatch, id, paid, router]);

  useKioskAction('back', expired ? () => router.replace('/checkout') : () => void cancel());

  // Expired screen resets itself for the next customer.
  const [resetIn, setResetIn] = useState<number | null>(null);
  useEffect(() => {
    if (!expired) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResetIn(successResetSeconds);
    const timer = window.setInterval(() => setResetIn((s) => (s === null ? s : s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [expired, successResetSeconds]);
  useEffect(() => {
    if (resetIn !== null && resetIn <= 0) resetSession();
  }, [resetIn, resetSession]);

  if (error) {
    return (
      <ErrorState
        message={error.message}
        network={error.isNetwork}
        onRetry={error.isNetwork ? () => void load() : undefined}
        extra={<Button onClick={() => router.replace('/checkout')}>Back to checkout</Button>}
      />
    );
  }
  if (!payment || paid)
    return <LoadingState label={paid ? 'Payment received!' : 'Preparing your payment…'} />;

  if (expired) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center"
        role="alert"
      >
        <div className="flex size-24 items-center justify-center rounded-full bg-berry-500/15 ring-1 ring-berry-400/30">
          <TimerOff className="size-12 text-berry-300" aria-hidden />
        </div>
        <h1 className="text-display text-5xl text-crema-50">Payment not completed</h1>
        <p className="max-w-2xl text-2xl text-crema-300">
          We didn&apos;t receive the payment in time, so the order was not sent to the baristas.
          Nothing was charged.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
          <Button
            onClick={() => router.replace('/checkout')}
            icon={<RotateCcw className="size-6" aria-hidden />}
          >
            Try again
          </Button>
          <Button variant="secondary" onClick={resetSession}>
            Start over
          </Button>
        </div>
        {resetIn !== null ? (
          <p className="text-lg text-crema-400">
            Returning to start in{' '}
            <span className="tabular-nums text-crema-200">{Math.max(0, resetIn)}</span>s
          </p>
        ) : null}
      </div>
    );
  }

  const urgent = secondsLeft <= 30;

  return (
    <div className="flex h-full flex-col">
      <TopBar
        onBack={cancelling ? undefined : () => void cancel()}
        backLabel="Cancel"
        title="Scan to pay"
        showCart={false}
      />
      <div className="flex min-h-0 flex-1 flex-wrap items-center justify-center gap-10 overflow-y-auto px-8 pb-8 pt-4">
        <figure className="flex shrink-0 flex-col items-center gap-4">
          <div className="rounded-[2rem] bg-white p-5 shadow-[0_0_80px_rgba(243,192,122,0.25)]">
            {payment.qrSvg ? (
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(payment.qrSvg)}`}
                alt={`QR code to pay ${money(payment.amount)} for order ${payment.orderNumber}`}
                className="size-[min(26rem,55vh)]"
                data-testid="payment-qr"
              />
            ) : (
              <div className="flex size-[min(26rem,55vh)] items-center justify-center">
                <Spinner className="size-14" />
              </div>
            )}
          </div>
          <figcaption className="flex items-center gap-2 text-lg text-crema-300">
            <ScanLine className="size-5 text-caramel-300" aria-hidden /> Scan with your phone
          </figcaption>
        </figure>

        <section
          className="glass flex w-[min(34rem,100%)] flex-col gap-6 rounded-[2rem] p-8"
          aria-label="Payment"
        >
          <div>
            <p className="text-lg uppercase tracking-[0.3em] text-crema-400">Amount to pay</p>
            <p
              className="text-display text-7xl font-semibold tabular-nums text-crema-50"
              data-testid="payment-amount"
            >
              {money(payment.amount)}
            </p>
            <p className="mt-1 text-xl text-crema-300">Order #{payment.orderNumber}</p>
          </div>

          <ol className="space-y-3 text-xl text-crema-200">
            <li className="flex items-center gap-3">
              <Smartphone className="size-6 shrink-0 text-caramel-300" aria-hidden /> Open your
              banking app or phone camera
            </li>
            <li className="flex items-center gap-3">
              <ScanLine className="size-6 shrink-0 text-caramel-300" aria-hidden /> Scan the QR code
              and confirm the payment
            </li>
          </ol>

          <div
            className="flex items-center gap-4 rounded-2xl bg-crema-50/5 px-5 py-4"
            role="status"
            aria-live="polite"
          >
            <Spinner className="size-8" />
            <div className="flex-1">
              <p className="text-xl font-semibold text-crema-50">Waiting for payment…</p>
              <p className="text-base text-crema-400">
                Your order goes to the baristas as soon as it&apos;s paid.
              </p>
            </div>
            <p
              className={`flex items-center gap-2 text-2xl font-semibold tabular-nums ${urgent ? 'animate-pulse text-berry-300' : 'text-crema-200'}`}
              aria-label={`${secondsLeft} seconds left`}
            >
              <Clock className="size-6" aria-hidden />
              {mmss(secondsLeft)}
            </p>
          </div>

          {payment.provider === 'demo' ? (
            <p className="text-sm text-crema-400">
              Demo payment — the QR opens a test page; no real money is charged.
            </p>
          ) : null}

          {shop.allowCashPayment ? (
            <div className="flex flex-col gap-2 border-t border-crema-50/10 pt-5">
              <p className="text-lg text-crema-300">No phone payment?</p>
              <Button
                onClick={() => void payCash()}
                disabled={choosingCash}
                icon={<Banknote className="size-6" aria-hidden />}
              >
                Pay with cash at the counter
              </Button>
              {cashError ? (
                <p className="text-base text-berry-300" role="alert">
                  {cashError}
                </p>
              ) : null}
            </div>
          ) : null}

          <Button
            variant="secondary"
            onClick={() => void cancel()}
            disabled={cancelling}
            icon={<X className="size-6" aria-hidden />}
          >
            Cancel payment
          </Button>
        </section>
      </div>
    </div>
  );
}
