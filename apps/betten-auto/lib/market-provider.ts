import type {Comparable} from './pricing';

export type MarketVehicle={vin?:string;year?:number;make?:string;model?:string;trim?:string;condition?:string;mileage?:number|null;certified?:boolean|null;bodyStyle?:string};
export type MarketProviderConfig={provider:'autodev'|'custom';apiKey:string;endpoint?:string;cacheAllowed:boolean;maxPages?:number;pageSize?:number;maxYearDelta?:number;maxMileageDelta?:number|null;exactTrim?:boolean;searchModel?:string;searchTrim?:string;certifiedOnly?:boolean;radiusMiles?:number|null;zip?:string};
export type MarketProviderErrorCode='configuration'|'invalid_vehicle'|'authentication'|'rate_limited'|'unavailable'|'invalid_response';
const messages:Record<MarketProviderErrorCode,string>={configuration:'Market data connection is not configured correctly.',invalid_vehicle:'Enter valid year, make, model and condition for a market search.',authentication:'The market provider rejected the connection credential.',rate_limited:'The market provider usage limit was reached. Try again after the indicated delay.',unavailable:'The market provider is temporarily unavailable.',invalid_response:'The market provider returned an unusable response.'};
export class MarketProviderError extends Error{
 readonly code:MarketProviderErrorCode;readonly retryAfterSeconds?:number;
 constructor(code:MarketProviderErrorCode,retryAfterSeconds?:number){super(messages[code]);this.name='MarketProviderError';this.code=code;this.retryAfterSeconds=retryAfterSeconds;}
}
export type MarketProviderResult={provider:string;observedAt:string;fetchedAt:string;listings:Comparable[];total:number|null;truncated:boolean;coverage:string;cacheAllowed:boolean;requestCount:number;rejectedCount:number};

const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const condition=(v:unknown):'New'|'Used'|null=>typeof v==='string'?/^new$/i.test(v.trim())?'New':/^(used|pre[- ]?owned|certified(?: pre[- ]?owned)?)$/i.test(v.trim())?'Used':null:null;
const vin=(v:unknown)=>typeof v==='string'&&/^[A-HJ-NPR-Z0-9]{17}$/i.test(v.trim())?v.trim().toUpperCase():'';
const secretQuery=/^(?:api[_-]?key|key|token|access[_-]?token|authorization|secret|password|signature)$/i;
const trackingQuery=/^(?:utm_.+|gclid|dclid|fbclid|msclkid|gbraid|wbraid|_ga|_gl)$/i;
const isPrivateHost=(name:string)=>{
 const host=name.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
 if(!host||!host.includes('.')||host.includes(':')||/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/.test(host))return true;
 if(/^\d+(?:\.\d+){3}$/.test(host)){
  const [a,b]=host.split('.').map(Number);
  return a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&[0,168].includes(b)||a===100&&b>=64&&b<=127||a===198&&[18,19].includes(b);
 }
 return false;
};
function containsCredential(value:string,key:string){
 if(!key)return false;let decoded=value;
 for(let i=0;i<5;i++){if(decoded.includes(key))return true;try{const next=decodeURIComponent(decoded);if(next===decoded)return false;decoded=next;}catch{return false;}}
 return decoded.includes(key);
}
function endpoint(value:string,key=''){
 if(containsCredential(value,key))throw new MarketProviderError('configuration');
 let u:URL;try{u=new URL(value);}catch{throw new MarketProviderError('configuration');}
 if(containsCredential(u.href,key)||u.protocol!=='https:'||u.username||u.password||isPrivateHost(u.hostname)||u.port&&u.port!=='443'||u.hash||[...u.searchParams.keys()].some(k=>secretQuery.test(k)))throw new MarketProviderError('configuration');
 return u;
}
/** Shared validation keeps credentials out of endpoint URLs and persisted query identities. */
export function marketProviderEndpoint(config:Pick<MarketProviderConfig,'provider'|'endpoint'|'apiKey'>){
 if(!['autodev','custom'].includes(config.provider)||typeof config.apiKey!=='string'||/[\r\n]/.test(config.apiKey))throw new MarketProviderError('configuration');
 return endpoint(config.provider==='autodev'?'https://api.auto.dev/listings':config.endpoint||'',config.provider==='custom'?config.apiKey.trim():'');
}
function sourceDate(value:unknown,now:number){
 const text=typeof value==='string'?value.trim():'';
 // Provider timestamps without an offset are documented as UTC, never the server's local zone.
 const date=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)?text.replace(' ','T')+'Z':text;
 const t=typeof value==='number'&&Number.isFinite(value)?value<1e11?value*1000:value:date?Date.parse(date):NaN;
 return Number.isFinite(t)&&t>=Date.UTC(1900,0,1)&&t<=now+300000?new Date(t).toISOString():'';
}
function outputText(value:unknown,key:string,max=300){return typeof value==='string'?value.split(key).join('[redacted]').slice(0,max).trim():'';}
function listingUrl(value:unknown,key:string){
 if(typeof value!=='string')return '';
 try{
  const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||isPrivateHost(u.hostname))return '';
  for(const [name,v] of [...u.searchParams])if(secretQuery.test(name)||v.includes(key))u.searchParams.delete(name);
  u.hash='';for(const name of [...u.searchParams.keys()])if(trackingQuery.test(name))u.searchParams.delete(name);u.searchParams.sort();
  const safe=u.href;return containsCredential(safe,key)?'':safe;
 }catch{return '';}
}
function normalize(raw:any,provider:'autodev'|'custom',key:string,now:number,retrievedAt:string):Comparable|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const v=provider==='autodev'?raw.vehicle:raw,r=provider==='autodev'?raw.retailListing:raw;
 if(!v||typeof v!=='object'||!r||typeof r!=='object'||raw.removedAt||r.removedAt)return null;
 const id=vin(v.vin||raw.vin),year=finite(v.year),make=outputText(v.make,key),model=outputText(v.model,key),price=finite(r.price);
 const miles=finite(provider==='autodev'?r.miles:r.mileage??r.miles);
 const type=provider==='autodev'?typeof r.used==='boolean'?r.used?'Used':'New':null:condition(r.condition);
 if(!id||year===null||!Number.isInteger(year)||year<1886||year>2100||!make||!model||price===null||price<=0||miles===null||miles<0||!type)return null;
 const cpo=provider==='autodev'?typeof r.cpo==='boolean'?r.cpo:null:typeof r.certified==='boolean'?r.certified:/^certified/i.test(String(r.condition))?true:null;
 const observedAt=sourceDate(provider==='autodev'?raw.updatedAt:raw.providerObservedAt??raw.observedAt??raw.updatedAt??raw.last_seen_at_date??raw.last_seen_at,now);
 const url=listingUrl(provider==='autodev'?r.vdp:raw.url,key),distance=provider==='custom'?finite(raw.distanceMiles):null;
 return {vin:id,year,make,model,trim:outputText(v.trim,key),condition:type,certified:cpo,price,mileage:miles,bodyStyle:outputText(v.bodyStyle,key),drivetrain:outputText(v.drivetrain,key),dealer:outputText(r.dealer,key),city:outputText(r.city,key),state:outputText(r.state,key,20),postalCode:outputText(r.zip??r.postalCode,key,20),url,source:provider==='autodev'?'Auto.dev authorized market feed':'Authorized JSON market feed',provider,scope:'provider',observedAt,providerObservedAt:observedAt||null,observationBasis:provider==='autodev'&&!observedAt&&(raw.updatedAt==null||raw.updatedAt==='')?'active_provider_response':'provider_updated_at',retrievedAt,distanceMiles:distance!==null&&distance>=0?distance:null,pricingBasis:provider==='custom'&&typeof raw.pricingBasis==='string'?outputText(raw.pricingBasis,key,700):'Provider advertised asking price; fee inclusion is not supplied.'};
}
/** Search spelling variants in one OR query; original vehicle identity still governs pricing. */
export function marketSearchNames(vehicle:MarketVehicle){
 const make=String(vehicle.make||'').trim(),model=String(vehicle.model||'').trim(),trim=String(vehicle.trim||'').trim(),models=new Set([model]),trims=new Set([trim]);
 const brand=make.toLowerCase().replace(/[^a-z0-9]/g,'');
 if(brand==='volkswagen'){
  const simple=trim.replace(/^\d\.\d\s*[TL]\s*/i,'').replace(/\s+(?:4MOTION|AWD|FWD|RWD|4WD)\b/gi,'').trim();trims.add(simple);
  for(const value of [...trims]){trims.add(value.replace(/\bwith\b/gi,'w/').replace(/Technology Package/gi,'Technology'));trims.add(value.replace(/w\/?\s*Technology/gi,'with Technology'));}
  if(/^golf gti$/i.test(model))models.add('GTI');
 }
 if(brand==='volvo'){
  const base=model.match(/^(XC60|XC90)(?:\s+(?:Recharge|Plug[- ]In Hybrid))*$/i)?.[1];
  if(base){models.add(base);if(/recharge|plug[- ]in hybrid/i.test(model)||/^T8\b/i.test(trim)){models.add(base+' Recharge');models.add(base+' Recharge Plug-In Hybrid');models.add(base+' Plug-In Hybrid');}}
  for(let pass=0;pass<2;pass++)for(const value of [...trims]){trims.add(value.replace(/\b(?:AWD|FWD|RWD)\b/gi,'').replace(/\s+/g,' ').trim());trims.add(value.replace(/^T8\s+/i,''));trims.add(value.replace(/(\d)[ -]?(?:Seater|Passenger)/gi,'$1-Seater'));trims.add(value.replace(/(\d)[ -]?(?:Seater|Passenger)/gi,'$1 Passenger'));}
 }
 if(brand==='mercedesbenz'){
  const series=model.replace(/^AMG\s+/i,'').match(/^(EQB|EQE|EQS|GLC|GLE|GLA|GLB|GLS|CLA|CLE|CLS|SL|C|E|S)(?:[- ]Class|\s*\d.*)?$/i)?.[1];
  if(series){models.add(series);if(/^[CES]$/i.test(series))models.add(series+'-Class');}
  // Numeric model badges, AMG, body style and drivetrain are checked locally.
  // A provider's trim may contain the whole badge rather than just "4MATIC".
  return {model:[...models].filter(Boolean).join(','),trim:undefined};
 }
 if(brand==='jeep'&&/^wrangler\b/i.test(model)){
  models.add('Wrangler');
  const unlimited=/unlimited/i.test(model+' '+trim),jk=/\bJK\b/i.test(model+' '+trim),jl=/\bJL\b/i.test(model+' '+trim);
  if(unlimited){models.add('Wrangler Unlimited');if(jk){models.add('Wrangler JK Unlimited');models.add('Wrangler Unlimited JK');}if(jl)models.add('Wrangler JL Unlimited');}
  const grade=trim.replace(/\b(?:Unlimited|JK|JL|4x4|4WD)\b/gi,'').replace(/\s+/g,' ').trim();
  if(grade){trims.add(grade);trims.add(grade+' 4WD');if(unlimited){trims.add('Unlimited '+grade);trims.add('Unlimited '+grade+' 4WD');}}
 }
 if(brand==='bmw'){const badge=model.match(/^([1-8])\d{2}[a-z]+(?: xDrive)?$/i);if(badge)models.add(badge[1]+' Series');}
 return {model:[...models].filter(Boolean).join(','),trim:[...trims].filter(Boolean).join(',')||undefined};
}
function nextPage(value:unknown,base:URL,key:string){
 if(typeof value!=='string'||!value)return null;
 let u:URL;try{u=new URL(value,base);}catch{throw new MarketProviderError('invalid_response');}
 if(containsCredential(u.href,key)||u.origin!==base.origin||u.pathname!==base.pathname||u.username||u.password||u.hash||[...u.searchParams].some(([name,v])=>secretQuery.test(name)||v.includes(key)))throw new MarketProviderError('invalid_response');
 return u;
}
function retryAfter(response:Response,now:number){
 const h=response.headers.get('Retry-After');if(!h)return undefined;
 const n=/^\d+$/.test(h.trim())?Number(h):Math.ceil((Date.parse(h)-now)/1000);
 return Number.isFinite(n)?Math.min(2592000,Math.max(0,n)):undefined;
}

/** Live request only: this module never writes provider data or credentials to storage. */
export async function fetchVehicleMarket(vehicle:MarketVehicle,config:MarketProviderConfig,fetchImpl:typeof fetch=fetch,now=Date.now()):Promise<MarketProviderResult>{
 if(!config||!['autodev','custom'].includes(config.provider)||typeof config.apiKey!=='string'||!config.apiKey.trim()||/[\r\n]/.test(config.apiKey)||!Number.isFinite(now))throw new MarketProviderError('configuration');
 const key=config.apiKey.trim(),type=condition(vehicle.condition),year=finite(vehicle.year);
 if(year===null||!Number.isInteger(year)||year<1886||year>2100||!vehicle.make?.trim()||!vehicle.model?.trim()||!type)throw new MarketProviderError('invalid_vehicle');
 const maxYearDelta=config.maxYearDelta??0,mileageDelta=config.maxMileageDelta===null?null:config.maxMileageDelta??25000;
 if(!Number.isInteger(maxYearDelta)||maxYearDelta<0||maxYearDelta>10||mileageDelta!==null&&(!Number.isFinite(mileageDelta)||mileageDelta<0||mileageDelta>500000)||config.radiusMiles!==undefined&&config.radiusMiles!==null&&(!Number.isFinite(config.radiusMiles)||config.radiusMiles<=0||!/^\d{5}$/.test(config.zip||'')))throw new MarketProviderError('configuration');
 // Overrides are operator-verified provider taxonomy only; local identity matching uses the subject's original fields.
 if([config.searchModel,config.searchTrim].some(v=>v!==undefined&&(typeof v!=='string'||!v.trim()||v.length>300||/[\r\n]/.test(v))))throw new MarketProviderError('configuration');
 const pageSize=config.pageSize??(config.provider==='autodev'?100:50);
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw new MarketProviderError('configuration');
 const maxPages=Math.min(2,Math.max(1,Number.isInteger(config.maxPages)?Number(config.maxPages):2)),base=marketProviderEndpoint(config);
 const first=new URL(base),yearFilter=maxYearDelta?`${year-maxYearDelta}-${year+maxYearDelta}`:String(year),mileage=finite(vehicle.mileage);
 const add=(name:string,value:string|undefined)=>{if(value!==undefined&&value!=='')first.searchParams.set(name,value);};
 if(config.provider==='autodev'){
  const names=marketSearchNames(vehicle);add('vehicle.year',yearFilter);add('vehicle.make',vehicle.make);add('vehicle.model',config.searchModel??names.model);if(config.exactTrim!==false)add('vehicle.trim',config.searchTrim??names.trim);
  add('retailListing.used',String(type==='Used'));if(config.certifiedOnly)add('retailListing.cpo','true');
  if(mileage!==null&&mileage>=0&&mileageDelta!==null)add('retailListing.miles',`${Math.max(0,mileage-mileageDelta)}-${mileage+mileageDelta}`);
  add('includeUnpriced','false');add('includes','total');add('sort','updatedAt.desc');
  if(config.radiusMiles){add('zip',config.zip);add('distance',String(config.radiusMiles));}
 }else{
  add('vin',vin(vehicle.vin));add('year',yearFilter);add('make',vehicle.make);add('model',config.searchModel??vehicle.model);if(config.exactTrim!==false)add('trim',config.searchTrim??vehicle.trim);add('condition',type);if(mileage!==null)add('mileage',String(mileage));if(mileageDelta!==null)add('maxMileageDelta',String(mileageDelta));if(config.certifiedOnly)add('certifiedOnly','true');if(config.radiusMiles){add('zip',config.zip);add('radiusMiles',String(config.radiusMiles));}
 }
 add('page','1');add('limit',String(pageSize));
 const retrievedAt=new Date(now).toISOString(),listings:Comparable[]=[],seenVins=new Set<string>(),seenUrls=new Set<string>(),seenPages=new Set<string>();
 let next:URL|null=first,total:number|null=null,requestCount=0,rejectedCount=0,returned=0,more=false,inconsistentTotal=false;
 while(next&&requestCount<maxPages){
  if(seenPages.has(next.href))throw new MarketProviderError('invalid_response');seenPages.add(next.href);
  let response:Response;
  try{requestCount++;response=await fetchImpl(next,{headers:{Authorization:'Bearer '+key,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{throw new MarketProviderError('unavailable');}
  if(response.status>=300&&response.status<400)throw new MarketProviderError('unavailable');
  if(!response.ok){if(response.status===401||response.status===403)throw new MarketProviderError('authentication');if(response.status===429)throw new MarketProviderError('rate_limited',retryAfter(response,now));throw new MarketProviderError('unavailable');}
  let body:any;try{const text=await response.text();if(text.length>4000000)throw new Error();body=JSON.parse(text);}catch{throw new MarketProviderError('invalid_response');}
  const rows=config.provider==='autodev'?body?.data:body?.listings;
  if(!Array.isArray(rows))throw new MarketProviderError('invalid_response');
  const pageTotal=body.total;if(pageTotal!==undefined&&pageTotal!==null&&(finite(pageTotal)===null||!Number.isInteger(pageTotal)||pageTotal<0))throw new MarketProviderError('invalid_response');
  if(pageTotal!==undefined&&pageTotal!==null){if(total!==null&&total!==pageTotal)inconsistentTotal=true;total=Math.max(total??0,pageTotal);}
  returned+=rows.length;if(rows.length>pageSize)more=true;
  for(const raw of rows.slice(0,pageSize)){
   const c=normalize(raw,config.provider,key,now,retrievedAt);
   if(!c||c.vin===vin(vehicle.vin)||seenVins.has(c.vin!)||c.url&&seenUrls.has(c.url)){rejectedCount++;continue;}
   if(config.provider==='autodev'&&config.radiusMiles){c.searchRadiusMiles=config.radiusMiles;c.searchOriginZip=config.zip;}
   seenVins.add(c.vin!);if(c.url)seenUrls.add(c.url);listings.push(c);
  }
  const link=config.provider==='autodev'?body.links?.next:body.next;
  next=nextPage(link,base,key);
  if(!next&&rows.length>0&&(total!==null&&returned<total||total===null&&rows.length>=pageSize)&&!(config.provider==='autodev'&&body.links&&Object.hasOwn(body.links,'next'))){next=new URL(first);next.searchParams.set('page',String(requestCount+1));}
  if(rows.length===0)next=null;
 }
 const truncated=more||!!next||inconsistentTotal||total!==null&&returned!==total||total===null;
 const coverage=`${listings.length} normalized unique listings from ${returned} returned records across ${requestCount} request(s); ${total===null?'provider total unknown':total+' provider matches'}. ${truncated?'Bounded or partial response; not complete market coverage.':'All returned provider matches were retrieved for these criteria.'} Listing update time is separate from retrieval time. Active Auto.dev results without an update date use retrieval time only for this provider observation; the dealer last-update date remains unknown.`;
 return {provider:config.provider,observedAt:retrievedAt,fetchedAt:retrievedAt,listings,total,truncated,coverage,cacheAllowed:config.cacheAllowed===true,requestCount,rejectedCount};
}
