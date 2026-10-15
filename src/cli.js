const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { runAgent } = require('./agent');
const { integer } = require('./util');

const help = `Browser testing agent

  ardberg init [--url http://localhost:3000] [--config path/to/playwright.config.ts]
  ardberg run --existing-config path/to/playwright.config.ts --url http://localhost:3000 [--secret-env TEST_EMAIL,TEST_PASSWORD]
  npm run agent -- demo [--scenario working|failure|repair|transient|network|slow|missing-button|wrong-text]
  npm run agent -- plan --context examples/app.context.json --requirement "Test login"
  npm run agent -- run --context examples/app.context.json --requirement "Test login"
  npm run agent -- run --context examples/app.context.json --plan path/to/plan.json
  npm run agent -- run --context examples/app.context.json --existing-config path/to/playwright.config.js
  npm run agent -- target
  npm run agent -- website [--url http://localhost:3000]
  npm run agent -- doctor
  npm run agent -- eval --evaluator local|jev|llm|compare [--dataset examples/evaluations.json]

Options:
  --max-pages 25               Maximum discovered pages/states (1–50)
  --max-depth 3                Link/interaction depth (0–10)
  --max-interactions 30         Navigation controls to explore (0–100)
  --evaluator local|jev|llm      Failure evaluator (default local)
  --debugger local|openai       Debug proposal provider (default openai for Jev, otherwise local)
  --browser chromium,firefox,webkit  Generated-suite browser projects (default chromium)
  --allow-repair                Permit observed, intent-preserving locator corrections
  --max-attempts 3              Total suite executions, including the first (1–3)
  --max-repairs 1               Total locator corrections (0–3)
  --max-investigations 4        Failure investigations (0–20)
  --max-provider-calls 8        Total HTTP requests (0–100)
  --timeout 180                Total elapsed budget; website default 600 seconds (5–1800)
  --provider-timeout 30         Per-request timeout; website default 60 seconds (1–120)
  --readiness-timeout 15        Target readiness timeout in seconds (1–120)
  --env .env                   Environment file; existing environment values take precedence
  --secret-env NAME,NAME       Credential variables to pass to a trusted existing test suite

Exit codes: 0 clean pass/planned; 1 failed, review, or pass after retry/correction; 2 partial/blocked/incomplete/cancelled.
Reports: runs/<run-id>/report.html, summary.md, summary.json, and original attempt artifacts.
`;
async function main(argv=process.argv.slice(2)) {
  const {values,positionals}=parseArgs({args:argv,allowPositionals:true,options:{
    context:{type:'string'},requirement:{type:'string'},plan:{type:'string'},'existing-config':{type:'string'},config:{type:'string'},scenario:{type:'string'},url:{type:'string'},
    'max-pages':{type:'string'},'max-depth':{type:'string'},'max-interactions':{type:'string'},
    evaluator:{type:'string'},debugger:{type:'string'},browser:{type:'string'},'allow-repair':{type:'boolean'},
    'max-attempts':{type:'string'},'max-repairs':{type:'string'},'max-investigations':{type:'string'},'max-provider-calls':{type:'string'},'secret-env':{type:'string'},
    timeout:{type:'string'},'provider-timeout':{type:'string'},'readiness-timeout':{type:'string'},dataset:{type:'string'},env:{type:'string'},help:{type:'boolean'}
  }});
  if(values.help || !positionals.length){console.log(help);return 0;}
  if(positionals.length!==1)throw new Error('Provide exactly one command');
  const envFile=path.resolve(values.env || '.env');
  if(fs.existsSync(envFile))process.loadEnvFile(envFile);
  else if(values.env)throw new Error('Requested environment file does not exist');
  const command=positionals[0];
  if(command==='init') return require('./init').initProject({configFile:values.config,url:values.url});
  if(command==='doctor') {
    const {chromium,firefox,webkit}=require('@playwright/test');
    console.log(JSON.stringify({node:process.version,playwright:require('@playwright/test/package.json').version,browsers:Object.fromEntries(Object.entries({chromium,firefox,webkit}).map(([name,browser])=>[name,fs.existsSync(browser.executablePath())])),credentials:{OPENAI_API_KEY:!!process.env.OPENAI_API_KEY,OPENAI_MODEL:!!process.env.OPENAI_MODEL,JEV_API_KEY:!!process.env.JEV_API_KEY},contextExample:'examples/app.context.json'},null,2));
    return 0;
  }
  const evaluator=values.evaluator || (command==='website'?'local':process.env.AGENT_EVALUATOR) || 'local';
  if(!['local','jev','llm',...(command==='eval'?['compare']:[])].includes(evaluator))throw new Error('Unsupported evaluator');
  const debuggerName=values.debugger || (evaluator==='jev'?'openai':'local');
  if(!['local','openai'].includes(debuggerName))throw new Error('Unsupported debugger');
  const browsers=(values.browser || 'chromium').split(',');
  if(browsers.some(name=>!['chromium','firefox','webkit'].includes(name)) || new Set(browsers).size!==browsers.length)throw new Error('Invalid or duplicate browser names');
  const options={requirement:values.requirement,contextFile:values.context,planFile:values.plan,existingConfig:values['existing-config'],evaluator,debugger:debuggerName,browsers,allowRepair:values['allow-repair'] || false,
    maxAttempts:integer(values['max-attempts'],3,1,3),maxRepairs:integer(values['max-repairs'],1,0,3),maxInvestigations:integer(values['max-investigations'],4,0,20),maxCalls:integer(values['max-provider-calls'],command==='eval'?100:8,0,100),
    timeoutMs:integer(values.timeout,command==='website'?600:180,5,1800)*1000,providerTimeoutMs:integer(values['provider-timeout'],command==='website'?60:30,1,120)*1000,readinessTimeoutMs:integer(values['readiness-timeout'],15,1,120)*1000,dataset:values.dataset,
    url:values.url,secretNames:values['secret-env']?values['secret-env'].split(','):[],maxPages:integer(values['max-pages'],25,1,50),maxDepth:integer(values['max-depth'],3,0,10),maxInteractions:integer(values['max-interactions'],30,0,100)};
  if(command==='eval')return require('./evaluate').evaluate(options);
  if(!['demo','plan','run','target','website'].includes(command))throw new Error(`Unknown command ${command}`);
  if(command==='website' && (options.planFile || options.contextFile || options.existingConfig))throw new Error('Website mode discovers its own context and plan; use run for a saved plan');
  if(options.existingConfig && (options.planFile || command!=='run'))throw new Error('--existing-config is only supported with run and without --plan');
  if(command==='demo') {
    options.demo=values.scenario || 'working';
    if(!['working','failure','repair','transient','network','slow','missing-button','wrong-text'].includes(options.demo))throw new Error('Unsupported demo scenario');
  }
  options.website=command==='website';options.target=command==='target';options.planOnly=command==='plan';
  return (await runAgent(options)).exitCode;
}
if(require.main===module)main().then(code=>{process.exitCode=code;}).catch(error=>{console.error(error.message);process.exitCode=2;});
module.exports={main};
