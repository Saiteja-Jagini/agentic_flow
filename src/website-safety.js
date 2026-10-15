const dangerous = /(?:^|[^a-z])(logout|sign[-_ ]?out|log[-_ ]?out|delete|destroy|remove|purchase|buy|pay|payment|checkout|subscribe|unsubscribe|transfer|refund|terminate|revoke|publish|invite|send|save|create|upload)(?:[^a-z]|$)/i;
function safeURL(value, baseURL) {
  try {
    const url = new URL(value, baseURL), base = new URL(baseURL);
    if (!['http:','https:'].includes(url.protocol) || url.origin !== base.origin || url.username || url.password) return null;
    if (dangerous.test(decodeURIComponent(url.pathname+url.search+url.hash)) || /\.(pdf|zip|exe|dmg|apk|csv|xlsx?|docx?|png|jpe?g|gif|svg|mp4|webm)$/i.test(url.pathname)) return null;
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    if ([...url.searchParams.keys()].some(key => /token|secret|password|session|auth|code/i.test(key))) return null;
    if (url.hash && !/^#!?\//.test(url.hash)) url.hash = '';
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}
function pathOf(url) { const parsed = new URL(url); return parsed.pathname + parsed.search + parsed.hash; }
function controlPolicy(element) {
  if (dangerous.test(element.name || '') || dangerous.test(element.href || '')) return { actions:['expectVisible','expectText','expectEnabled'], explore:false, reason:'Consequential or session-ending action' };
  if (element.tag === 'a' && element.href) return { actions:['click','expectVisible','expectText'], explore:false };
  if (['input','textarea'].includes(element.tag)) {
    if (['password','file','hidden','submit','button','date','datetime-local','time','month','week','color','range'].includes(element.type)) return { actions:['expectVisible','expectEnabled'], explore:false, reason:'Sensitive field or unsupported input' };
    if (['checkbox','radio'].includes(element.type)) return { actions:['check','expectChecked','expectVisible'], explore:false };
    return { actions:['fill','expectValue','expectVisible','expectEnabled',...(element.search ? ['press'] : [])], explore:false };
  }
  if (element.tag === 'select') return { actions:['select','expectValue','expectVisible'], explore:false };
  const navigation = element.role === 'tab' || element.role === 'link' || element.expanded !== null || element.controls || /^(menu|open menu|navigation|more|show|hide|expand|collapse|close|next|previous|back|view|browse|filter|sort|search|home|dashboard|products?|reports?|settings|profile|help|about)\b/i.test(element.name || '');
  if ((element.tag === 'button' || ['button','tab','link'].includes(element.role)) && navigation && (!element.submit || element.search)) return { actions:['click','expectVisible','expectText','expectEnabled'], explore:true };
  return { actions:['expectVisible','expectText','expectEnabled'], explore:false, reason:element.submit?'Form submission requires application-specific test data and expected results':element.tag==='button' || element.role==='button'?'Control has no recognized safe interaction':undefined };
}
function readOnlyRequest(request, baseURL, authenticating = false) {
  const url = new URL(request.url());
  const method = request.method();
  if (request.isNavigationRequest() && !safeURL(request.url(), baseURL)) return false;
  if (['GET','HEAD','OPTIONS'].includes(method)) return true;
  if (url.origin !== new URL(baseURL).origin) return false;
  if (authenticating) return true;
  if (method === 'POST' && /graphql/i.test(url.pathname)) {
    try { const query = JSON.parse(request.postData() || '{}').query; return typeof query === 'string' && /^\s*(?:query\b|\{)/.test(query) && !/\bmutation\b/.test(query); } catch { return false; }
  }
  return false;
}
module.exports = { safeURL, pathOf, controlPolicy, readOnlyRequest };
