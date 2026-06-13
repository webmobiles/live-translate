#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="${1:-/var/myapps/livetranslate}"
MODE="${LIVE_TRANSLATE_DATA_MODE:-777}"

DIRS=(
  nats
  redpanda
  scylla
  pd
  tikv
  surrealdb
  dragonfly
  valkey
  openobserve
  grafana
  loki
  tempo
  prometheus
)

if [[ $EUID -eq 0 ]]; then
  SUDO=()
else
  SUDO=(sudo)
fi

echo "Creating Live Translate data directories under: ${BASE_DIR}"

"${SUDO[@]}" mkdir -p "$BASE_DIR"

for dir in "${DIRS[@]}"; do
  "${SUDO[@]}" mkdir -p "${BASE_DIR}/${dir}"
done

"${SUDO[@]}" chmod -R "$MODE" "$BASE_DIR"

echo "Done."
echo "Permissions set to ${MODE}. Override with LIVE_TRANSLATE_DATA_MODE=755 if needed."
