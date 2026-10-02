import { ORDER_STATUSES } from '@gcs/types';
import { z } from 'zod';
import { idSchema } from './common';

export const orderItemSchema = z.object({
  productId: idSchema,
  quantity: z.number().int('Quantity must be a whole number').min(1).max(20),
  optionIds: z.array(idSchema).max(20).default([]),
  notes: z.string().trim().max(200).optional(),
});

export const createOrderSchema = z
  .object({
    items: z.array(orderItemSchema).min(1, 'Your cart is empty').max(30),
    kioskCode: z.string().trim().max(40).optional(),
    smileToken: z.string().trim().max(200).optional(),
  })
  // Reject any client-supplied price fields outright: prices are server-side only.
  .strict();

export const quoteOrderSchema = createOrderSchema;

export const updateStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(300).optional(),
});

const statusList = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim().toUpperCase()) : undefined))
  .pipe(z.array(z.enum(ORDER_STATUSES)).optional());

export const listOrdersQuerySchema = z.object({
  status: statusList,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().max(20).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
