#!/bin/sh
# Builds and (re)starts production: PostgreSQL, migrations, and the app (behind your own HTTPS proxy).
# Run from anywhere: sh deploy/deploy.sh. Settings: .env.production.
set -eu
cd "$(dirname "$0")/.."

if [ ! -f .env.production ]; then
  echo "Missing .env.production: copy .env.production.example and fill it in." >&2
  exit 1
fi

# The build needs host networking to read the database, which the "docker" builder
# allows; docker-container builders would need extra entitlements.
compose() {
  BUILDX_BUILDER=default docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production "$@"
}

echo "==> PostgreSQL"
compose up -d --wait postgres

# Migrate before building: `next build` prerenders pages with the current schema.
echo "==> Migrations"
compose build migrate
compose run --rm migrate

# The app runs as uid 10001 (no host account has it) and writes uploads to this shared folder.
mkdir -p storage/uploads
if [ "$(id -u)" = 0 ]; then
  chown -R 10001:10001 storage/uploads
else
  echo "Note: storage/uploads must be writable by uid 10001 (sudo chown -R 10001:10001 storage/uploads)." >&2
fi

echo "==> Build"
compose build app

echo "==> Start"
compose up -d --wait app
compose ps app
