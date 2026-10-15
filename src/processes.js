const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { redact } = require('./util');

function childEnvironment(names = [], extra = {}) {
  return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => names.includes(key) || !/KEY|TOKEN|PASSWORD|SECRET|OPENAI|JEV/i.test(key))), ...extra };
}
async function stopTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise(resolve => execFile('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, timeout:5000 }, () => resolve()));
    // Restricted Windows environments can reject taskkill's process enumeration.
    // Node can still terminate its own direct child using the retained process handle.
    if (child.exitCode === null) { try { child.kill('SIGKILL'); } catch { /* Already exited. */ } }
    child.stdout?.destroy();
    child.stderr?.destroy();
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
  }
}
function startProcess(command, { cwd, env, logFile, names = [], signal } = {}) {
  if (!Array.isArray(command) || !command.length || command.some(part => typeof part !== 'string')) throw new Error('Commands must be arrays of an executable and arguments');
  let [executable, ...args] = command;
  if (/^npm(?:\.cmd)?$/.test(executable)) {
    const npmCLI = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    if (!fs.existsSync(npmCLI)) throw new Error('Cannot locate npm CLI; use node with an explicit script path');
    executable = process.execPath; args = [npmCLI, ...args];
  }
  if (executable === 'node') executable = process.execPath;
  if (signal?.aborted) throw new Error('Operation cancelled');
  const child = spawn(executable, args, { cwd, env: env || childEnvironment(names), windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore','pipe','pipe'] });
  let output = '', spawnError = null;
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { if (output.length < 4000000) output += chunk.toString(); });
  const aborted = () => { void stopTree(child); };
  signal?.addEventListener('abort', aborted, { once: true });
  const completed = new Promise(resolve => {
    child.once('error', error => { spawnError = error.message; });
    child.once('close', (code, exitSignal) => {
      signal?.removeEventListener('abort', aborted);
      const clean = redact(output + (spawnError ? `\n${spawnError}` : ''), names);
      if (logFile) { fs.mkdirSync(path.dirname(logFile), { recursive: true }); fs.writeFileSync(logFile, clean); }
      resolve({ code, signal: exitSignal, error: spawnError, output: clean });
    });
  });
  return { child, completed, stop: async () => { await stopTree(child); return completed; } };
}
async function runProcess(command, options = {}) {
  const process = startProcess(command, options);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void process.stop(); }, options.timeoutMs || 120000);
  try { return { ...await process.completed, timedOut }; }
  finally { clearTimeout(timer); }
}
async function waitForReady(url, { timeoutMs = 15000, signal, child } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) throw new Error('Operation cancelled during readiness');
    if (child && (child.exitCode !== null || !child.pid)) throw new Error('Application exited before readiness; inspect startup.log');
    try {
      const response = await fetch(url, { redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(1000)]) : AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.status >= 200 && response.status < 400) return;
    } catch { /* Try again within the bounded readiness window. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Application readiness timed out at ${url}`);
}
module.exports = { childEnvironment, stopTree, startProcess, runProcess, waitForReady };
