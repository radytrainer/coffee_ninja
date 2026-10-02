#!/bin/sh
# Applies pending migrations, optionally seeds, then starts the API.
set -e
echo "Applying database migrations..."
npx prisma migrate deploy
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "Seeding database (idempotent)..."
  npx tsx prisma/seed.ts
fi
exec node dist/src/server.js
