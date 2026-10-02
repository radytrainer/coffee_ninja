import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration (replaces the deprecated `package.json#prisma` block).
 * Environment variables come from the repository-root .env via scripts/with-env.mjs,
 * or from Docker/CI — with this file present, Prisma does not load .env itself.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
