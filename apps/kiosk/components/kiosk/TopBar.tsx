'use client';

import { ArrowLeft, CircleQuestionMark, Coffee, ShoppingBag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCart } from '@/components/providers/CartProvider';
import { useKioskConfig, useMoney } from '@/components/providers/KioskConfigProvider';
import { fromCents } from '@/lib/cart';
import { HandStatus } from './HandStatus';

interface Props {
  onBack?: () => void;
  backLabel?: string;
  title?: ReactNode;
  showCart?: boolean;
  showHelp?: boolean;
}

export function TopBar({
  onBack,
  backLabel = 'Back',
  title,
  showCart = true,
  showHelp = true,
}: Props) {
  const router = useRouter();
  const { totals } = useCart();
  const { shop } = useKioskConfig();
  const money = useMoney();

  return (
    <header className="relative z-20 flex items-center gap-5 px-8 pt-6">
      {onBack ? (
        <button
          type="button"
          data-gesture-target
          onClick={onBack}
          className="btn btn-secondary gesture-target min-h-0 px-6 py-3 text-lg"
        >
          <ArrowLeft className="size-6" aria-hidden />
          {backLabel}
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-caramel-300 to-caramel-600 text-espresso-950 shadow-lg">
            <Coffee className="size-8" aria-hidden />
          </div>
          <span className="text-display text-3xl font-semibold text-crema-50">{shop.shopName}</span>
        </div>
      )}

      <div className="min-w-0 flex-1 truncate text-center text-display text-3xl text-crema-50">
        {title}
      </div>

      <HandStatus compact />

      {showHelp ? (
        <button
          type="button"
          data-gesture-target
          aria-label="How to use gestures"
          onClick={() => router.push('/help')}
          className="icon-btn gesture-target"
        >
          <CircleQuestionMark className="size-7" aria-hidden />
        </button>
      ) : null}

      {showCart ? (
        <button
          type="button"
          data-gesture-target
          onClick={() => router.push('/cart')}
          className="btn btn-secondary gesture-target min-h-0 py-3 pl-5 pr-6 text-lg"
          aria-label={`View cart, ${totals.itemCount} items`}
        >
          <span className="relative">
            <ShoppingBag className="size-7" aria-hidden />
            {totals.itemCount > 0 ? (
              <span
                key={totals.itemCount}
                className="absolute -right-3 -top-3 flex size-7 animate-pop items-center justify-center rounded-full bg-caramel-400 text-sm font-bold text-espresso-950"
              >
                {totals.itemCount}
              </span>
            ) : null}
          </span>
          <span className="tabular-nums">{money(fromCents(totals.subtotalCents))}</span>
        </button>
      ) : null}
    </header>
  );
}
