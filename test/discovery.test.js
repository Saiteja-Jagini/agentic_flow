const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {websiteFixture}=require('./website-fixture');
const {runAgent}=require('../src/agent');
const {Providers}=require('../src/providers');
const {discover,baselinePlan}=require('../src/discovery');
const {validatePlan}=require('../src/contracts');
const {safeURL,readOnlyRequest}=require('../src/website-safety');
const {root}=require('../src/util');
async function withSite(t,options={}) {
  const fixture=websiteFixture(options);
  await new Promise(resolve=>fixture.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{fixture.server.closeAllConnections();fixture.server.close(resolve);}));
  return {...fixture,url:`http://127.0.0.1:${fixture.server.address().port}`};
}
function credentials(t) {
  for(const [key,value] of Object.entries({TARGET_VALID_EMAIL:'discovery@example.test',TARGET_VALID_PASSWORD:'fixture-password',TARGET_LOGIN_PATH:'/login'})) {
    const old=process.env[key];process.env[key]=value;t.after(()=>old===undefined?delete process.env[key]:process.env[key]=old);
  }
}
test('automatic discovery authenticates, explores links/sitemap/menus and runs real generated tests',async t=>{
  credentials(t);const fixture=await withSite(t);
  process.env.TARGET_LOGIN_PATH='/obsolete-login';
  t.mock.method(Providers.prototype,'openai',async(task,payload)=>({schemaVersion:1,requirement:'Observed page check',missingInformation:[],scenarios:[{id:'observed',title:'Observed control remains visible',preconditions:[],steps:[...payload.entrySteps,{action:'expectVisible',locator:payload.page.controls[0].id,value:null,secret:null}]}]}));
  const result=await runAgent({website:true,url:fixture.url,maxPages:20,maxDepth:4,maxInteractions:15,maxCalls:30,timeoutMs:180000,maxAttempts:1});
  assert.equal(result.run.error,null);
  assert.equal(result.run.outcome,'passed');
  assert.equal(result.run.discovery.auth.status,'authenticated');
  assert.ok(result.run.discovery.pages.some(page=>page.url.endsWith('/settings')));
  assert.ok(result.run.discovery.pages.some(page=>page.url.endsWith('/hidden')));
  assert.ok(result.run.discovery.pages.some(page=>page.replay.length));
  assert.ok(result.run.coverage.executedTests>8);
  assert.ok(result.run.discovery.ai.scenariosAdded>0);
  assert.equal(fixture.hits.login,1);assert.equal(fixture.hits.destructive,0);
  assert.match(fs.readFileSync(result.run.report,'utf8'),/Website coverage/);
  assert.ok(!fs.readFileSync(path.join(result.directory,'summary.json'),'utf8').includes('fixture-password'));
});
test('limited discovery and unavailable AI produce explicit partial coverage while baseline tests execute',async t=>{
  credentials(t);const fixture=await withSite(t);
  const result=await runAgent({website:true,url:fixture.url,maxPages:2,maxCalls:0,maxAttempts:1,timeoutMs:60000});
  assert.equal(result.run.outcome,'partial');assert.equal(result.exitCode,2);
  assert.equal(result.run.coverage.discoveredStates,2);assert.ok(result.run.coverage.unvisited>0);
  assert.equal(result.run.coverage.aiStatus,'partial');assert.ok(result.run.coverage.passedTests>0);
});
test('browser and HTTP errors fail discovered tests without silently passing',async t=>{
  const fixture=await withSite(t,{broken:true});
  const result=await runAgent({website:true,url:fixture.url+'/broken',maxPages:1,maxCalls:0,maxAttempts:1,timeoutMs:60000});
  assert.equal(result.run.outcome,'needs-human-review');
  assert.ok(result.run.attempts[0].records.some(record=>record.outcome==='failed'));
});
test('discovered plans reject unapproved form writes and invented literal data',async t=>{
  const fixture=await withSite(t);
  const directory=path.join(root,'runs',`discovery-contract-${Date.now()}`);fs.mkdirSync(directory,{recursive:true});
  const {context,inventory}=await discover({baseURL:fixture.url+'/settings',directory,maxPages:1});
  const plan=baselinePlan(inventory,context);validatePlan(plan,context);
  const save=inventory.pages[0].controls.find(control=>control.name==='Save');
  plan.scenarios[0].steps.push({action:'click',locator:save.id,value:null,secret:null});
  assert.throws(()=>validatePlan(plan,context),/permissions/);
  plan.scenarios[0].steps.pop();
  const field=inventory.pages[0].controls.find(control=>control.actions.includes('fill'));
  plan.scenarios[0].steps.push({action:'fill',locator:field.id,value:'unapproved',secret:null});
  assert.throws(()=>validatePlan(plan,context),/approved/);
  assert.equal(fixture.hits.destructive,0);
});
test('legacy gpt-4 uses Chat Completions and validates JSON without native structured outputs',async t=>{
  const oldModel=process.env.OPENAI_MODEL,oldKey=process.env.OPENAI_API_KEY;
  process.env.OPENAI_MODEL='gpt-4';process.env.OPENAI_API_KEY='fake-test-key';
  t.after(()=>{for(const [key,value] of Object.entries({OPENAI_MODEL:oldModel,OPENAI_API_KEY:oldKey}))if(value===undefined)delete process.env[key];else process.env[key]=value;});
  const plan={schemaVersion:1,requirement:'Observed page',missingInformation:[],scenarios:[]};
  const provider=new Providers({fetchImpl:async(url,request)=>{
    assert.equal(url,'https://api.openai.com/v1/chat/completions');
    const body=JSON.parse(request.body);assert.ok(body.messages);assert.equal(body.response_format,undefined);
    return {ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(plan)}}]})};
  }});
  assert.deepEqual(await provider.plan('test',{routes:['/']},[]),plan);
});
test('discovery bounds navigation and blocks write requests',()=>{
  const base='https://example.test';
  for(const url of ['/delete','/action?op=delete','https://other.test','/account?token=private','/logout']) assert.equal(safeURL(url,base),null);
  const request=(method,url,body)=>({method:()=>method,url:()=>base+url,isNavigationRequest:()=>false,postData:()=>body});
  assert.equal(readOnlyRequest(request('POST','/orders','{}'),base),false);
  assert.equal(readOnlyRequest(request('POST','/graphql','{"query":"query { products { id } }"}'),base),true);
  assert.equal(readOnlyRequest(request('POST','/graphql','{"query":"mutation { deleteUser }"}'),base),false);
});
