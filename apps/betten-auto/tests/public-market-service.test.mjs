import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const root=new URL('../',import.meta.url),now=Date.parse('2026-10-20T17:00:00Z');
async function load(path,replacements=[]){let source=readFileSync(new URL(path,root),'utf8');
 source=source.replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+access-model['"];?/g,'const {$1}=globalThis.__testAccessModel;').replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+access['"];?/g,'const {$1}=globalThis.__testAccess;');for(const [pattern,replacement] of replacements)source=source.replace(pattern,replacement);const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
globalThis.__publicPricing=await load('lib/pricing.ts');
globalThis.__publicSources=[{id:'a',name:'Public A',url:'https://a.example/inventory/used',kind:'jsonld',condition:'Used',scope:'expanded',maxPages:20,refreshHours:6},{id:'b',name:'Public B',url:'https://b.example/new',kind:'jsonld',condition:'New',scope:'expanded',maxPages:20,refreshHours:6}];
globalThis.__publicCollector=async()=>{throw new Error('No real requests are allowed in service tests.');};
const service=await load('lib/public-market-service.ts',[
 [/import\s*\{collectPublicSource\}\s*from\s*['"]\.\/public-market-parser['"];?/,'const collectPublicSource=(...args)=>globalThis.__publicCollector(...args);'],
 [/import\s*\{publicMarketSources\}\s*from\s*['"]\.\/public-market-sources['"];?/,'const publicMarketSources=globalThis.__publicSources;'],
 [/import\s*\{matchComparables,samplePricing\}\s*from\s*['"]\.\/pricing['"];?/,'const {matchComparables,samplePricing}=globalThis.__publicPricing;']
]);
globalThis.__publicService=service;globalThis.__publicEnv={};globalThis.__testAccessModel=await load('lib/access-model.ts');globalThis.__testAccess=await load('lib/access.ts',[[/import\s*\{[^}]+\}\s*from\s*['"]cloudflare:workers['"];?/, 'const env=globalThis.__publicEnv;']]);globalThis.__publicSeedVehicles=[];globalThis.__publicSeedComparables=[];
globalThis.__dashboardMetrics=await load('lib/dashboard-metrics.ts');
const server=await load('lib/server.ts',[
 [/import\s*\{[^}]+\}\s*from\s*['"]\.\/dashboard-metrics['"];?/,'const {buildDashboardSnapshot}=globalThis.__dashboardMetrics;'],
 [/import\s*\{env\}\s*from\s*['"]cloudflare:workers['"];?/,'const env=globalThis.__publicEnv;'],
 [/import seedSources from ['"]\.\/seed-sources.json['"];?/,'const seedSources={};'],
 [/import seedMarketSources from ['"]\.\/seed-market-sources.json['"];?/,'const seedMarketSources={};'],
 [/import\s*\{readPublicSourceSnapshots,mergePublicMarketRecords\}\s*from\s*['"]\.\/public-market-service['"];?/,'const {readPublicSourceSnapshots,mergePublicMarketRecords}=globalThis.__publicService;'],
 [/async function loadSeeds\(\)\{[\s\S]*?\n\}/,'async function loadSeeds(){return {vehicles:globalThis.__publicSeedVehicles,comparables:globalThis.__publicSeedComparables};}']
]);
globalThis.__publicServer=server;
const route=await load('app/api/public-market/refresh/route.ts',[
 [/import\s*\{db,json,body,checkOrigin,autoDevOnly\}\s*from\s*['"][^'"]+server['"];?/,'const {db,json,body,checkOrigin,autoDevOnly}=globalThis.__publicServer;'],
 [/import\s*\{refreshPublicMarkets\}\s*from\s*['"][^'"]+public-market-service['"];?/,'const {refreshPublicMarkets}=globalThis.__publicService;']
]);
class D1{
 constructor(){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec(`CREATE TABLE records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,actor TEXT NOT NULL,mutation_id TEXT NOT NULL);CREATE TABLE inventory(vin TEXT PRIMARY KEY,data TEXT NOT NULL,observed_at TEXT NOT NULL);CREATE TABLE audit(id TEXT PRIMARY KEY,action TEXT NOT NULL,record_id TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL);CREATE TABLE sync_runs(id TEXT PRIMARY KEY,source TEXT NOT NULL,status TEXT NOT NULL,count INTEGER NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL);`);}
 prepare(sql){const sqlite=this.sqlite;return new class{constructor(args=[]){this.args=args;}bind(...args){return new this.constructor(args);}async all(){return {results:sqlite.prepare(sql).all(...this.args)};}async first(){return sqlite.prepare(sql).get(...this.args)||null;}};}
 async batch(statements){this.sqlite.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.all());this.sqlite.exec('COMMIT');return out;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
}
test('daily source eligibility stays at 9 AM Eastern after a delayed run',async()=>{
 const database=new D1();await service.syncPublicSources(database,now);
 for(let index=0;index<2;index++){const lease=await service.claimPublicSource(database,now);await service.commitPublicSuccess(database,lease,collection(),now+90000);}
 const due=service.nextDailyPublicRefresh(now);assert.equal(await service.claimPublicSource(database,due-1),null);const next=await service.claimPublicSource(database,due);assert.ok(next,'The next daily run becomes eligible at 9 AM.');
});
const listing=(suffix=1,changes={})=>({vin:'1HGCM82633A004'+String(suffix).padStart(3,'0'),year:2023,make:'Honda',model:'Accord',trim:'EX',condition:'Used',mileage:12000,price:25000,dealer:'Public A',url:'https://a.example/vehicle/'+suffix,sourceUrl:'https://a.example/inventory/used',observedAt:new Date(now).toISOString(),...changes});
const collection=(listings=[listing()],changes={})=>({listings,expectedCount:listings.length,pages:1,complete:true,observedAt:new Date(now).toISOString(),...changes});
const raw=(database,id='a')=>JSON.parse(database.sqlite.prepare('SELECT data FROM records WHERE id=?').get('system:public-source:'+id).data);
const record=data=>({id:'public:'+data.vin,kind:'comp',data:{...data,publicListing:true},revision:0,updatedAt:data.observedAt});
let database;
beforeEach(()=>{database=new D1();globalThis.__publicEnv.DB=database;globalThis.__publicSeedVehicles.length=0;globalThis.__publicSeedComparables.length=0;});

test('only fixed registry sources are initialized; repeated sync preserves jobs and dealership records',async()=>{
 database.sqlite.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?)').run('dealer-note','task',JSON.stringify({notes:'Keep this private note'}),4,new Date(now).toISOString(),'dealer','manual');
 await service.syncPublicSources(database,now);const lease=await service.claimPublicSource(database,now);assert.equal(lease.id,'a');await service.commitPublicSuccess(database,lease,collection(),now+1000);const before=raw(database);
 await service.syncPublicSources(database,now+2000);assert.deepEqual(raw(database),before);assert.equal(database.sqlite.prepare('SELECT revision FROM records WHERE id=?').get('dealer-note').revision,4);assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS count FROM records WHERE kind=\'system\'').get().count,2);
});

test('concurrent runners lease each due registry source only once',async()=>{
 await service.syncPublicSources(database,now);const leases=await Promise.all([service.claimPublicSource(database,now),service.claimPublicSource(database,now),service.claimPublicSource(database,now)]);
 assert.deepEqual(leases.filter(Boolean).map(lease=>lease.id).sort(),['a','b']);assert.equal(leases.filter(Boolean).length,2);
});

test('due regional sources precede lexically earlier expanded sources without blocking their next claim',async()=>{
 const regional={...globalThis.__publicSources[0],id:'z-regional',name:'Regional Z',url:'https://z.example/inventory/used',scope:'regional'};
 globalThis.__publicSources.push(regional);
 try{
  await service.syncPublicSources(database,now);const order=[];
  for(let index=0;index<3;index++){
   const lease=await service.claimPublicSource(database,now);order.push(lease.id);
   const vehicle=listing(index+1,{condition:lease.source.condition,url:new URL('/v/1',lease.source.url).href,sourceUrl:lease.source.url});
   assert.equal(await service.commitPublicSuccess(database,lease,collection([vehicle]),now),true);
  }
  assert.deepEqual(order,['z-regional','a','b']);
  assert.equal(await service.claimPublicSource(database,now),null);
 }finally{globalThis.__publicSources.pop();}
});

test('expired or superseded leases cannot overwrite source snapshots or mark replacement work failed',async()=>{
 await service.syncPublicSources(database,now);const old=await service.claimPublicSource(database,now,1000);assert.equal(await service.commitPublicSuccess(database,old,collection(),now+1001),false);
 const replacement=await service.claimPublicSource(database,now+1001);assert.equal(replacement.id,'a');assert.notEqual(replacement.token,old.token);assert.equal(await service.failPublicSource(database,old,{code:'blocked'},now+1002),false);
 assert.equal(await service.commitPublicSuccess(database,replacement,collection(),now+1003),true);assert.equal(raw(database).status,'ready');
});

test('source failures preserve prior listings, observation times and success while storing only safe codes',async()=>{
 await service.syncPublicSources(database,now);const first=await service.claimPublicSource(database,now);await service.commitPublicSuccess(database,first,collection(),now+1000);const before=raw(database);
 const retryAt=service.nextDailyPublicRefresh(now)+1001,retry=await service.claimPublicSource(database,retryAt);assert.equal(retry.id,'b');await service.failPublicSource(database,retry,{code:'access_denied'},retryAt+1);
 const actualRetry=await service.claimPublicSource(database,retryAt+2);assert.equal(actualRetry.id,'a');await service.failPublicSource(database,actualRetry,{code:'https://private.example?key=SECRET&body=SOURCE_HTML'},retryAt+3);
 const after=raw(database);assert.deepEqual(after.listings,before.listings);assert.equal(after.observedAt,before.observedAt);assert.equal(after.lastSuccessAt,before.lastSuccessAt);assert.equal(after.status,'error');assert.equal(after.lastErrorCode,'unavailable');assert.equal(JSON.stringify(after).includes('SECRET'),false);assert.equal(JSON.stringify(after).includes('SOURCE_HTML'),false);
});

test('complete snapshots replace only their source; unrelated seeds and manually supplied records survive',async()=>{
 await service.syncPublicSources(database,now);const lease=await service.claimPublicSource(database,now);await service.commitPublicSuccess(database,lease,collection([listing(2)]),now+1000);
 const manual={id:'manual',kind:'comp',data:{...listing(8),manuallySupplied:true},revision:2,updatedAt:new Date(now).toISOString()},other=record(listing(3,{url:'https://b.example/v/3',sourceUrl:'https://b.example/new'}));
 const merged=service.mergePublicMarketRecords([record(listing(1)),other,manual],await service.readPublicSourceSnapshots(database));
 assert.deepEqual(merged.map(entry=>entry.id).sort(),['manual',other.id,'public:'+listing(2).vin].sort());assert.equal(merged.find(entry=>entry.id==='manual').revision,2);
});

test('partial collection never removes prior source VINs or revives legacy rows previously removed by a complete snapshot',async()=>{
 await service.syncPublicSources(database,now);const lease=await service.claimPublicSource(database,now);await service.commitPublicSuccess(database,lease,collection([listing(2)]),now+1000);
 const other=await service.claimPublicSource(database,now+1001);await service.failPublicSource(database,other,{code:'blocked'},now+1002);
 const later=service.nextDailyPublicRefresh(now)+1001,retry=await service.claimPublicSource(database,later);await service.failPublicSource(database,retry,{code:'blocked'},later+1);const source=await service.claimPublicSource(database,later+2);assert.equal(source.id,'a');
 const observedAt=new Date(later).toISOString();await service.commitPublicSuccess(database,source,collection([listing(3,{observedAt})],{complete:false,expectedCount:null,observedAt}),later+3);
 const snapshot=raw(database);assert.equal(snapshot.complete,false);assert.equal(snapshot.hasCompleteSnapshot,true);assert.deepEqual(snapshot.listings.map(value=>value.vin).sort(),[listing(2).vin,listing(3).vin].sort());assert.equal(snapshot.listings.find(value=>value.vin===listing(2).vin).observedAt,new Date(now).toISOString());
 const merged=service.mergePublicMarketRecords([record(listing(1))],await service.readPublicSourceSnapshots(database));assert.equal(merged.some(entry=>entry.data.vin===listing(1).vin),false);
});

test('unverified totals fail before source replacement, and normalized storage drops raw source bodies',async()=>{
 await service.syncPublicSources(database,now);const lease=await service.claimPublicSource(database,now);
 await assert.rejects(service.commitPublicSuccess(database,lease,collection([listing()],{expectedCount:2}),now+1),/Incomplete/);assert.equal(raw(database).listings,undefined);
 await service.commitPublicSuccess(database,lease,collection([{...listing(),fuelType:'Diesel',transmission:'Automatic',rawHtml:'SOURCE_BODY',secret:'DO_NOT_SAVE'}]),now+2);const saved=raw(database),text=JSON.stringify(saved);assert.equal(text.includes('SOURCE_BODY'),false);assert.equal(text.includes('DO_NOT_SAVE'),false);assert.equal(saved.listings[0].fuelType,'Diesel');assert.equal(saved.listings[0].transmission,'Automatic');
});

test('workspace merge and status share strict matching for all current and future inventory, with no paid provider calls',async()=>{
 await service.syncPublicSources(database,now);const lease=await service.claimPublicSource(database,now);await service.commitPublicSuccess(database,lease,collection([listing(1),listing(2),listing(3)]),now+1);
 globalThis.__publicSeedComparables.push(listing(8,{url:'https://unrelated.example/v/8',sourceUrl:'https://unrelated.example/inventory'}));globalThis.__publicSeedVehicles.push(listing(90,{url:'https://betten.example/v/90'}));
 let workspace=await server.workspace(),status=await service.publicMarketStatus(database,workspace,now+100);assert.equal(workspace.records.filter(entry=>entry.kind==='comp').length,4);assert.equal(status.coverage.total,1);assert.equal(status.coverage.withEnoughData,1);assert.equal(status.subscriptionCost,0);assert.equal(status.mode,'public');assert.equal(status.totalListings,4);assert.equal(status.sources.find(source=>source.id==='a').count,3);assert.equal(workspace.records.some(entry=>entry.kind==='system'),false);
 globalThis.__publicSeedVehicles.push(listing(91,{model:'Civic'}));workspace=await server.workspace();status=await service.publicMarketStatus(database,workspace,now+200);assert.equal(status.coverage.total,2);assert.equal(status.coverage.withMatches,1);assert.equal(status.coverage.vehicles.find(vehicle=>vehicle.vin===listing(91).vin).count,0);
 const stale=await service.publicMarketStatus(database,workspace,now+15*86400000);assert.equal(stale.coverage.withMatches,0);assert.equal(stale.sources.find(source=>source.id==='a').stale,true);
});

test('refresh endpoint rejects caller URLs, invalid limits and cross-origin writes before any collector runs',async()=>{
 const request=(body,origin='https://betten.example')=>new Request('https://betten.example/api/public-market/refresh',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 for(const input of [{url:'https://internal.example',limit:1},{limit:0},{limit:4}])assert.equal((await route.POST(request(input))).status,400);
 assert.equal((await route.POST(request({limit:1},'https://other.example'))).status,403);assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS count FROM records').get().count,0);
});

test('bounded public refresh uses shared source collection and skips work until due',async()=>{
 let requests=0;const collector=async(source,_fetcher,stamp)=>{requests++;const observedAt=new Date(stamp).toISOString();return collection([listing(source.id==='a'?1:2,{url:new URL('/v/1',source.url).href,sourceUrl:source.url,condition:source.condition,observedAt})],{observedAt});};
 const first=await service.refreshPublicMarkets(database,3,now,collector);assert.equal(first.processed,1);assert.equal(requests,1);assert.equal((await service.refreshPublicMarkets(database,3,now+1000,collector)).processed,1);assert.equal((await service.refreshPublicMarkets(database,3,now+2000,collector)).processed,0);assert.equal(requests,2);
});

test('a complete brand feed cannot retire another brand on the same dealer origin, or newer independent observations',async()=>{
 await service.syncPublicSources(database,now);const lease=await service.claimPublicSource(database,now);await service.commitPublicSuccess(database,lease,collection([listing(2)]),now+1);
 const otherBrand=record(listing(3,{sourceUrl:'https://a.example/inventory/new'})),newer=record(listing(2,{price:26000,observedAt:new Date(now+10000).toISOString()})),absentNewer=record(listing(4,{observedAt:new Date(now+10000).toISOString()}));
 const merged=service.mergePublicMarketRecords([otherBrand,newer,absentNewer],await service.readPublicSourceSnapshots(database));assert.equal(merged.some(entry=>entry.id===otherBrand.id),true);assert.equal(merged.some(entry=>entry.id===absentNewer.id),true);assert.equal(merged.find(entry=>entry.id===newer.id).data.price,26000);
});

test('source configuration changes queue fresh work and report retained observations as pending and stale',async()=>{
 await service.syncPublicSources(database,now);const lease=await service.claimPublicSource(database,now);await service.commitPublicSuccess(database,lease,collection(),now+1);
 database.sqlite.prepare("UPDATE records SET data=json_set(data,'$.fingerprint','old-registry-version') WHERE id='system:public-source:a'").run();await service.syncPublicSources(database,now+2);
 const status=await service.publicMarketStatus(database,await server.workspace(),now+3),source=status.sources.find(value=>value.id==='a');assert.equal(source.status,'pending');assert.equal(source.stale,true);assert.equal(source.count,1);
});

test('all current and subsequently imported new vehicles use the same public sample, without any licensed API calls',async()=>{
 await service.syncPublicSources(database,now);const used=await service.claimPublicSource(database,now);await service.failPublicSource(database,used,{code:'blocked'},now+1);const fresh=await service.claimPublicSource(database,now+2);assert.equal(fresh.id,'b');
 const condition='New';await service.commitPublicSuccess(database,fresh,collection([listing(1,{condition}),listing(2,{condition}),listing(3,{condition})]),now+3);globalThis.__publicSeedVehicles.push(listing(90,{condition}));
 let status=await service.publicMarketStatus(database,await server.workspace(),now+4);assert.equal(status.coverage.withEnoughData,1);globalThis.__publicSeedVehicles.push(listing(91,{condition}));status=await service.publicMarketStatus(database,await server.workspace(),now+5);assert.equal(status.coverage.total,2);assert.equal(status.coverage.withEnoughData,2);assert.equal(status.coverage.vehicles.every(vehicle=>vehicle.count===3),true);
 const source=readFileSync(new URL('lib/public-market-service.ts',root),'utf8');assert.equal(/from ['"].*market-(?:provider|service|jobs)['"]/.test(source),false);
});

test('daily refresh time follows Detroit daylight saving changes and never drifts with collection duration',()=>{
 for(const [time,expected] of [['2026-10-21T12:59:00Z','2026-10-21T13:00:00.000Z'],['2026-10-21T13:00:30Z','2026-10-22T13:00:00.000Z'],['2026-10-31T18:00:00Z','2026-11-01T14:00:00.000Z'],['2027-03-13T18:00:00Z','2027-03-14T13:00:00.000Z']])assert.equal(new Date(service.nextDailyPublicRefresh(Date.parse(time))).toISOString(),expected);
});

test('pending detail passes are immediately resumable, then the source returns to the daily schedule',async()=>{
 await service.syncPublicSources(database,now);const lease=await service.claimPublicSource(database,now);await service.commitPublicSuccess(database,lease,collection([listing()],{pendingDetails:1,detailsChecked:0,detailsFailed:0}),now+100);assert.equal(raw(database).pendingDetails,1);assert.equal(raw(database).nextRunAt,now+100);
 const other=await service.claimPublicSource(database,now+101);await service.commitPublicSuccess(database,other,collection(),now+102);const pass=await service.claimPublicSource(database,now+103);assert.equal(pass.id,'a');await service.commitPublicSuccess(database,pass,collection(),now+104);assert.equal(raw(database).pendingDetails,0);assert.equal(raw(database).nextRunAt,service.nextDailyPublicRefresh(now+104));
});

const importedAggregate=(vins,changes={})=>({
 vins,count:vins.length,observedAt:new Date(now+2000).toISOString(),
 report:{mode:'complete_selected_source_aggregate',complete:true,uniqueVehicles:vins.length,generatedAt:new Date(now+3000).toISOString(),sources:[{id:'a',url:'https://a.example/inventory/used',status:'verified',expectedCount:1,retailCount:1,wholesaleExcluded:0,observedAt:new Date(now+2000).toISOString()}]},...changes,
});
const savedSnapshot=(id,listings)=>({id,fingerprint:'saved',status:'error',nextRunAt:now,lastSuccessAt:now,complete:true,observedAt:new Date(now).toISOString(),listings});

test('a verified complete browser import prevents an old automatic snapshot from reviving its retired VIN',()=>{
 const current=record(listing(2,{price:26000,observedAt:new Date(now+2000).toISOString()})),retired=listing(1),manual={id:'manual',kind:'comp',data:{...listing(8),manuallySupplied:true},revision:2,updatedAt:new Date(now).toISOString()},privateRecord={id:'private-note',kind:'task',data:{notes:'Private dealership note'},revision:4};
 const records=[current,manual,privateRecord],snapshots=[savedSnapshot('a',[retired,listing(2)])],before=structuredClone({records,snapshots});
 const merged=service.mergePublicMarketRecords(records,snapshots,importedAggregate([current.data.vin]),now+4000);
 assert.equal(merged.some(entry=>entry.data.vin===retired.vin),false);assert.equal(merged.find(entry=>entry.id===current.id).data.price,26000);assert.deepEqual(merged.find(entry=>entry.id===manual.id),manual);assert.deepEqual(merged.find(entry=>entry.id===privateRecord.id),privateRecord);assert.deepEqual({records,snapshots},before);
});

test('source-specific import retirement preserves failed sources, other feed paths and newer automatic VINs',()=>{
 const allowed=record(listing(2,{observedAt:new Date(now+2000).toISOString()})),fresh=listing(3,{observedAt:new Date(now+2001).toISOString()}),other=listing(4,{condition:'New',publicSourceId:'b',sourceUrl:'https://b.example/new',url:'https://b.example/vehicle/4'}),differentPath=listing(5,{sourceUrl:'https://a.example/inventory/new'});
 const imported=importedAggregate([allowed.data.vin]);imported.report.sources.push({id:'b',url:'https://b.example/new',status:'preserved_previous',expectedCount:0,retailCount:0,wholesaleExcluded:0,observedAt:new Date(now+2000).toISOString()});
 const merged=service.mergePublicMarketRecords([allowed],[savedSnapshot('a',[listing(1),fresh,differentPath]),savedSnapshot('b',[other])],imported,now+4000);
 assert.equal(merged.some(entry=>entry.data.vin===listing(1).vin),false);for(const row of [fresh,other,differentPath])assert.equal(merged.some(entry=>entry.data.vin===row.vin),true,row.vin);
});

test('missing, malformed, future, unrelated and older import proofs cannot retire automatic listings',()=>{
 const current=record(listing(2,{observedAt:new Date(now+2000).toISOString()})),old=listing(1),baseline=importedAggregate([current.data.vin]);
 const cases=[undefined,{}, {...baseline,report:undefined},{...baseline,count:2},{...baseline,vins:[current.data.vin,current.data.vin],count:2},{...baseline,observedAt:'bad'},...[
  report=>{report.mode='partial';},report=>{report.complete=false;},report=>{report.uniqueVehicles=2;},report=>{report.generatedAt='bad';},report=>{report.sources[0].id='unknown';},report=>{report.sources[0].url='https://a.example/inventory/new';},report=>{report.sources[0].status='preserved_previous';},report=>{report.sources[0].expectedCount=2;},report=>{report.sources[0].retailCount=-1;},report=>{report.sources[0].wholesaleExcluded=undefined;},report=>{report.sources[0].observedAt='bad';},report=>{report.sources[0].observedAt=new Date(now+999999999).toISOString();},report=>{report.sources[0].observedAt=new Date(now-1).toISOString();},report=>{report.sources[0].observedAt=new Date(now+3500).toISOString();},report=>{report.sources[0].observedAt=new Date(now+2500).toISOString();},
 ].map(mutate=>{const candidate=structuredClone(baseline);mutate(candidate.report);return candidate;})];
 for(const candidate of cases){const merged=service.mergePublicMarketRecords([current],[savedSnapshot('a',[old])],candidate,now+4000);assert.equal(merged.some(entry=>entry.data.vin===old.vin),true,JSON.stringify(candidate));}
});

test('workspace forwards saved complete-source proof while preserving private records and later automatic discoveries',async()=>{
 await service.syncPublicSources(database,now);const lease=await service.claimPublicSource(database,now);await service.commitPublicSuccess(database,lease,collection([listing(1),listing(2)]),now+1);
 const current=listing(2,{price:26000,observedAt:new Date(now+2000).toISOString()}),proof=importedAggregate([current.vin]);globalThis.__publicSeedComparables.push(current);
 database.sqlite.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?)').run('system:marketSnapshot','system',JSON.stringify(proof),1,new Date(now+3000).toISOString(),'service','import');
 const privateData={notes:'Keep this private note',cost:20000};database.sqlite.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?)').run('dealer-note','task',JSON.stringify(privateData),4,new Date(now).toISOString(),'dealer','manual');
 let workspace=await server.workspace();assert.deepEqual(workspace.records.filter(entry=>entry.kind==='comp').map(entry=>entry.data.vin),[current.vin]);assert.deepEqual(workspace.records.find(entry=>entry.id==='dealer-note').data,privateData);
 const snapshot=raw(database);snapshot.listings.push(listing(3,{observedAt:new Date(now+4000).toISOString()}));database.sqlite.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(snapshot),'system:public-source:a');
 workspace=await server.workspace();assert.equal(workspace.records.some(entry=>entry.data.vin===listing(1).vin),false);assert.equal(workspace.records.some(entry=>entry.data.vin===listing(3).vin),true);assert.equal(database.sqlite.prepare('SELECT revision FROM records WHERE id=?').get('dealer-note').revision,4);assert.deepEqual(JSON.parse(database.sqlite.prepare('SELECT data FROM records WHERE id=?').get('system:marketSnapshot').data),proof);
});
