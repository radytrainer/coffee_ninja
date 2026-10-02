#!/usr/bin/env node
// Verifies that the tools required to develop the project are installed.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const checks = [
  { name: 'Node.js', cmd: 'node --version', min: [22, 12], required: true },
  { name: 'npm', cmd: 'npm --version', min: [10, 0], required: true },
  { name: 'Git', cmd: 'git --version', min: [2, 30], required: true },
  { name: 'Docker', cmd: 'docker --version', min: [24, 0], required: false },
  { name: 'Docker Compose', cmd: 'docker compose version', min: [2, 20], required: false },
  {
    name: 'Python',
    cmd: process.platform === 'win32' ? 'python --version' : 'python3 --version',
    min: [3, 11],
    required: false,
  },
];

function parseVersion(text) {
  const match = text.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function atLeast(actual, min) {
  return actual[0] > min[0] || (actual[0] === min[0] && actual[1] >= min[1]);
}

let failed = false;
for (const check of checks) {
  let output;
  try {
    output = execSync(check.cmd, { stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim();
  } catch {
    const level = check.required ? 'MISSING' : 'missing (optional)';
    console.log(`✗ ${check.name.padEnd(15)} ${level}`);
    if (check.required) failed = true;
    continue;
  }
  const version = parseVersion(output);
  const ok = version && atLeast(version, check.min);
  const label = ok ? '✓' : check.required ? '✗' : '!';
  console.log(
    `${label} ${check.name.padEnd(15)} ${output.split('\n')[0]}${ok ? '' : `  (need >= ${check.min.join('.')})`}`,
  );
  if (!ok && check.required) failed = true;
}

if (!existsSync('.env')) {
  console.log('! .env              not found — run: cp .env.example .env');
} else {
  console.log('✓ .env              present');
}

if (failed) {
  console.error('\nSome required tools are missing or too old.');
  process.exit(1);
}
console.log('\nAll required tools are available.');
