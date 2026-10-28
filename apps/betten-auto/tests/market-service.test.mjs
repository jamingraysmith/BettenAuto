/** SQLite integration of the actual service, provider adapter, queue and HTTP routes. No live provider calls. */
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
async function load(path,replacements=[]){let source=readFileSync(new URL(path,root),'utf8');source=source.replace(/import\s*\{enforceRoute\}\s*from\s*['"][^'"]+access['"];?/, 'const {enforceRoute}=globalThis.__marketAccess;');for(const [pattern,value] of replacements)source=source.replace(pattern,value);return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));}
globalThis.__marketAccessModel=await load('lib/access-model.ts');globalThis.__marketAccess=await load('lib/access.ts',[[/import \{env\} from 'cloudflare:workers';/, 'const env={};'],[/import \{Access,can,modules\} from '.\/access-model';/, 'const {can,modules}=globalThis.__marketAccessModel;']]);
const jobs=await load('lib/market-jobs.ts'),provider=await load('lib/market-provider.ts'),pricing=await load('lib/pricing.ts');
globalThis.__marketJobs=jobs;globalThis.__marketProvider=provider;globalThis.__marketPricing=pricing;globalThis.__marketEnvironment={};
const service=await load('lib/market-service.ts',[
 [/import\s*\{\s*env\s*\}\s*from\s*['"]cloudflare:workers['"];?/,'const env=globalThis.__marketEnvironment;'],
 [/import\s*\{\s*db,workspace\s*\}\s*from\s*['"]\.\/server['"];?/,'const db=(...args)=>globalThis.__marketServer.db(...args),workspace=(...args)=>globalThis.__marketServer.workspace(...args);'],
 [/import\s*\{[^}]+\}\s*from\s*['"]\.\/market-provider['"];?/,'const {fetchVehicleMarket,MarketProviderError,marketProviderEndpoint}=globalThis.__marketProvider;'],
 [/import\s*\{[^}]+\}\s*from\s*['"]\.\/market-jobs['"];?/,'const {syncMarketJobs,claimMarketJob,commitMarketSuccess,failMarketJob,readMarketCache,marketJobSummaries,purgeMarketCaches}=globalThis.__marketJobs;'],
 [/import\s*\{[^}]+\}\s*from\s*['"]\.\/pricing['"];?/,'const {matchComparables,samplePricing}=globalThis.__marketPricing;']
]);
globalThis.__marketService=service;
const routeReplacements=[[/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+server['"];?/,'const json=(...args)=>globalThis.__marketServer.json(...args),body=(...args)=>globalThis.__marketServer.body(...args),checkOrigin=(...args)=>globalThis.__marketServer.checkOrigin(...args),workspace=(...args)=>globalThis.__marketServer.workspace(...args);'],[/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+market-service['"];?/,'const {$1}=globalThis.__marketService;']];
const liveRoute=await load('app/api/live-market/route.ts',routeReplacements),refreshRoute=await load('app/api/market-refresh/route.ts',routeReplacements),statusRoute=await load('app/api/market-status/route.ts',routeReplacements);
class D1{
 constructor(){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec('CREATE TABLE records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,actor TEXT NOT NULL,mutation_id TEXT NOT NULL)');}
 prepare(sql){const sqlite=this.sqlite;return new class{constructor(args=[]){this.args=args;}bind(...args){return new this.constructor(args);}async all(){return {results:sqlite.prepare(sql).all(...this.args)};}async first(){return sqlite.prepare(sql).get(...this.args)||null;}};}
 async batch(statements){this.sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.all());this.sqlite.exec('COMMIT');return results;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
}
const realNow=Date.now,realFetch=globalThis.fetch,key='PRIVATE_MARKET_KEY_NEVER_RETURN',initial=Date.parse('2026-10-20T17:00:00Z');
const vin='3VWGW7BU6TM020418',vin2='1HGCM82633A004352',vin3='1HGCM82633A004353',vin4='1HGCM82633A004354';
const subject=(changes={})=>({vin,year:2026,make:'Volkswagen',model:'Jetta',trim:'1.5T SEL',condition:'Used',mileage:2730,price:28692,...changes});
let db,clock,current,calls,handler;
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});
function connected({cache=false,...changes}={}){Object.assign(globalThis.__marketEnvironment,{MARKET_DATA_PROVIDER:'autodev',MARKET_DATA_API_KEY:key,MARKET_DATA_ENABLED:'true',MARKET_DATA_CACHE_ALLOWED:cache?'true':'false',MARKET_DATA_MAX_PAGES:'1',MARKET_DATA_DAILY_LIMIT:'300',MARKET_DATA_REFRESH_HOURS:'24',...changes});}
function providerRow({vin:listingVin=vin2,make='Volkswagen',model='Jetta',trim='SEL',year=2026,mileage=6000,price=28000,used=true}={}){return {updatedAt:new Date(clock).toISOString(),vehicle:{vin:listingVin,make,model,trim,year},retailListing:{miles:mileage,price,used,cpo:true,dealer:'Provider Dealer',city:'City',state:'TX',vdp:'https://dealer.example/vehicle/'+listingVin}};}
const request=(data,origin='https://betten.example')=>new Request('https://betten.example/api/live-market',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
const allStored=()=>JSON.stringify(db.sqlite.prepare('SELECT * FROM records ORDER BY id').all());
beforeEach(()=>{
 db=new D1();clock=initial;Date.now=()=>clock;current={vehicles:[subject()],archivedVehicles:[],records:[]};calls=[];for(const k of Object.keys(globalThis.__marketEnvironment))delete globalThis.__marketEnvironment[k];
 handler=async()=>response({data:[providerRow()],total:1,links:{next:null}});
 globalThis.fetch=async(url,init)=>{calls.push({url:new URL(url),init});return handler(url,init);};
 globalThis.__marketServer={db:()=>db,workspace:async()=>current,json:(body,status=200)=>Response.json(body,{status}),body:async req=>JSON.parse(await req.text()),checkOrigin:req=>{const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new Error('Cross-origin write rejected.');}};
});
afterEach(()=>{Date.now=realNow;globalThis.fetch=realFetch;});

test('missing configuration syncs current jobs without making a provider call or claiming live coverage',async()=>{
 const result=await service.refreshVehicleMarkets(5,clock);assert.equal(result.status,'setup_required');assert.equal(result.queued,1);assert.equal(result.processed,0);assert.equal(calls.length,0);
 const summary=await service.marketStatus(clock);assert.equal(summary.configured,false);assert.equal(summary.fresh,0);assert.equal(summary.pending,1);assert.equal(summary.vehicles[vin].status,'queued');
 const r=await liveRoute.POST(request({vin}));assert.equal(r.status,503);assert.equal((await r.json()).code,'configuration');assert.equal(calls.length,0);
});

test('an invalid provider never guesses Auto.dev or transmits another provider credential',async()=>{
 connected({MARKET_DATA_PROVIDER:'unknown_provider'});assert.equal(service.marketConfiguration().configured,false);
 await assert.rejects(service.lookupVehicleMarket(subject(),{},clock),error=>service.marketError(error).code==='configuration');
 const batch=await service.refreshVehicleMarkets(5,clock);assert.equal(batch.status,'setup_required');assert.equal(calls.length,0);
});

test('live lookup uses each current vehicle identity and also handles future inventory and manual appraisals',async()=>{
 connected();
 const first=await liveRoute.POST(request({vin}));assert.equal(first.status,200);assert.equal(calls[0].url.searchParams.get('vehicle.model'),'Jetta');
 current.vehicles.push(subject({vin:vin3,year:2024,make:'Honda',model:'Accord',trim:'EX',condition:'Used',mileage:21000}));
 handler=async()=>response({data:[providerRow({vin:vin4,year:2024,make:'Honda',model:'Accord',trim:'EX',mileage:18000})],total:1,links:{next:null}});
 const second=await liveRoute.POST(request({vin:vin3}));const result=await second.json();assert.equal(second.status,200);assert.equal(result.matchedCount,1);assert.equal(calls[1].url.searchParams.get('vehicle.make'),'Honda');assert.equal(calls[1].url.searchParams.get('vehicle.model'),'Accord');assert.equal(calls[1].url.searchParams.get('vehicle.year'),'2024');
 const manual=subject({vin:'',year:2025,make:'Volvo',model:'XC60',trim:'B5 Plus',condition:'New',mileage:0});
 const third=await liveRoute.POST(request({vehicle:manual}));assert.equal(third.status,200);assert.equal(calls[2].url.searchParams.get('vehicle.make'),'Volvo');assert.equal(calls[2].url.searchParams.get('retailListing.used'),'false');
 for(const call of calls){assert.equal(call.init.headers.Authorization,'Bearer '+key);assert.equal(call.url.href.includes(key),false);}
});

test('missing or unsupported identity and unavailable stock VINs are rejected before quota or provider use',async()=>{
 connected();
 for(const vehicle of [subject({condition:'not-used'}),subject({condition:'unused'}),subject({condition:'Wholesale'}),subject({make:''}),subject({year:0}),subject({mileage:null}),subject({vin:'BAD'})]){const r=await liveRoute.POST(request({vehicle}));assert.equal(r.status,400);assert.equal((await r.json()).status,'invalid_vehicle');}
 const notFound=await liveRoute.POST(request({vin:vin4}));assert.equal(notFound.status,400);
 await assert.rejects(service.lookupVehicleMarket(subject({trim:''}),{},clock),error=>service.marketError(error).code==='invalid_vehicle');
 assert.equal(calls.length,0);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,0);
});

test('daily allowance reserves pages atomically at the limit and resets at the UTC day boundary',async()=>{
 connected({MARKET_DATA_DAILY_LIMIT:'3'});
 assert.equal(await service.reserveMarketBudget(2,clock),true);assert.equal(await service.reserveMarketBudget(2,clock),false);assert.equal(await service.reserveMarketBudget(1,clock),true);assert.equal(await service.reserveMarketBudget(1,clock),false);
 const next=Date.parse('2026-10-21T00:00:00Z');assert.equal(await service.reserveMarketBudget(2,next),true);
 const usage=await service.marketBudgetUsage(next);assert.equal(usage.reservedThisMonth,5);assert.equal(usage.reservedToday,2);const row=JSON.parse(db.sqlite.prepare("SELECT data FROM records WHERE id='system:market-budget-month:2026-10'").get().data);assert.deepEqual(row.days,{d20:3,d21:2});
});

test('concurrent reservations cannot overrun the daily provider request budget',async()=>{
 connected({MARKET_DATA_DAILY_LIMIT:'5'});
 const decisions=await Promise.all(Array.from({length:20},()=>service.reserveMarketBudget(1,clock)));
 assert.equal(decisions.filter(Boolean).length,5);assert.equal(JSON.parse(db.sqlite.prepare("SELECT data FROM records WHERE id='system:market-budget-month:2026-10'").get().data).reserved,5);
});

test('live-only results and response prices never enter persistent storage',async()=>{
 connected();handler=async()=>response({data:[providerRow({price:123456})],total:1,links:{next:null}});
 const result=await service.lookupVehicleMarket(subject(),{},clock);assert.equal(result.listings[0].price,123456);assert.equal(result.cached,false);assert.equal(result.cacheAllowed,false);
 const stored=allStored();for(const text of ['123456','Provider Dealer','dealer.example','retailListing',key])assert.equal(stored.includes(text),false);
 assert.equal(await jobs.readMarketCache(db,vin,clock),null);
 const batch=await service.refreshVehicleMarkets(5,clock);assert.equal(batch.status,'live_only');assert.equal(batch.processed,0);assert.equal(calls.length,1);
});

test('licensed results cache on explicit permission and a repeated fresh lookup uses the cache without new provider quota',async()=>{
 connected({cache:true});
 const first=await service.lookupVehicleMarket(subject(),{},clock);assert.equal(first.cached,false);assert.equal(calls.length,1);
 clock+=1000;const next=await service.lookupVehicleMarket(subject(),{},clock);assert.equal(next.cached,true);assert.equal(next.matchedCount,1);assert.equal(calls.length,1);
 const cache=await jobs.readMarketCache(db,vin,clock);assert.equal(cache.listings.length,1);assert.equal(cache.cachedAt,initial);assert.equal(cache.expiresAt,initial+86400000);
 const summary=await service.marketStatus(clock);assert.equal(summary.fresh,1);assert.equal(summary.reservedToday,1);assert.equal(JSON.stringify(summary).includes(key),false);assert.equal(JSON.stringify(summary).includes('Provider Dealer'),false);
});

test('all eligible current vehicles queue and scheduled batches skip sold, wholesale and archived vehicles',async()=>{
 connected({cache:true});
 const sold=subject({vin:vin2}),wholesale=subject({vin:vin3}),other=subject({vin:vin4,make:'Honda',model:'Accord',trim:'EX',year:2024});
 current={vehicles:[subject(),sold,wholesale,other,subject({vin:'1HGCM82633A004355',trim:''})],archivedVehicles:[subject({vin:'1HGCM82633A004356'})],records:[{id:vin2,kind:'vehicle',data:{status:'sold'}},{id:vin3,kind:'vehicle',data:{status:'wholesale'}}]};
 const result=await service.refreshVehicleMarkets(5,clock);assert.equal(result.queued,2);assert.equal(result.missingDetails,1);assert.equal(result.processed,2);
 assert.deepEqual(result.outcomes.map(x=>x.vin).sort(),[vin,vin4].sort());assert.equal(calls.length,2);assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE id LIKE 'system:market-job:%'").get().n,2);
 current.vehicles.push(subject({vin:'1HGCM82633A004357',year:2025,make:'Volvo',model:'XC60',trim:'B5 Plus'}));
 const future=await service.refreshVehicleMarkets(5,clock);assert.equal(future.processed,1);assert.equal(future.outcomes[0].vin,'1HGCM82633A004357');assert.equal(calls.at(-1).url.searchParams.get('vehicle.make'),'Volvo');
});

test('failed licensed refresh preserves old cache timestamps and returns safe errors without provider bodies or keys',async()=>{
 connected({cache:true,MARKET_DATA_REFRESH_HOURS:'1'});await service.lookupVehicleMarket(subject(),{},clock);
 const before=await jobs.readMarketCache(db,vin,clock);clock+=3600001;
 handler=async()=>{throw new Error('https://provider.example/private?api_key='+key+' BODY_CONTAINS_PRIVATE_DATA')};
 const failure=await liveRoute.POST(request({vin}));const error=await failure.json();assert.equal(failure.status,502);assert.equal(error.code,'unavailable');
 for(const secret of [key,'provider.example','BODY_CONTAINS_PRIVATE_DATA'])assert.equal(JSON.stringify(error).includes(secret),false);
 const after=await jobs.readMarketCache(db,vin,clock);assert.equal(after.cachedAt,before.cachedAt);assert.equal(after.expiresAt,before.expiresAt);assert.equal(after.stale,true);assert.deepEqual(after.listings,before.listings);
 const job=JSON.parse(db.sqlite.prepare('SELECT data FROM records WHERE id=?').get('system:market-job:'+vin).data);assert.equal(job.lastErrorCode,'UNAVAILABLE');assert.equal(allStored().includes(key),false);
});

test('current identity or provider query version changes stop old cache from counting as fresh before any resync',async()=>{
 connected({cache:true});await service.lookupVehicleMarket(subject(),{},clock);
 current.vehicles[0]=subject({mileage:35000});let status=await service.marketStatus(clock);assert.equal(status.fresh,0);assert.equal(status.pending,1);assert.equal(status.vehicles[vin].hasCache,false);assert.equal(status.vehicles[vin].identityChanged,true);
 current.vehicles[0]=subject();globalThis.__marketEnvironment.MARKET_DATA_QUERY_VERSION='2';status=await service.marketStatus(clock);assert.equal(status.fresh,0);assert.equal(status.vehicles[vin].hasCache,false);
});

test('custom provider full endpoint scope and page budget are fingerprinted without exposing private path or query values',async()=>{
 connected({cache:true,MARKET_DATA_PROVIDER:'custom',MARKET_DATA_ENDPOINT:'https://first.example/listings?account=hidden-query'});
 const first=await service.marketTarget(subject());assert.equal(first.fingerprint.includes('hidden-query'),false);assert.equal(first.fingerprint.includes('first.example'),false);assert.equal(first.fingerprint.includes('/listings'),false);assert.match(JSON.parse(first.fingerprint).providerScope,/^[a-f0-9]{64}$/);
 globalThis.__marketEnvironment.MARKET_DATA_ENDPOINT='https://first.example/listings?account=other-scope';assert.notEqual((await service.marketTarget(subject())).fingerprint,first.fingerprint);
 globalThis.__marketEnvironment.MARKET_DATA_ENDPOINT='https://first.example/listings?account=hidden-query';globalThis.__marketEnvironment.MARKET_DATA_MAX_PAGES='2';assert.notEqual((await service.marketTarget(subject())).fingerprint,first.fingerprint);
 globalThis.__marketEnvironment.MARKET_DATA_ENDPOINT='https://second.example/listings';assert.notEqual((await service.marketTarget(subject())).fingerprint,first.fingerprint);
 globalThis.__marketEnvironment.MARKET_DATA_QUERY_VERSION='custom-schema-2';assert.equal((await service.marketTarget(subject())).fingerprint.includes('custom-schema-2'),true);
});

test('daily budget exhaustion is a safe 429 response and does not invoke the provider',async()=>{
 connected({MARKET_DATA_DAILY_LIMIT:'1'});assert.equal(await service.reserveMarketBudget(1,clock),true);
 const result=await liveRoute.POST(request({vin}));const error=await result.json();assert.equal(result.status,429);assert.equal(error.code,'daily_budget');assert.equal(calls.length,0);assert.equal(JSON.stringify(error).includes(key),false);
});

test('cross-origin live and refresh writes return static 403 errors before data mutation or fetching',async()=>{
 connected({cache:true});
 for(const route of [liveRoute,refreshRoute]){const result=await route.POST(request({vin,limit:5},'https://attacker.example'));assert.equal(result.status,403);assert.equal((await result.json()).status,'forbidden');}
 assert.equal(calls.length,0);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,0);
});

test('status endpoint exposes safe configuration and operational coverage without credentials or response prices',async()=>{
 connected({cache:true});await service.lookupVehicleMarket(subject(),{},clock);
 const result=await statusRoute.GET(new Request('https://betten.example/api/market-status'));const status=await result.json();assert.equal(result.status,200);assert.equal(status.configured,true);assert.equal(status.fresh,1);
 const text=JSON.stringify(status);for(const secret of [key,'Provider Dealer','dealer.example','listings','price','targetFingerprint','providerScope'])assert.equal(text.includes(secret),false);
});


test('unrecognized service error codes cannot expose raw provider URLs, bodies or credentials',()=>{
 const error=service.marketError(new service.MarketServiceError('https://provider.example?api_key='+key));
 assert.equal(error.code,'unavailable');assert.equal(JSON.stringify(error).includes(key),false);assert.equal(JSON.stringify(error).includes('provider.example'),false);
});

test('provider Retry-After and daily budget reset determine safe queued retry times',async()=>{
 connected({cache:true});handler=async()=>response({error:key},429,{'Retry-After':'7200'});
 let result=await service.refreshVehicleMarkets(5,clock);assert.equal(result.outcomes[0].code,'rate_limited');
 let job=JSON.parse(db.sqlite.prepare('SELECT data FROM records WHERE id=?').get('system:market-job:'+vin).data);assert.equal(job.nextRunAt,clock+7200000);
 db=new D1();connected({cache:true,MARKET_DATA_DAILY_LIMIT:'1'});await service.reserveMarketBudget(1,clock);
 result=await service.refreshVehicleMarkets(5,clock);assert.equal(result.outcomes[0].code,'daily_budget');job=JSON.parse(db.sqlite.prepare('SELECT data FROM records WHERE id=?').get('system:market-job:'+vin).data);
 assert.equal(job.nextRunAt,Date.parse('2026-10-21T00:00:01Z'));
});


test('embedded endpoint credentials are rejected before jobs, budgets, public status or provider requests can expose them',async()=>{
 for(const endpoint of ['https://market.example/'+key+'/listings','https://market.example/listings?account='+key,'https://market.example/listings?account='+Array.from(key).map(c=>'%'+c.charCodeAt(0).toString(16)).join('')]){
  connected({cache:true,MARKET_DATA_PROVIDER:'custom',MARKET_DATA_ENDPOINT:endpoint});
  assert.equal(service.marketConfiguration().configured,false);
  await assert.rejects(service.lookupVehicleMarket(subject(),{},clock),error=>service.marketError(error).code==='configuration');
  const status=await statusRoute.GET(new Request('https://betten.example/api/market-status'));assert.equal(JSON.stringify(await status.json()).includes(key),false);
  assert.equal(allStored().includes(key),false);assert.equal(calls.length,0);
 }
});

test('disabling retention purges existing response payloads on status, live lookup and refresh while preserving job metadata',async()=>{
 for(const action of ['status','lookup','refresh']){
  db=new D1();calls=[];connected({cache:true});handler=async()=>response({data:[providerRow({price:123456})],total:1,links:{next:null}});
  await service.lookupVehicleMarket(subject(),{},clock);
  const id='system:market-job:'+vin,before=JSON.parse(db.sqlite.prepare('SELECT data FROM records WHERE id=?').get(id).data);
  assert.equal(allStored().includes('123456'),true);
  globalThis.__marketEnvironment.MARKET_DATA_CACHE_ALLOWED='false';
  if(action==='status')await service.marketStatus(clock);else if(action==='lookup')await service.lookupVehicleMarket(subject(),{},clock);else await service.refreshVehicleMarkets(3,clock);
  const after=JSON.parse(db.sqlite.prepare('SELECT data FROM records WHERE id=?').get(id).data);
  assert.equal(await jobs.readMarketCache(db,vin,clock),null);assert.equal(allStored().includes('123456'),false);assert.equal(allStored().includes('Provider Dealer'),false);
  assert.equal(after.lastSuccessAt,before.lastSuccessAt);assert.equal(after.attempts,before.attempts);assert.deepEqual(after.target,before.target);
 }
});

test('a changed page allowance cannot serve an older licensed partial response as the current query cache',async()=>{
 connected({cache:true});await service.lookupVehicleMarket(subject(),{},clock);assert.equal(calls.length,1);
 globalThis.__marketEnvironment.MARKET_DATA_MAX_PAGES='2';
 const status=await service.marketStatus(clock);assert.equal(status.fresh,0);assert.equal(status.vehicles[vin].identityChanged,true);assert.equal('targetFingerprint' in status.vehicles[vin],false);
 const result=await service.lookupVehicleMarket(subject(),{},clock);assert.equal(result.cached,false);assert.equal(calls.length,2);
});


test('a changed custom feed query scope invalidates the licensed cache without storing its private endpoint',async()=>{
 connected({cache:true,MARKET_DATA_PROVIDER:'custom',MARKET_DATA_ENDPOINT:'https://market.example/private-path/listings?account=scope-alpha'});
 handler=async()=>response({listings:[{vin:vin2,year:2026,make:'Volkswagen',model:'Jetta',trim:'SEL',condition:'Used',mileage:6000,price:28000,observedAt:new Date(clock).toISOString()}],total:1});
 await service.lookupVehicleMarket(subject(),{},clock);const cached=await service.lookupVehicleMarket(subject(),{},clock);assert.equal(cached.cached,true);assert.equal(calls.length,1);
 globalThis.__marketEnvironment.MARKET_DATA_ENDPOINT='https://market.example/private-path/listings?account=scope-beta';
 const next=await service.lookupVehicleMarket(subject(),{},clock);assert.equal(next.cached,false);assert.equal(calls.length,2);
 const text=JSON.stringify(await service.marketStatus(clock))+allStored();for(const secret of ['scope-alpha','scope-beta','private-path',key])assert.equal(text.includes(secret),false);
});

test('retention revoked during an in-flight lookup cannot be restored by the late provider response',async()=>{
 connected({cache:true});let release,started;
 const fetching=new Promise(resolve=>{started=resolve}),gate=new Promise(resolve=>{release=resolve});
 handler=async()=>{started();await gate;return response({data:[providerRow({price:123456})],total:1,links:{next:null}})};
 const pending=service.lookupVehicleMarket(subject(),{},clock);await fetching;
 globalThis.__marketEnvironment.MARKET_DATA_CACHE_ALLOWED='false';await service.marketStatus(clock);release();await pending;
 assert.equal(await jobs.readMarketCache(db,vin,clock),null);assert.equal(allStored().includes('123456'),false);assert.equal(allStored().includes('Provider Dealer'),false);
});


test('monthly allowance caps concurrent requests independently of the daily allowance and resets in the next UTC month',async()=>{
 connected({MARKET_DATA_DAILY_LIMIT:'100',MARKET_DATA_MONTHLY_LIMIT:'5'});
 const decisions=await Promise.all(Array.from({length:20},()=>service.reserveMarketBudget(1,clock)));
 assert.equal(decisions.filter(Boolean).length,5);let usage=await service.marketBudgetUsage(clock);assert.equal(usage.reservedToday,5);assert.equal(usage.reservedThisMonth,5);assert.equal(usage.remainingThisMonth,0);
 const tomorrow=Date.parse('2026-10-21T00:00:00Z');assert.equal(await service.reserveMarketBudget(1,tomorrow),false);usage=await service.marketBudgetUsage(tomorrow);assert.equal(usage.reservedToday,0);assert.equal(usage.reservedThisMonth,5);
 const november=Date.parse('2026-11-01T00:00:00Z');assert.equal(await service.reserveMarketBudget(2,november),true);usage=await service.marketBudgetUsage(november);assert.equal(usage.reservedThisMonth,2);assert.equal(usage.reservedToday,2);assert.equal(usage.monthResetsAt,'2026-12-01T00:00:00.000Z');
});

test('a denied monthly reservation consumes neither daily nor monthly allowance',async()=>{
 connected({MARKET_DATA_DAILY_LIMIT:'10',MARKET_DATA_MONTHLY_LIMIT:'1'});
 assert.equal(await service.reserveMarketBudget(2,clock),false);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,0);
 assert.equal(await service.reserveMarketBudget(1,clock),true);assert.equal(await service.reserveMarketBudget(1,clock),false);
 const usage=await service.marketBudgetUsage(clock);assert.equal(usage.reservedToday,1);assert.equal(usage.reservedThisMonth,1);
});

test('legacy daily reservations count toward both current caps without migrating or resetting prior usage',async()=>{
 connected({MARKET_DATA_DAILY_LIMIT:'5',MARKET_DATA_MONTHLY_LIMIT:'8'});
 for(const [day,reserved] of [['2026-09-30',99],['2026-10-19',2],['2026-10-20',3]])db.sqlite.prepare("INSERT INTO records VALUES (?,'system',?,1,?,'legacy','legacy')").run('system:market-budget:'+day,JSON.stringify({reserved}),new Date(clock).toISOString());
 let usage=await service.marketBudgetUsage(clock);assert.equal(usage.reservedToday,3);assert.equal(usage.reservedThisMonth,5);
 assert.equal(await service.reserveMarketBudget(2,clock),true);assert.equal(await service.reserveMarketBudget(1,clock),false);usage=await service.marketBudgetUsage(clock);assert.equal(usage.reservedToday,5);assert.equal(usage.reservedThisMonth,7);
 const tomorrow=Date.parse('2026-10-21T00:00:00Z');assert.equal(await service.reserveMarketBudget(1,tomorrow),true);assert.equal(await service.reserveMarketBudget(1,tomorrow),false);usage=await service.marketBudgetUsage(tomorrow);assert.equal(usage.reservedThisMonth,8);assert.equal(usage.reservedToday,1);
 assert.equal(JSON.parse(db.sqlite.prepare("SELECT data FROM records WHERE id='system:market-budget:2026-10-20'").get().data).reserved,3);
});

test('evaluation mode enforces a one-page small lookup, hard caps and no persistent or scheduled provider collection',async()=>{
 connected({cache:true,MARKET_DATA_ACCOUNT_MODE:'evaluation',MARKET_DATA_MAX_PAGES:'2',MARKET_DATA_DAILY_LIMIT:'300',MARKET_DATA_MONTHLY_LIMIT:'10000'});
 const config=service.marketConfiguration();assert.equal(config.accountMode,'evaluation');assert.equal(config.maxPages,1);assert.equal(config.pageSize,20);assert.equal(config.dailyLimit,300);assert.equal(config.monthlyLimit,1000);assert.equal(config.cacheAllowed,false);
 const batch=await service.refreshVehicleMarkets(5,clock);assert.equal(batch.status,'evaluation_only');assert.equal(batch.processed,0);assert.equal(calls.length,0);
 const lookup=await service.lookupVehicleMarket(subject(),{},clock);assert.equal(calls.length,1);assert.equal(calls[0].url.searchParams.get('limit'),'20');assert.equal(lookup.cacheAllowed,false);assert.equal(await jobs.readMarketCache(db,vin,clock),null);assert.equal(allStored().includes('Provider Dealer'),false);
 const status=await service.marketStatus(clock);assert.equal(status.accountMode,'evaluation');assert.equal(status.reservedToday,1);assert.equal(status.remainingToday,299);assert.equal(status.reservedThisMonth,1);assert.equal(status.remainingThisMonth,999);assert.equal(status.budgetPeriod,'UTC calendar month');
 connected({cache:true,MARKET_DATA_ACCOUNT_MODE:'evaluation',MARKET_DATA_DAILY_LIMIT:'3',MARKET_DATA_MONTHLY_LIMIT:'15'});assert.equal(service.marketConfiguration().dailyLimit,3);assert.equal(service.marketConfiguration().monthlyLimit,15);
});

test('monthly budget failure returns safe 429 and prevents a provider call or repeated batch work until the next month',async()=>{
 connected({cache:true,MARKET_DATA_DAILY_LIMIT:'100',MARKET_DATA_MONTHLY_LIMIT:'1'});assert.equal(await service.reserveMarketBudget(1,clock),true);
 const live=await liveRoute.POST(request({vin})),error=await live.json();assert.equal(live.status,429);assert.equal(error.code,'monthly_budget');assert.equal(calls.length,0);assert.equal(JSON.stringify(error).includes(key),false);
 db=new D1();assert.equal(await service.reserveMarketBudget(1,clock),true);const batch=await service.refreshVehicleMarkets(5,clock);assert.equal(batch.processed,1);assert.equal(batch.outcomes[0].code,'monthly_budget');assert.equal(calls.length,0);
 const job=JSON.parse(db.sqlite.prepare('SELECT data FROM records WHERE id=?').get('system:market-job:'+vin).data);assert.equal(job.nextRunAt,Date.parse('2026-11-01T00:00:01Z'));
 const before=await service.marketBudgetUsage(clock);assert.equal(before.reservedToday,1);assert.equal(before.reservedThisMonth,1);
});

test('an unsupported account mode blocks configuration rather than silently enabling production access',async()=>{
 connected({MARKET_DATA_ACCOUNT_MODE:'free-unlimited'});assert.equal(service.marketConfiguration().configured,false);
 await assert.rejects(service.lookupVehicleMarket(subject(),{},clock),error=>service.marketError(error).code==='configuration');assert.equal(calls.length,0);
});

 test('Free plan reserves its full 1000-call allowance and refuses further provider requests',async()=>{
 connected({MARKET_DATA_ACCOUNT_MODE:'evaluation',MARKET_DATA_DAILY_LIMIT:'1000',MARKET_DATA_MONTHLY_LIMIT:'1000'});
 for(let i=0;i<1000;i++)assert.equal(await service.reserveMarketBudget(1,clock),true);
 const r=await liveRoute.POST(request({vin}));assert.equal(r.status,429);assert.equal(calls.length,0);
 const usage=await service.marketBudgetUsage(clock);assert.equal(usage.reservedThisMonth,1000);
 });

test('vehicle radius reaches the provider and matching without trusting an alternate origin',async()=>{
 connected({MARKET_DATA_ACCOUNT_MODE:'evaluation'});
 const result=await service.lookupVehicleMarket(subject(),{radiusMiles:200,zip:'10001',originZip:'10001'},clock);
 assert.equal(calls.length,1);const url=new URL(calls[0].url);assert.equal(url.searchParams.get('zip'),'49546');assert.equal(url.searchParams.get('distance'),'200');assert.equal(result.options.radiusMiles,200);assert.equal(result.options.originZip,'49546');assert.equal(result.matchedCount,1);
 for(const radiusMiles of [-1,0,5001,1.5,'invalid'])assert.throws(()=>service.marketOptions({radiusMiles}));
});
