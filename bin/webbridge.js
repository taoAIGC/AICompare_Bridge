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
const VERSION = '0.1.0';

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

function parseRunnerPayload(stdout) {
  const text = String(stdout || '').trim();
  if (!text) throw new Error('Runner returned empty output');
  try {
    return JSON.parse(text);
  } catch (_) {
    const firstObject = text.indexOf('{');
    if (firstObject >= 0) return JSON.parse(text.slice(firstObject));
    throw new Error('Runner output was not valid JSON');
  }
}

function runSearch(payload) {
  const runner = path.join(__dirname, 'runner.js');
  if (!fs.existsSync(runner)) throw new Error(`Runner is missing at ${runner}; reinstall AICompare WebBridge`);
  // Keep the legacy OpenClaw trigger contract for older installed extensions.
  // Newer extensions also understand this contract, while source/callback
  // names can be overridden during compatibility testing.
  const source = process.env.AICOMPARE_BRIDGE_SOURCE || 'openclaw';
  const args = [runner, '--mode', 'gui', '--source', source, '--query', String(payload.query || '')];
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
        const parsed = parseRunnerPayload(stdout);
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
  if (!query) throw new Error('Usage: aicompare-webbridge search --query "..." [--sites "ChatGPT,Gemini"]');
  const sitesIndex = args.indexOf('--sites');
  const sites = sitesIndex >= 0 ? args[sitesIndex + 1] : '';
  const timeoutIndex = args.indexOf('--timeout-ms');
  const timeoutMs = timeoutIndex >= 0 ? Number(args[timeoutIndex + 1]) : 120000;
  const started = await requestJson('POST', '/command', { query, sites, timeout_ms: timeoutMs });
  const deadline = Date.now() + timeoutMs + 15000;
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
