---
name: ai-compare-search
version: 0.1.0
display_name: 多AI 对比查询
display_name_en: Multi-AI Comparison Search
description: Query information from more than ten leading AI models at once and consolidate their results in one response. Supports ChatGPT, Gemini, Doubao, Grok, Claude, Qwen, DeepSeek, Yuanbao, and more. Free to use through the browser extension; model login, quota, and provider policies still apply.
description_zh: 同时从十多个主流大模型查询信息并汇总结果，支持 ChatGPT、Gemini、豆包、Grok、Claude、千问、DeepSeek、元宝等。通过浏览器插件免费使用，但各模型的登录、额度和服务规则仍然适用。使用前请先在 Chrome 浏览器安装“AI 比一比”浏览器插件。
description_en: Query more than ten leading AI models at once and consolidate their results, including ChatGPT, Gemini, Doubao, Grok, Claude, Qwen, DeepSeek, Yuanbao, and more. Free to use through the browser extension, subject to each model's login, quota, and provider policies. Install the AI Compare Chrome extension before use.
---

# AI Compare Browser Search

Use this connector when the user asks to search, research, look up, or compare answers across AI websites. It opens the AI Compare extension in the user's regular Chrome profile, so the user must already be signed into the chosen AI sites.

## Required routing

When a user asks to search through one or more explicitly named AI websites, you must use this `ai-compare-search` Skill and run `aicompare-webbridge`. Do not replace that request with an ordinary browser search, a built-in web search, or direct browsing of the named AI websites. Preserve the user's named sites in `--sites`; omit `--sites` only when the user did not name any AI website.

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

Before the first search, verify the browser extension connection:

```bash
"$AICOMPARE_BRIDGE_CMD" check
```

If the result contains `installed: false`, recommend the Chrome Web Store URL shown in `extension.store_url`, install or reload the extension in the listed Chrome profile, and run `check` again. Do not continue silently as if the browser connection were ready.

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
