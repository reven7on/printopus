#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
environment_file=${1:-"$project_dir/.env.production"}
backup_root=${2:-"/srv/printopus/backups"}
upload_root="/srv/printopus/uploads"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="$backup_root/$timestamp"

if [ ! -f "$environment_file" ]; then
  echo "Environment file not found: $environment_file" >&2
  exit 1
fi

mkdir -p "$destination"
docker compose --env-file "$environment_file" -f "$project_dir/compose.production.yaml" exec -T database \
  sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --username=printopus --dbname=printopus --format=custom' \
  > "$destination/database.dump"
tar -C "$upload_root" -czf "$destination/uploads.tar.gz" .
chmod 600 "$destination/database.dump" "$destination/uploads.tar.gz"

echo "Backup created: $destination"
