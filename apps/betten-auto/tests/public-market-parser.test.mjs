import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/public-market-parser.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parsePublicInventory,robotsAllows,collectPublicSource}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const source={id:'sample-used',name:'Sample public inventory',dealer:'Public dealer group',url:'https://dealer.example/cars/used/volvo/',kind:'jsonld',condition:'Used',scope:'expanded',maxPages:3,refreshHours:6,pagination:'pg'},stamp='2026-10-20T20:00:00.000Z';
const row=(changes={})=>({'@type':['Product','Car'],sku:'YV4A22RK7L1557904',name:'2020 Volvo XC60',brand:{name:'Volvo'},vehicleModelDate:'2020',vehicleConfiguration:'T6 Momentum',mileageFromOdometer:{value:40000,unitCode:'SMI'},url:'https://dealer.example/vehicle/one',offers:{price:'30000',priceCurrency:'USD'},...changes});
const html=(rows,total=rows.length,next='')=>'<script type="application/ld&#x2B;json">'+JSON.stringify({'@graph':[{'@type':'ItemList',numberOfItems:total,itemListElement:rows.map(item=>({item}))},{'@type':'PostalAddress',addressLocality:'Corporate office',addressRegion:'CA'}]})+'</script>'+(next?'<a rel="next" href="'+next+'">Next</a>':'');

test('parses nested JSON-LD, encoded script type and model/trim without inventing a group rooftop location',()=>{
 const p=parsePublicInventory(html([row()]),source.url,source,stamp),v=p.listings[0];assert.equal(p.expectedCount,1);assert.equal(v.model,'XC60');assert.equal(v.trim,'T6 Momentum');assert.equal(v.price,30000);assert.equal(v.mileage,40000);assert.equal(v.state,'');assert.equal(v.latitude,null);assert.equal(v.certified,null);assert.equal(v.observedAt,stamp);
});
test('ambiguous offers, missing mileage and certification remain unknown rather than a made-up market input',()=>{
 const v=parsePublicInventory(html([row({offers:[{price:30000},{price:29000}],mileageFromOdometer:undefined})]),source.url,source,stamp).listings[0];assert.equal(v.price,null);assert.equal(v.mileage,null);assert.equal(v.certified,null);
});
test('reads mileage only from the associated card and never treats hidden selling-price differences as fees',()=>{
 const content=html([row({mileageFromOdometer:undefined})])+'<div data-itemid="xYV4A22RK7L1557904"><span miles="12345"></span><i sellingPrice: "29686"></i><b>Doc Fee $314</b><div data-itemid="xWVW3E7CD3TW159182"><span miles="99999"></span>';
 const v=parsePublicInventory(content,source.url,source,stamp).listings[0];assert.equal(v.mileage,12345);assert.equal(v.preFeePrice,null);assert.equal(v.feeComponent,null);
});
test('robots wildcard, longest match, allow tie and our real user agent are enforced',()=>{
 const rules='User-agent: *\nDisallow: /cars/\nAllow: /cars/used/\nDisallow: /*?secret=*\nUser-agent: GPTBot\nDisallow: /';assert.equal(robotsAllows(rules,source.url),true);assert.equal(robotsAllows(rules,'https://dealer.example/cars/new/'),false);assert.equal(robotsAllows(rules,'https://dealer.example/?secret=one'),false);assert.equal(robotsAllows(rules,source.url,'GPTBot'),false);
});
test('collector blocks before inventory request when robots denies access and never follows a redirect',async()=>{
 const urls=[];await assert.rejects(collectPublicSource(source,async(u,init)=>{urls.push(u);assert.equal(init.redirect,'manual');return new Response('User-agent: *\nDisallow: /');},Date.parse(stamp)),e=>e.code==='robots_disallowed');assert.equal(urls.length,1);
});
test('collector accepts only a complete consistent paginated VIN set and retains true observation times',async()=>{
 const two=row({sku:'YV4L12PV3P1962818',url:'https://dealer.example/vehicle/two'}),urls=[];const r=await collectPublicSource(source,async u=>{urls.push(u);return new Response(u.endsWith('robots.txt')?'User-agent: *\nAllow: /':u.includes('pg=2')?html([two],2):html([row()],2,'?pg=2'));},Date.parse(stamp));assert.equal(r.listings.length,2);assert.equal(r.pages,2);assert.equal(r.complete,true);assert.ok(r.listings.every(v=>v.observedAt===stamp));assert.equal(urls.length,3);
});
test('incomplete, changing and cross-origin pagination fail without returning a successful snapshot',async()=>{
 for(const [type,code] of [['short','incomplete_snapshot'],['changing','changing_total'],['external','unsafe_pagination']]){let n=0;await assert.rejects(collectPublicSource(source,async u=>{if(u.endsWith('robots.txt'))return new Response('');n++;return new Response(type==='external'?html([row()],2,'https://other.example/cars/used/volvo/?pg=2'):html([row()],type==='changing'&&n>1?3:2));},Date.parse(stamp)),e=>e.code===code);}
});
test('a silently broadened new inventory route cannot mix in used condition',()=>{
 assert.throws(()=>parsePublicInventory(html([row({itemCondition:'https://schema.org/UsedCondition'})]),source.url,{...source,condition:'New'},stamp),e=>e.code==='condition_mismatch');
});
test('published card mileage is read without borrowing another VIN and missing listing URLs reject the snapshot',()=>{
 const content=html([row({mileageFromOdometer:undefined})])+'<div data-itemid="Volvo-XC60-YV4A22RK7L1557904"><div class="details-item-label">Mileage</div><div class="details-item-value">11,322 Miles</div><div data-itemid="xWVW3E7CD3TW159182"><div>Mileage</div><div>99,999 Miles</div>';
 assert.equal(parsePublicInventory(content,source.url,source,stamp).listings[0].mileage,11322);assert.throws(()=>parsePublicInventory(html([row({url:undefined})]),source.url,source,stamp),e=>e.code==='invalid_listing');
});
test('a rate-limited source exposes only bounded retry timing',async()=>{
 await assert.rejects(collectPublicSource(source,async()=>new Response('',{status:429,headers:{'Retry-After':'86400'}}),Date.parse(stamp)),e=>e.code==='rate_limited'&&e.retryAfterSeconds===86400);
});
test('the same VIN visible heading preserves powertrain and drive details omitted by schema without borrowing another card',()=>{
 const content=html([row({vehicleConfiguration:'Ultra'})])+'<div data-itemid="Volvo-XC60-Ultra-YV4A22RK7L1557904"><h2>2020 Volvo XC60 T8 AWD Ultra</h2><div data-itemid="xWVW3E7CD3TW159182"><h2>2020 Volvo XC60 B5 FWD Core</h2>';
 const result=parsePublicInventory(content,source.url,source,stamp).listings[0];assert.equal(result.trim,'T8 AWD Ultra');assert.equal(result.schemaTrim,'Ultra');assert.equal(result.drivetrain,'AWD');assert.equal(result.trimBasis,'Visible heading on the same VIN card');
});
test('redirect responses are rejected without a second request, using the redirect mode supported by Workers',async()=>{
 const urls=[];await assert.rejects(collectPublicSource(source,async(url,init)=>{urls.push(url);assert.equal(init.redirect,'manual');return new Response('',{status:302,headers:{Location:'https://other.example/private'}});},Date.parse(stamp)),error=>error.code==='redirect_rejected');assert.equal(urls.length,1);
});
test('model-summary counts cannot be accepted as a complete individual vehicle feed',()=>{
 assert.throws(()=>parsePublicInventory('<script>var resultCount = "76";</script>'+html([row()],14),source.url,source,stamp),error=>error.code==='changing_total');
});
test('visible engine and drivetrain details belong only to their VIN card',()=>{
 const content=html([row()])+'<div data-itemid="xYV4A22RK7L1557904"><div class="details-item-label">Engine</div><div class="details-item-value">Intercooled Turbo I-4 2.0 L</div><div class="details-item-label">Drivetrain</div><div class="details-item-value">AWD</div><div data-itemid="xWVW3E7CD3TW159182"><div class="details-item-label">Engine</div><div class="details-item-value">V6 3.6 L</div>';
 const result=parsePublicInventory(content,source.url,source,stamp).listings[0];assert.equal(result.engine,'Intercooled Turbo I-4 2.0 L');assert.equal(result.drivetrain,'AWD');
});

const ddc=(inventory,total=inventory.length,next='')=>'<script>\nDDC.WS.state[\'ws-inv-data\'][\'one\'] = '+JSON.stringify({WIS:{pageInfo:{totalCount:total},accounts:{a:{name:'Real Texas Dealer',address:{city:'San Antonio',state:'TX'}}},inventory}})+';\n</script>'+(next?'<a aria-label="Go to next page" href="'+next+'">Next</a>':'');
const ddcRow=(changes={})=>({vin:'YV4A22RK7L1557904',type:'used',year:2020,make:'Volvo',model:'XC60',trim:'T6 Momentum',accountId:'a',link:'/used/one.htm',certified:true,trackingAttributes:[{name:'odometer',value:'12345'},{name:'driveLine',value:'AWD'}],pricing:{dprice:[{isFinalPrice:true,value:'$30,314',typeClass:'priceAfterFees'},{value:'$314',typeClass:'totalFees'}]},...changes});
test('public inline inventory is JSON data, preserving actual rooftop, CPO, trim, mileage and final fee basis',()=>{
 const result=parsePublicInventory(ddc([ddcRow()],2,'?start=24'),source.url,source,stamp),v=result.listings[0];assert.equal(result.expectedCount,2);assert.equal(v.price,30314);assert.equal(v.feeComponent,314);assert.equal(v.mileage,12345);assert.equal(v.drivetrain,'AWD');assert.equal(v.certified,true);assert.equal(v.dealer,'Real Texas Dealer');assert.equal(v.state,'TX');assert.equal(result.next,'https://dealer.example/cars/used/volvo/?start=24');
});
test('documentation fee and tracking price cannot supply a missing inline vehicle asking price',()=>{
 const v=parsePublicInventory(ddc([ddcRow({trackingPricing:{askingPrice:99999},pricing:{dprice:[{isFinalPrice:true,typeClass:'totalFees',value:'$314'},{typeClass:'priceAfterFees',value:'PLEASE_CALL'}]}})]),source.url,source,stamp).listings[0];assert.equal(v.price,null);assert.equal(v.feeComponent,314);
});
const tampaChargeRows=[{label:'Selling Price',type:'UNKNOWN',typeClass:'retailValue',value:'PLEASE_CALL'},{label:'Pre-Delivery Service Fee',type:'MIDDLE',typeClass:'documentFee',value:'$998'},{isFinalPrice:true,label:'Electronic Title Fee',type:'TOTAL',typeClass:'miscFee',value:'$294'},{label:'Volvo Cars Tampa Price',type:'UNKNOWN',typeClass:'internetPrice',value:'PLEASE_CALL'}];
test('Tampa call-for-price vehicles retain their advertised charges without becoming $294 vehicles',()=>{
 const vehicles=['1C4PJLDS3HW526818','3KPF24ADXLE223963'].map(vin=>ddcRow({vin,pricing:{dprice:tampaChargeRows},trackingPricing:{askingPrice:998}}));
 const result=parsePublicInventory(ddc(vehicles),source.url,source,stamp);
 for(const listing of result.listings){assert.equal(listing.price,null);assert.equal(listing.feeComponent,null);assert.match(listing.pricingBasis,/Pre-Delivery Service Fee \$998/);assert.match(listing.pricingBasis,/Electronic Title Fee \$294/);}
});
test('fee and tax classes or clearly fee-only labels never establish the ask, while cheap genuine prices remain valid',()=>{
 for(const charge of [{typeClass:'documentFee'},{typeClass:'titleFee'},{typeClass:'registrationFees'},{typeClass:'taxes'},{label:'Electronic Title Fee'},{label:'Sales Tax'}]){
  const listing=parsePublicInventory(ddc([ddcRow({pricing:{dprice:[{isFinalPrice:true,value:'$294',...charge}]}})]),source.url,source,stamp).listings[0];assert.equal(listing.price,null);
 }
 for(const vehiclePrice of [{typeClass:'internetPrice',label:'Selling Price'},{typeClass:'priceAfterFees',label:'Vehicle Price Including Fees'}]){
  const listing=parsePublicInventory(ddc([ddcRow({pricing:{dprice:[...tampaChargeRows,{isFinalPrice:true,value:'$294',...vehiclePrice}]}})]),source.url,source,stamp).listings[0];assert.equal(listing.price,294);
 }
});
test('inline pagination and VIN identities fail closed and scripts are never executed',()=>{
 assert.throws(()=>parsePublicInventory(ddc([ddcRow(),ddcRow()]),source.url,source,stamp),e=>e.code==='invalid_listing');
 assert.throws(()=>parsePublicInventory(ddc([ddcRow()],2,'https://other.example/inventory'),source.url,source,stamp),e=>e.code==='unsafe_pagination');
 const bad='<script>\nDDC.WS.state[\'ws-inv-data\'][\'one\'] = {"WIS":(globalThis.__notExecuted=true)};\n</script>';assert.throws(()=>parsePublicInventory(bad,source.url,source,stamp),e=>e.code==='invalid_listing');assert.equal(globalThis.__notExecuted,undefined);
});

test('colon mileage and a same-VIN advertised CPO path are observed without certifying unrelated navigation',()=>{
 const v=parsePublicInventory(html([row({url:'https://dealer.example/viewdetails/cpo/YV4A22RK7L1557904/2020-volvo-xc60',mileageFromOdometer:undefined})])+'<div data-itemid="xYV4A22RK7L1557904"><div>Mileage: 3,774 Miles</div>',source.url,source,stamp).listings[0];assert.equal(v.mileage,3774);assert.equal(v.certified,true);
 const other=parsePublicInventory(html([row()])+'<nav>Certified Pre-Owned</nav>',source.url,source,stamp).listings[0];assert.equal(other.certified,null);
});
