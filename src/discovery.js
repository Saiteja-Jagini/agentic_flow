const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('@playwright/test');
const { snapshotPage } = require('./website-dom');
const { safeURL, pathOf, controlPolicy, readOnlyRequest } = require('./website-safety');
const { writeJSON, redact } = require('./util');

const step = (action, locator = null, value = null) => ({ action, locator, value, secret:null });
async function settle(page) {
  await page.waitForLoadState('domcontentloaded', {timeout:5000}).catch(()=>{});
  await page.waitForLoadState('networkidle', {timeout:1200}).catch(()=>{});
}
async function discover({baseURL, directory, signal, maxPages = 25, maxDepth = 3, maxInteractions = 30}) {
  const startURL = safeURL(baseURL, baseURL);
  if (!startURL) throw new Error('Provide a same-origin HTTP(S) website URL without sensitive query parameters');
  const names = ['TARGET_VALID_EMAIL','TARGET_VALID_PASSWORD'];
  const context = {baseURL:new URL(baseURL).origin,routes:[],locators:{},expectedTexts:[],secretNames:names,
    discovered:true,testData:['test','test@example.test','123',''],storageStateFile:path.join(directory,'session.json'),sessionStorageFile:path.join(directory,'session-storage.json')};
  const inventory = {baseURL:startURL,auth:{status:'not-configured'},pages:[],edges:[],skipped:[],errors:[],unvisited:[],limits:{maxPages,maxDepth,maxInteractions},limitations:[
    'Only reachable same-origin pages and observed states are covered. Hidden routes and business outcomes without specifications cannot be inferred.',
    'Payments, destructive actions, unknown submissions and non-read API requests are excluded. CAPTCHA, MFA and external SSO require a prepared session.'
  ]};
  const browser = await chromium.launch({headless:true});
  const cancel = () => { browser.close().catch(()=>{}); };
  signal?.addEventListener('abort',cancel,{once:true});
  let authenticating = false, current = null, interactions = 0;
  const queued = new Set(), queue = [], visited = new Set();
  const enqueue = (url, depth, replay = []) => {
    const normalized = safeURL(url,context.baseURL);
    if (!normalized) return;
    const key = normalized+'|'+replay.map(item=>item.locator).join(',');
    if (queued.has(key)) return;
    queued.add(key);
    const entry = {url:normalized,depth,replay};
    if (depth > maxDepth) inventory.unvisited.push({...entry,reason:'Depth limit'});
    else queue.push(entry);
  };
  try {
    const browserContext = await browser.newContext({serviceWorkers:'block'});
    await browserContext.route('**/*',route=>{
      if (readOnlyRequest(route.request(),context.baseURL,authenticating)) return route.continue();
      const item = {url:route.request().url(),method:route.request().method(),reason:'Request outside read-only discovery scope'};
      (current?.blockedRequests || inventory.skipped).push(item);
      return route.abort('blockedbyclient');
    });
    const page = await browserContext.newPage();
    page.setDefaultTimeout(4000); page.setDefaultNavigationTimeout(10000);
    const authErrors=[];
    page.on('pageerror',error=>{current?.pageErrors.push(error.message);if(authenticating)authErrors.push({error:error.message});});
    page.on('response',async response=>{
      if(response.status()<400) return;
      const evidence={url:response.url(),status:response.status()};current?.httpErrors.push(evidence);
      if(authenticating) {
        authErrors.push(evidence);
        try {
          const body=await response.json();
          for(const key of ['code','message']) {const value=body?.[key] || body?.error?.[key];if(typeof value==='string')evidence[key]=redact(value.slice(0,300),names);}
        } catch { /* Non-JSON authentication error; retain HTTP status. */ }
      }
    });
    await page.goto(startURL); await settle(page);
    const initialSnapshot=await snapshotPage(page);
    const email = process.env.TARGET_VALID_EMAIL, password = process.env.TARGET_VALID_PASSWORD;
    if (email && password) {
      try {
        const candidates=[safeURL(process.env.TARGET_LOGIN_PATH || '/login',context.baseURL),
          ...initialSnapshot.links.filter(link=>/sign\s*in|log\s*in/i.test(link.name+' '+link.href)).map(link=>safeURL(link.href,startURL))].filter(Boolean);
        for(const loginURL of [...new Set(candidates)].slice(0,3)) {
          if(page.url()!==loginURL) {await page.goto(loginURL);await settle(page);}
          if(await page.locator('input[type=password]:visible').count()===1) break;
        }
        const passwords = page.locator('input[type=password]:visible');
        if (await passwords.count() !== 1) throw new Error('No unique visible password field; login may use SSO/MFA or a different login path');
        const form = passwords.locator('xpath=ancestor::form');
        const scope = await form.count()===1 ? form : page.locator('body');
        let username = scope.locator('input[type=email]:visible');
        if (await username.count()!==1) username=scope.locator('input[autocomplete=username]:visible');
        if (await username.count()!==1) username=scope.locator('input[type=text]:visible, input:not([type]):visible');
        if (await username.count()!==1) throw new Error('No unique username/email field');
        await username.fill(email);await passwords.fill(password);
        let submit=scope.locator('button[type=submit]:visible,input[type=submit]:visible');
        if(await submit.count()!==1) submit=scope.getByRole('button',{name:/^(log\s*in|sign\s*in|continue)$/i});
        if(await submit.count()!==1) throw new Error('No unique login submit button');
        authenticating=true;
        await submit.click();await settle(page);
        await page.locator('input[type=password]:visible').waitFor({state:'hidden',timeout:10000}).catch(()=>{});
        authenticating=false;
        if(await page.locator('input[type=password]:visible').count()) throw new Error('Login form remains visible; credentials, MFA or login behavior need attention');
        inventory.auth={status:'authenticated',url:page.url(),verification:'Login form disappeared after submitting supplied credentials'};
        enqueue(page.url(),0);
      } catch(error) {
        authenticating=false;
        inventory.auth={status:'failed',url:page.url(),reason:redact(error.message,names),errors:redact(authErrors.slice(-10),names),screenshot:'authentication.png'};
        await page.screenshot({path:path.join(directory,'authentication.png')}).catch(()=>{});
        console.log(`Authentication failed: ${inventory.auth.reason}${authErrors.length?' — '+authErrors.map(item=>item.code || item.status || 'browser error').join(', '):''}`);
      }
    }
    await browserContext.storageState({path:context.storageStateFile,indexedDB:true});
    writeJSON(context.sessionStorageFile,{origin:new URL(page.url()).origin,values:await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage)))});
    enqueue(startURL,0);
    // Sitemaps supplement links; they never expand the target origin.
    try {
      const response=await browserContext.request.get(new URL('/sitemap.xml',context.baseURL).href,{timeout:3000,maxRedirects:0});
      if(response.ok() && /xml/i.test(response.headers()['content-type'] || '')) {
        const xml=(await response.text()).slice(0,200000);
        for(const match of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)) if(!/\.xml(?:\?|$)/i.test(match[1])) enqueue(match[1].replaceAll('&amp;','&'),1);
      }
    } catch { /* Sitemap is optional. */ }
    while(queue.length && inventory.pages.length<maxPages) {
      if(signal?.aborted) throw new Error('Discovery cancelled or time budget exhausted');
      const entry=queue.shift();
      current={id:`page${inventory.pages.length+1}`,url:entry.url,depth:entry.depth,replay:entry.replay,pageErrors:[],httpErrors:[],blockedRequests:[]};
      try {
        const response=await page.goto(entry.url);await settle(page);
        for(const action of entry.replay) {await page.locator(context.locators[action.locator].value).click();await settle(page);}
        const observed=await snapshotPage(page);
        const actualURL=safeURL(page.url(),context.baseURL);
        if(!actualURL) throw new Error('Page redirected outside discovery scope');
        const signature=crypto.createHash('sha256').update(actualURL+'|'+JSON.stringify(observed.elements.map(el=>[el.role,el.name,el.href,el.expanded]))).digest('hex');
        if(visited.has(signature)) {current=null;continue;}
        visited.add(signature);
        current.url=actualURL;current.entryURL=entry.url;current.status=response?.status() || null;
        current.title=observed.title;current.text=observed.text;current.forms=observed.forms;current.controls=[];
        current.screenshot=`discovery/${current.id}.png`;
        fs.mkdirSync(path.join(directory,'discovery'),{recursive:true});
        await page.screenshot({path:path.join(directory,current.screenshot),fullPage:false}).catch(()=>{});
        for(const url of [entry.url,actualURL]) if(!context.routes.includes(pathOf(url))) context.routes.push(pathOf(url));
        for(const element of observed.elements) {
          if(element.selector.length>500) continue;
          const policy=controlPolicy(element),id=`${current.id}_el${current.controls.length+1}`;
          if(element.href && !safeURL(element.href,actualURL)) {policy.actions=policy.actions.filter(action=>action!=='click');policy.reason='Link outside discovery scope';}
          context.locators[id]={kind:'css',value:element.selector,intent:element.name,role:element.role,route:pathOf(actualURL),allowedActions:policy.actions};
          current.controls.push({id,...element,actions:policy.actions});
          if(element.name && !context.expectedTexts.includes(element.name)) context.expectedTexts.push(element.name);
          for(const option of element.options) if(!context.testData.includes(option.value)) context.testData.push(option.value);
          if(policy.reason) inventory.skipped.push({page:current.id,control:element.name,reason:policy.reason});
          if(policy.explore && !element.disabled && entry.replay.length<3) {
            if(interactions<maxInteractions) {interactions++;enqueue(entry.url,entry.depth+1,[...entry.replay,step('click',id)]);}
            else inventory.unvisited.push({url:actualURL,control:element.name,reason:'Interaction limit'});
          }
        }
        for(const link of observed.links) {
          const href=safeURL(link.href,actualURL);
          if(href) {inventory.edges.push({from:actualURL,to:href,label:link.name});enqueue(href,entry.depth+1);}
          else inventory.skipped.push({page:current.id,control:link.name,reason:'External, consequential, download or sensitive link'});
        }
        inventory.pages.push(current);
        console.log(`Discovered ${inventory.pages.length}/${maxPages}: ${pathOf(actualURL)} (${current.controls.length} controls)`);
      } catch(error) {inventory.errors.push({url:entry.url,reason:redact(error.message,names)});}
      current=null;
    }
    inventory.unvisited.push(...queue.map(entry=>({...entry,reason:'Page/state limit'})));
    if(!inventory.pages.length) throw new Error('No pages could be discovered');
    inventory.completed=inventory.unvisited.length===0 && inventory.errors.length===0 && inventory.auth.status!=='failed';
    return {context,inventory};
  } finally {
    signal?.removeEventListener('abort',cancel);
    await browser.close();
    writeJSON(path.join(directory,'discovery.json'),redact(inventory,names));
  }
}

function baselinePlan(inventory,context) {
  const scenarios=[];
  for(const page of inventory.pages) {
    const begin=[step('goto',null,pathOf(page.entryURL)),...page.replay];
    const assertions=page.controls.filter(control=>control.tag==='h1' || control.role==='heading').slice(0,2).map(control=>step('expectVisible',control.id));
    scenarios.push({id:`${page.id}_health`,title:`${page.id}: ${pathOf(page.url)} — page health and visible content`,preconditions:['Discovered browser session'],steps:[...begin,step('expectURL',null,pathOf(page.url)),...assertions,step('expectPageHealthy')]});
    // Exercise non-submitting controls even if an AI request is unavailable.
    const fields=page.controls.filter(control=>!control.disabled && (control.actions.includes('fill') || control.actions.includes('select') || control.actions.includes('check'))).slice(0,4);
    if(fields.length) {
      const steps=[...begin];
      for(const control of fields) {
        if(control.actions.includes('fill')) {const value=control.type==='email'?'test@example.test':control.type==='number'?'123':'test';steps.push(step('fill',control.id,value),step('expectValue',control.id,value));}
        else if(control.actions.includes('select') && control.options.length) {const value=control.options[0].value;steps.push(step('select',control.id,value),step('expectValue',control.id,value));}
        else if(control.actions.includes('check')) steps.push(step('check',control.id),step('expectChecked',control.id));
      }
      steps.push(step('expectPageHealthy'));
      scenarios.push({id:`${page.id}_controls`,title:`${page.id}: ${pathOf(page.url)} — input controls`,preconditions:['No form submission'],steps});
    }
  }
  return {schemaVersion:1,requirement:'Automatically discover and test reachable website pages, navigation and safe interactions',missingInformation:[],scenarios};
}
module.exports={discover,baselinePlan,step};
