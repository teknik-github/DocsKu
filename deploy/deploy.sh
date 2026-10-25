#!/bin/sh
# Updates and (re)starts production: PostgreSQL and the app (behind your own HTTPS proxy).
# The app image is built on GitHub (.github/workflows/docker.yml) and pulled from ghcr.io;
# the app migrates the database itself when it starts.
#   sh deploy/deploy.sh           pull DOCSKU_VERSION (default: latest) and restart
#   sh deploy/deploy.sh --build   build the image on this machine instead
# Settings: .env.production.
set -eu
cd "$(dirname "$0")/.."

if [ ! -f .env.production ]; then
  echo "Missing .env.production: copy .env.production.example and fill it in." >&2
  exit 1
fi

compose() {
  docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production "$@"
}

echo "==> PostgreSQL"
compose up -d --wait postgres

# The app runs as uid 10001 (no host account has it) and writes uploads to this shared folder.
mkdir -p storage/uploads
if [ "$(id -u)" = 0 ]; then
  chown -R 10001:10001 storage/uploads
else
  echo "Note: storage/uploads must be writable by uid 10001 (sudo chown -R 10001:10001 storage/uploads)." >&2
fi

if [ "${1:-}" = "--build" ]; then
  echo "==> Build"
  NEXT_DEPLOYMENT_ID="$(git rev-parse --short HEAD 2>/dev/null || echo local)-$(date +%Y%m%d%H%M%S)" compose build app
else
  echo "==> Pull"
  if ! compose pull app; then
    echo "Could not pull the image. For a private repository, log in once with a GitHub token that has read:packages:" >&2
    echo "  docker login ghcr.io -u <github-user>" >&2
    exit 1
  fi
fi

echo "==> Start (migrations run automatically)"
compose up -d --wait --no-build app
compose ps app
