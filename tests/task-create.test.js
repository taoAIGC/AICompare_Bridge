const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const runner = require('../bin/runner.js');
const bridge = require('../bin/webbridge.js');

test('task creation URL preserves task payload and callback', () => {
  const task = { id: 'task_1', query: 'weather', models: ['豆包', '元宝'], runMode: 'scheduled', time: '09:30' };
  const url = new URL(runner.buildScheduledTaskUrl('a'.repeat(32), task, 'http://127.0.0.1:10087/task-callback/test'));
  assert.equal(url.pathname, '/scheduler/tasks.html');
  assert.deepEqual(JSON.parse(url.searchParams.get('bridge_task')), task);
  assert.equal(url.searchParams.get('bridge_callback'), 'http://127.0.0.1:10087/task-callback/test');
});

test('task creation payload validates immediate and daily modes', () => {
  assert.deepEqual(runner.validateTaskCreateRequest({
    id: 'task_now', query: 'q', models: ['ChatGPT'], runMode: 'immediate'
  }), {
    id: 'task_now', query: 'q', models: ['ChatGPT'], runMode: 'immediate', time: '', sendEmail: false, email: '', enabled: true
  });
  assert.equal(runner.validateTaskCreateRequest({ query: 'q', models: ['M'], runMode: 'scheduled', time: '23:59' }).time, '23:59');
  assert.throws(() => runner.validateTaskCreateRequest({ query: 'q', models: [], runMode: 'immediate' }), /model/);
  assert.throws(() => runner.validateTaskCreateRequest({ query: 'q', models: ['M'], runMode: 'scheduled', time: '24:00' }), /HH:MM/);
});

test('bridge acknowledges task creation only after extension callback', async (t) => {
  let received;
  const server = bridge.createServer({ host: '127.0.0.1', port: 0 }, {
    runTaskCreate: async (payload, callbackUrl) => { received = { payload, callbackUrl }; }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  const request = (method, pathname, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, value: JSON.parse(text || '{}') }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });

  const accepted = await request('POST', '/task-command', { query: 'q', sites: 'ChatGPT', run_mode: 'immediate' });
  assert.equal(accepted.status, 202);
  assert.equal(accepted.value.status, 'pending');
  assert.equal(received.payload.runMode, 'immediate');
  assert.match(received.callbackUrl, new RegExp(`^http://127\\.0\\.0\\.1:${port}/task-callback/`));

  const nonce = received.callbackUrl.split('/').pop();
  const callback = await request('POST', `/task-callback/${nonce}`, { ok: true, task: { id: received.payload.id } }, {
    Origin: `chrome-extension://${'a'.repeat(32)}`
  });
  assert.equal(callback.status, 200);
  const state = await request('GET', accepted.value.status_url);
  assert.equal(state.value.status, 'completed');
  assert.equal(state.value.task.id, received.payload.id);
});
