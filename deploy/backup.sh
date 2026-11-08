#!/bin/sh
# Backs up the database and the uploaded media into one archive:
#   backups/docsku-<env>-YYYYMMDD-HHMMSS.tar.gz
#     manifest.json   app version, migrations, date, row counts
#     db.dump         pg_dump --format=custom (restore with deploy/restore.sh)
#     uploads/        the files in UPLOAD_DIR
#
#   sh deploy/backup.sh           development (docker-compose.yml + .env, uploads from UPLOAD_DIR or ./storage/uploads)
#   sh deploy/backup.sh --prod    production (docker-compose.prod.yml + .env.production, ./storage/uploads)
#   BACKUP_DIR=/srv/backups sh deploy/backup.sh --prod
#
# pg_dump runs inside the postgres container, so the host needs no PostgreSQL tools.
# Keep backups somewhere else too (another disk or machine): they hold every page, user and comment.
set -eu
cd "$(dirname "$0")/.."

ENV_NAME=dev
for arg in "$@"; do
  case "$arg" in
    --prod) ENV_NAME=prod ;;
    --) ;; # from "pnpm backup -- --prod"
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ "$ENV_NAME" = prod ]; then
  [ -f .env.production ] || { echo "Missing .env.production." >&2; exit 1; }
  compose() { docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production "$@"; }
  UPLOADS=./storage/uploads
else
  compose() { docker compose "$@"; }
  # The dev server reads UPLOAD_DIR from .env.local.
  UPLOADS=$(sed -n 's/^UPLOAD_DIR=//p' .env.local 2>/dev/null | tail -n 1)
  UPLOADS=${UPLOADS:-./storage/uploads}
fi

STAMP=$(date +%Y%m%d-%H%M%S)
OUT_DIR=${BACKUP_DIR:-backups}
mkdir -p "$OUT_DIR"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "==> Database (pg_dump)"
compose exec -T postgres pg_dump -U docsku -d docsku --format=custom --no-owner --no-privileges > "$WORK/db.dump"
[ -s "$WORK/db.dump" ] || { echo "pg_dump produced nothing." >&2; exit 1; }

COUNTS=$(compose exec -T postgres psql -U docsku -d docsku -At -c \
  "select json_build_object('pages', (select count(*) from pages), 'users', (select count(*) from users), 'media', (select count(*) from media), 'comments', (select count(*) from page_comments), 'migrations', (select count(*) from drizzle.__drizzle_migrations))" | tr -d '\r')

echo "==> Uploads ($UPLOADS)"
mkdir -p "$WORK/uploads"
if [ -d "$UPLOADS" ]; then
  cp -a "$UPLOADS/." "$WORK/uploads/"
fi
FILES=$(find "$WORK/uploads" -type f | wc -l | tr -d ' ')

VERSION=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' package.json | head -n 1)
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
MIGRATIONS=$(ls db/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
cat > "$WORK/manifest.json" <<EOF
{
  "app": "docsku",
  "version": "$VERSION",
  "commit": "$COMMIT",
  "environment": "$ENV_NAME",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "migrationFiles": $MIGRATIONS,
  "uploads": $FILES,
  "database": $COUNTS
}
EOF

ARCHIVE="$OUT_DIR/docsku-$ENV_NAME-$STAMP.tar.gz"
tar -C "$WORK" -czf "$ARCHIVE" manifest.json db.dump uploads
chmod 600 "$ARCHIVE"
echo "==> $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1), $FILES upload(s))"
cat "$WORK/manifest.json"
