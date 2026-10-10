# AICompare Bridge

AICompare Bridge is the local daemon that lets WorkBuddy, Codex, OpenClaw, Hermes, and other Agent runtimes drive the AI Compare Chrome extension.

## User installation

First install AI Compare in Chrome and sign in to the AI sites you want to use. Then run:

```bash
curl -fsSL https://raw.githubusercontent.com/taoAIGC/AICompare_Bridge/main/install.sh | bash
```

The installer downloads the bridge files from this repository, installs them under `~/.aicompare-webbridge/`, and starts a daemon listening only on `127.0.0.1:10087`. It deliberately does not write into any Agent-specific Skill directory. Install `skills/ai-compare-search/SKILL.md` through the Skill manager of the Agent you use; that manager chooses the correct global or project scope.

The installer also isolates the bridge from an inherited `NODE_OPTIONS` value. This prevents an obsolete Node preload or broker shim from breaking the daemon before a search starts.

The Skill itself checks for the Bridge and runs this same public installer on first use when needed:

```bash
curl -fsSL https://raw.githubusercontent.com/taoAIGC/AICompare_Bridge/main/install.sh | bash
```

The installer accepts the legacy `--no-skill` flag as a compatibility no-op. Skill installation is intentionally delegated to the Agent's own Skill system.

Important: most Agent runtimes do not execute arbitrary shell commands merely because a Skill file was installed. The Skill can request the Bridge installation on first use, but the Agent may ask the user for shell approval. Users can always run the CURL command directly.

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
