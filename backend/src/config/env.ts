import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// Load the repository-root .env (development). Values already present in the
// environment (Docker, CI, tests) take precedence and are never overwritten.
for (const candidate of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3010,http://localhost:3020')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  COOKIE_SECURE: booleanString,
  TRUST_PROXY: booleanString,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  ORDER_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  // ---- QR payment ----
  /** demo = QR opens a test "Pay" page (no real money). Real bank providers plug in here. */
  PAYMENT_PROVIDER: z.enum(['demo']).default('demo'),
  /** Base URL phones use to reach this API (demo provider). Default: this PC's LAN address. */
  PAYMENT_PUBLIC_URL: z.url().optional(),
  PAYMENT_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  /** Time to walk to the counter and pay cash before the unpaid order is cancelled. */
  CASH_PAYMENT_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(7200).default(900),
  // ---- Smile discount ----
  /** Shared with the vision service; unset = smile discount unavailable. */
  SMILE_TOKEN_SECRET: z
    .string()
    .min(32, 'SMILE_TOKEN_SECRET must be at least 32 characters')
    .optional(),
  SMILE_TOKEN_MAX_AGE_SECONDS: z.coerce.number().int().min(30).max(3600).default(600),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    // Never print values: they may contain secrets.
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_SECRET.startsWith('replace-with')) {
    throw new Error('JWT_SECRET still has the example value. Set a real secret for production.');
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
