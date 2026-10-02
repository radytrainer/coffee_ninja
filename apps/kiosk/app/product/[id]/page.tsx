'use client';

import type { ProductDTO } from '@gcs/types';
import { Coffee, ShoppingBag } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { OptionGroupPicker } from '@/components/kiosk/OptionGroupPicker';
import { TopBar } from '@/components/kiosk/TopBar';
import { useKioskAction } from '@/components/providers/ActionsProvider';
import { useCart } from '@/components/providers/CartProvider';
import { useMoney } from '@/components/providers/KioskConfigProvider';
import { useMenu } from '@/components/providers/MenuProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { ProductImage } from '@/components/ui/ProductImage';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { ErrorState, LoadingState } from '@/components/ui/States';
import {
  type Selections,
  defaultSelections,
  fromCents,
  MAX_QUANTITY,
  missingRequiredGroups,
  toggleOption,
  unitPriceCents,
} from '@/lib/cart';

export default function ProductPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ProductScreen />
    </Suspense>
  );
}

function ProductScreen() {
  const { id } = useParams<{ id: string }>();
  const editLineId = useSearchParams().get('edit');
  const router = useRouter();
  const { status, error, productById, reload } = useMenu();
  const { state } = useCart();
  const product = productById(id);
  const editingLine = editLineId ? state.lines.find((l) => l.lineId === editLineId) : undefined;

  const back = () => router.push(editingLine ? '/cart' : '/menu');
  useKioskAction('back', back);

  if (status === 'loading') return <LoadingState label="Loading menu…" />;
  if (status === 'error') {
    return (
      <ErrorState
        message={error ?? 'Could not load this item.'}
        network
        onRetry={() => void reload()}
      />
    );
  }
  if (!product || !product.available) {
    return (
      <div className="flex h-full flex-col">
        <TopBar onBack={back} backLabel="Menu" />
        <ErrorState
          title="Item unavailable"
          message="Sorry, this item is no longer available. Please choose something else."
          extra={<Button onClick={() => router.push('/menu')}>Back to menu</Button>}
        />
      </div>
    );
  }
  return (
    <Customizer
      key={product.id + (editingLine?.lineId ?? '')}
      product={product}
      initialSelections={editingLine?.selections}
      initialQuantity={editingLine?.quantity}
      editLineId={editingLine?.lineId}
      onBack={back}
    />
  );
}

function Customizer({
  product,
  initialSelections,
  initialQuantity,
  editLineId,
  onBack,
}: {
  product: ProductDTO;
  initialSelections?: Selections;
  initialQuantity?: number;
  editLineId?: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const money = useMoney();
  const { dispatch } = useCart();
  const [selections, setSelections] = useState<Selections>(
    () => initialSelections ?? defaultSelections(product),
  );
  const [quantity, setQuantity] = useState(initialQuantity ?? 1);
  const [showMissing, setShowMissing] = useState(false);

  const unitCents = useMemo(() => unitPriceCents(product, selections), [product, selections]);
  const missing = missingRequiredGroups(product, selections);

  const toggle = (groupId: string, optionId: string) => {
    const result = toggleOption(product, selections, groupId, optionId);
    if (result.limitReached) {
      const group = product.optionGroups.find((g) => g.id === groupId);
      toast(`You can choose up to ${group?.maxSelect} ${group?.name.toLowerCase()}.`, {
        dedupeKey: 'limit',
      });
      return;
    }
    setSelections(result.selections);
  };

  const addToCart = () => {
    if (missing.length > 0) {
      setShowMissing(true);
      toast(`Please choose: ${missing.join(', ')}`, { tone: 'error', dedupeKey: 'missing' });
      return;
    }
    if (editLineId) {
      dispatch({ type: 'replace', lineId: editLineId, product, selections, quantity });
      toast(`Updated ${product.name}`, { tone: 'success' });
      router.push('/cart');
    } else {
      dispatch({ type: 'add', product, selections, quantity });
      toast(`Added ${quantity > 1 ? `${quantity} × ` : ''}${product.name} to your order`, {
        tone: 'success',
      });
      router.push('/menu');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar onBack={onBack} backLabel={editLineId ? 'Cart' : 'Menu'} />
      <div className="flex min-h-0 flex-1 gap-8 px-8 pb-8 pt-6 portrait:flex-col portrait:gap-6">
        {/* Product details */}
        <section
          className="flex w-[34%] shrink-0 animate-fade-up flex-col portrait:w-full"
          aria-labelledby="product-name"
        >
          <div className="relative overflow-hidden rounded-[2rem] shadow-2xl">
            <ProductImage
              src={product.image}
              alt={product.name}
              className="aspect-square max-h-[52vh] w-full portrait:aspect-[21/9] portrait:max-h-[26vh]"
            />
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-espresso-950/70 to-transparent" />
          </div>
          <h1
            id="product-name"
            className="text-display mt-5 text-6xl font-semibold text-crema-50 portrait:mt-4"
          >
            {product.name}
          </h1>
          <p className="mt-2 text-xl text-crema-300">{product.description}</p>
          <p className="mt-3 text-xl text-crema-400">
            Base price{' '}
            <span className="font-semibold text-caramel-300">{money(product.price)}</span>
          </p>
        </section>

        {/* Customization */}
        <section
          className="glass flex min-w-0 flex-1 flex-col rounded-[2rem] px-7 py-6"
          aria-label="Customize your drink"
        >
          <h2 className="mb-3 flex items-center gap-3 text-xl font-semibold text-crema-50">
            <Coffee className="size-7 text-caramel-300" aria-hidden />
            {product.optionGroups.length > 0 ? 'Make it yours' : 'Ready to add'}
          </h2>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-4 pb-4">
              {product.optionGroups.length === 0 ? (
                <p className="text-xl text-crema-300">
                  This item has no options. Choose a quantity and add it to your order.
                </p>
              ) : (
                product.optionGroups.map((group) => (
                  <OptionGroupPicker
                    key={group.id}
                    group={group}
                    selected={selections[group.id] ?? []}
                    onToggle={(optionId) => toggle(group.id, optionId)}
                    missing={showMissing && missing.includes(group.name)}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-crema-50/10 pt-4">
            <QuantityStepper
              value={quantity}
              size="lg"
              onIncrement={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
              onDecrement={() => setQuantity((q) => Math.max(1, q - 1))}
            />
            <div className="flex-1 text-right">
              <p className="text-base text-crema-400">
                {quantity > 1 ? `${quantity} × ${money(fromCents(unitCents))}` : 'Price'}
              </p>
              <p
                key={unitCents * quantity}
                className="animate-pop text-4xl font-semibold tabular-nums text-crema-50"
              >
                {money(fromCents(unitCents * quantity))}
              </p>
            </div>
            <Button
              onClick={addToCart}
              className="ml-auto shrink-0 whitespace-nowrap px-10 py-5 text-2xl"
              icon={<ShoppingBag className="size-7" aria-hidden />}
            >
              {editLineId ? 'Update item' : 'Add to cart'}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
