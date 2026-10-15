const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { root, readJSON, writeJSON, hash, redact, sourceEvidence } = require('./util');
const { validateContext, validatePlan, sameOriginPath } = require('./contracts');
const { Providers } = require('./providers');
const { generate } = require('./generator');
const { execute } = require('./runner');
const { localAnalysis, proposeLocal, decide } = require('./policy');
const { startProcess, runProcess, waitForReady } = require('./processes');
const { report } = require('./reporter');
const { demoContext, targetContext, loginPlan } = require('./templates');

async function runAgent(options = {}) {
  const runId = `${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(3).toString('hex')}`;
  const directory = path.join(options.outputRoot || process.cwd(),'runs',runId);
  fs.mkdirSync(directory,{recursive:true});
  const started = Date.now(), controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT',cancel); process.once('SIGTERM',cancel);
  const deadline = setTimeout(cancel,options.timeoutMs || 180000);
  const run = { schemaVersion:1,runId,requirement:options.requirement || '',planner:options.planFile ? 'saved-plan' : options.demo || options.target ? 'login-template' : 'openai',
    evaluator:options.evaluator || 'local',outcome:'incomplete',attempts:[],decisions:[],analyses:[],repairs:[],providerCalls:[],error:null,startedAt:new Date().toISOString(),revision:process.env.GITHUB_SHA || null };
  let context, demoServer, app, providers;
  const oldDemo = {};
  try {
    if (options.demo) {
      context = demoContext();
      for (const [key,value] of Object.entries({ DEMO_VALID_EMAIL:'demo@example.test',DEMO_VALID_PASSWORD:'demo-only-password',DEMO_INVALID_PASSWORD:'incorrect-password' })) {
        oldDemo[key] = process.env[key]; process.env[key] ||= value;
      }
      if (options.demo === 'repair') context.locators.submit = { kind:'css',value:'#old-login',role:'button',intent:'Login' };
    } else if(options.website) {
      const baseURL=options.url || process.env.TARGET_BASE_URL;
      if(!baseURL) throw new Error('Set TARGET_BASE_URL in .env or pass --url');
      context={baseURL,routes:['/'],locators:{},expectedTexts:[],secretNames:['TARGET_VALID_EMAIL','TARGET_VALID_PASSWORD']};
    } else if (options.target) context = targetContext();
    else if (options.existingConfig && !options.contextFile && options.url) context = {baseURL:options.url,routes:['/'],locators:{},expectedTexts:[],secretNames:[]};
    else context = readJSON(path.resolve(options.contextFile || 'agent.context.json'));
    if (options.url && !options.website) context.baseURL = options.url;
    if (options.secretNames?.length) context.secretNames = [...new Set([...context.secretNames, ...options.secretNames])];
    validateContext(context);
    let executionContext = { ...context,locators:structuredClone(context.locators) };
    providers = new Providers({ signal:controller.signal,maxCalls:options.maxCalls ?? 8,timeoutMs:options.providerTimeoutMs || 30000,names:context.secretNames });
    let plan;
    if(options.website) {
      run.planner='website-discovery+openai';
      const {discover,baselinePlan}=require('./discovery');
      console.log('Discovering website pages and controls...');
      const discovered=await discover({baseURL:context.baseURL,directory,signal:controller.signal,maxPages:options.maxPages,maxDepth:options.maxDepth,maxInteractions:options.maxInteractions});
      executionContext=context=discovered.context;
      run.discovery=discovered.inventory;
      validateContext(context);
      plan=await providers.websitePlan(run.discovery,context,baselinePlan(run.discovery,context));
      run.discovery.scenarios=plan.scenarios.map(scenario=>({id:scenario.id,title:scenario.title,page:scenario.id.split('_')[0]}));
      writeJSON(path.join(directory,'discovery.json'),redact(run.discovery,context.secretNames));
    } else if (options.existingConfig) {
      plan = { schemaVersion:1,requirement:run.requirement || 'Run the existing Playwright suite',missingInformation:[],scenarios:[] };
      run.planner = 'existing-suite';
    } else if (options.planFile) plan = readJSON(path.resolve(options.planFile));
    else if (options.demo || options.target) plan = loginPlan(context,run.requirement || undefined);
    else {
      if (!run.requirement.trim()) throw new Error('Provide --requirement or --plan');
      const source = sourceEvidence(context);
      plan = await providers.plan(run.requirement, executionContext, source);
    }
    if (options.requirement) plan.requirement = options.requirement;
    run.requirement = plan.requirement;
    writeJSON(path.join(directory,'plan.json'),redact(plan,context.secretNames));
    writeJSON(path.join(directory,'context.json'),redact(executionContext,context.secretNames));
    if (!options.existingConfig) {
      if (options.demo === 'failure') plan.scenarios = [plan.scenarios[0]];
      if (options.demo === 'failure') plan.scenarios[0].steps = [{action:'goto',locator:null,value:'/login',secret:null},{action:'expectURL',locator:null,value:'/dashboard',secret:null}];
      if (['transient','network','slow','missing-button','repair'].includes(options.demo)) plan.scenarios = [plan.scenarios[0]];
      if (options.demo === 'wrong-text') plan.scenarios = [plan.scenarios[1]];
      if (options.demo && options.demo !== 'working') plan.requirement = `Demonstrate ${options.demo}: ${plan.scenarios.map(scenario=>scenario.title).join('; ')}.`;
      validatePlan(plan,executionContext);
      run.requirement = plan.requirement;
      writeJSON(path.join(directory,'plan.json'),redact(plan,context.secretNames));
    }
    if (options.planOnly) { generate(plan,executionContext,path.join(directory,'candidate-1')); run.outcome='planned'; }
    else {
      const requiredSecrets = options.existingConfig ? context.secretNames : [...new Set(plan.scenarios.flatMap(s=>s.steps.map(step=>step.secret)).filter(Boolean))];
      const missing = requiredSecrets.filter(name=>!process.env[name]);
      if (missing.length) throw new Error(`Missing test credentials/data: ${missing.join(', ')}`);
      if (options.demo) {
        const { createDemoServer } = require('../demo/application');
        demoServer = createDemoServer(options.demo);
        await new Promise((resolve,reject)=>{demoServer.once('error',reject);demoServer.listen(4173,'127.0.0.1',resolve);});
      } else if (context.startup) {
        if (!context.repository) throw new Error('startup requires an explicit repository');
        const cwd = fs.realpathSync(context.repository);
        const startupNames = [...context.secretNames,...(context.startup.envNames || [])];
        if (context.startup.build?.length) {
          const build = await runProcess(context.startup.build,{cwd,signal:controller.signal,timeoutMs:60000,names:startupNames,logFile:path.join(directory,'build.log')});
          if (build.code !== 0 || build.timedOut) throw new Error('Application build failed; inspect build.log');
        }
        app = startProcess(context.startup.command,{cwd,signal:controller.signal,names:startupNames,logFile:path.join(directory,'startup.log')});
      }
      if(!options.website) await waitForReady(sameOriginPath(context.readinessPath || '/',context.baseURL),{timeoutMs:options.readinessTimeoutMs || 15000,signal:controller.signal,child:app?.child});
      let investigations = 0;
      const maxAttempts = options.maxAttempts ?? 3, maxRepairs = options.maxRepairs ?? 1;
      for (let attempt=1;attempt<=maxAttempts;attempt++) {
        if (controller.signal.aborted) throw new Error('Run cancelled or elapsed-time budget exhausted');
        const candidateDirectory = path.join(directory,`candidate-${attempt}`);
        let candidate;
        if (options.existingConfig) {
          const config = path.resolve(options.existingConfig);
          candidate = {file:config,hash:hash(fs.readFileSync(config,'utf8'))};
        } else candidate = generate(plan,executionContext,candidateDirectory);
        const attemptDirectory = path.join(directory,`attempt-${attempt}`);
        console.log(`Attempt ${attempt}/${maxAttempts}: running ${(options.browsers || ['chromium']).join(', ')}`);
        const remaining = Math.max(1,(options.timeoutMs || 180000)-(Date.now()-started));
        const result = await execute({runId,attempt,candidate,context:executionContext,directory:attemptDirectory,browsers:options.browsers || ['chromium'],signal:controller.signal,timeoutMs:options.website?remaining:Math.min(remaining,90000),existingConfig:options.existingConfig && path.resolve(options.existingConfig)});
        run.attempts.push(result);
        if (options.existingConfig && result.outcome === 'passed' && !result.records.some(record => path.basename(record.file || '') !== 'seed.spec.ts')) {
          run.outcome = 'incomplete';
          run.error = 'No authored test cases were executed; the suite contains only the seed test';
          break;
        }
        if (result.outcome === 'passed') { run.outcome = attempt===1 ? 'passed' : run.repairs.length ? 'passed-after-correction' : 'passed-after-retry'; break; }
        if (result.outcome === 'incomplete') { run.outcome='incomplete'; break; }
        const failures = result.records.filter(record=>['failed','unexpected-pass'].includes(record.outcome));
        const decisions=[];
        for (const failure of failures) {
          if (investigations >= (options.maxInvestigations ?? 4)) { decisions.push({failureId:failure.failureId,candidateHash:candidate.hash,action:'HUMAN_REVIEW',reason:'Investigation budget exhausted'}); continue; }
          investigations++;
          let evaluation,proposal;
          try {
            if (run.evaluator === 'jev') evaluation = await providers.jev(failure);
            else if (run.evaluator === 'llm') evaluation = await providers.debug(failure,plan,executionContext);
            else evaluation = localAnalysis(failure);
            proposal = run.evaluator === 'llm' ? evaluation : options.debugger === 'openai' ? await providers.debug(failure,plan,executionContext) : proposeLocal(failure,executionContext);
            run.analyses.push({failureId:failure.failureId,evaluation,proposal});
          } catch(error) { run.analyses.push({failureId:failure.failureId,status:'unavailable',error:error.message}); }
          decisions.push(decide({failure,evaluation,proposal,context:executionContext,attempts:attempt,maxAttempts,repairs:run.repairs.length,maxRepairs,allowRepair:options.allowRepair || options.demo==='repair',existing:!!options.existingConfig}));
        }
        run.decisions.push(...decisions);
        if (!decisions.length || decisions.some(decision=>!['RETRY','DEBUG_SELECTOR'].includes(decision.action))) { run.outcome='needs-human-review'; break; }
        const patches = [...new Map(decisions.filter(d=>d.patch).map(d=>[d.patch.locatorId,d.patch])).values()];
        if (run.repairs.length + patches.length > maxRepairs) {run.outcome='needs-human-review';run.error='Correction budget exhausted';break;}
        for (const patch of patches) { executionContext.locators[patch.locatorId]=patch.after;run.repairs.push({attempt,...patch}); }
        writeJSON(path.join(directory,`corrections-after-${attempt}.json`),patches);
      }
    }
  } catch(error) { run.error=redact(error.message,context?.secretNames);run.outcome=controller.signal.aborted?'cancelled':run.attempts.length?'incomplete':'blocked'; }
  finally {
    clearTimeout(deadline);
    if(app) await app.stop();
    if(demoServer) { demoServer.closeAllConnections(); await new Promise(resolve=>demoServer.close(resolve)); }
    process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);
    run.providerCalls=providers?.calls || [];run.durationMs=Date.now()-started;
    if(run.discovery?.ai && run.discovery.scenarios) {
      const records=run.attempts.at(-1)?.records || [];
      run.coverage={discoveredStates:run.discovery.pages.length,distinctURLs:new Set(run.discovery.pages.map(page=>page.url)).size,
        generatedScenarios:run.discovery.scenarios?.length || 0,executedTests:records.filter(record=>!['notrun','skipped'].includes(record.outcome)).length,
        passedTests:records.filter(record=>record.outcome==='passed').length,unvisited:run.discovery.unvisited.length,skippedActions:run.discovery.skipped.length,
        discoveryComplete:run.discovery.completed,aiStatus:run.discovery.ai.status,
        pages:run.discovery.pages.map(page=>({id:page.id,url:page.url,title:page.title,screenshot:page.screenshot,
          generated:run.discovery.scenarios.filter(scenario=>scenario.page===page.id).length,
          results:records.filter(record=>record.title.includes(`${page.id}:`)).map(record=>({title:record.title,browser:record.browser,outcome:record.outcome}))}))};
      if(run.outcome==='passed' && (!run.discovery.completed || run.discovery.ai.status!=='completed')) run.outcome='partial';
    }
    run.report=report(run,directory,context?.secretNames || []);
    for(const [key,value] of Object.entries(oldDemo)) {if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
  console.log(`Outcome: ${run.outcome}\nReport: ${run.report}`);
  return {run,directory,exitCode:['passed','planned'].includes(run.outcome)?0:['blocked','incomplete','cancelled','partial'].includes(run.outcome)?2:1};
}
module.exports={runAgent};
