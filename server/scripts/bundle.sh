#!/usr/bin/env bash

set -Eeuo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-${SERVER_DIR}/bundle}"
ESBUILD="${SERVER_DIR}/node_modules/.bin/esbuild"

if [[ ! -x "${ESBUILD}" ]]; then
  echo "esbuild is not installed. Run 'npm ci' in ${SERVER_DIR}." >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"
rm -f "${OUTPUT_DIR}/server.js" "${OUTPUT_DIR}/emailWorker.js"

COMMON_ARGS=(
  --bundle
  --platform=node
  --target=node22
  --format=cjs
  --legal-comments=none
)

"${ESBUILD}" "${SERVER_DIR}/src/bundleServer.ts" \
  "${COMMON_ARGS[@]}" \
  --outfile="${OUTPUT_DIR}/server.js"

"${ESBUILD}" "${SERVER_DIR}/src/workers/emailWorker.ts" \
  "${COMMON_ARGS[@]}" \
  --outfile="${OUTPUT_DIR}/emailWorker.js"

echo "Bundles created:"
du -h "${OUTPUT_DIR}/server.js" "${OUTPUT_DIR}/emailWorker.js"
