#!/usr/bin/env bash
# SessionStart hook: prepare a Claude Code cloud session (does nothing on a local machine).
# Cloud sessions start from a fresh clone, so the dev tools (eslint, puppeteer-core) must be installed.
# Chrome is preinstalled there with CHROME_PATH set, which the smoke test picks up.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"

stamp=node_modules/.lock-hash
hash=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$hash" ]; then
  echo "cloud-setup: dev dependencies already installed"
  exit 0
fi
npm ci --no-audit --no-fund --loglevel=error
echo "$hash" > "$stamp"
echo "cloud-setup: dev dependencies installed (node $(node -v), CHROME_PATH=${CHROME_PATH:-unset})"
