/** Private, per-vehicle market jobs. Provider credentials never belong in these records. */
export type MarketTarget={vin:string;fingerprint:string;vehicle:{year?:number;make?:string;model?:string;trim?:string;condition?:string;mileage?:number|null;certified?:boolean|null;bodyStyle?:string}};
export type MarketLease={vin:string;token:string;generation:number;target:MarketTarget};
type MarketDb={prepare:(sql:string)=>any;batch:(statements:any[])=>Promise<any[]>};
type Job={vin:string;target:MarketTarget;generation:number;status:string;nextRunAt:number;attempts:number;lastAttemptAt?:number;lastSuccessAt?:number;lastErrorCode?:string|null;lease?:{token:string;until:number}|null;cache?:{licensed:boolean;generation:number;fingerprint:string;cachedAt:number;expiresAt:number;listings:any[];coverage:any}|null};
const prefix='system:market-job:';
const vinPattern=/^[A-HJ-NPR-Z0-9]{17}$/;
const time=(value:number)=>{if(!Number.isFinite(value)||value<0)throw new Error('Invalid market job time.');return value;};
const vinKey=(value:string)=>{const vin=String(value||'').trim().toUpperCase();if(!vinPattern.test(vin))throw new Error('Market job requires a valid VIN.');return vin;};
const decode=(row:any):Job|null=>{if(!row)return null;try{return JSON.parse(row.data)}catch{return null}};
const code=(value:string)=>typeof value==='string'&&/^[a-z][a-z0-9_]{0,63}$/i.test(value)?value.toUpperCase():'PROVIDER_ERROR';
const changes=(result:any)=>Array.isArray(result?.results)&&result.results.length>0;
function targetValue(raw:MarketTarget):MarketTarget{
 const vin=vinKey(raw.vin);
 if(typeof raw.fingerprint!=='string'||!raw.fingerprint||raw.fingerprint.length>2000)throw new Error('Market target requires a bounded fingerprint.');
 const v=raw.vehicle;if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Market target requires vehicle details.');
 const vehicle:MarketTarget['vehicle']={};
 for(const k of ['year','mileage'] as const)if(v[k]!==undefined){const n=v[k];if(n===null&&k==='mileage')vehicle.mileage=null;else if(typeof n!=='number'||!Number.isFinite(n)||n<0)throw new Error('Invalid market vehicle '+k+'.');else vehicle[k]=n;}
 for(const k of ['make','model','trim','condition','bodyStyle'] as const)if(v[k]!==undefined){if(typeof v[k]!=='string'||v[k]!.length>300)throw new Error('Invalid market vehicle '+k+'.');vehicle[k]=v[k];}
 if(v.certified!==undefined){if(v.certified!==null&&typeof v.certified!=='boolean')throw new Error('Invalid market certification.');vehicle.certified=v.certified;}
 return {vin,fingerprint:raw.fingerprint,vehicle};
}

/** Creates jobs without pruning sold/absent VINs. The runner allowlist controls eligibility. */
export async function syncMarketJobs(db:MarketDb,targets:MarketTarget[],now=Date.now()){
 time(now);if(!Array.isArray(targets)||targets.length>5000)throw new Error('Too many market targets.');
 const unique=new Map<string,MarketTarget>();
 for(const raw of targets){const target=targetValue(raw),prior=unique.get(target.vin);if(prior&&prior.fingerprint!==target.fingerprint)throw new Error('Conflicting market targets for the same VIN.');unique.set(target.vin,target);}
 let changed=0;const pending:any[]=[];
 for(const target of unique.values()){
  const job:Job={vin:target.vin,target,generation:1,status:'queued',nextRunAt:now,attempts:0};
  pending.push(db.prepare(`INSERT INTO records(id,kind,data,revision,updated_at,actor,mutation_id) VALUES (?,'system',?,1,?,'marketservice',?)
   ON CONFLICT(id) DO UPDATE SET data=json_set(records.data,'$.target',json(?),'$.generation',COALESCE(json_extract(records.data,'$.generation'),0)+1,'$.status','queued','$.nextRunAt',?,'$.attempts',0,'$.lease',json('null'),'$.lastErrorCode',json('null')),revision=records.revision+1,updated_at=excluded.updated_at,actor='marketservice',mutation_id=excluded.mutation_id
   WHERE records.kind='system' AND json_extract(records.data,'$.target.fingerprint')<>? RETURNING id`).bind(prefix+target.vin,JSON.stringify(job),new Date(now).toISOString(),crypto.randomUUID(),JSON.stringify(target),now,target.fingerprint));
 }
 for(let i=0;i<pending.length;i+=50){const batch=await db.batch(pending.slice(i,i+50));changed+=batch.filter(changes).length;}
 return {targets:unique.size,changed};
}

/** One SQLite statement selects and leases a due job; competing runners cannot claim it twice. */
export async function claimMarketJob(db:MarketDb,{now=Date.now(),leaseMs=60000,allowedVins}:{now?:number;leaseMs?:number;allowedVins?:string[]}={}):Promise<MarketLease|null>{
 time(now);if(!Number.isFinite(leaseMs)||leaseMs<1000||leaseMs>300000)throw new Error('Market lease must be between 1 and 300 seconds.');
 if(allowedVins?.length===0)return null;
 const allowed=allowedVins?JSON.stringify([...new Set(allowedVins.map(vinKey))]):null;
 const token=crypto.randomUUID(),lease=JSON.stringify({token,until:now+leaseMs});
 const row=await db.prepare(`UPDATE records SET data=json_set(data,'$.status','running','$.lease',json(?),'$.lastAttemptAt',?,'$.attempts',COALESCE(json_extract(data,'$.attempts'),0)+1),revision=revision+1,updated_at=?,actor='marketservice',mutation_id=?
  WHERE id=(SELECT id FROM records WHERE kind='system' AND id LIKE 'system:market-job:%' AND json_extract(data,'$.nextRunAt')<=? AND (json_extract(data,'$.lease.until') IS NULL OR json_extract(data,'$.lease.until')<=?) AND (? IS NULL OR json_extract(data,'$.vin') IN (SELECT value FROM json_each(?))) ORDER BY json_extract(data,'$.nextRunAt'),id LIMIT 1)
  RETURNING data`).bind(lease,now,new Date(now).toISOString(),token,now,now,allowed,allowed).first();
 const job=decode(row);return job?{vin:job.vin,token,generation:job.generation,target:job.target}:null;
}

/** A response can be retained only when the caller confirms contractual cache rights. */
export async function commitMarketSuccess(db:MarketDb,lease:MarketLease,{listings,coverage,cacheAllowed,nextRunAt}:{listings:any[];coverage:any;cacheAllowed:boolean;nextRunAt:number},now=Date.now()){
 time(now);time(nextRunAt);let cache:Job['cache']=null;
 if(cacheAllowed===true){
  if(!Array.isArray(listings)||listings.length>250)throw new Error('Market cache requires at most 250 normalized listings.');
  cache={licensed:true,generation:lease.generation,fingerprint:lease.target.fingerprint,cachedAt:now,expiresAt:nextRunAt,listings,coverage};
  if(JSON.stringify(cache).length>500000)throw new Error('Market cache is too large.');
 }
 const result=await db.prepare(`UPDATE records SET data=json_set(data,'$.status','ready','$.lastSuccessAt',?,'$.nextRunAt',?,'$.lastErrorCode',json('null'),'$.lease',json('null'),'$.cache',json(?)),revision=revision+1,updated_at=?,actor='marketservice',mutation_id=?
  WHERE id=? AND kind='system' AND json_extract(data,'$.generation')=? AND json_extract(data,'$.target.fingerprint')=? AND json_extract(data,'$.lease.token')=? AND json_extract(data,'$.lease.until')>? RETURNING id`).bind(now,nextRunAt,JSON.stringify(cache),new Date(now).toISOString(),lease.token,prefix+vinKey(lease.vin),lease.generation,lease.target.fingerprint,lease.token,now).all();
 return changes(result);
}

/** Failure metadata never contains provider URLs, bodies, keys, listing counts or prices. */
export async function failMarketJob(db:MarketDb,lease:MarketLease,{code:failureCode,retryAt}:{code:string;retryAt:number},now=Date.now()){
 time(now);time(retryAt);
 const result=await db.prepare(`UPDATE records SET data=json_set(data,'$.status','error','$.lastErrorCode',?,'$.nextRunAt',?,'$.lease',json('null')),revision=revision+1,updated_at=?,actor='marketservice',mutation_id=?
  WHERE id=? AND kind='system' AND json_extract(data,'$.generation')=? AND json_extract(data,'$.target.fingerprint')=? AND json_extract(data,'$.lease.token')=? AND json_extract(data,'$.lease.until')>? RETURNING id`).bind(code(failureCode),retryAt,new Date(now).toISOString(),lease.token,prefix+vinKey(lease.vin),lease.generation,lease.target.fingerprint,lease.token,now).all();
 return changes(result);
}

/** Revoking retention removes response payloads and invalidates in-flight writers atomically. */
export async function purgeMarketCaches(db:MarketDb,now=Date.now()){
 time(now);
 const result=await db.prepare(`UPDATE records SET data=json_set(json_remove(data,'$.cache','$.listings','$.coverage'),'$.lease',json('null'),'$.status',CASE WHEN json_extract(data,'$.status')='running' THEN 'queued' ELSE json_extract(data,'$.status') END),revision=revision+1,updated_at=?,actor='marketservice',mutation_id=?
  WHERE kind='system' AND id LIKE 'system:market-job:%' AND (json_type(data,'$.cache') IS NOT NULL OR json_type(data,'$.listings') IS NOT NULL OR json_type(data,'$.coverage') IS NOT NULL OR json_type(data,'$.lease')='object') RETURNING id`).bind(new Date(now).toISOString(),crypto.randomUUID()).all();
 return {purged:Array.isArray(result?.results)?result.results.length:0};
}

export async function readMarketCache(db:MarketDb,vin:string,now=Date.now()){
 time(now);const job=decode(await db.prepare("SELECT data FROM records WHERE id=? AND kind='system'").bind(prefix+vinKey(vin)).first());
 const cache=job?.cache;
 if(!job||cache?.licensed!==true||cache.generation!==job.generation||cache.fingerprint!==job.target.fingerprint)return null;
 return {vin:job.vin,status:job.status,target:job.target,generation:job.generation,lastAttemptAt:job.lastAttemptAt??null,lastSuccessAt:job.lastSuccessAt??null,lastErrorCode:job.lastErrorCode??null,nextRunAt:job.nextRunAt,cacheAllowed:true,cachedAt:cache.cachedAt,expiresAt:cache.expiresAt,stale:now>=cache.expiresAt,listings:cache.listings,coverage:cache.coverage};
}

/** Summaries deliberately remove cached response data inside SQLite, before transfer. */
export async function marketJobSummaries(db:MarketDb,now=Date.now()){
 time(now);const rows=await db.prepare(`SELECT json_remove(data,'$.cache') AS data,json_extract(data,'$.cache.licensed') AS licensed,json_extract(data,'$.cache.generation') AS cached_generation,json_extract(data,'$.cache.fingerprint') AS cached_fingerprint,json_extract(data,'$.cache.expiresAt') AS cached_expires FROM records WHERE kind='system' AND id LIKE 'system:market-job:%'`).all();
 const output:Record<string,any>={};
 for(const row of rows.results||[]){const job=decode(row);if(!job)continue;const hasCache=row.licensed===1&&row.cached_generation===job.generation&&row.cached_fingerprint===job.target.fingerprint;output[job.vin]={vin:job.vin,status:job.status,generation:job.generation,targetFingerprint:job.target.fingerprint,lastAttemptAt:job.lastAttemptAt??null,lastSuccessAt:job.lastSuccessAt??null,lastErrorCode:job.lastErrorCode??null,nextRunAt:job.nextRunAt,attempts:job.attempts,hasCache,cacheStale:hasCache?now>=Number(row.cached_expires):null,leaseExpired:job.lease?now>=job.lease.until:false};}
 return output;
}
