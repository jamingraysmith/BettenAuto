import {collectPublicSource} from './public-market-parser';
import {publicMarketSources} from './public-market-sources';
import {matchComparables,samplePricing} from './pricing';
import type {RecordEntry,Workspace} from './types';

type PublicDb={prepare:(sql:string)=>any;batch:(statements:any[])=>Promise<any[]>};
type Source=(typeof publicMarketSources)[number];
export type PublicSourceSnapshot={id:string;fingerprint:string;status:string;nextRunAt:number;attempts:number;lastAttemptAt?:number;lastSuccessAt?:number;lastErrorCode?:string|null;lease?:{token:string;until:number}|null;listings?:any[];complete?:boolean;hasCompleteSnapshot?:boolean;completeObservedAt?:string|null;expectedCount?:number|null;pages?:number;observedAt?:string};
type Lease={id:string;token:string;fingerprint:string;source:Source;previousListings?:any[]};
type Collection={listings:any[];expectedCount:number|null;pages:number;complete:boolean;observedAt:string;pendingDetails?:number;detailsChecked?:number;detailsFailed?:number};
type Collector=(source:Source,fetcher?:typeof fetch,now?:number,previousListings?:any[])=>Promise<Collection>;
const prefix='system:public-source:';
const iso=(now:number)=>new Date(now).toISOString();
const changed=(result:any)=>Array.isArray(result?.results)&&result.results.length>0;
const fingerprint=(source:Source)=>JSON.stringify({collectorVersion:4,source});
/** Next 9 AM in Detroit, including the daylight-saving transition. */
export function nextDailyPublicRefresh(now:number){
 const formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Detroit',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'});
 const parts=(date:number)=>Object.fromEntries(formatter.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 const p=parts(now),target=Date.UTC(p.year,p.month-1,p.day+(p.hour>=9?1:0),9);let result=target;
 for(let i=0;i<3;i++){const local=parts(result);result+=target-Date.UTC(local.year,local.month-1,local.day,local.hour,local.minute,local.second);}
 return result;
}
const knownSource=(id:string)=>publicMarketSources.find(source=>source.id===id);
const decode=(row:any):PublicSourceSnapshot|null=>{try{const value=JSON.parse(row.data);return value&&typeof value.id==='string'&&knownSource(value.id)?value:null;}catch{return null;}};
const failureMessages:Record<string,string>={blocked:'The public source denied unattended access. Previous observations were preserved.',timeout:'The public source timed out. Previous observations were preserved.',incomplete:'The public source could not be verified completely. Previous observations were preserved.',invalid_response:'The public source format could not be verified. Previous observations were preserved.',source_changed:'The public source changed during collection. Previous observations were preserved.',snapshot_too_large:'The public source exceeded the bounded collection size. Previous observations were preserved.',unavailable:'The public source is temporarily unavailable. Previous observations were preserved.'};
function failureCode(error:any){const raw=String(error?.code||'').toLowerCase(),aliases:Record<string,string>={access_denied:'blocked',robots_disallowed:'blocked',rate_limited:'blocked',incomplete_snapshot:'incomplete',changing_total:'source_changed',response_too_large:'snapshot_too_large',invalid_listing:'invalid_response',condition_mismatch:'invalid_response',pagination_loop:'invalid_response',unsafe_pagination:'invalid_response'};const candidate=aliases[raw]||raw;return Object.hasOwn(failureMessages,candidate)?candidate:'unavailable';}
function validateTime(now:number){if(!Number.isFinite(now)||now<0)throw new Error('Invalid public collection time.');}

/** Only fixed, public registry sources become jobs. No request can supply a URL. */
export async function syncPublicSources(database:PublicDb,now=Date.now()){
 validateTime(now);
 const statements=publicMarketSources.map(source=>{
  if(!/^[a-z0-9-]{1,80}$/.test(source.id))throw new Error('Invalid public source registry.');
  const identity=fingerprint(source),snapshot:PublicSourceSnapshot={id:source.id,fingerprint:identity,status:'pending',nextRunAt:now,attempts:0};
  return database.prepare(`INSERT INTO records(id,kind,data,revision,updated_at,actor,mutation_id) VALUES (?,'system',?,1,?,'publiccollector',?)
   ON CONFLICT(id) DO UPDATE SET data=json_set(records.data,'$.fingerprint',?,'$.status','pending','$.nextRunAt',?,'$.lease',json('null')),revision=records.revision+1,updated_at=excluded.updated_at,actor='publiccollector',mutation_id=excluded.mutation_id
   WHERE records.kind='system' AND COALESCE(json_extract(records.data,'$.fingerprint'),'')<>? RETURNING id`).bind(prefix+source.id,JSON.stringify(snapshot),iso(now),crypto.randomUUID(),identity,now,identity);
 });
 if(statements.length)await database.batch(statements);
}

/** Claim due regional sources first; selection and lease stay atomic across runners. */
export async function claimPublicSource(database:PublicDb,now=Date.now(),leaseMs=240000):Promise<Lease|null>{
 validateTime(now);if(!Number.isInteger(leaseMs)||leaseMs<1000||leaseMs>300000)throw new Error('Invalid public source lease.');
 const token=crypto.randomUUID(),ids=JSON.stringify(publicMarketSources.map(source=>source.id)),regionalIds=JSON.stringify(publicMarketSources.filter(source=>source.scope==='regional').map(source=>source.id));
 const row=await database.prepare(`UPDATE records SET data=json_set(data,'$.status','refreshing','$.lease',json(?),'$.lastAttemptAt',?,'$.attempts',COALESCE(json_extract(data,'$.attempts'),0)+1),revision=revision+1,updated_at=?,actor='publiccollector',mutation_id=?
  WHERE id=(SELECT id FROM records WHERE kind='system' AND id LIKE 'system:public-source:%' AND json_extract(data,'$.id') IN (SELECT value FROM json_each(?)) AND json_extract(data,'$.nextRunAt')<=? AND (json_extract(data,'$.lease.until') IS NULL OR json_extract(data,'$.lease.until')<=?) ORDER BY CASE WHEN json_extract(data,'$.id') IN (SELECT value FROM json_each(?)) THEN 0 ELSE 1 END,json_extract(data,'$.nextRunAt'),id LIMIT 1) RETURNING data`)
  .bind(JSON.stringify({token,until:now+leaseMs}),now,iso(now),token,ids,now,now,regionalIds).first();
 const snapshot=decode(row);if(!snapshot)return null;
 const source=knownSource(snapshot.id);if(!source||snapshot.fingerprint!==fingerprint(source))return null;
 return {id:source.id,token,fingerprint:snapshot.fingerprint,source,previousListings:snapshot.listings||[]};
}

function cleanCollection(collection:Collection,source:Source,now:number){
 if(!collection||!Array.isArray(collection.listings)||collection.listings.length>2000||!Number.isInteger(collection.pages)||collection.pages<1||collection.pages>source.maxPages||!Number.isFinite(Date.parse(collection.observedAt))||Date.parse(collection.observedAt)>now+300000)throw Object.assign(new Error('Unverified public collection.'),{code:'invalid_response'});
 for(const key of ['pendingDetails','detailsChecked','detailsFailed'] as const){const value=collection[key];if(value!==undefined&&(!Number.isInteger(value)||value<0||value>collection.listings.length))throw Object.assign(new Error('Invalid public detail counts.'),{code:'invalid_response'});}
 if(collection.expectedCount!==null&&(!Number.isInteger(collection.expectedCount)||collection.expectedCount<0))throw Object.assign(new Error('Unverified source total.'),{code:'invalid_response'});
 const vins=new Set<string>(),listings=collection.listings.map(raw=>{
  const vin=String(raw.vin||'').toUpperCase(),observed=Date.parse(raw.observedAt);
  if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)||vins.has(vin)||!Number.isFinite(observed)||observed>now+300000||typeof raw.url!=='string'||!/^https:\/\//i.test(raw.url))throw Object.assign(new Error('Unverified public listing.'),{code:'invalid_response'});
  vins.add(vin);
  if(raw.price!==null&&raw.price!==undefined&&(typeof raw.price!=='number'||!Number.isFinite(raw.price)||raw.price<=0))throw Object.assign(new Error('Unverified public asking price.'),{code:'invalid_response'});
  if(raw.mileage!==null&&raw.mileage!==undefined&&(typeof raw.mileage!=='number'||!Number.isFinite(raw.mileage)||raw.mileage<0))throw Object.assign(new Error('Unverified public mileage.'),{code:'invalid_response'});
  // Collector snapshots contain public normalized fields, never source HTML or provider responses.
  const fields=['year','make','model','trim','schemaTrim','trimBasis','title','condition','price','mileage','dealer','city','state','postalCode','address','latitude','longitude','distanceMiles','url','sourceUrl','source','pricingBasis','preFeePrice','feeComponent','bodyStyle','drivetrain','engine','engineSize','fuelType','transmission','certified','image','stock','detailsIdentityFingerprint','detailsSourceIdentity','detailsEnrichedFields','detailsUrl','detailsCheckedAt','detailObservedAt','mileageObservedAt','certifiedObservedAt','detailsEvidence','detailsConflicts','detailsFieldObservedAt'];
  const listing:any={vin,observedAt:iso(observed),scope:source.scope,publicListing:true,publicSourceId:source.id};
  for(const field of fields){const value=raw[field];if(value===null||['string','number','boolean'].includes(typeof value)){if(typeof value==='string'&&value.length>4000)throw Object.assign(new Error('Public field is too large.'),{code:'invalid_response'});if(typeof value==='number'&&!Number.isFinite(value))throw Object.assign(new Error('Invalid public value.'),{code:'invalid_response'});listing[field]=value;}}
  return listing;
 });
 if(collection.complete===true&&(collection.expectedCount===null||collection.expectedCount!==listings.length))throw Object.assign(new Error('Incomplete public snapshot.'),{code:'incomplete'});
 if(!collection.complete&&listings.length===0)throw Object.assign(new Error('No verified public listings.'),{code:'incomplete'});
 return {...collection,listings,observedAt:iso(Date.parse(collection.observedAt))};
}

/** Only a current lease may replace this source. Partial captures never remove prior VINs. */
export async function commitPublicSuccess(database:PublicDb,lease:Lease,collection:Collection,now=Date.now()){
 validateTime(now);const verified=cleanCollection(collection,lease.source,now);
 const row=await database.prepare("SELECT data FROM records WHERE id=? AND kind='system'").bind(prefix+lease.id).first();
 const previous=decode(row);let listings=verified.listings;
 if(!verified.complete){const merged=new Map((previous?.listings||[]).map(listing=>[listing.vin,listing]));for(const listing of listings){const old=merged.get(listing.vin);if(!old||Date.parse(listing.observedAt)>=Date.parse(old.observedAt))merged.set(listing.vin,listing);}listings=[...merged.values()];}
 if(JSON.stringify(listings).length>1500000)throw Object.assign(new Error('Public snapshot is too large.'),{code:'snapshot_too_large'});
 const result=await database.prepare(`UPDATE records SET data=json_set(data,'$.status','ready','$.lastSuccessAt',?,'$.nextRunAt',?,'$.lastErrorCode',json('null'),'$.lease',json('null'),'$.listings',json(?),'$.complete',json(?),'$.hasCompleteSnapshot',json(?),'$.completeObservedAt',?,'$.expectedCount',json(?),'$.pages',?,'$.observedAt',?,'$.pendingDetails',?,'$.detailsChecked',?,'$.detailsFailed',?),revision=revision+1,updated_at=?,actor='publiccollector',mutation_id=?
  WHERE id=? AND kind='system' AND json_extract(data,'$.fingerprint')=? AND json_extract(data,'$.lease.token')=? AND json_extract(data,'$.lease.until')>? AND (json_extract(data,'$.observedAt') IS NULL OR json_extract(data,'$.observedAt')<=?) RETURNING id`)
  .bind(now,verified.pendingDetails?now:nextDailyPublicRefresh(now),JSON.stringify(listings),JSON.stringify(verified.complete===true),JSON.stringify(verified.complete===true||previous?.hasCompleteSnapshot===true||previous?.complete===true),verified.complete?verified.observedAt:previous?.completeObservedAt||(previous?.complete?previous.observedAt:null)||null,JSON.stringify(verified.expectedCount),verified.pages,verified.observedAt,verified.pendingDetails||0,verified.detailsChecked||0,verified.detailsFailed||0,iso(now),lease.token,prefix+lease.id,lease.fingerprint,lease.token,now,verified.observedAt).all();
 return changed(result);
}

export async function failPublicSource(database:PublicDb,lease:Lease,error:any,now=Date.now()){
 validateTime(now);const code=failureCode(error),retrySeconds=Number(error?.retryAfterSeconds),retryMs=Number.isFinite(retrySeconds)?Math.min(604800000,Math.max(3600000,retrySeconds*1000)):3600000;
 const result=await database.prepare(`UPDATE records SET data=json_set(data,'$.status','error','$.lastErrorCode',?,'$.nextRunAt',?,'$.lease',json('null')),revision=revision+1,updated_at=?,actor='publiccollector',mutation_id=?
  WHERE id=? AND kind='system' AND json_extract(data,'$.fingerprint')=? AND json_extract(data,'$.lease.token')=? AND json_extract(data,'$.lease.until')>? RETURNING id`)
  .bind(code,now+retryMs,iso(now),lease.token,prefix+lease.id,lease.fingerprint,lease.token,now).all();
 return changed(result);
}

export async function readPublicSourceSnapshots(database:PublicDb):Promise<PublicSourceSnapshot[]>{
 const rows=await database.prepare("SELECT data FROM records WHERE kind='system' AND id LIKE 'system:public-source:%'").all();
 return (rows.results||[]).map(decode).filter((snapshot:PublicSourceSnapshot|null):snapshot is PublicSourceSnapshot=>snapshot!==null);
}

function belongsToSource(listing:any,sourceId:string){
 if(listing.publicSourceId)return listing.publicSourceId===sourceId;
 const source=knownSource(sourceId);if(!source||!listing.sourceUrl)return false;
 try{const candidate=new URL(listing.sourceUrl),configured=new URL(source.url);return candidate.origin===configured.origin&&candidate.pathname.replace(/\/+$/,'')===configured.pathname.replace(/\/+$/,'');}catch{return false;}
}
/** Only an imported complete, verified source can retire its older automated VINs. */
function importedSourceRetirements(snapshot:any,now:number){
 if(!Number.isFinite(now))return null;
 const report=snapshot?.report,validTime=(value:any)=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now+300000;
 const count=(value:any)=>Number.isSafeInteger(value)&&value>=0;
 if(!snapshot||!Array.isArray(snapshot.vins)||!count(snapshot.count)||snapshot.count<1||snapshot.count>10000||snapshot.vins.length!==snapshot.count||snapshot.vins.some((vin:any)=>typeof vin!=='string'||!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))||new Set(snapshot.vins).size!==snapshot.count||!validTime(snapshot.observedAt))return null;
 if(report?.mode!=='complete_selected_source_aggregate'||report.complete!==true||report.uniqueVehicles!==snapshot.count||!validTime(report.generatedAt)||!Array.isArray(report.sources)||report.sources.length>200)return null;
 const cutoffs=new Map<string,number>();
 for(const proof of report.sources){
  const source=knownSource(proof?.id);
  if(!source||proof.status!=='verified'||proof.url!==source.url||!count(proof.expectedCount)||proof.expectedCount>100000||!count(proof.retailCount)||!count(proof.wholesaleExcluded)||proof.retailCount+proof.wholesaleExcluded!==proof.expectedCount||!validTime(proof.observedAt))continue;
  const cutoff=Date.parse(proof.observedAt);if(cutoff>Date.parse(report.generatedAt)||cutoff>Date.parse(snapshot.observedAt))continue;
  cutoffs.set(source.id,Math.max(cutoffs.get(source.id)||0,cutoff));
 }
 return {vins:new Set<string>(snapshot.vins),cutoffs};
}
/** Preserve manual records and unrelated seeds; replace legacy public rows by verified source only. */
export function mergePublicMarketRecords(records:RecordEntry[],snapshots:PublicSourceSnapshot[],marketSnapshot?:any,now=Date.now()):RecordEntry[]{
 const imported=importedSourceRetirements(marketSnapshot,now);
 const valid=snapshots.filter(snapshot=>snapshot.lastSuccessAt&&Array.isArray(snapshot.listings));
 const complete=valid.filter(snapshot=>snapshot.complete===true||snapshot.hasCompleteSnapshot===true);
 const retained=records.filter(record=>record.kind!=='comp'||!record.data.publicListing||!complete.some(snapshot=>belongsToSource(record.data,snapshot.id)&&Date.parse(record.data.observedAt)<=Date.parse(snapshot.completeObservedAt||snapshot.observedAt||'')));
 const provenance=(listing:any)=>({dealer:listing.dealer||listing.source||'',url:listing.url||'',price:listing.price??null,observedAt:listing.observedAt,publicSourceId:listing.publicSourceId||''});
 const combine=(a:any,b:any)=>{const seen=new Map<string,any>();for(const source of [...(a?.sourceListings||[]),...(a?[provenance(a)]:[]),...(b.sourceListings||[]),provenance(b)])seen.set([source.publicSourceId,source.url,source.observedAt].join('|'),source);return [...seen.values()].slice(-30);};
 const automated=new Map<string,any>();
 for(const snapshot of valid)for(const listing of snapshot.listings||[]){
  const cutoff=imported?.cutoffs.get(snapshot.id),observed=Date.parse(listing.observedAt);
  if(imported&&cutoff!==undefined&&!imported.vins.has(listing.vin)&&Number.isFinite(observed)&&observed<=cutoff&&belongsToSource(listing,snapshot.id))continue;
  const prior=automated.get(listing.vin),selected=!prior||Date.parse(listing.observedAt)>Date.parse(prior.observedAt)?listing:prior;automated.set(listing.vin,{...selected,sourceListings:combine(prior,listing)});
 }
 const retainedByVin=new Map(retained.filter(record=>record.kind==='comp'&&record.data.publicListing).map(record=>[record.data.vin,record]));
 for(const [vin,listing] of automated){const prior=retainedByVin.get(vin);if(prior&&Date.parse(prior.data.observedAt)>Date.parse(listing.observedAt)){const index=retained.indexOf(prior);retained[index]={...prior,data:{...prior.data,sourceListings:combine(listing,prior.data)}};continue;}const index=prior?retained.indexOf(prior):-1;if(index>=0)retained.splice(index,1);retained.push({id:'public:'+vin,kind:'comp',data:{...listing,sourceListings:combine(prior?.data,listing)},revision:0,updatedAt:listing.observedAt});}
 return retained;
}

export async function publicMarketStatus(database:PublicDb,workspace:Workspace,now=Date.now()){
 validateTime(now);const snapshots=await readPublicSourceSnapshots(database),byId=new Map(snapshots.map(snapshot=>[snapshot.id,snapshot]));
 const sources=publicMarketSources.map(source=>{const snapshot=byId.get(source.id),lastError=snapshot?.lastErrorCode||'',pending=snapshot?.status==='pending'||snapshot?.fingerprint!==fingerprint(source);const status=snapshot?.lease&&snapshot.lease.until>now?'refreshing':pending?'pending':snapshot?.status==='error'?'error':snapshot?.lastSuccessAt?'ready':'pending';return {id:source.id,name:source.name,url:source.url,status,count:snapshot?.listings?.length||0,lastSuccessAt:snapshot?.lastSuccessAt?iso(snapshot.lastSuccessAt):null,lastAttemptAt:snapshot?.lastAttemptAt?iso(snapshot.lastAttemptAt):null,nextRunAt:iso(snapshot?.nextRunAt??now),pendingDetails:(snapshot as any)?.pendingDetails||0,detailsFailed:(snapshot as any)?.detailsFailed||0,complete:snapshot?.complete===true,stale:pending||!snapshot?.lastSuccessAt||now-snapshot.lastSuccessAt>=source.refreshHours*3600000,message:status==='error'?failureMessages[lastError]||failureMessages.unavailable:status==='pending'?'Waiting for unattended collection using the current source configuration.':snapshot?.lastSuccessAt?(snapshot.complete?'Verified source snapshot; selected sources only.':'Verified observed listings; source coverage is partial.'):'Waiting for the first unattended collection.'};});
 const internal=new Map(workspace.records.filter(record=>record.kind==='vehicle').map(record=>[record.id,record.data])),listings=workspace.records.filter(record=>record.kind==='comp').map(record=>record.data);
 const vehicles=workspace.vehicles.filter(vehicle=>!['sold','wholesale'].includes(internal.get(vehicle.vin)?.status)).map(vehicle=>{const comparison=matchComparables(vehicle,listings,{certifiedOnly:vehicle.certified===true,now}),stats=samplePricing(vehicle,comparison.matched);return {vin:vehicle.vin,count:stats.count,sourceCount:stats.sourceCount,enoughData:stats.enoughData};});
 const successes=sources.map(source=>source.lastSuccessAt).filter((stamp):stamp is string=>stamp!==null).sort();
 return {mode:'public',refreshHours:24,refreshTime:'09:00',refreshTimeZone:'America/Detroit',sources,totalListings:new Set(listings.map(listing=>listing.vin||listing.url)).size,activeSources:sources.filter(source=>source.lastSuccessAt).length,subscriptionCost:0,coverage:{vehicles,total:vehicles.length,withMatches:vehicles.filter(vehicle=>vehicle.count>0).length,withEnoughData:vehicles.filter(vehicle=>vehicle.enoughData).length},lastSuccessAt:successes.at(-1)||null,checkedAt:iso(now),limitations:'Selected public dealer listings; coverage varies by vehicle. Asking prices are not sold values.'};
}

export async function refreshPublicMarkets(database:PublicDb,limit=3,now=Date.now(),collector:Collector=collectPublicSource){
 if(!Number.isInteger(limit)||limit<1||limit>3)throw new Error('Public refresh batches require 1–3 sources.');
 validateTime(now);const startedAt=Date.now();await syncPublicSources(database,now);const outcomes:any[]=[];
 // One source leaves room for complete pagination and bounded detail reads
 // within the Worker subrequest budget. The requested limit is a ceiling.
 for(let index=0;index<Math.min(limit,1);index++){
  const current=now+(Date.now()-startedAt),lease=await claimPublicSource(database,current);if(!lease)break;
  try{const collection=await collector(lease.source,undefined,current,lease.previousListings);const completedAt=now+(Date.now()-startedAt);const written=await commitPublicSuccess(database,lease,collection,completedAt);outcomes.push({id:lease.id,status:written?'ready':'superseded',count:written?collection.listings.length:null});}
  catch(error){await failPublicSource(database,lease,error,now+(Date.now()-startedAt));outcomes.push({id:lease.id,status:'error',code:failureCode(error)});}
 }
 return {mode:'public',status:'processed',processed:outcomes.length,outcomes};
}
