#!/usr/bin/env bash
# Compatibility entrypoint for operators running this checkout directly.
set -Eeuo pipefail
project_dir=$(cd "$(dirname "$0")/.." && pwd -P)
exec "$project_dir/deploy/scripts/backup.sh" "$@"
