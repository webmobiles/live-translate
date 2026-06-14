#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "Missing phone/.env. Create it from .env.example first." >&2
  exit 1
fi

exec flutter run -d emulator-5554 --dart-define-from-file=.env "$@"
