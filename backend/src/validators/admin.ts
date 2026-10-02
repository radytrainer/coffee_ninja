import { z } from 'zod';
import { idSchema, optionalText, trimmedName } from './common';

const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Invalid date');

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD — calendar dates in the shop's timezone (resolved in the report service). */
export const dateRangeQuery = z.object({
  from: localDate.optional(),
  to: localDate.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const quantity = z
  .number()
  .min(0, 'Quantity cannot be negative')
  .max(1_000_000)
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, {
    message: 'At most 3 decimal places',
  });

const inventoryFields = {
  name: trimmedName(80),
  unit: z.string().trim().min(1).max(20),
  quantity,
  lowStockThreshold: quantity,
  productId: idSchema.nullable(),
};
export const inventoryCreateSchema = z.object({
  ...inventoryFields,
  quantity: quantity.default(0),
  lowStockThreshold: quantity.default(0),
  productId: idSchema.nullable().default(null),
});
export const inventoryUpdateSchema = z.object(inventoryFields).partial();
/** Relative stock change (e.g. +24 delivered, -1 used). */
export const inventoryAdjustSchema = z.object({ delta: z.number().min(-1_000_000).max(1_000_000) });

const kioskFields = {
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{3,40}$/, 'Use 3-40 uppercase letters, digits or dashes'),
  name: trimmedName(80),
  location: optionalText(120),
  active: z.boolean(),
  inputMode: z.enum(['GESTURE', 'MOUSE']),
  sessionTimeoutSeconds: z.number().int().min(10).max(3600),
  successResetSeconds: z.number().int().min(5).max(600),
  hoverDelayMs: z.number().int().min(0).max(3000),
};
export const kioskCreateSchema = z.object({
  ...kioskFields,
  active: z.boolean().default(true),
  inputMode: kioskFields.inputMode.default('GESTURE'),
  sessionTimeoutSeconds: kioskFields.sessionTimeoutSeconds.default(60),
  successResetSeconds: kioskFields.successResetSeconds.default(20),
  hoverDelayMs: kioskFields.hoverDelayMs.default(250),
});
export const kioskUpdateSchema = z.object(kioskFields).partial();

const validTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const settingsUpdateSchema = z
  .object({
    shopName: trimmedName(60),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, 'Use a 3-letter ISO currency code (e.g. USD)'),
    taxRate: z
      .number()
      .min(0, 'Tax rate cannot be negative')
      .max(0.5, 'Tax rate must be at most 50%'),
    orderNumberPrefix: z
      .string()
      .trim()
      .regex(/^[A-Z]{1,3}$/, 'Use 1-3 uppercase letters'),
    timezone: z.string().trim().refine(validTimezone, 'Unknown timezone'),
    requirePayment: z.boolean(),
    allowCashPayment: z.boolean(),
    smileDiscountRate: z
      .number()
      .min(0, 'Discount cannot be negative')
      .max(0.5, 'Discount must be at most 50%'),
  })
  .partial();
