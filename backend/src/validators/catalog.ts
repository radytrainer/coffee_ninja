import { z } from 'zod';
import { idSchema, imageSchema, money, optionalText, queryBool, trimmedName } from './common';

// NOTE: update schemas are built from field maps WITHOUT defaults. In Zod, `.partial()`
// keeps `.default()` values, which would silently reset omitted fields on PUT.

const sortOrder = z.number().int().min(0).max(10_000);

// ---------- categories ----------
const categoryFields = {
  name: trimmedName(60),
  description: optionalText(300),
  image: imageSchema.nullish(),
  sortOrder,
  active: z.boolean(),
};
export const categoryCreateSchema = z.object({
  ...categoryFields,
  sortOrder: sortOrder.default(0),
  active: z.boolean().default(true),
});
export const categoryUpdateSchema = z.object(categoryFields).partial();
export const categoryQuerySchema = z.object({ all: queryBool });

// ---------- products ----------
const productFields = {
  name: trimmedName(80),
  description: optionalText(500),
  price: money('Product price', { allowZero: false }),
  image: imageSchema.nullish(),
  categoryId: idSchema,
  available: z.boolean(),
  featured: z.boolean(),
  sortOrder,
  /** Ordered list of reusable option groups attached to this product. */
  optionGroupIds: z.array(idSchema).max(20),
};
export const productCreateSchema = z.object({
  ...productFields,
  available: z.boolean().default(true),
  featured: z.boolean().default(false),
  sortOrder: sortOrder.default(0),
  optionGroupIds: productFields.optionGroupIds.default([]),
});
export const productUpdateSchema = z.object(productFields).partial();
export const productQuerySchema = z.object({
  categoryId: idSchema.optional(),
  available: queryBool,
  featured: queryBool,
  search: z.string().trim().max(80).optional(),
  all: queryBool,
});

// ---------- options ----------
const optionFields = {
  name: trimmedName(60),
  priceDelta: money('Option price'),
  isDefault: z.boolean(),
  available: z.boolean(),
  sortOrder,
};
export const optionCreateSchema = z.object({
  ...optionFields,
  priceDelta: optionFields.priceDelta.default(0),
  isDefault: z.boolean().default(false),
  available: z.boolean().default(true),
  sortOrder: sortOrder.default(0),
});
export const optionUpdateSchema = z.object(optionFields).partial();

// ---------- option groups ----------
const optionGroupFields = {
  name: trimmedName(60),
  description: optionalText(300),
  selectionType: z.enum(['SINGLE', 'MULTIPLE']),
  required: z.boolean(),
  minSelect: z.number().int().min(0).max(20),
  maxSelect: z.number().int().min(1).max(20),
  sortOrder,
};

const checkSelectRange = (g: { minSelect?: number; maxSelect?: number }) =>
  g.minSelect === undefined || g.maxSelect === undefined || g.minSelect <= g.maxSelect;
const rangeMessage = { message: 'minSelect cannot be greater than maxSelect', path: ['minSelect'] };

export const optionGroupCreateSchema = z
  .object({
    ...optionGroupFields,
    selectionType: optionGroupFields.selectionType.default('SINGLE'),
    required: z.boolean().default(false),
    minSelect: optionGroupFields.minSelect.default(0),
    maxSelect: optionGroupFields.maxSelect.default(1),
    sortOrder: sortOrder.default(0),
    options: z.array(optionCreateSchema).max(30).default([]),
  })
  .refine(checkSelectRange, rangeMessage);

export const optionGroupUpdateSchema = z
  .object(optionGroupFields)
  .partial()
  .refine(checkSelectRange, rangeMessage);
