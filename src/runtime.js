// This module is the only browser action executor used by generated tests.
const { test, expect } = require('@playwright/test');
const { sameOriginPath } = require('./contracts');
const { redact } = require('./util');
const { readOnlyRequest } = require('./website-safety');

function locatorFor(page, descriptor) {
  const options = { exact: true };
  switch (descriptor.kind) {
    case 'role': return page.getByRole(descriptor.role, { name: descriptor.value, ...options });
    case 'label': return page.getByLabel(descriptor.value, options);
    case 'text': return page.getByText(descriptor.value, options);
    case 'testId': return page.getByTestId(descriptor.value);
    case 'css': return page.locator(descriptor.value);
    default: throw new Error('Unsupported locator kind');
  }
}
async function inspectPage(page) {
  return page.evaluate(() => [...document.querySelectorAll('button,input,select,textarea,a,[role]')].slice(0,200).map((el, index) => {
    const labels = el.labels ? [...el.labels].map(label => label.textContent.trim()).join(' ') : '';
    const role = el.getAttribute('role') || ({ BUTTON: 'button', A: 'link', SELECT: 'combobox', TEXTAREA: 'textbox' }[el.tagName]) || (el.type === 'checkbox' ? 'checkbox' : 'textbox');
    const name = el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(' ').map(id => document.getElementById(id)?.textContent || '').join(' ').trim() || labels || (el.tagName === 'INPUT' ? '' : el.textContent.trim());
    return { index, role, name: name.slice(0,150), tag: el.tagName.toLowerCase(), testId: el.getAttribute('data-testid'), visible: !!(el.getClientRects().length) };
  }));
}
async function createScenario(page, testInfo, context, scenario) {
  const network = [], pageErrors = [], blocked = [];
  let documentStatus = null;
  page.on('pageerror', error => pageErrors.push(error.message));
  if (context.sessionStorageFile) {
    const session = require('node:fs').readFileSync(context.sessionStorageFile, 'utf8');
    await page.addInitScript(({ origin, values }) => {
      if (location.origin === origin) for (const [key, value] of Object.entries(values)) sessionStorage.setItem(key, value);
    }, JSON.parse(session));
  }
  page.on('requestfailed', request => network.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
  page.on('response', response => { if (response.status() >= 400) network.push({ url: response.url(), status: response.status() }); });
  await page.route('**/*', route => {
    const request = route.request();
    if (context.discovered && !readOnlyRequest(request, context.baseURL)) {
      blocked.push(request.url());
      return route.abort('blockedbyclient');
    }
    if (request.isNavigationRequest() && request.frame() === page.mainFrame() && new URL(request.url()).origin !== new URL(context.baseURL).origin) return route.abort('blockedbyclient');
    return route.continue();
  });
  return {
    network, pageErrors, blocked,
    get documentStatus() { return documentStatus; },
    set documentStatus(value) { documentStatus = value; },
    async step(index, action) {
      const step = scenario.steps[index];
      if (!step) throw new Error(`Unknown scenario step ${index}`);
      try {
        await test.step(`${index + 1}. ${step.action} ${step.locator || step.value || ''}`, action);
      } catch (error) {
        let elements = [], snapshot = null;
        try { elements = await inspectPage(page); snapshot = (await page.locator('body').ariaSnapshot({ timeout: 1000 })).slice(0, 16000); } catch { /* Browser or page may already be unavailable. */ }
        const evidence = redact({ scenarioId: scenario.id, stepIndex: index, step, url: page.url(), elements, snapshot, network: network.slice(-30), pageErrors, blocked }, context.secretNames);
        await testInfo.attach('agent-evidence', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });
        throw error;
      }
    }
  };
}
async function executeScenario(page, testInfo, scenario, context) {
  const network = [];
  const pageErrors = [], blocked = [];
  let documentStatus = null;
  page.on('pageerror',error=>pageErrors.push(error.message));
  if(context.sessionStorageFile) {
    const session=require('node:fs').readFileSync(context.sessionStorageFile,'utf8');
    await page.addInitScript(({origin,values})=>{if(location.origin===origin)for(const [key,value] of Object.entries(values))sessionStorage.setItem(key,value);},JSON.parse(session));
  }
  page.on('requestfailed', request => network.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
  page.on('response', response => { if (response.status() >= 400) network.push({ url: response.url(), status: response.status() }); });
  await page.route('**/*', route => {
    const request = route.request();
    if(context.discovered && !readOnlyRequest(request,context.baseURL)) {blocked.push(request.url());return route.abort('blockedbyclient');}
    if (request.isNavigationRequest() && request.frame() === page.mainFrame() && new URL(request.url()).origin !== new URL(context.baseURL).origin) return route.abort('blockedbyclient');
    return route.continue();
  });
  for (let index = 0; index < scenario.steps.length; index++) {
    const step = scenario.steps[index];
    try {
      await test.step(`${index + 1}. ${step.action} ${step.locator || step.value || ''}`, async () => {
        const locator = step.locator ? locatorFor(page, context.locators[step.locator]) : null;
        switch (step.action) {
          case 'goto': {
            const response=await page.goto(sameOriginPath(step.value, context.baseURL));documentStatus=response?.status() || null;
            if(context.discovered) await page.waitForLoadState('networkidle',{timeout:1200}).catch(()=>{});
            break;
          }
          case 'fill': {
            const value = step.secret ? process.env[step.secret] : step.value;
            if (value===undefined || value===null) throw new Error(`Missing test data environment variable ${step.secret}`);
            await locator.fill(value); break;
          }
          case 'click': await locator.click(); break;
          case 'press': await locator.press(step.value); break;
          case 'select': await locator.selectOption(step.value); break;
          case 'check': await locator.check(); break;
          case 'expectVisible': await expect(locator).toBeVisible(); break;
          case 'expectText': await expect(locator).toHaveText(step.value); break;
          case 'expectURL': await expect(page).toHaveURL(sameOriginPath(step.value, context.baseURL)); break;
          case 'expectValue': await expect(locator).toHaveValue(step.value); break;
          case 'expectChecked': await expect(locator).toBeChecked(); break;
          case 'expectEnabled': await expect(locator).toBeEnabled(); break;
          case 'expectPageHealthy': {
            await page.waitForLoadState('networkidle',{timeout:1200}).catch(()=>{});
            expect(documentStatus,'Main document HTTP status').toBeLessThan(400);
            expect(blocked,'Interaction requires requests outside automatic testing scope').toEqual([]);
            expect(pageErrors,'Uncaught browser errors').toEqual([]);
            expect(network.filter(item=>new URL(item.url).origin===new URL(context.baseURL).origin),'Failed same-origin resources/API requests').toEqual([]);
            await expect(page.locator('body')).toBeVisible();break;
          }
          default: throw new Error('Unsupported action');
        }
      });
    } catch (error) {
      let elements = [], snapshot = null;
      try { elements = await inspectPage(page); snapshot = (await page.locator('body').ariaSnapshot({ timeout: 1000 })).slice(0,16000); } catch { /* Browser or page may already be unavailable. */ }
      const evidence = redact({ scenarioId: scenario.id, stepIndex: index, step, url: page.url(), elements, snapshot, network: network.slice(-30),pageErrors,blocked }, context.secretNames);
      await testInfo.attach('agent-evidence', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' });
      throw error;
    }
  }
}
module.exports = { test, expect, createScenario, executeScenario, inspectPage };
