#!/usr/bin/env bash
# Zero-downtime-ish deploy for Vitus on the VPS.
#   1. pull, 2. install deps only if the lockfile changed, 3. run unit tests,
#   4. build into .next-build while the live site keeps serving .next,
#   5. swap folders + restart PM2, 6. health check, roll back on failure.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROCESS_NAME="${PROCESS_NAME:-Vitus-Nutrition}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/login}"
BRANCH="${BRANCH:-main}"
cd "$APP_DIR"

step() { printf '\n\033[0;34m=== %s ===\033[0m\n' "$1"; }
fail() { printf '\n\033[0;31mFEHLER: %s\033[0m\n' "$1"; exit 1; }

step "Code holen ($BRANCH)"
OLD_LOCK=$(sha256sum package-lock.json | cut -d' ' -f1)
git pull --ff-only origin "$BRANCH" || fail "git pull fehlgeschlagen (lokale Änderungen?)"
NEW_LOCK=$(sha256sum package-lock.json | cut -d' ' -f1)

if [ "$OLD_LOCK" != "$NEW_LOCK" ] || [ ! -d node_modules ]; then
  step "Abhängigkeiten installieren (package-lock.json geändert)"
  npm install --no-audit --no-fund
fi

step "Tests"
npm test || fail "Tests fehlgeschlagen – nichts deployt"

step "Build (live-Seite läuft weiter)"
rm -rf .next-build
NEXT_DIST_DIR=.next-build NODE_OPTIONS=--max-old-space-size=1536 nice -n 10 npx next build || fail "Build fehlgeschlagen – live-Seite unverändert"

step "Umschalten + Neustart"
rm -rf .next-prev
[ -d .next ] && mv .next .next-prev
mv .next-build .next
pm2 restart "$PROCESS_NAME" --update-env

step "Health-Check"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" || true)
  [ "$code" = "200" ] && { printf '\033[0;32mOK – App ist live (%s)\033[0m\n' "$(git log -1 --format='%h %s')"; exit 0; }
  sleep 1
done

printf '\033[0;31mHealth-Check fehlgeschlagen (%s) – Rollback\033[0m\n' "$code"
rm -rf .next-failed && mv .next .next-failed
[ -d .next-prev ] && mv .next-prev .next
pm2 restart "$PROCESS_NAME" --update-env
fail "Neue Version zurückgerollt; fehlerhafter Build liegt in .next-failed"
