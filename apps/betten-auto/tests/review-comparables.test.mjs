import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText).toString('base64');
const pricingUrl=moduleUrl(read('../lib/pricing.ts'));
const reviewUrl=moduleUrl(read('../lib/review-comparables.ts').replace("from './pricing'",`from '${pricingUrl}'`));
const {matchComparables,samplePricing}=await import(pricingUrl);
const {reviewComparables}=await import(reviewUrl);
const componentSource=read('../app/review-comparables.tsx').replace("from '../lib/types'",`from '${moduleUrl(read('../lib/types.ts'))}'`).replace("from '../lib/review-comparables'",`from '${reviewUrl}'`).replace("from 'lucide-react'",`from '${import.meta.resolve('lucide-react')}'`);
const componentCode=ts.transpileModule(componentSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace('from "react/jsx-runtime"',`from '${import.meta.resolve('react/jsx-runtime')}'`);
const {default:ReviewComparables}=await import('data:text/javascript;base64,'+Buffer.from(componentCode).toString('base64'));

const now=Date.parse('2026-10-21T14:00:00Z'),options={now,certifiedOnly:true};
const vehicle={vin:'SUBJECT',year:2026,make:'Volkswagen',model:'Jetta',trim:'1.5T SEL',condition:'Used',mileage:10000,price:28000};
const listing=(vin,changes={})=>({vin,year:2026,make:'Volkswagen',model:'Jetta',trim:'SEL FWD',condition:'Used',mileage:15000,price:27000,certified:true,observedAt:'2026-10-21T13:00:00Z',...changes});

test('review keeps strict matches and every pricing result unchanged while exposing flagged related listings',()=>{
 const listings=[listing('strict-a',{price:26000}),listing('trim',{trim:'Sport',price:1}),listing('missing-miles',{mileage:null,price:999999}),listing('unknown-cert',{certified:null}),listing('strict-b',{price:28000}),listing('strict-c',{price:30000})];
 const before=matchComparables(vehicle,listings,options),stats=samplePricing(vehicle,before.matched),snapshot=structuredClone(listings),filters={...options};
 const review=reviewComparables(vehicle,listings,options);
 assert.deepEqual(review.map(c=>c.listing.vin),['trim','missing-miles','unknown-cert']);
 assert.deepEqual(matchComparables(vehicle,listings,options),before);assert.deepEqual(samplePricing(vehicle,before.matched),stats);
 assert.equal(stats.average,28000);assert.equal(stats.percentOfAverage,100);assert.equal(stats.count,3);
 assert.deepEqual(listings,snapshot);assert.deepEqual(options,filters);
});

test('review explains incomplete versus different trim, unknown mileage and certification separately',()=>{
 const review=reviewComparables(vehicle,[listing('different',{trim:'Sport'}),listing('incomplete',{trim:''}),listing('unknown',{trim:'',mileage:null,certified:null}),listing('not-certified',{certified:false}),listing('label-certified',{trim:'Sport',condition:'Certified',certified:null})],options);
 assert.deepEqual(review.map(c=>c.reasons),[['Trim differs'],['Trim incomplete'],['Trim incomplete','Mileage unknown','Certification unconfirmed'],['Not advertised certified'],['Trim differs']]);
 assert.deepEqual(reviewComparables({...vehicle,trim:''},[listing('subject-incomplete')],options)[0].reasons,['Trim incomplete']);
 assert.deepEqual(reviewComparables({...vehicle,mileage:null},[listing('subject-unknown')],options)[0].reasons,['Mileage unknown']);
});

test('review enforces price, condition, year, freshness, scope, radius and known mileage limits',()=>{
 const related=changes=>listing(changes.vin,{trim:'Sport',scope:'expanded',distanceMiles:30,...changes});
 const listings=[related({vin:'valid'}),related({vin:'no-price',price:null}),related({vin:'zero-price',price:0}),related({vin:'invalid-price',price:'unknown'}),related({vin:'new',condition:'New'}),related({vin:'condition-unknown',condition:''}),related({vin:'older',year:2025}),related({vin:'stale',observedAt:'2026-10-01T13:00:00Z'}),related({vin:'future',observedAt:'2026-10-22T13:00:00Z'}),related({vin:'undated',observedAt:''}),related({vin:'regional',scope:'regional'}),related({vin:'far',distanceMiles:500}),related({vin:'distance-unknown',distanceMiles:null}),related({vin:'too-many-miles',mileage:35001}),related({vin:'unknown-miles',mileage:null})];
 assert.deepEqual(reviewComparables(vehicle,listings,{...options,marketScope:'expanded',radiusMiles:100}).map(c=>c.listing.vin),['valid','unknown-miles']);
 assert.equal(reviewComparables(vehicle,[related({vin:'boundary',mileage:35000})],options).length,1);
 assert.equal(reviewComparables(vehicle,[related({vin:'older',year:2025})],{...options,maxYearDelta:1}).length,1);
 assert.equal(reviewComparables(vehicle,[related({vin:'expanded'})],{...options,marketScope:'regional'}).length,0);
});

test('review never relaxes make, model or body/powertrain variant eligibility',()=>{
 const mercedes={...vehicle,make:'Mercedes-Benz',model:'GLE 450',trim:'4MATIC',bodyStyle:'SUV'};
 const candidates=[listing('wrong-make',{make:'Honda',trim:''}),listing('wrong-model',{model:'Tiguan',trim:''})];
 assert.deepEqual(reviewComparables(vehicle,candidates,options),[]);
 assert.deepEqual(reviewComparables(mercedes,[{...mercedes,vin:'coupe',trim:'GLE 450 Coupe 4MATIC',price:27000,observedAt:'2026-10-21T13:00:00Z',mileage:null}],options),[]);
 const ev={...mercedes,model:'EQE',trim:'500 4MATIC'};
 assert.deepEqual(reviewComparables(ev,[{...ev,vin:'other-engine',trim:'350 4MATIC',price:27000,observedAt:'2026-10-21T13:00:00Z',mileage:null}],options),[]);
 assert.deepEqual(reviewComparables({...ev,trim:''},[{...ev,vin:'unknown-engine',trim:'',price:27000,observedAt:'2026-10-21T13:00:00Z',mileage:null}],options),[]);
});
test('read-only candidates also exclude contradictory known engines, fuel and drivetrain records',()=>{
 const target={...vehicle,model:'Atlas',trim:'SE',engine:'2.0L TSI',fuelType:'Gasoline',drivetrain:'AWD'};
 const related=changes=>listing(changes.vin,{model:'Atlas',trim:'SEL',engine:'2.0L Turbo',fuelType:'Gasoline',drivetrain:'AWD',mileage:null,...changes});
 const candidates=[related({vin:'valid'}),related({vin:'wrong-liter',engine:'3.6L V6'}),related({vin:'conflicting-liter',trim:'3.6L SEL',engine:'2.0L Turbo'}),related({vin:'diesel',engine:'2.0L Diesel',fuelType:'Diesel'}),related({vin:'electric',engine:'Electric Motor',fuelType:'Electric'}),related({vin:'drive-conflict',trim:'SEL FWD',drivetrain:'AWD'})];
 assert.deepEqual(reviewComparables(target,candidates,options).map(row=>row.listing.vin),['valid']);
 assert.equal(reviewComparables({...target,trim:'SE FWD'},[candidates[0]],options).length,0);
});
test('retained old or invalid essential metadata is review-only and is flagged for a fresh recheck',()=>{
 const listings=[listing('old-mileage',{mileageObservedAt:'2026-10-01T13:00:00Z'}),listing('invalid-cert',{certifiedObservedAt:'invalid'}),listing('fresh-meta',{mileageObservedAt:'2026-10-21T13:00:00Z',certifiedObservedAt:'2026-10-21T13:00:00Z'})];
 const reviews=reviewComparables(vehicle,listings,options);assert.deepEqual(reviews.map(row=>row.listing.vin),['old-mileage','invalid-cert']);assert.deepEqual(reviews.map(row=>row.reasons),[['Mileage needs recheck'],['Certification needs recheck']]);
 assert.deepEqual(matchComparables(vehicle,listings,options).matched.map(row=>row.vin),['fresh-meta']);
 assert.deepEqual(reviewComparables(vehicle,listings,{...options,maxMileageDelta:null,certifiedOnly:false}),[]);
});

test('VIN and canonical URL aliases dedupe review rows and exclude aliases of strict matches and the subject',()=>{
 const listings=[listing('review',{trim:'Sport',url:'https://dealer.example/review/?utm_source=inventory#photos'}),listing('',{trim:'',url:'https://dealer.example/review?fbclid=tracking'}),listing('REVIEW',{mileage:null,url:'https://dealer.example/review-alias'}),listing('',{mileage:null,url:'https://dealer.example/review-alias/'}),listing('strict',{url:'https://dealer.example/strict'}),listing('strict',{trim:'Sport',url:'https://dealer.example/strict-alias'}),listing('',{trim:'Sport',url:'https://dealer.example/strict-alias/'}),listing('subject',{trim:'Sport',url:'https://dealer.example/subject'}),listing('',{trim:'Sport',url:'https://dealer.example/subject/'}),listing('second',{trim:'Sport',url:'https://dealer.example/vehicle?listingId=two'}),listing('third',{trim:'Sport',url:'https://dealer.example/vehicle?listingId=three'})];
 assert.deepEqual(reviewComparables(vehicle,listings,options).map(c=>c.listing.vin),['review','second','third']);
});

test('explicitly broad filters do not create review flags for details already allowed in strict matching',()=>{
 const listings=[listing('sport',{trim:'Sport'}),listing('not-certified',{certified:false})];
 assert.equal(reviewComparables(vehicle,listings,{...options,exactTrim:false,certifiedOnly:false}).length,0);
 assert.equal(reviewComparables(vehicle,[listing('missing-miles',{trim:'Sport',mileage:null})],{...options,exactTrim:false,certifiedOnly:false}).length,1);
});

test('the shared review panel starts collapsed, labels ineligibility and offers only safe source links',()=>{
 const markup=renderToStaticMarkup(createElement(ReviewComparables,{vehicle,listings:[listing('review',{trim:'Sport',mileage:null,price:1,url:'https://dealer.example/review'}),listing('unsafe',{trim:'',certified:null,url:'javascript:alert(1)'})],options}));
 assert.match(markup,/Related listings requiring review \(2\)/);assert.match(markup,/<details[^>]*>/);assert.doesNotMatch(markup,/<details[^>]*\bopen(?:=|\s|>)/);
 assert.match(markup,/not included in the sample average, median, price percentage, rank or price suggestions/);
 assert.match(markup,/Trim differs · Mileage unknown/);assert.match(markup,/Trim incomplete · Certification unconfirmed/);
 assert.match(markup,/Observed Oct 21, 2026/);assert.match(markup,/href="https:\/\/dealer.example\/review"/);assert.doesNotMatch(markup,/javascript:|<button|<input|<select/);
});
