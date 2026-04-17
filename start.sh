#!/bin/sh
set -e

echo "[start] Checking DATABASE_URL..."
if [ -z "$DATABASE_URL" ]; then
  echo "[start] ERROR: DATABASE_URL is not set. Add a PostgreSQL plugin in Railway and link it to this service."
  exit 1
fi

echo "[start] Running prisma db push..."
npx prisma db push --accept-data-loss

echo "[start] Starting Next.js on port ${PORT:-3000}..."
exec npm start
