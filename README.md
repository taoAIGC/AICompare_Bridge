# AICompare Cli

AICompare Cli is the single shared browser bridge for WorkBuddy, OpenClaw, Hermes, and other local Agent runtimes. It opens AI Compare in the user's existing Chrome profile and waits for structured per-site results on a localhost callback.

The package is intentionally agent-neutral. Agent adapters select their caller identity with `--source`; users do not need separate folders for each Agent.

## Install

```bash
npm install -g ai-compare-cli
```

Install AI Compare in the same Chrome profile and sign in to the AI sites you plan to use. The Chrome Web Store extension id is `dkhpgbbhlnmjbkihoeniojpkggkabbbl`.

Install the local WebBridge daemon from GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/taoAIGC/AICompare_Bridge/main/install.sh | bash
```

The daemon listens only on `127.0.0.1:10087` and does not require an external domain.

The GitHub URL is intentionally pinned to the bridge repository's `main` branch. For production, publish a GitHub Release and change `AICOMPARE_GITHUB_REF` to a release tag so installation is not affected by future source changes.

## Development verification

Load this repository as an unpacked Chrome extension, then run:

```bash
ai-compare --mode gui --source workbuddy --query "你好世界" --sites "ChatGPT,Gemini"
```

For OpenClaw or Hermes compatibility, use the same command with `--source openclaw`. The opened extension URL uses `source=<caller>` and `bridge_callback`; legacy OpenClaw parameters remain supported.

For WorkBuddy/Codex, use the daemon command:

```bash
aicompare-webbridge search --query "你好世界" --sites "ChatGPT,Gemini"
```

## Packaging note

The WorkBuddy Connector assets are `connector-meta.json`, `cli.json`, `skills/`, and `icon.png`. They are packaged with the npm CLI. Before submitting to the WorkBuddy Connector market, publish the npm package and then upload this directory as the Connector asset bundle.

## Publish

```bash
cd "AICompare Cli"
npm login
npm publish --access public
```

The package name is `ai-compare-cli`. It was available on npm during packaging; publish promptly because an availability check does not reserve the name.
