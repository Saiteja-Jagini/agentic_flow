const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true });
const string = { type: 'string' };
const nullableString = { type: ['string', 'null'] };
const list = items => ({ type: 'array', items });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const categories = ['SELECTOR', 'TIMEOUT', 'ASSERTION', 'NETWORK', 'AUTHENTICATION', 'ENVIRONMENT', 'TEST_DATA', 'UNKNOWN'];
const stepSchema = object({
  action: { type:'string', enum: ['goto', 'fill', 'click', 'press', 'select', 'check', 'expectVisible', 'expectText', 'expectURL', 'expectPageHealthy', 'expectValue', 'expectChecked', 'expectEnabled'] },
  locator: nullableString, value: nullableString, secret: nullableString
});
const planSchema = object({
  schemaVersion: { type:'integer', enum:[1] }, requirement: string, missingInformation: list(string),
  scenarios: list(object({ id: string, title: string, preconditions: list(string), steps: list(stepSchema) }))
});
const analysisSchema = object({
  failureId: string, candidateHash: string, category: { type:'string', enum: categories },
  retry: { type: 'boolean' }, reason: string,
  elementIndex: { type: ['integer', 'null'] }, applicationBug: { type: 'boolean' }
});
const validators = { plan: ajv.compile(planSchema), analysis: ajv.compile(analysisSchema) };
function assertSchema(name, data) {
  const validate = validators[name];
  if (!validate(data)) throw new Error(`Invalid ${name}: ${ajv.errorsText(validate.errors)}`);
  return data;
}
function sameOriginPath(value, baseURL) {
  const url = new URL(value, baseURL);
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || url.origin !== new URL(baseURL).origin) {
    throw new Error(`Route must be a path on the configured target origin: ${value}`);
  }
  return url.href;
}
function validateContext(context) {
  const base = new URL(context.baseURL);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('baseURL must be HTTP(S) without embedded credentials');
  if (!Array.isArray(context.routes) || !context.routes.length) throw new Error('Context needs a routes array');
  context.routes.forEach(route => sameOriginPath(route, context.baseURL));
  if (!context.locators || typeof context.locators !== 'object') throw new Error('Context needs a locator catalog');
  for (const [id, locator] of Object.entries(context.locators)) {
    if (!/^[a-zA-Z][\w-]{0,63}$/.test(id) || !['role', 'label', 'text', 'testId', 'css'].includes(locator.kind)) throw new Error(`Invalid locator: ${id}`);
    if (typeof locator.value !== 'string' || (!locator.value && locator.kind !== 'role') || locator.value.length > 500) throw new Error(`Invalid locator value: ${id}`);
    if (locator.kind === 'role' && typeof locator.role !== 'string') throw new Error(`Missing role: ${id}`);
  }
  if (!Array.isArray(context.secretNames) || context.secretNames.some(name => !/^[A-Z][A-Z0-9_]*$/.test(name))) throw new Error('secretNames must list environment variable names');
  if (!Array.isArray(context.expectedTexts)) throw new Error('Context needs expectedTexts (may be empty)');
  return context;
}
function validatePlan(plan, context) {
  assertSchema('plan', plan);
  if (plan.missingInformation.length) throw new Error(`Missing application information: ${plan.missingInformation.join('; ')}`);
  if (!plan.scenarios.length || plan.scenarios.length > (context.discovered ? 250 : 20)) throw new Error('Plan scenario count exceeds the allowed limit');
  const ids = new Set();
  for (const scenario of plan.scenarios) {
    if (!/^[a-zA-Z][\w-]{0,63}$/.test(scenario.id) || ids.has(scenario.id)) throw new Error('Scenario IDs must be unique identifiers');
    ids.add(scenario.id);
    if (!scenario.title.trim() || scenario.steps.length < 2 || scenario.steps.length > 40) throw new Error('Each scenario needs a title and 2–40 steps');
    if (scenario.steps[0].action !== 'goto' || !scenario.steps.some(step => step.action.startsWith('expect'))) throw new Error('Each scenario must navigate and assert an outcome');
    for (const step of scenario.steps) {
      const route = ['goto', 'expectURL'].includes(step.action);
      if (route) {
        if (typeof step.value !== 'string' || !context.routes.includes(step.value)) throw new Error('Navigation and URL expectations must reference declared routes');
        sameOriginPath(step.value, context.baseURL);
        if (step.locator !== null) throw new Error('Route steps cannot use locators');
      } else if(step.action==='expectPageHealthy') {
        if(step.locator!==null || step.value!==null || step.secret!==null) throw new Error('Page health assertions cannot take parameters');
      } else if (!Object.hasOwn(context.locators, step.locator)) throw new Error(`Unknown locator: ${step.locator}`);
      if(context.discovered && step.locator && !context.locators[step.locator].allowedActions?.includes(step.action)) throw new Error(`Action ${step.action} is outside discovered control permissions: ${step.locator}`);
      if (step.secret !== null && (step.action !== 'fill' || !context.secretNames.includes(step.secret) || step.value !== null)) throw new Error('Secrets may only fill fields from the declared environment names');
      if (step.action === 'fill' && step.secret === null && !(context.discovered && context.testData?.includes(step.value))) throw new Error('Fill values must use a declared environment variable or approved synthetic discovery data');
      if(context.discovered && ['select','expectValue'].includes(step.action) && !context.testData.includes(step.value)) throw new Error('Value must use approved discovery test data');
      if(context.discovered && step.action==='press' && step.value!=='Enter') throw new Error('Discovery supports only Enter on approved search controls');
      if (step.action === 'expectText' && !context.expectedTexts.includes(step.value)) throw new Error('Text assertions must use a declared expected text');
      if (['click', 'check', 'expectVisible','expectChecked','expectEnabled'].includes(step.action) && step.value !== null) throw new Error(`${step.action} cannot have a value`);
      if (['press', 'select'].includes(step.action) && (typeof step.value !== 'string' || step.value.length > 100)) throw new Error('Invalid interaction value');
    }
  }
  return plan;
}
module.exports = { categories, planSchema, analysisSchema, assertSchema, validateContext, validatePlan, sameOriginPath };
