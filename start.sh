#!/bin/sh

if [ -z "$DATABASE_URL" ]; then
  echo "[SincroStock] WARNING: DATABASE_URL is not set. The app will start but DB features will not work."
  echo "[SincroStock] Add a PostgreSQL plugin in Railway and link DATABASE_URL to this service."
else
  echo "[SincroStock] Running prisma db push..."
  npx prisma db push --accept-data-loss || echo "[SincroStock] WARNING: prisma db push failed — app will start anyway"
fi

echo "[SincroStock] Starting Next.js on port ${PORT:-3000}..."
exec node_modules/.bin/next start -p "${PORT:-3000}"
