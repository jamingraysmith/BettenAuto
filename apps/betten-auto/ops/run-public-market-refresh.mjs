/** Resume due public-source jobs. The existing private Site credential enters only through stdin. */
import readline from 'node:readline';
import {spawnSync} from 'node:child_process';
const origin='https://betten-imports-inventory-desk.roundlake4.chatgpt.site';
if(process.stdin.isTTY)spawnSync('stty',['-echo'],{stdio:'inherit'});
console.error('Ready for Site service JSON on stdin (input hidden).');
const reader=readline.createInterface({input:process.stdin,terminal:false});
const line=await new Promise(resolve=>reader.once('line',resolve));reader.close();process.stdin.pause();
const credentials=JSON.parse(line);if(!credentials.token||credentials.origin&&credentials.origin!==origin)throw new Error('Use the existing private Site service credential and expected origin.');
const headers={'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+credentials.token};
async function request(path,body){const response=await fetch(origin+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(300000)});let result;try{result=await response.json();}catch{throw new Error('Site returned an unreadable public collection response.');}if(!response.ok)throw new Error(result.message||'Public collection is unavailable.');return result;}
const before=await request('/api/public-market/status');let processed=0,outcome='complete';
for(let batch=0;batch<200;batch++){const result=await request('/api/public-market/refresh',{limit:2});processed+=result.processed||0;if(!result.processed)break;if(batch===199)outcome='batch_limit';}
const after=await request('/api/public-market/status');
console.log(JSON.stringify({status:outcome,mode:'public',processed,totalListings:after.totalListings,activeSources:after.activeSources,subscriptionCost:0,coverage:{total:after.coverage.total,withMatches:after.coverage.withMatches,withEnoughData:after.coverage.withEnoughData},sources:after.sources,priorLastSuccessAt:before.lastSuccessAt,lastSuccessAt:after.lastSuccessAt}));
