#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="${1:-${SCRIPT_DIR}/../data}"
MODE="${LIVE_TRANSLATE_DATA_MODE:-777}"

DIRS=(
  postgres
  nats
  redpanda
  scylla
  pd
  tikv
  surrealdb
  dragonfly
  valkey
  ollama
  faster-whisper
  piper/models
  openobserve
  grafana
  loki
  tempo
  prometheus
)

echo "Creating Live Translate data directories under: ${BASE_DIR}"

mkdir -p "$BASE_DIR"

for dir in "${DIRS[@]}"; do
  mkdir -p "${BASE_DIR}/${dir}"
done

chmod -R "$MODE" "$BASE_DIR"

cat <<EOF
Done.
Permissions set to ${MODE}.

Data directory:
  ${BASE_DIR}

Usage:
  ./tdocker/create-data-dirs.sh
  LIVE_TRANSLATE_DATA_MODE=755 ./tdocker/create-data-dirs.sh
  ./tdocker/create-data-dirs.sh /custom/local/path
EOF
