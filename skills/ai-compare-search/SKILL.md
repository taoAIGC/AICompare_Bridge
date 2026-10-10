---
name: ai-compare-search
description: Search selected AI websites through the local AI Compare Chrome extension and return per-site raw results.
scope: global
install_scope: global
---

# AI Compare Browser Search

Use this connector when the user asks to search, research, look up, or compare answers across AI websites. It opens the AI Compare extension in the user's regular Chrome profile, so the user must already be signed into the chosen AI sites.

Run:

```bash
aicompare-webbridge search --query "<user query>" --sites "ChatGPT,Claude,Gemini"
```

- `--query` is required and must contain the user's actual request.
- `--sites` is optional. Omit it unless the user explicitly named sites; the extension will use its configured defaults.
- Use `--wait-results-ms 190000` for queries expected to take longer than the default wait.
- The command writes JSON to stdout. Return each site's result and status faithfully. Only synthesize an answer when the user asks for one after the raw results are available.

The WebBridge daemon should be installed and running first. Check it with `aicompare-webbridge status`; if it is not running, run `aicompare-webbridge start` and retry.

If the command reports that the extension is missing, ask the user to install or reload AI Compare in the same Chrome profile. If a site is `login_required`, `rate_limited`, `blocked`, or `timeout`, report that site-level status instead of treating the entire search as a successful answer.
