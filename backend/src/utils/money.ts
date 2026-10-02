import type { Prisma } from '@prisma/client';

type Numeric = number | string | Prisma.Decimal;

/** All money arithmetic happens in integer cents to avoid floating point errors. */
export function toCents(value: Numeric): number {
  return Math.round(Number(value.toString()) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function decimalToNumber(value: Numeric): number {
  return Number(value.toString());
}

/** Tax is rounded half-up to the nearest cent. */
export function taxCents(subtotalCents: number, taxRate: number): number {
  return Math.round(subtotalCents * taxRate);
}
