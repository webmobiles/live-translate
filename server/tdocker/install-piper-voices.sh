#!/usr/bin/env bash
# Download Piper voice models for languages not covered by Kokoro.
# Kokoro supports: en, es, fr, hi, it, ja, pt, zh
# This script adds:  ar, cs, de, fi, hu, ko, nl, pl, ro, ru, sv, tr, uk
#
# Usage:
#   ./tdocker/install-piper-voices.sh                    # default: ./data/piper/models
#   ./tdocker/install-piper-voices.sh /custom/path
#
# Voice browser: https://rhasspy.github.io/piper-samples/
set -euo pipefail

BASE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="${1:-${SCRIPT_DIR}/../data/piper/models}"
MODELS_DIR="$(mkdir -p "$MODELS_DIR" && cd "$MODELS_DIR" && pwd)"

# Format: "lang_path/model_name"
# Each entry downloads <model_name>.onnx + <model_name>.onnx.json
VOICES=(
  "de/de_DE/thorsten/medium/de_DE-thorsten-medium"       # German
  "ru/ru_RU/ruslan/medium/ru_RU-ruslan-medium"           # Russian
  "nl/nl_NL/mls/medium/nl_NL-mls-medium"                 # Dutch
  "pl/pl_PL/mls/medium/pl_PL-mls-medium"                 # Polish
  "tr/tr_TR/dfki/medium/tr_TR-dfki-medium"               # Turkish
  "cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium"            # Czech
  "uk/uk_UA/lada/x_low/uk_UA-lada-x_low"                # Ukrainian
  "ar/ar_JO/kareem/medium/ar_JO-kareem-medium"           # Arabic
  "ro/ro_RO/mihai/medium/ro_RO-mihai-medium"             # Romanian
  "fi/fi_FI/harri/medium/fi_FI-harri-medium"             # Finnish
  "hu/hu_HU/anna/medium/hu_HU-anna-medium"               # Hungarian
  "sv/sv_SE/nst/medium/sv_SE-nst-medium"                 # Swedish
)

echo "Piper voice model installer"
echo "Target: ${MODELS_DIR}"
echo ""

ok=0
fail=0

for voice_path in "${VOICES[@]}"; do
  name="$(basename "$voice_path")"
  lang_comment="${voice_path##*/}"  # last segment = model name
  all_ok=true

  for ext in ".onnx" ".onnx.json"; do
    file="${name}${ext}"
    target="${MODELS_DIR}/${file}"

    if [ -f "$target" ]; then
      echo "  ✓ ${file} (already present)"
      continue
    fi

    url="${BASE_URL}/${voice_path}${ext}"
    printf "  ⬇  %-55s" "${file} ..."

    if curl -fsSL --connect-timeout 10 --retry 3 "$url" -o "$target" 2>/dev/null; then
      size=$(du -sh "$target" 2>/dev/null | cut -f1)
      echo " ${size}"
    else
      echo " FAILED"
      rm -f "$target"
      all_ok=false
    fi
  done

  if $all_ok; then
    ((ok += 1)) || true
  else
    ((fail += 1)) || true
  fi
done

echo ""
echo "Done: ${ok} models installed, ${fail} failed."

if [ "$fail" -gt 0 ]; then
  echo ""
  echo "Failed models are silently skipped at runtime (no audio for that language)."
  echo "Browse all available voices: https://rhasspy.github.io/piper-samples/"
fi
