import { Minus, Plus } from 'lucide-react';
import { MAX_QUANTITY } from '@/lib/cart';

interface Props {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  size?: 'md' | 'lg';
  label?: string;
}

export function QuantityStepper({
  value,
  onIncrement,
  onDecrement,
  size = 'md',
  label = 'Quantity',
}: Props) {
  const btn = size === 'lg' ? 'size-16' : 'size-13';
  return (
    <div
      className="glass flex items-center gap-2 rounded-full p-1.5"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        data-gesture-target
        aria-label="Decrease quantity"
        disabled={value <= 1}
        onClick={onDecrement}
        className={`gesture-target inline-flex ${btn} items-center justify-center rounded-full bg-crema-50/10 text-crema-50 outline-none`}
      >
        <Minus className="size-6" aria-hidden />
      </button>
      <span
        className={`min-w-12 text-center font-semibold tabular-nums ${size === 'lg' ? 'text-3xl' : 'text-2xl'}`}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        data-gesture-target
        aria-label="Increase quantity"
        disabled={value >= MAX_QUANTITY}
        onClick={onIncrement}
        className={`gesture-target inline-flex ${btn} items-center justify-center rounded-full bg-caramel-400 text-espresso-950 outline-none`}
      >
        <Plus className="size-6" aria-hidden />
      </button>
    </div>
  );
}
