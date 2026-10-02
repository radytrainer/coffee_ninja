#!/usr/bin/env node
// Loads the repository-root .env (if present) and runs the given command.
// Existing environment variables win, so Docker/CI values are never overridden.
// Usage: node scripts/with-env.mjs [--test] <command> [...args]
//   --test  use TEST_DATABASE_URL as DATABASE_URL (for the automated test database)
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(here, '..', '..', '.env');

if (existsSync(envFile)) {
  for (const rawLine of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

let args = process.argv.slice(2);
if (args[0] === '--test') {
  args = args.slice(1);
  if (!process.env.TEST_DATABASE_URL) {
    console.error('TEST_DATABASE_URL is not set');
    process.exit(1);
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = 'test';
}

if (args.length === 0) {
  console.error('Usage: with-env.mjs [--test] <command> [...args]');
  process.exit(1);
}

const child = spawn(args[0], args.slice(1), {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
