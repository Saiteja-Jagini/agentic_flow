async function snapshotPage(page) {
  return page.evaluate(() => {
    const text = value => (value || '').replace(/\s+/g,' ').trim();
    const visible = element => !!element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    const selector = element => {
      if (element.id && document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1) return `#${CSS.escape(element.id)}`;
      const testId = element.getAttribute('data-testid');
      if (testId && document.querySelectorAll(`[data-testid=${JSON.stringify(testId)}]`).length === 1) return `[data-testid=${JSON.stringify(testId)}]`;
      const parts=[];
      while (element && element.tagName !== 'BODY') {
        const tag=element.tagName.toLowerCase(),siblings=[...(element.parentElement?.children || [])].filter(sibling=>sibling.tagName===element.tagName);
        parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(element)+1})`);element=element.parentElement;
      }
      return `body${parts.length?' > '+parts.join(' > '):''}`;
    };
    const elements = [...document.querySelectorAll('a,button,input,textarea,select,[role],h1,h2,h3,summary')].filter(visible).slice(0,100).map(element => {
      const tag=element.tagName.toLowerCase(),type=element.type || '';
      const name=text(element.getAttribute('aria-label') || (element.getAttribute('aria-labelledby') || '').split(' ').map(id=>document.getElementById(id)?.textContent || '').join(' ') || (element.labels ? [...element.labels].map(label=>label.textContent).join(' ') : '') || (tag==='input'?element.getAttribute('placeholder'):element.textContent)).slice(0,150);
      const form=element.form || element.closest('form');
      const search=type==='search' || !!form && ((form.method || 'get').toLowerCase()==='get') && /search|query|filter/i.test(`${form.getAttribute('action') || ''} ${form.getAttribute('role') || ''} ${name} ${element.name || ''}`);
      const role=element.getAttribute('role') || ({a:'link',button:'button',select:'combobox',textarea:'textbox',h1:'heading',h2:'heading',h3:'heading',summary:'button'}[tag]) || (['checkbox','radio'].includes(type)?type:'textbox');
      return {tag,type,name,role,selector:selector(element),href:tag==='a'?element.getAttribute('href'):null,
        submit:!!form && (tag==='button' && type!=='button' && type!=='reset' || tag==='input' && type==='submit'),
        search,expanded:element.getAttribute('aria-expanded'),controls:element.getAttribute('aria-controls'),
        required:!!element.required,disabled:!!element.disabled,options:tag==='select'?[...element.options].map(option=>({value:option.value,label:text(option.label)})).slice(0,15):[]};
    });
    return {title:document.title.slice(0,150),text:text(document.body?.innerText).slice(0,2000),elements,
      links:[...document.querySelectorAll('a[href]')].map(a=>({href:a.getAttribute('href'),name:text(a.textContent).slice(0,100)})).slice(0,250),
      forms:[...document.forms].map(form=>({action:form.getAttribute('action') || location.pathname,method:form.method || 'get',fields:form.elements.length})).slice(0,30)};
  });
}
module.exports = { snapshotPage };
