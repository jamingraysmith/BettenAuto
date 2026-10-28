import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/pricing.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {matchComparables,samplePricing,modelKey,observedEngineLiters,observedEngineEvidence}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const now=Date.parse('2026-10-20T14:00:00Z'),v={vin:'W1N4M4HB1NW162409',year:2022,make:'Mercedes-Benz',model:'GLC 300',trim:'4MATIC',condition:'Used',mileage:40000,price:30000};
const c=(x={})=>({vin:'W1N4M4HB1NW162410',year:2022,make:'mercedes benz',model:'GLC300',trim:'4MATIC',condition:'Used',mileage:45000,price:29000,observedAt:'2026-10-20T13:00:00Z',dealer:'Test local dealer',...x});
test('matching excludes wrong condition, stale, far-mileage, duplicate VIN and own vehicle',()=>{const input=[c(),c({price:28000}),c({vin:v.vin}),c({vin:'1',condition:'New'}),c({vin:'2',observedAt:'2026-09-01'}),c({vin:'3',mileage:90000})];const r=matchComparables(v,input,{now});assert.equal(r.matched.length,1);assert.equal(r.excluded['Duplicate listing'],1);assert.equal(r.excluded['Same vehicle'],1);assert.equal(r.excluded['Condition unknown or different'],1);assert.equal(r.excluded['Stale or undated listing'],1);assert.equal(r.excluded['Mileage unknown or outside range'],1);});
test('VIN and canonical URL aliases cannot inflate comparison count or reach the list-price threshold',()=>{
 const input=[c({vin:'one',url:'https://dealer.example/vehicle/one/?utm_source=inventory#photos',price:28000}),c({vin:'',url:'https://dealer.example/vehicle/one?fbclid=tracking',price:27000}),c({vin:'ONE',url:'https://dealer.example/alternate-one',price:29000}),c({vin:'',url:'https://dealer.example/alternate-one/',price:29000}),c({vin:'two',url:'https://dealer.example/vehicle/two',price:32000})];
 const result=matchComparables(v,input,{now}),stats=samplePricing(v,result.matched);
 assert.deepEqual(result.matched.map(c=>c.vin),['one','two']);assert.equal(result.excluded['Duplicate listing'],3);
 assert.equal(stats.count,2);assert.equal(stats.average,30000);assert.equal(stats.recommendedListPrice,null);
});
test('canonical URL matching retains functional listing query IDs and ignores query order',()=>{
 const input=[c({vin:'',url:'https://dealer.example/vehicle?listingId=one&site=regional',price:28000}),c({vin:'',url:'https://dealer.example/vehicle?site=regional&listingId=one&utm_campaign=search',price:27000}),c({vin:'',url:'https://dealer.example/vehicle?listingId=two&site=regional',price:30000}),c({vin:'',url:'https://dealer.example/vehicle?listingId=three&site=regional',price:32000})];
 const result=matchComparables(v,input,{now});assert.equal(result.matched.length,3);assert.equal(result.excluded['Duplicate listing'],1);
 assert.equal(samplePricing(v,result.matched).recommendedListPrice,30000);
});
test('sparse sample shows an average but never recommends a list price, rank or market percentage',()=>{const p=samplePricing(v,[c()]);assert.equal(p.enoughData,false);assert.equal(p.average,29000);assert.equal(p.recommendedListPrice,null);assert.equal(p.percentOfAverage,null);assert.equal(p.percentOfMedian,null);assert.equal(p.rank,null);});
test('sample median, rank and price percentage are transparent asking-price calculations',()=>{const p=samplePricing(v,[c({vin:'1',price:28000}),c({vin:'2',price:30000}),c({vin:'3',price:32000})]);assert.equal(p.median,30000);assert.equal(p.percentOfMedian,100);assert.equal(p.rank,2);assert.equal(p.rankDenominator,4);});
test('appraisal average includes every valid asking price while suggested list follows the median rounded to $100',()=>{const p=samplePricing(v,[c({vin:'1',price:27900}),c({vin:'2',price:29980}),c({vin:'3',price:42000})]);assert.equal(p.average,99880/3);assert.equal(p.median,29980);assert.equal(p.recommendedListPrice,30000);assert.equal(p.min,27900);assert.equal(p.max,42000);});
test('empty and invalid-price samples do not create market prices or count invalid sources',()=>{const p=samplePricing(v,[c({price:null,dealer:'Missing'}),c({price:0,dealer:'Zero'}),c({price:-100,dealer:'Negative'}),c({price:'unknown',dealer:'Invalid'})]);assert.equal(p.count,0);assert.equal(p.average,null);assert.equal(p.median,null);assert.equal(p.recommendedListPrice,null);assert.equal(p.min,null);assert.equal(p.max,null);assert.equal(p.sourceCount,0);});
test('two valid listings cannot satisfy the list suggestion threshold with invalid extra listings',()=>{const p=samplePricing(v,[c({vin:'1',price:30000}),c({vin:'2',price:32000}),c({vin:'3',price:null})]);assert.equal(p.count,2);assert.equal(p.average,31000);assert.equal(p.recommendedListPrice,null);assert.equal(p.enoughData,false);});
test('radius excludes unknown distance and exact trim excludes different trim',()=>{const r=matchComparables(v,[c(),c({vin:'2',distanceMiles:20,trim:'Base'}),c({vin:'3',distanceMiles:10})],{now,radiusMiles:50,exactTrim:true});assert.equal(r.matched.length,1);});

test('Grand Cherokee L is a separate body variant from Grand Cherokee Limited',()=>{const long={...v,make:'Jeep',model:'Grand Cherokee',trim:'L Summit'};const base={...c(),make:'Jeep',model:'Grand Cherokee',trim:'Limited'};const extended={...base,vin:'long',model:'Grand Cherokee L'};const result=matchComparables(long,[base,extended],{now,exactTrim:false});assert.equal(result.matched.length,1);assert.equal(result.matched[0].vin,'long');});

test('Mercedes coupe and standard SUV variants never share a comparison set',()=>{const suv={...v,make:'Mercedes-Benz',model:'GLE 450',trim:'4MATIC',bodyStyle:'SUV'};const coupe={...c(),model:'GLE',trim:'GLE 450 Coupe 4MATIC',bodyStyle:'SUV'};assert.equal(matchComparables(suv,[coupe],{now}).matched.length,0);});
test('generic Mercedes EV models retain numeric powertrain variants and unknown variants are excluded',()=>{const ev={...v,model:'EQE',trim:'500 4MATIC',bodyStyle:'SUV'};const other={...c(),model:'EQE',trim:'350 4MATIC',bodyStyle:'SUV'};assert.equal(matchComparables(ev,[other],{now}).matched.length,0);assert.equal(matchComparables({...ev,trim:''},[{...other,trim:''}],{now}).matched.length,0);});

test('Mercedes AMG numeric badges never absorb the leading digit of a 4MATIC trim',()=>{
 const amg={...v,model:'AMG GLE 53',trim:'4MATIC',bodyStyle:'Coupe'};
 assert.equal(modelKey(amg),'gle53coupe');
 assert.equal(modelKey({...amg,trim:''}),'gle53coupe');
 assert.equal(modelKey({...amg,model:'GLE',trim:'AMG GLE 53 4MATIC'}),'gle53coupe');
 assert.equal(modelKey({...amg,model:'GLE',trim:'53 4MATIC'}),'gle53coupe');
 assert.equal(modelKey({...amg,model:'AMG GLS 63',bodyStyle:'SUV'}),'gls63');
 assert.notEqual(modelKey(amg),modelKey({...amg,model:'GLE 534'}));
 assert.notEqual(modelKey(amg),modelKey({...amg,bodyStyle:'SUV'}));
 const result=matchComparables(amg,[c({vin:'same-badge',model:'GLE',trim:'AMG GLE 53 4MATIC',bodyStyle:'Coupe'}),c({vin:'wrong-badge',model:'GLE 534',bodyStyle:'Coupe'}),c({vin:'suv',model:'AMG GLE 53',bodyStyle:'SUV'})],{now,exactTrim:false});
 assert.deepEqual(result.matched.map(listing=>listing.vin),['same-badge']);
});

test('Mercedes badge extraction preserves powertrain suffixes and prefers the model before trim fallback',()=>{
 const vehicle={...v,model:'GLE 350e',trim:'4MATIC',bodyStyle:'SUV'};
 assert.equal(modelKey(vehicle),'gle350e');
 assert.equal(modelKey({...vehicle,model:'GLE',trim:'GLE 350e 4MATIC'}),'gle350e');
 assert.equal(modelKey({...vehicle,model:'GLE 450',trim:'4MATIC'}),'gle450');
 assert.equal(modelKey({...vehicle,model:'GLE',trim:'450 4MATIC'}),'gle450');
 assert.notEqual(modelKey(vehicle),modelKey({...vehicle,model:'GLE 350'}));
 assert.equal(modelKey({...vehicle,trim:'GLE 450 4MATIC'}),'gle350e');
});


test('default matching requires same model year and equivalent Jetta trim without mixing Sport or SE',()=>{
 const jetta={...v,year:2026,make:'Volkswagen',model:'Jetta',trim:'1.5T SEL',mileage:2730};
 const listing=(changes={})=>({...c(),year:2026,make:'Volkswagen',model:'Jetta',trim:'SEL',mileage:9000,...changes});
 const result=matchComparables(jetta,[listing({vin:'sel'}),listing({vin:'sel-fwd',trim:'SEL FWD'}),listing({vin:'engine-prefix',trim:'1.5T SEL'}),listing({vin:'sport',trim:'1.5T Sport'}),listing({vin:'se',trim:'1.5T SE'}),listing({vin:'older',year:2025}),listing({vin:'unknown',trim:''})],{now});
 assert.deepEqual(result.matched.map(c=>c.vin),['sel','sel-fwd','engine-prefix']);
 assert.equal(result.excluded['Different or unknown trim'],3);assert.equal(result.excluded['Outside model years'],1);
 const broad=matchComparables(jetta,[listing({vin:'sport',trim:'Sport'}),listing({vin:'older',year:2025})],{now,exactTrim:false,maxYearDelta:1});
 assert.equal(broad.matched.length,2);
});

test('certified filter requires a confirmed advertised certification status',()=>{
 const result=matchComparables(v,[c({vin:'yes',certified:true}),c({vin:'label',condition:'Certified'}),c({vin:'no',certified:false}),c({vin:'unknown'}),c({vin:'string',certified:'true'})],{now,certifiedOnly:true});
 assert.deepEqual(result.matched.map(c=>c.vin),['yes','label']);
 assert.equal(result.excluded['Not advertised certified'],3);
 assert.equal(matchComparables(v,[c({vin:'no',certified:false}),c({vin:'unknown'})],{now,certifiedOnly:false}).matched.length,2);
});

test('comparison area filters the real sources with no regional fallback for an empty expanded set',()=>{
 const listings=[c({vin:'regional'}),c({vin:'expanded',scope:'expanded'}),c({vin:'explicit-regional',scope:'regional'})];
 assert.deepEqual(matchComparables(v,listings,{now,marketScope:'expanded'}).matched.map(c=>c.vin),['expanded']);
 assert.deepEqual(matchComparables(v,listings,{now,marketScope:'regional'}).matched.map(c=>c.vin),['regional','explicit-regional']);
 assert.equal(matchComparables(v,listings,{now,marketScope:'all'}).matched.length,3);
 const empty=matchComparables(v,[listings[0]],{now,marketScope:'expanded'});
 assert.equal(empty.matched.length,0);assert.equal(empty.excluded['Outside expanded US sample'],1);
 assert.equal(samplePricing(v,empty.matched).percentOfAverage,null);
});

test('asking-price percentages use their named average and median denominators',()=>{
 const stats=samplePricing(v,[c({vin:'a',price:28000}),c({vin:'b',price:30000}),c({vin:'c',price:42000})]);
 assert.equal(stats.average,100000/3);assert.equal(stats.median,30000);
 assert.ok(Math.abs(stats.percentOfAverage-90)<1e-9);assert.equal(stats.percentOfMedian,100);
 assert.equal(samplePricing({...v,price:null},[c({vin:'a'}),c({vin:'b'}),c({vin:'c'})]).percentOfAverage,null);
});
test('Volvo source headings and dealer trim labels match only with the same observed powertrain, drive and seat count',()=>{
 const target={...v,year:2026,make:'Volvo',model:'XC90 Plug-In Hybrid',trim:'T8 Ultra 6 Passenger',drivetrain:'AWD'};
 const input=[c({vin:'same',year:2026,make:'Volvo',model:'XC90 Plug-In Hybrid',trim:'T8 AWD Ultra 6-Seater',drivetrain:'AWD'}),c({vin:'seven',year:2026,make:'Volvo',model:'XC90 Plug-In Hybrid',trim:'T8 AWD Ultra 7-Seater',drivetrain:'AWD'}),c({vin:'wrong-powertrain',year:2026,make:'Volvo',model:'XC90 Plug-In Hybrid',trim:'B6 AWD Ultra 6-Seater',drivetrain:'AWD'}),c({vin:'missing-drive',year:2026,make:'Volvo',model:'XC90 Plug-In Hybrid',trim:'T8 Ultra 6-Seater',drivetrain:''})];
 assert.deepEqual(matchComparables(target,input,{now}).matched.map(row=>row.vin),['same']);
});
test('Mercedes redundant model badge in a trim does not hide a matching observed 4MATIC specification',()=>{
 const target={...v,model:'GLC 300',trim:'4MATIC',drivetrain:'4MATIC'};
 const input=[c({vin:'same',model:'GLC',trim:'GLC 300 4MATIC',drivetrain:'AWD'}),c({vin:'unknown-drive',model:'GLC',trim:'GLC 300',drivetrain:''}),c({vin:'rear-drive',model:'GLC',trim:'GLC 300',drivetrain:'RWD'}),c({vin:'engine',model:'GLC',trim:'GLC 350 4MATIC',drivetrain:'AWD'})];
 assert.deepEqual(matchComparables(target,input,{now}).matched.map(row=>row.vin),['same']);
 assert.equal(matchComparables(target,input.filter(row=>row.vin==='rear-drive'),{now,exactTrim:false}).matched.length,0);
});
test('VW redundant turbo-engine and drive wording requires matching observed engine and drivetrain',()=>{
 const target={...v,year:2026,make:'Volkswagen',model:'Atlas',trim:'SE w/Technology',engine:'2.0L TSI',drivetrain:'AWD'};
 const listing={...c(),year:2026,make:'Volkswagen',model:'Atlas',trim:'2.0T SE w/Technology',engine:'Intercooled Turbo I-4 2.0 L/121',drivetrain:'AWD'};
 assert.equal(matchComparables(target,[listing],{now}).matched.length,1);
 for(const changes of [{trim:'3.6L SE w/Technology',engine:'3.6L V6'},{drivetrain:'FWD'},{engine:'',trim:'SE 4MOTION w/Technology'},{trim:'2.0T SEL w/Technology'},{engine:'2.0L turbo diesel'}])assert.equal(matchComparables(target,[{...listing,...changes}],{now}).matched.length,0);
});
test('an explicitly advertised Mercedes base badge can use its observed AWD without manufacturing 4MATIC for an unknown drive',()=>{
 const target={...v,model:'CLA',trim:'CLA 220 4MATIC',drivetrain:'4MATIC'};
 const listing={...c(),model:'CLA',trim:'220',drivetrain:'AWD'};
 assert.equal(matchComparables(target,[listing],{now}).matched.length,1);
 assert.equal(matchComparables(target,[{...listing,model:'CLA 220',trim:'Base'}],{now}).matched.length,1);
 assert.equal(matchComparables(target,[{...listing,trim:'Base'}],{now}).matched.length,0,'Generic CLA plus Base does not establish a numeric variant.');
 for(const change of [{drivetrain:''},{drivetrain:'RWD'},{trim:''},{trim:'CLA 250',drivetrain:'AWD'}])assert.equal(matchComparables(target,[{...listing,...change}],{now}).matched.length,0);
 const base={...target,trim:'CLA 220',drivetrain:'FWD'};
 assert.equal(matchComparables(base,[{...listing,drivetrain:'FWD'}],{now}).matched.length,1);
});
test('Mercedes observed base configurations retain package, numeric, AMG and body differences',()=>{
 const target={...v,model:'GLC 300',trim:'4MATIC',drivetrain:'AWD',bodyStyle:'SUV'};
 const same={...c(),model:'GLC',trim:'GLC 300',drivetrain:'AWD',bodyStyle:'SUV'};
 assert.equal(matchComparables(target,[same],{now}).matched.length,1);
 for(const changes of [{trim:'GLC 300 Exclusive'},{trim:'AMG GLC 43'},{trim:'GLC 300 Coupe',bodyStyle:'Coupe'},{trim:'GLC 350e'}])assert.equal(matchComparables(target,[{...same,...changes}],{now}).matched.length,0);
});
test('contradictory known engine displacement cannot pass through identical trim names or a broad trim filter',()=>{
 const target={...v,make:'Volkswagen',model:'Atlas',trim:'SE',engine:'2.0L TSI',drivetrain:'AWD'};
 const listing={...c(),make:'Volkswagen',model:'Atlas',trim:'SE',engine:'3.6L V6',drivetrain:'AWD'};
 for(const exactTrim of [true,false]){const result=matchComparables(target,[listing],{now,exactTrim});assert.equal(result.matched.length,0);assert.equal(result.excluded['Different observed engine displacement'],1);}
 assert.equal(matchComparables(target,[{...listing,engine:'2 L Turbo'}],{now}).matched.length,1);
 assert.equal(matchComparables(target,[{...listing,engine:''}],{now}).matched.length,1);
 assert.equal(matchComparables(target,[{...listing,engine:'2.0L turbo',trim:'3.6L SE'}],{now,exactTrim:false}).matched.length,0);
});
test('clear fuel conflicts reject equal trims while compatible gasoline and mild-hybrid labels stay usable',()=>{
 const target={...v,engine:'2.0L Turbo',fuelType:'Gasoline'};
 for(const changes of [{engine:'2.0L Turbo Diesel',fuelType:'Diesel'},{engine:'Electric Motor',fuelType:'Electric'}])assert.equal(matchComparables(target,[{...c(),...changes}],{now}).matched.length,0);
 assert.equal(matchComparables(target,[c({engine:'2.0L Turbo',fuelType:'Hybrid'})],{now}).matched.length,1);
 assert.equal(matchComparables({...target,engine:'Electric Motor',fuelType:'Electric'},[c({engine:'2.0L Turbo',fuelType:'Gasoline'})],{now}).matched.length,0);
});
test('a conflicting explicit drivetrain and trim badge cannot match a convenient counterpart',()=>{
 const result=matchComparables(v,[c({drivetrain:'RWD',trim:'4MATIC'})],{now,exactTrim:false});assert.equal(result.matched.length,0);assert.equal(result.excluded['Conflicting observed drivetrain'],1);
 assert.equal(matchComparables(v,[c({drivetrain:'Unknown',trim:'4MATIC'})],{now}).matched.length,1);
});
test('retained mileage and certification must keep their own usable observation dates when essential to matching',()=>{
 for(const field of ['mileageObservedAt','certifiedObservedAt'])for(const value of ['2026-10-01T13:00:00Z','2026-10-21T13:00:00Z','invalid','',null]){
  const result=matchComparables(v,[c({certified:true,[field]:value})],{now,certifiedOnly:true});assert.equal(result.matched.length,0);assert.equal(result.excluded[field==='mileageObservedAt'?'Stale or undated mileage':'Stale or undated certification'],1);
 }
 assert.equal(matchComparables(v,[c({certified:true,mileageObservedAt:'2026-10-20T12:00:00Z',certifiedObservedAt:'2026-10-20T12:00:00Z'})],{now,certifiedOnly:true}).matched.length,1);
 assert.equal(matchComparables(v,[c({certified:true})],{now,certifiedOnly:true}).matched.length,1,'Legacy whole-page observations retain their listing observation basis.');
 assert.equal(matchComparables(v,[c({mileageObservedAt:'invalid',certifiedObservedAt:'invalid'})],{now,maxMileageDelta:null,certifiedOnly:false}).matched.length,1,'Explicitly disabled criteria do not claim those cached fields are fresh.');
});
test('unrelated and otherwise ineligible listings do not require URL parsing while eligible aliases still deduplicate',()=>{
 const inputs=[c({vin:'wrong-make',make:'Honda',model:'Civic'}),c({vin:'wrong-year',year:2000}),c({vin:'wrong-condition',condition:'New'}),c({vin:'wrong-trim',trim:'Exclusive'}),c({vin:'stale',observedAt:'2026-01-01'}),c({vin:'unpriced',price:null})];
 for(const row of inputs)Object.defineProperty(row,'url',{get(){throw new Error('An excluded source URL should not need parsing.');}});
 let eligibleUrlReads=0;const first=c({vin:'eligible',price:28000}),duplicate=c({vin:'duplicate',price:29000});
 for(const row of [first,duplicate])Object.defineProperty(row,'url',{get(){eligibleUrlReads++;return 'https://dealer.example/same-vehicle?utm_source=campaign';}});
 const result=matchComparables(v,[...inputs,first,duplicate],{now});assert.deepEqual(result.matched.map(row=>row.vin),['eligible']);assert.equal(result.excluded['Duplicate listing'],1);assert.equal(eligibleUrlReads,2);assert.equal(Object.values(result.excluded).reduce((a,b)=>a+b,0),7);
});
test('public engineSize and dated exact equipment labels supply observed liters without using bore, torque or factory assumptions',()=>{
 const at='2026-10-20T14:01:19.315Z';
 const target={...v,year:2026,make:'Volkswagen',model:'Atlas Cross Sport',trim:'SE w/Technology',engine:'TSI',engineSize:'2L',drivetrain:'AWD',detailObservedAt:at,equipment:[{category:'Powertrain',items:[{label:'Engine liters',detail:'2.0L',availability:'D'},{label:'Engine bore x stroke',detail:'82.0mm x 93.0mm'},{label:'Engine torque',detail:'273 lb.-ft.'}]}]};
 const listing={...c(),year:2026,make:'Volkswagen',model:'Atlas Cross Sport',trim:'2.0T SE w/Technology',engine:'2.0 L Turbo',drivetrain:'AWD'};
 assert.equal(observedEngineLiters(target),2);assert.equal(matchComparables(target,[listing],{now}).matched.length,1);
 const evidence=observedEngineEvidence({...target,engineSize:undefined});assert.ok(evidence.some(row=>row.field==='equipment:engine liters'&&row.liters===2&&row.observedAt===at));
 assert.equal(observedEngineLiters({...target,engineSize:undefined,detailObservedAt:undefined}),null);assert.equal(observedEngineLiters({...target,engineSize:undefined,detailObservedAt:'invalid'}),null);
 assert.equal(observedEngineLiters({...target,engineSize:'2',equipment:[]}),null);assert.equal(observedEngineLiters({...target,engineSize:'0L',equipment:[]}),null);
 assert.equal(observedEngineLiters({...target,engineSize:undefined,equipment:[{items:[{label:'Engine bore x stroke',detail:'2.0L'},{label:'Engine liters',detail:'2.0L',availability:'O'}]}]}),null);
 assert.equal(matchComparables(target,[{...listing,trim:'2.0T SEL Premium R-Line'}],{now}).matched.length,0);
 assert.equal(matchComparables({...target,engine:'',engineSize:undefined,equipment:[]},[listing],{now}).matched.length,0);
 assert.equal(matchComparables({...target,engineSize:'3.6L'},[listing],{now}).matched.length,0,'Conflicting dated specifications must not be resolved to the convenient engine.');
});

test('active Auto.dev responses without update dates use actual retrieval without inventing dealer timestamps',()=>{
 const live=c({observedAt:'',provider:'autodev',providerObservedAt:null,observationBasis:'active_provider_response',retrievedAt:new Date(now).toISOString()});
 assert.equal(matchComparables(v,[live],{now}).matched.length,1);assert.equal(live.observedAt,'');assert.equal(live.providerObservedAt,null);
 for(const changes of [{provider:'custom'},{observationBasis:undefined},{retrievedAt:'2026-09-01'},{retrievedAt:new Date(now+600000).toISOString()},{observedAt:'2026-09-01'}])assert.equal(matchComparables(v,[{...live,...changes}],{now}).matched.length,0);
});

test('Volvo model spelling aliases match while plug-in powertrains, themes and seat counts stay distinct',()=>{
 const subject={...v,make:'Volvo',model:'XC90 Recharge Plug-In Hybrid',trim:'Ultimate Bright 7-Seater',drivetrain:'AWD'};
 const alias={...c(),make:'Volvo',model:'XC90',trim:'T8 Ultimate Bright Theme 7 Passenger',drivetrain:'AWD'};
 assert.equal(matchComparables(subject,[alias],{now}).matched.length,1);
 for(const changes of [{trim:'B6 Ultimate Bright 7-Seater'},{trim:'T8 Ultimate Dark 7-Seater'},{trim:'T8 Ultimate Bright 6-Seater'}])assert.equal(matchComparables(subject,[{...alias,...changes}],{now}).matched.length,0);
});
test('Volkswagen technology wording aliases keep SE, SEL and observed engines separate',()=>{
 const subject={...v,make:'Volkswagen',model:'Atlas',trim:'SE with Technology Package',engine:'2.0L TSI',drivetrain:'AWD'};
 const alias={...c(),make:'Volkswagen',model:'Atlas',trim:'2.0T SE w/Technology',engine:'2.0L Turbo',drivetrain:'AWD'};
 assert.equal(matchComparables(subject,[alias],{now}).matched.length,1);
 assert.equal(matchComparables(subject,[{...alias,trim:'2.0T SEL'}],{now}).matched.length,0);
 assert.equal(matchComparables(subject,[{...alias,engine:'3.6L V6'}],{now}).matched.length,0);
});
test('provider-filtered radius supports unknown individual distances only for the same verified origin and search area',()=>{
 const listing=c({provider:'autodev',distanceMiles:null,searchOriginZip:'49546',searchRadiusMiles:200});
 assert.equal(matchComparables(v,[listing],{now,radiusMiles:200,originZip:'49546'}).matched.length,1);
 assert.equal(matchComparables(v,[listing],{now,radiusMiles:500,originZip:'49546'}).matched.length,1);
 for(const opts of [{radiusMiles:100,originZip:'49546'},{radiusMiles:200,originZip:'10001'},{radiusMiles:200}])assert.equal(matchComparables(v,[listing],{now,...opts}).matched.length,0);
 assert.equal(matchComparables(v,[{...listing,provider:'custom'}],{now,radiusMiles:200,originZip:'49546'}).matched.length,0);
});
test('known out-of-radius distance cannot be excused by provider search scope',()=>{
 assert.equal(matchComparables(v,[c({provider:'autodev',distanceMiles:250,searchOriginZip:'49546',searchRadiusMiles:200})],{now,radiusMiles:200,originZip:'49546'}).matched.length,0);
});
test('BMW badge and Series names share known xDrive trim without merging different badges',()=>{
 const subject={...v,make:'BMW',model:'540i',trim:'xDrive',drivetrain:'AWD'};
 const listing={...c(),make:'BMW',model:'5 Series',trim:'540i xDrive',drivetrain:'AWD'};
 assert.equal(matchComparables(subject,[listing],{now}).matched.length,1);
 assert.equal(matchComparables(subject,[{...listing,trim:'530i xDrive'}],{now}).matched.length,0);
});

test('Wrangler JK Unlimited naming uses generation/body evidence instead of literal model and trim equality',()=>{
 const target={...v,vin:'1C4HJWDGXJL929073',year:2018,make:'Jeep',model:'Wrangler JK',trim:'Unlimited Sport 4x4',drivetrain:'4WD',mileage:124617};
 const candidate={...c(),vin:'1C4HJWDG8JL868404',year:2018,make:'Jeep',model:'Wrangler',trim:'Unlimited Sport',drivetrain:'4WD',mileage:120000};
 assert.equal(modelKey(target),'wranglerjk4door');assert.equal(modelKey(candidate),modelKey(target));
 assert.equal(matchComparables(target,[candidate],{now}).matched.length,1);
 assert.equal(matchComparables(target,[{...candidate,model:'Wrangler JK Unlimited',trim:'Sport 4WD'}],{now}).matched.length,1);
 for(const change of [{vin:'1C4HJXDG8JW100001',model:'Wrangler',trim:'Unlimited Sport'},{vin:'1C4HJWAG8JL100001',trim:'Sport'},{vin:'1C4HJWDG8JL868404',trim:'Unlimited Sport S'},{vin:'1C4HJWDG8JL868404',trim:'Unlimited Rubicon'},{vin:'UNKNOWN',model:'Wrangler',trim:'Unlimited Sport'}])assert.equal(matchComparables(target,[{...candidate,...change}],{now}).matched.length,0);
});
test('Wrangler VIN conflicts and unsupported VIN scope cannot manufacture a generation match',()=>{
 const base={year:2018,make:'Jeep',model:'Wrangler',trim:'Unlimited Sport',vin:'1C4HJWDG8JL868404'};
 assert.ok(modelKey({...base,model:'Wrangler JL'}).startsWith('unknown:'));
 assert.ok(modelKey({...base,doors:2}).startsWith('unknown:'));
 assert.ok(modelKey({...base,year:2019}).startsWith('wranglerjl'));
 assert.ok(modelKey({...base,vin:'3C4HJWDG8JL868404'}).startsWith('unknown:'));
 assert.ok(modelKey({...base,vin:'1C4HJWDG8KL868404'}).startsWith('unknown:'));
 assert.notEqual(modelKey({...base,model:'Wrangler JK Unlimited',vin:''}),modelKey({...base,model:'Wrangler JL Unlimited',vin:''}));
});
