const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validatePlan,validateContext,categories,sameOriginPath}=require('../src/contracts');
const {demoContext,loginPlan}=require('../src/templates');
const {parseJev,Providers,postJSON,failurePayload}=require('../src/providers');
const {parseResults}=require('../src/results');
const {localAnalysis,proposeLocal,decide}=require('../src/policy');
const {redact}=require('../src/util');
const {escape}=require('../src/reporter');
const {childEnvironment}=require('../src/processes');
const {generate}=require('../src/generator');
const fs=require('node:fs');
const path=require('node:path');
const {root}=require('../src/util');
const context=demoContext();
const failure={failureId:'failure-1',candidateHash:'hash-1',errors:[{message:"Timeout waiting for locator('#old-login')"}],evidence:{step:{action:'click',locator:'submit'},elements:[{index:0,name:'Login',role:'button',visible:true}],network:[]}};
function policy(overrides={}) {
  const ctx=structuredClone(context);ctx.locators.submit={kind:'css',value:'#old-login',intent:'Login',role:'button'};
  return decide({failure,evaluation:localAnalysis(failure),proposal:proposeLocal(failure,ctx),context:ctx,attempts:1,maxAttempts:3,repairs:0,maxRepairs:1,allowRepair:true,...overrides});
}
function jevResponse() {
  return {model:'jev-test',answers:{category:{type:'choice',choice:'SELECTOR',confidence:0.95,probabilities:Object.fromEntries(categories.map(c=>[c,c==='SELECTOR'?1:0]))},retry:{type:'noul',noul:0.05}},usage:{input_tokens:1,output_tokens:1}};
}
test('valid login plan has positive and negative assertions',()=>{assert.equal(validatePlan(loginPlan(context),validateContext(context)).scenarios.length,2);});
test('generated tests show Playwright actions and assertions without credential values',()=>{
  const directory=path.join(root,'runs',`readable-generator-${process.pid}`);
  const source=fs.readFileSync(generate(loginPlan(context),context,directory).file,'utf8');
  assert.match(source,/const \{ test, expect \} = require\('@playwright\/test'\)/);
  assert.match(source,/test\.describe\(/);
  assert.match(source,/await page\.goto\("\/login"\)/);
  assert.match(source,/await page\.getByLabel\("Email", \{ exact: true \}\)\.fill\(value\)/);
  assert.match(source,/await expect\(page\)\.toHaveURL\(/);
  assert.doesNotMatch(source,/executeScenario\(/);
  assert.doesNotMatch(source,/demo-only-password/);
});
test('reject arbitrary actions, extra properties, external routes and unknown secrets',()=>{
  for(const modify of [p=>p.scenarios[0].steps[0].action='eval',p=>p.code='process.exit()',p=>p.scenarios[0].steps[0].value='https://evil.test',p=>p.scenarios[0].steps[1].secret='OPENAI_API_KEY',p=>p.scenarios[0].steps[1].value='literal-password']) {
    const plan=loginPlan(context);modify(plan);assert.throws(()=>validatePlan(plan,context));
  }
  for(const value of ['//evil.test','/\\evil.test','javascript:alert(1)'])assert.throws(()=>sameOriginPath(value,context.baseURL));
});
test('reject missing behavior, removed assertions, and invented expected text',()=>{
  const plan=loginPlan(context);plan.missingInformation=['Expected success route'];assert.throws(()=>validatePlan(plan,context));
  plan.missingInformation=[];plan.scenarios[0].steps.pop();assert.throws(()=>validatePlan(plan,context));
  const other=loginPlan(context);other.scenarios[1].steps.at(-1).value='Anything';assert.throws(()=>validatePlan(other,context));
});
test('Jev parses typed choice and separate retry probability, rejects malformed responses',()=>{
  assert.equal(parseJev(jevResponse(),failure).category,'SELECTOR');
  for(const modify of [r=>r.answers.retry.noul=2,r=>r.answers.category.choice='EXECUTE',r=>delete r.answers.category.probabilities.UNKNOWN,r=>r.answers.category.confidence='high',r=>delete r.answers.retry]) {
    const response=jevResponse();modify(response);assert.throws(()=>parseJev(response,failure));
  }
});
test('selector correction only changes the observed matching locator',()=>{
  const decision=policy();assert.equal(decision.action,'DEBUG_SELECTOR');assert.deepEqual(decision.patch.after,{kind:'role',value:'Login',intent:'Login',role:'button'});
  assert.equal(policy({allowRepair:false}).action,'HUMAN_REVIEW');
  assert.equal(policy({existing:true}).action,'HUMAN_REVIEW');
  assert.equal(policy({repairs:1}).action,'HUMAN_REVIEW');
  assert.equal(policy({attempts:3}).action,'HUMAN_REVIEW');
});
test('stale, conflicting, missing, or malformed analysis cannot rerun tests',()=>{
  const evaluation={...localAnalysis(failure),candidateHash:'stale'};
  assert.equal(policy({evaluation}).action,'HUMAN_REVIEW');
  assert.equal(policy({evaluation:{...localAnalysis(failure),category:'ASSERTION'}}).action,'HUMAN_REVIEW');
  assert.equal(policy({evaluation:null}).action,'HUMAN_REVIEW');
  assert.equal(policy({proposal:{action:'RETRY'}}).action,'HUMAN_REVIEW');
  assert.equal(policy({proposal:{...proposeLocal(failure,context),elementIndex:33}}).action,'HUMAN_REVIEW');
});
test('timeouts do not cause retry; transient HTTP evidence can',()=>{
  const network={...failure,errors:[{message:'expect(page).toHaveURL failed'}],evidence:{network:[{status:503}]}};
  const analysis=localAnalysis(network);
  assert.equal(policy({failure:network,evaluation:analysis,proposal:analysis}).action,'RETRY');
  const timeout={...failure,errors:[{message:'Operation timed out'}],evidence:null};
  assert.equal(policy({failure:timeout,evaluation:localAnalysis(timeout),proposal:localAnalysis(timeout)}).action,'HUMAN_REVIEW');
});
test('suspected bug reports require an assertion mismatch and captured page evidence',()=>{
  const assertion={...failure,errors:[{message:'expect(locator).toHaveText failed'}],evidence:{snapshot:'Observed incorrect message',network:[]}};
  const evaluation=localAnalysis(assertion),proposal={...evaluation,applicationBug:true};
  assert.equal(policy({failure:assertion,evaluation,proposal}).action,'APPLICATION_BUG');
  assert.equal(policy({failure:{...assertion,evidence:null},evaluation,proposal}).action,'HUMAN_REVIEW');
});
test('parser retains browsers, retries, expected failures, interrupted and missing evidence',()=>{
  const raw={suites:[{title:'suite',specs:[{title:'case',file:'case.js',line:1,tests:[
    {projectName:'chromium',expectedStatus:'passed',results:[{status:'failed',retry:0,errors:[{message:'first'}]},{status:'passed',retry:1}]},
    {projectName:'firefox',expectedStatus:'failed',results:[{status:'failed',retry:0}]},
    {projectName:'webkit',expectedStatus:'passed',results:[{status:'interrupted',retry:0}]}
  ]}]}]};
  const parsed=parseResults(raw,{runId:'run',attempt:1,candidateHash:'h',directory:'.',exitCode:0});
  assert.equal(parsed.records.length,4);assert.equal(parsed.outcome,'failed');
  assert.equal(parsed.records[1].runnerRetry,1);assert.equal(parsed.records[2].outcome,'expected-failure');assert.equal(parsed.records[3].outcome,'incomplete');
  assert.notEqual(parsed.records[0].testId,parsed.records[2].testId);assert.equal(parsed.records[0].evidence,null);
  assert.throws(()=>parseResults({},{runId:'run'}));
});
test('provider requests omit local artifact paths and redact credentials',()=>{
  process.env.TEST_SECRET='unique-test-secret';
  try {
    assert.equal(redact('prefix unique-test-secret suffix'),'prefix [REDACTED] suffix');
    assert.equal(failurePayload({...failure,log:'C:/private/file',artifacts:[{path:'private'}]}).log,undefined);
    assert.equal(escape('<script>'), '&lt;script&gt;');
  }finally{delete process.env.TEST_SECRET;}
});
test('only named credential variables reach a trusted test process',()=>{
  const previous=process.env.ARDBERG_SAMPLE_PASSWORD;
  process.env.ARDBERG_SAMPLE_PASSWORD='fixture-secret';
  try {
    assert.equal(childEnvironment([]).ARDBERG_SAMPLE_PASSWORD,undefined);
    assert.equal(childEnvironment(['ARDBERG_SAMPLE_PASSWORD']).ARDBERG_SAMPLE_PASSWORD,'fixture-secret');
  } finally {
    if(previous===undefined) delete process.env.ARDBERG_SAMPLE_PASSWORD;
    else process.env.ARDBERG_SAMPLE_PASSWORD=previous;
  }
});
test('provider HTTP errors and timeout aborts fail without retry',async()=>{
  let calls=0;
  await assert.rejects(()=>postJSON('https://example.test','fake',{}, {fetchImpl:async()=>{calls++;return new Response('{}',{status:429});}}),/429/);
  assert.equal(calls,1);
  await assert.rejects(()=>postJSON('https://example.test','fake',{}, {timeoutMs:20,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('timeout')));setTimeout(()=>resolve(new Response('{}')),60);})}),/timeout/);
});
test('OpenAI structured plan is parsed, provider calls bounded, refusals rejected',async()=>{
  const original={key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL};
  process.env.OPENAI_API_KEY='unit-test-key';process.env.OPENAI_MODEL='unit-test-model';
  try {
    const provider=new Providers({maxCalls:1,fetchImpl:async(url,request)=>{
      const body=JSON.parse(request.body);assert.equal(body.text.format.type,'json_schema');assert.equal(body.store,false);
      return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(loginPlan(context))}]}]}));
    }});
    assert.equal((await provider.plan('login',context,[])).scenarios.length,2);
    await assert.rejects(()=>provider.plan('again',context,[]),/budget/);
    const refused=new Providers({fetchImpl:async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'refusal',refusal:'no'}]}]}))});
    await assert.rejects(()=>refused.plan('login',context,[]),/refused/);
  }finally{
    if(original.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=original.key;
    if(original.model===undefined)delete process.env.OPENAI_MODEL;else process.env.OPENAI_MODEL=original.model;
  }
});
