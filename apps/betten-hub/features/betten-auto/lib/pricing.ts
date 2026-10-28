import type {Vehicle} from './types';
export type Comparable={vin?:string;year?:number;make?:string;model?:string;trim?:string;condition?:string;price?:number;mileage?:number;source?:string;dealer?:string;city?:string;url?:string;observedAt?:string;distanceMiles?:number|null;[key:string]:any};
export type MatchOptions={maxYearDelta?:number;maxMileageDelta?:number|null;exactTrim?:boolean;maxAgeDays?:number;radiusMiles?:number|null;originZip?:string;marketScope?:'regional'|'expanded'|'all';certifiedOnly?:boolean;now?:number};
const key=(v:any)=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const present=(v:any)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const condition=(v:any)=>/^(new)$/i.test(String(v))?'new':/used|pre.?owned|certified/i.test(String(v))?'used':null;
const listingUrl=(value:any)=>{
 const raw=String(value??'').trim();if(!raw)return '';
 try{
  const url=new URL(raw);url.hash='';url.pathname=url.pathname.replace(/\/+$/,'')||'/';
  for(const name of [...url.searchParams.keys()])if(/^(utm_.+|gclid|dclid|fbclid|msclkid|gbraid|wbraid|_ga|_gl)$/i.test(name))url.searchParams.delete(name);
  url.searchParams.sort();return url.toString();
 }catch{return raw.replace(/#.*$/,'').replace(/\/+$/,'');}
};
export function drivetrainKey(v:any){
 const classify=(value:any)=>{const drive=key(value);if(/4matic|4motion|xdrive|quattro|allwheeldrive|^awd$/.test(drive))return 'awd';if(/frontwheeldrive|^fwd$/.test(drive))return 'fwd';if(/rearwheeldrive|^rwd$/.test(drive))return 'rwd';if(/fourwheeldrive|^4wd$|^4x4$/.test(drive))return '4wd';return '';};
 const observed=classify(v.drivetrain);if(observed)return observed;
 const label=classify(String(v.trim||'').match(/\b(?:4MATIC\+?|4MOTION|xDrive|quattro|AWD|FWD|RWD|4WD|4x4)\b/i)?.[0]);if(label)return label;
 return '';
}
export type EngineObservation={liters:number;field:string;observedAt:string|null};
/** Only unit-bearing public fields and dated exact specification labels count. */
export function observedEngineEvidence(vehicle:any):EngineObservation[]{
 const observations:EngineObservation[]=[],date=(value:any)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
 const add=(value:any,field:string,at:string|null,allowUnitless=false)=>{const match=String(value??'').trim().match(allowUnitless?/^(\d{1,2}(?:\.\d{1,2})?)\s*(?:L|liters?|litres?)?$/i:/^(\d{1,2}(?:\.\d{1,2})?)\s*(?:L|liters?|litres?)$/i),liters=match?Number(match[1]):null;if(liters!==null&&liters>0&&liters<=20)observations.push({liters,field,observedAt:at});};
 for(const field of ['engine','trim'])for(const match of String(vehicle[field]||'').matchAll(/\b(\d{1,2}(?:\.\d{1,2})?)\s*(?:-?\s*(?:L\b|liters?\b|litres?\b)|T\b)/gi))add(match[1]+'L',field,date(vehicle.observedAt));
 add(vehicle.engineSize,'engineSize',date(vehicle.observedAt));
 const detailAt=date(vehicle.detailObservedAt);
 if(detailAt&&Array.isArray(vehicle.equipment))for(const group of vehicle.equipment.slice(0,32))if(Array.isArray(group?.items))for(const item of group.items.slice(0,256)){
  const label=String(item?.label||'').trim().toLowerCase();if(!['engine liters','engine displacement'].includes(label)||item.availability==='O')continue;
  add(item.detail,'equipment:'+label,detailAt,label==='engine liters');
 }
 return observations;
}
export function observedEngineLiters(vehicle:any):number|null{const values=[...new Set(observedEngineEvidence(vehicle).map(observation=>observation.liters))];return values.length===1?values[0]:null;}
/** Clear published contradictions remain exclusions even when trim filtering is off. */
export function engineConflict(a:any,b:any):string|null{
 const displacement=(vehicle:any)=>[...new Set(observedEngineEvidence(vehicle).map(observation=>observation.liters))];
 const first=displacement(a),second=displacement(b);
 if(first.length>1||second.length>1)return 'Conflicting observed engine displacement';
 if(first.length&&second.length&&first[0]!==second[0])return 'Different observed engine displacement';
 const fuel=(vehicle:any)=>{const value=[vehicle.fuelType,vehicle.engine,vehicle.trim].filter(Boolean).join(' '),diesel=/\bdiesel\b|\bTDI\b/i.test(value),gas=/\bgas(?:oline)?\b|\bpetrol\b|\bTFSI\b|\bTSI\b/i.test(value),electric=/\belectric(?:ity)?\b|\bBEV\b/i.test(value),hybrid=/hybrid|plug.?in|\bPHEV\b|\bHEV\b/i.test(value);if(diesel&&gas)return 'conflict';if(diesel)return 'diesel';if(gas)return 'gasoline';if(electric&&!hybrid)return 'electric';return '';};
 const fuelA=fuel(a),fuelB=fuel(b);if(fuelA==='conflict'||fuelB==='conflict')return 'Conflicting observed fuel';
 if(fuelA&&fuelB&&fuelA!==fuelB)return 'Different observed fuel';
 return null;
}
function drivetrainConflict(vehicle:any){const explicit=drivetrainKey({drivetrain:vehicle.drivetrain}),label=drivetrainKey({trim:vehicle.trim});return !!(explicit&&label&&explicit!==label);}
export function isObservationFresh(value:unknown,now:number,maxAgeDays:number){if(typeof value!=='string'||!value)return false;const at=Date.parse(value);return Number.isFinite(at)&&at<=now+300000&&now-at<=maxAgeDays*86400000;}
export function trimKey(v:any){
 let trim=key(String(v.trim||'').replace(/\bwith\b/gi,'w').replace(/\btechnology package\b/gi,'Technology'));
 // Jetta dealers use SEL, 1.5T SEL and SEL FWD for the same US trim.
 if(key(v.make)==='volkswagen'&&modelKey(v)==='jetta')trim=trim.replace(/^15t/,'').replace(/fwd$/,'');
 if(key(v.make)==='volvo'){
  // Redundant AWD wording and seating label spelling are equivalent only
  // with an observed drivetrain; retain powertrain, theme and seat count.
  trim=key(String(v.trim||'').replace(/\b(?:AWD|FWD|RWD|4WD)\b/gi,'').replace(/\btheme\b/gi,'').replace(/(\d)[ -]?(?:seater|passenger)/gi,'$1 seat'));
  if(modelKey(v).endsWith('phev'))trim=trim.replace(/^t8/,'');
  if(!trim)return '';
  const drive=drivetrainKey(v);if(drive)trim+='|'+drive;
 }
 if(key(v.make)==='jeep'&&key(v.model).startsWith('wrangler'))trim=key(String(v.trim||'').replace(/\b(?:Unlimited|JK|JL|4x4|4WD)\b/gi,''));
 if(key(v.make)==='bmw'&&trim){const badge=modelKey(v);trim=trim.replace(new RegExp('^'+badge),'').replace(/xdrive|awd|rwd|fwd/g,'');trim=(trim&&trim!=='base'?trim:'base')+'|'+(drivetrainKey(v)||'unknown');}
 if(key(v.make)==='mercedesbenz'){
  if(!trim)return '';
  const variant=modelKey(v).replace(/(?:convertible|coupe|wagon|suv|sedan)$/,'');
  if(!variant.startsWith('unknown:')){
   const withoutAmg=trim.replace(/^amg(?=(?:eqb|eqe|eqs|glc|gle|gla|glb|gls|cla|cle|cls|sl|c|e|s)\d)/,'');
   trim=withoutAmg.startsWith(variant)?withoutAmg.slice(variant.length):withoutAmg;
   const badge=variant.match(/\d{2,3}[a-z]?$/)?.[0];if(badge&&trim.startsWith(badge))trim=trim.slice(badge.length);
   if(/(?:convertible|coupe|wagon)$/.test(modelKey(v)))trim=trim.replace(/cabriolet|convertible|coupe|wagon|estate/g,'');
   if(/^(?:eqb|eqe|eqs|glc|gle|gla|glb|gls|cla|cle|cls|sl|c|e|s)\d{2,3}[a-z]?$/.test(variant)){
    // An explicitly advertised model badge is a known base configuration,
    // distinct from a missing trim. Keep separately observed drivetrain in
    // the key; unknown drive never becomes 4MATIC by model-year inference.
    trim=trim.replace(/4matic|4motion|awd|fwd|rwd|4wd/g,'').replace(/suv|sedan/g,'');
    trim=(trim&&trim!=='base'?trim:'base:'+variant)+'|'+(drivetrainKey(v)||'unknown');
   }
  }
 }
 return trim;
}
/** FCA 2018 VIN guide, p4: positions 5–7 distinguish JK/JL and 2/4-door bodies.
 * https://www.jlwranglerforums.com/forum/attachments/vindecode-pdf.47156/
 * Apply only to the guide's model year/WMI; never extrapolate this rule to other years.
 */
export function wranglerModelKey(v:any){
 const model=key(v.model),label=[v.model,v.trim].filter(Boolean).join(' '),vin=String(v.vin||'').trim().toUpperCase(),year=Number(v.year);
 let generation=/wranglerjk/.test(model)||/\bJK\b/i.test(label)?'jk':/wranglerjl/.test(model)||/\bJL\b/i.test(label)?'jl':'';
 let body=/unlimited/i.test(label)?4:/\b2[ -]?door\b/i.test([label,v.bodyStyle].join(' '))?2:/\b4[ -]?door\b/i.test([label,v.bodyStyle].join(' '))?4:0;
 const doors=Number(v.doors);if([2,4].includes(doors)){if(body&&body!==doors)return 'unknown:wrangler-body-conflict';body=doors;}
 if(year===2018&&/^1C4[A-HJ-NPR-Z0-9]{14}$/.test(vin)&&vin[9]==='J'&&/^J[WX][ABCDEFGHJKLM]$/.test(vin.slice(4,7))){
  const vinGeneration=vin[5]==='W'?'jk':'jl',vinBody=/[DEFKLM]/.test(vin[6])?4:2;
  if(generation&&generation!==vinGeneration||body&&body!==vinBody)return 'unknown:wrangler-identity-conflict';
  generation=vinGeneration;body=vinBody;
 }
 // The 2018 transition year always requires explicit generation or the scoped VIN evidence.
 if(!generation&&year>=2007&&year<=2017)generation='jk';
 if(!generation&&year>=2019&&year<=2026)generation='jl';
 return generation&&body?'wrangler'+generation+body+'door':'unknown:wrangler-generation-or-body';
}
export function modelKey(v:any){
 const make=key(v.make),model=key(v.model),trim=key(v.trim);
 if(make==='jeep'&&model.startsWith('wrangler'))return wranglerModelKey(v);
 if(make==='volvo'){const base=model.match(/^(xc60|xc90)(?:recharge)?(?:pluginhybrid)?$/)?.[1];if(base)return base+(/recharge|pluginhybrid/.test(model)||/^t8/.test(trim)?'phev':'');}
 if(make==='volkswagen'&&model==='gti')return 'golfgti';
 if(make==='bmw'&&/^[1-8]\d{2}[a-z]+(?:xdrive)?$/.test(model))return model.replace(/xdrive$/,'');
 if(make==='jeep'&&(model==='grandcherokee'||model==='grandcherokeel'))return model==='grandcherokeel'||/^L(?:\s|$)/i.test(String(v.trim||''))?'grandcherokeel':'grandcherokee';
 if(make==='mercedesbenz'){
  const mbModel=model.replace(/^amg/,'');
  const series=mbModel.match(/^(eqb|eqe|eqs|glc|gle|gla|glb|gls|cla|cle|cls|sl|c|e|s)(?:class)?(?:[0-9].*)?$/)?.[1];
  if(series){
   // Keep the numeric badge separate from a following 4MATIC drivetrain.
   const badge=(value:string)=>value.replace(/4matic/g,'').match(new RegExp(series+'(?:class)?(\\d{2,3}[a-z]?)'));
   const full=badge(mbModel)||badge(series+trim);
   if(!full)return 'unknown:'+series;
   const body=key(v.bodyStyle),identity=mbModel+trim+body;
   const suffix=/cabriolet|convertible/.test(identity)?'convertible':/coupe/.test(identity)?'coupe':/wagon|estate/.test(identity)?'wagon':series.startsWith('eq')&&/suv|sportutility/.test(identity)?'suv':series.startsWith('eq')&&/sedan/.test(body)?'sedan':'';
   return series+full[1]+suffix;
  }
 }
 if(make==='bmw'&&/^[1-8]series$/.test(model)){const engine=trim.match(/^[1-8][0-9]{2}[a-z]+/);if(engine)return engine[0].replace(/xdrive$/,'');}
 return model;
}
export function equivalentTrim(a:any,b:any){
 if(engineConflict(a,b))return false;
 if(trimKey(a)&&trimKey(a)===trimKey(b))return true;
 if(key(a.make)!=='volkswagen'||key(b.make)!=='volkswagen')return false;
 const observed=(v:any)=>{
  const trim=String(v.trim||''),evidence=[v.engine,trim,v.fuelType].filter(Boolean).join(' '),liters=observedEngineLiters(v);
  if(!liters||!/(?:turbo|\bTSI\b|\bTFSI\b|\b\d\.\dT\b)/i.test(evidence)||/diesel|\bTDI\b|hybrid|electric/i.test(evidence))return null;
  const drive=drivetrainKey(v);if(!drive)return null;
  const base=key(trim.replace(/^\s*\d\.\d\s*[TL]\s+/i,'').replace(/\b(?:4MOTION|AWD|FWD|RWD|4WD)\b/gi,'').replace(/\bwith\b/gi,'w').replace(/\btechnology package\b/gi,'Technology'));
  return base?{liters,drive,base}:null;
 };
 const first=observed(a),second=observed(b);return !!(first&&second&&first.liters===second.liters&&first.drive===second.drive&&first.base===second.base);
}
export function matchComparables(vehicle:Vehicle,list:Comparable[],opts:MatchOptions={}){
 const options={maxYearDelta:0,maxMileageDelta:25000,exactTrim:true,maxAgeDays:14,now:Date.now(),...opts};
 const excluded:Record<string,number>={};const seen=new Set<string>();const matched:Comparable[]=[];
 const vehicleVin=key(vehicle.vin),vehicleMake=key(vehicle.make),vehicleModelLabel=key(vehicle.model),vehicleModel=modelKey(vehicle),vehicleCondition=condition(vehicle.condition),vehicleDrive=drivetrainKey(vehicle),conflictingVehicleDrive=drivetrainConflict(vehicle);
 for(const c of list){let reason='',comparableModel='';const vin=key(c.vin);let identities:string[]=[];
  if(!present(c.price)||Number(c.price)<=0)reason='No asking price';
  else if(c.vin&&vin===vehicleVin)reason='Same vehicle';
  else if(vehicleModel.startsWith('unknown:')||(comparableModel=modelKey(c)).startsWith('unknown:'))reason='Vehicle variant unknown';
  else if(!vehicleMake||!vehicleModelLabel||key(c.make)!==vehicleMake||comparableModel!==vehicleModel)reason='Different make or model';
  else if(!present(c.year)||!present(vehicle.year)||Math.abs(Number(c.year)-Number(vehicle.year))>options.maxYearDelta)reason='Outside model years';
  else if(!condition(c.condition)||!vehicleCondition||condition(c.condition)!==vehicleCondition)reason='Condition unknown or different';
  else if(conflictingVehicleDrive||drivetrainConflict(c))reason='Conflicting observed drivetrain';
  else if(vehicleDrive&&drivetrainKey(c)&&vehicleDrive!==drivetrainKey(c))reason='Different observed drivetrain';
  else if(engineConflict(vehicle,c))reason=engineConflict(vehicle,c)!;
  else if(options.exactTrim&&!equivalentTrim(vehicle,c))reason='Different or unknown trim';
  else if(options.certifiedOnly&&c.certified!==true&&!/^certified$/i.test(String(c.condition)))reason='Not advertised certified';
  else if(options.certifiedOnly&&c.certifiedObservedAt!==undefined&&!isObservationFresh(c.certifiedObservedAt,options.now,options.maxAgeDays))reason='Stale or undated certification';
  else if(options.marketScope==='expanded'&&c.scope!=='expanded')reason='Outside expanded US sample';
  else if(options.marketScope==='regional'&&c.scope==='expanded')reason='Outside original regional sample';
  else if(options.maxMileageDelta!==null&&(!present(vehicle.mileage)||!present(c.mileage)||Math.abs(Number(c.mileage)-Number(vehicle.mileage))>options.maxMileageDelta))reason='Mileage unknown or outside range';
  else if(options.maxMileageDelta!==null&&c.mileageObservedAt!==undefined&&!isObservationFresh(c.mileageObservedAt,options.now,options.maxAgeDays))reason='Stale or undated mileage';
  else if(!isObservationFresh(c.observedAt,options.now,options.maxAgeDays)&&!(!c.observedAt&&c.provider==='autodev'&&c.observationBasis==='active_provider_response'&&c.providerObservedAt===null&&isObservationFresh(c.retrievedAt,options.now,options.maxAgeDays)))reason='Stale or undated listing';
  else if(options.radiusMiles!==undefined&&options.radiusMiles!==null&&(!present(c.distanceMiles)||Number(c.distanceMiles)>options.radiusMiles)&&!(!present(c.distanceMiles)&&c.provider==='autodev'&&options.originZip&&c.searchOriginZip===options.originZip&&present(c.searchRadiusMiles)&&Number(c.searchRadiusMiles)>0&&Number(c.searchRadiusMiles)<=options.radiusMiles))reason='Distance unknown or outside radius';
  else{
   // URL parsing is expensive and only relevant to otherwise eligible rows.
   // Do not canonicalize a national library's unrelated listings for each VIN.
   const url=listingUrl(c.url);identities=[vin?'vin:'+vin:'',url?'url:'+url:''].filter(Boolean);
   if(identities.some(identity=>seen.has(identity)))reason='Duplicate listing';
  }
  if(reason){if(reason==='Duplicate listing')for(const identity of identities)seen.add(identity);excluded[reason]=(excluded[reason]||0)+1;continue;}
  for(const identity of identities)seen.add(identity);matched.push(c);
 }
 matched.sort((a,b)=>Number(a.price)-Number(b.price));return {matched,excluded};
}
export function samplePricing(vehicle:Vehicle,comps:Comparable[]){
 const prices=comps.map(c=>Number(c.price)).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b);
 const average=prices.length?prices.reduce((sum,price)=>sum+price,0)/prices.length:null;
 const median=prices.length?(prices[Math.floor((prices.length-1)/2)]+prices[Math.ceil((prices.length-1)/2)])/2:null;
 const enoughData=prices.length>=3;
 const own=present(vehicle.price)&&Number(vehicle.price)>0?Number(vehicle.price):null;
 return {count:prices.length,average,median,recommendedListPrice:enoughData&&median!==null?Math.round(median/100)*100:null,min:prices.length?prices[0]:null,max:prices.length?prices.at(-1):null,sourceCount:new Set(comps.filter(c=>Number.isFinite(Number(c.price))&&Number(c.price)>0).map(c=>c.dealer||c.source||(typeof c.url==='string'?c.url.split('/')[2]:'')).filter(Boolean)).size,percentOfAverage:enoughData&&own&&average?own/average*100:null,percentOfMedian:enoughData&&own&&median?own/median*100:null,rank:enoughData&&own?1+prices.filter(n=>n<own).length:null,rankDenominator:prices.length+1,enoughData};
}
