function loginPlan(context, requirement = 'Verify successful login and invalid-password handling.') {
  const config = context.login;
  if (!config) throw new Error('Login template requires context.login');
  const step = (action, locator = null, value = null, secret = null) => ({ action, locator, value, secret });
  const login = password => [step('goto',null,config.route), step('fill',config.emailLocator,null,config.emailSecret), step('fill',config.passwordLocator,null,password), step('click',config.submitLocator)];
  return { schemaVersion:1, requirement, missingInformation:[], scenarios:[
    { id:'valid-login',title:'Valid login opens the expected page',preconditions:['A dedicated valid account exists'],steps:[...login(config.passwordSecret),step('expectURL',null,config.successRoute)] },
    { id:'invalid-password',title:'Invalid password shows the expected error',preconditions:['An invalid password differs from the valid password'],steps:[...login(config.invalidPasswordSecret),step('expectText',config.errorLocator,config.errorText)] }
  ] };
}
function demoContext() {
  return { baseURL:'http://127.0.0.1:4173', routes:['/login','/dashboard'], expectedTexts:['Invalid email or password'],
    secretNames:['DEMO_VALID_EMAIL','DEMO_VALID_PASSWORD','DEMO_INVALID_PASSWORD'],
    locators:{ email:{kind:'label',value:'Email'},password:{kind:'label',value:'Password'},submit:{kind:'role',role:'button',value:'Login',intent:'Login'},error:{kind:'role',role:'alert',value:''} },
    login:{route:'/login',emailLocator:'email',passwordLocator:'password',submitLocator:'submit',successRoute:'/dashboard',errorLocator:'error',errorText:'Invalid email or password',emailSecret:'DEMO_VALID_EMAIL',passwordSecret:'DEMO_VALID_PASSWORD',invalidPasswordSecret:'DEMO_INVALID_PASSWORD'} };
}
function targetContext() {
  const required = ['TARGET_BASE_URL','TARGET_LOGIN_PATH','TARGET_EMAIL_LABEL','TARGET_PASSWORD_LABEL','TARGET_SUBMIT_NAME','TARGET_SUCCESS_PATH','TARGET_INVALID_MESSAGE','TARGET_VALID_EMAIL','TARGET_VALID_PASSWORD','TARGET_INVALID_PASSWORD'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(', ')}`);
  if (process.env.TARGET_VALID_PASSWORD === process.env.TARGET_INVALID_PASSWORD) throw new Error('Invalid password must differ from the valid password');
  const env = process.env;
  return { baseURL:env.TARGET_BASE_URL,routes:[env.TARGET_LOGIN_PATH,env.TARGET_SUCCESS_PATH],expectedTexts:[env.TARGET_INVALID_MESSAGE],secretNames:['TARGET_VALID_EMAIL','TARGET_VALID_PASSWORD','TARGET_INVALID_PASSWORD'],
    locators:{email:{kind:'label',value:env.TARGET_EMAIL_LABEL},password:{kind:'label',value:env.TARGET_PASSWORD_LABEL},submit:{kind:'role',role:'button',value:env.TARGET_SUBMIT_NAME,intent:env.TARGET_SUBMIT_NAME},error:{kind:'text',value:env.TARGET_INVALID_MESSAGE}},
    login:{route:env.TARGET_LOGIN_PATH,emailLocator:'email',passwordLocator:'password',submitLocator:'submit',successRoute:env.TARGET_SUCCESS_PATH,errorLocator:'error',errorText:env.TARGET_INVALID_MESSAGE,emailSecret:'TARGET_VALID_EMAIL',passwordSecret:'TARGET_VALID_PASSWORD',invalidPasswordSecret:'TARGET_INVALID_PASSWORD'} };
}
module.exports = { loginPlan, demoContext, targetContext };
