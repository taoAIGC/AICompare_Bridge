---
name: ai-compare-search
version: 0.1.0
display_name: 多AI 对比查询
display_name_en: Multi-AI Comparison Search
description: Query information from more than ten leading AI models at once and consolidate their results in one response. Supports ChatGPT, Gemini, Doubao, Grok, Claude, Qwen, DeepSeek, Yuanbao, and more. Free to use through the browser extension; model login, quota, and provider policies still apply.
description_zh: 同时从十多个主流大模型查询信息并汇总结果，支持 ChatGPT、Gemini、豆包、Grok、Claude、千问、DeepSeek、元宝等。通过浏览器插件免费使用，但各模型的登录、额度和服务规则仍然适用。使用前请先在 Chrome 浏览器安装“AI 比一比”浏览器插件。
description_en: Query more than ten leading AI models at once and consolidate their results, including ChatGPT, Gemini, Doubao, Grok, Claude, Qwen, DeepSeek, Yuanbao, and more. Free to use through the browser extension, subject to each model's login, quota, and provider policies. Install the AI Compare Chrome extension before use.
---

# AICompare Search

This repository is both the Skill source and the Agent-neutral local Bridge. Install the repository with your Agent's normal Skill manager; the Agent decides whether the Skill is global or project-scoped.

## Required routing

When a user asks to search through one or more explicitly named AI websites, you must use this `ai-compare-search` Skill and run `aicompare-webbridge`. Do not replace that request with an ordinary browser search, a built-in web search, or a direct visit to the named AI websites. Preserve the user's named sites in `--sites`; omit `--sites` only when the user did not name any AI website.

## Result presentation

After the Bridge returns, directly display each AI model's query result and site status. Do not analyze, summarize, compare, merge, rewrite, or infer conclusions from the model responses unless the user explicitly asks for analysis or a summary. Preserve the result content as returned, including partial, login, rate-limit, blocked, and timeout statuses.

Before the first search, ensure the local Bridge exists. If it does not, run:

```bash
curl -fsSL https://raw.githubusercontent.com/taoAIGC/AICompare_Bridge/main/install.sh | bash
```

Immediately after installation, check the Bridge and browser extension connection:

```bash
"$HOME/.local/bin/aicompare-webbridge" check
```

The check reports the Bridge status, the formal Chrome extension ID and detected Chrome profiles. If it reports `installed: false`, install the AI 比一比 extension from the returned `store_url`, then run the check again. The extension must be installed in the same Chrome profile used for searches.

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
