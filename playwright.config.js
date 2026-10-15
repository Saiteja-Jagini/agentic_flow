const { defineConfig } = require('@playwright/test');
const path = require('node:path');

const mode = process.env.AGENT_RUN_MODE || 'demo';
const demo = mode.startsWith('demo');
const baseURL = demo ? 'http://127.0.0.1:3000' : process.env.TARGET_BASE_URL;
const runDir = process.env.AGENT_RUN_DIR || path.join(__dirname, 'runs', 'manual');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: mode === 'target' ? 'target-login.spec.js' :
    mode === 'demo-failure' ? 'demo-failure.spec.js' : 'demo-login.spec.js',
  timeout: 15000,
  expect: { timeout: 5000 },
  retries: 0,
  workers: 1,
  outputDir: path.join(runDir, 'artifacts'),
  reporter: [
    ['line'],
    ['json', { outputFile: path.join(runDir, 'playwright.json') }]
  ],
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
});
