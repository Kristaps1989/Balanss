#!/usr/bin/env bash
# End-to-end run: fresh e2e database → seed → backend (fake AI) → web build → Playwright.
# Requires a local Postgres with the `balanss` role (see backend/README.md).
set -euo pipefail
cd "$(dirname "$0")/.."

API_PORT=${E2E_API_PORT:-3100}
WEB_PORT=${E2E_WEB_PORT:-8099}
export E2E_API_URL="http://localhost:${API_PORT}"
export E2E_WEB_URL="http://localhost:${WEB_PORT}"
DB_URL=${E2E_DATABASE_URL:-postgres://balanss:balanss@localhost:5432/balanss_e2e}
OUT=${E2E_WEB_DIR:-dist-e2e}

backend_env=(
  NODE_ENV=development
  LOG_LEVEL=warn
  PORT="$API_PORT"
  DATABASE_URL="$DB_URL"
  JWT_SECRET=e2e-secret-e2e-secret-e2e-secret-e2e
  PUBLIC_API_URL="$E2E_API_URL"
  CORS_ORIGINS='*'
  EMAIL_PROVIDER=console
  AI_PROVIDER=fake
  SCHEDULER=off
  STORAGE_DIR="$(pwd)/.e2e-storage"
  AUTH_RATE_LIMIT_MAX=10000
  RATE_LIMIT_MAX=100000
  REVENUECAT_WEBHOOK_SECRET=e2e-webhook
)

for port in "$API_PORT" "$WEB_PORT"; do
  if curl -s -o /dev/null "http://localhost:${port}"; then
    echo "Port ${port} is already in use (a previous e2e run?). Stop it first." >&2
    exit 1
  fi
done

echo "› Resetting e2e database"
psql "$DB_URL" -q -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;'
(cd backend && env "${backend_env[@]}" npm run -s migrate && env "${backend_env[@]}" npm run -s seed)

echo "› Starting backend on :$API_PORT"
(cd backend && env "${backend_env[@]}" npx tsx src/server.ts) &
API_PID=$!

echo "› Building web app against $E2E_API_URL"
rm -rf "$OUT"
EXPO_OFFLINE=1 CI=1 EXPO_PUBLIC_API_URL="$E2E_API_URL" EXPO_PUBLIC_USE_MOCK=0 npx expo export -p web --clear --output-dir "$OUT" >/dev/null

echo "› Serving web build on :$WEB_PORT"
npx -y serve -s "$OUT" -l "$WEB_PORT" >/dev/null 2>&1 &
WEB_PID=$!
cleanup() {
  # Kill the subshells and their children (tsx spawns node, npx spawns serve).
  for pid in $API_PID $WEB_PID; do
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
  done
  pkill -f "tsx src/server.ts" 2>/dev/null || true
  pkill -f "serve -s $OUT" 2>/dev/null || true
}
trap cleanup EXIT

for i in $(seq 1 60); do
  curl -sf "$E2E_API_URL/health" >/dev/null && curl -sf "$E2E_WEB_URL" >/dev/null && break
  sleep 1
done

npx playwright test "$@"
