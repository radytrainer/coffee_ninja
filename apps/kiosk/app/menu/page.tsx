'use client';

import type { ProductDTO } from '@gcs/types';
import { Coffee, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CartBar } from '@/components/kiosk/CartBar';
import { ProductCarousel } from '@/components/kiosk/ProductCarousel';
import { TopBar } from '@/components/kiosk/TopBar';
import { useKioskAction } from '@/components/providers/ActionsProvider';
import { useMenu } from '@/components/providers/MenuProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ProductImage } from '@/components/ui/ProductImage';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { EmptyState, ErrorState } from '@/components/ui/States';

const POPULAR = '__popular__';
const STORAGE_KEY = 'gcs:category';

export default function MenuPage() {
  const router = useRouter();
  const toast = useToast();
  const { status, error, categories, products, reload } = useMenu();
  const [selected, setSelected] = useState<string>(POPULAR);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSelected(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const choose = (id: string) => {
    setSelected(id);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const goHome = () => router.push('/');
  useKioskAction('back', goHome);

  const hasPopular = products.some((p) => p.featured);
  const activeId = selected === POPULAR && !hasPopular ? (categories[0]?.id ?? POPULAR) : selected;
  const visible = useMemo(
    () =>
      activeId === POPULAR
        ? products.filter((p) => p.featured)
        : products.filter((p) => p.categoryId === activeId),
    [activeId, products],
  );
  const heading =
    activeId === POPULAR ? 'Popular right now' : categories.find((c) => c.id === activeId)?.name;

  const openProduct = (product: ProductDTO) => {
    if (!product.available) {
      toast(`Sorry, ${product.name} is sold out right now.`, {
        tone: 'error',
        dedupeKey: 'sold-out',
      });
      return;
    }
    router.push(`/product/${product.id}`);
  };

  return (
    <div className="relative flex h-full flex-col">
      <TopBar onBack={goHome} backLabel="Home" title={null} />

      {status === 'error' ? (
        <ErrorState
          title="Menu unavailable"
          message={error ?? 'Could not load the menu.'}
          network
          onRetry={() => void reload()}
        />
      ) : (
        <div className="flex min-h-0 flex-1 gap-8 px-8 pb-8 pt-6 portrait:flex-col portrait:gap-5">
          {/* Category rail */}
          <nav aria-label="Categories" className="flex w-[17rem] shrink-0 flex-col portrait:w-full">
            <ScrollArea className="flex-1 portrait:flex-none">
              <ul className="flex flex-col gap-3 portrait:grid portrait:grid-cols-4">
                {status === 'loading'
                  ? Array.from({ length: 6 }, (_, i) => (
                      <li key={i} className="skeleton h-20 rounded-3xl" />
                    ))
                  : [
                      ...(hasPopular
                        ? [{ id: POPULAR, name: 'Popular', image: null as string | null }]
                        : []),
                      ...categories,
                    ].map((c) => {
                      const active = c.id === activeId;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            data-gesture-target
                            aria-pressed={active}
                            onClick={() => choose(c.id)}
                            className={`gesture-target flex w-full items-center gap-4 rounded-3xl p-3 pr-5 text-left text-xl font-medium outline-none ${
                              active
                                ? 'bg-gradient-to-r from-caramel-300 to-caramel-500 text-espresso-950 shadow-lg'
                                : 'glass text-crema-100'
                            }`}
                          >
                            <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-espresso-800">
                              {c.id === POPULAR ? (
                                <Star
                                  className="size-7 fill-caramel-300 text-caramel-300"
                                  aria-hidden
                                />
                              ) : c.image ? (
                                <ProductImage src={c.image} alt="" className="size-full" />
                              ) : (
                                <Coffee className="size-7" aria-hidden />
                              )}
                            </span>
                            {c.name}
                          </button>
                        </li>
                      );
                    })}
              </ul>
            </ScrollArea>
          </nav>

          {/* Products */}
          <section className="flex min-w-0 flex-1 flex-col" aria-labelledby="menu-heading">
            <h1 id="menu-heading" className="text-display mb-5 text-5xl text-crema-50">
              {status === 'loading' ? 'Our menu' : heading}
            </h1>
            <div className="flex min-h-0 flex-1 flex-col pb-24">
              {status === 'loading' ? (
                <div
                  className="skeleton mx-auto h-full w-[68%] rounded-[var(--radius-card)]"
                  aria-hidden
                />
              ) : visible.length === 0 ? (
                <EmptyState
                  icon={<Coffee className="size-12" aria-hidden />}
                  title="No menu items available."
                  message="Please choose another category."
                />
              ) : (
                // One card at a time; a new category starts at its first product.
                <ProductCarousel key={activeId} products={visible} onSelect={openProduct} />
              )}
            </div>
          </section>
        </div>
      )}
      <CartBar />
    </div>
  );
}
