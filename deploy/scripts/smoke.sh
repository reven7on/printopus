#!/usr/bin/env bash
# Verifies the public HTTPS route after Caddy has received a valid certificate.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_environment

command -v curl >/dev/null || fail "curl is required for a smoke test"
url="${SITE_URL%/}/api/health"
curl --fail --silent --show-error --location --max-time 20 "$url" >/dev/null
worker_container="$("${COMPOSE[@]}" ps -q telegram-worker)"
[[ -n "$worker_container" ]] || fail "Telegram delivery worker container is missing"
worker_state="$(docker inspect --format '{{.State.Status}}' "$worker_container")"
[[ "$worker_state" == running ]] || fail "Telegram delivery worker is not running (state: $worker_state)"
printf 'Smoke test passed: %s\n' "$url"
