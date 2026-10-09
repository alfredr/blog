#!/usr/bin/env bash
# Build the site, publish its image to GHCR, and ask the box server to deploy it.
#
#   deploy/publish.sh
#
# Needs kiln, Docker with buildx, a GHCR login that can write packages, and the
# box client (set BOX if it isn't on PATH). The box server is x86_64.
set -euo pipefail

image=${IMAGE:-ghcr.io/alfredr/blog}
site=${SITE:-blog}
# `go install` may put box in a GOBIN that isn't on PATH (mise does this).
box=${BOX:-$(command -v box || echo "$(go env GOBIN)/box")}

cd "$(dirname "$0")/.."

kiln build
tag=$(date -u +%Y%m%d-%H%M%S)
docker buildx build --platform linux/amd64 \
  -t "$image:latest" -t "$image:$tag" --push .

# The server also polls every few minutes; this deploys right away.
"$box" check "$site"
"$box" status "$site"
