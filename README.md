# AICompare Bridge

AICompare Bridge is the local daemon that lets WorkBuddy, Codex, OpenClaw, Hermes, and other Agent runtimes drive the AI Compare Chrome extension.

## User installation

First install AI Compare in Chrome and sign in to the AI sites you want to use. Then run:

```bash
curl -fsSL https://raw.githubusercontent.com/taoAIGC/AICompare_Bridge/main/install.sh | bash
```

The installer downloads the bridge files from this repository, installs them under `~/.aicompare-webbridge/`, starts a daemon listening only on `127.0.0.1:10087`, and installs the `ai-compare-search` Skill into the current user's global Codex/Agent Skill directories (`~/.codex/skills/ai-compare-search/` and, when present, `~/.agents/skills/ai-compare-search/`). If Claude, OpenClaw, or Hermes user-level Skill directories already exist, the same Skill is installed there too.

The Skill frontmatter declares `scope: global`, so it is available to all projects for that OS user. This is user-global, not system-wide for every account on the computer.

The installer also isolates the bridge from an inherited `NODE_OPTIONS` value. This prevents an obsolete Node preload or broker shim from breaking the daemon before a search starts.

To install only the Skill, use `--skill-only`. To skip Skill installation, use `--no-skill`. Set `AICOMPARE_SKILL_DIR` to use a custom global Skill directory.

Check the daemon:

```bash
aicompare-webbridge status
```

Run a browser comparison directly:

```bash
aicompare-webbridge search --query "你好世界" --sites "ChatGPT,Gemini"
```

WorkBuddy Connector metadata and Skill are included in `connector-meta.json`, `cli.json`, and `skills/ai-compare-search/SKILL.md`.

## Development

```bash
npm run check
node bin/webbridge.js start --foreground
```

The daemon uses the existing AI Compare browser runner and callback protocol, so the existing OpenClaw/Hermes adapters in this repository remain compatible.
