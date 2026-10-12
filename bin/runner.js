#!/usr/bin/env node

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

let chromiumInstance = null;

const DEFAULT_GUI_WAIT_RESULTS_MS = 90000;
const DEFAULT_COMPARISON_TIMEOUT_MS = 60000;
const DEFAULT_SITE_TIMEOUT_MS = 60000;
const DEFAULT_EXTENSION_ID = 'dkhpgbbhlnmjbkihoeniojpkggkabbbl';
const DEFAULT_INSTALL_URL = 'https://chromewebstore.google.com/detail/dkhpgbbhlnmjbkihoeniojpkggkabbbl';

function getChromium() {
  if (!chromiumInstance) {
    ({ chromium: chromiumInstance } = require('playwright'));
  }
  return chromiumInstance;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }
  return args;
}

function asNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseSites(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return Array.from(new Set(
    values
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)
  ));
}

function getChromeProfileRoots() {
  const roots = [];
  const home = os.homedir();

  if (process.platform === 'darwin') {
    roots.push(path.join(home, 'Library/Application Support/Google/Chrome'));
    roots.push(path.join(home, 'Library/Application Support/Chromium'));
    roots.push(path.join(home, 'Library/Application Support/Microsoft Edge'));
  } else if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    roots.push(path.join(localAppData, 'Google/Chrome/User Data'));
    roots.push(path.join(localAppData, 'Chromium/User Data'));
    roots.push(path.join(localAppData, 'Microsoft/Edge/User Data'));
  } else {
    roots.push(path.join(home, '.config/google-chrome'));
    roots.push(path.join(home, '.config/chromium'));
    roots.push(path.join(home, '.config/microsoft-edge'));
  }

  return roots.filter((root) => {
    try {
      return !!root && fs.existsSync(root) && fs.statSync(root).isDirectory();
    } catch (_) {
      return false;
    }
  });
}

function getChromeProfileDirs(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => (
        name === 'Default'
        || /^Profile \d+$/i.test(name)
        || name === 'Guest Profile'
        || name === 'System Profile'
      ));
  } catch (_) {
    return [];
  }
}

function getInstalledExtensionCandidates(extensionIds) {
  const candidates = uniqueStrings(extensionIds);
  if (candidates.length === 0) return [];

  const installed = [];
  const profileRoots = getChromeProfileRoots();

  for (const extensionId of candidates) {
    let found = false;
    for (const root of profileRoots) {
      const profileDirs = getChromeProfileDirs(root);
      for (const profile of profileDirs) {
        const extensionRoot = path.join(root, profile, 'Extensions', extensionId);
        try {
          if (!fs.existsSync(extensionRoot) || !fs.statSync(extensionRoot).isDirectory()) {
            continue;
          }

          const versions = fs.readdirSync(extensionRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);

          if (versions.length > 0) {
            installed.push(extensionId);
            found = true;
            break;
          }
        } catch (_) {
          // Ignore unreadable profile paths and keep scanning.
        }
      }
      if (found) break;
    }
  }

  return uniqueStrings(installed);
}

function buildExtensionUrl(extensionId, query, sites, extraParams = {}) {
  const params = new URLSearchParams();
  const source = typeof extraParams.source === 'string' && extraParams.source.trim()
    ? extraParams.source.trim()
    : 'openclaw';
  params.set('source', source);
  // Keep this legacy flag for existing OpenClaw integrations.
  if (source === 'openclaw') params.set('openclaw', '1');
  if (query) params.set('query', query);
  if (sites.length > 0) params.set('sites', sites.join(','));
  Object.entries(extraParams || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    params.set(key, String(value));
  });
  return `chrome-extension://${extensionId}/iframe/iframe.html?${params.toString()}`;
}

function getPrimaryExtensionId(explicitExtensionId) {
  const [primary] = getExtensionCandidates(explicitExtensionId);
  return primary || '';
}

function getExtensionCandidates(explicitExtensionId) {
  if (explicitExtensionId && String(explicitExtensionId).trim()) {
    return uniqueStrings([String(explicitExtensionId).trim()]);
  }

  return uniqueStrings([
    DEFAULT_EXTENSION_ID,
    process.env.AI_COMPARE_EXTENSION_ID,
    process.env.EXTENSION_ID,
    ...parseSites(process.env.AI_COMPARE_EXTENSION_IDS || '')
  ]);
}

function parseRemoteDebuggingPort(cdpEndpoint) {
  try {
    const parsed = new URL(cdpEndpoint);
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'));
    return Number.isFinite(port) && port > 0 ? port : 9222;
  } catch (_) {
    return 9222;
  }
}

async function connectToBrowser(cdpEndpoint, connectOverCDP = (endpoint) => getChromium().connectOverCDP(endpoint)) {
  try {
    return await connectOverCDP(cdpEndpoint);
  } catch (error) {
    const details = error && error.message ? error.message : String(error);
    const port = parseRemoteDebuggingPort(cdpEndpoint);
    throw new Error(
      `Unable to connect to Chrome DevTools at ${cdpEndpoint}. ` +
      `This runner only supports your existing Chrome profile and will not launch a separate profile. ` +
      `Start Chrome with your normal profile and remote debugging enabled, for example on macOS: ` +
      `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=${port}". ` +
      `Last error: ${details}`
    );
  }
}

async function getPersistentContext(browser, waitMs = 5000, pollMs = 100) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < waitMs) {
    const [context] = browser.contexts();
    if (context) {
      return context;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error('No persistent Chrome context became available after connecting over CDP');
}

function getInstallInstructions(attemptedIds, explicitExtensionId) {
  const repoRoot = path.resolve(__dirname, '..');
  const installLines = [
    'AI Compare browser extension is not available in the connected Chrome profile.',
    '',
    'How to fix:',
    '1. Install AI Compare in that same Chrome profile.',
    `   Chrome Web Store: ${DEFAULT_INSTALL_URL}`,
    '2. Or load this repository as an unpacked extension:',
    '   - Open chrome://extensions',
    '   - Enable Developer mode',
    '   - Click "Load unpacked"',
    `   - Select this folder: ${repoRoot}`,
    '3. Open the generated chrome-extension://... link in that same browser profile.',
    '4. If you installed an unpacked build or a different extension id, pass --extension-id <your-id> or set AI_COMPARE_EXTENSION_ID=<your-id>.'
  ];

  if (attemptedIds.length > 0) {
    installLines.push(`Tried extension id(s): ${attemptedIds.join(', ')}`);
  }

  if (explicitExtensionId) {
    installLines.push('The requested --extension-id did not expose the AI Compare automation bridge in this Chrome profile.');
  }

  return installLines.join('\n');
}

function buildOldVersionInstructions(extensionId) {
  return [
    `AI Compare extension "${extensionId}" is installed, but the automation bridge is missing from iframe/iframe.html.`,
    'Update or reload the extension so it includes iframe/openclaw-bridge.js and the latest OpenClaw integration files.',
    'If you are using an unpacked build, re-open chrome://extensions and click Reload on AI Compare.'
  ].join('\n');
}

function buildGuiCallbackTimeoutInstructions(timeoutMs) {
  const seconds = Math.round(timeoutMs / 1000);
  return [
    `Timed out waiting for GUI callback after about ${seconds} seconds.`,
    'The browser link was opened, but the extension page did not post structured results back to the local runner in time.',
    '',
    'What to check next:',
    '1. Confirm the AI Compare tab really opened and stayed on the chrome-extension://... page.',
    '2. Confirm the target AI sites are logged in and able to answer normally inside the extension page.',
    '3. Confirm no browser or extension prompt blocked the page before results were returned.',
    '4. Retry with a smaller site set, for example --sites "ChatGPT,Gemini".',
    '5. If you only want to trigger the browser search and do not need to wait for results, use --open-only.'
  ].join('\n');
}

function summarizeProgressPayload(payload) {
  const result = payload && typeof payload === 'object' ? payload.result : null;
  const results = Array.isArray(result && result.results) ? result.results : [];
  if (results.length === 0) {
    return '';
  }

  const resolvedCount = results.filter((item) => item && (item.status === 'ok' || item.status === 'error' || item.status === 'timeout' || item.status === 'rate_limited' || item.status === 'blocked' || item.status === 'login_required' || item.status === 'landing_page' || item.status === 'not_submitted')).length;
  const lines = [
    '',
    'Last callback progress:',
    `- Phase: ${result && result.phase ? result.phase : (payload && payload.completed ? 'completed' : 'running')}`,
    `- Resolved sites: ${resolvedCount}/${results.length}`
  ];

  results.forEach((item) => {
    const status = item && item.status ? item.status : 'unknown';
    const suffix = item && item.error ? ` (${item.error})` : '';
    lines.push(`- ${item.siteName || 'Unknown'}: ${status}${suffix}`);
  });

  return lines.join('\n');
}

function buildGuiCallbackTimeoutError(timeoutMs, lastPayload) {
  const base = buildGuiCallbackTimeoutInstructions(timeoutMs);
  const progress = summarizeProgressPayload(lastPayload);
  return progress ? `${base}\n${progress}` : base;
}

function looksLikeErrorPage(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome-error://')
    || url.startsWith('edge-error://')
    || url === 'about:blank'
  );
}

function getGuiModeNotes({
  extensionId,
  triggerUrl,
  openAttempted,
  callbackUrl,
  willWaitForResults
}) {
  const lines = [
    'GUI mode builds a direct AI Compare trigger URL and asks your regular browser to open it.',
    `Trigger URL: ${triggerUrl}`,
    '',
    'What happens next:',
    '1. Chrome opens the AI Compare extension page.',
    '2. The extension reads the query from the URL.',
    '3. The page auto-starts multi-site search through the installed extension.'
  ];

  if (willWaitForResults && callbackUrl) {
    lines.push(`4. The extension posts structured results back to the local callback server: ${callbackUrl}`);
  }

  lines.push('', 'Important:');

  if (willWaitForResults) {
    lines.push('- GUI mode will wait for structured per-site results and print them to stdout.');
  } else {
    lines.push('- GUI mode triggers the search in the browser, but does not wait for structured results in this run.');
  }

  lines.push(
    '- If the page fails to open, confirm AI Compare is installed in that browser profile.',
    `- Preferred extension id for this run: ${extensionId || '(missing)'}`,
    '- If your unpacked build uses another id, rerun with --extension-id <your-id>.'
  );

  if (openAttempted) {
    lines.push('- The runner already attempted to open the trigger URL in your browser.');
  }

  return lines.join('\n');
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// A 4.4.x extension can send the complete site set as a progress callback
// without setting payload.completed. Treat that payload as final so the
// bridge does not wait for the extension's own UI timeout.
function hasResolvedAllSites(payload) {
  const result = payload && payload.result;
  if (!result || typeof result !== 'object') return false;
  const totalSites = Number(result.totalSites);
  const resolvedSites = Number(result.resolvedSites);
  if (!Number.isFinite(totalSites) || totalSites <= 0) return false;
  if (!Number.isFinite(resolvedSites) || resolvedSites < totalSites) return false;
  if (!Array.isArray(result.results) || result.results.length < totalSites) return false;

  const terminalStatuses = new Set([
    'ok',
    'error',
    'rate_limited',
    'login_required',
    'blocked',
    'landing_page',
    'not_submitted',
    'timeout'
  ]);
  return result.results.slice(0, totalSites).every((site) => (
    site && terminalStatuses.has(String(site.status || '').toLowerCase())
  ));
}

function hasUsableStableResults(payload) {
  const result = payload && payload.result;
  if (!hasResolvedAllSites(payload)) return false;
  return result.results.slice(0, Number(result.totalSites)).every((site) => {
    const status = String(site.status || '').toLowerCase();
    if (status !== 'ok') return true;
    const content = String(site.content || '').trim();
    if (content.length < 20) return false;
    const phase = String(site.runtimePhase || '').toLowerCase();
    return phase !== 'submitted' && phase !== 'waiting_response';
  });
}

async function createCallbackServer(timeoutMs) {
  const token = crypto.randomBytes(16).toString('hex');
  const deferred = createDeferred();
  let lastPayload = null;
  let callbackCount = 0;
  let lastCallbackStatus = '';
  let stableCandidateTimer = null;
  let stableCandidateKey = '';
  const stableWindowMs = 8000;
  const setCorsHeaders = (req, res) => {
    const origin = typeof req.headers.origin === 'string' && req.headers.origin.trim()
      ? req.headers.origin
      : '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  };
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    const acceptedPaths = new Set([
      `/openclaw-callback/${token}`,
      `/openclaw-callback/${token}/`,
      `/bridge-callback/${token}`,
      `/bridge-callback/${token}/`
    ]);
    if (req.method === 'OPTIONS' && acceptedPaths.has(requestUrl.pathname)) {
      res.statusCode = 204;
      setCorsHeaders(req, res);
      res.setHeader('Access-Control-Max-Age', '600');
      res.end();
      return;
    }
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      setCorsHeaders(req, res);
      res.end();
      return;
    }
    if (req.method !== 'POST' || !acceptedPaths.has(requestUrl.pathname)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end('not found');
      return;
    }

    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        req.destroy(new Error('Callback payload too large'));
      }
    });
    req.on('error', (error) => {
      deferred.reject(error);
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        lastPayload = payload;
        callbackCount += 1;
        lastCallbackStatus = payload && payload.completed === true ? 'final' : 'progress';
        res.statusCode = 200;
        setCorsHeaders(req, res);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
        const isFinal = payload && typeof payload === 'object' && (
          payload.ok === false
          || (payload.result && payload.result.finished === true)
        );
        const allSitesResolved = hasResolvedAllSites(payload);
        const immediateFailure = allSitesResolved && payload.result.results.every((site) => site && String(site.status || '').toLowerCase() !== 'ok');
        const stableResults = hasUsableStableResults(payload);
        if (isFinal || immediateFailure) {
          if (stableCandidateTimer) clearTimeout(stableCandidateTimer);
          stableCandidateTimer = null;
          deferred.resolve(payload);
        } else if (stableResults) {
          const key = JSON.stringify(payload.result.results.map((site) => ({
            siteName: site.siteName,
            status: site.status,
            content: site.content,
            url: site.url
          })));
          if (key !== stableCandidateKey) {
            stableCandidateKey = key;
            if (stableCandidateTimer) clearTimeout(stableCandidateTimer);
            stableCandidateTimer = setTimeout(() => {
              stableCandidateTimer = null;
              deferred.resolve(lastPayload);
            }, stableWindowMs);
          }
        }
      } catch (error) {
        res.statusCode = 400;
        res.end('invalid json');
        deferred.reject(error);
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;
  const callbackUrl = `http://127.0.0.1:${port}/openclaw-callback/${token}`;
  const bridgeCallbackUrl = `http://127.0.0.1:${port}/bridge-callback/${token}`;
  const timer = setTimeout(() => {
    const details = callbackCount > 0
      ? ` Received ${callbackCount} callback(s); last callback was ${lastCallbackStatus || 'unknown'} rather than final.`
      : ' No callback reached the local Bridge callback server.';
    deferred.reject(new Error(`${buildGuiCallbackTimeoutError(timeoutMs, lastPayload)}${details}`));
  }, timeoutMs + 10000);

  let closed = false;
  return {
    callbackUrl,
    bridgeCallbackUrl,
    async waitForPayload() {
      try {
        return await deferred.promise;
      } finally {
        clearTimeout(timer);
        if (stableCandidateTimer) clearTimeout(stableCandidateTimer);
        if (!closed) {
          closed = true;
          await new Promise((resolve) => server.close(() => resolve()));
        }
      }
    },
    async close() {
      clearTimeout(timer);
      if (!closed) {
        closed = true;
        await new Promise((resolve) => server.close(() => resolve()));
      }
    }
  };
}

function openUrlInBrowser(url, browserApp) {
  const platform = process.platform;

  if (platform === 'darwin') {
    const appName = browserApp || 'Google Chrome';
    // LaunchServices can reject chrome-extension:// URLs with -10820. Starting
    // Chrome's executable directly lets the already-running browser process
    // receive and route the URL instead.
    if (url.startsWith('chrome-extension://')) {
      const appCandidates = [
        browserApp && browserApp.includes('/') ? browserApp : '',
        `/Applications/${appName}.app/Contents/MacOS/${appName}`,
        `${os.homedir()}/Applications/${appName}.app/Contents/MacOS/${appName}`,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        `${os.homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
      ].filter(Boolean);
      const executable = appCandidates.find((candidate) => fs.existsSync(candidate));
      if (executable) {
        const child = spawn(executable, [url], { detached: true, stdio: 'ignore' });
        child.unref();
        return;
      }
    }
    const args = ['-a', appName, url];
    const result = spawnSync('open', args, { stdio: 'ignore' });
    if (result.status !== 0) {
      throw new Error(
        `Failed to open browser via macOS open command (exit ${result.status || 'unknown'}). ` +
        `Tried browser app: ${appName}. ` +
        `Pass --browser-app "Google Chrome" or another installed browser app name if needed.`
      );
    }
    return;
  }

  if (platform === 'win32') {
    const result = spawnSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' });
    if (result.status !== 0) {
      throw new Error(`Failed to open browser via Windows start command (exit ${result.status || 'unknown'})`);
    }
    return;
  }

  const command = browserApp || 'xdg-open';
  const result = spawnSync(command, [url], { stdio: 'ignore' });
  if (result.status !== 0) {
    throw new Error(`Failed to open browser via ${command} (exit ${result.status || 'unknown'})`);
  }
}

function parseRunnerPayload(stdout) {
  const text = String(stdout || '').trim();
  if (!text) throw new Error('Runner returned empty output');
  try {
    return JSON.parse(text);
  } catch (_) {
    const firstObject = text.indexOf('{');
    if (firstObject >= 0) {
      return JSON.parse(text.slice(firstObject));
    }
    throw new Error('Runner output was not valid JSON');
  }
}

async function runGuiMode(args, query, sites) {
  const explicitExtensionId = typeof args['extension-id'] === 'string' ? args['extension-id'].trim() : '';
  const extensionCandidates = getExtensionCandidates(explicitExtensionId);
  const installedExtensionIds = getInstalledExtensionCandidates(extensionCandidates);
  const extensionId = extensionCandidates[0] || installedExtensionIds[0] || '';

  if (extensionCandidates.length === 0) {
    throw new Error('No extension id candidates available for GUI mode. Pass --extension-id or set AI_COMPARE_EXTENSION_ID.');
  }

  const browserApp = typeof args['browser-app'] === 'string' ? args['browser-app'].trim() : '';
  const source = typeof args.source === 'string' && args.source.trim() ? args.source.trim() : 'openclaw';
  const openBrowser = !args['print-only'];
  const openOnly = Boolean(args['open-only']);
  const waitResultsMs = Math.max(1000, asNumber(args['wait-results-ms'], DEFAULT_GUI_WAIT_RESULTS_MS));
  const timeoutMs = Math.max(1000, asNumber(args['timeout-ms'], Math.min(waitResultsMs, DEFAULT_COMPARISON_TIMEOUT_MS)));
  const siteTimeoutMs = Math.max(1000, asNumber(args['site-timeout-ms'], Math.min(timeoutMs, DEFAULT_SITE_TIMEOUT_MS)));
  const pollMs = Math.max(500, asNumber(args['poll-ms'], 5000));
  const minChars = Math.max(1, asNumber(args['min-chars'], 20));
  const stableRounds = Math.max(0, asNumber(args['stable-rounds'], 2));
  const waitIframesMs = Math.max(0, asNumber(args['wait-iframes-ms'], 20000));
  const shouldReadBack = openBrowser && !openOnly;
  const callbackServer = shouldReadBack ? await createCallbackServer(waitResultsMs) : null;
  const callbackParams = callbackServer
    ? {
      // v4.4.18 uses openclaw_callback; newer builds also accept
      // bridge_callback. Both names must reach this local callback server.
      openclaw_callback: callbackServer.callbackUrl,
      bridge_callback: callbackServer.bridgeCallbackUrl
    }
    : {};
  const triggerUrl = buildExtensionUrl(
    extensionId,
    query,
    sites,
    {
      ...callbackParams,
      source,
      openclaw_timeout_ms: timeoutMs,
      openclaw_site_timeout_ms: siteTimeoutMs,
      openclaw_poll_ms: pollMs,
      openclaw_min_chars: minChars,
      openclaw_stable_rounds: stableRounds,
      openclaw_wait_iframes_ms: waitIframesMs
    }
  );
  let openedBrowser = false;

  try {
    if (openBrowser) {
      openUrlInBrowser(triggerUrl, browserApp);
      openedBrowser = true;
    }

    const note = getGuiModeNotes({
      extensionId,
      triggerUrl,
      openAttempted: openedBrowser,
      callbackUrl: callbackServer ? callbackServer.callbackUrl : '',
      willWaitForResults: shouldReadBack
    });

    if (!shouldReadBack) {
      return {
        ok: true,
        mode: 'gui',
        extensionId,
        triggerUrl,
        openedBrowser,
        browserApp: browserApp || null,
        result: null,
        localInstallProbeMatched: installedExtensionIds.includes(extensionId),
        note
      };
    }

    const callbackPayload = await callbackServer.waitForPayload();
    if (!callbackPayload || callbackPayload.ok !== true || !callbackPayload.result) {
      const callbackError = callbackPayload && callbackPayload.error
        ? callbackPayload.error
        : 'GUI callback returned no result payload';
      throw new Error(callbackError);
    }

    return {
      ok: true,
      mode: 'gui',
      extensionId,
      triggerUrl,
      openedBrowser,
      browserApp: browserApp || null,
      callbackReceived: true,
      localInstallProbeMatched: installedExtensionIds.includes(extensionId),
      result: callbackPayload.result,
      note
    };
  } catch (error) {
    if (callbackServer) {
      await callbackServer.close().catch(() => {});
    }
    throw error;
  }
}

async function tryOpenExtensionPage(page, extensionId, query, sites) {
  const url = buildExtensionUrl(extensionId, query, sites);
  let gotoError = null;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (error) {
    gotoError = error;
  }

  const currentUrl = page.url();
  if (looksLikeErrorPage(currentUrl) || !currentUrl.startsWith(`chrome-extension://${extensionId}/`)) {
    return {
      ok: false,
      extensionId,
      url,
      currentUrl,
      reason: 'missing_extension',
      error: gotoError && gotoError.message ? gotoError.message : ''
    };
  }

  try {
    await page.waitForFunction(
      () => typeof window.aiCompareOpenClaw?.run === 'function',
      { timeout: 10000 }
    );
    return {
      ok: true,
      extensionId,
      url
    };
  } catch (error) {
    return {
      ok: false,
      extensionId,
      url,
      currentUrl,
      reason: 'missing_bridge',
      error: error && error.message ? error.message : String(error)
    };
  }
}

async function resolveExtensionPage(page, extensionIds, query, sites, explicitExtensionId) {
  const failures = [];

  for (const extensionId of extensionIds) {
    const result = await tryOpenExtensionPage(page, extensionId, query, sites);
    if (result.ok) {
      return {
        extensionId,
        url: result.url
      };
    }
    failures.push(result);
  }

  const bridgeFailure = failures.find((item) => item.reason === 'missing_bridge');
  if (bridgeFailure) {
    throw new Error(buildOldVersionInstructions(bridgeFailure.extensionId));
  }

  throw new Error(getInstallInstructions(extensionIds, explicitExtensionId));
}

function printUsage() {
  const usage = [
    'Usage:',
    '  ai-compare --query "hello world" [options]',
    '',
    'Options:',
    '  --query <text>            Required. Query to compare',
    '  --mode <gui|cdp>          Optional. Default gui. gui opens a direct trigger URL and waits for callback results',
    '  --sites <a,b,c>           Optional. Restrict comparison sites by site name',
    '  --extension-id <id>       Optional. Extension id. If omitted, runner tries known local/store ids',
    '  --browser-app <name>      Optional. Browser app name for gui mode, e.g. "Google Chrome"',
    '  --source <name>           Optional. Automation caller label, default openclaw',
    '  --print-only              Optional. In gui mode, print trigger URL without opening browser',
    '  --open-only               Optional. In gui mode, open browser but do not wait for callback results',
    '  --wait-results-ms <num>   Optional. In gui mode, max wait for callback results, default 90000',
    '  --cdp-endpoint <url>      Optional. Chrome CDP endpoint, default http://127.0.0.1:9222',
    '  --timeout-ms <number>     Optional. Max wait time, default 60000',
    '  --site-timeout-ms <num>   Optional. Per-site unresolved timeout, default 60000',
    '  --poll-ms <number>        Optional. Poll interval, default 5000',
    '  --min-chars <number>      Optional. Ready threshold for content length, default 20',
    '  --stable-rounds <number>  Optional. Stable rounds before finish, default 2',
    '  --wait-iframes-ms <num>   Optional. Wait for iframe initialization, default 20000',
    '  --help                    Show this help'
  ].join('\n');

  process.stdout.write(`${usage}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) {
    throw new Error('Missing required --query');
  }

  const mode = typeof args.mode === 'string' ? args.mode.trim().toLowerCase() : 'gui';
  const sites = parseSites(args.sites || '');

  if (mode === 'gui') {
    process.stdout.write(`${JSON.stringify(await runGuiMode(args, query, sites), null, 2)}\n`);
    return;
  }

  if (mode !== 'cdp') {
    throw new Error(`Unsupported --mode "${mode}". Expected "cdp" or "gui".`);
  }

  const explicitExtensionId = typeof args['extension-id'] === 'string' ? args['extension-id'].trim() : '';
  const extensionCandidates = getExtensionCandidates(explicitExtensionId);
  if (extensionCandidates.length === 0) {
    throw new Error('No extension id candidates available. Pass --extension-id or set AI_COMPARE_EXTENSION_ID.');
  }

  const cdpEndpoint = args['cdp-endpoint']
    || process.env.AI_COMPARE_CDP_ENDPOINT
    || process.env.OPENCLAW_CDP_ENDPOINT
    || 'http://127.0.0.1:9222';

  const timeoutMs = Math.max(1000, asNumber(args['timeout-ms'], DEFAULT_COMPARISON_TIMEOUT_MS));
  const siteTimeoutMs = Math.max(1000, asNumber(args['site-timeout-ms'], Math.min(timeoutMs, DEFAULT_SITE_TIMEOUT_MS)));
  const pollMs = Math.max(500, asNumber(args['poll-ms'], 5000));
  const minChars = Math.max(1, asNumber(args['min-chars'], 20));
  const stableRounds = Math.max(0, asNumber(args['stable-rounds'], 2));
  const waitIframesMs = Math.max(0, asNumber(args['wait-iframes-ms'], 20000));
  const browser = await connectToBrowser(cdpEndpoint);
  const context = await getPersistentContext(browser);
  const page = await context.newPage();

  try {
    const { extensionId, url } = await resolveExtensionPage(
      page,
      extensionCandidates,
      query,
      sites,
      explicitExtensionId
    );

    const result = await page.evaluate(async (payload) => {
      return window.aiCompareOpenClaw.run(payload);
    }, {
      query,
      sites,
      timeoutMs,
      siteTimeoutMs,
      pollIntervalMs: pollMs,
      minChars,
      stableRounds,
      waitForIframesMs: waitIframesMs,
      forceRun: false
    });

    process.stdout.write(`${JSON.stringify({ ok: true, extensionId, extensionUrl: url, result }, null, 2)}\n`);
  } finally {
    try {
      await page.close();
    } catch (_) {
      // ignore close errors
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    const payload = {
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  asNumber,
  parseSites,
  uniqueStrings,
  buildExtensionUrl,
  getPrimaryExtensionId,
  getExtensionCandidates,
  parseRemoteDebuggingPort,
  connectToBrowser,
  getPersistentContext,
  getInstallInstructions,
  buildOldVersionInstructions,
  buildGuiCallbackTimeoutInstructions,
  looksLikeErrorPage,
  createDeferred,
  createCallbackServer,
  getGuiModeNotes,
  openUrlInBrowser,
  runGuiMode,
  tryOpenExtensionPage,
  resolveExtensionPage,
  parseRunnerPayload,
  main
};
