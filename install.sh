#!/usr/bin/env bash
set -euo pipefail

REPO="${AICOMPARE_GITHUB_REPO:-taoAIGC/AICompare_Bridge}"
REF="${AICOMPARE_GITHUB_REF:-main}"
BASE="https://raw.githubusercontent.com/${REPO}/${REF}/bin"
SKILL_URL="https://raw.githubusercontent.com/${REPO}/${REF}/skills/ai-compare-search/SKILL.md"
INSTALL_DIR="${AICOMPARE_BRIDGE_HOME:-$HOME/.aicompare-webbridge}"
BIN_DIR="$INSTALL_DIR/bin"
LINK_DIR="${AICOMPARE_BIN_DIR:-$HOME/.local/bin}"
SKILL_NAME="ai-compare-search"

case "${1:-}" in
  --no-skill)
    INSTALL_SKILL=0
    INSTALL_DAEMON=1
    ;;
  --skill-only)
    INSTALL_SKILL=1
    INSTALL_DAEMON=0
    ;;
  "")
    INSTALL_SKILL=1
    INSTALL_DAEMON=1
    ;;
  *)
    echo "Usage: install.sh [--no-skill|--skill-only]" >&2
    exit 2
    ;;
esac

install_skill() {
  local tmp skill_dir
  tmp="$(mktemp "${TMPDIR:-/tmp}/aicompare-skill.XXXXXX")"
  trap 'rm -f "$tmp"' RETURN
  curl -fsSL --retry 3 "$SKILL_URL" -o "$tmp"

  # Codex is the primary global skill target. Other runtimes are updated only
  # when their user-level skill directory already exists, avoiding creation of
  # runtime-specific directories that the user does not use.
  local targets=("${AICOMPARE_SKILL_DIR:-${CODEX_HOME:-$HOME/.codex}/skills}")
  for skill_dir in "$HOME/.agents/skills" "$HOME/.claude/skills" "$HOME/.openclaw/skills" "$HOME/.hermes/skills"; do
    if [ -d "$skill_dir" ] && [[ ! " ${targets[*]} " =~ " ${skill_dir} " ]]; then
      targets+=("$skill_dir")
    fi
  done

  for skill_dir in "${targets[@]}"; do
    mkdir -p "$skill_dir/$SKILL_NAME"
    install -m 644 "$tmp" "$skill_dir/$SKILL_NAME/SKILL.md"
    echo "Global Skill installed: $skill_dir/$SKILL_NAME/SKILL.md"
  done
}

if [ "$INSTALL_DAEMON" -eq 1 ] && [ -x "$BIN_DIR/webbridge.js" ] && command -v node >/dev/null 2>&1; then
  node "$BIN_DIR/webbridge.js" stop >/dev/null 2>&1 || true
fi

mkdir -p "$BIN_DIR"
if [ "$INSTALL_DAEMON" -eq 1 ]; then
  tmp="$BIN_DIR/.webbridge.$$.tmp"
  curl -fsSL --retry 3 "${BASE}/webbridge.js" -o "$tmp"
  mv "$tmp" "$BIN_DIR/webbridge.js"
  curl -fsSL --retry 3 "${BASE}/runner.js" -o "$BIN_DIR/runner.js"
  chmod 700 "$BIN_DIR/runner.js"
  chmod 700 "$BIN_DIR/webbridge.js"
  ln -sfn "$BIN_DIR/webbridge.js" "$BIN_DIR/aicompare-webbridge"
fi
if [ "$INSTALL_DAEMON" -eq 1 ]; then
  mkdir -p "$LINK_DIR"
  ln -sfn "$BIN_DIR/webbridge.js" "$LINK_DIR/aicompare-webbridge"
fi

if [ "$INSTALL_SKILL" -eq 1 ]; then
  install_skill
fi

if [ "$INSTALL_DAEMON" -eq 1 ] && command -v node >/dev/null 2>&1; then
  node "$BIN_DIR/webbridge.js" start >/dev/null 2>&1 || true
elif [ "$INSTALL_DAEMON" -eq 1 ]; then
  echo "Node.js 20 or newer is required. Install it and rerun this command." >&2
  exit 1
fi
echo "AICompare WebBridge installed. Check: $LINK_DIR/aicompare-webbridge status"
if [[ ":$PATH:" != *":$LINK_DIR:"* ]]; then
  echo "Add this directory to PATH if the command is not found: $LINK_DIR"
fi
