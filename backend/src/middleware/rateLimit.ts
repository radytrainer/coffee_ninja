import rateLimit from 'express-rate-limit';
import type { ApiErrorBody } from '@gcs/types';
import { env, isTest } from '../config/env';

const limited = (message: string): ApiErrorBody => ({
  success: false,
  error: { code: 'RATE_LIMITED', message },
});

/** Brute-force protection for the login endpoint. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => isTest,
  message: limited('Too many login attempts. Please wait a few minutes and try again.'),
});

/** Protects order creation from abuse (per client IP). */
export const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.ORDER_RATE_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  message: limited('Too many orders from this device. Please wait a moment.'),
});

/** Generous global limit for the whole API. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  message: limited('Too many requests. Please slow down.'),
});
