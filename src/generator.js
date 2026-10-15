const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validatePlan } = require('./contracts');
const { root, hash, writeJSON } = require('./util');

function locatorSource(locator) {
  switch (locator.kind) {
    case 'role': return `page.getByRole(${JSON.stringify(locator.role)}, { name: ${JSON.stringify(locator.value)}, exact: true })`;
    case 'label': return `page.getByLabel(${JSON.stringify(locator.value)}, { exact: true })`;
    case 'text': return `page.getByText(${JSON.stringify(locator.value)}, { exact: true })`;
    case 'testId': return `page.getByTestId(${JSON.stringify(locator.value)})`;
    case 'css': return `page.locator(${JSON.stringify(locator.value)})`;
    default: throw new Error(`Unsupported locator kind: ${locator.kind}`);
  }
}

function renderStep(step, index, context) {
  const locator = step.locator ? locatorSource(context.locators[step.locator]) : null;
  const value = JSON.stringify(step.value);
  let body;
  switch (step.action) {
    case 'goto':
      body = [`const response = await page.goto(${value});`, 'scenario.documentStatus = response?.status() || null;'];
      if (context.discovered) body.push("await page.waitForLoadState('networkidle', { timeout: 1200 }).catch(() => {});");
      break;
    case 'fill':
      body = step.secret
        ? [`const value = process.env[${JSON.stringify(step.secret)}];`, `if (value === undefined) throw new Error(${JSON.stringify(`Missing test data environment variable ${step.secret}`)});`, `await ${locator}.fill(value);`]
        : [`await ${locator}.fill(${value});`];
      break;
    case 'click': body = [`await ${locator}.click();`]; break;
    case 'press': body = [`await ${locator}.press(${value});`]; break;
    case 'select': body = [`await ${locator}.selectOption(${value});`]; break;
    case 'check': body = [`await ${locator}.check();`]; break;
    case 'expectVisible': body = [`await expect(${locator}).toBeVisible();`]; break;
    case 'expectText': body = [`await expect(${locator}).toHaveText(${value});`]; break;
    case 'expectURL': body = [`await expect(page).toHaveURL(new URL(${value}, context.baseURL).href);`]; break;
    case 'expectValue': body = [`await expect(${locator}).toHaveValue(${value});`]; break;
    case 'expectChecked': body = [`await expect(${locator}).toBeChecked();`]; break;
    case 'expectEnabled': body = [`await expect(${locator}).toBeEnabled();`]; break;
    case 'expectPageHealthy':
      body = [
        "await page.waitForLoadState('networkidle', { timeout: 1200 }).catch(() => {});",
        "expect(scenario.documentStatus, 'Main document HTTP status').toBeLessThan(400);",
        "expect(scenario.blocked, 'Interaction requires requests outside automatic testing scope').toEqual([]);",
        "expect(scenario.pageErrors, 'Uncaught browser errors').toEqual([]);",
        "expect(scenario.network.filter(item => new URL(item.url).origin === new URL(context.baseURL).origin), 'Failed same-origin resources/API requests').toEqual([]);",
        "await expect(page.locator('body')).toBeVisible();"
      ];
      break;
    default: throw new Error(`Unsupported action: ${step.action}`);
  }
  const label = `${index + 1}. ${step.action}${step.locator ? ` ${step.locator}` : step.value ? ` ${step.value}` : ''}`.replace(/\s+/g, ' ');
  return [`    // ${label}`, `    await scenario.step(${index}, async () => {`, ...body.map(line => `      ${line}`), '    });'].join('\n');
}

function generate(plan, context, directory) {
  validatePlan(plan, context);
  fs.mkdirSync(directory, { recursive: true });
  const source = [
    '// Generated from a validated plan. Credential values are loaded only at execution.',
    "const { test, expect } = require('@playwright/test');",
    `const { createScenario } = require(${JSON.stringify(path.join(root, 'src/runtime.js'))});`,
    "const context = require('./context.json');",
    "const plan = require('./plan.json');",
    '',
    `test.describe(${JSON.stringify(plan.requirement)}, () => {`,
    ...plan.scenarios.map((scenario, scenarioIndex) => [
      `  test(${JSON.stringify(`${scenario.id}: ${scenario.title}`)}, async ({ page }, testInfo) => {`,
      `    const scenario = await createScenario(page, testInfo, context, plan.scenarios[${scenarioIndex}]);`,
      '',
      ...scenario.steps.map((step, index) => renderStep(step, index, context)),
      '  });'
    ].join('\n')),
    '});', ''
  ].join('\n');
  const file = path.join(directory, 'generated.spec.js');
  fs.writeFileSync(file, source);
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  if (check.status !== 0) throw new Error(`Generated source validation failed: ${check.stderr || check.error?.message}`);
  const candidate = { hash: hash(source), file, planHash: hash(plan), createdAt: new Date().toISOString(), validated: true };
  writeJSON(path.join(directory, 'candidate.json'), candidate);
  writeJSON(path.join(directory, 'plan.json'), plan);
  writeJSON(path.join(directory, 'context.json'), context);
  return candidate;
}
module.exports = { generate };
