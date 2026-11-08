#!/bin/sh
# Restores an archive made by deploy/backup.sh: the database is REPLACED by the
# one in the archive, and the uploaded files are copied back into the uploads folder.
#
#   sh deploy/restore.sh backups/docsku-prod-20261108-101500.tar.gz --prod --yes
#   sh deploy/restore.sh <archive> --yes                      development database
#
# Options:
#   --yes               required: without it the script only shows what it would do
#   --prod              production (docker-compose.prod.yml + .env.production); the app is stopped during the restore
#   --db NAME           restore into another database in the same server (created if missing), e.g. to inspect a backup
#   --uploads-dir DIR   copy the uploads somewhere else than the site's uploads folder
#   --no-uploads        database only
#
# The app runs newer migrations itself when it starts, so an older backup works with newer code.
set -eu
cd "$(dirname "$0")/.."

ARCHIVE=""
ENV_NAME=dev
YES=0
DB=docsku
UPLOADS_TARGET=""
WITH_UPLOADS=1
while [ $# -gt 0 ]; do
  case "$1" in
    --prod) ENV_NAME=prod ;;
    --) ;; # from "pnpm restore -- …"
    --yes) YES=1 ;;
    --db) DB=${2:?--db needs a name}; shift ;;
    --uploads-dir) UPLOADS_TARGET=${2:?--uploads-dir needs a folder}; shift ;;
    --no-uploads) WITH_UPLOADS=0 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *) ARCHIVE=$1 ;;
  esac
  shift
done

[ -n "$ARCHIVE" ] || { echo "Usage: sh deploy/restore.sh <archive.tar.gz> [--prod] [--db NAME] --yes" >&2; exit 2; }
[ -f "$ARCHIVE" ] || { echo "Not found: $ARCHIVE" >&2; exit 1; }
case "$DB" in *[!a-z0-9_]*|"") echo "Database name may only use a-z, 0-9 and _." >&2; exit 2 ;; esac

if [ "$ENV_NAME" = prod ]; then
  [ -f .env.production ] || { echo "Missing .env.production." >&2; exit 1; }
  compose() { docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production "$@"; }
  UPLOADS=./storage/uploads
else
  compose() { docker compose "$@"; }
  UPLOADS=$(sed -n 's/^UPLOAD_DIR=//p' .env.local 2>/dev/null | tail -n 1)
  UPLOADS=${UPLOADS:-./storage/uploads}
fi
UPLOADS=${UPLOADS_TARGET:-$UPLOADS}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
# Only the three expected entries are extracted (no absolute paths or "..").
tar -C "$WORK" -xzf "$ARCHIVE" --no-same-owner manifest.json db.dump uploads
[ -s "$WORK/db.dump" ] && [ -f "$WORK/manifest.json" ] || { echo "Not a Docsku backup (manifest.json/db.dump missing)." >&2; exit 1; }

echo "Backup:"
cat "$WORK/manifest.json"
echo
echo "Target: database \"$DB\" ($ENV_NAME) — it will be REPLACED by the backup."
[ "$WITH_UPLOADS" = 1 ] && echo "        uploads copied into $UPLOADS"
if [ "$YES" != 1 ]; then
  echo
  echo "Nothing changed. Run again with --yes to restore." >&2
  exit 1
fi

if [ "$ENV_NAME" = prod ] && [ "$DB" = docsku ]; then
  echo "==> Stopping the app"
  compose stop app || true
fi

echo "==> Database"
EXISTS=$(compose exec -T postgres psql -U docsku -d postgres -At -c "select 1 from pg_database where datname = '$DB'" | tr -d '\r')
if [ "$EXISTS" != 1 ]; then
  compose exec -T postgres createdb -U docsku "$DB"
fi
# Start from empty schemas so tables added after the backup don't clash with the app's migrator.
compose exec -T postgres psql -U docsku -d "$DB" -v ON_ERROR_STOP=1 -q -c \
  "drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;"
compose exec -T postgres pg_restore -U docsku -d "$DB" --no-owner --no-privileges --exit-on-error < "$WORK/db.dump"
compose exec -T postgres psql -U docsku -d "$DB" -At -c \
  "select 'pages ' || (select count(*) from pages) || ', users ' || (select count(*) from users) || ', media ' || (select count(*) from media)"

if [ "$WITH_UPLOADS" = 1 ]; then
  echo "==> Uploads"
  mkdir -p "$UPLOADS"
  cp -a "$WORK/uploads/." "$UPLOADS/"
  if [ "$ENV_NAME" = prod ] && [ "$(id -u)" = 0 ]; then chown -R 10001:10001 "$UPLOADS"; fi
fi

if [ "$ENV_NAME" = prod ] && [ "$DB" = docsku ]; then
  echo "==> Starting the app (it refreshes every page at startup)"
  compose up -d --wait --no-build app
elif [ "$DB" = docsku ]; then
  echo "Restart the dev server so it drops its in-memory cache."
fi
echo "Done."
