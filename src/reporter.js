const fs = require('node:fs');
const path = require('node:path');
const { writeJSON, redact } = require('./util');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function report(run, directory, names = []) {
  const clean = redact(run, names);
  writeJSON(path.join(directory, 'summary.json'), clean);
  const lines = [`# Test run ${clean.runId}`, '', `**Outcome: ${clean.outcome}**`, '', `Requirement: ${clean.requirement}`, '',
    `Planner: ${clean.planner}. Evaluator: ${clean.evaluator}.`,
    `Duration: ${clean.durationMs} ms. Suite attempts: ${clean.attempts.length}. Repairs: ${clean.repairs.length}. Provider calls: ${clean.providerCalls?.length || 0}.`, ''];
  if (clean.error) lines.push(`Reason: ${clean.error}`, '');
  let coverageHTML='';
  if(clean.coverage) {
    const c=clean.coverage,d=clean.discovery;
    lines.push('## Website coverage','',`${c.distinctURLs} URLs / ${c.discoveredStates} states discovered; ${c.generatedScenarios} scenarios generated; ${c.executedTests} tests executed; ${c.passedTests} passed.`,
      `Login: ${d.auth.status}. AI planning: ${c.aiStatus}. Unvisited: ${c.unvisited}. Excluded controls/links: ${c.skippedActions}.`,'',...d.limitations.map(item=>`- ${item}`),'');
    for(const page of c.pages) lines.push(`- ${page.id}: ${page.url} — ${page.generated} scenarios; ${page.results.map(result=>result.outcome).join(', ') || 'not executed'}`);
    lines.push('','### Coverage gaps','');
    if(d.auth.reason) lines.push(`- Authentication: ${d.auth.reason}`);
    if(d.auth.screenshot) lines.push(`- [Authentication screenshot](${d.auth.screenshot})`);
    for(const error of d.auth.errors || []) lines.push(`- Authentication evidence: ${error.url || ''} ${error.status || error.error || ''} ${error.code || ''} ${error.message || ''}`);
    for(const item of [...d.errors,...d.unvisited,...d.ai.errors]) lines.push(`- ${item.url || item.page || ''}: ${item.reason}`);
    if(d.ai.pagesWithoutAI.length) lines.push(`- States without AI planning (baseline tests still generated): ${d.ai.pagesWithoutAI.join(', ')}`);
    coverageHTML=`<h2>Website coverage</h2><p>${c.distinctURLs} URLs · ${c.discoveredStates} states · ${c.generatedScenarios} scenarios · ${c.passedTests}/${c.executedTests} executed tests passed</p><p>Login: ${escape(d.auth.status)} · AI: ${escape(c.aiStatus)} · ${c.unvisited} unvisited · ${c.skippedActions} excluded controls/links</p><p>${escape(d.limitations.join(' '))}</p><table><thead><tr><th>Page/state</th><th>URL</th><th>Tests</th><th>Evidence</th></tr></thead><tbody>${c.pages.map(page=>`<tr><td>${escape(page.id)}: ${escape(page.title)}</td><td>${escape(page.url)}</td><td>${page.results.length?escape(page.results.map(result=>result.outcome).join(', ')):'Not executed'}</td><td><a href="${escape(page.screenshot)}">Screenshot</a></td></tr>`).join('')}</tbody></table><p><a href="discovery.json">Discovery map, excluded actions and coverage gaps</a></p>`;
  }
  const rows = [];
  for (const attempt of clean.attempts) {
    lines.push(`## Attempt ${attempt.attempt} — ${attempt.outcome}`, '', `Candidate: ${attempt.candidateHash}; runner exit: ${attempt.exitCode}`, '');
    for (const record of attempt.records) {
      const artifacts = record.artifacts.filter(a => a.path && a.available).map(a => ({ ...a, link: path.relative(directory, a.path).split(path.sep).map(encodeURIComponent).join('/') }));
      lines.push(`- ${record.outcome}: ${record.title} (${record.browser})`);
      for (const error of record.errors || []) lines.push(`  - Error: ${error.message.split('\n')[0]}`);
      for (const artifact of artifacts) lines.push(`  - [${artifact.name}](${artifact.link})`);
      const errorDetails = (record.errors || []).length ? `<details><summary>Failure details</summary><pre>${escape(record.errors.map(e=>e.message).join('\n'))}</pre></details>` : '';
      rows.push(`<tr><td>${attempt.attempt}</td><td>${escape(record.title)}${errorDetails}</td><td>${escape(record.browser)}</td><td>${escape(record.outcome)}</td><td>${artifacts.map(a => `<a href="${escape(a.link)}">${escape(a.name)}</a>`).join(' · ')}</td></tr>`);
    }
    for (const error of attempt.errors) lines.push(`- Runner error: ${error.message || JSON.stringify(error)}`);
    lines.push('');
  }
  lines.push('## Decisions', '');
  for (const decision of clean.decisions) lines.push(`- ${decision.action}: ${decision.reason} (${decision.failureId})`);
  lines.push('', 'All attempts remain in this directory. Provider analyses are hypotheses. Raw browser evidence may contain test data.', '');
  const markdown = lines.join('\n');
  fs.writeFileSync(path.join(directory, 'summary.md'), markdown);
  fs.writeFileSync(path.join(directory, 'pr-summary.md'), markdown);
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Test report</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 24px;color:#202b3a}h1{font-size:28px}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #dae1e8;padding:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f5f8;padding:16px}a{color:#1755a6}.status{font-weight:700;font-size:22px}summary{cursor:pointer;margin:12px 0}li{margin:12px 0}.table{overflow-x:auto}</style><h1>Browser testing report</h1><p class="status">${escape(clean.outcome.replaceAll('-',' '))}</p><p>${escape(clean.requirement)}</p><p>${clean.attempts.length} attempts · ${clean.repairs.length} repairs · ${clean.providerCalls?.length || 0} provider calls</p>${clean.error?`<pre>${escape(clean.error)}</pre>`:''}<div class="table"><table><thead><tr><th>Attempt</th><th>Scenario</th><th>Browser</th><th>Outcome</th><th>Evidence</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>${clean.decisions.length?`<h2>Decisions</h2><ul>${clean.decisions.map(d=>`<li><strong>${escape(d.action)}</strong>: ${escape(d.reason)}</li>`).join('')}</ul>`:''}<details><summary>Complete run details</summary><pre>${escape(markdown)}</pre></details><p><a href="summary.json">Structured report</a> · <a href="summary.md">Markdown report</a></p></html>`;
  fs.writeFileSync(path.join(directory, 'report.html'), html.replace('<div class="table">',coverageHTML+'<div class="table">'));
  if (!['passed','planned'].includes(clean.outcome)) {
    const name = clean.decisions.some(d => d.action === 'APPLICATION_BUG') ? 'suspected-bug.md' : 'human-review.md';
    fs.writeFileSync(path.join(directory, name), `${markdown}\n## Reproduction\n\nUse the saved plan.json and context.json with the same test environment. Each candidate directory contains the executed source. Review failed assertions and attached evidence before concluding the application is defective.\n`);
  }
  return path.join(directory, 'report.html');
}
module.exports = { report, escape };
