'use client';

import { ArrowRight, Pencil, ShoppingBag, Trash } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/kiosk/TopBar';
import { useKioskAction } from '@/components/providers/ActionsProvider';
import { useCart } from '@/components/providers/CartProvider';
import { useKioskConfig, useMoney } from '@/components/providers/KioskConfigProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { ProductImage } from '@/components/ui/ProductImage';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { EmptyState } from '@/components/ui/States';
import { fromCents } from '@/lib/cart';

export default function CartPage() {
  const router = useRouter();
  const toast = useToast();
  const money = useMoney();
  const { shop } = useKioskConfig();
  const { state, dispatch, totals } = useCart();

  const back = () => router.push('/menu');
  useKioskAction('back', back);

  const remove = (lineId: string) => {
    const index = state.lines.findIndex((l) => l.lineId === lineId);
    const line = state.lines[index];
    if (!line) return;
    dispatch({ type: 'remove', lineId });
    toast(`Removed ${line.name}`, {
      durationMs: 5000,
      action: { label: 'Undo', onClick: () => dispatch({ type: 'restore', line, index }) },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar onBack={back} backLabel="Continue shopping" title="Your order" showCart={false} />

      {state.lines.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="size-12" aria-hidden />}
          title="Your cart is empty"
          message="Browse the menu and pinch a drink to add it."
          action={
            <Button onClick={() => router.push('/menu')} className="mt-4">
              Browse menu
            </Button>
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 gap-8 px-8 pb-8 pt-6">
          <section className="flex min-w-0 flex-1 flex-col" aria-label="Items in your order">
            <ScrollArea className="flex-1">
              <ul className="flex flex-col gap-4 pb-16">
                {state.lines.map((line, i) => (
                  <li
                    key={line.lineId}
                    className="glass flex animate-fade-up flex-wrap items-center gap-x-6 gap-y-3 rounded-[1.75rem] p-4 pr-6 max-xl:gap-x-4 max-xl:pr-4"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <ProductImage
                      src={line.image}
                      alt=""
                      className="size-28 shrink-0 rounded-2xl max-xl:size-20"
                    />
                    <div className="min-w-[9rem] flex-1">
                      <h3 className="text-display text-3xl font-semibold text-crema-50 max-xl:text-2xl">
                        {line.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-lg text-crema-300">
                        {line.summary || 'Standard'}
                      </p>
                      <p className="mt-1 text-base text-crema-400">
                        {money(fromCents(line.unitCents))} each
                      </p>
                    </div>
                    {/* Controls wrap onto their own row when space is tight (small screens / zoomed in) */}
                    <div className="ml-auto flex items-center gap-4">
                      <QuantityStepper
                        value={line.quantity}
                        label={`Quantity of ${line.name}`}
                        onIncrement={() => dispatch({ type: 'increment', lineId: line.lineId })}
                        onDecrement={() => dispatch({ type: 'decrement', lineId: line.lineId })}
                      />
                      <p className="w-32 text-right text-3xl font-semibold tabular-nums text-crema-50 max-xl:w-24 max-xl:text-2xl">
                        {money(fromCents(line.unitCents * line.quantity))}
                      </p>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          data-gesture-target
                          onClick={() =>
                            router.push(`/product/${line.productId}?edit=${line.lineId}`)
                          }
                          aria-label={`Edit ${line.name}`}
                          className="btn btn-secondary gesture-target min-h-0 px-5 py-2.5 text-base max-xl:px-3.5"
                        >
                          <Pencil className="size-5" aria-hidden />{' '}
                          <span className="max-xl:sr-only">Edit</span>
                        </button>
                        <button
                          type="button"
                          data-gesture-target
                          onClick={() => remove(line.lineId)}
                          aria-label={`Remove ${line.name}`}
                          className="btn btn-danger gesture-target min-h-0 px-5 py-2.5 text-base max-xl:px-3.5"
                        >
                          <Trash className="size-5" aria-hidden />{' '}
                          <span className="max-xl:sr-only">Remove</span>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </section>

          <aside
            className="glass flex min-h-0 w-[30%] min-w-[19rem] shrink-0 flex-col overflow-y-auto rounded-[2rem] p-8 max-xl:p-6"
            aria-label="Order total"
          >
            <h2 className="text-display text-4xl text-crema-50">Summary</h2>
            <dl className="mt-8 space-y-4 text-xl">
              <div className="flex justify-between text-crema-200">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{money(fromCents(totals.subtotalCents))}</dd>
              </div>
              <div className="flex justify-between text-crema-200">
                <dt>Tax ({Math.round(shop.taxRate * 1000) / 10}%)</dt>
                <dd className="tabular-nums">{money(fromCents(totals.taxCents))}</dd>
              </div>
              <div className="flex justify-between border-t border-crema-50/15 pt-4 text-3xl font-semibold text-crema-50">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(fromCents(totals.totalCents))}</dd>
              </div>
            </dl>
            <div className="mt-auto flex flex-col gap-4 pt-8">
              <Button
                onClick={() => router.push('/checkout')}
                className="py-6 text-2xl"
                style={{ minHeight: '5rem' }}
              >
                Checkout <ArrowRight className="size-7" aria-hidden />
              </Button>
              <Button variant="secondary" onClick={back}>
                Continue shopping
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
