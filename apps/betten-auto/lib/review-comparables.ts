import type {Vehicle} from './types';
import {matchComparables,modelKey,trimKey,drivetrainKey,engineConflict,isObservationFresh,type Comparable,type MatchOptions} from './pricing';

export type ReviewReason='Trim differs'|'Trim incomplete'|'Mileage unknown'|'Certification unconfirmed'|'Not advertised certified'|'Mileage needs recheck'|'Certification needs recheck';
export type ReviewComparable={listing:Comparable;reasons:ReviewReason[]};
const key=(value:unknown)=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const present=(value:unknown)=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const conflictingDrive=(value:any)=>{const field=drivetrainKey({drivetrain:value.drivetrain}),label=drivetrainKey({trim:value.trim});return !!(field&&label&&field!==label);};
const condition=(value:unknown)=>/^new$/i.test(String(value))?'new':/used|pre.?owned|certified/i.test(String(value))?'used':null;
const listingUrl=(value:unknown)=>{
 const raw=String(value??'').trim();if(!raw)return '';
 try{
  const url=new URL(raw);url.hash='';url.pathname=url.pathname.replace(/\/+$/,'')||'/';
  for(const name of [...url.searchParams.keys()])if(/^(utm_.+|gclid|dclid|fbclid|msclkid|gbraid|wbraid|_ga|_gl)$/i.test(name))url.searchParams.delete(name);
  url.searchParams.sort();return url.toString();
 }catch{return raw.replace(/#.*$/,'').replace(/\/+$/,'');}
};
const identities=(listing:Comparable|Vehicle)=>[key(listing.vin)?'vin:'+key(listing.vin):'',listingUrl(listing.url)?'url:'+listingUrl(listing.url):''].filter(Boolean);

/** Read-only leads for human review. These never enter pricing calculations or change filters. */
export function reviewComparables(vehicle:Vehicle,list:Comparable[],opts:MatchOptions={}):ReviewComparable[]{
 const options={maxYearDelta:0,maxMileageDelta:25000,exactTrim:true,maxAgeDays:14,now:Date.now(),...opts};
 const strict=new Set(matchComparables(vehicle,list,options).matched);
 // Join VIN and URL aliases before selecting rows, including aliases of strict matches and the subject.
 const parents=new Map<string,string>();
 const root=(identity:string):string=>{const parent=parents.get(identity);if(!parent){parents.set(identity,identity);return identity;}if(parent===identity)return identity;const result=root(parent);parents.set(identity,result);return result;};
 for(const listing of [vehicle,...list]){const ids=identities(listing);for(const id of ids.slice(1))parents.set(root(id),root(ids[0]));}
 const blocked=new Set<string>();
 for(const listing of [vehicle,...strict])for(const id of identities(listing))blocked.add(root(id));
 const seen=new Set<string>(),seenRows=new Set<Comparable>();
 const candidates:ReviewComparable[]=[];
 const vehicleModel=modelKey(vehicle),vehicleCondition=condition(vehicle.condition);
 for(const listing of list){
  const ids=identities(listing).map(root);
  if(strict.has(listing)||seenRows.has(listing)||ids.some(id=>blocked.has(id)||seen.has(id)))continue;
  if(!present(listing.price)||Number(listing.price)<=0)continue;
  if(listing.vin&&key(listing.vin)===key(vehicle.vin))continue;
  if(!key(vehicle.make)||!key(vehicle.model)||key(listing.make)!==key(vehicle.make)||vehicleModel.startsWith('unknown:')||modelKey(listing).startsWith('unknown:')||modelKey(listing)!==vehicleModel)continue;
  if(!present(listing.year)||!present(vehicle.year)||Math.abs(Number(listing.year)-Number(vehicle.year))>options.maxYearDelta)continue;
  if(!vehicleCondition||!condition(listing.condition)||condition(listing.condition)!==vehicleCondition)continue;
  if(conflictingDrive(vehicle)||conflictingDrive(listing)||engineConflict(vehicle,listing))continue;
  if(drivetrainKey(vehicle)&&drivetrainKey(listing)&&drivetrainKey(vehicle)!==drivetrainKey(listing))continue;
  if(options.marketScope==='expanded'&&listing.scope!=='expanded'||options.marketScope==='regional'&&listing.scope==='expanded')continue;
  if(options.maxMileageDelta!==null&&present(vehicle.mileage)&&present(listing.mileage)&&Math.abs(Number(listing.mileage)-Number(vehicle.mileage))>options.maxMileageDelta)continue;
  const observed=Date.parse(listing.observedAt||'');
  if(!Number.isFinite(observed)||observed>options.now+300000||options.now-observed>options.maxAgeDays*86400000)continue;
  if(options.radiusMiles!==undefined&&options.radiusMiles!==null&&(!present(listing.distanceMiles)||Number(listing.distanceMiles)>options.radiusMiles))continue;
  const reasons:ReviewReason[]=[];
  if(options.exactTrim&&(!trimKey(vehicle)||trimKey(listing)!==trimKey(vehicle)))reasons.push(!trimKey(vehicle)||!trimKey(listing)?'Trim incomplete':'Trim differs');
  if(options.maxMileageDelta!==null&&(!present(vehicle.mileage)||!present(listing.mileage)))reasons.push('Mileage unknown');
  else if(options.maxMileageDelta!==null&&listing.mileageObservedAt!==undefined&&!isObservationFresh(listing.mileageObservedAt,options.now,options.maxAgeDays))reasons.push('Mileage needs recheck');
  if(options.certifiedOnly&&listing.certified!==true&&!/^certified$/i.test(String(listing.condition)))reasons.push(listing.certified===false?'Not advertised certified':'Certification unconfirmed');
  else if(options.certifiedOnly&&listing.certifiedObservedAt!==undefined&&!isObservationFresh(listing.certifiedObservedAt,options.now,options.maxAgeDays))reasons.push('Certification needs recheck');
  if(!reasons.length)continue;
  for(const id of ids)seen.add(id);seenRows.add(listing);candidates.push({listing,reasons});
 }
 return candidates;
}
