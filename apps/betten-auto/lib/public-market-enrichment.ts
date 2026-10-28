import {parsePublicMarketDetails,type PublicMarketDetails} from './public-market-details';
import {drivetrainKey,equivalentTrim,modelKey} from './pricing';

const DAY=86400000,MAX_REQUESTS=12;
const fields=['trim','drivetrain','engine','bodyStyle','mileage','certified'] as const;
type Field=typeof fields[number];
const identityFields=['year','make','model','trim','schemaTrim','condition','drivetrain','engine','bodyStyle','certified'] as const;
const metadata=['detailsIdentityFingerprint','detailsEnrichedFields','detailsEvidence','detailsFieldObservedAt','detailsConflicts','detailsUrl','detailsCheckedAt','detailObservedAt','mileageObservedAt','certifiedObservedAt'];
const key=(value:any)=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const knownNumber=(value:any)=>value!==null&&value!==undefined&&value!==''&&typeof value==='number'&&Number.isFinite(value)&&value>=0;
const same=(a:any,b:any)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const known=(value:any)=>typeof value==='string'&&!!value.trim();
const validTime=(value:any,now:number)=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now+300000;
const recent=(value:any,now:number)=>validTime(value,now)&&now-Date.parse(value)<DAY;
function url(value:any){try{const parsed=new URL(String(value));if(parsed.protocol!=='https:'||parsed.username||parsed.password)return '';parsed.hash='';parsed.searchParams.sort();return parsed.href;}catch{return '';}}
function identity(row:any){const result:any={version:1,vin:String(row.vin||'').toUpperCase(),url:url(row.url)};for(const field of identityFields)result[field]=field==='certified'?(typeof row[field]==='boolean'?row[field]:null):field==='year'?(Number.isFinite(Number(row[field]))?Number(row[field]):null):String(row[field]??'').trim();return result;}
function object(value:any){try{if(typeof value!=='string'||value.length>4000)return null;const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;}catch{return null;}}
function fieldValues(value:any){const parsed=object(value),result:any={};if(!parsed)return result;for(const field of fields){const item=parsed[field];if(field==='mileage'?knownNumber(item):field==='certified'?item===true:typeof item==='string'&&item.length<=500&&!!item.trim())result[field]=item;}return result;}
function ownProof(row:any,now:number){
 const base=object(row.detailsIdentityFingerprint),values=fieldValues(row.detailsEnrichedFields);
 if(!base||base.version!==1||base.vin!==String(row.vin||'').toUpperCase()||base.url!==url(row.url)||url(row.detailsUrl)!==base.url)return null;
 const currentIdentity=identity(row);for(const field of identityFields){const current=currentIdentity[field];if(!same(current,base[field])&&!(fields.includes(field as Field)&&same(row[field],values[field])))return null;}
 const evidence=object(row.detailsEvidence)||{},times=object(row.detailsFieldObservedAt)||{},proven:any={},safeEvidence:any={},safeTimes:any={};
 for(const field of fields)if(Object.hasOwn(values,field)&&known(evidence[field])&&evidence[field].length<=500&&validTime(times[field],now)){proven[field]=values[field];safeEvidence[field]=evidence[field];safeTimes[field]=times[field];}
 return {base,values:proven,evidence:safeEvidence,times:safeTimes,checkedAt:validTime(row.detailsCheckedAt,now)?row.detailsCheckedAt:undefined,conflicts:typeof row.detailsConflicts==='string'&&row.detailsConflicts.length<=1000?row.detailsConflicts:'[]'};
}
function variantMissing(row:any){
 if(!known(row.trim)||modelKey(row).startsWith('unknown:'))return true;
 if(key(row.make)==='volvo'&&!/\b(?:T[4568]|B[456]|P[68])\b/i.test([row.model,row.trim].join(' ')))return true;
 return key(row.make)==='mercedesbenz'&&drivetrainKey(row)==='awd'&&!/\b4MATIC\b/i.test(String(row.trim));
}
function needsDetails(row:any){return !drivetrainKey(row)||variantMissing(row)||(/used|pre.?owned|certified/i.test(String(row.condition))&&typeof row.certified!=='boolean');}
function bodyKey(value:any){const text=key(value);return /convertible|cabriolet|roadster/.test(text)?'convertible':/coupe/.test(text)?'coupe':/wagon|estate/.test(text)?'wagon':/hatchback/.test(text)?'hatchback':/pickup|truck/.test(text)?'truck':/van/.test(text)?'van':/suv|sportutility/.test(text)?'suv':/sedan|saloon/.test(text)?'sedan':'';}
function liters(value:any){return String(value||'').match(/\b(\d\.\d)\s*(?:L\b|T\b)/i)?.[1]||'';}
function trimWords(value:any){return String(value||'').toLowerCase().replace(/(\d)[ -]?(?:seater|passenger)/g,'$1 seat').replace(/\b(?:awd|fwd|rwd|4wd|4matic|4motion|suv|sedan|coupe|convertible|cabriolet|wagon|theme)\b/g,' ').match(/[a-z0-9]+(?:\.[0-9]+)?/g)||[];}
function trimCompatible(row:any,value:string,details:PublicMarketDetails){
 if(!known(row.trim))return true;
 if(equivalentTrim(row,{...row,...details,trim:value}))return true;
 const before=trimWords(row.trim),after=new Set(trimWords(value));return before.length>0&&before.every(word=>after.has(word));
}
function identityMatches(base:any,details:PublicMarketDetails){
 if(details.year&&base.year&&details.year!==Number(base.year)||details.make&&base.make&&key(details.make)!==key(base.make))return false;
 if(!details.model||!base.model)return true;
 // A detail page may supply a missing Volvo powertrain badge on the same model.
 if(key(base.make)==='volvo'&&key(base.model)===key(details.model)&&!/\b(?:T[4568]|B[456]|P[68])\b|recharge|plug.?in/i.test([base.model,base.trim].join(' ')))return true;
 const first=modelKey({...base,bodyStyle:''}).replace(/(?:convertible|coupe|wagon|suv|sedan)$/,''),second=modelKey({...base,...details,bodyStyle:''}).replace(/(?:convertible|coupe|wagon|suv|sedan)$/,'');
 return first.startsWith('unknown:')||second.startsWith('unknown:')?key(base.model)===key(details.model):first===second;
}
type State={row:any;base:any;fingerprint:string;values:any;evidence:any;times:any;checkedAt?:string;conflicts:string[];eligible:boolean;sourceHasMiles:boolean};
type Proof=NonNullable<ReturnType<typeof ownProof>>;
function prepare(input:any,previous:Map<string,Proof>,now:number):State{
 const row={...input},own=ownProof(input,now);
 // Internal already-enriched snapshots are safe to resume. If their identity
 // was altered, strip only values actually supplied by the stale proof.
 if(!own&&typeof input.detailsIdentityFingerprint==='string'){
  const oldBase=object(input.detailsIdentityFingerprint),oldValues=fieldValues(input.detailsEnrichedFields);
  if(oldBase)for(const field of fields)if(Object.hasOwn(oldValues,field)&&same(row[field],oldValues[field]))row[field]=field==='mileage'?null:oldBase[field]??null;
 }
 const base=own?.base||identity(row),fingerprint=JSON.stringify(base);
 const cache=own||previous.get(fingerprint);
 for(const field of metadata)delete row[field];
 const sourceMileage=row.mileage,sourceHasMiles=knownNumber(sourceMileage)&&(!own||own.evidence.mileage==='Current verified source inventory odometer'&&own.times.mileage===input.observedAt);
 const state:State={row,base,fingerprint,values:{...(cache?.values||{})},evidence:{...(cache?.evidence||{})},times:{...(cache?.times||{})},checkedAt:cache?.checkedAt,conflicts:[],eligible:needsDetails(base)&&/^[A-HJ-NPR-Z0-9]{17}$/.test(base.vin)&&!!base.url&&fingerprint.length<=3500,sourceHasMiles};
 if(cache){try{state.conflicts=JSON.parse(cache.conflicts).filter((field:any)=>typeof field==='string'&&field.length<=40).slice(0,10);}catch{}}
 for(const field of fields)if(Object.hasOwn(state.values,field))row[field]=state.values[field];
 // A fresh known SRP odometer always supersedes an older detail observation,
 // including when both numbers are identical. Resumed snapshots keep theirs.
 if(!own&&knownNumber(sourceMileage)){
  row.mileage=sourceMileage;
  if((state.eligible||cache)&&validTime(input.observedAt,now)){state.values.mileage=sourceMileage;state.evidence.mileage='Current verified source inventory odometer';state.times.mileage=input.observedAt;}
  else{delete state.values.mileage;delete state.evidence.mileage;delete state.times.mileage;}
 }
 return state;
}
function accept(state:State,field:Field,value:any,evidence:string,stamp:string){if(typeof value==='string'&&(!value.trim()||value.length>500))return;state.row[field]=value;state.values[field]=value;state.evidence[field]=evidence.slice(0,350);state.times[field]=stamp;}
function serialize(state:State){
 const row=state.row;
 if(state.fingerprint.length>3500)return row;
 if(!state.eligible&&!state.checkedAt&&!Object.keys(state.values).length)return row;
 row.detailsIdentityFingerprint=state.fingerprint;row.detailsEnrichedFields=JSON.stringify(state.values);row.detailsEvidence=JSON.stringify(state.evidence);row.detailsFieldObservedAt=JSON.stringify(state.times);row.detailsConflicts=JSON.stringify([...new Set(state.conflicts)].slice(0,10));row.detailsUrl=row.url;
 if(state.checkedAt)row.detailsCheckedAt=state.checkedAt;
 const times=Object.entries(state.times).filter(([field,value])=>typeof value==='string'&&state.evidence[field]!=='Current verified source inventory odometer').map(([,value])=>value as string);if(times.length)row.detailObservedAt=times.reduce((oldest,value)=>Date.parse(value)<Date.parse(oldest)?value:oldest);
 if(state.times.mileage)row.mileageObservedAt=state.times.mileage;if(state.times.certified)row.certifiedObservedAt=state.times.certified;
 return row;
}

/** Bounded metadata-only detail passes. The caller owns robots/origin/HTTP policy. */
export async function enrichPublicListings(listings:any[],previous:any[],limit:number,readDetail:(url:string)=>Promise<string>,now:number){
 if(!Number.isFinite(now))throw new Error('A valid enrichment time is required.');
 const old=new Map<string,Proof>();for(const item of Array.isArray(previous)?previous:[]){const proof=ownProof(item,now);if(!proof)continue;const fingerprint=JSON.stringify(proof.base),prior=old.get(fingerprint);if(!prior||Date.parse(proof.checkedAt||'1970-01-01')>Date.parse(prior.checkedAt||'1970-01-01'))old.set(fingerprint,proof);}
 const states=listings.map(listing=>prepare(listing,old,now)),budget=Number.isFinite(limit)?Math.max(0,Math.min(MAX_REQUESTS,Math.floor(limit))):0;
 const due=states.filter(state=>state.eligible&&!recent(state.checkedAt,now)).sort((a,b)=>(a.checkedAt?Date.parse(a.checkedAt):-Infinity)-(b.checkedAt?Date.parse(b.checkedAt):-Infinity));
 let detailsChecked=0,detailsFailed=0;
 for(const state of due.slice(0,budget)){
  const stamp=new Date(now).toISOString();state.checkedAt=stamp;detailsChecked++;
  let details:PublicMarketDetails|null;try{details=parsePublicMarketDetails(await readDetail(state.row.url),state.row.url,state.base.vin);}catch{details=null;}
  if(!details||!identityMatches(state.base,details)){detailsFailed++;continue;}
  state.conflicts=[...details.conflicts];
  const sourceDrive=drivetrainKey(state.base),detailDrive=drivetrainKey(details),driveConflict=!!(sourceDrive&&detailDrive&&sourceDrive!==detailDrive)||details.conflicts.includes('drivetrain');
  const sourceBody=bodyKey(state.base.bodyStyle),detailBody=bodyKey(details.bodyStyle),bodyConflict=!!(sourceBody&&detailBody&&sourceBody!==detailBody);
  const sourceLiters=liters(state.base.engine),detailLiters=liters(details.engine),engineConflict=!!(sourceLiters&&detailLiters&&sourceLiters!==detailLiters);
  if(driveConflict)state.conflicts.push('drivetrain');if(bodyConflict)state.conflicts.push('bodyStyle');if(engineConflict)state.conflicts.push('engine');
  if(known(details.drivetrain)&&details.evidence.drivetrain&&!driveConflict)accept(state,'drivetrain',details.drivetrain,details.evidence.drivetrain,stamp);
  if(known(details.bodyStyle)&&details.evidence.bodyStyle&&!bodyConflict)accept(state,'bodyStyle',details.bodyStyle,details.evidence.bodyStyle,stamp);
  if(known(details.engine)&&details.evidence.engine&&!engineConflict)accept(state,'engine',details.engine,details.evidence.engine,stamp);
  if(known(details.trim)&&details.evidence.trim&&!driveConflict&&!bodyConflict&&!engineConflict){
   if(trimCompatible(state.base,details.trim!,details)){
    const badge=String(state.base.trim||'').match(/\b(?:4MATIC|4MOTION)\b/i)?.[0];
    if(!badge||new RegExp('\\b'+badge+'\\b','i').test(details.trim!))accept(state,'trim',details.trim,details.evidence.trim,stamp);
   }else state.conflicts.push('trim');
  }
  if(knownNumber(details.mileage)&&details.evidence.mileage&&!details.conflicts.includes('mileage')&&!state.sourceHasMiles)accept(state,'mileage',details.mileage,details.evidence.mileage,stamp);
  if(details.certified===true&&details.evidence.certified&&!/^new$/i.test(String(state.base.condition))){if(state.base.certified===false)state.conflicts.push('certified');else accept(state,'certified',true,details.evidence.certified,stamp);}
 }
 return {listings:states.map(serialize),pendingDetails:states.filter(state=>state.eligible&&!recent(state.checkedAt,now)).length,detailsChecked,detailsFailed};
}
