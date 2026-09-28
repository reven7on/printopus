#!/usr/bin/env bash
# Shared helpers for the self-contained deployment bundle.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$BUNDLE_DIR/compose.app.yaml"

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

load_environment() {
  ENV_FILE="${PRINTOPUS_ENV_FILE:-$PWD/.env}"
  [[ -f "$ENV_FILE" ]] || fail "Environment file not found: $ENV_FILE"
  # Deployment env files are local, owner-controlled KEY=VALUE files. They are
  # never committed and must be mode 0600 on the VPS.
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a

  for variable in COMPOSE_PROJECT_NAME DEPLOYMENT_ENV DOCKERHUB_NAMESPACE IMAGE_TAG \
    SITE_URL POSTGRES_PASSWORD DATABASE_URL UPLOADS_PATH \
    ADMIN_USERNAME ADMIN_PASSWORD ADMIN_SESSION_SECRET TELEGRAM_BOT_TOKEN \
    TELEGRAM_ADMIN_CHAT_ID TELEGRAM_WEBHOOK_SECRET; do
    [[ -n "${!variable:-}" ]] || fail "$variable must be set in $ENV_FILE"
    [[ "${!variable}" != *replace* ]] || fail "$variable still contains a template placeholder"
  done

  [[ "$DEPLOYMENT_ENV" == staging || "$DEPLOYMENT_ENV" == production ]] || \
    fail "DEPLOYMENT_ENV must be staging or production"
  [[ "$COMPOSE_PROJECT_NAME" == "printopus-$DEPLOYMENT_ENV" ]] || \
    fail "COMPOSE_PROJECT_NAME must be printopus-$DEPLOYMENT_ENV"
  [[ "$SITE_URL" == https://* ]] || fail "SITE_URL must use HTTPS"
  [[ "${#ADMIN_SESSION_SECRET}" -ge 32 ]] || fail "ADMIN_SESSION_SECRET must be at least 32 characters"
  [[ "${#TELEGRAM_WEBHOOK_SECRET}" -ge 16 ]] || fail "TELEGRAM_WEBHOOK_SECRET must be at least 16 characters"
  if [[ "$TELEGRAM_ADMIN_CHAT_ID" == -* && -z "${TELEGRAM_MANAGER_USER_IDS:-}" ]]; then
    fail "TELEGRAM_MANAGER_USER_IDS is required when TELEGRAM_ADMIN_CHAT_ID is a group chat"
  fi

  EDGE_NETWORK="${EDGE_NETWORK:-printopus-edge}"
  COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
}

ensure_prerequisites() {
  command -v docker >/dev/null || fail "Docker is required"
  docker compose version >/dev/null || fail "Docker Compose v2 is required"
  docker network inspect "$EDGE_NETWORK" >/dev/null 2>&1 || \
    fail "External Docker network $EDGE_NETWORK is missing; start the edge bundle first"
}

app_container_id() {
  "${COMPOSE[@]}" ps -q app
}

existing_app_container_id() {
  "${COMPOSE[@]}" ps -a -q app
}

wait_for_database_health() {
  local timeout="${1:-120}" elapsed=0 container health state
  container="$("${COMPOSE[@]}" ps -a -q database)"
  [[ -n "$container" ]] || return 1
  while (( elapsed < timeout )); do
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container")"
    state="$(docker inspect --format '{{.State.Status}}' "$container")"
    [[ "$health" == healthy ]] && return 0
    [[ "$health" == unhealthy || "$state" == exited || "$state" == dead ]] && return 1
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

wait_for_app_health() {
  local timeout="${1:-180}" elapsed=0 container health state
  container="$(app_container_id)"
  [[ -n "$container" ]] || return 1
  while (( elapsed < timeout )); do
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container")"
    state="$(docker inspect --format '{{.State.Status}}' "$container")"
    if [[ "$health" == healthy ]]; then
      return 0
    fi
    if [[ "$health" == unhealthy || "$state" == exited || "$state" == dead ]]; then
      return 1
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  return 1
}
