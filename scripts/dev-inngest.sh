#!/usr/bin/env bash
# Start the Inngest dev worker pointed at the local Next.js /api/inngest endpoint.
#
# `~/.npmrc` sets `ignore-scripts=true` as a supply-chain defense, which skips
# inngest-cli's postinstall step (the one that downloads the platform binary).
# We detect the missing binary and rebuild only this package, never globally
# disabling the user's setting.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/node_modules/.bin/inngest"

if [[ ! -x "$BIN" ]] || ! "$BIN" version >/dev/null 2>&1; then
  echo "[dev:inngest] inngest-cli binary missing (postinstall skipped per ~/.npmrc). Rebuilding once..."
  npm rebuild --ignore-scripts=false inngest-cli >/dev/null
fi

exec "$BIN" dev -u http://localhost:3000/api/inngest
