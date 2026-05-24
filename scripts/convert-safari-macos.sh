#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Safari conversion requires macOS with Xcode command line tools."
  echo "Run 'node scripts/build-safari-source.mjs' on Windows/Linux to prepare dist/safari, then run this script on macOS."
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun was not found. Install Xcode command line tools first."
  exit 1
fi

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "safari-web-extension-converter is not available. Install Xcode and Safari development tools first."
  exit 1
fi

cd "$REPO_ROOT"
node scripts/build-safari-source.mjs

xcrun safari-web-extension-converter dist/safari \
  --project-location safari/FMHY-SafeGuard-Safari \
  --app-name "FMHY SafeGuard"
