import type { CreateOrderInput, ProductDTO, ProductOptionGroupDTO } from '@gcs/types';
import { formatOptionLabel } from './format';

/**
 * Pure cart & price-estimate logic. The kiosk shows estimates while browsing,
 * but the server recalculates every price at checkout (see /orders/quote).
 */

/** groupId -> selected optionIds */
export type Selections = Record<string, string[]>;

export interface CartLine {
  lineId: string;
  productId: string;
  name: string;
  image: string | null;
  quantity: number;
  selections: Selections;
  /** Estimated unit price in cents (base + options) at the time it was added. */
  unitCents: number;
  summary: string;
}

export interface CartState {
  lines: CartLine[];
}

export const MAX_QUANTITY = 20;
export const MAX_LINES = 30;

export const toCents = (amount: number) => Math.round(amount * 100);
export const fromCents = (cents: number) => cents / 100;

export function groupLimits(group: ProductOptionGroupDTO) {
  const min = group.required ? Math.max(1, group.minSelect) : group.minSelect;
  const max = group.selectionType === 'SINGLE' ? 1 : group.maxSelect;
  return { min, max };
}

/** Pre-selects defaults (or the first available option for required single-choice groups). */
export function defaultSelections(product: ProductDTO): Selections {
  const selections: Selections = {};
  for (const group of product.optionGroups) {
    const available = group.options.filter((o) => o.available);
    const defaults = available.filter((o) => o.isDefault).map((o) => o.id);
    const { min, max } = groupLimits(group);
    let picked = defaults.slice(0, max);
    if (picked.length < min) {
      const extra = available.filter((o) => !picked.includes(o.id)).slice(0, min - picked.length);
      picked = [...picked, ...extra.map((o) => o.id)];
    }
    selections[group.id] = picked;
  }
  return selections;
}

export type ToggleResult = { selections: Selections; limitReached: boolean };

/** Single-choice groups replace the selection; multi-choice groups toggle within max. */
export function toggleOption(
  product: ProductDTO,
  selections: Selections,
  groupId: string,
  optionId: string,
): ToggleResult {
  const group = product.optionGroups.find((g) => g.id === groupId);
  const option = group?.options.find((o) => o.id === optionId);
  if (!group || !option || !option.available) return { selections, limitReached: false };
  const current = selections[groupId] ?? [];
  const { min, max } = groupLimits(group);

  if (group.selectionType === 'SINGLE') {
    if (current[0] === optionId && min === 0) {
      return { selections: { ...selections, [groupId]: [] }, limitReached: false };
    }
    return { selections: { ...selections, [groupId]: [optionId] }, limitReached: false };
  }
  if (current.includes(optionId)) {
    return {
      selections: { ...selections, [groupId]: current.filter((id) => id !== optionId) },
      limitReached: false,
    };
  }
  if (current.length >= max) return { selections, limitReached: true };
  return { selections: { ...selections, [groupId]: [...current, optionId] }, limitReached: false };
}

/** Returns the names of groups that still need a choice. */
export function missingRequiredGroups(product: ProductDTO, selections: Selections): string[] {
  return product.optionGroups
    .filter((g) => (selections[g.id]?.length ?? 0) < groupLimits(g).min)
    .map((g) => g.name);
}

export function unitPriceCents(product: ProductDTO, selections: Selections): number {
  let cents = toCents(product.price);
  for (const group of product.optionGroups) {
    for (const optionId of selections[group.id] ?? []) {
      const option = group.options.find((o) => o.id === optionId);
      if (option) cents += toCents(option.priceDelta);
    }
  }
  return cents;
}

/** "Large • Oat Milk • Sugar 2" — only non-default choices worth showing. */
export function selectionSummary(product: ProductDTO, selections: Selections): string {
  const parts: string[] = [];
  for (const group of product.optionGroups) {
    for (const optionId of selections[group.id] ?? []) {
      const option = group.options.find((o) => o.id === optionId);
      if (option) parts.push(formatOptionLabel(group.name, option.name));
    }
  }
  return parts.join(' • ');
}

function sameSelections(a: Selections, b: Selections): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const x = [...(a[key] ?? [])].sort().join(',');
    const y = [...(b[key] ?? [])].sort().join(',');
    if (x !== y) return false;
  }
  return true;
}

let lineCounter = 0;
export function newLineId(): string {
  lineCounter += 1;
  return `line-${Date.now().toString(36)}-${lineCounter}`;
}

export type CartAction =
  | { type: 'add'; product: ProductDTO; selections: Selections; quantity: number }
  | {
      type: 'replace';
      lineId: string;
      product: ProductDTO;
      selections: Selections;
      quantity: number;
    }
  | { type: 'increment'; lineId: string }
  | { type: 'decrement'; lineId: string }
  | { type: 'remove'; lineId: string }
  | { type: 'restore'; line: CartLine; index: number }
  | { type: 'clear' }
  | { type: 'hydrate'; state: CartState };

const clampQty = (q: number) => Math.min(MAX_QUANTITY, Math.max(1, Math.round(q)));

function buildLine(
  product: ProductDTO,
  selections: Selections,
  quantity: number,
  lineId = newLineId(),
): CartLine {
  return {
    lineId,
    productId: product.id,
    name: product.name,
    image: product.image,
    quantity: clampQty(quantity),
    selections,
    unitCents: unitPriceCents(product, selections),
    summary: selectionSummary(product, selections),
  };
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      // Identical product + options: merge into the existing line.
      const existing = state.lines.find(
        (l) => l.productId === action.product.id && sameSelections(l.selections, action.selections),
      );
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.lineId === existing.lineId
              ? { ...l, quantity: clampQty(l.quantity + action.quantity) }
              : l,
          ),
        };
      }
      if (state.lines.length >= MAX_LINES) return state;
      return {
        lines: [...state.lines, buildLine(action.product, action.selections, action.quantity)],
      };
    }
    case 'replace':
      return {
        lines: state.lines.map((l) =>
          l.lineId === action.lineId
            ? buildLine(action.product, action.selections, action.quantity, l.lineId)
            : l,
        ),
      };
    case 'increment':
      return {
        lines: state.lines.map((l) =>
          l.lineId === action.lineId ? { ...l, quantity: clampQty(l.quantity + 1) } : l,
        ),
      };
    case 'decrement':
      return {
        lines: state.lines.map((l) =>
          l.lineId === action.lineId ? { ...l, quantity: clampQty(l.quantity - 1) } : l,
        ),
      };
    case 'remove':
      return { lines: state.lines.filter((l) => l.lineId !== action.lineId) };
    case 'restore': {
      const lines = [...state.lines];
      lines.splice(Math.min(action.index, lines.length), 0, action.line);
      return { lines };
    }
    case 'clear':
      return { lines: [] };
    case 'hydrate':
      return action.state;
    default:
      return state;
  }
}

export interface CartTotals {
  itemCount: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

export function cartTotals(lines: CartLine[], taxRate: number): CartTotals {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);
  const taxCents = Math.round(subtotalCents * taxRate);
  return {
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

/** What is sent to the server: ids and quantities only — never prices. */
export function toOrderInput(lines: CartLine[], kioskCode?: string): CreateOrderInput {
  return {
    items: lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      optionIds: Object.values(l.selections).flat(),
    })),
    ...(kioskCode ? { kioskCode } : {}),
  };
}
