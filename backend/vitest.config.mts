import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests always run against the separate test database, never the dev database.
const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL must be set (see .env.example) to run backend tests');
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    // Tests share one database, so run files sequentially.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      BCRYPT_ROUNDS: '4',
      JWT_SECRET: process.env.JWT_SECRET ?? 'test-secret-that-is-long-enough-for-validation-123',
      SMILE_TOKEN_SECRET: 'test-smile-secret-that-is-long-enough-0123456789',
      PAYMENT_PUBLIC_URL: 'http://pay.test',
      PAYMENT_TIMEOUT_SECONDS: '300',
    },
  },
});
