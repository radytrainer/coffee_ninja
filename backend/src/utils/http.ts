import type { Response } from 'express';
import type { z } from 'zod';

/** Consistent success envelope: { success: true, data }. */
export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

/**
 * Validates untrusted input against a Zod schema. Throws a ZodError on failure,
 * which the central error handler turns into a 400 VALIDATION_ERROR response.
 */
export function validate<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  return schema.parse(input);
}
