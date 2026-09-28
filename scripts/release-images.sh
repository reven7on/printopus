#!/usr/bin/env bash
# Build and optionally publish the production targets from Dockerfile.
# Run `docker login` before using --push; credentials never belong in this script.
set -Eeuo pipefail

readonly SCRIPT_NAME="$(basename "$0")"
readonly MANIFEST_DIR=".release"

usage() {
  cat <<'EOF'
Usage: DOCKERHUB_NAMESPACE=<namespace> npm run release:images -- <version> [--push]

Builds linux/amd64 images for the application, migrations, Telegram webhook
setup, and the Telegram delivery worker. --push publishes immutable version
and Git-SHA tags to Docker Hub.
EOF
}

fail() {
  echo "${SCRIPT_NAME}: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is not available: $1"
}

require_clean_git_tree() {
  git diff --quiet || fail "working tree has unstaged changes; commit or stash them first"
  git diff --cached --quiet || fail "working tree has staged changes; commit them first"
  test -z "$(git ls-files --others --exclude-standard)" || fail "working tree has untracked files; commit, ignore, or remove them first"
}

require_absent_remote_tag() {
  local image_ref="$1"
  if docker buildx imagetools inspect "$image_ref" >/dev/null 2>&1; then
    fail "refusing to overwrite existing immutable image tag: ${image_ref}"
  fi
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 64
fi

release_version="$1"
push_images=false
if [[ ${2:-} == "--push" ]]; then
  push_images=true
elif [[ $# -eq 2 ]]; then
  usage >&2
  exit 64
fi

[[ "$release_version" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z][0-9A-Za-z.-]*)?$ ]] || \
  fail "version must be a SemVer-like immutable tag, for example 0.1.0 or 0.1.0-rc.1"
[[ -n ${DOCKERHUB_NAMESPACE:-} ]] || fail "DOCKERHUB_NAMESPACE must be set"
[[ "$DOCKERHUB_NAMESPACE" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail "DOCKERHUB_NAMESPACE contains unsupported characters"

require_command git
require_command npm
require_command docker
docker buildx version >/dev/null 2>&1 || fail "docker buildx is required"
require_clean_git_tree

git_sha="$(git rev-parse --short=12 HEAD)"
version_tag="${release_version#v}"
sha_tag="sha-${git_sha}"

declare -a image_names=("printopus-app" "printopus-migrations" "printopus-telegram-setup" "printopus-telegram-worker")
declare -a targets=("runner" "migrations" "telegram-setup" "telegram-worker")

echo "Running release checks for ${version_tag} (${git_sha})"
npm ci
npm audit --omit=dev --audit-level=high
npm run lint
npm run typecheck
npm test

mkdir -p "$MANIFEST_DIR"
manifest_path="$MANIFEST_DIR/release-manifest-${version_tag}-${git_sha}.json"
declare -a manifests=()

for index in "${!image_names[@]}"; do
  image="${DOCKERHUB_NAMESPACE}/${image_names[$index]}"
  target="${targets[$index]}"
  primary_ref="${image}:${version_tag}"
  sha_ref="${image}:${sha_tag}"

  if [[ "$push_images" == true ]]; then
    require_absent_remote_tag "$primary_ref"
    require_absent_remote_tag "$sha_ref"
  fi

  build_args=(
    docker buildx build
    --platform linux/amd64
    --target "$target"
    --build-arg "BUILD_VERSION=${version_tag}"
    --build-arg "VCS_REF=${git_sha}"
    --tag "$primary_ref"
    --tag "$sha_ref"
  )

  build_args+=(--load)
  build_args+=(.)

  echo "Building ${primary_ref} (${target})"
  "${build_args[@]}"

  echo "Scanning ${primary_ref} with Trivy"
  if command -v trivy >/dev/null 2>&1; then
    trivy image --quiet --severity HIGH,CRITICAL --exit-code 1 "$primary_ref"
  else
    docker run --rm \
      --volume /var/run/docker.sock:/var/run/docker.sock \
      --volume printopus-trivy-cache:/root/.cache/ \
      aquasec/trivy:0.74.0 image --quiet --severity HIGH,CRITICAL --exit-code 1 "$primary_ref"
  fi

  digest=""
  if [[ "$push_images" == true ]]; then
    docker push "$primary_ref"
    docker push "$sha_ref"
    digest="$(docker buildx imagetools inspect "$primary_ref" --format '{{.Digest}}' 2>/dev/null || true)"
    if [[ -z "$digest" ]]; then
      digest="$(docker buildx imagetools inspect "$primary_ref" 2>/dev/null | awk '/Digest:/ { print $2; exit }')"
    fi
    [[ -n "$digest" ]] || fail "could not resolve pushed digest for ${primary_ref}"
  fi

  manifests+=("${image}|${target}|${primary_ref}|${sha_ref}|${digest}")
done

MANIFEST_PATH="$manifest_path" RELEASE_VERSION="$version_tag" GIT_SHA="$git_sha" PUSHED="$push_images" IMAGE_RECORDS="$(printf '%s\n' "${manifests[@]}")" \
  node <<'NODE'
import { writeFileSync } from "node:fs";

const images = process.env.IMAGE_RECORDS.trim().split("\n").filter(Boolean).map((record) => {
  const [name, target, versionTag, gitShaTag, digest] = record.split("|");
  return { name, target, versionTag, gitShaTag, digest: digest || null };
});

writeFileSync(process.env.MANIFEST_PATH, `${JSON.stringify({
  schemaVersion: 1,
  releaseVersion: process.env.RELEASE_VERSION,
  gitSha: process.env.GIT_SHA,
  platform: "linux/amd64",
  pushed: process.env.PUSHED === "true",
  createdAt: new Date().toISOString(),
  images,
}, null, 2)}\n`);
NODE

echo "Release manifest: ${manifest_path}"
bundle_path="$MANIFEST_DIR/printopus-deploy-${version_tag}-${git_sha}.tar.gz"
tar --create --gzip --file "$bundle_path" deploy "$manifest_path"
echo "Deployment bundle: ${bundle_path}"
if [[ "$push_images" == false ]]; then
  echo "Images were built locally only. Re-run with --push after docker login to publish them." >&2
fi
