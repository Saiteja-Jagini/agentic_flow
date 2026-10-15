const { defineConfig } = require('@playwright/test');
const path = require('node:path');
const context = require(process.env.AGENT_CONTEXT_FILE);
module.exports = defineConfig({
  testDir: process.env.AGENT_TEST_DIR,
  testMatch: 'generated.spec.js',
  forbidOnly: true, retries: 0, workers: 1,
  timeout: Number(process.env.AGENT_TEST_TIMEOUT || 15000),
  globalTimeout: Number(process.env.AGENT_SUITE_TIMEOUT || 90000),
  expect: { timeout: Number(process.env.AGENT_ASSERT_TIMEOUT || 3000) },
  outputDir: path.join(process.env.AGENT_ATTEMPT_DIR, 'artifacts'),
  reporter: [['line'], ['json', { outputFile: path.join(process.env.AGENT_ATTEMPT_DIR, 'playwright.json') }]],
  projects: (process.env.AGENT_BROWSERS || 'chromium').split(',').map(browserName => ({ name: browserName, use: { browserName } })),
  use: { baseURL: context.baseURL, storageState:context.storageStateFile || undefined, serviceWorkers:context.discovered?'block':'allow', actionTimeout: Number(process.env.AGENT_ASSERT_TIMEOUT || 3000), navigationTimeout: 10000,
    screenshot: 'only-on-failure', trace: 'retain-on-failure', video: 'retain-on-failure' }
});
