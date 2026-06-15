#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "Missing phone/.env. Create it from .env.example first." >&2
  exit 1
fi
flutter clean
flutter pub get
exec flutter run -v -d emulator-5554 --dart-define-from-file=.env "$@"
