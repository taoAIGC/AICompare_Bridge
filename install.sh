#!/usr/bin/env bash
set -euo pipefail

REPO="${AICOMPARE_GITHUB_REPO:-taoAIGC/AICompare_Bridge}"
REF="${AICOMPARE_GITHUB_REF:-main}"
BASE="https://raw.githubusercontent.com/${REPO}/${REF}/bin"
INSTALL_DIR="${AICOMPARE_BRIDGE_HOME:-$HOME/.aicompare-webbridge}"
BIN_DIR="$INSTALL_DIR/bin"
LINK_DIR="${AICOMPARE_BIN_DIR:-$HOME/.local/bin}"

case "${1:-}" in
  --no-skill)
    INSTALL_DAEMON=1
    ;;
  --skill-only)
    echo "Skill installation is managed by the Agent Skill system. Install this repository as a Skill, or run the default installer to install the Bridge." >&2
    exit 2
    ;;
  "")
    INSTALL_DAEMON=1
    ;;
  *)
    echo "Usage: install.sh [--no-skill|--skill-only]" >&2
    exit 2
    ;;
esac

if [ "$INSTALL_DAEMON" -eq 1 ] && [ -x "$BIN_DIR/webbridge.js" ] && command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
  env -u NODE_OPTIONS "$NODE_BIN" "$BIN_DIR/webbridge.js" stop >/dev/null 2>&1 || true
fi

mkdir -p "$BIN_DIR"
if [ "$INSTALL_DAEMON" -eq 1 ]; then
  tmp="$BIN_DIR/.webbridge.$$.tmp"
  curl -fsSL --retry 3 "${BASE}/webbridge.js" -o "$tmp"
  mv "$tmp" "$BIN_DIR/webbridge.js"
  curl -fsSL --retry 3 "${BASE}/runner.js" -o "$BIN_DIR/runner.js"
  chmod 700 "$BIN_DIR/runner.js"
  chmod 700 "$BIN_DIR/webbridge.js"
  cat > "$BIN_DIR/aicompare-webbridge" <<EOF
#!/usr/bin/env bash
exec env -u NODE_OPTIONS "${NODE_BIN:-$(command -v node)}" "$BIN_DIR/webbridge.js" "\$@"
EOF
  chmod 700 "$BIN_DIR/aicompare-webbridge"
fi
if [ "$INSTALL_DAEMON" -eq 1 ]; then
  mkdir -p "$LINK_DIR"
  ln -sfn "$BIN_DIR/aicompare-webbridge" "$LINK_DIR/aicompare-webbridge"
fi

if [ "$INSTALL_DAEMON" -eq 1 ] && command -v node >/dev/null 2>&1; then
  NODE_BIN="${NODE_BIN:-$(command -v node)}"
  env -u NODE_OPTIONS "$NODE_BIN" "$BIN_DIR/webbridge.js" start >/dev/null 2>&1 || true
elif [ "$INSTALL_DAEMON" -eq 1 ]; then
  echo "Node.js 20 or newer is required. Install it and rerun this command." >&2
  exit 1
fi
echo "AICompare WebBridge installed. Check: $LINK_DIR/aicompare-webbridge status"
if [[ ":$PATH:" != *":$LINK_DIR:"* ]]; then
  echo "Add this directory to PATH if the command is not found: $LINK_DIR"
fi
