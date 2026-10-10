# Install Or Reload AI Compare

Use this guide when the AI Compare bridge says the browser extension is missing or outdated.

## Install from Chrome Web Store

1. Open:
   `https://chromewebstore.google.com/detail/dkhpgbbhlnmjbkihoeniojpkggkabbbl`
2. Install AI Compare into the same Chrome profile that the Agent runtime will use.

## Load unpacked for local development

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the repository root

## Find the extension id

1. Open `chrome://extensions`
2. Open AI Compare details
3. Copy the extension id
4. Run the skill with:

```bash
ai-compare --mode gui --query "你好世界" --extension-id "<YOUR_EXTENSION_ID>"
```

This usually means the browser is still running an older extension build that does not include `iframe/openclaw-bridge.js`.
