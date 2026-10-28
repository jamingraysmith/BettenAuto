import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const pricingUrl=moduleUrl(fs.readFileSync(new URL('../lib/pricing.ts',import.meta.url),'utf8'));
const appraisalSource=fs.readFileSync(new URL('../lib/appraisal.ts',import.meta.url),'utf8').replace("from './pricing'",`from '${pricingUrl}'`);
const {appraisalMarket}=await import(moduleUrl(appraisalSource));

const now=Date.parse('2026-10-20T14:00:00Z');
const form={vin:'TRADE',year:'2022',make:'Honda',model:'Accord',trim:'EX',mileage:'40000',targetRetail:'31000'};
const comp=(overrides={})=>({vin:'COMP',year:2022,make:'Honda',model:'Accord',trim:'EX',condition:'Used',mileage:40000,price:30000,observedAt:'2026-10-20T13:00:00Z',dealer:'Regional Dealer',...overrides});

test('changing appraisal identity recomputes matching and does not reuse a saved market summary',()=>{
 const listing=comp();
 const original=appraisalMarket(form,[listing],now);
 assert.equal(original.stats.average,30000);
 const changed=appraisalMarket({...form,model:'Civic',marketAverage:30000,marketSampleCount:1},[listing],now);
 assert.equal(changed.stats.average,null);assert.equal(changed.stats.count,0);
 assert.equal(changed.excluded['Different make or model'],1);
});

test('year, mileage, freshness and exact trim filters change the actual sample',()=>{
 const listings=[comp({vin:'base'}),comp({vin:'year',year:2021}),comp({vin:'mileage',mileage:55000}),comp({vin:'trim',trim:'Sport'}),comp({vin:'age',observedAt:'2026-10-10T13:00:00Z'})];
 assert.equal(appraisalMarket({...form,marketYearDelta:1,marketExactTrim:false},listings,now).stats.count,5);
 assert.equal(appraisalMarket(form,listings,now).stats.count,3);
 const strict=appraisalMarket({...form,marketYearDelta:0,marketMileageDelta:10000,marketMaxAgeDays:7,marketExactTrim:true},listings,now);
 assert.deepEqual(strict.matched.map(c=>c.vin),['base']);
 assert.equal(strict.snapshot.marketYearDelta,0);assert.equal(strict.snapshot.marketExactTrim,true);
 assert.equal(strict.excluded['Outside model years'],1);assert.equal(strict.excluded['Mileage unknown or outside range'],1);
 assert.equal(strict.excluded['Different or unknown trim'],1);assert.equal(strict.excluded['Stale or undated listing'],1);
});

test('snapshot is reproducible and retains flat prices, criteria and at most 200 complete VINs',()=>{
 const listings=Array.from({length:205},(_,index)=>comp({vin:`1HGCM82633A${String(index).padStart(6,'0')}`,price:30000+index, dealer:index%2?'Dealer One':'Dealer Two'}));
 const result=appraisalMarket(form,listings,now);
 assert.deepEqual(result.snapshot,appraisalMarket(form,listings,now).snapshot);
 assert.equal(result.snapshot.marketAverage,30102);assert.equal(result.snapshot.marketMedian,30102);
 assert.equal(result.snapshot.marketSuggestedListPrice,30100);assert.equal(result.snapshot.marketSampleCount,205);
 assert.equal(result.snapshot.marketSourceCount,2);assert.equal(result.snapshot.marketComparedAt,'2026-10-20T14:00:00.000Z');
 assert.deepEqual(result.snapshot.marketVinList.split(','),listings.slice(0,200).map(c=>c.vin));
 assert.match(result.basis,/Collected US source sample/);assert.match(result.basis,/No distance radius/);
 assert.equal(Object.values(result.snapshot).every(value=>value===null||['string','number','boolean'].includes(typeof value)),true);
});

test('manual listings without valid VINs still contribute prices without invalidating snapshot provenance',()=>{
 const validVin='1HGCM82633A004352';
 const listings=[comp({vin:'manual-listing',price:28000}),comp({vin:'',url:'https://regional.example/manual',price:30000}),comp({vin:validVin.toLowerCase(),price:32000}),comp({vin:validVin,price:35000})];
 const result=appraisalMarket(form,listings,now);
 assert.equal(result.stats.count,3);assert.equal(result.stats.average,30000);
 assert.equal(result.snapshot.marketVinList,validVin);
 assert.equal(result.excluded['Duplicate listing'],1);
});

test('freshness is re-evaluated at the requested time even when a saved snapshot is present',()=>{
 const initial=appraisalMarket(form,[comp()],now);
 const later=appraisalMarket({...form,...initial.snapshot},[comp()],now+15*86400000);
 assert.equal(later.stats.count,0);assert.equal(later.snapshot.marketAverage,null);
 assert.equal(later.excluded['Stale or undated listing'],1);
 assert.equal(later.snapshot.marketComparedAt,'2026-11-04T14:00:00.000Z');
});

test('blank or missing identity values never turn into zero-mileage comparisons',()=>{
 const missing=appraisalMarket({...form,year:'',mileage:''},[comp({year:0,mileage:0})],now);
 assert.equal(missing.vehicle.year,undefined);assert.equal(missing.vehicle.mileage,null);assert.equal(missing.stats.count,0);
 const noMileage=appraisalMarket({...form,mileage:''},[comp({mileage:0})],now);
 assert.equal(noMileage.stats.count,0);assert.equal(noMileage.excluded['Mileage unknown or outside range'],1);
 assert.equal(noMileage.options.maxMileageDelta,25000);assert.equal(noMileage.options.maxYearDelta,0);assert.equal(noMileage.options.exactTrim,true);assert.equal(noMileage.options.marketScope,'all');
 assert.equal(noMileage.vehicle.condition,'Used');
});


test('new appraisal defaults keep the same year and equivalent trim while including all collected US sources',()=>{
 const jetta={...form,year:2026,make:'Volkswagen',model:'Jetta',trim:'1.5T SEL',mileage:2730};
 const listing=(changes={})=>comp({year:2026,make:'Volkswagen',model:'Jetta',trim:'SEL FWD',mileage:9500,...changes});
 const result=appraisalMarket(jetta,[listing({vin:'expanded',scope:'expanded'}),listing({vin:'regional'}),listing({vin:'se',trim:'SE'}),listing({vin:'older',year:2025})],now);
 assert.deepEqual(result.matched.map(c=>c.vin),['expanded','regional']);
 assert.equal(result.options.maxYearDelta,0);assert.equal(result.options.exactTrim,true);assert.equal(result.options.marketScope,'all');assert.equal(result.options.certifiedOnly,false);
 assert.equal(result.snapshot.marketScope,'all');assert.equal(result.snapshot.marketCertifiedOnly,false);
});

test('saved appraisal scope and certified criteria filter current listings and remain in the audit snapshot',()=>{
 const listings=[comp({vin:'regional-cpo',certified:true}),comp({vin:'expanded-cpo',certified:true,scope:'expanded'}),comp({vin:'expanded-no',certified:false,scope:'expanded'}),comp({vin:'expanded-unknown',scope:'expanded'})];
 const result=appraisalMarket({...form,marketScope:'expanded',marketCertifiedOnly:true},listings,now);
 assert.deepEqual(result.matched.map(c=>c.vin),['expanded-cpo']);
 assert.equal(result.snapshot.marketScope,'expanded');assert.equal(result.snapshot.marketCertifiedOnly,true);
 assert.match(result.basis,/Expanded US source sample/);assert.match(result.basis,/advertised certified only/);
 const replay=appraisalMarket({...form,...result.snapshot},listings,now);
 assert.deepEqual(replay.matched.map(c=>c.vin),['expanded-cpo']);
 const unavailable=appraisalMarket({...form,marketScope:'expanded'},[listings[0]],now);
 assert.equal(unavailable.stats.count,0);assert.equal(unavailable.snapshot.marketSuggestedListPrice,null);
});
