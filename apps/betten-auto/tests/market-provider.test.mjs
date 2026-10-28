import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/market-provider.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {fetchVehicleMarket,MarketProviderError}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const now=Date.parse('2026-10-20T17:00:00Z'),key='private-provider-key-123';
const vehicle={vin:'3VWGW7BU6TM020418',year:2026,make:'Volkswagen',model:'Jetta',trim:'SEL',condition:'Used',mileage:2730};
const config={provider:'autodev',apiKey:key,cacheAllowed:false};
const row=(changes={})=>({updatedAt:'2026-10-20T11:00:00Z',vehicle:{vin:'3VWGW7BU0TM006871',year:2026,make:'Volkswagen',model:'Jetta',trim:'SEL',drivetrain:'FWD'},retailListing:{price:25348,miles:9583,used:true,cpo:true,dealer:'Example Volkswagen',city:'Brooklyn Center',state:'MN',zip:'55429',vdp:'https://dealer.example/vehicle?utm_source=inventory'},...changes});
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
const failCode=code=>e=>e instanceof MarketProviderError&&e.code===code&&!String(e).includes(key);
const numberedRows=(count,start=0)=>Array.from({length:count},(_,index)=>{const n=start+index;return row({vehicle:{...row().vehicle,vin:'1HGCM82633A'+String(n).padStart(6,'0')},retailListing:{...row().retailListing,vdp:'https://dealer.example/vehicle/'+n}})});

test('provider redirects fail before any credential can be sent to a different destination',async()=>{
 let calls=0;await assert.rejects(fetchVehicleMarket(vehicle,config,async(url,init)=>{calls++;assert.equal(new URL(url).origin,'https://api.auto.dev');assert.equal(init.redirect,'manual');return new Response('',{status:302,headers:{Location:'https://other.example/listings'}});},now),failCode('unavailable'));assert.equal(calls,1);
});

test('Auto.dev retrieves and preserves 100 unique matches in one request without discarding the second half',async()=>{
 const calls=[];const fetcher=async u=>{calls.push(new URL(u));return json({data:numberedRows(100),total:100,links:{next:null}});};
 const result=await fetchVehicleMarket(vehicle,{...config,maxPages:1},fetcher,now);
 assert.equal(calls.length,1);assert.equal(calls[0].searchParams.get('limit'),'100');assert.equal(result.listings.length,100);assert.equal(result.listings[99].vin,'1HGCM82633A000099');assert.equal(result.rejectedCount,0);assert.equal(result.truncated,false);assert.match(result.coverage,/100 returned records across 1 request/);
});

test('explicit evaluation page size 20 and one-page budget make one capped request and disclose remaining matches',async()=>{
 const calls=[];const result=await fetchVehicleMarket(vehicle,{...config,pageSize:20,maxPages:1},async u=>{calls.push(new URL(u));return json({data:numberedRows(20),total:70,links:{next:'/listings?page=2&limit=20'}})},now);
 assert.equal(calls.length,1);assert.equal(calls[0].searchParams.get('limit'),'20');assert.equal(result.requestCount,1);assert.equal(result.listings.length,20);assert.equal(result.total,70);assert.equal(result.truncated,true);assert.match(result.coverage,/partial/);
});

test('invalid page sizes fail before provider use and oversized responses remain bounded and partial',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return json({data:numberedRows(25),total:25,links:{next:null}})};
 for(const pageSize of [0,-1,101,20.5,NaN,'20'])await assert.rejects(fetchVehicleMarket(vehicle,{...config,pageSize},fetcher,now),failCode('configuration'));
 assert.equal(calls,0);
 const result=await fetchVehicleMarket(vehicle,{...config,pageSize:20,maxPages:1},fetcher,now);assert.equal(calls,1);assert.equal(result.listings.length,20);assert.equal(result.truncated,true);assert.match(result.coverage,/25 returned records/);
});

test('custom feeds retain their 50-row default and support an explicit bounded page size',async()=>{
 const calls=[];const custom={...config,provider:'custom',endpoint:'https://market.example/comparisons',maxPages:1};
 const fetcher=async u=>{calls.push(new URL(u));return json({listings:[],total:0})};
 await fetchVehicleMarket(vehicle,custom,fetcher,now);assert.equal(calls[0].searchParams.get('limit'),'50');
 await fetchVehicleMarket(vehicle,{...custom,pageSize:30},fetcher,now);assert.equal(calls[1].searchParams.get('limit'),'30');
});

test('two 100-row pages deduplicate all returned rows and retain unique rows from each page',async()=>{
 let calls=0;const result=await fetchVehicleMarket(vehicle,{...config,maxPages:2},async()=>{calls++;return json({data:numberedRows(100,calls===1?0:99),total:200,links:{next:calls===1?'/listings?page=2&limit=100':null}})},now);
 assert.equal(calls,2);assert.equal(result.listings.length,199);assert.equal(result.listings.at(-1).vin,'1HGCM82633A000198');assert.equal(result.rejectedCount,1);assert.equal(result.truncated,false);assert.match(result.coverage,/200 returned records across 2 request/);
});

test('a provider total smaller than its returned page never claims complete coverage',async()=>{
 const result=await fetchVehicleMarket(vehicle,{...config,maxPages:1},async()=>json({data:numberedRows(100),total:50,links:{next:null}}),now);
 assert.equal(result.listings.length,100);assert.equal(result.total,50);assert.equal(result.truncated,true);assert.match(result.coverage,/partial/);
});

test('generic request criteria and Bearer authentication work for any vehicle without putting credentials in a URL',async()=>{
 const calls=[];const fetcher=async(u,init)=>{calls.push({url:new URL(u),init});return json({data:[row()],total:1,links:{next:null}});};
 const result=await fetchVehicleMarket(vehicle,config,fetcher,now);
 assert.equal(calls[0].url.origin,'https://api.auto.dev');assert.equal(calls[0].url.pathname,'/listings');assert.equal(calls[0].url.searchParams.get('vehicle.year'),'2026');assert.equal(calls[0].url.searchParams.get('vehicle.trim'),'SEL');assert.equal(calls[0].url.searchParams.get('retailListing.miles'),'0-27730');assert.equal(calls[0].url.searchParams.get('retailListing.used'),'true');assert.equal(calls[0].url.searchParams.has('retailListing.cpo'),false);assert.equal(calls[0].url.searchParams.get('sort'),'updatedAt.desc');assert.equal(calls[0].url.searchParams.get('includeUnpriced'),'false');assert.equal(calls[0].url.searchParams.get('includes'),'total');assert.equal(calls[0].init.headers.Authorization,'Bearer '+key);assert.equal(calls[0].init.redirect,'manual');assert.equal(calls[0].url.href.includes(key),false);
 assert.equal(result.listings.length,1);assert.match(result.coverage,/normalized unique listings/);assert.equal(result.listings[0].price,25348);assert.equal(result.listings[0].scope,'provider');assert.equal(result.listings[0].url,'https://dealer.example/vehicle');assert.equal(result.listings[0].observedAt,'2026-10-20T11:00:00.000Z');assert.equal(result.listings[0].retrievedAt,'2026-10-20T17:00:00.000Z');assert.equal(result.cacheAllowed,false);assert.equal(JSON.stringify(result).includes(key),false);
 await fetchVehicleMarket({...vehicle,year:2024,make:'Mercedes-Benz',model:'GLE',trim:'450 4MATIC',condition:'New'},config,fetcher,now);
 assert.equal(calls[1].url.searchParams.get('vehicle.make'),'Mercedes-Benz');assert.equal(calls[1].url.searchParams.get('vehicle.model'),'GLE');assert.equal(calls[1].url.searchParams.get('retailListing.used'),'false');
});

test('explicit filters change the provider request rather than silently narrowing wider user criteria',async()=>{
 let url;const fetcher=async u=>{url=new URL(u);return json({data:[],total:0});};
 await fetchVehicleMarket(vehicle,{...config,maxYearDelta:2,maxMileageDelta:50000,exactTrim:false,certifiedOnly:true,radiusMiles:500,zip:'49546'},fetcher,now);
 assert.equal(url.searchParams.get('vehicle.year'),'2024-2028');assert.equal(url.searchParams.has('vehicle.trim'),false);assert.equal(url.searchParams.get('retailListing.miles'),'0-52730');assert.equal(url.searchParams.get('retailListing.cpo'),'true');assert.equal(url.searchParams.get('zip'),'49546');assert.equal(url.searchParams.get('distance'),'500');
 await fetchVehicleMarket(vehicle,{...config,maxMileageDelta:null},fetcher,now);assert.equal(url.searchParams.has('retailListing.miles'),false);assert.equal(url.searchParams.has('zip'),false);
});

test('unpriced, malformed identity, unknown condition, removed, duplicate and subject rows cannot inflate results',async()=>{
 const valid=row(),sameUrl=row({vehicle:{...row().vehicle,vin:'3VWGW7BU1TM006961'}}),own=row({vehicle:{...row().vehicle,vin:vehicle.vin}}),unknown=row({retailListing:{...row().retailListing,used:undefined}}),badYear=row({vehicle:{...row().vehicle,year:'2026'}}),badPrice=row({retailListing:{...row().retailListing,price:'25348'}}),removed=row({removedAt:'2026-10-19T00:00:00Z'});
 const rows=[valid,row(),sameUrl,own,unknown,badYear,badPrice,removed];
 const result=await fetchVehicleMarket(vehicle,config,async()=>json({data:rows,total:rows.length,links:{next:null}}),now);
 assert.equal(result.listings.length,1);assert.equal(result.rejectedCount,7);assert.equal(result.truncated,false);
});

test('unknown source observation time and certification remain unknown instead of being stamped fresh',async()=>{
 const unknown=row({updatedAt:undefined,retailListing:{...row().retailListing,cpo:undefined}});
 const result=await fetchVehicleMarket(vehicle,config,async()=>json({data:[unknown],total:1}),now);
 assert.equal(result.listings[0].observedAt,'');assert.equal(result.listings[0].providerObservedAt,null);assert.equal(result.listings[0].certified,null);assert.equal(result.fetchedAt,'2026-10-20T17:00:00.000Z');
 const future=row({updatedAt:'2026-10-21T11:00:00Z'});const dated=await fetchVehicleMarket(vehicle,config,async()=>json({data:[future],total:1}),now);assert.equal(dated.listings[0].observedAt,'');
});

test('empty successful coverage is distinguishable from malformed and failed provider responses',async()=>{
 const empty=await fetchVehicleMarket(vehicle,config,async()=>json({data:[],total:0}),now);assert.deepEqual(empty.listings,[]);assert.equal(empty.total,0);assert.equal(empty.truncated,false);assert.equal(empty.requestCount,1);
 await assert.rejects(fetchVehicleMarket(vehicle,config,async()=>json({error:'bad response '+key}),now),failCode('invalid_response'));
 await assert.rejects(fetchVehicleMarket(vehicle,config,async()=>new Response('<html>'+key),now),failCode('invalid_response'));
 await assert.rejects(fetchVehicleMarket(vehicle,config,async()=>json({},503),now),failCode('unavailable'));
});

test('provider quota, authentication and network errors contain no raw body, credential or endpoint',async()=>{
 await assert.rejects(fetchVehicleMarket(vehicle,config,async()=>json({message:key},429,{'Retry-After':'42'}),now),e=>failCode('rate_limited')(e)&&e.retryAfterSeconds===42);
 await assert.rejects(fetchVehicleMarket(vehicle,config,async()=>json({message:key},401),now),failCode('authentication'));
 await assert.rejects(fetchVehicleMarket(vehicle,config,async()=>{throw new Error('https://provider.example?token='+key);},now),e=>failCode('unavailable')(e)&&!e.message.includes('provider.example'));
});

test('pagination follows opaque same-origin cursors but stops at the two-page budget and reports partial coverage',async()=>{
 const calls=[];const fetcher=async u=>{calls.push(String(u));const second=calls.length===2;return json({data:Array.from({length:50},(_,i)=>row({vehicle:{...row().vehicle,vin:'1HGCM82633A'+String(i+(second?50:0)).padStart(6,'0')},retailListing:{...row().retailListing,vdp:'https://dealer.example/vehicle/'+(i+(second?50:0))}})),total:125,links:{next:'/listings?cursor='+ (second?'opaque-next':'opaque-first')}});};
 const result=await fetchVehicleMarket(vehicle,{...config,maxPages:10},fetcher,now);
 assert.equal(calls.length,2);assert.match(calls[1],/cursor=opaque-first/);assert.equal(result.requestCount,2);assert.equal(result.listings.length,100);assert.equal(result.total,125);assert.equal(result.truncated,true);assert.match(result.coverage,/partial/);
});

test('smaller plan-capped pages are followed using provider links and source VINs deduplicate across pages',async()=>{
 let call=0;const fetcher=async()=>{call++;return json({data:[row()],total:2,links:{next:call===1?'/listings?page=2&limit=20':null}});};
 const result=await fetchVehicleMarket(vehicle,config,fetcher,now);assert.equal(result.requestCount,2);assert.equal(result.listings.length,1);assert.equal(result.rejectedCount,1);assert.equal(result.truncated,false);
});

test('unknown provider totals never imply complete nationwide coverage',async()=>{
 const result=await fetchVehicleMarket(vehicle,config,async()=>json({data:[row()],links:{next:null}}),now);assert.equal(result.total,null);assert.equal(result.truncated,true);assert.match(result.coverage,/total unknown/);
});

test('custom provider endpoint validation rejects local destinations, credentials, query secrets and cross-origin pagination',async()=>{
 let called=false;const fetcher=async()=>{called=true;return json({listings:[],total:0});};
 for(const address of ['http://market.example/listings','https://localhost/listings','https://127.0.0.1/listings','https://10.0.0.1/listings','https://[::1]/listings','https://user:secret@market.example/listings','https://market.example/listings?api_key='+key])await assert.rejects(fetchVehicleMarket(vehicle,{...config,provider:'custom',endpoint:address},fetcher,now),failCode('configuration'));
 assert.equal(called,false);
 await assert.rejects(fetchVehicleMarket(vehicle,config,async()=>json({data:[row()],total:2,links:{next:'https://another.example/listings?page=2'}}),now),failCode('invalid_response'));
 await assert.rejects(fetchVehicleMarket(vehicle,config,async()=>json({data:[row()],total:2,links:{next:'/listings?api_key='+key}}),now),failCode('invalid_response'));
});

test('authorized custom JSON rows use explicit condition, observed source dates and preserve missing certification',async()=>{
 let request;const result=await fetchVehicleMarket(vehicle,{provider:'custom',apiKey:key,endpoint:'https://market.example/comparisons',cacheAllowed:true,maxPages:1},async(u,init)=>{request={u:new URL(u),init};return json({listings:[{vin:'3VWGW7BU1TM006961',year:2026,make:'Volkswagen',model:'Jetta',trim:'SEL',condition:'Used',price:26875,mileage:11959,observedAt:'2026-10-20T15:50:53Z',url:'https://dealer.example/vehicle?api_key='+key,dealer:key+' Dealer',state:'OH'}],total:1});},now);
 assert.equal(request.u.searchParams.get('make'),'Volkswagen');assert.equal(request.u.searchParams.get('vin'),vehicle.vin);assert.equal(request.init.headers.Authorization,'Bearer '+key);assert.equal(result.cacheAllowed,true);assert.equal(result.listings[0].certified,null);assert.equal(result.listings[0].observedAt,'2026-10-20T15:50:53.000Z');assert.equal(JSON.stringify(result).includes(key),false);
});


test('Auto.dev uses documented fields and does not infer mileage, distance or source dates from guessed paths',async()=>{
 const wrongMileage=row({vehicle:{...row().vehicle,mileage:9583,miles:9583},retailListing:{...row().retailListing,miles:undefined}});
 const invalid=await fetchVehicleMarket(vehicle,config,async()=>json({data:[wrongMileage],total:1}),now);
 assert.equal(invalid.listings.length,0);
 const unknown=row({updatedAt:undefined,distanceMiles:10,distance:10,retailListing:{...row().retailListing,updatedAt:'2026-10-20T11:00:00Z',distanceMiles:10,distance:10}});
 const result=await fetchVehicleMarket(vehicle,config,async()=>json({data:[unknown],total:1}),now);
 assert.equal(result.listings[0].distanceMiles,null);assert.equal(result.listings[0].observedAt,'');
 const utc=row({updatedAt:'2026-10-20 11:00:00'});
 const dated=await fetchVehicleMarket(vehicle,config,async()=>json({data:[utc],total:1}),now);
 assert.equal(dated.listings[0].observedAt,'2026-10-20T11:00:00.000Z');
});


test('verified Jetta mapping and operator overrides preserve subject identity',async()=>{
 let query;const subject={...vehicle,trim:'1.5T SEL'};
 const fetcher=async u=>{query=new URL(u);return json({data:[],total:0});};
 await fetchVehicleMarket(subject,config,fetcher,now);assert.ok(query.searchParams.get('vehicle.trim').split(',').includes('SEL'));
 await fetchVehicleMarket(subject,{...config,searchTrim:'SEL',searchModel:'Jetta'},fetcher,now);
 assert.ok(query.searchParams.get('vehicle.trim').split(',').includes('SEL'));assert.equal(query.searchParams.get('vehicle.model'),'Jetta');assert.equal(subject.trim,'1.5T SEL');
 await fetchVehicleMarket(subject,{...config,searchTrim:'SEL',exactTrim:false},fetcher,now);assert.equal(query.searchParams.has('vehicle.trim'),false);
 await assert.rejects(fetchVehicleMarket(subject,{...config,searchTrim:''},fetcher,now),failCode('configuration'));
});


test('custom endpoints reject the credential anywhere in their URL, including encoded path and nonstandard query names',async()=>{
 let called=false;const fetcher=async()=>{called=true;return json({listings:[],total:0})};
 const encoded=Array.from(key).map(c=>'%'+c.charCodeAt(0).toString(16)).join('');
 for(const endpoint of ['https://market.example/'+key+'/listings','https://market.example/'+encoded+'/listings','https://market.example/'+encodeURIComponent(encoded)+'/listings','https://market.example/listings?account='+key,'https://market.example/listings?account='+encoded])await assert.rejects(fetchVehicleMarket(vehicle,{...config,provider:'custom',endpoint},fetcher,now),failCode('configuration'));
 assert.equal(called,false);
});

test('Jetta website trim qualifiers map to Auto.dev SEL while keeping strict year, condition and mileage',async()=>{
 let query;await fetchVehicleMarket({...vehicle,trim:'1.5T SEL FWD'},{...config,maxPages:1},async u=>{query=new URL(u);return json({data:[row()],total:1,links:{next:null}})},now);
 assert.ok(query.searchParams.get('vehicle.trim').split(',').includes('SEL'));assert.equal(query.searchParams.get('vehicle.year'),'2026');assert.equal(query.searchParams.get('retailListing.used'),'true');assert.equal(query.searchParams.get('retailListing.miles'),'0-27730');
});

test('missing provider update date is disclosed while invalid or future dates do not gain active-response fallback',async()=>{
 for(const [updatedAt,basis] of [[undefined,'active_provider_response'],['invalid','provider_updated_at'],['2099-01-01','provider_updated_at']]){
 const r=await fetchVehicleMarket(vehicle,{...config,maxPages:1},async()=>json({data:[row({updatedAt})],total:1,links:{next:null}}),now);
 assert.equal(r.listings[0].observedAt,'');assert.equal(r.listings[0].providerObservedAt,null);assert.equal(r.listings[0].retrievedAt,new Date(now).toISOString());assert.equal(r.listings[0].observationBasis,basis);
 }
});

test('equivalent Volvo and Mercedes names expand a single request without mutating vehicle identity',async()=>{
 const queries=[];const fetcher=async u=>{queries.push(new URL(u));return json({data:[],total:0,links:{next:null}})};
 const volvo={...vehicle,make:'Volvo',model:'XC90 Recharge Plug-In Hybrid',trim:'T8 Ultra'};const before=structuredClone(volvo);
 await fetchVehicleMarket(volvo,{...config,maxPages:1},fetcher,now);
 assert.equal(queries.length,1);assert.ok(queries[0].searchParams.get('vehicle.model').split(',').includes('XC90'));assert.ok(queries[0].searchParams.get('vehicle.trim').split(',').includes('Ultra'));assert.deepEqual(volvo,before);
 await fetchVehicleMarket({...vehicle,make:'Mercedes-Benz',model:'AMG GLE 53',trim:'4MATIC'},{...config,maxPages:1},fetcher,now);
 assert.equal(queries.length,2);assert.ok(queries[1].searchParams.get('vehicle.model').split(',').includes('GLE'));assert.equal(queries[1].searchParams.has('vehicle.trim'),false);
});
test('radius is sent upstream and its scope is returned without inventing per-dealer mileage',async()=>{
 let query;const result=await fetchVehicleMarket(vehicle,{...config,maxPages:1,radiusMiles:200,zip:'49546'},async u=>{query=new URL(u);return json({data:[row()],total:1,links:{next:null}})},now);
 assert.equal(query.searchParams.get('zip'),'49546');assert.equal(query.searchParams.get('distance'),'200');assert.equal(result.requestCount,1);assert.equal(result.listings[0].distanceMiles,null);assert.equal(result.listings[0].searchRadiusMiles,200);assert.equal(result.listings[0].searchOriginZip,'49546');
 const national=await fetchVehicleMarket(vehicle,{...config,maxPages:1},async()=>json({data:[row()],total:1}),now);assert.equal(national.listings[0].searchRadiusMiles,undefined);
});

test('Wrangler model/body/trim spellings are combined in one capped provider request',async()=>{
 let query,calls=0;const subject={...vehicle,vin:'1C4HJWDGXJL929073',year:2018,make:'Jeep',model:'Wrangler JK',trim:'Unlimited Sport 4x4',mileage:124617};const original=structuredClone(subject);
 await fetchVehicleMarket(subject,{...config,maxPages:1,pageSize:20},async u=>{calls++;query=new URL(u);return json({data:[],total:0,links:{next:null}})},now);
 assert.equal(calls,1);assert.ok(query.searchParams.get('vehicle.model').split(',').includes('Wrangler'));assert.ok(query.searchParams.get('vehicle.model').split(',').includes('Wrangler JK Unlimited'));assert.ok(query.searchParams.get('vehicle.trim').split(',').includes('Unlimited Sport'));assert.ok(query.searchParams.get('vehicle.trim').split(',').includes('Sport'));assert.equal(query.searchParams.get('vehicle.year'),'2018');assert.equal(query.searchParams.get('retailListing.miles'),'99617-149617');assert.deepEqual(subject,original);
});
