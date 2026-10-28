import type {Vehicle} from './types';
import {matchComparables,samplePricing,type Comparable,type MatchOptions} from './pricing';

const numeric=(value:any):number|null=>value!==''&&value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value):null;
const filterNumber=(value:any,fallback:number)=>{const parsed=numeric(value);return parsed!==null&&parsed>=0?parsed:fallback;};

/** Recompute from the current identity and source listings; saved summaries are audit snapshots only. */
export function appraisalMarket(form:any,comps:Comparable[],now=Date.now()){
 const vehicle:Vehicle={
  vin:String(form.vin||'').trim(),year:numeric(form.year)??undefined,
  make:String(form.make||'').trim(),model:String(form.model||'').trim(),trim:String(form.trim||'').trim(),
  condition:String(form.condition||'Used'),mileage:numeric(form.mileage),price:numeric(form.targetRetail),
  bodyStyle:String(form.bodyStyle||'').trim(),drivetrain:String(form.drivetrain||'').trim()
 };
 const options:MatchOptions={
  maxYearDelta:filterNumber(form.marketYearDelta,0),maxMileageDelta:filterNumber(form.marketMileageDelta,25000),
  maxAgeDays:filterNumber(form.marketMaxAgeDays,14),exactTrim:form.marketExactTrim!==false&&form.marketExactTrim!=='false',marketScope:['regional','expanded','all'].includes(form.marketScope)?form.marketScope:'all',certifiedOnly:form.marketCertifiedOnly===true,now
 };
 const {matched,excluded}=matchComparables(vehicle,comps,options);
 const stats=samplePricing(vehicle,matched);
 const used=/used|pre.?owned|certified/i.test(vehicle.condition||'');
 const basis=`${options.marketScope==='expanded'?'Expanded US':options.marketScope==='regional'?'Regional':'Collected US'} source sample of advertised asking prices; same make, model/variant and ${used?'used':vehicle.condition?.toLowerCase()||'specified'} condition; within ±${options.maxYearDelta} model year(s) and ±${options.maxMileageDelta!.toLocaleString('en-US')} miles; observed within ${options.maxAgeDays} days; ${options.exactTrim?'equivalent trim':'any trim'}; ${options.certifiedOnly?'advertised certified only':'all certification statuses'}. No distance radius or condition/equipment adjustments. These are asking prices, not sold values.`;
 const snapshot={
  marketAverage:stats.average,marketMedian:stats.median,marketMin:stats.min,marketMax:stats.max??null,
  marketSuggestedListPrice:stats.recommendedListPrice,marketSampleCount:stats.count,marketSourceCount:stats.sourceCount,
  marketComparedAt:new Date(now).toISOString(),marketBasis:basis,
  marketVinList:[...new Set(matched.map(c=>String(c.vin||'').trim().toUpperCase()).filter(vin=>/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)))].slice(0,200).join(','),
  marketYearDelta:options.maxYearDelta!,marketMileageDelta:options.maxMileageDelta!,
  marketMaxAgeDays:options.maxAgeDays!,marketExactTrim:options.exactTrim!,marketScope:options.marketScope!,marketCertifiedOnly:!!options.certifiedOnly
 };
 return {vehicle,options,matched,excluded,stats,basis,snapshot};
}
