import { describe, expect, it } from 'vitest';
import { type PricingProduct, priceOrder } from '../src/services/pricing';
import { AppError } from '../src/utils/errors';

const latte: PricingProduct = {
  id: 'latte',
  name: 'Latte',
  price: '2.50',
  available: true,
  categoryActive: true,
  groups: [
    {
      id: 'size',
      name: 'Size',
      selectionType: 'SINGLE',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: 'small', name: 'Small', priceDelta: '0', available: true },
        { id: 'large', name: 'Large', priceDelta: '1.00', available: true },
      ],
    },
    {
      id: 'extras',
      name: 'Extras',
      selectionType: 'MULTIPLE',
      required: false,
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: 'vanilla', name: 'Vanilla', priceDelta: '0.30', available: true },
        { id: 'caramel', name: 'Caramel', priceDelta: '0.30', available: true },
        { id: 'shot', name: 'Extra Espresso', priceDelta: '0.80', available: false },
      ],
    },
  ],
};
const products = new Map([[latte.id, latte]]);

function expectError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error('expected an error');
}

describe('priceOrder', () => {
  it('computes base + options × quantity, tax and total in cents', () => {
    const result = priceOrder(
      [{ productId: 'latte', quantity: 2, optionIds: ['large', 'vanilla', 'caramel'] }],
      products,
      0.1,
    );
    // (2.50 + 1.00 + 0.30 + 0.30) × 2 = 8.20
    expect(result.lines[0]!.unitPrice).toBe(4.1);
    expect(result.subtotal).toBe(8.2);
    expect(result.tax).toBe(0.82);
    expect(result.total).toBe(9.02);
  });

  it('avoids floating point drift', () => {
    const result = priceOrder(
      [{ productId: 'latte', quantity: 3, optionIds: ['small', 'vanilla'] }],
      products,
      0.07,
    );
    // 2.80 × 3 = 8.40; tax 0.588 -> 0.59
    expect(result.subtotal).toBe(8.4);
    expect(result.tax).toBe(0.59);
    expect(result.total).toBe(8.99);
  });

  it('requires required groups', () => {
    expectError(
      () => priceOrder([{ productId: 'latte', quantity: 1, optionIds: [] }], products, 0),
      'INVALID_OPTIONS',
    );
  });

  it('limits single-choice groups to one option', () => {
    expectError(
      () =>
        priceOrder(
          [{ productId: 'latte', quantity: 1, optionIds: ['small', 'large'] }],
          products,
          0,
        ),
      'INVALID_OPTIONS',
    );
  });

  it('rejects options from another product, duplicates and unavailable options', () => {
    expectError(
      () =>
        priceOrder([{ productId: 'latte', quantity: 1, optionIds: ['small', 'oat'] }], products, 0),
      'INVALID_OPTIONS',
    );
    expectError(
      () =>
        priceOrder(
          [{ productId: 'latte', quantity: 1, optionIds: ['small', 'vanilla', 'vanilla'] }],
          products,
          0,
        ),
      'INVALID_OPTIONS',
    );
    expectError(
      () =>
        priceOrder(
          [{ productId: 'latte', quantity: 1, optionIds: ['small', 'shot'] }],
          products,
          0,
        ),
      'INVALID_OPTIONS',
    );
  });

  it('rejects unknown and unavailable products', () => {
    expectError(
      () => priceOrder([{ productId: 'nope', quantity: 1, optionIds: [] }], products, 0),
      'PRODUCT_UNAVAILABLE',
    );
    const soldOut = new Map([[latte.id, { ...latte, available: false }]]);
    expectError(
      () => priceOrder([{ productId: 'latte', quantity: 1, optionIds: ['small'] }], soldOut, 0),
      'PRODUCT_UNAVAILABLE',
    );
  });
});
