const path = require('node:path');
const { Providers } = require('./providers');
const { localAnalysis } = require('./policy');
const { readJSON, writeJSON } = require('./util');
async function evaluate(options) {
  const dataset = readJSON(path.resolve(options.dataset || 'examples/evaluations.json'));
  if (!Array.isArray(dataset) || !dataset.length || dataset.length > 100) throw new Error('Evaluation dataset must contain 1–100 labeled cases');
  const modes = options.evaluator === 'compare' ? ['jev+llm','llm'] : [options.evaluator || 'local'];
  const reports = [];
  for (const mode of modes) {
    const providers = new Providers({maxCalls: options.maxCalls ?? 100,timeoutMs: options.providerTimeoutMs || 30000});
    const records=[];
    for(const sample of dataset) {
      const start=Date.now();
      try {
        let result;
        if(mode==='jev+llm') {
          const evaluation=await providers.jev(sample.failure),proposal=await providers.debug(sample.failure,sample.plan || null,sample.context || {});
          const agreement=evaluation.category===proposal.category && evaluation.confidence>=0.65;
          result={...evaluation,category:agreement?evaluation.category:'UNKNOWN',retry:agreement && evaluation.retry && proposal.retry,proposal};
        }else result=mode==='jev'?await providers.jev(sample.failure):mode==='llm'?await providers.debug(sample.failure,sample.plan || null,sample.context || {}):localAnalysis(sample.failure);
        records.push({id:sample.id,expected:sample.expected,result,categoryCorrect:result.category===sample.expected.category,retryCorrect:result.retry===sample.expected.retry,durationMs:Date.now()-start});
      } catch(error) {records.push({id:sample.id,error:error.message,durationMs:Date.now()-start});}
    }
    const valid=records.filter(record=>!record.error);
    reports.push({provider:mode,total:records.length,evaluated:valid.length,unavailable:records.length-valid.length,abstained:valid.filter(r=>r.result.category==='UNKNOWN').length,
      classificationAccuracy:valid.length?valid.filter(r=>r.categoryCorrect).length/valid.length:null,
      retryAccuracy:valid.length?valid.filter(r=>r.retryCorrect).length/valid.length:null,
      averageLatencyMs:valid.length?valid.reduce((sum,r)=>sum+r.durationMs,0)/valid.length:null,
      records,providerCalls:providers.calls});
  }
  const file=path.join(process.cwd(),'runs',`evaluation-${Date.now()}.json`);
  writeJSON(file,{schemaVersion:1,dataset:options.dataset || 'examples/evaluations.json',reports,limitations:'This dataset measures classification and retry recommendations. Repair success/false repair rates require independently adjudicated browser runs; no model accuracy is inferred from local fixtures.'});
  console.log(`Evaluation report: ${file}`);
  return reports.some(report=>report.unavailable)?2:0;
}
module.exports={evaluate};
