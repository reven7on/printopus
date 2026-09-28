#!/usr/bin/env bash
# Create an encrypted off-site backup for one isolated Printopus environment.
set -Eeuo pipefail
IFS=$'\n\t'
umask 077
usage() { echo "Usage: $0 ENV_FILE" >&2; exit 64; }
[[ $# -eq 1 ]] || usage
env_file=$1
[[ -f "$env_file" ]] || { echo "Environment file not found: $env_file" >&2; exit 66; }
stack_dir=$(cd "$(dirname "$env_file")" && pwd -P)
value_from_env() {
  local key=$1 line
  line=$(grep -E "^${key}=" "$env_file" | tail -n 1 || true)
  printf '%s' "${line#*=}" | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}
environment=${PRINTOPUS_ENVIRONMENT:-${DEPLOYMENT_ENV:-$(value_from_env DEPLOYMENT_ENV)}}
environment=${environment:-$(basename "$stack_dir")}
case "$environment" in staging|production) ;; *) echo "Refusing unknown environment '$environment'; use staging or production." >&2; exit 64 ;; esac
compose_project=${COMPOSE_PROJECT_NAME:-$(value_from_env COMPOSE_PROJECT_NAME)}
compose_project=${compose_project:-printopus-$environment}
compose_file=${COMPOSE_FILE:-$(value_from_env COMPOSE_FILE)}
if [[ -z "$compose_file" ]]; then
  for candidate in "$stack_dir/deploy/compose.app.yaml" "$stack_dir/compose.app.yaml" "$stack_dir/compose.production.yaml" "$stack_dir/compose.yaml"; do [[ -f "$candidate" ]] && { compose_file=$candidate; break; }; done
fi
[[ -n "$compose_file" && -f "$compose_file" ]] || { echo "Compose file not found for $stack_dir" >&2; exit 66; }
uploads_dir=${UPLOADS_DIR:-${UPLOADS_PATH:-$(value_from_env UPLOADS_PATH)}}
uploads_dir=${uploads_dir:-$(value_from_env UPLOADS_DIR)}
uploads_dir=${uploads_dir:-"$stack_dir/uploads"}
[[ -d "$uploads_dir" ]] || { echo "Uploads directory not found: $uploads_dir" >&2; exit 66; }
backup_root=${BACKUP_ROOT:-/srv/printopus/backups}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="$backup_root/$environment/$timestamp"
mkdir -p "$destination"
trap 'status=$?; if [[ $status -ne 0 ]]; then echo "Backup failed; incomplete local data left at $destination" >&2; fi; exit $status' EXIT
echo "Dumping PostgreSQL for $environment..."
docker compose --project-name "$compose_project" --env-file "$env_file" -f "$compose_file" exec -T database sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom' > "$destination/database.dump"
echo "Archiving uploads for $environment..."
tar -C "$uploads_dir" --create --gzip --file "$destination/uploads.tar.gz" .
{ printf 'environment=%s\ncreated_at=%s\n' "$environment" "$timestamp"; (cd "$destination" && sha256sum database.dump uploads.tar.gz); } > "$destination/manifest.txt"
chmod 600 "$destination/database.dump" "$destination/uploads.tar.gz" "$destination/manifest.txt"
restic_env_file=${RESTIC_ENV_FILE:-/etc/printopus/restic.env}
if [[ -f "$restic_env_file" ]]; then source "$restic_env_file"; fi
[[ -n ${RESTIC_REPOSITORY:-} && -n ${RESTIC_PASSWORD_FILE:-} ]] || { echo "Off-site backup is not configured. Set RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE in $restic_env_file." >&2; exit 78; }
[[ -r "$RESTIC_PASSWORD_FILE" ]] || { echo "RESTIC_PASSWORD_FILE is not readable." >&2; exit 77; }
command -v restic >/dev/null || { echo "restic is required for off-site backups." >&2; exit 69; }
echo "Uploading encrypted Restic snapshot..."
restic backup --tag printopus --tag "environment=$environment" "$destination"
restic forget --prune --tag printopus --tag "environment=$environment" --keep-daily 7 --keep-weekly 4
find "$backup_root/$environment" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf -- {} +
trap - EXIT
echo "Backup completed and uploaded: $destination"
