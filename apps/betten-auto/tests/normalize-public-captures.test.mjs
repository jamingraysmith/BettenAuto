import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {normalizeCapturedSource,normalizeCaptureDirectory,captureSources} from '../ops/normalize-public-captures.mjs';

const source={id:'fixture-used',name:'Observed fixture group',url:'https://dealer.example/used-inventory/index.htm',kind:'dealercom',condition:'Used',scope:'expanded',pagination:'start',maxPages:20,refreshHours:24};
const stamp='2026-10-22T13:00:00.000Z',now=Date.parse(stamp)+60000;
const vin=index=>'YV4A22RK7L1'+String(index).padStart(6,'0');
const row=(index,changes={})=>({vin:vin(index),year:2020,make:'Volvo',model:'XC60',trim:'T6 Momentum',type:'used',link:'/used/vehicle-'+index+'.htm',accountId:'roof',certified:true,trackingAttributes:[{name:'odometer',value:'12000'},{name:'driveLine',value:'AWD'}],pricing:{dprice:[{isFinalPrice:true,typeClass:'priceAfterFees',value:'$30,314',label:'Sale Price'},{typeClass:'totalFees',value:'$314'},{typeClass:'internetPrice',value:'$30,000'}]},...changes});
const wis=(rows,total,start=0,size=1,roof='Actual Texas Dealer',state='TX')=>({pageInfo:{totalCount:total,pageStart:start,pageSize:size},inventory:rows,accounts:{roof:{name:roof,address:{city:state==='TX'?'San Antonio':'Los Angeles',state}}}});
const captured=(WIS,url=source.url,nextHref=null,at=stamp)=>({url,observedAt:at,WIS,nextHref});
const next=source.url+'?start=1';
const pair=()=>[captured(wis([row(1)],2),source.url,'?start=1'),captured(wis([row(2)],2,1,1,'Actual California Dealer','CA'),next)];

test('normalizes complete observed pages using their own rooftop and original price/fee/time evidence',()=>{
 const result=normalizeCapturedSource(source,pair(),{now});assert.equal(result.listings.length,2);assert.equal(result.report.uniqueCount,2);assert.equal(result.report.complete,true);
 assert.equal(result.listings[0].dealer,'Actual Texas Dealer');assert.equal(result.listings[0].state,'TX');assert.equal(result.listings[1].dealer,'Actual California Dealer');assert.equal(result.listings[1].state,'CA');
 for(const listing of result.listings){assert.equal(listing.price,30314);assert.equal(listing.preFeePrice,30000);assert.equal(listing.feeComponent,314);assert.equal(listing.observedAt,stamp);assert.equal(listing.publicSourceId,source.id);assert.equal(listing.scope,'expanded');}
});
test('rejects a missing page, a changed total and a repeated VIN rather than returning part of a source',()=>{
 assert.throws(()=>normalizeCapturedSource(source,pair().slice(0,1),{now}),error=>error.code==='missing_page');
 const changed=pair();changed[1].WIS.pageInfo.totalCount=3;assert.throws(()=>normalizeCapturedSource(source,changed,{now}),error=>error.code==='changing_total');
 const repeated=pair();repeated[1].WIS.inventory=[row(1)];assert.throws(()=>normalizeCapturedSource(source,repeated,{now}),error=>error.code==='duplicate_vin');
 const short=[captured(wis([row(1)],2,0,2))];assert.throws(()=>normalizeCapturedSource(source,short,{now}),error=>error.code==='noncontiguous_pages');
});
test('page order follows observed links, requires the reviewed root and contiguous DDC cursors',()=>{
 assert.equal(normalizeCapturedSource(source,pair().reverse(),{now}).listings.length,2);
 const wrong=pair();wrong[0].url=source.url+'?make=Volvo';assert.throws(()=>normalizeCapturedSource(source,wrong,{now}),error=>error.code==='missing_first_page');
 const jumped=pair();jumped[1].WIS.pageInfo.pageStart=2;assert.throws(()=>normalizeCapturedSource(source,jumped,{now}),error=>error.code==='noncontiguous_pages');
 const hostile=pair();hostile[0].nextHref='https://other.example/used-inventory/index.htm?start=1';assert.throws(()=>normalizeCapturedSource(source,hostile,{now}),error=>error.code==='unsafe_pagination');
});
test('fee-only call-for-price listings remain unknown and New condition survives normalization',()=>{
 const feeOnly=row(1,{trackingPricing:{askingPrice:999999},pricing:{dprice:[{isFinalPrice:true,typeClass:'totalFees',value:'$314'},{typeClass:'priceAfterFees',value:'PLEASE_CALL'}]}});
 const result=normalizeCapturedSource(source,[captured(wis([feeOnly],1))],{now});assert.equal(result.listings[0].price,null);assert.equal(result.listings[0].feeComponent,314);assert.equal(result.report.pricedCount,0);
 const newSource={...source,id:'fixture-new',condition:'New'},newResult=normalizeCapturedSource(newSource,[captured(wis([row(1,{type:'new'})],1))],{now});assert.equal(newResult.listings[0].condition,'New');
 assert.throws(()=>normalizeCapturedSource(newSource,[captured(wis([row(1)],1))],{now}),error=>error.code==='condition_mismatch');
});
test('wholesale rows count toward completeness while remaining outside retail comparisons',()=>{
 const WIS=wis([row(1)],1,0,1,'Explicit Wholesale Dealer'),result=normalizeCapturedSource(source,[captured(WIS)],{now});assert.equal(result.report.expectedCount,1);assert.equal(result.report.uniqueCount,1);assert.equal(result.report.wholesaleExcluded,1);assert.equal(result.listings.length,0);
});
test('preserves observation dates and rejects future, mixed-day or out-of-order captures',()=>{
 const future=pair();future[1].observedAt='2026-10-22T14:00:00.000Z';assert.throws(()=>normalizeCapturedSource(source,future,{now}),error=>error.code==='invalid_observation');
 const mixed=pair();mixed[0].observedAt='2026-10-21T13:00:00.000Z';assert.throws(()=>normalizeCapturedSource(source,mixed,{now}),error=>error.code==='mixed_observation_days');
 const backwards=pair();backwards[0].observedAt='2026-10-22T13:00:30.000Z';assert.throws(()=>normalizeCapturedSource(source,backwards,{now}),error=>error.code==='observation_order');
});
test('supports bounded literal JSON-LD HTML parts and rejects clipped source bodies',()=>{
 const jsonSource={...source,kind:'jsonld',url:'https://dealer.example/inventory/used'},vehicle={'@type':'Car',sku:vin(1),vehicleModelDate:2020,brand:{name:'Volvo'},model:'XC60',vehicleConfiguration:'T6 Momentum',name:'2020 Volvo XC60 T6 Momentum',itemCondition:'https://schema.org/UsedCondition',url:'https://dealer.example/vehicle/one',mileageFromOdometer:{value:12000,unitCode:'SMI'},offers:{price:30000,priceCurrency:'USD'}};
 const html='<script type="application/ld+json">'+JSON.stringify({'@type':'ItemList',numberOfItems:1,itemListElement:[vehicle]})+'</script>';
 const split=html.indexOf('XC60')+2;
 const result=normalizeCapturedSource(jsonSource,[{url:jsonSource.url,observedAt:stamp,htmlParts:[html.slice(0,split),html.slice(split),'<div data-itemid="x'+vin(1)+'"><h2>2020 Volvo XC60 T6 Momentum AWD</h2></div>']}],{now});assert.equal(result.listings[0].model,'XC60');assert.equal(result.listings[0].trim,'T6 Momentum AWD');assert.equal(result.listings[0].drivetrain,'AWD');assert.equal(JSON.stringify(result).includes('<script'),false);
 assert.throws(()=>normalizeCapturedSource(jsonSource,[{url:jsonSource.url,observedAt:stamp,html:html+'[Truncated]'}],{now}),error=>error.code==='clipped_capture');
});
test('directory failures exclude their whole source, leave prior files untouched and retain cross-source provenance',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'betten-capture-normalizer-'));try{
  const good={...source,id:'fixture-good'},overlap={...source,id:'fixture-overlap'},bad={...source,id:'fixture-bad'},prior=path.join(directory,'prior-comparables.json');await fs.writeFile(prior,'DO NOT CHANGE');
  for(const item of [good,overlap,bad])await fs.mkdir(path.join(directory,item.id));
  await fs.writeFile(path.join(directory,good.id,'page-000.json'),JSON.stringify(captured(wis([row(1)],1))));
  await fs.writeFile(path.join(directory,overlap.id,'page-000.json'),JSON.stringify(captured(wis([row(1)],1))));
  await fs.writeFile(path.join(directory,bad.id,'page-000.json'),JSON.stringify(captured(wis([row(2)],2),source.url,'?start=1')));
  const result=await normalizeCaptureDirectory(directory,{now,sources:[good,overlap,bad]});assert.equal(result.report.complete,false);assert.equal(result.report.verifiedSourceCount,2);assert.equal(result.report.failedSourceCount,1);assert.equal(result.comparables.length,1);assert.equal(result.comparables[0].sourceListings.length,2);assert.equal(result.comparables.some(listing=>listing.vin===vin(2)),false);assert.equal(await fs.readFile(prior,'utf8'),'DO NOT CHANGE');
  assert.equal(result.report.sources.find(item=>item.id===bad.id).requiresPreviousSnapshot,true);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('the runtime registry loads without evaluating captured JavaScript and has distinct source IDs',()=>{
 assert.ok(captureSources.length>=80);assert.equal(new Set(captureSources.map(item=>item.id)).size,captureSources.length);
 const bad={url:source.url,observedAt:stamp,html:"<script>\nDDC.WS.state['ws-inv-data']['x'] = {\"WIS\":(globalThis.__captureExecuted=true)};\n</script>"};assert.throws(()=>normalizeCapturedSource(source,[bad],{now}));assert.equal(globalThis.__captureExecuted,undefined);
});
