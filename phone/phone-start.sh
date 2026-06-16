#!/usr/bin/env bash
#
# run-phone.sh — run the app on a USB-connected device and capture mic-level logs.
#
# What it does:
#   1. Picks a device (arg > a real phone > the emulator).
#   2. Routes the phone to the Mac's server over the USB cable (adb reverse).
#   3. Runs `flutter run`, teeing ALL output to logs/run-<timestamp>.log.
#   4. Live-highlights the mic-level / "recording stopped" lines with a 🎤 prefix
#      so you can see at a glance whether the mic is capturing signal or silence.
#
# Usage:
#   ./run-phone.sh                 # auto-pick device
#   ./run-phone.sh <SERIAL>        # force a specific device (see `adb devices`)
#   PORT=4000 ./run-phone.sh       # override server port (default 4000)
#
set -uo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-4000}"

# ── 1. Pick a device ────────────────────────────────────────────────────────
DEVICE="${1:-}"
if [[ -z "$DEVICE" ]]; then
  # Prefer a real phone (serial that doesn't start with "emulator-").
  DEVICE=$(adb devices | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1; exit}')
fi
if [[ -z "$DEVICE" ]]; then
  DEVICE=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
fi
if [[ -z "$DEVICE" ]]; then
  echo "✗ No authorized adb device found." >&2
  echo "  On the phone: enable USB debugging, set USB mode to File Transfer," >&2
  echo "  and tap 'Allow USB debugging?'. Then check with: adb devices" >&2
  exit 1
fi
echo "▶ Device:  $DEVICE"

# ── 2. USB networking: phone → Mac localhost:PORT through the cable ──────────
adb -s "$DEVICE" reverse tcp:"$PORT" tcp:"$PORT" >/dev/null \
  && echo "▶ Routed:  phone localhost:$PORT → Mac localhost:$PORT (adb reverse)" \
  || echo "⚠ adb reverse failed — falling back to whatever SERVER_URL resolves to"

# ── 3. Log file ─────────────────────────────────────────────────────────────
mkdir -p logs
LOG="logs/run-$(date +%Y%m%d-%H%M%S).log"
: > "$LOG"
echo "▶ Logging: $LOG"
echo "  (mic lines are highlighted live; full output is in the log)"
echo

# ── 4. Live mic-level highlighter (reads the log as it grows) ───────────────
( tail -f "$LOG" \
    | grep --line-buffered -iE "mic level|recording stopped|SILENT|has signal" \
    | sed -u 's/^/🎤 /' ) &
TAIL_PID=$!

cleanup() {
  kill "$TAIL_PID" 2>/dev/null || true
  adb -s "$DEVICE" reverse --remove tcp:"$PORT" 2>/dev/null || true
}
trap cleanup EXIT

# ── 5. Run the app ──────────────────────────────────────────────────────────
SERVER_URL="${SERVER_URL:-http://localhost:$PORT}"
echo "▶ SERVER_URL=$SERVER_URL"
echo
flutter run -d "$DEVICE" \
  --dart-define=SERVER_URL="$SERVER_URL" \
  --dart-define-from-file=.env 2>&1 | tee "$LOG"
