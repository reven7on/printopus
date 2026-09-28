#!/usr/bin/env bash
# Deploys a release already published to Docker Hub. Invoke from an environment
# directory, for example: cd /srv/printopus/staging && ./deploy/scripts/deploy.sh
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_environment
ensure_prerequisites

state_dir="$PWD/.deploy"
mkdir -p "$state_dir" "$UPLOADS_PATH"
chmod 700 "$state_dir"

old_container="$(existing_app_container_id)"
if [[ -n "$old_container" ]]; then
  old_image="$(docker inspect --format '{{.Config.Image}}' "$old_container")"
  expected_prefix="${DOCKERHUB_NAMESPACE}/printopus-app:"
  if [[ "$old_image" == "$expected_prefix"* ]]; then
    old_tag="${old_image#"$expected_prefix"}"
    printf '%s\n' "$old_tag" > "$state_dir/previous-app-tag"
  else
    fail "Existing app image is not from expected namespace: $old_image"
  fi
fi

# Detect an existing database before Compose can create its named volume. Every
# later deployment must finish an off-site backup before migrations start, even
# when the previous database container happened to be stopped.
database_volume="${COMPOSE_PROJECT_NAME}_postgres_data"
database_exists=false
if docker volume inspect "$database_volume" >/dev/null 2>&1; then
  database_exists=true
fi

"${COMPOSE[@]}" pull database migrations app telegram-webhook telegram-worker
"${COMPOSE[@]}" up -d database
wait_for_database_health || fail "Database did not become healthy"

if [[ "$database_exists" == true ]]; then
  if [[ -x "$SCRIPT_DIR/backup.sh" ]]; then
    "$SCRIPT_DIR/backup.sh" "$ENV_FILE"
  else
    backup_file="$state_dir/pre-migration-${DEPLOYMENT_ENV}-$(date -u +%Y%m%dT%H%M%SZ).sql"
    "${COMPOSE[@]}" exec -T database pg_dump -U printopus -d printopus > "$backup_file"
    chmod 600 "$backup_file"
    printf 'Created pre-migration database dump: %s\n' "$backup_file"
  fi
fi

"${COMPOSE[@]}" run --rm migrations
"${COMPOSE[@]}" up -d --no-deps app

if ! wait_for_app_health; then
  printf 'New application image failed health checks; rolling back application image only.\n' >&2
  if [[ -f "$state_dir/previous-app-tag" ]]; then
    "$SCRIPT_DIR/rollback.sh"
  fi
  fail "Deployment failed health checks; database migrations were not rolled back"
fi

"${COMPOSE[@]}" run --rm telegram-webhook
"${COMPOSE[@]}" up -d --no-deps telegram-worker
"$SCRIPT_DIR/smoke.sh"
printf 'Deployment completed: %s (%s)\n' "$DEPLOYMENT_ENV" "$IMAGE_TAG"
