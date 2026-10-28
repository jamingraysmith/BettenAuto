import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
// Exercise the real component effects with controlled hooks and HTTP responses.
let slots=[],index=0,effects=[],requests=[],dirty=false;
const hooks={
 useState(initial){const i=index++;slots[i]??={value:initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;dirty=true}]},
 useRef(initial){const i=index++;return slots[i]??=( {current:initial})},
 useMemo(fn){index++;return fn()},
 useEffect(fn,deps){const i=index++,previous=slots[i];if(!previous||deps.some((v,n)=>!Object.is(v,previous.deps[n]))){effects.push(()=>{previous?.cleanup?.();slots[i]={deps,cleanup:fn()}})}}
};
globalThis.__openingHooks=hooks;
let source=readFileSync(new URL('../app/live-market.tsx',import.meta.url),'utf8')
 .replace(/import \{useEffect,useMemo,useRef,useState\} from 'react';/,"const {useEffect,useMemo,useRef,useState}=globalThis.__openingHooks;const React={createElement:()=>null};")
 .replace(/import \{[^}]+\} from 'lucide-react';/,"const CircleHelp=0,Database=0,ExternalLink=0,LoaderCircle=0,RefreshCw=0,TrendingUp=0;")
 .replace(/import \{matchComparables,samplePricing\} from '[^']+';/,"const matchComparables=()=>({matched:[],excluded:{}}),samplePricing=()=>({percentOfAverage:null});")
 .replace(/import ClassicPricing from '[^']+';/,"const ClassicPricing=()=>null;")
 .replace(/import \{money,type Vehicle\} from '[^']+';/,"const money=()=>'';");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const {LiveMarket}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const vehicle={vin:'3VWGW7BU6TM020418',year:2026,make:'Volkswagen',model:'Jetta',trim:'SEL',mileage:3000,condition:'Used'};
async function render(props){index=0;effects=[];dirty=false;LiveMarket(props);for(const effect of effects)effect();await wait(0);if(dirty){index=0;effects=[];dirty=false;LiveMarket(props);for(const effect of effects)effect()}}
function cleanup(){for(const s of slots)s?.cleanup?.();slots=[]}
test('opening sends one request; rerenders, filters and allowance changes never auto-retry; appraisal stays manual',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{if(url==='/api/live-market'){requests.push(JSON.parse(init.body));return Response.json({listings:[],fetchedAt:new Date().toISOString()})}return Response.json({status:'connected',provider:'autodev',remainingToday:1000,remainingThisMonth:1000,maxPages:1})};
 try{
  let props={vehicle,inventoryVehicle:true,autoLookup:true};await render(props);await wait(300);await render(props);assert.equal(requests.length,1);assert.equal(requests[0].vin,vehicle.vin);
  props={...props,vehicle:{...vehicle,price:30000},options:{maxYearDelta:1}};await render(props);await wait(300);await render(props);assert.equal(requests.length,1);
  cleanup();await render({vehicle,inventoryVehicle:false});await wait(300);assert.equal(requests.length,1);
  cleanup();await render({vehicle,inventoryVehicle:true,autoLookup:true});cleanup();await wait(300);assert.equal(requests.length,1,'unmount before timer must cancel request');
  await render({vehicle,inventoryVehicle:true,autoLookup:true});await wait(300);assert.equal(requests.length,2,'reopening intentionally sends a fresh request');
 }finally{cleanup();globalThis.fetch=original}
});
