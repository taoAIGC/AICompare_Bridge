#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const home = process.env.AICOMPARE_BRIDGE_HOME || path.join(os.homedir(), '.aicompare-webbridge');
const binDir = path.join(home, 'bin');
const target = path.join(binDir, 'aicompare-webbridge');
const source = path.join(__dirname, 'webbridge.js');
fs.mkdirSync(binDir, { recursive: true, mode: 0o700 });
fs.copyFileSync(source, target);
fs.chmodSync(target, 0o755);
const childEnv = { ...process.env };
delete childEnv.NODE_OPTIONS;
const child = spawn(process.execPath, [target, 'start'], { detached: true, env: childEnv, stdio: 'ignore' });
child.unref();
process.stdout.write(`Installed AICompare WebBridge to ${target}\n`);
