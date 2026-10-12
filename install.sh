#!/usr/bin/env bash
set -euo pipefail

REPO="${AICOMPARE_GITHUB_REPO:-taoAIGC/AICompare_Bridge}"
REF="${AICOMPARE_GITHUB_REF:-main}"
BASE="https://raw.githubusercontent.com/${REPO}/${REF}/AICompare%20Cli/bin"
INSTALL_DIR="${AICOMPARE_BRIDGE_HOME:-$HOME/.aicompare-webbridge}"
BIN_DIR="$INSTALL_DIR/bin"
mkdir -p "$BIN_DIR"
tmp="$BIN_DIR/.webbridge.$$.tmp"
curl -fsSL --retry 3 "${BASE}/webbridge.js" -o "$tmp"
mv "$tmp" "$BIN_DIR/webbridge.js"
curl -fsSL --retry 3 "${BASE}/runner.js" -o "$BIN_DIR/runner.js"
chmod 700 "$BIN_DIR/runner.js"
chmod 700 "$BIN_DIR/webbridge.js"
ln -sfn "$BIN_DIR/webbridge.js" "$BIN_DIR/aicompare-webbridge"
if command -v node >/dev/null 2>&1; then
  node "$BIN_DIR/webbridge.js" start >/dev/null 2>&1 || true
else
  echo "Node.js 20 or newer is required. Install it and rerun this command." >&2
  exit 1
fi
echo "AICompare WebBridge installed. Check: $BIN_DIR/aicompare-webbridge status"
