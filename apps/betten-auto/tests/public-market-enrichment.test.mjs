import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
async function load(file,replacements=[]){let source=readFileSync(new URL('../'+file,import.meta.url),'utf8');for(const [pattern,replacement]of replacements)source=source.replace(pattern,replacement);const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
globalThis.__enrichmentDetails=await load('lib/public-market-details.ts');
globalThis.__enrichmentPricing=await load('lib/pricing.ts');
const {enrichPublicListings:enrich}=await load('lib/public-market-enrichment.ts',[[/import\s*\{[^}]+\}\s*from\s*['"]\.\/public-market-details['"];?/,'const {parsePublicMarketDetails}=globalThis.__enrichmentDetails;'],[/import\s*\{[^}]+\}\s*from\s*['"]\.\/pricing['"];?/,'const {drivetrainKey,equivalentTrim,modelKey}=globalThis.__enrichmentPricing;']]);
const now=Date.parse('2026-10-21T18:00:00Z'),day=86400000,vin='4JGFB6FB5VB728789',url='https://dealer.example/viewdetails/new/'+vin.toLowerCase()+'/2027-mercedes-benz-gle-suv';
const row=(changes={})=>({vin,url,year:2027,make:'Mercedes-Benz',model:'GLE',trim:'GLE 450',schemaTrim:'GLE 450',condition:'New',price:78405,pricingBasis:'Verified SRP final asking price',mileage:null,drivetrain:'',engine:'',bodyStyle:'',certified:null,observedAt:'2026-10-21T17:00:00.000Z',...changes});
const schema=(listing,changes={})=>({'@type':'Vehicle',vehicleIdentificationNumber:listing.vin,url:listing.url,vehicleModelDate:String(listing.year),brand:{name:listing.make},model:listing.model,vehicleConfiguration:listing.trim,name:(listing.condition==='New'?'New ':'Used ')+[listing.year,listing.make,listing.model,listing.trim].join(' '),itemCondition:'https://schema.org/'+(listing.condition==='New'?'NewCondition':'UsedCondition'),mileageFromOdometer:{value:0,unitCode:'SMI'},offers:{price:1},...changes});
const detail=(label,value)=>`<div><div class="details-key">${label}:</div><div class="details-value">${value}</div></div>`;
const page=(listing,{changes={},drive='AWD',body='SUV',engine='3.0L I6 Turbo',mileage=null,style='GLE 450 4MATIC'}={})=>`<script type="application/ld+json">${JSON.stringify(schema(listing,{...(mileage===null?{}:{mileageFromOdometer:{value:mileage,unitCode:'SMI'}}),...changes}))}</script><script>var vin='${listing.vin}';var make='${listing.make}';var model='${listing.model}';var year='${listing.year}';var styleDescription='${style}';</script><div class="oem-vehicle-details">${drive?detail('Drive Type',drive):''}${body?detail('Body Type',body):''}${engine?detail('Engine',engine):''}${mileage===null?'':detail('Mileage',mileage+' Miles')}</div>`;

test('metadata-only enrichment preserves source price, identity and source timestamps, and never invents default new mileage',async()=>{
 const input=row(),before=structuredClone(input),result=await enrich([input],[],12,async()=>page(input),now),actual=result.listings[0];
 assert.equal(result.detailsChecked,1);assert.equal(result.detailsFailed,0);assert.equal(result.pendingDetails,0);assert.equal(actual.drivetrain,'AWD');assert.equal(actual.trim,'GLE 450 4MATIC');assert.equal(actual.engine,'3.0L I6 Turbo');assert.equal(actual.mileage,null);
 for(const field of ['vin','url','year','make','model','condition','price','pricingBasis','observedAt'])assert.deepEqual(actual[field],input[field]);
 assert.equal(Object.hasOwn(actual,'offers'),false);assert.equal(actual.detailObservedAt,new Date(now).toISOString());assert.deepEqual(input,before);
});
test('missing new mileage alone does not trigger an external detail read',async()=>{
 const input=row({trim:'GLE 450 4MATIC',drivetrain:'AWD',engine:'3.0L I6',bodyStyle:'SUV'});const result=await enrich([input],[],12,async()=>{throw new Error('Do not call for mileage alone.');},now);assert.equal(result.detailsChecked,0);assert.equal(result.pendingDetails,0);assert.deepEqual(result.listings,[input]);
});
test('failure checks are bounded, unattempted/oldest first, and repeated passes terminate rather than retrying unavailable fields',async()=>{
 const inputs=Array.from({length:15},(_,index)=>{const suffix=String(index).padStart(6,'0'),v='4JGFB6FB5VB'+suffix;return row({vin:v,url:'https://dealer.example/viewdetails/new/'+v.toLowerCase()+'/car'});});let calls=0;
 const first=await enrich(inputs,[],100,async()=>{calls++;throw new Error('SOURCE_SECRET_HTML');},now);assert.equal(calls,12);assert.equal(first.detailsChecked,12);assert.equal(first.detailsFailed,12);assert.equal(first.pendingDetails,3);assert.equal(JSON.stringify(first).includes('SOURCE_SECRET_HTML'),false);
 const order=[];const second=await enrich(first.listings,first.listings,12,async value=>{order.push(value);return '';},now+1000);assert.deepEqual(order,inputs.slice(12).map(r=>r.url));assert.equal(second.pendingDetails,0);assert.equal(second.detailsFailed,3);
 const third=await enrich(second.listings,second.listings,12,async()=>{throw new Error('No repeated fetch within 24h.');},now+2000);assert.equal(third.detailsChecked,0);assert.equal(third.pendingDetails,0);
 const nextDay=await enrich(second.listings,second.listings,1,async()=>'',now+day);assert.equal(nextDay.detailsChecked,1);assert.equal(nextDay.pendingDetails,11);
});
test('same VIN/URL/raw identity can reuse proven details with original field times while current source mileage wins',async()=>{
 const input=row(),first=await enrich([input],[],1,async()=>page(input,{mileage:120}),now),next=row({price:77000,mileage:121,observedAt:'2026-10-21T19:00:00.000Z'});
 const reused=await enrich([next],first.listings,12,async()=>{throw new Error('Cached within24h.');},now+7200000),actual=reused.listings[0];assert.equal(reused.detailsChecked,0);assert.equal(actual.trim,'GLE 450 4MATIC');assert.equal(actual.drivetrain,'AWD');assert.equal(actual.price,77000);assert.equal(actual.mileage,121);assert.equal(actual.mileageObservedAt,next.observedAt);assert.equal(actual.detailObservedAt,new Date(now).toISOString());assert.equal(actual.detailsCheckedAt,new Date(now).toISOString());
});
test('a source odometer still wins when a previously unattempted row is selected on a resumed pass',async()=>{
 const input=row({mileage:155,observedAt:'2026-10-21T17:00:00.000Z'}),waiting=await enrich([input],[],0,async()=>'',now);assert.equal(waiting.pendingDetails,1);assert.equal(waiting.listings[0].detailObservedAt,undefined);
 const actual=(await enrich(waiting.listings,waiting.listings,1,async()=>page(input,{mileage:160}),now+1000)).listings[0];assert.equal(actual.mileage,155);assert.equal(actual.mileageObservedAt,input.observedAt);
});
test('changed URL or raw trim cannot inherit an earlier identity proof or its same-day retry suppression',async()=>{
 const input=row(),old=await enrich([input],[],1,async()=>page(input),now);
 for(const changed of [row({url:url+'?different=1'}),row({trim:'GLE 580'})]){let count=0;const result=await enrich([changed],old.listings,1,async()=>{count++;return '';},now+1000);assert.equal(count,1);assert.equal(result.listings[0].drivetrain,'');assert.equal(result.listings[0].trim,changed.trim);assert.equal(result.listings[0].detailObservedAt,undefined);}
});
test('mismatched primary VIN, primary URL or year fails closed with a checked timestamp and no spec merge',async()=>{
 const input=row();for(const html of [page(input,{changes:{vehicleIdentificationNumber:'4JGFB6FB4VB750704'}}),page(input,{changes:{url:'https://dealer.example/other'}}),page(input,{changes:{vehicleModelDate:'2026'}})]){const result=await enrich([input],[],1,async()=>html,now);assert.equal(result.detailsFailed,1);assert.equal(result.pendingDetails,0);assert.equal(result.listings[0].drivetrain,'');assert.equal(result.listings[0].detailsCheckedAt,new Date(now).toISOString());}
});
test('known source engine, drivetrain, body and certification contradictions are retained as conflicts rather than overwritten',async()=>{
 const input=row({condition:'Used',trim:'',schemaTrim:'',certified:false,drivetrain:'RWD',bodyStyle:'Sedan',engine:'4.0L V8',url:url.replace('/new/','/cpo/')});const result=await enrich([input],[],1,async()=>page(input,{drive:'AWD',body:'SUV',engine:'3.0L I6'}),now),actual=result.listings[0];assert.equal(actual.drivetrain,'RWD');assert.equal(actual.bodyStyle,'Sedan');assert.equal(actual.engine,'4.0L V8');assert.equal(actual.certified,false);assert.equal(actual.trim,input.trim);assert.deepEqual(new Set(JSON.parse(actual.detailsConflicts)),new Set(['drivetrain','bodyStyle','engine','certified']));
});
test('same VIN advertised CPO is preserved with its original certification observation when a later read fails',async()=>{
 const input=row({condition:'Used',url:url.replace('/new/','/cpo/')}),first=await enrich([input],[],1,async()=>page(input,{mileage:12500}),now),later=await enrich([row({...input,observedAt:'2026-10-22T19:00:00.000Z'})],first.listings,1,async()=>{throw new Error('Unavailable');},now+day+7200000),actual=later.listings[0];assert.equal(actual.certified,true);assert.equal(actual.certifiedObservedAt,new Date(now).toISOString());assert.equal(actual.mileageObservedAt,new Date(now).toISOString());assert.equal(actual.detailObservedAt,new Date(now).toISOString());assert.equal(actual.detailsCheckedAt,new Date(now+day+7200000).toISOString());assert.equal(later.detailsFailed,1);
});
test('a later partial detail page does not relabel unrepeated cached fields as newly observed',async()=>{
 const input=row(),first=await enrich([input],[],1,async()=>page(input),now);const second=await enrich([input],first.listings,1,async()=>page(input,{drive:'',body:'',engine:'3.0L I6 Turbo',style:'',changes:{vehicleConfiguration:undefined}}),now+day),actual=second.listings[0];assert.equal(actual.drivetrain,'AWD');assert.equal(actual.trim,'GLE 450 4MATIC');assert.equal(actual.detailObservedAt,new Date(now).toISOString());const times=JSON.parse(actual.detailsFieldObservedAt);assert.equal(times.drivetrain,new Date(now).toISOString());assert.equal(times.engine,new Date(now+day).toISOString());
});
test('only compatible full trim extensions are accepted; SE and SEL remain distinct',async()=>{
 const input=row({make:'Volkswagen',model:'Taos',trim:'SE',schemaTrim:'SE',condition:'Used'}),result=await enrich([input],[],1,async()=>page(input,{style:'SEL',changes:{vehicleConfiguration:'SEL'},engine:'1.5L Turbo'}),now);assert.equal(result.listings[0].trim,'SE');assert.ok(JSON.parse(result.listings[0].detailsConflicts).includes('trim'));
 const volvo=row({make:'Volvo',model:'XC60',trim:'Ultra',schemaTrim:'Ultra'}),full=await enrich([volvo],[],1,async()=>page(volvo,{style:'T8 AWD Ultra',engine:'2.0L Turbo'}),now);assert.equal(full.listings[0].trim,'T8 AWD Ultra');
});
test('caller arrays are not mutated, future proof dates cannot suppress checks, and a zero budget leaves due work visible',async()=>{
 const input=row(),first=await enrich([input],[],1,async()=>page(input),now),tampered=structuredClone(first.listings[0]);tampered.detailsCheckedAt='2099-01-01T00:00:00.000Z';const prior=structuredClone(tampered);const result=await enrich([input],[tampered],0,async()=>{throw new Error('Budget0');},now);assert.equal(result.detailsChecked,0);assert.equal(result.pendingDetails,1);assert.deepEqual(tampered,prior);
});
test('editing an already-enriched identity strips its old derived specs and mileage rather than treating them as new SRP facts',async()=>{
 const input=row(),first=await enrich([input],[],1,async()=>page(input,{mileage:12500}),now),changed={...first.listings[0],trim:'GLE 580'};
 const result=await enrich([changed],first.listings,1,async()=>'',now+1000),actual=result.listings[0];assert.equal(actual.trim,'GLE 580');assert.equal(actual.drivetrain,'');assert.equal(actual.engine,'');assert.equal(actual.mileage,null);assert.equal(actual.mileageObservedAt,undefined);assert.equal(actual.detailObservedAt,undefined);assert.equal(result.detailsChecked,1);
});
