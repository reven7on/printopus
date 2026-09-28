#!/usr/bin/env bash
# Restore only into a new isolated project. There is no production/staging mode.
set -Eeuo pipefail
IFS=$'\n\t'
umask 077
usage() { echo "Usage: $0 (--source BACKUP_DIR | --restic-snapshot ID) --target-project printopus-restore-NAME" >&2; exit 64; }
source_dir= snapshot= target_project=
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) source_dir=${2:-}; shift 2 ;;
    --restic-snapshot) snapshot=${2:-}; shift 2 ;;
    --target-project) target_project=${2:-}; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done
[[ -n "$target_project" && ( -n "$source_dir" || -n "$snapshot" ) && ! ( -n "$source_dir" && -n "$snapshot" ) ]] || usage
[[ "$target_project" =~ ^printopus-restore-[a-z0-9][a-z0-9_-]*$ ]] || { echo "Target project must start with printopus-restore-." >&2; exit 64; }
restore_root=${RESTORE_ROOT:-/srv/printopus/restores}
target_dir="$restore_root/$target_project"
[[ ! -e "$target_dir" ]] || { echo "Refusing existing target: $target_dir" >&2; exit 73; }
volume_name="${target_project}_postgres_data"
docker volume inspect "$volume_name" >/dev/null 2>&1 && { echo "Refusing existing Docker volume: $volume_name" >&2; exit 73; }
temp_dir=
cleanup() { local status=$?; [[ -n "$temp_dir" ]] && rm -rf "$temp_dir"; exit "$status"; }
trap cleanup EXIT
if [[ -n "$snapshot" ]]; then
  restic_env_file=${RESTIC_ENV_FILE:-/etc/printopus/restic.env}
  [[ -f "$restic_env_file" ]] || { echo "Restic config missing: $restic_env_file" >&2; exit 66; }
  source "$restic_env_file"
  [[ -n ${RESTIC_REPOSITORY:-} && -n ${RESTIC_PASSWORD_FILE:-} ]] || { echo "Incomplete Restic configuration." >&2; exit 78; }
  command -v restic >/dev/null || { echo "restic is required." >&2; exit 69; }
  temp_dir=$(mktemp -d)
  restic restore "$snapshot" --target "$temp_dir"
  source_dir=$(find "$temp_dir" -type f -name database.dump -print -quit | xargs -r dirname)
fi
[[ -n "$source_dir" && -d "$source_dir" && -f "$source_dir/database.dump" && -f "$source_dir/uploads.tar.gz" ]] || { echo "Backup must contain database.dump and uploads.tar.gz." >&2; exit 66; }
if [[ -f "$source_dir/manifest.txt" ]]; then
  (cd "$source_dir" && awk '/^[0-9a-f]{64}  (database\.dump|uploads\.tar\.gz)$/ { print $0 }' manifest.txt | sha256sum --check --strict)
fi
tar -tzf "$source_dir/uploads.tar.gz" | awk '/^\// || /(^|\/)\.\.($|\/)/ { bad=1 } END { exit bad }' || { echo "Unsafe path in uploads archive." >&2; exit 65; }
mkdir -p "$target_dir/uploads"
tar -xzf "$source_dir/uploads.tar.gz" -C "$target_dir/uploads" --no-same-owner --no-same-permissions
restore_password=${RESTORE_POSTGRES_PASSWORD:-$(openssl rand -hex 32)}
printf 'POSTGRES_DB=printopus\nPOSTGRES_USER=printopus\nPOSTGRES_PASSWORD=%s\n' "$restore_password" > "$target_dir/.restore.env"
chmod 600 "$target_dir/.restore.env"
cat > "$target_dir/compose.restore.yaml" <<'EOF'
services:
  database:
    image: postgres:17.11-alpine3.24
    restart: "no"
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
volumes:
  postgres_data:
EOF
docker compose --project-name "$target_project" --env-file "$target_dir/.restore.env" -f "$target_dir/compose.restore.yaml" up -d database
ready=false
for _ in {1..30}; do
  if docker compose --project-name "$target_project" --env-file "$target_dir/.restore.env" -f "$target_dir/compose.restore.yaml" exec -T database pg_isready -U printopus -d printopus >/dev/null; then ready=true; break; fi
  sleep 1
done
[[ "$ready" = true ]] || { echo "Restore database did not become ready." >&2; exit 75; }
docker compose --project-name "$target_project" --env-file "$target_dir/.restore.env" -f "$target_dir/compose.restore.yaml" exec -T database sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore --clean --if-exists --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' < "$source_dir/database.dump"
trap - EXIT
[[ -n "$temp_dir" ]] && rm -rf "$temp_dir"
echo "Restore complete: $target_dir"
echo "Isolated project: $target_project (database has no published ports)."
