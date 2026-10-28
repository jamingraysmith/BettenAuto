import {env} from 'cloudflare:workers';
import {db,workspace} from './server';
import {fetchVehicleMarket,MarketProviderError,marketProviderEndpoint} from './market-provider';
import {syncMarketJobs,claimMarketJob,commitMarketSuccess,failMarketJob,readMarketCache,marketJobSummaries,purgeMarketCaches,type MarketTarget} from './market-jobs';
import {matchComparables,samplePricing} from './pricing';
import type {Vehicle} from './types';

const bounded=(v:any,fallback:number,min:number,max:number)=>{const n=Number(v);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback};
export function marketConfiguration(){
 const values=env as any;
 const requestedProvider=String(values.MARKET_DATA_PROVIDER||'autodev').trim().toLowerCase(),providerValid=['autodev','custom'].includes(requestedProvider);
 const provider=requestedProvider==='custom'?'custom':'autodev';
 const apiKey=String(values.MARKET_DATA_API_KEY||'');
 const enabled=values.MARKET_DATA_ENABLED==='true';
 const requestedAccountMode=String(values.MARKET_DATA_ACCOUNT_MODE||'production').trim().toLowerCase(),accountModeValid=['evaluation','production'].includes(requestedAccountMode);
 const accountMode=requestedAccountMode==='evaluation'?'evaluation':'production';
 const cacheAllowed=accountMode==='production'&&values.MARKET_DATA_CACHE_ALLOWED==='true';
 const endpoint=String(values.MARKET_DATA_ENDPOINT||'');
 const maxPages=accountMode==='evaluation'?1:bounded(values.MARKET_DATA_MAX_PAGES,1,1,2),pageSize=accountMode==='evaluation'?20:provider==='autodev'?100:50;
 const dailyLimit=accountMode==='evaluation'?bounded(values.MARKET_DATA_DAILY_LIMIT,1000,1,1000):bounded(values.MARKET_DATA_DAILY_LIMIT,300,1,10000);
 const monthlyLimit=accountMode==='evaluation'?bounded(values.MARKET_DATA_MONTHLY_LIMIT,1000,1,1000):bounded(values.MARKET_DATA_MONTHLY_LIMIT,10000,1,1000000),refreshHours=bounded(values.MARKET_DATA_REFRESH_HOURS,24,1,168);
 const queryVersion=String(values.MARKET_DATA_QUERY_VERSION||'1').slice(0,100);
 let endpointValid=true;try{marketProviderEndpoint({provider,apiKey,endpoint})}catch{endpointValid=false}
 return {provider:provider as 'autodev'|'custom',apiKey,enabled,cacheAllowed,endpoint,accountMode,maxPages,pageSize,dailyLimit,monthlyLimit,refreshHours,queryVersion,configured:providerValid&&accountModeValid&&!!apiKey.trim()&&endpointValid,configurationIssue:!providerValid?'invalid_provider':!accountModeValid?'invalid_account_mode':null};
}
export function publicMarketConfiguration(){const c=marketConfiguration();return {provider:c.provider,configured:c.configured,enabled:c.enabled,cacheAllowed:c.cacheAllowed,accountMode:c.accountMode,maxPages:c.maxPages,pageSize:c.pageSize,dailyLimit:c.dailyLimit,monthlyLimit:c.monthlyLimit,refreshHours:c.refreshHours,status:!c.configured?'setup_required':!c.enabled?'disabled':'connected',mode:c.cacheAllowed?'licensed_cache':'live_only'};}
export function marketOptions(input:any={}){
 const maxYearDelta=bounded(input.maxYearDelta,0,0,3),maxMileageDelta=bounded(input.maxMileageDelta,25000,1000,100000),maxAgeDays=bounded(input.maxAgeDays,14,1,60);
 const radiusMiles=input.radiusMiles==null||input.radiusMiles===''?null:Number(input.radiusMiles);
 if(radiusMiles!==null&&(!Number.isInteger(radiusMiles)||radiusMiles<1||radiusMiles>5000))throw new MarketProviderError('configuration');
 return {radiusMiles,originZip:'49546',zip:'49546',maxYearDelta,maxMileageDelta,maxAgeDays,exactTrim:input.exactTrim!==false,certifiedOnly:input.certifiedOnly===true};
}
export function validateMarketVehicle(input:any):Vehicle{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Enter vehicle details to search the market.');
 const text=(k:string)=>typeof input[k]==='string'?input[k].trim().slice(0,150):'';
 const year=Number(input.year),mileage=input.mileage===''||input.mileage==null?null:Number(input.mileage),vin=text('vin').toUpperCase();
 if(!Number.isInteger(year)||year<1886||year>2100||!text('make')||!text('model')||mileage===null||!Number.isFinite(mileage)||mileage<0||mileage>2000000)throw new Error('Year, make, model and valid odometer miles are required.');
 if(vin&&!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))throw new Error('Enter a valid VIN or leave it blank for a manual appraisal.');
 if(!/^(new|used|pre[- ]?owned|certified(?: pre[- ]?owned)?)$/i.test(text('condition')))throw new Error('Choose New or Used condition.');
 const price=input.price===''||input.price==null?null:Number(input.price);
 return {vin,year,make:text('make'),model:text('model'),trim:text('trim'),condition:/^new$/i.test(text('condition'))?'New':'Used',mileage,bodyStyle:text('bodyStyle'),engine:text('engine'),engineSize:text('engineSize'),fuelType:text('fuelType'),drivetrain:text('drivetrain'),certified:input.certified===true?true:input.certified===false?false:null,price:price!==null&&Number.isFinite(price)&&price>=0?price:null};
}
export async function marketTarget(vehicle:Vehicle,options=marketOptions(),provider=marketConfiguration().provider):Promise<MarketTarget>{
 const v=validateMarketVehicle(vehicle),configuration=marketConfiguration();
 const endpoint=marketProviderEndpoint({...configuration,provider});endpoint.searchParams.sort();
 // Hash the full scope: query values and private endpoint paths never enter persisted/public metadata.
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint.href));
 const providerScope=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return {vin:v.vin,fingerprint:JSON.stringify({version:5,queryVersion:configuration.queryVersion,provider,providerScope,accountMode:configuration.accountMode,maxPages:configuration.maxPages,pageSize:configuration.pageSize,year:v.year,make:v.make?.toLowerCase(),model:v.model?.toLowerCase(),trim:v.trim?.toLowerCase(),condition:v.condition,mileage:v.mileage,certified:v.certified,bodyStyle:v.bodyStyle,options}),vehicle:{year:v.year,make:v.make,model:v.model,trim:v.trim,condition:v.condition,mileage:v.mileage,certified:v.certified as boolean|null,bodyStyle:v.bodyStyle}};
}
export async function currentMarketTargets(){
 const w=await workspace(),internal=new Map(w.records.filter(r=>r.kind==='vehicle').map(r=>[r.id,r.data]));
 const targets:MarketTarget[]=[],invalid:string[]=[];
 for(const vehicle of w.vehicles){if(['sold','wholesale'].includes(internal.get(vehicle.vin)?.status))continue;try{const v=validateMarketVehicle(vehicle);if(!v.trim){invalid.push(v.vin);continue}targets.push(await marketTarget(v));}catch{invalid.push(vehicle.vin)}}
 return {workspace:w,targets,invalid};
}
const budgetParts=(now:number)=>{const stamp=new Date(now).toISOString();return {day:stamp.slice(0,10),month:stamp.slice(0,7),dayPath:'$.days.d'+stamp.slice(8,10),stamp};};
const legacyMonthPattern=(month:string)=>'system:market-budget:'+month+'-[0-9][0-9]';
const monthBudgetId=(month:string)=>'system:market-budget-month:'+month;
/** One statement reserves both caps; legacy daily reservations still count during migration. */
export async function reserveMarketBudget(units:number,now=Date.now()){
 const c=marketConfiguration();if(!Number.isInteger(units)||units<1||units>2)throw new Error('Invalid provider request allowance.');
 const {day,month,dayPath,stamp}=budgetParts(now),token=crypto.randomUUID(),dayKey='d'+day.slice(8,10);
 const data=JSON.stringify({reserved:units,days:{[dayKey]:units}}),legacyDayId='system:market-budget:'+day,pattern=legacyMonthPattern(month);
 const legacyMonth="(SELECT COALESCE(SUM(CAST(json_extract(data,'$.reserved') AS INTEGER)),0) FROM records WHERE kind='system' AND id GLOB ?)";
 const legacyDay="(SELECT COALESCE(SUM(CAST(json_extract(data,'$.reserved') AS INTEGER)),0) FROM records WHERE kind='system' AND id=?)";
 const row=await db().prepare(`INSERT INTO records(id,kind,data,revision,updated_at,actor,mutation_id)
  SELECT ?,'system',?,1,?,'marketservice',? WHERE ?+${legacyMonth}<=? AND ?+${legacyDay}<=?
  ON CONFLICT(id) DO UPDATE SET data=json_set(records.data,'$.reserved',COALESCE(CAST(json_extract(records.data,'$.reserved') AS INTEGER),0)+?, ?,COALESCE(CAST(json_extract(records.data,?) AS INTEGER),0)+?),revision=records.revision+1,updated_at=excluded.updated_at,actor='marketservice',mutation_id=excluded.mutation_id
  WHERE records.kind='system' AND COALESCE(CAST(json_extract(records.data,'$.reserved') AS INTEGER),0)+?+${legacyMonth}<=? AND COALESCE(CAST(json_extract(records.data,?) AS INTEGER),0)+?+${legacyDay}<=? RETURNING data`)
  .bind(monthBudgetId(month),data,stamp,token,units,pattern,c.monthlyLimit,units,legacyDayId,c.dailyLimit,units,dayPath,dayPath,units,units,pattern,c.monthlyLimit,dayPath,units,legacyDayId,c.dailyLimit).first<any>();
 return !!row;
}
export async function marketBudgetUsage(now=Date.now()){
 const c=marketConfiguration(),{day,month}=budgetParts(now);
 const result=await db().prepare(`SELECT
  (SELECT data FROM records WHERE id=? AND kind='system') AS current_budget,
  (SELECT COALESCE(SUM(CAST(json_extract(data,'$.reserved') AS INTEGER)),0) FROM records WHERE kind='system' AND id GLOB ?) AS legacy_month,
  (SELECT COALESCE(SUM(CAST(json_extract(data,'$.reserved') AS INTEGER)),0) FROM records WHERE kind='system' AND id=?) AS legacy_today`)
  .bind(monthBudgetId(month),legacyMonthPattern(month),'system:market-budget:'+day).first<any>();
 const budget=result?.current_budget?JSON.parse(result.current_budget):{},reservedToday=Number(result?.legacy_today||0)+Number(budget.days?.['d'+day.slice(8,10)]||0),reservedThisMonth=Number(result?.legacy_month||0)+Number(budget.reserved||0);
 return {reservedToday,reservedThisMonth,remainingToday:Math.max(0,c.dailyLimit-reservedToday),remainingThisMonth:Math.max(0,c.monthlyLimit-reservedThisMonth),budgetPeriod:'UTC calendar month',monthResetsAt:new Date(Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth()+1,1)).toISOString()};
}
async function requireMarketBudget(units:number,now=Date.now()){
 if(await reserveMarketBudget(units,now))return;
 const usage=await marketBudgetUsage(now);throw new MarketServiceError(usage.remainingThisMonth<units?'monthly_budget':'daily_budget');
}
export async function marketStatus(now=Date.now()){
 const c=publicMarketConfiguration();if(!c.cacheAllowed)await purgeMarketCaches(db(),now);
 const {targets,invalid}=await currentMarketTargets(),summaries=await marketJobSummaries(db(),now);
 const vehicles:Record<string,any>={};let fresh=0,stale=0,pending=0,failed=0;
 for(const t of targets){const previous=summaries[t.vin],identityChanged=!!previous&&previous.targetFingerprint!==t.fingerprint;const {targetFingerprint:_privateFingerprint,...summary}=previous||{vin:t.vin,status:'not_checked',hasCache:false};let s=summary;if(identityChanged)s={...s,status:'pending',hasCache:false,cacheStale:null,identityChanged:true};else if(!c.cacheAllowed)s={...s,hasCache:false,cacheStale:null};vehicles[t.vin]=s;if(s.hasCache&&!s.cacheStale)fresh++;else if(s.hasCache)stale++;else if(s.status==='error')failed++;else pending++;}
 const usage=await marketBudgetUsage(now);
 return {...c,...usage,inventoryCount:targets.length+invalid.length,eligible:targets.length,missingDetails:invalid.length,fresh,stale,pending,failed,vehicles,checkedAt:new Date(now).toISOString()};
}
export class MarketServiceError extends Error{readonly code:string;constructor(code:string){super('The market service could not complete this request.');this.code=code;this.name='MarketServiceError';}}
export function marketError(error:any):{code:string;message:string}{
 const candidate=error instanceof MarketProviderError||error instanceof MarketServiceError?error.code:'unavailable';
 const messages:Record<string,string>={configuration:'Nationwide market data is not connected. Configure an authorized production provider before live searches can run.',authentication:'The market provider rejected its credentials. Check the provider connection.',rate_limited:'The provider rate or account allowance has been reached. Try again after the allowance resets.',daily_budget:'The dealership’s daily market-request limit has been reached.',monthly_budget:'The dealership’s monthly market-request limit has been reached.',invalid_vehicle:'Complete the vehicle details before searching.',invalid_response:'The provider returned data that could not be verified.',unavailable:'The market provider is temporarily unavailable. No new market price has been supplied.'};
 const code=Object.hasOwn(messages,candidate)?candidate:'unavailable';
 return {code,message:messages[code]};
}
function retryAtFor(error:any,now:number){
 const failure=marketError(error);
 if(failure.code==='monthly_budget')return Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth()+1,1)+1000;
 if(failure.code==='daily_budget')return Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth(),new Date(now).getUTCDate()+1)+1000;
 if(error instanceof MarketProviderError&&failure.code==='rate_limited'&&Number.isFinite(error.retryAfterSeconds))return now+Math.max(60000,Math.min(2592000,Number(error.retryAfterSeconds))*1000);
 return now+3600000;
}
function envelope(vehicle:Vehicle,result:any,options:any,cached=false,stale=false){
 const comparison=matchComparables(vehicle,result.listings,{...options,now:Date.now()});
 return {status:stale?'stale':'ready',provider:result.provider||marketConfiguration().provider,fetchedAt:result.fetchedAt||result.observedAt,listings:result.listings,matchedCount:comparison.matched.length,stats:samplePricing(vehicle,comparison.matched),excluded:comparison.excluded,total:result.total??null,truncated:!!result.truncated,coverage:result.coverage,cacheAllowed:!!result.cacheAllowed,cached,stale,options};
}
export async function lookupVehicleMarket(vehicle:Vehicle,inputOptions:any={},now=Date.now()){
 const c=marketConfiguration();if(!c.cacheAllowed)await purgeMarketCaches(db(),now);
 if(!c.configured||!c.enabled)throw new MarketProviderError('configuration');
 const v=validateMarketVehicle(vehicle),options=marketOptions(inputOptions);
 if(options.exactTrim&&!v.trim)throw new MarketProviderError('invalid_vehicle');
 let lease:any=null,target:any=null;
 if(c.cacheAllowed&&v.vin){target=await marketTarget(v,options);await syncMarketJobs(db(),[target],now);const cached=await readMarketCache(db(),v.vin,now);if(cached&&!cached.stale&&cached.target.fingerprint===target.fingerprint)return envelope(v,{...cached.coverage,listings:cached.listings,cacheAllowed:true},options,true);lease=await claimMarketJob(db(),{now,leaseMs:120000,allowedVins:[v.vin]});if(!lease)throw new MarketProviderError('rate_limited');}
 try{
  await requireMarketBudget(c.maxPages,now);
  const result=await fetchVehicleMarket(v,{...c,...options});
  if(lease)await commitMarketSuccess(db(),lease,{listings:result.listings,coverage:{...result,listings:undefined},cacheAllowed:marketConfiguration().cacheAllowed&&result.cacheAllowed,nextRunAt:now+c.refreshHours*3600000},Date.now());
  return envelope(v,result,options);
 }catch(e){if(lease)await failMarketJob(db(),lease,{code:marketError(e).code,retryAt:retryAtFor(e,Date.now())},Date.now());throw e;}
}
export async function refreshVehicleMarkets(limit=3,now=Date.now()){
 const c=marketConfiguration();if(!c.cacheAllowed)await purgeMarketCaches(db(),now);
 const {targets,invalid}=await currentMarketTargets();await syncMarketJobs(db(),targets,now);
 if(!c.configured||!c.enabled)return {status:'setup_required',queued:targets.length,missingDetails:invalid.length,processed:0,message:marketError(new MarketProviderError('configuration')).message};
 if(c.accountMode==='evaluation')return {status:'evaluation_only',queued:targets.length,processed:0,message:'Free-plan mode allows individual vehicle lookups only. Automatic inventory-wide searches are disabled to preserve the free allowance.'};
 if(!c.cacheAllowed)return {status:'live_only',queued:targets.length,processed:0,message:'Live searches are available on vehicle selection. Scheduled result storage requires provider retention rights and explicit configuration.'};
 const outcomes:any[]=[];
 for(let i=0;i<Math.min(5,Math.max(1,limit));i++){
  const lease=await claimMarketJob(db(),{now:Date.now(),leaseMs:120000,allowedVins:targets.map(t=>t.vin)});if(!lease)break;
  try{await requireMarketBudget(c.maxPages);const result=await fetchVehicleMarket({vin:lease.vin,...lease.target.vehicle},{...c,...marketOptions()});const written=await commitMarketSuccess(db(),lease,{listings:result.listings,coverage:{...result,listings:undefined},cacheAllowed:marketConfiguration().cacheAllowed&&result.cacheAllowed,nextRunAt:Date.now()+c.refreshHours*3600000});outcomes.push({vin:lease.vin,status:written?'ready':'superseded'});}catch(error){const e=marketError(error);await failMarketJob(db(),lease,{code:e.code,retryAt:retryAtFor(error,Date.now())});outcomes.push({vin:lease.vin,status:'error',code:e.code});if(['authentication','rate_limited','daily_budget','monthly_budget'].includes(e.code))break;}
 }
 return {status:'processed',queued:targets.length,missingDetails:invalid.length,processed:outcomes.length,outcomes};
}
