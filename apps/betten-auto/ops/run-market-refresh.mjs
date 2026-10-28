/** Resume due licensed vehicle-market jobs. A Site service credential enters through hidden stdin. */
import readline from 'node:readline';
import {spawnSync} from 'node:child_process';
const origin='https://betten-imports-inventory-desk.roundlake4.chatgpt.site';
if(process.stdin.isTTY)spawnSync('stty',['-echo'],{stdio:'inherit'});
console.error('Ready for Site service JSON on stdin (input hidden).');
const reader=readline.createInterface({input:process.stdin,terminal:false});
const line=await new Promise(resolve=>reader.once('line',resolve));reader.close();process.stdin.pause();
const credentials=JSON.parse(line);if(!credentials.token||credentials.origin&&credentials.origin!==origin)throw new Error('Use the existing private Site service credential and expected origin.');
const headers={'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+credentials.token};
async function request(path,body){const r=await fetch(origin+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});let j;try{j=await r.json()}catch{throw new Error('Site returned an unreadable market-job response.')}if(!r.ok)throw new Error(j.message||'Market-job operation unavailable.');return j;}
const before=await request('/api/market-status');
let processed=0,outcome='complete';
for(let batch=0;batch<60;batch++){
 const result=await request('/api/market-refresh',{limit:5});processed+=result.processed||0;
 if(result.status==='setup_required'||result.status==='live_only'||result.status==='evaluation_only'){outcome=result.status;break;}
 if((result.outcomes||[]).some(r=>['authentication','rate_limited','daily_budget','monthly_budget'].includes(r.code))){outcome='provider_or_budget_limit';break;}
 if(!result.processed)break;
 if(batch===59)outcome='batch_limit';
}
const after=await request('/api/market-status');
console.log(JSON.stringify({status:outcome,processed,eligible:after.eligible,missingDetails:after.missingDetails,fresh:after.fresh,stale:after.stale,pending:after.pending,failed:after.failed,providerConfigured:after.status==='connected',licensedCacheEnabled:after.cacheAllowed,priorFresh:before.fresh,accountMode:after.accountMode,reservedToday:after.reservedToday,reservedThisMonth:after.reservedThisMonth,dailyLimit:after.dailyLimit,monthlyLimit:after.monthlyLimit}));
