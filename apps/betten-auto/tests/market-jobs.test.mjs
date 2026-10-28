import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/market-jobs.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {syncMarketJobs,claimMarketJob,commitMarketSuccess,failMarketJob,purgeMarketCaches,readMarketCache,marketJobSummaries}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
class D1{
 constructor(){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec('CREATE TABLE records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,actor TEXT NOT NULL,mutation_id TEXT NOT NULL)');}
 prepare(sql){const sqlite=this.sqlite;return new class{constructor(args=[]){this.args=args;}bind(...args){return new this.constructor(args);}async all(){return {results:sqlite.prepare(sql).all(...this.args)};}async first(){return sqlite.prepare(sql).get(...this.args)||null;}};}
 async batch(statements){this.sqlite.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.all());this.sqlite.exec('COMMIT');return out;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
}
const vin='3VWGW7BU6TM020418',vin2='1HGCM82633A004352',now=Date.parse('2026-10-20T17:00:00Z');
const target=(changes={})=>({vin,fingerprint:'same-year-sel-us-v1',vehicle:{year:2026,make:'Volkswagen',model:'Jetta',trim:'1.5T SEL',condition:'Used',mileage:2730,certified:false},...changes});
const listing={vin:'3VWGW7BU0TM006871',year:2026,make:'Volkswagen',model:'Jetta',trim:'SEL',price:25348,mileage:9583};
const success=(changes={})=>({listings:[listing],coverage:{returnedCount:1,totalAvailable:1,complete:true},cacheAllowed:true,nextRunAt:now+86400000,...changes});
const rawJob=db=>JSON.parse(db.sqlite.prepare('SELECT data FROM records WHERE id=?').get('system:market-job:'+vin).data);
let db;
beforeEach(()=>{db=new D1();});

test('sync queues initial and future VINs without resetting an unchanged job or dealership records',async()=>{
 db.sqlite.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?)').run(vin,'vehicle',JSON.stringify({cost:20000,notes:'Dealer note'}),3,new Date(now).toISOString(),'dealer','manual');
 assert.deepEqual(await syncMarketJobs(db,[target()],now),{targets:1,changed:1});
 const lease=await claimMarketJob(db,{now,leaseMs:60000});assert.equal(await commitMarketSuccess(db,lease,success(),now+1000),true);
 const saved=rawJob(db);assert.deepEqual(await syncMarketJobs(db,[target(),target({vin:vin2,fingerprint:'another-vin'})],now+2000),{targets:2,changed:1});
 assert.deepEqual(rawJob(db),saved);assert.equal(db.sqlite.prepare('SELECT revision FROM records WHERE id=?').get(vin).revision,3);assert.equal(db.sqlite.prepare('SELECT data FROM records WHERE id=?').get(vin).data,JSON.stringify({cost:20000,notes:'Dealer note'}));
});

test('concurrent claims lease a due VIN once and the active VIN allowlist controls eligibility',async()=>{
 await syncMarketJobs(db,[target(),target({vin:vin2,fingerprint:'second'})],now);
 const leases=await Promise.all([claimMarketJob(db,{now,leaseMs:60000,allowedVins:[vin]}),claimMarketJob(db,{now,leaseMs:60000,allowedVins:[vin]})]);
 assert.equal(leases.filter(Boolean).length,1);assert.equal(leases.find(Boolean).vin,vin);
 assert.equal(await claimMarketJob(db,{now,leaseMs:60000,allowedVins:[]}),null);
 assert.equal((await claimMarketJob(db,{now,leaseMs:60000,allowedVins:[vin2]})).vin,vin2);
});

test('an expired runner cannot overwrite or fail a replacement lease',async()=>{
 await syncMarketJobs(db,[target()],now);
 const old=await claimMarketJob(db,{now,leaseMs:1000});
 assert.equal(await commitMarketSuccess(db,old,success(),now+1001),false);
 const current=await claimMarketJob(db,{now:now+1001,leaseMs:60000});assert.notEqual(current.token,old.token);
 assert.equal(await commitMarketSuccess(db,old,success(),now+1002),false);
 assert.equal(await failMarketJob(db,old,{code:'timeout',retryAt:now+999999},now+1002),false);
 assert.equal(await commitMarketSuccess(db,current,success(),now+1003),true);
});

test('a changed identity increments generation, queues new work, and hides the previous query cache',async()=>{
 await syncMarketJobs(db,[target()],now);const first=await claimMarketJob(db,{now,leaseMs:60000});await commitMarketSuccess(db,first,success(),now+1000);
 assert.equal((await readMarketCache(db,vin,now+2000)).listings.length,1);
 const changed=target({fingerprint:'updated-mileage-sel-us-v2',vehicle:{...target().vehicle,mileage:35000}});
 assert.deepEqual(await syncMarketJobs(db,[changed],now+2000),{targets:1,changed:1});
 assert.equal(rawJob(db).generation,2);assert.equal(rawJob(db).status,'queued');assert.equal(await readMarketCache(db,vin,now+2000),null);
 const current=await claimMarketJob(db,{now:now+2000,leaseMs:60000});assert.equal(current.generation,2);assert.equal(current.target.vehicle.mileage,35000);
 assert.equal(await commitMarketSuccess(db,first,success(),now+2001),false);
 assert.equal(await commitMarketSuccess(db,current,success({listings:[{...listing,price:24000}]}),now+2002),true);
 assert.equal((await readMarketCache(db,vin,now+2003)).listings[0].price,24000);
});

test('without explicit cache rights only operational status is persisted, never response values or coverage',async()=>{
 await syncMarketJobs(db,[target()],now);const lease=await claimMarketJob(db,{now,leaseMs:60000});
 await commitMarketSuccess(db,lease,success({cacheAllowed:false,listings:[{price:123456,secretBody:'NEVER_SAVE_THIS_RESPONSE'}],coverage:{returnedCount:987654,raw:'NEVER_SAVE_COVERAGE'}}),now+1000);
 const job=rawJob(db),serialized=JSON.stringify(job);assert.equal(job.status,'ready');assert.equal(job.lastSuccessAt,now+1000);assert.equal(job.nextRunAt,now+86400000);
 for(const forbidden of ['123456','987654','NEVER_SAVE','listings','coverage'])assert.equal(serialized.includes(forbidden),false);
 assert.equal(await readMarketCache(db,vin,now+2000),null);
});

test('a no-cache completion also removes previously licensed cached responses',async()=>{
 await syncMarketJobs(db,[target()],now);const first=await claimMarketJob(db,{now,leaseMs:60000});await commitMarketSuccess(db,first,success({nextRunAt:now+2000}),now+1000);
 const later=await claimMarketJob(db,{now:now+2000,leaseMs:60000});await commitMarketSuccess(db,later,success({cacheAllowed:false}),now+3000);
 assert.equal(rawJob(db).cache,null);assert.equal(await readMarketCache(db,vin,now+4000),null);
});

test('retention revocation physically purges response payloads without removing operational or dealership records',async()=>{
 await syncMarketJobs(db,[target()],now);
 const first=await claimMarketJob(db,{now,leaseMs:60000});
 await commitMarketSuccess(db,first,success({listings:[{...listing,price:123456}],coverage:{raw:'PRIVATE_COVERAGE_PAYLOAD'},nextRunAt:now+2000}),now+1000);
 const retry=await claimMarketJob(db,{now:now+2001,leaseMs:60000});
 await failMarketJob(db,retry,{code:'unavailable',retryAt:now+999999},now+3000);
 // Also remove response fields left by a previous schema, without touching unrelated jobs' metadata.
 db.sqlite.prepare("UPDATE records SET data=json_set(data,'$.listings',json(?),'$.coverage',json(?)) WHERE id=?").run(JSON.stringify([{price:234567}]),JSON.stringify({raw:'LEGACY_COVERAGE_PAYLOAD'}),'system:market-job:'+vin);
 for(const [id,kind,data] of [[vin,'vehicle',{cost:20000,notes:'Dealer note'}],['system:market-budget:2026-10-20','system',{reserved:3}]])db.sqlite.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?)').run(id,kind,JSON.stringify(data),3,new Date(now).toISOString(),'dealer','manual');
 const before=rawJob(db),otherBefore=db.sqlite.prepare("SELECT * FROM records WHERE id NOT LIKE 'system:market-job:%' ORDER BY id").all();
 assert.deepEqual(await purgeMarketCaches(db,now+4000),{purged:1});
 const after=rawJob(db);
 for(const field of ['target','generation','attempts','lastAttemptAt','lastSuccessAt','lastErrorCode','nextRunAt','status'])assert.deepEqual(after[field],before[field],field);
 for(const field of ['cache','listings','coverage'])assert.equal(Object.hasOwn(after,field),false);
 for(const forbidden of ['123456','234567','PRIVATE_COVERAGE_PAYLOAD','LEGACY_COVERAGE_PAYLOAD'])assert.equal(JSON.stringify(after).includes(forbidden),false);
 assert.equal(await readMarketCache(db,vin,now+4001),null);
 assert.deepEqual(db.sqlite.prepare("SELECT * FROM records WHERE id NOT LIKE 'system:market-job:%' ORDER BY id").all(),otherBefore);
 const recordBefore=db.sqlite.prepare('SELECT * FROM records WHERE id=?').get('system:market-job:'+vin);
 assert.deepEqual(await purgeMarketCaches(db,now+5000),{purged:0});
 assert.deepEqual(db.sqlite.prepare('SELECT * FROM records WHERE id=?').get('system:market-job:'+vin),recordBefore);
});

test('retention revocation cancels every in-flight lease so a late licensed success cannot restore purged data',async()=>{
 await syncMarketJobs(db,[target(),target({vin:vin2,fingerprint:'second'})],now);
 const first=await claimMarketJob(db,{now,leaseMs:60000,allowedVins:[vin]});
 await commitMarketSuccess(db,first,success({nextRunAt:now+2000}),now+1000);
 const lease=await claimMarketJob(db,{now:now+2001,leaseMs:60000,allowedVins:[vin]});
 const uncachedLease=await claimMarketJob(db,{now:now+2001,leaseMs:60000,allowedVins:[vin2]});
 assert.deepEqual(await purgeMarketCaches(db,now+3000),{purged:2});
 assert.equal(rawJob(db).status,'queued');assert.equal(rawJob(db).lease,null);assert.equal(rawJob(db).generation,lease.generation);
 for(const old of [lease,uncachedLease]){
  assert.equal(await commitMarketSuccess(db,old,success({coverage:{raw:'LATE_PRIVATE_RESPONSE'}}),now+3001),false);
  assert.equal(await failMarketJob(db,old,{code:'unavailable',retryAt:now+999999},now+3001),false);
  assert.equal(await readMarketCache(db,old.vin,now+3002),null);
 }
 assert.equal(JSON.stringify(db.sqlite.prepare('SELECT data FROM records').all()).includes('LATE_PRIVATE_RESPONSE'),false);
 assert.deepEqual(await purgeMarketCaches(db,now+4000),{purged:0});
});

test('failure retains the prior licensed result and original freshness while sanitizing provider errors',async()=>{
 await syncMarketJobs(db,[target()],now);const first=await claimMarketJob(db,{now,leaseMs:60000});await commitMarketSuccess(db,first,success({nextRunAt:now+2000}),now+1000);
 const retry=await claimMarketJob(db,{now:now+2001,leaseMs:60000});
 await failMarketJob(db,retry,{code:'https://provider.example?api_key=SECRET_KEY&price=123456',retryAt:now+999999},now+3000);
 const cache=await readMarketCache(db,vin,now+3001);assert.equal(cache.status,'error');assert.equal(cache.cachedAt,now+1000);assert.equal(cache.expiresAt,now+2000);assert.equal(cache.stale,true);assert.deepEqual(cache.listings,[listing]);assert.equal(cache.lastErrorCode,'PROVIDER_ERROR');
 assert.equal(JSON.stringify(rawJob(db)).includes('SECRET_KEY'),false);assert.equal(JSON.stringify(rawJob(db)).includes('provider.example'),false);
 assert.equal(await claimMarketJob(db,{now:now+4000,leaseMs:60000}),null);
});

test('a successful zero-result query is distinct from a failed query and is not fabricated',async()=>{
 await syncMarketJobs(db,[target()],now);const lease=await claimMarketJob(db,{now,leaseMs:60000});
 await commitMarketSuccess(db,lease,success({listings:[],coverage:{returnedCount:0,totalAvailable:0,complete:true}}),now+1000);
 const cache=await readMarketCache(db,vin,now+2000);assert.equal(cache.status,'ready');assert.deepEqual(cache.listings,[]);assert.equal(cache.coverage.returnedCount,0);
});

test('workspace summaries contain no listings, response coverage, or response prices',async()=>{
 await syncMarketJobs(db,[target()],now);const lease=await claimMarketJob(db,{now,leaseMs:60000});
 await commitMarketSuccess(db,lease,success({coverage:{secretResponsePayload:'DO_NOT_EXPORT_COVERAGE'},listings:[{...listing,price:123456}]}),now+1000);
 const summary=await marketJobSummaries(db,now+2000);assert.equal(summary[vin].status,'ready');assert.equal(summary[vin].hasCache,true);assert.equal(summary[vin].cacheStale,false);
 for(const forbidden of ['123456','listings','coverage','DO_NOT_EXPORT_COVERAGE','fingerprint'])assert.equal(JSON.stringify(summary).includes(forbidden),false);
});

test('invalid target batches do not partially enqueue any VIN',async()=>{
 await assert.rejects(syncMarketJobs(db,[target(),target({vin:'bad-vin'})],now),/valid VIN/);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,0);
 await assert.rejects(syncMarketJobs(db,[target(),target({fingerprint:'conflict'})],now),/Conflicting/);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get().n,0);
});
