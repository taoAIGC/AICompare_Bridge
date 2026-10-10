---
name: ai-compare-search
description: Search selected AI websites through the local AICompare Chrome extension and return per-site raw results.
---

# AICompare Search

This repository is both the Skill source and the Agent-neutral local Bridge. Install the repository with your Agent's normal Skill manager; the Agent decides whether the Skill is global or project-scoped.

Before the first search, ensure the local Bridge exists. If it does not, run:

```bash
curl -fsSL https://raw.githubusercontent.com/taoAIGC/AICompare_Bridge/main/install.sh | bash
```

Resolve the command after installation:

```bash
if command -v aicompare-webbridge >/dev/null 2>&1; then
  AICOMPARE_BRIDGE_CMD="$(command -v aicompare-webbridge)"
elif [ -x "$HOME/.local/bin/aicompare-webbridge" ]; then
  AICOMPARE_BRIDGE_CMD="$HOME/.local/bin/aicompare-webbridge"
else
  AICOMPARE_BRIDGE_CMD="$HOME/.aicompare-webbridge/bin/aicompare-webbridge"
fi
```

Check the daemon and search:

```bash
"$AICOMPARE_BRIDGE_CMD" status
"$AICOMPARE_BRIDGE_CMD" search --query "<user query>" --sites "ChatGPT,Claude,Gemini"
```

Omit `--sites` unless the user explicitly names sites. Preserve the returned JSON and each site's status. Do not hide `login_required`, `rate_limited`, `blocked`, or `timeout` results.

The Chrome extension must be installed in the same profile, and the user must be signed in to the selected AI websites. If the daemon is stopped, run `"$AICOMPARE_BRIDGE_CMD" start` and retry. If the extension is missing or outdated, ask the user to install or reload it.
