import type { ProductDTO } from '@gcs/types';
import { describe, expect, it } from 'vitest';
import {
  cartReducer,
  cartTotals,
  defaultSelections,
  missingRequiredGroups,
  selectionSummary,
  toggleOption,
  toOrderInput,
  unitPriceCents,
  type CartState,
} from './cart';

const opt = (id: string, groupId: string, name: string, priceDelta = 0, isDefault = false) => ({
  id,
  groupId,
  name,
  priceDelta,
  isDefault,
  available: true,
  sortOrder: 0,
});

export const latte: ProductDTO = {
  id: 'latte',
  name: 'Latte',
  description: 'Creamy espresso with steamed milk',
  price: 2.5,
  image: '/static/products/latte.svg',
  categoryId: 'coffee',
  available: true,
  featured: true,
  sortOrder: 1,
  createdAt: '',
  updatedAt: '',
  optionGroups: [
    {
      id: 'size',
      name: 'Size',
      description: null,
      selectionType: 'SINGLE',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 1,
      options: [
        opt('small', 'size', 'Small', 0, true),
        opt('medium', 'size', 'Medium', 0.5),
        opt('large', 'size', 'Large', 1),
      ],
    },
    {
      id: 'milk',
      name: 'Milk',
      description: null,
      selectionType: 'SINGLE',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 2,
      options: [
        opt('regular', 'milk', 'Regular Milk', 0, true),
        opt('oat', 'milk', 'Oat Milk', 0.5),
      ],
    },
    {
      id: 'sugar',
      name: 'Sugar',
      description: null,
      selectionType: 'SINGLE',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 3,
      options: [opt('s0', 'sugar', '0'), opt('s1', 'sugar', '1', 0, true), opt('s2', 'sugar', '2')],
    },
    {
      id: 'extras',
      name: 'Extras',
      description: null,
      selectionType: 'MULTIPLE',
      required: false,
      minSelect: 0,
      maxSelect: 2,
      sortOrder: 4,
      options: [
        opt('vanilla', 'extras', 'Vanilla', 0.3),
        opt('caramel', 'extras', 'Caramel', 0.3),
        opt('shot', 'extras', 'Extra Espresso', 0.8),
      ],
    },
  ],
};

describe('customization', () => {
  it('pre-selects defaults for required groups', () => {
    expect(defaultSelections(latte)).toEqual({
      size: ['small'],
      milk: ['regular'],
      sugar: ['s1'],
      extras: [],
    });
  });

  it('replaces single-choice selections and toggles multi-choice within the limit', () => {
    let s = defaultSelections(latte);
    s = toggleOption(latte, s, 'size', 'large').selections;
    expect(s.size).toEqual(['large']);
    s = toggleOption(latte, s, 'extras', 'vanilla').selections;
    s = toggleOption(latte, s, 'extras', 'caramel').selections;
    const blocked = toggleOption(latte, s, 'extras', 'shot');
    expect(blocked.limitReached).toBe(true);
    expect(blocked.selections.extras).toEqual(['vanilla', 'caramel']);
    s = toggleOption(latte, s, 'extras', 'vanilla').selections;
    expect(s.extras).toEqual(['caramel']);
  });

  it('computes a dynamic price from base + options', () => {
    let s = defaultSelections(latte);
    expect(unitPriceCents(latte, s)).toBe(250);
    s = toggleOption(latte, s, 'size', 'large').selections;
    s = toggleOption(latte, s, 'milk', 'oat').selections;
    s = toggleOption(latte, s, 'extras', 'vanilla').selections;
    // 2.50 + 1.00 + 0.50 + 0.30
    expect(unitPriceCents(latte, s)).toBe(430);
  });

  it('builds a readable summary', () => {
    let s = defaultSelections(latte);
    s = toggleOption(latte, s, 'size', 'large').selections;
    s = toggleOption(latte, s, 'milk', 'oat').selections;
    s = toggleOption(latte, s, 'sugar', 's2').selections;
    expect(selectionSummary(latte, s)).toBe('Large • Oat Milk • Sugar 2');
  });

  it('reports missing required groups', () => {
    expect(
      missingRequiredGroups(latte, { size: [], milk: ['regular'], sugar: [], extras: [] }),
    ).toEqual(['Size', 'Sugar']);
  });
});

describe('cart reducer', () => {
  const empty: CartState = { lines: [] };
  const base = defaultSelections(latte);

  it('adds items and merges identical customizations', () => {
    let state = cartReducer(empty, { type: 'add', product: latte, selections: base, quantity: 1 });
    state = cartReducer(state, {
      type: 'add',
      product: latte,
      selections: { ...base },
      quantity: 2,
    });
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]!.quantity).toBe(3);

    const large = toggleOption(latte, base, 'size', 'large').selections;
    state = cartReducer(state, { type: 'add', product: latte, selections: large, quantity: 1 });
    expect(state.lines).toHaveLength(2);
  });

  it('increments, decrements (min 1), clamps to max and removes', () => {
    let state = cartReducer(empty, { type: 'add', product: latte, selections: base, quantity: 1 });
    const id = state.lines[0]!.lineId;
    state = cartReducer(state, { type: 'decrement', lineId: id });
    expect(state.lines[0]!.quantity).toBe(1);
    state = cartReducer(state, { type: 'increment', lineId: id });
    expect(state.lines[0]!.quantity).toBe(2);
    state = cartReducer(state, { type: 'add', product: latte, selections: base, quantity: 50 });
    expect(state.lines[0]!.quantity).toBe(20);
    const removed = cartReducer(state, { type: 'remove', lineId: id });
    expect(removed.lines).toHaveLength(0);
    const restored = cartReducer(removed, { type: 'restore', line: state.lines[0]!, index: 0 });
    expect(restored.lines[0]!.lineId).toBe(id);
  });

  it('edits a line in place', () => {
    let state = cartReducer(empty, { type: 'add', product: latte, selections: base, quantity: 1 });
    const id = state.lines[0]!.lineId;
    const large = toggleOption(latte, base, 'size', 'large').selections;
    state = cartReducer(state, {
      type: 'replace',
      lineId: id,
      product: latte,
      selections: large,
      quantity: 3,
    });
    expect(state.lines[0]).toMatchObject({
      lineId: id,
      quantity: 3,
      unitCents: 350,
      summary: expect.stringContaining('Large'),
    });
  });

  it('calculates subtotal, tax and total in cents', () => {
    let state = cartReducer(empty, { type: 'add', product: latte, selections: base, quantity: 2 });
    const large = toggleOption(latte, base, 'size', 'large').selections;
    state = cartReducer(state, { type: 'add', product: latte, selections: large, quantity: 1 });
    // 2 × 2.50 + 3.50 = 8.50; tax 10% = 0.85
    expect(cartTotals(state.lines, 0.1)).toEqual({
      itemCount: 3,
      subtotalCents: 850,
      taxCents: 85,
      totalCents: 935,
    });
  });

  it('sends only ids and quantities to the server — never prices', () => {
    const state = cartReducer(empty, {
      type: 'add',
      product: latte,
      selections: base,
      quantity: 2,
    });
    const input = toOrderInput(state.lines, 'KIOSK-01');
    expect(input).toEqual({
      kioskCode: 'KIOSK-01',
      items: [{ productId: 'latte', quantity: 2, optionIds: ['small', 'regular', 's1'] }],
    });
    expect(JSON.stringify(input)).not.toMatch(/price|Cents|total/i);
  });
});
