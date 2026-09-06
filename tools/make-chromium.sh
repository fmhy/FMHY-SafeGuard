#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/build.mjs
VERSION=$(node -p "require('./platform/chromium/manifest.json').version")
if [[ -n "${1:-}" && "${1#v}" != "$VERSION" ]]; then
  echo "Requested version does not match manifest version $VERSION" >&2
  exit 1
fi
(cd dist/chromium && zip -qr "../FMHY-SafeGuard_v${VERSION}.chromium.zip" .)
