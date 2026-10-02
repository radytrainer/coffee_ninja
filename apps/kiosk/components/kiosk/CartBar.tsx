'use client';

import { ArrowRight, ShoppingBag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/providers/CartProvider';
import { useMoney } from '@/components/providers/KioskConfigProvider';
import { fromCents } from '@/lib/cart';
import { pluralize } from '@/lib/format';

/** Floating summary shown on the menu once the cart has items. */
export function CartBar() {
  const router = useRouter();
  const { totals } = useCart();
  const money = useMoney();
  if (totals.itemCount === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
      <button
        type="button"
        data-gesture-target
        onClick={() => router.push('/cart')}
        className="btn btn-primary gesture-target pointer-events-auto animate-pop gap-6 px-10 py-5 text-2xl shadow-2xl"
        style={{ minHeight: '5rem' }}
      >
        <ShoppingBag className="size-8" aria-hidden />
        <span>{pluralize(totals.itemCount, 'item')}</span>
        <span className="h-8 w-px bg-espresso-950/30" />
        <span className="tabular-nums">{money(fromCents(totals.subtotalCents))}</span>
        <span className="flex items-center gap-2 font-bold">
          View order <ArrowRight className="size-7" aria-hidden />
        </span>
      </button>
    </div>
  );
}
