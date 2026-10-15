const fs = require('node:fs');
const path = require('node:path');
const { root, readJSON } = require('./util');
const { childEnvironment, runProcess } = require('./processes');
const { parseResults } = require('./results');
async function execute({ runId, attempt, candidate, context, directory, browsers, signal, timeoutMs, existingConfig }) {
  fs.mkdirSync(directory, { recursive: true });
  const cli = path.join(path.dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
  const config = existingConfig || path.join(root, 'src/playwright.config.js');
  const env = childEnvironment(context.secretNames, {
    AGENT_CONTEXT_FILE: path.join(path.dirname(candidate.file), 'context.json'),
    AGENT_TEST_DIR: path.dirname(candidate.file), AGENT_ATTEMPT_DIR: directory,
    AGENT_BROWSERS: browsers.join(','), AGENT_SUITE_TIMEOUT: String(timeoutMs),
    TARGET_BASE_URL: context.baseURL,
    PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(directory, 'playwright.json'),
    FORCE_COLOR: '0'
  });
  const args = ['test', '--config', config, '--retries=0', '--workers=1', '--forbid-only', `--global-timeout=${timeoutMs}`, '--reporter=line,json', '--output', path.join(directory, 'artifacts')];
  if (!existingConfig) {
    const discovery = await runProcess([process.execPath, cli, ...args, '--list'], { cwd: root, env, signal, names: context.secretNames, timeoutMs: Math.min(timeoutMs,15000), logFile: path.join(directory, 'discovery.log') });
    if (discovery.code !== 0 || discovery.timedOut) throw new Error('Generated test discovery failed; inspect discovery.log');
    const reportFile = path.join(directory, 'playwright.json');
    if (fs.existsSync(reportFile)) fs.renameSync(reportFile, path.join(directory, 'discovery.json'));
  }
  const result = await runProcess([process.execPath, cli, ...args], { cwd: existingConfig ? path.dirname(existingConfig) : root, env, signal, names: context.secretNames, timeoutMs: timeoutMs + 5000, logFile: path.join(directory, 'runner.log') });
  let raw;
  try { raw = readJSON(path.join(directory, 'playwright.json')); }
  catch { return { attempt, candidateHash: candidate.hash, exitCode: result.code, outcome: 'incomplete', records: [], errors: [{ message: result.error || (result.timedOut ? 'Runner timed out' : 'Missing or malformed Playwright JSON; inspect runner.log') }] }; }
  const parsed = parseResults(raw, { runId, attempt, candidateHash: candidate.hash, directory, exitCode: result.code, names: context.secretNames });
  if (result.timedOut || signal.aborted) { parsed.outcome = 'incomplete'; parsed.errors.push({ message: 'Runner timed out or was cancelled' }); }
  return parsed;
}
module.exports = { execute };
