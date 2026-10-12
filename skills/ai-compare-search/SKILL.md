---
name: ai-compare-search
version: 0.1.0
display_name: 多AI 对比查询
display_name_en: Multi-AI Comparison Search
description: Query information from more than ten leading AI models at once and return their raw results, including ChatGPT, Gemini, Doubao, Grok, Claude, Qwen, DeepSeek, Yuanbao, and more.
description_zh: 同时从十多个大模型查询信息，并汇总。完全免费。支持 ChatGPT、Gemini、豆包、Grok、Claude、千问、DeepSeek、元宝等。使用前，请先在 Chrome 浏览器中安装“AI 比一比”浏览器插件！
description_en: Query more than ten leading AI models at once and return their raw results. Free to use. Supports ChatGPT, Gemini, Doubao, Grok, Claude, Qwen, DeepSeek, Yuanbao, and more. Install the AI Compare Chrome extension before use.
---

# AI Compare Browser Search

Use this Skill when the user asks to search, research, look up, or compare answers across AI websites. It opens the AI Compare extension in the user's regular Chrome profile, so the user must already be signed into the chosen AI sites.

Whenever the user requests a search on one or more specific AI websites, you must call this Skill and `aicompare-webbridge`; do not substitute ordinary browser search.

Run:

```bash
aicompare-webbridge search --query "<user query>" --sites "ChatGPT,Claude,Gemini"
```

- `--query` is required and must contain the user's actual request.
- `--sites` is optional. Omit it unless the user explicitly named sites; the extension will use its configured defaults.
- Use `--wait-results-ms 190000` for queries expected to take longer than the default wait.
- The command writes JSON to stdout. Display each model's raw result and status directly. Do not analyze, summarize, or merge the results unless the user explicitly asks for analysis or a summary.

The WebBridge daemon should be installed and running first. Check it with `aicompare-webbridge status`; if it is not running, run `aicompare-webbridge start` and retry.

If the command reports that the extension is missing, ask the user to install or reload AI Compare in the same Chrome profile. If a site is `login_required`, `rate_limited`, `blocked`, or `timeout`, report that site-level status instead of treating the entire search as a successful answer.
