import test from 'node:test';import assert from 'node:assert/strict';
import {assembleMarketSnapshot} from '../ops/assemble-market-snapshot.mjs';
const old='2026-10-21T13:00:00.000Z',fresh='2026-10-22T13:00:00.000Z',newer='2026-10-22T13:10:00.000Z',now=Date.parse(newer)+1000;
const a={id:'a-used',url:'https://dealer-a.example/used',scope:'expanded'},b={id:'b-used',url:'https://dealer-b.example/used',scope:'expanded'},options={now,sources:[a,b]};
const row=(n,source=a,changes={})=>({vin:'YV4A22RK7L1'+String(n).padStart(6,'0'),year:2020,make:'Volvo',model:'XC60',trim:'T6 Momentum',condition:'Used',price:30000,mileage:12000,certified:true,scope:'expanded',publicSourceId:source.id,sourceUrl:source.url,url:new URL('/vehicle/'+n,source.url).href,dealer:source.id,observedAt:old,...changes});
const report=(source,count,changes={})=>({id:source.id,url:source.url,status:'verified',complete:true,expectedCount:count,uniqueCount:count,retailCount:count,wholesaleExcluded:0,pages:[{url:source.url,observedAt:fresh,count,expectedCount:count}],...changes});
const bundle=(source,rows,changes={})=>({comparables:rows,report:{sources:[report(source,rows.length,changes)]}});
test('retires only a completely verified source and preserves unselected rows and original dates',()=>{
 const base=[row(1),row(2),row(3,b)],replacement=row(4,a,{observedAt:fresh,feeComponent:314,preFeePrice:29686});
 const result=assembleMarketSnapshot(base,[bundle(a,[replacement])],[],options);assert.deepEqual(result.comparables.map(item=>item.vin),[row(3).vin,row(4).vin]);assert.equal(result.comparables[0].observedAt,old);assert.equal(result.report.retiredBaseRows,2);assert.equal(result.report.complete,true);assert.equal(result.report.completeNationalCoverage,false);assert.equal(result.comparables[1].feeComponent,314);
});
test('failed or count-mismatched sources preserve the last complete data and cannot add partial listings',()=>{
 const base=[row(1)],partial=row(2,a,{observedAt:fresh});
 for(const changes of [{complete:false},{expectedCount:2,uniqueCount:2,retailCount:2}]){const result=assembleMarketSnapshot(base,[bundle(a,[partial],changes)],[],options);assert.equal(result.comparables.length,1);assert.equal(result.comparables[0].vin,row(1).vin);assert.equal(result.comparables[0].observedAt,old);assert.equal(result.report.preservedFailedSources,1);}
});
test('newer saved observations win while expanded observations retain their actual time and fee history',()=>{
 const current=row(1,a,{observedAt:newer,price:28000}),earlier=row(1,a,{observedAt:fresh,price:29000,feeComponent:314}),expanded=row(1,a,{observedAt:old,price:30000,feeComponent:350});
 const result=assembleMarketSnapshot([current],[bundle(a,[earlier])],[expanded],options),selected=result.comparables[0];assert.equal(result.comparables.length,1);assert.equal(selected.price,28000);assert.equal(selected.observedAt,newer);assert.ok(selected.sourceListings.some(item=>item.price===29000&&item.observedAt===fresh&&item.feeComponent===314));assert.ok(selected.sourceListings.some(item=>item.price===30000&&item.observedAt===old&&item.feeComponent===350));
});
test('wholesale records are excluded even when present in the saved base and legacy source proof',()=>{
 const legacyUrl='https://www.crownvolkswagen.com/used-inventory/index.htm',retail=row(1,a,{publicSourceId:undefined,sourceUrl:legacyUrl,observedAt:fresh}),whole=row(2,a,{condition:'Wholesale',wholesaleSource:true,publicSourceId:undefined,sourceUrl:legacyUrl,observedAt:fresh});
 const sourceReport=[{source:'crown',complete:true,total:2,uniqueVINs:2,wholesale:1,pages:[{url:legacyUrl,observedAt:fresh,count:2,expectedCount:2}]}];
 const result=assembleMarketSnapshot([whole],[{comparables:[retail,whole],report:sourceReport}],[],options);assert.equal(result.report.verifiedReplacementSources,1);assert.equal(result.comparables.length,1);assert.equal(result.comparables[0].vin,retail.vin);assert.equal(result.report.wholesaleExcluded,1);
});
test('deduplicated cross-source bundles prove each complete source through sourceListings membership',()=>{
 const first=row(1,a,{observedAt:fresh}),second=row(1,b,{observedAt:fresh}),combined={...second,sourceListings:[first,second].map(({year,make,model,trim,mileage,certified,...item})=>item)};
 const result=assembleMarketSnapshot([],[{comparables:[combined],report:{sources:[report(a,1),report(b,1)]}}],[],options);assert.equal(result.report.verifiedReplacementSources,2);assert.equal(result.comparables.length,1);assert.ok(result.comparables[0].sourceListings.some(item=>item.publicSourceId===a.id));assert.ok(result.comparables[0].sourceListings.some(item=>item.publicSourceId===b.id));
});
test('a surviving alternate dealer observation is kept after its selected primary source retires the VIN',()=>{
 const primary=row(1,a),alternate=row(1,b,{price:27000}),base={...primary,sourceListings:[alternate]},result=assembleMarketSnapshot([base],[bundle(a,[])],[],options);
 assert.equal(result.comparables.length,1);assert.equal(result.comparables[0].publicSourceId,b.id);assert.equal(result.comparables[0].price,27000);assert.equal(result.comparables[0].observedAt,old);assert.equal(result.comparables[0].mileage,null);assert.equal(result.comparables[0].trim,'');assert.equal(result.report.retainedAlternateObservations,1);
});
