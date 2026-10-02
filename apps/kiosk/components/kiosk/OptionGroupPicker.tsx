'use client';

import type { ProductOptionGroupDTO } from '@gcs/types';
import { Check } from 'lucide-react';
import { useMoney } from '@/components/providers/KioskConfigProvider';
import { groupLimits } from '@/lib/cart';

interface Props {
  group: ProductOptionGroupDTO;
  selected: string[];
  onToggle: (optionId: string) => void;
  missing?: boolean;
}

export function OptionGroupPicker({ group, selected, onToggle, missing = false }: Props) {
  const money = useMoney();
  const single = group.selectionType === 'SINGLE';
  const { min, max } = groupLimits(group);
  const hint = min > 0 ? 'Required' : max > 1 ? `Optional · up to ${max}` : 'Optional';
  const numeric = group.options.every((o) => /^\d+$/.test(o.name));

  return (
    <section aria-labelledby={`group-${group.id}`} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3
          id={`group-${group.id}`}
          className="text-base font-semibold uppercase tracking-[0.2em] text-crema-200"
        >
          {group.name}
        </h3>
        <span
          className={`text-base ${missing ? 'font-semibold text-berry-300' : 'text-crema-400'}`}
        >
          {missing ? 'Please choose one' : hint}
        </span>
      </div>
      <div
        role={single ? 'radiogroup' : 'group'}
        aria-labelledby={`group-${group.id}`}
        className={`grid gap-3 ${numeric ? 'grid-cols-4' : group.options.length === 2 ? 'grid-cols-2' : 'grid-cols-2 xl:grid-cols-4'}`}
      >
        {group.options.map((option) => {
          const isSelected = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              data-gesture-target
              role={single ? 'radio' : 'checkbox'}
              aria-checked={isSelected}
              disabled={!option.available}
              onClick={() => onToggle(option.id)}
              className={`chip gesture-target min-h-[3.2rem] flex-col !gap-0 py-1.5 ${numeric ? 'text-2xl font-semibold' : ''}`}
            >
              <span className="flex items-center gap-2">
                {!single && isSelected ? <Check className="size-5" aria-hidden /> : null}
                {option.name}
              </span>
              {option.priceDelta > 0 ? (
                <span
                  className={`text-sm ${isSelected ? 'text-espresso-800' : 'text-caramel-300'}`}
                >
                  +{money(option.priceDelta)}
                </span>
              ) : !option.available ? (
                <span className="text-sm">Unavailable</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
