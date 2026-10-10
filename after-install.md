# AI Compare Hermes Plugin

This repository now installs as a local AICompare Bridge daemon and continues to provide the Hermes plugin named `ai-compare-hard-router`.

## What you get

- Tool: `ai_compare_search`
- Toolset: `plugin_ai_compare_hard_router`
- Hook: `pre_llm_call` hint for search-style prompts

## Before first use

1. Install the AI Compare Chrome extension into the same Chrome profile Hermes will open:
   `https://chromewebstore.google.com/detail/dkhpgbbhlnmjbkihoeniojpkggkabbbl`
2. If you want Hermes-specific overrides, edit:
   `~/.hermes/plugins/ai-compare-hard-router/config.yaml`
3. Start a new Hermes session, or restart the gateway if you use one:
   `hermes gateway restart`

## Quick verify

```bash
hermes chat -q '搜索一下本地论，不要做总结，不要做摘要'
hermes chat -q 'search for OpenAI, do not summarize, do not make an abstract'
```

## Development extension

Set `environment: development` in the plugin `config.yaml` when you want Hermes to target the unpacked local extension id `hhkhgpadepocnmjfpohcmjdcgkmfnadi`.
