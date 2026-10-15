const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const agentNames = ['planner', 'generator', 'healer'].map(name => `playwright_test_${name}.toml`);
const configNames = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs', 'playwright.config.cjs'];

function initProject({ directory = process.cwd(), configFile, url } = {}) {
  const project = path.resolve(directory);
  const baseURL = url || process.env.TARGET_BASE_URL || 'http://localhost:3000';
  const parsedURL = new URL(baseURL);
  if (!['http:', 'https:'].includes(parsedURL.protocol) || parsedURL.username || parsedURL.password) throw new Error('Base URL must be HTTP(S) without embedded credentials');
  const agents = agentNames.map(name => path.join(project, '.codex', 'agents', name));
  const present = agents.filter(file => fs.existsSync(file));
  if (present.length && present.length !== agents.length) throw new Error('Some Playwright Codex agents already exist. Review them, then run Playwright init-agents manually to avoid replacing custom instructions.');

  let config = configFile ? path.resolve(project, configFile) : configNames.map(name => path.join(project, name)).find(file => fs.existsSync(file));
  if (configFile && !fs.existsSync(config)) throw new Error(`Playwright config does not exist: ${config}`);
  if (!config) {
    config = path.join(project, 'playwright.config.cjs');
    fs.writeFileSync(config, [
      "const fs = require('node:fs');",
      "const { defineConfig } = require('@playwright/test');",
      "if (fs.existsSync('.env')) process.loadEnvFile('.env');",
      '',
      'module.exports = defineConfig({',
      "  testDir: './tests',",
      "  reporter: [['list'], ['html', { open: 'never' }]],",
      `  use: { baseURL: process.env.TARGET_BASE_URL || ${JSON.stringify(baseURL)}, trace: 'retain-on-failure', screenshot: 'only-on-failure' },`,
      '});',
      ''
    ].join('\n'));
    console.log(`Created ${path.relative(project, config)}`);
  }

  if (!present.length) {
    const packageFile = require.resolve('@playwright/test/package.json');
    const playwrightCLI = path.join(path.dirname(packageFile), 'cli.js');
    const result = spawnSync(process.execPath, [playwrightCLI, 'init-agents', '--loop=codex', '--config', config], {
      cwd: project, stdio: 'inherit', windowsHide: true
    });
    if (result.error || result.status !== 0) throw new Error(`Playwright agent initialization failed: ${result.error?.message || `exit ${result.status}`}`);
    if (agents.some(file => !fs.existsSync(file))) throw new Error('Playwright did not create all three Codex agent definitions');
  } else console.log('Playwright Codex agent definitions already exist; left them unchanged.');

  const specGuide = path.join(project, 'specs', 'README.md');
  if (fs.existsSync(specGuide) && /^# Specs\s+This is a directory for test plans\.?\s*$/.test(fs.readFileSync(specGuide, 'utf8'))) {
    fs.writeFileSync(specGuide, fs.readFileSync(path.join(__dirname, '..', 'specs', 'README.md')));
  }

  console.log(`Write specs in ${path.join(project, 'specs')} and prepare the generated seed test for your app.`);
  console.log('Then ask Codex to use playwright_test_generator on a spec and run the resulting tests with ardberg run.');
  return 0;
}

module.exports = { initProject };
