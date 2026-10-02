#!/usr/bin/env node
// Creates a compressed PostgreSQL backup (custom format) in ./backups using the
// postgres container's pg_dump. Restore with:
//   docker exec -i gesture-coffee-shop-postgres-1 pg_restore -U coffee -d gesture_coffee --clean < backups/<file>.dump
import { execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const container = process.env.PG_CONTAINER ?? 'gesture-coffee-shop-postgres-1';
const user = process.env.POSTGRES_USER ?? 'coffee';
const db = process.env.POSTGRES_DB ?? 'gesture_coffee';
const keep = Number(process.env.BACKUP_KEEP ?? 14);
const dir = path.resolve('backups');
mkdirSync(dir, { recursive: true });

execFileSync('docker', ['inspect', container], { stdio: 'ignore' });
const file = path.join(dir, `${db}_${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
const out = createWriteStream(file);
const dump = spawn('docker', ['exec', container, 'pg_dump', '-U', user, '-d', db, '-Fc']);
dump.stdout.pipe(out);
dump.stderr.pipe(process.stderr);
dump.on('close', (code) => {
  if (code !== 0) {
    console.error(`pg_dump failed (exit ${code})`);
    process.exit(code ?? 1);
  }
  console.log(`✓ Backup written: ${file} (${statSync(file).size} bytes)`);
  // Retention: keep the newest N backups.
  const dumps = readdirSync(dir)
    .filter((f) => f.endsWith('.dump'))
    .sort()
    .reverse();
  for (const old of dumps.slice(keep)) unlinkSync(path.join(dir, old));
});
