#!/usr/bin/env bash
# Rolls back the application and its notification worker. Prisma data is
# deliberately not rolled back: deploy.sh creates a pre-migration backup.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_environment
ensure_prerequisites

state_dir="$PWD/.deploy"
tag="${1:-}"
if [[ -z "$tag" && -f "$state_dir/previous-app-tag" ]]; then
  tag="$(<"$state_dir/previous-app-tag")"
fi
[[ -n "$tag" ]] || fail "No previous image tag recorded; pass it explicitly: rollback.sh <image-tag>"
[[ "$tag" != */* && "$tag" != *' '* ]] || fail "Pass the immutable image tag only, not a full image reference"

printf 'Rolling back application image to tag %s (database is unchanged).\n' "$tag"
IMAGE_TAG="$tag" "${COMPOSE[@]}" pull app telegram-worker
IMAGE_TAG="$tag" "${COMPOSE[@]}" up -d --no-deps app telegram-worker
if ! wait_for_app_health; then
  fail "Rollback image did not become healthy"
fi
IMAGE_TAG="$tag" "${COMPOSE[@]}" run --rm telegram-webhook
printf 'Rollback complete.\n'
