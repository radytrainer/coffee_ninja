import { z } from 'zod';
import { trimmedName } from './common';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
    message: 'Password must contain at least one letter and one number',
  });

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

export const userCreateSchema = z.object({
  email,
  name: trimmedName(80),
  password: passwordSchema,
  role: z.enum(['ADMIN', 'STAFF']).default('STAFF'),
  active: z.boolean().default(true),
});

export const userUpdateSchema = z
  .object({
    email,
    name: trimmedName(80),
    password: passwordSchema,
    role: z.enum(['ADMIN', 'STAFF']),
    active: z.boolean(),
  })
  .partial();
