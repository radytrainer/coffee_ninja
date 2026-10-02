import type { OrderQuoteDTO, OrderQuoteLine } from '@gcs/types';
import { AppError } from '../utils/errors';
import { fromCents, taxCents, toCents } from '../utils/money';

/**
 * Pure pricing logic. It only uses catalog data loaded from the database —
 * the client never supplies prices.
 */
export interface PricingOption {
  id: string;
  name: string;
  priceDelta: number | string | { toString(): string };
  available: boolean;
}

export interface PricingGroup {
  id: string;
  name: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: PricingOption[];
}

export interface PricingProduct {
  id: string;
  name: string;
  price: number | string | { toString(): string };
  available: boolean;
  categoryActive: boolean;
  groups: PricingGroup[];
}

export interface PricingItemInput {
  productId: string;
  quantity: number;
  optionIds: string[];
}

export interface PricedLine extends OrderQuoteLine {
  unitCents: number;
  lineCents: number;
}

export interface PricedOrder extends Omit<
  OrderQuoteDTO,
  'discountReason' | 'smileDiscountRate' | 'smileApplied'
> {
  lines: PricedLine[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

export function priceOrder(
  items: PricingItemInput[],
  products: Map<string, PricingProduct>,
  taxRate: number,
  /** Fraction of the subtotal to take off before tax (0.05 = 5 %). */
  discountRate = 0,
): PricedOrder {
  const lines: PricedLine[] = items.map((item, index) => {
    const product = products.get(item.productId);
    if (!product) {
      throw new AppError(422, 'PRODUCT_UNAVAILABLE', `Item ${index + 1}: product no longer exists`);
    }
    if (!product.available || !product.categoryActive) {
      throw new AppError(422, 'PRODUCT_UNAVAILABLE', `${product.name} is currently unavailable`);
    }

    const selected = new Set(item.optionIds);
    if (selected.size !== item.optionIds.length) {
      throw new AppError(422, 'INVALID_OPTIONS', `${product.name}: duplicate options selected`);
    }

    const chosen: OrderQuoteLine['options'] = [];
    let optionCents = 0;
    let matched = 0;

    for (const group of product.groups) {
      const picks = group.options.filter((o) => selected.has(o.id));
      matched += picks.length;
      const min = group.required ? Math.max(1, group.minSelect) : group.minSelect;
      const max = group.selectionType === 'SINGLE' ? 1 : group.maxSelect;
      if (picks.length < min) {
        throw new AppError(422, 'INVALID_OPTIONS', `${product.name}: please choose ${group.name}`);
      }
      if (picks.length > max) {
        throw new AppError(
          422,
          'INVALID_OPTIONS',
          `${product.name}: choose at most ${max} ${group.name} option${max === 1 ? '' : 's'}`,
        );
      }
      for (const option of picks) {
        if (!option.available) {
          throw new AppError(
            422,
            'INVALID_OPTIONS',
            `${product.name}: ${option.name} is unavailable`,
          );
        }
        const cents = toCents(option.priceDelta.toString());
        optionCents += cents;
        chosen.push({
          optionId: option.id,
          groupName: group.name,
          optionName: option.name,
          priceDelta: fromCents(cents),
        });
      }
    }

    if (matched !== selected.size) {
      throw new AppError(
        422,
        'INVALID_OPTIONS',
        `${product.name}: an option does not belong to this product`,
      );
    }

    const baseCents = toCents(product.price.toString());
    const unitCents = baseCents + optionCents;
    const lineCents = unitCents * item.quantity;
    return {
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      basePrice: fromCents(baseCents),
      unitPrice: fromCents(unitCents),
      lineTotal: fromCents(lineCents),
      options: chosen,
      unitCents,
      lineCents,
    };
  });

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineCents, 0);
  // Discount rounded to the cent; tax is charged on what the customer actually pays.
  const discountCents = Math.round(subtotalCents * Math.min(Math.max(discountRate, 0), 1));
  const taxable = subtotalCents - discountCents;
  const tax = taxCents(taxable, taxRate);
  return {
    lines,
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discountCents),
    tax: fromCents(tax),
    total: fromCents(taxable + tax),
    taxRate,
    subtotalCents,
    discountCents,
    taxCents: tax,
    totalCents: taxable + tax,
  };
}
