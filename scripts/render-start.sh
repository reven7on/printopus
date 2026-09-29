#!/bin/sh
set -eu

export SITE_URL="${SITE_URL:-${RENDER_EXTERNAL_URL:-}}"
export PORT="${PORT:-10000}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export UPLOAD_DIR="${UPLOAD_DIR:-/var/lib/printopus/uploads}"
export UPLOAD_MIN_FREE_BYTES="${UPLOAD_MIN_FREE_BYTES:-0}"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${SITE_URL:?SITE_URL or RENDER_EXTERNAL_URL is required}"
: "${ADMIN_USERNAME:?ADMIN_USERNAME is required}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"
: "${ADMIN_SESSION_SECRET:?ADMIN_SESSION_SECRET is required}"
: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is required}"
: "${TELEGRAM_ADMIN_CHAT_ID:?TELEGRAM_ADMIN_CHAT_ID is required}"
: "${TELEGRAM_WEBHOOK_SECRET:?TELEGRAM_WEBHOOK_SECRET is required}"

case "$SITE_URL" in
  https://*) ;;
  *)
    echo "SITE_URL must use HTTPS on Render." >&2
    exit 1
    ;;
esac

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Bootstrapping the catalog when needed..."
./node_modules/.bin/tsx prisma/bootstrap.ts

if [ "${SKIP_TELEGRAM_WEBHOOK_SETUP:-0}" = "1" ]; then
  echo "Skipping Telegram webhook setup for the local smoke test."
else
  echo "Configuring the Telegram webhook..."
  node scripts/configure-telegram-webhook.mjs
fi

server_pid=""
worker_pid=""

stop_children() {
  trap - TERM INT
  if [ -n "$server_pid" ]; then kill -TERM "$server_pid" 2>/dev/null || true; fi
  if [ -n "$worker_pid" ]; then kill -TERM "$worker_pid" 2>/dev/null || true; fi
  if [ -n "$server_pid" ]; then wait "$server_pid" 2>/dev/null || true; fi
  if [ -n "$worker_pid" ]; then wait "$worker_pid" 2>/dev/null || true; fi
}

trap stop_children TERM INT

echo "Starting the Next.js server on port $PORT..."
node server.js &
server_pid=$!

echo "Starting the Telegram delivery worker..."
./node_modules/.bin/tsx scripts/telegram-delivery-worker.ts &
worker_pid=$!

while kill -0 "$server_pid" 2>/dev/null && kill -0 "$worker_pid" 2>/dev/null; do
  sleep 2
done

exit_code=1
if ! kill -0 "$server_pid" 2>/dev/null; then
  wait "$server_pid" || exit_code=$?
  echo "Next.js server stopped; terminating the Render service." >&2
else
  wait "$worker_pid" || exit_code=$?
  echo "Telegram delivery worker stopped; terminating the Render service." >&2
fi

stop_children
exit "$exit_code"
