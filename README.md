# 多AI 对比查询 Skill

Query more than ten leading AI models at once and consolidate their results through the AICompare Chrome extension. Supported services include ChatGPT, Gemini, Doubao, Grok, Claude, Qwen, DeepSeek, Yuanbao, and more.

The Skill is free to use through the browser extension. Individual model login, quota, rate-limit, and provider policies still apply.

The repository is intentionally not tied to WorkBuddy, Codex, OpenClaw, Hermes, Claude, or any other Agent product. Install this Skill with the Skill manager of the Agent you use. That manager chooses the correct global or project Skill directory.

## What it provides

- `SKILL.md`: the portable Skill entry point when installing the whole repository
- `skills/ai-compare-search/SKILL.md`: the same Skill for managers that require a nested Skill directory
- `install.sh`: installs or updates the local Bridge for the current OS user
- `bin/webbridge.js`: localhost daemon on `127.0.0.1:10087`
- `bin/runner.js`: opens the AICompare extension and receives structured results
- `bin/ai-compare.js`: direct CLI wrapper around the runner

The Bridge uses the browser extension already installed in the user's Chrome profile. It does not contain or install an Agent-specific plugin.

The callback receiver accepts both the legacy `openclaw_callback` route used by AICompare 4.4.x and the newer `bridge_callback` route. It also finishes when every requested site has a terminal result, even if an older extension reports that payload as progress rather than setting `completed: true`.

## Install the Skill

Use the Agent's normal Skill installation flow and point it at this repository or at:

```text
skills/ai-compare-search/SKILL.md
```

Do not copy the Skill into a hard-coded Agent directory. The Agent should own that decision.

## Install the Bridge

Before using the Skill, install the “AI 比一比” browser extension in Chrome and sign in to the AI websites you want to query. Then install the local Bridge with:

```bash
curl -fsSL https://raw.githubusercontent.com/taoAIGC/AICompare_Bridge/main/install.sh | bash
```

The installer:

1. Downloads the Bridge into `~/.aicompare-webbridge/`.
2. Creates `~/.local/bin/aicompare-webbridge` when possible.
3. Starts a daemon listening only on `127.0.0.1:10087`.
4. Does not write to any Agent-specific Skill directory.

The installer isolates the Bridge from an inherited `NODE_OPTIONS` value, so an obsolete Node preload or broker shim cannot break startup. Use `--no-skill` as a harmless compatibility flag with older documentation; Skill installation is managed by the Agent Skill system.

## Verify and use

```bash
aicompare-webbridge status
aicompare-webbridge check
aicompare-webbridge search --query "你好世界" --sites "ChatGPT,Gemini"
```

`check` verifies the local Bridge and scans the regular Chrome/Chromium profiles for the formal AI Compare extension (`dkhpgbbhlnmjbkihoeniojpkggkabbbl`). If the extension is not found, its JSON output includes the Chrome Web Store URL to install it. Install the extension in the same Chrome profile used for searches, then run `check` again.

If `aicompare-webbridge` is not on `PATH`, use:

```bash
$HOME/.local/bin/aicompare-webbridge status
```

The command returns JSON with per-site status and raw results. The Skill should preserve those site-level statuses, including login, rate-limit, blocked, and timeout states.

By default, the Skill displays each model's returned content and status directly. It does not analyze, summarize, compare, merge, or rewrite results unless the user explicitly requests that.

## Requirements

- macOS, Linux, or Windows with a compatible shell
- Node.js 20 or newer
- `curl`
- AICompare installed in the same Chrome profile used for the search
- The user already signed in to the selected AI websites

## Development checks

```bash
npm run check
bash -n install.sh
```

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
