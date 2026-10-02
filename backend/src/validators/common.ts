import { z } from 'zod';

/** Prisma cuid ids. */
export const idSchema = z.string().regex(/^[a-z0-9]{20,40}$/i, 'Invalid id');

export const idParams = z.object({ id: idSchema });

/** Money: non-negative, at most 2 decimal places, sensible upper bound. */
export const money = (label: string, { allowZero = true } = {}) =>
  z
    .number({ error: `${label} must be a number` })
    .refine((v) => (allowZero ? v >= 0 : v > 0), {
      message: `Invalid ${label.toLowerCase()}: must be ${allowZero ? 'zero or more' : 'greater than zero'}`,
    })
    .refine((v) => v <= 10_000, { message: `Invalid ${label.toLowerCase()}: too large` })
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
      message: `Invalid ${label.toLowerCase()}: at most 2 decimal places`,
    });

/** Image: relative path served by the API (/static/...) or an http(s) URL. */
export const imageSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith('/') || /^https?:\/\//i.test(v), {
    message: 'Image must be a /static path or an http(s) URL',
  });

export const trimmedName = (max = 80) => z.string().trim().min(1, 'Name is required').max(max);

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    // undefined stays undefined (field omitted on update); empty string/null clears it.
    .transform((v) => (v === undefined ? undefined : v ? v : null));

/** Query-string boolean ("true"/"false"). */
export const queryBool = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));
