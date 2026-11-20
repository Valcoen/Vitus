#!/usr/bin/env bash
# Nightly Supabase backup: app data (public schema) + login accounts.
# Uses the postgres:17 Docker image as client (server is Postgres 17).
# Credentials: /root/.config/vitus/db.env (DATABASE_URL=...), chmod 600.
set -euo pipefail
OUT="${BACKUP_DIR:-/root/backups/vitus}"
KEEP_DAYS="${KEEP_DAYS:-21}"
ENV_FILE="${ENV_FILE:-/root/.config/vitus/db.env}"
TS=$(date -u +%Y%m%d-%H%M%S)
mkdir -p "$OUT" && chmod 700 "$OUT"

docker run --rm --env-file "$ENV_FILE" -v "$OUT":/out postgres:17-alpine sh -c "
  pg_dump \"\$DATABASE_URL\" --schema=public --format=custom --no-owner --no-privileges -f /out/public-$TS.dump &&
  pg_dump \"\$DATABASE_URL\" --data-only --table=auth.users --table=auth.identities --format=custom -f /out/auth-$TS.dump &&
  pg_restore --list /out/public-$TS.dump > /dev/null"
chmod 600 "$OUT"/*-"$TS".dump

find "$OUT" -name '*.dump' -mtime +"$KEEP_DAYS" -delete
find "$OUT" -name '*.sql' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: public-$TS.dump ($(du -h "$OUT/public-$TS.dump" | cut -f1))"
