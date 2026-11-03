#!/usr/bin/env node

const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_ADDR = process.env.AICOMPARE_BRIDGE_ADDR || '127.0.0.1:10087';
const STATE_DIR = process.env.AICOMPARE_BRIDGE_HOME || path.join(os.homedir(), '.aicompare-webbridge');
const PID_PATH = path.join(STATE_DIR, 'daemon.pid');
const LOG_PATH = path.join(STATE_DIR, 'daemon.log');
const VERSION = '0.2.0';
// 与 runner.js 的 DEFAULT_SHARE_BUDGET_MS 保持一致：站点答完后扩展点分享弹层、
// 生成云端汇总页所用的时间，守护进程轮询截止要把它算进去。
const DEFAULT_SHARE_BUDGET_MS = 20000;

function splitAddr(value) {
  const match = String(value || DEFAULT_ADDR).match(/^(.*):(\d+)$/);
  if (!match) throw new Error(`Invalid listen address: ${value}`);
  return { host: match[1] || '127.0.0.1', port: Number(match[2]) };
}

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
}

function writePid() {
  ensureStateDir();
  fs.writeFileSync(PID_PATH, String(process.pid), { mode: 0o600 });
}

function readPid() {
  try { return Number(fs.readFileSync(PID_PATH, 'utf8').trim()); } catch (_) { return 0; }
}

function logLine(message) {
  ensureStateDir();
  fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${message}\n`);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function tokenMatches(req) {
  const expected = process.env.AICOMPARE_BRIDGE_TOKEN;
  if (!expected) return true;
  const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function readJson(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) reject(new Error('Request body too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function runSearch(payload) {
  const runner = path.join(__dirname, 'runner.js');
  if (!fs.existsSync(runner)) throw new Error(`Runner is missing at ${runner}; reinstall AICompare WebBridge`);
  // source 只是调用方标签，不同 Agent 客户端可以在 /command 里自己传；
  // 没传就统一记成 webbridge，不再固定写死 workbuddy。
  const callerSource = String(payload.source || 'webbridge').trim() || 'webbridge';
  const args = [runner, '--mode', 'gui', '--source', callerSource, '--query', String(payload.query || '')];
  if (payload.sites) args.push('--sites', Array.isArray(payload.sites) ? payload.sites.join(',') : String(payload.sites));
  if (payload.timeout_ms) args.push('--wait-results-ms', String(payload.timeout_ms), '--timeout-ms', String(payload.timeout_ms));
  if (payload.extension_id) args.push('--extension-id', String(payload.extension_id));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        // runner 用 JSON.stringify(..., null, 2) 输出多行 JSON，
        // 只取最后一行会拿到 "}"，解析必然失败。先整体解析，失败再退到最后一行。
        const text = stdout.trim();
        let parsed;
        try {
          parsed = JSON.parse(text || '{}');
        } catch (_) {
          parsed = JSON.parse(text.split('\n').pop() || '{}');
        }
        if (code !== 0 || parsed.ok === false) reject(new Error(parsed.error || stderr || `runner exited with ${code}`));
        else resolve(parsed);
      } catch (error) {
        reject(new Error(`Invalid runner response: ${error.message}; ${stderr}`));
      }
    });
  });
}

function createServer(addr) {
  let active = 0;
  const tasks = new Map();
  const startedAt = Date.now();
  const server = http.createServer(async (req, res) => {
    if (!tokenMatches(req)) return json(res, 401, { ok: false, error: 'Unauthorized' });
    const url = new URL(req.url, `http://${addr.host}:${addr.port}`);
    if (req.method === 'GET' && url.pathname === '/status') {
      return json(res, 200, { ok: true, version: VERSION, running: true, port: addr.port, active, uptime_seconds: Math.floor((Date.now() - startedAt) / 1000), tasks: tasks.size });
    }
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, version: VERSION });
    if (req.method === 'POST' && url.pathname === '/command') {
      try {
        const payload = await readJson(req);
        if (!String(payload.query || '').trim()) return json(res, 400, { ok: false, error: 'query is required' });
        const taskId = `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        tasks.set(taskId, { taskId, status: 'running', createdAt: new Date().toISOString() });
        active += 1;
        runSearch(payload).then((result) => {
          tasks.set(taskId, { taskId, status: 'completed', completedAt: new Date().toISOString(), result });
        }).catch((error) => {
          tasks.set(taskId, { taskId, status: 'error', completedAt: new Date().toISOString(), error: error.message });
        }).finally(() => { active -= 1; });
        return json(res, 202, { ok: true, task_id: taskId, status: 'running', status_url: `/tasks/${taskId}` });
      } catch (error) { return json(res, 400, { ok: false, error: error.message }); }
    }
    const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);
    if (req.method === 'GET' && taskMatch) {
      const task = tasks.get(taskMatch[1]);
      return task ? json(res, 200, { ok: true, ...task }) : json(res, 404, { ok: false, error: 'task not found' });
    }
    return json(res, 404, { ok: false, error: 'not found' });
  });
  return server;
}

function start(addrValue = DEFAULT_ADDR, foreground = false) {
  if (!foreground) {
    ensureStateDir();
    const child = require('child_process').spawn(process.execPath, [__filename, 'start', '--foreground', '--addr', addrValue], { detached: true, stdio: 'ignore' });
    child.unref();
    process.stdout.write(`AICompare WebBridge starting on http://${addrValue}\n`);
    return;
  }
  const addr = splitAddr(addrValue);
  const server = createServer(addr);
  server.listen(addr.port, addr.host, () => {
    writePid();
    logLine(`listening on ${addr.host}:${addr.port}`);
    if (foreground) process.stdout.write(`AICompare WebBridge listening on http://${addr.host}:${addr.port}\n`);
  });
  const cleanup = () => { try { fs.unlinkSync(PID_PATH); } catch (_) {} server.close(() => process.exit(0)); };
  process.on('SIGINT', cleanup); process.on('SIGTERM', cleanup);
}

function requestJson(method, pathName, payload) {
  const addr = splitAddr(DEFAULT_ADDR);
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : '';
    const req = http.request({ host: addr.host, port: addr.port, path: pathName, method, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        try { const value = JSON.parse(text || '{}'); res.statusCode >= 400 ? reject(new Error(value.error || `HTTP ${res.statusCode}`)) : resolve(value); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function search(args) {
  const queryIndex = args.indexOf('--query');
  const query = queryIndex >= 0 ? args[queryIndex + 1] : '';
  if (!query) throw new Error('Usage: aicompare-webbridge search --query "..." [--sites "ChatGPT,Gemini"] [--source codex] [--extension-id <id>]');
  const sitesIndex = args.indexOf('--sites');
  const sites = sitesIndex >= 0 ? args[sitesIndex + 1] : '';
  const timeoutIndex = args.indexOf('--timeout-ms');
  const timeoutMs = timeoutIndex >= 0 ? Number(args[timeoutIndex + 1]) : 120000;
  // 调用方名字只作标签，不影响流程；Codex / Claude Code 等各自传自己的名字即可。
  const sourceIndex = args.indexOf('--source');
  const source = sourceIndex >= 0 ? String(args[sourceIndex + 1] || '').trim() : '';
  // 未打包加载的开发版扩展 id 和商店版不同，必须能显式指定，
  // 否则 runner 只会去试商店那个 id，找不到就报"扩展未安装"。
  const extensionIndex = args.indexOf('--extension-id');
  const extensionId = extensionIndex >= 0 ? String(args[extensionIndex + 1] || '').trim() : '';
  const started = await requestJson('POST', '/command', {
    query, sites, timeout_ms: timeoutMs, source, extension_id: extensionId
  });
  // runner 在所有站点答完之后还要留时间点分享弹层、生成云端汇总页，
  // 它的回调等待是 timeout + 2 份分享预算，这里的轮询截止必须比它更久，
  // 否则守护进程先放弃，Agent 端永远拿不到最后那份带链接的结果。
  const shareBudgetMs = DEFAULT_SHARE_BUDGET_MS;
  const deadline = Date.now() + timeoutMs + shareBudgetMs * 2 + 15000;
  while (Date.now() < deadline) {
    const task = await requestJson('GET', started.status_url);
    if (task.status === 'completed') return process.stdout.write(`${JSON.stringify(task.result)}\n`);
    if (task.status === 'error') throw new Error(task.error || 'Search failed');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Timed out waiting for AICompare WebBridge task');
}

async function cli() {
  const [command = 'help', ...rest] = process.argv.slice(2);
  if (command === 'start') return start(rest.find((v, i) => rest[i - 1] === '--addr') || DEFAULT_ADDR, rest.includes('--foreground'));
  if (command === 'status') {
    const addr = splitAddr(DEFAULT_ADDR);
    return require('http').get(`http://${addr.host}:${addr.port}/status`, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { process.stdout.write(`${b}\n`); }); }).on('error', () => { process.stdout.write(JSON.stringify({ ok: false, running: false }) + '\n'); process.exitCode = 1; });
  }
  if (command === 'stop') { const pid = readPid(); if (pid) process.kill(pid, 'SIGTERM'); return; }
  if (command === 'search') return search(rest);
  process.stdout.write('Usage: aicompare-webbridge start [--foreground] [--addr 127.0.0.1:10087]\n');
}

if (require.main === module) cli().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
