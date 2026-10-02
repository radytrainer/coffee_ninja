import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests. Requires PostgreSQL (npm run db:up) with migrations + seed.
 * The backend, kiosk, kitchen and the gesture SIMULATOR are started automatically
 * (or reused if already running). Stop the real vision service first — the
 * simulator uses the same port (8765).
 */
const reuse = !process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'kiosk-1080p',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'kiosk-720p',
      testMatch: /customer-mouse\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w backend',
      cwd: '../..',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: reuse,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w kiosk',
      cwd: '../..',
      url: 'http://localhost:3000',
      reuseExistingServer: reuse,
      timeout: 180_000,
    },
    {
      command: 'npm run dev -w kitchen',
      cwd: '../..',
      url: 'http://localhost:3020/login',
      reuseExistingServer: reuse,
      timeout: 180_000,
    },
    {
      command: 'node scripts/run-vision.mjs simulate',
      cwd: '../..',
      url: 'http://127.0.0.1:8765/health',
      reuseExistingServer: reuse,
      timeout: 180_000,
    },
  ],
});
