/**
 * Integration tests of the actual API handlers and import service with SQLite.
 * The adapter implements D1's prepared-statement/batch surface; no query is copied
 * from the implementation. Run: node --test tests/backend-integrity.test.mjs
 */
import assert from 'node:assert/strict';
import {beforeEach, test} from 'node:test';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

const root=new URL('../',import.meta.url);
globalThis.__testEnv={};
globalThis.__testSeedVehicles=[];
globalThis.__testSeedSources={};
globalThis.__testSeedComps=[];

function loadTypeScript(path,replacements=[]){
 let source=readFileSync(new URL(path,root),'utf8');
 source=source.replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+access-model['"];?/g,'const {$1}=globalThis.__testAccessModel;').replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+access['"];?/g,'const {$1}=globalThis.__testAccess;');
 for(const [pattern,replacement] of replacements)source=source.replace(pattern,replacement);
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
globalThis.__testMarketSources={};
globalThis.__testAccessModel=await loadTypeScript('lib/access-model.ts');
globalThis.__testAccess=await loadTypeScript('lib/access.ts',[[/import\s*\{[^}]+\}\s*from\s*['"]cloudflare:workers['"];?/, 'const env=globalThis.__testEnv;']]);
globalThis.__dashboardMetrics=await loadTypeScript('lib/dashboard-metrics.ts');
const server=await loadTypeScript('lib/server.ts',[
 [/import\s*\{[^}]+\}\s*from\s*['"]\.\/dashboard-metrics['"];?/,'const {buildDashboardSnapshot}=globalThis.__dashboardMetrics;'],
 [/import\s*\{[^}]+\}\s*from\s*['"]\.\/public-market-service['"];?/,'const readPublicSourceSnapshots=async()=>[];const mergePublicMarketRecords=(records)=>records;'],
 [/async function loadSeeds\(\)\{[\s\S]*?\n\}/,'async function loadSeeds(){return {vehicles:globalThis.__testSeedVehicles,comparables:globalThis.__testSeedComps};}'],
 [/import\s*\{\s*env\s*\}\s*from\s*['"]cloudflare:workers['"];?/,'const env=globalThis.__testEnv;'],
 [/import\s+seedVehiclesJSON\s+from\s+['"].*?seed-inventory.json\?raw['"];?\s*const seedVehicles:Vehicle\[\]=JSON.parse\(seedVehiclesJSON\);/,'const seedVehicles=globalThis.__testSeedVehicles;'],
 [/import\s+seedSources\s+from\s+['"].*?seed-sources.json['"];?/,'const seedSources=globalThis.__testSeedSources;'],
 [/import\s+seedMarketSources\s+from\s+['"].*?seed-market-sources.json['"];?/,'const seedMarketSources=globalThis.__testMarketSources;']
 ,[/import\s+seedCompsJSON\s+from\s+['"].*?seed-comps.json\?raw['"];?\s*const seedComps:any\[\]=JSON.parse\(seedCompsJSON\);/,'const seedComps=globalThis.__testSeedComps;']
]);
globalThis.__testServer=server;
globalThis.__testValidation=await loadTypeScript('lib/validation.ts');
const records=await loadTypeScript('app/api/records/route.ts',[
 [/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+server['"];?/,'const {$1}=globalThis.__testServer;'],
 [/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+validation['"];?/,'const {$1}=globalThis.__testValidation;']
]);
const restore=await loadTypeScript('app/api/restore/route.ts',[
 [/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+server['"];?/,'const {$1}=globalThis.__testServer;'],
 [/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+validation['"];?/,'const {$1}=globalThis.__testValidation;']
]);
const exporter=await loadTypeScript('app/api/export/route.ts',[
 [/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+server['"];?/,'const {$1}=globalThis.__testServer;']
]);


const market=await loadTypeScript('app/api/market-import/route.ts',[
 [/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+server['"];?/,'const {$1}=globalThis.__testServer;'],
 [/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+validation['"];?/,'const {$1}=globalThis.__testValidation;']
]);

const dealerImport=await loadTypeScript('app/api/dealer-import/route.ts',[
 [/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+server['"];?/,'const {$1}=globalThis.__testServer;'],
 [/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+validation['"];?/,'const {$1}=globalThis.__testValidation;']
]);

class D1 {
 constructor(){
  this.sqlite=new DatabaseSync(':memory:');
  this.sqlite.exec(`
   CREATE TABLE records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,actor TEXT NOT NULL,mutation_id TEXT NOT NULL);
   CREATE TABLE inventory(vin TEXT PRIMARY KEY,data TEXT NOT NULL,observed_at TEXT NOT NULL);
   CREATE TABLE audit(id TEXT PRIMARY KEY,action TEXT NOT NULL,record_id TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL);
   CREATE TABLE sync_runs(id TEXT PRIMARY KEY,source TEXT NOT NULL,status TEXT NOT NULL,count INTEGER NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL);
  `);
 }
 prepare(sql){
  const sqlite=this.sqlite;
  return new class {
   constructor(args=[]){this.args=args;}
   bind(...args){return new this.constructor(args);}
   async all(){return {results:sqlite.prepare(sql).all(...this.args)};}
   async first(){return sqlite.prepare(sql).get(...this.args)||null;}
   async run(){sqlite.prepare(sql).run(...this.args);}
  };
 }
 async batch(statements){
  this.sqlite.exec('BEGIN');
  try{
   const results=[];
   for(const s of statements)results.push(await s.all());
   this.sqlite.exec('COMMIT');return results;
  }catch(error){this.sqlite.exec('ROLLBACK');throw error;}
 }
}

let d1;
beforeEach(()=>{d1=new D1();globalThis.__testEnv.DB=d1;globalThis.__testSeedVehicles.length=0;globalThis.__testSeedComps.length=0;for(const key of Object.keys(globalThis.__testSeedSources))delete globalThis.__testSeedSources[key];});
const request=(payload,method='POST')=>new Request('https://betten.example/api/records',{method,headers:{origin:'https://betten.example','content-type':'application/json','oai-authenticated-user-email':'jamingray555@gmail.com'},body:JSON.stringify(payload)});
const save=(id,revision,data={note:'original'},kind='task')=>records.POST(request({id,kind,revision,data}));
const vehicle=(suffix,price=30000)=>({vin:'1HGCM82633A004'+String(suffix).padStart(3,'0'),year:2023,make:'Honda',model:'Accord',price,mileage:10000,photos:[],url:'https://dealer.example/vehicle/'+suffix});
const importRequest=new Request('https://betten.example/api/import',{headers:{origin:'https://betten.example'}});
async function importAll(vehicles,extra={}){return server.importVehicles({vehicles,source:'test feed',...extra},importRequest);}

test('appraisal market summary persists with its filters and up to 200 comparison VINs while preserving a negative offer',async()=>{
 const data={year:2023,title:'2023 Honda Accord',marketAverage:30123.45,marketMedian:30000,marketMin:28000,marketMax:33000,marketSuggestedListPrice:30000,marketSampleCount:205,marketSourceCount:4,marketComparedAt:'2026-10-20T15:00:00.000Z',marketBasis:'Regional advertised asking prices; no condition adjustment.',marketVinList:Array.from({length:200},(_,i)=>vehicle(i).vin).join(','),marketYearDelta:1,marketMileageDelta:25000,marketMaxAgeDays:14,marketExactTrim:false,marketAppliedBasis:'median',offer:-500};
 const response=await save('market-appraisal',0,data,'appraisal');
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).record.data,data);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,1);
});

test('malformed appraisal market summaries and filters fail before any write or audit event',async()=>{
 const invalid=[{marketAverage:-1},{marketMedian:'Infinity'},{marketMin:'NaN'},{marketMax:true},{marketSuggestedListPrice:''},{year:2023.5},{year:1885},{marketSampleCount:-1},{marketSampleCount:1.5},{marketSourceCount:10001},{marketYearDelta:11},{marketMileageDelta:-1},{marketMaxAgeDays:0},{marketMaxAgeDays:1.5},{marketExactTrim:'false'},{marketComparedAt:'2026-10-20'},{marketComparedAt:'not-a-date'},{marketVinList:'invalid'},{marketVinList:Array.from({length:201},(_,i)=>vehicle(i).vin).join(',')},{marketBasis:17}];
 for(const data of invalid){
  const response=await save('invalid-market-appraisal',0,data,'appraisal');
  assert.equal(response.status,400,JSON.stringify(data));
 }
 for(const price of [Infinity,-Infinity,NaN])assert.throws(()=>globalThis.__testValidation.validateRecord({id:'invalid',kind:'appraisal',data:{marketAverage:price}}),/finite nonnegative/);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,0);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,0);
});

test('older appraisals without a market summary remain editable and null market prices remain unknown',async()=>{
 const data={title:'Trade appraisal',targetRetail:30000,targetGross:3000,recon:1000,transport:0,fees:0,selling:0,carry:0,offer:26000};
 assert.equal((await save('legacy-appraisal',0,data,'appraisal')).status,200);
 const updated={...data,notes:'Reviewed',marketAverage:null,marketMedian:null,marketSuggestedListPrice:null};
 const response=await save('legacy-appraisal',1,updated,'appraisal');
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).record.data,updated);
});

test('new record starts at revision one; stale update cannot overwrite a newer edit or append an audit event',async()=>{
 let response=await save('task-one',0);assert.equal(response.status,200);
 assert.equal((await response.json()).record.revision,1);
 response=await save('task-one',1,{note:'newest'});assert.equal(response.status,200);
 assert.equal((await response.json()).record.revision,2);
 response=await save('task-one',1,{note:'stale'});assert.equal(response.status,409);
 const row=d1.sqlite.prepare('SELECT * FROM records WHERE id=?').get('task-one');
 assert.equal(JSON.parse(row.data).note,'newest');assert.equal(row.revision,2);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,2);
});

test('a nonexistent record cannot be created from a stale nonzero revision',async()=>{
 const response=await save('never-existed',7,{note:'stale'});
 assert.equal(response.status,409);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,0);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,0);
});

test('a stale editor cannot resurrect a record after it is deleted',async()=>{
 await save('deleted-task',0);
 const deletion=await records.DELETE(request({id:'deleted-task',revision:1},'DELETE'));
 assert.equal(deletion.status,200);
 const stale=await save('deleted-task',1,{note:'resurrected'});
 assert.equal(stale.status,409);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,0);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,2);
});

test('record ids cannot overwrite a different record kind',async()=>{
 await save('shared-id',0,{note:'task'},'task');
 const response=await save('shared-id',1,{note:'appraisal'},'appraisal');
 assert.equal(response.status,409);
 assert.equal(d1.sqlite.prepare('SELECT kind FROM records WHERE id=?').get('shared-id').kind,'task');
});

test('cross-origin writes are rejected before any database mutation',async()=>{
 const response=await records.POST(new Request('https://betten.example/api/records',{method:'POST',headers:{origin:'https://attacker.example'},body:JSON.stringify({id:'x',kind:'task',data:{},revision:0})}));
 assert.equal(response.status,400);assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,0);
});

test('a malformed or duplicate-VIN import preserves the existing inventory and user work',async()=>{
 const v=vehicle(101);await importAll([v]);
 await save(v.vin,0,{cost:25000,note:'keep my work'},'vehicle');
 await assert.rejects(importAll([vehicle(102),{...vehicle(103),price:-1}]));
 await assert.rejects(importAll([v,v]));
 const state=await server.workspace();
 assert.equal(state.vehicles.length,1);assert.equal(state.vehicles[0].vin,v.vin);
 assert.equal(state.records.find(r=>r.id===v.vin).data.note,'keep my work');
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM sync_runs').get().n,1);
});

test('refresh replaces source asking price while preserving independent dealer planning records and first observation',async()=>{
 const v=vehicle(201);await importAll([v]);
 const before=(await server.workspace()).vehicles[0].firstSeen;
 await save(v.vin,0,{cost:25000,targetPrice:31000,note:'price review'},'vehicle');
 await importAll([{...v,price:29000}]);
 const state=await server.workspace();
 assert.equal(state.vehicles[0].price,29000);assert.equal(state.vehicles[0].firstSeen,before);
 assert.equal(state.records.find(r=>r.id===v.vin).data.targetPrice,31000);
});

test('concurrent partial imports after a complete snapshot retain both newly observed vehicles',async()=>{
 // Same source timestamp is deliberate: two requests may share millisecond
 // precision, or come from the same exported feed batch.
 const observedAt='2025-02-01T12:00:00.000Z';
 const initial=[vehicle(301),vehicle(302)].map(v=>({...v,observedAt}));
 await importAll(initial,{complete:true,expectedCount:2});
 // D1 executes transactions serially. Gate only the import preparation stage so
 // both requests observe the same starting state before their transaction runs.
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 let pending=0;
 const original=d1.batch.bind(d1);
 let queue=Promise.resolve();
 d1.batch=async statements=>{
  pending++;if(pending===2)release();await gate;
  const result=queue.then(()=>original(statements));queue=result.catch(()=>{});return result;
 };
 await Promise.all([importAll([{...vehicle(303),observedAt}]),importAll([{...vehicle(304),observedAt}])]);
 const vins=(await server.workspace()).vehicles.map(v=>v.vin);
 assert.deepEqual(vins.sort(),[...initial,vehicle(303),vehicle(304)].map(v=>v.vin).sort());
});

test('complete snapshots require matching source totals and preserve absent listings as unconfirmed archive',async()=>{
 const initial=[vehicle(401),vehicle(402),vehicle(403),vehicle(404)];await importAll(initial);
 await save(initial[3].vin,0,{note:'retain internal work'},'vehicle');
 await assert.rejects(importAll(initial.slice(0,3),{complete:true,expectedCount:4}));
 assert.equal((await server.workspace()).vehicles.length,4);
 await importAll(initial.slice(0,3),{complete:true,expectedCount:3});
 const state=await server.workspace();
 assert.equal(state.vehicles.length,3);assert.equal(state.archivedVehicles.length,1);
 assert.equal(state.archivedVehicles[0].vin,initial[3].vin);
 assert.equal(state.records.find(r=>r.id===initial[3].vin).data.note,'retain internal work');
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory').get().n,4);
});

test('a returning archived VIN keeps its original first-observed date',async()=>{
 const initial=[vehicle(501),vehicle(502),vehicle(503),vehicle(504)];
 initial[3].firstSeen='2025-01-01T12:00:00.000Z';await importAll(initial);
 await importAll(initial.slice(0,3),{complete:true,expectedCount:3});
 assert.equal((await server.workspace()).archivedVehicles[0].firstSeen,initial[3].firstSeen);
 await importAll([{...initial[3],firstSeen:'2026-01-01T12:00:00.000Z'}]);
 const persisted=JSON.parse(d1.sqlite.prepare('SELECT data FROM inventory WHERE vin=?').get(initial[3].vin).data);
 assert.equal(persisted.firstSeen,initial[3].firstSeen);
});

test('observation timestamps normalize timezone offsets so stale source data cannot overwrite newer prices',async()=>{
 const v=vehicle(601);
 await importAll([{...v,price:30000,observedAt:'2020-10-20T10:00:00-04:00'}]);
 await importAll([{...v,price:31000,observedAt:'2020-10-20T13:30:00Z'}]);
 let persisted=JSON.parse(d1.sqlite.prepare('SELECT data FROM inventory WHERE vin=?').get(v.vin).data);
 assert.equal(persisted.price,30000);
 assert.equal(persisted.observedAt,'2020-10-20T14:00:00.000Z');
 await importAll([{...v,price:32000,observedAt:'2020-10-20T15:00:00Z'}]);
 persisted=JSON.parse(d1.sqlite.prepare('SELECT data FROM inventory WHERE vin=?').get(v.vin).data);
 assert.equal(persisted.price,32000);
});

test('an older uploaded feed cannot override a newer vehicle supplied by the immutable seed',async()=>{
 const seed={...vehicle(701),price:35000,observedAt:'2025-02-01T14:00:00.000Z',firstSeen:'2025-01-01T00:00:00.000Z'};
 globalThis.__testSeedVehicles.push(seed);
 await importAll([{...seed,price:10000,observedAt:'2024-01-01T00:00:00.000Z'}]);
 const state=await server.workspace();
 assert.equal(state.vehicles[0].price,35000);
 assert.equal(state.vehicles[0].firstSeen,'2025-01-01T00:00:00.000Z');
});

test('additive restore recovers missing work and inventory while preserving existing user edits',async()=>{
 const existing=vehicle(801),missing=vehicle(802);await importAll([existing]);
 await save('existing-task',0,{note:'keep the current edit'});
 const backup={format:'betten-inventory-v1',exportedAt:'2025-01-01T00:00:00Z',vehicles:[{...existing,price:1},missing],records:[{id:'existing-task',kind:'task',data:{note:'old backup'}},{id:'recovered-task',kind:'task',data:{note:'restore me'}}]};
 const response=await restore.POST(request({backup}));assert.equal(response.status,200);
 const state=await server.workspace();
 assert.equal(state.vehicles.find(v=>v.vin===existing.vin).price,existing.price);
 assert.equal(state.vehicles.length,2);
 assert.equal(state.records.find(r=>r.id==='existing-task').data.note,'keep the current edit');
 assert.equal(state.records.find(r=>r.id==='recovered-task').data.note,'restore me');
});

test('saves and restores reject reserved ids and malformed records before any write',async()=>{
 const badRecords=[
  {id:'system:inventorySnapshot',kind:'task',data:{note:'cannot replace snapshot'}},
  {id:'',kind:'task',data:{}},
  {id:'array-data',kind:'task',data:[]},
  {id:'not-a-vin',kind:'vehicle',data:{}},
  {id:'negative-cost',kind:'task',data:{cost:-1}},
  {id:'bad-date',kind:'task',data:{dueDate:'not a date'}},
  {id:'nested',kind:'task',data:{note:{unexpected:'object'}}}
 ];
 for(const invalid of badRecords){
  const write=await records.POST(request({...invalid,revision:0}));assert.equal(write.status,400,JSON.stringify(invalid));
  const backup={format:'betten-inventory-v1',vehicles:[vehicle(901)],records:[{id:'valid-before-invalid',kind:'task',data:{note:'should rollback'}},invalid]};
  const restored=await restore.POST(request({backup}));assert.equal(restored.status,400,JSON.stringify(invalid));
 }
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,0);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory').get().n,0);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,0);
});

test('restore validates archived inventory type and bounds total current plus archived vehicles',async()=>{
 const base={format:'betten-inventory-v1',vehicles:[],records:[]};
 let response=await restore.POST(request({backup:{...base,archivedVehicles:{vin:'wrong type'}}}));assert.equal(response.status,400);
 response=await restore.POST(request({backup:{...base,vehicles:[vehicle(902)],archivedVehicles:Array(5000).fill(vehicle(903))}}));assert.equal(response.status,400);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM inventory').get().n,0);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,0);
});

test('an older complete source snapshot cannot change prices, archive later observations or claim fresh source time',async()=>{
 const observedAt='2025-02-01T12:00:00.000Z';
 const initial=[vehicle(910),vehicle(911),vehicle(912),vehicle(913)].map(v=>({...v,observedAt}));
 await importAll(initial,{complete:true,expectedCount:4});
 const later={...vehicle(914),observedAt:'2025-03-01T12:00:00.000Z'};await importAll([later]);
 await assert.rejects(importAll(initial.map(v=>({...v,price:1,observedAt:'2025-01-01T12:00:00.000Z'})),{complete:true,expectedCount:4}),/older/);
 const state=await server.workspace();
 assert.equal(state.vehicles.length,5);assert.equal(state.archivedVehicles.length,0);
 assert.equal(state.vehicles.find(v=>v.vin===initial[0].vin).price,initial[0].price);
 assert.equal(state.importedAt,observedAt);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM sync_runs').get().n,2);
});

test('complete snapshot freshness is checked against the seed source before database snapshots exist',async()=>{
 const sourceTime='2025-02-01T12:00:00.000Z';
 const initial=[vehicle(920),vehicle(921),vehicle(922),vehicle(923)].map(v=>({...v,observedAt:sourceTime}));
 globalThis.__testSeedVehicles.push(...initial);globalThis.__testSeedSources.observedAt=sourceTime;
 await assert.rejects(importAll(initial.slice(0,3).map(v=>({...v,price:1,observedAt:'2025-01-01T12:00:00.000Z'})),{complete:true,expectedCount:3}),/older/);
 const state=await server.workspace();assert.equal(state.vehicles.length,4);assert.equal(state.archivedVehicles.length,0);
 assert.equal(state.importedAt,sourceTime);
});

test('a full exported workspace containing public comparison provenance can be restored without losing dealer work',async()=>{
 const comparison={...vehicle(930),sourceListings:[{dealer:'Local dealer',url:'https://local.example/used/930',price:30000,observedAt:'2025-02-01T12:00:00Z'}]};delete comparison.photos;
 globalThis.__testSeedComps.push(comparison);
 await save('task-to-preserve',0,{note:'current work'});
 const exported=await exporter.GET(new Request('https://betten.example/api/export'));
 assert.equal(exported.status,200);const backup=await exported.json();
 const response=await restore.POST(request({backup}));
 assert.equal(response.status,200,JSON.stringify(await response.json()));
 const state=await server.workspace();assert.equal(state.records.find(r=>r.id==='task-to-preserve').data.note,'current work');
});


const comparable=(suffix,extra={})=>{const {photos,...v}=vehicle(suffix);return {...v,condition:'Used',dealer:'Observed local dealership',source:'Official public listing',observedAt:'2025-02-01T12:00:00.000Z',...extra};};
const importMarket=(comparables,extra={})=>market.POST(request({comparables,...extra}));
const publicComparisons=state=>state.records.filter(r=>r.kind==='comp'&&r.data.publicListing);

test('complete market refresh retires absent public listings while preserving independent manual comparisons',async()=>{
 const initial=[comparable(101),comparable(102),comparable(103),comparable(104)];
 globalThis.__testSeedComps.push(...initial);
 await save('manual-comparison',0,{...comparable(105),source:'Manager supplied listing'},'comp');
 const current=initial.slice(0,3).map(c=>({...c,price:c.price+100,observedAt:'2025-03-01T12:00:00.000Z'}));
 const response=await importMarket(current,{complete:true,expectedCount:3});
 assert.equal(response.status,200,JSON.stringify(await response.json()));
 const state=await server.workspace();
 assert.deepEqual(publicComparisons(state).map(r=>r.data.vin).sort(),current.map(c=>c.vin).sort());
 assert.equal(state.records.find(r=>r.id==='manual-comparison').data.source,'Manager supplied listing');
 assert.equal(state.sources.marketSnapshot.count,3);
});

test('a partial market refresh keeps new listings visible after a complete snapshot, even at the same source timestamp',async()=>{
 const initial=[comparable(201),comparable(202),comparable(203)];
 assert.equal((await importMarket(initial,{complete:true,expectedCount:3})).status,200);
 const incoming=comparable(204);assert.equal((await importMarket([incoming])).status,200);
 const state=await server.workspace();
 assert.deepEqual(publicComparisons(state).map(r=>r.data.vin).sort(),[...initial,incoming].map(c=>c.vin).sort());
});

test('invalid or duplicate-VIN market imports preserve source comparisons, snapshot and dealer work atomically',async()=>{
 const initial=[comparable(301),comparable(302),comparable(303)];
 await importMarket(initial,{complete:true,expectedCount:3});await save('dealer-task',0,{note:'preserve me'});
 const before=(await server.workspace());const auditBefore=d1.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n;
 for(const comparables of [[comparable(304),{...comparable(305),price:-1}],[comparable(304),comparable(304)],[{...comparable(304),observedAt:'not a timestamp'}]]){
  const response=await importMarket(comparables);assert.equal(response.status,400);
 }
 const after=await server.workspace();
 assert.deepEqual(publicComparisons(after),publicComparisons(before));
 assert.deepEqual(after.sources.marketSnapshot,before.sources.marketSnapshot);
 assert.equal(after.records.find(r=>r.id==='dealer-task').data.note,'preserve me');
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,auditBefore);
});

test('older public market observations cannot override newer database asking prices',async()=>{
 const c=comparable(401,{price:35000,observedAt:'2025-03-01T14:00:00.000Z'});
 await importMarket([c]);
 assert.equal((await importMarket([{...c,price:10000,observedAt:'2025-03-01T09:00:00-04:00'}])).status,200);
 const state=await server.workspace();assert.equal(publicComparisons(state)[0].data.price,35000);
});

test('older public market observations cannot override newer immutable seed asking prices',async()=>{
 const c=comparable(501,{price:35000,observedAt:'2025-03-01T14:00:00.000Z'});globalThis.__testSeedComps.push(c);
 const response=await importMarket([{...c,price:10000,observedAt:'2025-03-01T09:00:00-04:00'}]);
 assert.equal(response.status,200);
 const state=await server.workspace();assert.equal(publicComparisons(state)[0].data.price,35000);
});

test('a stale complete market snapshot is rejected before it can retire fresher seeded comparisons',async()=>{
 const initial=[501,502,503,504].map(n=>comparable(n,{observedAt:'2025-03-01T12:00:00.000Z'}));globalThis.__testSeedComps.push(...initial);
 const stale=initial.slice(0,3).map(c=>({...c,price:1,observedAt:'2025-02-01T12:00:00.000Z'}));
 const response=await importMarket(stale,{complete:true,expectedCount:3});
 assert.equal(response.status,400);
 const state=await server.workspace();assert.equal(publicComparisons(state).length,4);
 assert.equal(state.sources.marketSnapshot,null);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,0);
});


test('dealer cost import fills missing fields and keeps existing zero costs, notes, pricing and disposition',async()=>{
 const v=vehicle(701);globalThis.__testSeedVehicles.push(v);
 await save(v.vin,0,{cost:25000,buyFees:0,notes:'Keep my condition notes',targetPrice:32000,status:'wholesale'},'vehicle');
 const response=await dealerImport.POST(request({rows:[{vin:v.vin.toLowerCase(),cost:10000,buyFees:999,transport:'$300',acquiredDate:'10/01/2026',reconActual:'1,200'}]}));
 assert.equal(response.status,200);assert.equal((await response.json()).updated,1);
 const row=d1.sqlite.prepare('SELECT * FROM records WHERE id=?').get(v.vin),data=JSON.parse(row.data);
 assert.equal(row.revision,2);assert.equal(data.cost,25000);assert.equal(data.buyFees,0);assert.equal(data.transport,300);assert.equal(data.reconActual,1200);assert.equal(data.acquiredDate,'2026-10-01');assert.equal(data.notes,'Keep my condition notes');assert.equal(data.targetPrice,32000);assert.equal(data.status,'wholesale');
 const again=await dealerImport.POST(request({rows:[{vin:v.vin,cost:8000,transport:999}]}));assert.equal((await again.json()).updated,0);assert.equal(d1.sqlite.prepare('SELECT revision FROM records WHERE id=?').get(v.vin).revision,2);
});

test('dealer cost import validates the entire file before writes and rejects unknown or duplicated VINs',async()=>{
 const a=vehicle(702),b=vehicle(703);globalThis.__testSeedVehicles.push(a,b);
 for(const rows of [[{vin:a.vin,cost:21000},{vin:b.vin,cost:-1}],[{vin:a.vin,cost:21000},{vin:vehicle(799).vin,cost:22000}],[{vin:a.vin,cost:21000},{vin:a.vin,cost:22000}],[{vin:a.vin,acquiredDate:'2026-02-30'}]]){
  const response=await dealerImport.POST(request({rows}));assert.equal(response.status,400);assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,0);assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,0);
 }
});

test('dealer cost import atomically rejects all updates when another editor changes one target record',async()=>{
 const a=vehicle(704),b=vehicle(705);globalThis.__testSeedVehicles.push(a,b);await save(a.vin,0,{notes:'original'},'vehicle');await save(b.vin,0,{notes:'original'},'vehicle');
 const batch=d1.batch.bind(d1);let intercepted=false;
 d1.batch=async statements=>{if(!intercepted){intercepted=true;d1.sqlite.prepare('UPDATE records SET revision=revision+1,data=? WHERE id=?').run(JSON.stringify({notes:'concurrent edit'}),b.vin);}return batch(statements);};
 const response=await dealerImport.POST(request({rows:[{vin:a.vin,cost:21000},{vin:b.vin,cost:22000}]}));
 assert.equal(response.status,409);const rows=d1.sqlite.prepare('SELECT id,data,revision FROM records ORDER BY id').all();assert.equal(rows[0].revision,1);assert.equal(JSON.parse(rows[0].data).cost,undefined);assert.equal(rows[1].revision,2);assert.deepEqual(JSON.parse(rows[1].data),{notes:'concurrent edit'});assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM audit').get().n,2);
});

test('explicit dealer import overwrite changes only supplied fields, while blank values remain unknown',async()=>{
 const v=vehicle(706);globalThis.__testSeedVehicles.push(v);await save(v.vin,0,{cost:25000,notes:'retain',targetPrice:32000},'vehicle');
 const response=await dealerImport.POST(request({overwrite:true,rows:[{vin:v.vin,cost:'24,000',reconActual:'',transport:null}]}));assert.equal(response.status,200);const data=JSON.parse(d1.sqlite.prepare('SELECT data FROM records WHERE id=?').get(v.vin).data);assert.equal(data.cost,24000);assert.equal(data.notes,'retain');assert.equal(data.targetPrice,32000);assert.equal(data.transport,undefined);assert.equal(data.reconActual,undefined);
});

test('explicit skipUnknown imports known costs and reports missing inventory VINs without creating vehicles',async()=>{
 const known=vehicle(888),unknown='1HGCM82633A004352';globalThis.__testSeedVehicles=[known];
 const response=await dealerImport.POST(request({skipUnknown:true,rows:[{vin:known.vin,cost:12345},{vin:unknown,cost:999}]}));
 assert.equal(response.status,200);const result=await response.json();assert.equal(result.updated,1);assert.deepEqual(result.skippedUnknownVins,[unknown]);
 assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,1);assert.equal(d1.sqlite.prepare('SELECT id FROM records').get().id,known.vin);
});

test('live-provider-only workspace hides all legacy comparisons without deleting dealer records',async()=>{
 globalThis.__testEnv.MARKET_DATA_AUTODEV_ONLY='true';
 const v=vehicle(887);globalThis.__testSeedVehicles.push(v);await save(v.vin,0,{cost:15000,notes:'Preserve my notes'},'vehicle');
 const result=await server.workspace();assert.equal(result.records.some(r=>r.kind==='comp'),false);assert.equal(result.records.find(r=>r.id===v.vin).data.cost,15000);assert.equal(result.sources.market,null);
 delete globalThis.__testEnv.MARKET_DATA_AUTODEV_ONLY;
});

test('report Age evidence fills missing stock dates and preserves an existing date',async()=>{
 const v=vehicle(886);globalThis.__testSeedVehicles.push(v);
 const row={vin:v.vin,acquiredDate:'2025-08-13',stockAgeEvidence:{reportDate:'2026-10-23',age:436}};
 const r=await dealerImport.POST(request({rows:[row]}));assert.equal(r.status,200);let data=JSON.parse(d1.sqlite.prepare('SELECT data FROM records WHERE id=?').get(v.vin).data);assert.equal(data.acquiredDate,'2025-08-13');assert.equal(data.acquiredDateSource,'vauto_report_age');
 const again=await dealerImport.POST(request({rows:[{...row,acquiredDate:'2025-08-14',stockAgeEvidence:{reportDate:'2026-10-23',age:435}}]}));assert.equal(again.status,200);data=JSON.parse(d1.sqlite.prepare('SELECT data FROM records WHERE id=?').get(v.vin).data);assert.equal(data.acquiredDate,'2025-08-13');assert.equal(data.stockAgeAtReport,436);
});

test('dated manual book values and holder-based key checkout validate before saving',async()=>{
 const base={id:'1HGCM82633A004352',kind:'vehicle',data:{cost:0,notes:'Preserve'}};
 assert.throws(()=>globalThis.__testValidation.validateRecord({...base,data:{...base.data,jdBookTrade:20000}}));
 assert.throws(()=>globalThis.__testValidation.validateRecord({...base,data:{...base.data,jdBookTrade:-1,jdBookDate:'2026-10-26'}}));
 assert.throws(()=>globalThis.__testValidation.validateRecord({...base,data:{...base.data,keyStatus:'Out'}}));
 assert.doesNotThrow(()=>globalThis.__testValidation.validateRecord({...base,data:{...base.data,keyStatus:'Out',keyHolder:'Service',jdBookTrade:0,jdBookDate:'2026-10-26',saleGross:-100}}));
});

test('complete inventory refresh records a real dashboard snapshot and price changes without altering dealer work',async()=>{
 const v=vehicle(352,30000);await importAll([v],{complete:true,expectedCount:1});await save(v.vin,0,{cost:0,notes:'Keep',keyStatus:'Out',keyHolder:'Detail'},'vehicle');
 await importAll([{...v,price:29000}],{complete:true,expectedCount:1});const w=await server.workspace();assert.equal(w.dashboardHistory.length,1);assert.equal(w.dashboardHistory[0].buckets['Used:retail'].priceTotal,29000);assert.equal(w.dashboardHistory[0].buckets['Used:retail'].costKnown,1);assert.equal(w.dashboardHistory[0].buckets['Used:retail'].costTotal,0);assert.equal(w.records.find(r=>r.id===v.vin).data.notes,'Keep');const changes=d1.sqlite.prepare("SELECT data FROM audit WHERE record_id=? AND action='website inventory update'").get(v.vin);assert.equal(JSON.parse(changes.data).before.price,30000);assert.equal(JSON.parse(changes.data).after.price,29000);
});

test('staff record saves preserve redacted financial fields and reject direct financial edits and deletion',async()=>{
 d1.sqlite.exec(readFileSync(new URL('drizzle/0001_complex_power_pack.sql',root),'utf8'));d1.sqlite.exec(readFileSync(new URL('drizzle/0003_warm_puck.sql',root),'utf8'));d1.sqlite.exec(readFileSync(new URL('drizzle/0004_eager_living_tribunal.sql',root),'utf8'));
 const vin='1HGCM82633A004111';await save(vin,0,{cost:40000,notes:'Owner private note',keyStatus:'In'},'vehicle');
 d1.sqlite.prepare('INSERT INTO hub_access(email,status,permissions,revision,updated_at) VALUES(?,?,?,?,?)').run('staff@bettenimports.com','active',JSON.stringify({keys:'edit',inventory:'view'}),1,new Date().toISOString());
 const staff=(data,revision=1,method='POST')=>new Request('https://betten.example/api/records',{method,headers:{origin:'https://betten.example','content-type':'application/json','oai-authenticated-user-email':'staff@bettenimports.com','oai-authenticated-user-id':'staff'},body:JSON.stringify({id:vin,kind:'vehicle',data,revision})});
 const r=await records.POST(staff({keyStatus:'Out',keyHolder:'Alex'}));assert.equal(r.status,200);const j=await r.json();assert.equal(j.record.data.cost,undefined);assert.equal(j.record.data.notes,undefined);assert.equal(JSON.parse(d1.sqlite.prepare('SELECT data FROM records WHERE id=?').get(vin).data).cost,40000);
 assert.notEqual((await records.POST(staff({cost:1},2))).status,200);assert.notEqual((await records.DELETE(staff({},2,'DELETE'))).status,200);assert.equal(JSON.parse(d1.sqlite.prepare('SELECT data FROM records WHERE id=?').get(vin).data).notes,'Owner private note');
});
