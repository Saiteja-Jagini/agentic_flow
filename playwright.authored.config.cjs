const fs = require('node:fs');
const { defineConfig } = require('@playwright/test');

if (fs.existsSync('.env')) process.loadEnvFile('.env');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.{js,ts}',
  testIgnore: ['**/demo-*.spec.js', '**/target-login.spec.js', '**/seed.spec.ts'],
  use: {
    baseURL: process.env.TARGET_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});
