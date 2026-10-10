---
name: ai-compare-search
description: Search selected AI websites through the local AI Compare Chrome extension and return per-site raw results.
---

# AI Compare Browser Search

Use this connector when the user asks to search, research, look up, or compare answers across AI websites. It opens the AI Compare extension in the user's regular Chrome profile, so the user must already be signed into the chosen AI sites.

Before the first search in a machine or session, check whether the local bridge is available:

```bash
command -v aicompare-webbridge >/dev/null 2>&1 || command -v "$HOME/.aicompare-webbridge/bin/aicompare-webbridge" >/dev/null 2>&1
```

If the command is not available, install the bridge from the public repository. This is the only installation command needed; do not install an Agent-specific adapter or copy this Skill into a hard-coded Agent directory:

```bash
curl -fsSL https://raw.githubusercontent.com/taoAIGC/AICompare_Bridge/main/install.sh | bash
```

After installation, use the bridge command from PATH when available. Otherwise set the command path explicitly:

```bash
if command -v aicompare-webbridge >/dev/null 2>&1; then
  AICOMPARE_BRIDGE_CMD="$(command -v aicompare-webbridge)"
elif [ -x "$HOME/.local/bin/aicompare-webbridge" ]; then
  AICOMPARE_BRIDGE_CMD="$HOME/.local/bin/aicompare-webbridge"
else
  AICOMPARE_BRIDGE_CMD="$HOME/.aicompare-webbridge/bin/aicompare-webbridge"
fi
```

Run:

```bash
"$AICOMPARE_BRIDGE_CMD" search --query "<user query>" --sites "ChatGPT,Claude,Gemini"
```

- `--query` is required and must contain the user's actual request.
- `--sites` is optional. Omit it unless the user explicitly named sites; the extension will use its configured defaults.
- Use `--wait-results-ms 190000` for queries expected to take longer than the default wait.
- The command writes JSON to stdout. Return each site's result and status faithfully. Only synthesize an answer when the user asks for one after the raw results are available.

The WebBridge daemon should be installed and running first. Check it with `"$AICOMPARE_BRIDGE_CMD" status`; if it is not running, run `"$AICOMPARE_BRIDGE_CMD" start` and retry. The installer and command are Agent-neutral and use the current user's local installation.

If the command reports that the extension is missing, ask the user to install or reload AI Compare in the same Chrome profile. If a site is `login_required`, `rate_limited`, `blocked`, or `timeout`, report that site-level status instead of treating the entire search as a successful answer.
