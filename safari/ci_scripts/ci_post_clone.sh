#!/bin/bash
set -euo pipefail

# Xcode Cloud starts this hook in safari/ci_scripts, next to the Xcode project.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "${CI_PRIMARY_REPOSITORY_PATH:-${SCRIPT_DIR}/../..}"

# WXT requires Node.js 22.12+. Xcode Cloud provides Homebrew for build tools.
if ! command -v node >/dev/null 2>&1 || ! node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1);
'; then
  export HOMEBREW_NO_AUTO_UPDATE=1
  brew install node@22
  export PATH="$(brew --prefix node@22)/bin:$PATH"
fi

node --version
npm --version
npm ci --include=dev --no-audit --no-fund
npm run compile
npm run build:safari:web

# The Xcode targets copy this output into the Safari extension during archiving.
test -f .output/safari-mv3/manifest.json
