const { assertSchema } = require('./contracts');
function localAnalysis(failure) {
  const text = failure.errors.map(error => error.message).join('\n');
  const evidence = failure.evidence;
  let category = 'UNKNOWN';
  if (/Executable doesn't exist|browserType.launch|ERR_CONNECTION_REFUSED|ECONNREFUSED/.test(text)) category = 'ENVIRONMENT';
  else if (/Missing test data/.test(text)) category = 'TEST_DATA';
  else if (evidence?.network?.some(item => [401,403].includes(item.status))) category = 'AUTHENTICATION';
  else if (evidence?.network?.some(item => item.status >= 500 || item.error)) category = 'NETWORK';
  else if (/element\(s\) not found|waiting for.*locator|waiting for getBy|strict mode violation/s.test(text)) category = 'SELECTOR';
  else if (/expect\(|Expected:|toHaveURL|toHaveText/.test(text)) category = 'ASSERTION';
  else if (/Timeout|timeout|timed out/i.test(text)) category = 'TIMEOUT';
  return { failureId: failure.failureId, candidateHash: failure.candidateHash, category,
    retry: !!evidence?.network?.some(item => [429,502,503,504].includes(item.status)), reason: `Conservative local rule from observed evidence (${category}); root cause is unproven`, elementIndex: null, applicationBug: false };
}
function proposeLocal(failure, context) {
  const analysis = localAnalysis(failure);
  const descriptor = context.locators[failure.evidence?.step?.locator];
  if (analysis.category === 'SELECTOR' && descriptor?.intent && descriptor?.role) {
    const matches = (failure.evidence?.elements || []).filter(element => element.visible && element.role === descriptor.role && element.name === descriptor.intent);
    if (matches.length === 1) analysis.elementIndex = matches[0].index;
  }
  return analysis;
}
function decide({ failure, evaluation, proposal, context, attempts, maxAttempts, repairs, maxRepairs, allowRepair, existing = false }) {
  const result = (action, reason, patch = null) => ({ schemaVersion: 1, policyVersion: '1', failureId: failure.failureId, candidateHash: failure.candidateHash, action, reason, patch });
  if (!evaluation || !proposal) return result('HUMAN_REVIEW', 'Analysis unavailable');
  try { assertSchema('analysis', proposal); } catch { return result('HUMAN_REVIEW', 'Malformed debugging proposal'); }
  if ([evaluation, proposal].some(value => value.failureId !== failure.failureId || value.candidateHash !== failure.candidateHash)) return result('HUMAN_REVIEW', 'Analysis refers to a stale failure or candidate');
  if (evaluation.category !== proposal.category) return result('HUMAN_REVIEW', 'Evaluator and debugger disagree');
  if (evaluation.confidence !== undefined && evaluation.confidence < 0.65) return result('HUMAN_REVIEW', 'Evaluation confidence below policy threshold');
  if (evaluation.category === 'ENVIRONMENT') return result('CHECK_ENVIRONMENT', 'Inspect startup, readiness, and browser installation');
  if (attempts >= maxAttempts) return result('HUMAN_REVIEW', 'Execution budget exhausted');
  if (evaluation.category === 'SELECTOR') {
    if (!allowRepair || existing || repairs >= maxRepairs) return result('HUMAN_REVIEW', 'Selector correction is disabled or the correction budget is exhausted');
    const locatorId = failure.evidence?.step?.locator;
    const before = context.locators[locatorId];
    const element = failure.evidence?.elements?.find(item => item.index === proposal.elementIndex);
    if (!before?.intent || !before.role || !element?.visible || element.name !== before.intent || element.role !== before.role) return result('HUMAN_REVIEW', 'No observed control matches the original locator intent and role');
    if (failure.evidence.elements.filter(item => item.visible && item.role === element.role && item.name === element.name).length !== 1) return result('HUMAN_REVIEW', 'Replacement control is ambiguous');
    const after = { ...before, kind: 'role', value: element.name, role: element.role };
    if (JSON.stringify(before) === JSON.stringify(after)) return result('HUMAN_REVIEW', 'Proposed correction does not change the locator');
    return result('DEBUG_SELECTOR', 'One observed element matches the original intent; only its locator may change', { locatorId, before, after });
  }
  const transient = failure.evidence?.network?.some(item => [429,502,503,504].includes(item.status));
  if (evaluation.retry && proposal.retry && transient && evaluation.category === 'NETWORK') return result('RETRY', 'Observed transient HTTP error and both analyses support a bounded retry');
  if (evaluation.category === 'NETWORK') return result('INVESTIGATE_NETWORK', 'Network failure lacks sufficient evidence for retry');
  if (evaluation.category === 'ASSERTION' && proposal.applicationBug && failure.evidence?.snapshot) return result('APPLICATION_BUG', 'Observed assertion mismatch; create a suspected bug report for human confirmation');
  return result('HUMAN_REVIEW', 'No supported automatic action; preserve the requirement and evidence');
}
module.exports = { localAnalysis, proposeLocal, decide };
