#!/usr/bin/env node
// Cross-platform launcher for the Python vision service.
//   node scripts/run-vision.mjs          -> start the service (uvicorn)
//   node scripts/run-vision.mjs test     -> run pytest
//   node scripts/run-vision.mjs setup    -> create .venv and install requirements
//   node scripts/run-vision.mjs simulate -> gesture simulator (no camera; for tests/dev)
import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const visionDir = path.join(root, 'services', 'vision');
const isWin = process.platform === 'win32';
const venvPython = path.join(visionDir, '.venv', isWin ? 'Scripts/python.exe' : 'bin/python');
const systemPython = isWin ? 'python' : 'python3';
const mode = process.argv[2] ?? 'start';

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: visionDir, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (mode === 'setup' || !existsSync(venvPython)) {
  console.log('Creating Python virtual environment in services/vision/.venv ...');
  if (!existsSync(venvPython)) run(systemPython, ['-m', 'venv', '.venv']);
  run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements-dev.txt']);
  if (mode === 'setup') process.exit(0);
}

const args =
  mode === 'test'
    ? ['-m', 'pytest', ...process.argv.slice(3)]
    : mode === 'simulate'
      ? ['-m', 'app.simulator', ...process.argv.slice(3)]
      : ['-m', 'app', ...process.argv.slice(3)];

const child = spawn(venvPython, args, { cwd: visionDir, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
