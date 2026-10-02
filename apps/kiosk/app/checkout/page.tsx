'use client';

import type { OrderQuoteDTO } from '@gcs/types';
import { QrCode, ShieldCheck, Smile, ThumbsUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HoldToConfirm } from '@/components/kiosk/HoldToConfirm';
import { TopBar } from '@/components/kiosk/TopBar';
import { useKioskAction } from '@/components/providers/ActionsProvider';
import { useCart } from '@/components/providers/CartProvider';
import { useInputMode } from '@/components/providers/InputModeProvider';
import { useKioskConfig, useMoney } from '@/components/providers/KioskConfigProvider';
import { useMenu } from '@/components/providers/MenuProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { isVisionReady, useVision } from '@/components/providers/VisionProvider';
import { Button } from '@/components/ui/Button';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { ErrorState, LoadingState, Spinner } from '@/components/ui/States';
import { useSmileDiscount } from '@/hooks/useSmileDiscount';
import { api, ApiError } from '@/lib/api';
import { toOrderInput } from '@/lib/cart';
import { config } from '@/lib/config';
import { formatOptionLabel } from '@/lib/format';
import { sounds } from '@/lib/sound';

type QuoteState =
  | { status: 'loading' }
  | { status: 'ready'; quote: OrderQuoteDTO }
  | { status: 'error'; message: string; network: boolean; fixInCart: boolean };

const percent = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

export default function CheckoutPage() {
  const router = useRouter();
  const money = useMoney();
  const { shop } = useKioskConfig();
  const { effectiveMode } = useInputMode();
  const { state: vision } = useVision();
  const toast = useToast();
  const { state, dispatch, hydrated } = useCart();
  const { reload } = useMenu();
  const [quote, setQuote] = useState<QuoteState>({ status: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  /** Set once the order is placed so clearing the cart doesn't redirect back to /cart. */
  const placedRef = useRef(false);

  // Smile discount: offered when the shop enables it and the camera is watching.
  const smileOffered =
    quote.status === 'ready' &&
    quote.quote.smileDiscountRate > 0 &&
    effectiveMode === 'gesture' &&
    isVisionReady(vision);
  const smile = useSmileDiscount(smileOffered);

  const input = toOrderInput(state.lines, config.kioskCode);
  const inputKey = JSON.stringify(input);

  const loadQuote = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      if (!quiet) setQuote({ status: 'loading' });
      try {
        const result = await api.quote({
          ...JSON.parse(inputKey),
          smileToken: smile.token ?? undefined,
        });
        setQuote({ status: 'ready', quote: result });
      } catch (e) {
        const err =
          e instanceof ApiError
            ? e
            : new ApiError('Could not calculate your total.', 'INTERNAL_ERROR', 0);
        setQuote({
          status: 'error',
          message: err.message,
          network: err.isNetwork,
          fixInCart: err.code === 'PRODUCT_UNAVAILABLE' || err.code === 'INVALID_OPTIONS',
        });
        if (err.code === 'PRODUCT_UNAVAILABLE') void reload({ silent: true });
      }
    },
    [inputKey, reload, smile.token],
  );

  const quoteKey = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (state.lines.length === 0) {
      if (!placedRef.current) router.replace('/cart');
      return;
    }
    // Only the smile token changed → refresh the totals in place (no loading screen).
    const quiet = quoteKey.current === inputKey;
    quoteKey.current = inputKey;

    void loadQuote({ quiet });
  }, [hydrated, inputKey, loadQuote, router, state.lines.length]);

  const smileApplied = quote.status === 'ready' && quote.quote.smileApplied;
  const celebrated = useRef(false);
  useEffect(() => {
    if (smileApplied && !celebrated.current) {
      celebrated.current = true;
      sounds.success();
      toast('😊 Thanks for the smile! Discount applied', {
        tone: 'success',
        durationMs: 3000,
        dedupeKey: 'smile',
      });
    }
  }, [smileApplied, toast]);

  const back = () => router.push('/cart');
  useKioskAction('back', submitting ? null : back);

  const placeOrder = useCallback(async () => {
    if (submittingRef.current || quote.status !== 'ready') return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await api.createOrder({
        ...JSON.parse(inputKey),
        smileToken: quote.quote.smileApplied ? (smile.token ?? undefined) : undefined,
      });
      placedRef.current = true;
      if (order.status === 'PENDING_PAYMENT') {
        // Pay first: the cart is kept until the payment is confirmed (so "try again" works).
        sounds.click();
        router.replace(`/pay/${order.id}`);
        return;
      }
      sounds.success();
      router.replace(`/order/${order.id}`);
      dispatch({ type: 'clear' });
    } catch (e) {
      sounds.invalid();
      const err = e instanceof ApiError ? e : null;
      submittingRef.current = false;
      setSubmitting(false);
      if (err?.code === 'SMILE_DISCOUNT_INVALID') {
        smile.discard();
        celebrated.current = false;
        setSubmitError(`${err.message} Or hold to order without the discount.`);
        return;
      }
      setSubmitError(err?.message ?? 'Your order could not be placed. Please try again.');
      if (err && (err.code === 'PRODUCT_UNAVAILABLE' || err.code === 'INVALID_OPTIONS'))
        void loadQuote();
    }
  }, [dispatch, inputKey, loadQuote, quote, router, smile]);

  // A held thumbs-up is an alternative deliberate confirmation.
  useKioskAction(
    'confirm',
    quote.status === 'ready' && !submitting ? () => void placeOrder() : null,
  );

  const payFirst = shop.requirePayment;

  return (
    <div className="flex h-full flex-col">
      <TopBar
        onBack={submitting ? undefined : back}
        backLabel="Edit order"
        title="Confirm your order"
        showCart={false}
      />

      {quote.status === 'loading' ? (
        <LoadingState label="Calculating your total…" />
      ) : quote.status === 'error' ? (
        <ErrorState
          title={quote.fixInCart ? 'Please update your order' : 'Could not load your total'}
          message={quote.message}
          network={quote.network}
          onRetry={quote.fixInCart ? undefined : () => void loadQuote()}
          extra={
            <Button variant="secondary" onClick={back}>
              Back to cart
            </Button>
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-wrap gap-8 px-8 pb-8 pt-6">
          <section
            className="glass flex min-h-0 min-w-[20rem] flex-1 flex-col rounded-[2rem] p-8"
            aria-label="Order summary"
          >
            <h2 className="text-display mb-4 text-4xl text-crema-50">Order summary</h2>
            <ScrollArea className="flex-1">
              <ul className="divide-y divide-crema-50/10 pb-10">
                {quote.quote.lines.map((line, i) => (
                  <li key={i} className="flex items-start justify-between gap-6 py-4">
                    <div>
                      <p className="text-2xl font-semibold text-crema-50">
                        <span className="mr-3 text-caramel-300">{line.quantity}×</span>
                        {line.productName}
                      </p>
                      {line.options.length > 0 ? (
                        <p className="mt-1 text-lg text-crema-300">
                          {line.options
                            .map((o) => formatOptionLabel(o.groupName, o.optionName))
                            .join(' • ')}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-2xl tabular-nums text-crema-100">{money(line.lineTotal)}</p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </section>

          <aside
            className="glass flex min-h-0 w-[36%] min-w-[22rem] shrink-0 flex-col overflow-y-auto rounded-[2rem] p-8"
            aria-label="Payment total"
          >
            {smileOffered ? (
              <SmilePanel
                rate={quote.quote.smileDiscountRate}
                applied={quote.quote.smileApplied}
                progress={smile.progress}
                faceDetected={smile.faceDetected}
              />
            ) : null}

            <dl className="space-y-4 text-xl">
              <div className="flex justify-between text-crema-200">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{money(quote.quote.subtotal)}</dd>
              </div>
              {quote.quote.discount > 0 ? (
                <div
                  className="flex justify-between font-semibold text-mint-300"
                  data-testid="discount-row"
                >
                  <dt>
                    {quote.quote.discountReason ?? 'Discount'} (
                    {percent(quote.quote.smileDiscountRate)})
                  </dt>
                  <dd className="tabular-nums">−{money(quote.quote.discount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-crema-200">
                <dt>Tax ({percent(quote.quote.taxRate)})</dt>
                <dd className="tabular-nums">{money(quote.quote.tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-crema-50/15 pt-4 text-4xl font-semibold text-crema-50">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(quote.quote.total)}</dd>
              </div>
            </dl>
            <p className="mt-4 flex items-center gap-2 text-base text-crema-400">
              {payFirst ? (
                <>
                  <QrCode className="size-5 shrink-0 text-caramel-300" aria-hidden /> Next: pay with
                  your phone (QR code)
                  {shop.allowCashPayment ? ' or with cash at the counter' : ''}.
                </>
              ) : (
                <>
                  <ShieldCheck className="size-5 shrink-0 text-mint-400" aria-hidden /> Prices
                  confirmed by the shop system. Pay at the counter.
                </>
              )}
            </p>

            <div className="mt-auto pt-8">
              {submitError ? (
                <p
                  className="mb-4 rounded-2xl bg-berry-500/15 px-5 py-3 text-lg text-berry-300 ring-1 ring-berry-400/30"
                  role="alert"
                >
                  {submitError}
                </p>
              ) : null}
              {submitting ? (
                <div className="flex flex-col items-center gap-3 py-6" role="status">
                  <Spinner className="size-14" />
                  <p className="text-xl text-crema-200">
                    {payFirst ? 'Preparing your payment…' : 'Sending your order to the baristas…'}
                  </p>
                </div>
              ) : (
                <HoldToConfirm
                  holdMs={config.confirmHoldMs}
                  onConfirm={() => void placeOrder()}
                  hint={
                    effectiveMode === 'gesture' ? (
                      <span className="flex items-center gap-2">
                        Pinch and hold, or show{' '}
                        <ThumbsUp className="size-5 text-caramel-300" aria-hidden /> to confirm
                      </span>
                    ) : (
                      'Press and hold to confirm'
                    )
                  }
                >
                  {payFirst ? 'Hold to pay' : 'Hold to place order'} · {money(quote.quote.total)}
                </HoldToConfirm>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function SmilePanel({
  rate,
  applied,
  progress,
  faceDetected,
}: {
  rate: number;
  applied: boolean;
  progress: number;
  faceDetected: boolean;
}) {
  if (applied) {
    return (
      <div
        className="mb-6 flex animate-pop items-center gap-4 rounded-2xl bg-mint-500/15 px-5 py-4 ring-1 ring-mint-400/40"
        role="status"
        data-testid="smile-applied"
      >
        <Smile className="size-10 shrink-0 text-mint-300" aria-hidden />
        <div>
          <p className="text-xl font-semibold text-mint-200">Thanks for the smile!</p>
          <p className="text-base text-mint-300/90">{percent(rate)} off your order</p>
        </div>
      </div>
    );
  }
  return (
    <div
      className="mb-6 rounded-2xl bg-caramel-500/10 px-5 py-4 ring-1 ring-caramel-400/30"
      data-testid="smile-offer"
    >
      <div className="flex items-center gap-4">
        <Smile
          className={`size-10 shrink-0 text-caramel-300 ${progress > 0 ? 'animate-pulse' : 'animate-float'}`}
          aria-hidden
        />
        <div>
          <p className="text-xl font-semibold text-crema-50">Smile for {percent(rate)} off!</p>
          <p className="text-base text-crema-300">
            {faceDetected
              ? 'Look at the camera and hold a big smile'
              : 'Look at the camera to get your smile discount'}
          </p>
        </div>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-crema-50/10"
        role="progressbar"
        aria-label="Smile detected"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div
          className="h-full rounded-full bg-caramel-400 transition-[width] duration-150"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
