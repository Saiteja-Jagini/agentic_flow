const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {runAgent}=require('../src/agent');
const {Providers}=require('../src/providers');
const {demoContext}=require('../src/templates');
const {root,writeJSON,readJSON}=require('../src/util');
const fixtures=path.join(root,'runs',`integration-fixtures-${Date.now()}`);
function fixture(name,value){const file=path.join(fixtures,name);writeJSON(file,value);return file;}
const smoke={schemaVersion:1,requirement:'Login page opens',missingInformation:[],scenarios:[{id:'smoke',title:'Login page opens',preconditions:[],steps:[{action:'goto',locator:null,value:'/login',secret:null},{action:'expectURL',locator:null,value:'/login',secret:null}]}]};

test('cancellation writes a terminal report and cleans up demo server',async()=>{
  const result=await runAgent({demo:'working',timeoutMs:100});
  assert.equal(result.run.outcome,'cancelled');assert.equal(result.exitCode,2);assert.ok(fs.existsSync(result.run.report));
});
test('generated login suite passes and report covers both scenarios',async()=>{
  const result=await runAgent({demo:'working'});
  assert.equal(result.run.outcome,'passed');assert.equal(result.exitCode,0);
  assert.equal(result.run.attempts[0].records.length,2);assert.equal(result.run.providerCalls.length,0);
  assert.ok(fs.existsSync(path.join(result.directory,'candidate-1','generated.spec.js')));
});
test('observed selector correction preserves plan and original artifacts',async()=>{
  const result=await runAgent({demo:'repair'});
  assert.equal(result.run.outcome,'passed-after-correction');assert.equal(result.exitCode,1);assert.equal(result.run.attempts.length,2);
  assert.deepEqual(readJSON(path.join(result.directory,'candidate-1','plan.json')),readJSON(path.join(result.directory,'candidate-2','plan.json')));
  assert.equal(result.run.repairs.length,1);
  for(const name of ['screenshot','trace','video'])assert.ok(result.run.attempts[0].records[0].artifacts.some(a=>a.name===name && a.available));
});
test('transient network evidence permits bounded retry and keeps flaky outcome',async()=>{
  const result=await runAgent({demo:'transient'});
  assert.equal(result.run.outcome,'passed-after-retry');assert.equal(result.exitCode,1);assert.equal(result.run.attempts.length,2);
  assert.equal(result.run.attempts[0].candidateHash,result.run.attempts[1].candidateHash);
  assert.equal(result.run.decisions[0].action,'RETRY');
});
test('persistent network failure stops at three executions',async()=>{
  const result=await runAgent({demo:'network'});
  assert.equal(result.run.outcome,'needs-human-review');assert.equal(result.run.attempts.length,3);
  assert.match(result.run.decisions.at(-1).reason,/budget/);
});
test('missing login button cannot be repaired into a passing test',async()=>{
  const result=await runAgent({demo:'missing-button',allowRepair:true});
  assert.equal(result.run.outcome,'needs-human-review');assert.equal(result.run.repairs.length,0);assert.equal(result.run.attempts.length,1);
});
test('unavailable analysis preserves actual test failure',async t=>{
  t.mock.method(Providers.prototype,'jev',async()=>{throw new Error('Simulated provider outage');});
  const result=await runAgent({demo:'failure',evaluator:'jev'});
  assert.equal(result.run.outcome,'needs-human-review');assert.equal(result.run.attempts[0].outcome,'failed');
  assert.equal(result.run.analyses[0].status,'unavailable');assert.equal(result.run.decisions[0].action,'HUMAN_REVIEW');
});
test('incorrect text and slow responses preserve expectations without blind retries',async()=>{
  for(const demo of ['wrong-text','slow']) {
    const result=await runAgent({demo,allowRepair:true});
    assert.equal(result.run.outcome,'needs-human-review');assert.equal(result.run.attempts.length,1);assert.equal(result.run.repairs.length,0);
  }
});
test('build and readiness failures are blocked with no fabricated tests',async()=>{
  const context={...demoContext(),secretNames:[],repository:root,startup:{build:[process.execPath,'-e','process.exit(7)'],command:[process.execPath,'demo/server.js']}};
  const planFile=fixture('smoke.plan.json',smoke);
  const build=await runAgent({contextFile:fixture('build.context.json',context),planFile});
  assert.equal(build.run.outcome,'blocked');assert.equal(build.run.attempts.length,0);assert.ok(fs.existsSync(path.join(build.directory,'build.log')));
  delete context.startup;context.baseURL='http://127.0.0.1:1';
  const ready=await runAgent({contextFile:fixture('unreachable.context.json',context),planFile,readinessTimeoutMs:300});
  assert.equal(ready.run.outcome,'blocked');assert.match(ready.run.error,/readiness/);
});
test('existing trusted Playwright config is executed with separate reports',async()=>{
  const context={...demoContext(),secretNames:[],repository:root,startup:{command:[process.execPath,'demo/server.js']}};
  const result=await runAgent({contextFile:fixture('existing.context.json',context),existingConfig:path.join(root,'playwright.config.js')});
  assert.equal(result.run.outcome,'passed');assert.equal(result.run.attempts[0].records.length,2);assert.equal(result.run.planner,'existing-suite');
});
test('a seed-only authored suite does not report coverage as passed',async()=>{
  const suite=path.join(fixtures,'seed-only');fs.mkdirSync(suite,{recursive:true});
  fs.writeFileSync(path.join(suite,'seed.spec.ts'),"import { test } from '@playwright/test'; test('seed', async ({ page }) => { await page.goto('/login'); });\n");
  fs.writeFileSync(path.join(suite,'playwright.config.cjs'),"const { defineConfig } = require('@playwright/test'); module.exports = defineConfig({ testDir: __dirname, testMatch: 'seed.spec.ts', use: { baseURL: 'http://127.0.0.1:4173' } });\n");
  const context={...demoContext(),secretNames:[],repository:root,startup:{command:[process.execPath,'demo/server.js']}};
  const result=await runAgent({contextFile:fixture('seed-only.context.json',context),existingConfig:path.join(suite,'playwright.config.cjs'),maxAttempts:1});
  assert.equal(result.run.outcome,'incomplete');assert.match(result.run.error,/No authored test cases/);
});
