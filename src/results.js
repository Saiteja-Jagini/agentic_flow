const fs = require('node:fs');
const path = require('node:path');
const { hash, redact } = require('./util');
function parseResults(raw, { runId, attempt, candidateHash, directory, exitCode, names = [] }) {
  if (!raw || !Array.isArray(raw.suites)) throw new Error('Malformed Playwright report: missing suites');
  const records = [];
  function visit(suites, parents = []) {
    for (const suite of suites) {
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const identity = `${spec.file}:${spec.line}:${[...parents, suite.title, spec.title].join('/')}:${test.projectName || 'default'}`;
          for (const result of test.results || []) {
            const artifacts = (result.attachments || []).map(attachment => {
              const artifact = { name: attachment.name, contentType: attachment.contentType, path: attachment.path || null, available: !!attachment.body || !!attachment.path && fs.existsSync(attachment.path) };
              return artifact;
            });
            const evidenceAttachment = (result.attachments || []).find(attachment => attachment.name === 'agent-evidence');
            let evidence = null;
            try {
              if (evidenceAttachment?.body) evidence = JSON.parse(Buffer.from(evidenceAttachment.body, 'base64').toString('utf8'));
              else if (evidenceAttachment?.path) evidence = JSON.parse(fs.readFileSync(evidenceAttachment.path, 'utf8'));
            } catch { /* Invalid or absent evidence stays explicit. */ }
            const errors = (result.errors?.length ? result.errors : result.error ? [result.error] : []).map(error => ({ message: error.message || error.value || '', stack: error.stack || null }));
            let outcome = result.status === 'passed' ? 'passed' : result.status === 'skipped' ? 'skipped' : ['interrupted'].includes(result.status) ? 'incomplete' : 'failed';
            if (test.expectedStatus === 'failed' && result.status === 'failed') outcome = 'expected-failure';
            if (test.expectedStatus === 'failed' && result.status === 'passed') outcome = 'unexpected-pass';
            records.push(redact({ schemaVersion: 1, runId, testId: hash(identity).slice(0,16),
              failureId: hash(`${runId}:${attempt}:${identity}:${result.retry}`).slice(0,24), candidateHash,
              title: [...parents, spec.title].filter(Boolean).join(' > '), file: spec.file, line: spec.line,
              browser: test.projectName || 'default', expectedStatus: test.expectedStatus, status: result.status, outcome,
              runnerRetry: result.retry || 0, agentAttempt: attempt, durationMs: result.duration, startedAt: result.startTime,
              errors, artifacts, missingArtifacts: ['screenshot','trace','video','agent-evidence'].filter(name => !(result.attachments || []).some(a => a.name === name)),
              evidence, url: evidence?.url || null, log: path.join(directory, 'runner.log') }, names));
          }
          if (!(test.results || []).length) records.push({ runId, candidateHash, title: spec.title, testId: hash(identity).slice(0,16), browser: test.projectName || 'default', agentAttempt: attempt, outcome: 'incomplete', status: 'not-run', artifacts: [], errors: [], evidence: null });
        }
      }
      visit(suite.suites || [], [...parents, suite.title].filter(Boolean));
    }
  }
  visit(raw.suites);
  const errors = redact(raw.errors || [], names);
  const passed = exitCode === 0 && records.length > 0 && errors.length === 0 && records.every(record => record.outcome === 'passed');
  return { attempt, candidateHash, exitCode, outcome: passed ? 'passed' : records.some(record => ['failed','unexpected-pass'].includes(record.outcome)) ? 'failed' : 'incomplete', records, errors, stats: raw.stats || null };
}
module.exports = { parseResults };
