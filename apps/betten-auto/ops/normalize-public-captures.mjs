/** Normalize verified browser captures. No network, credentials or seed writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const national=JSON.parse(await fs.readFile(new URL('../lib/public-market-national-sources.json',import.meta.url),'utf8'));
const registryCode=(await fs.readFile(new URL('../lib/public-market-sources.ts',import.meta.url),'utf8')).replace(/^import nationalSources from '\.\/public-market-national-sources\.json';\s*/m,'const nationalSources='+JSON.stringify(national)+';\n');
const {publicMarketSources}=await import(moduleUrl(registryCode));
const {parsePublicInventory}=await import(moduleUrl(await fs.readFile(new URL('../lib/public-market-parser.ts',import.meta.url),'utf8')));
export const captureSources=publicMarketSources;

class CaptureError extends Error {constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new CaptureError(code);};
const integer=value=>value!==null&&value!==undefined&&value!==''&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
const provenance=listing=>({publicSourceId:listing.publicSourceId,source:listing.source,dealer:listing.dealer,url:listing.url,sourceUrl:listing.sourceUrl,condition:listing.condition,price:listing.price??null,pricingBasis:listing.pricingBasis,preFeePrice:listing.preFeePrice??null,feeComponent:listing.feeComponent??null,observedAt:listing.observedAt});
function safeUrl(value,source,base=source.url){
 if(typeof value!=='string'||!value.trim())fail('invalid_page_url');
 let url;try{url=new URL(value,base);}catch{fail('invalid_page_url');}
 const configured=new URL(source.url);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.origin!==configured.origin||url.pathname!==configured.pathname)fail('unsafe_pagination');
 return url.href;
}
function observation(value,now){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+00:00)$/.test(value))fail('invalid_observation');
 const stamp=Date.parse(value);if(!Number.isFinite(stamp)||stamp>now)fail('invalid_observation');
 return new Date(stamp).toISOString();
}
function renderedPage(capture){
 if(capture.WIS&&typeof capture.WIS==='object'){
  const json=JSON.stringify({WIS:capture.WIS}).replace(/</g,'\\u003c');
  const href=typeof capture.nextHref==='string'?capture.nextHref.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'):'';
  return {wis:capture.WIS,html:"<script>\nDDC.WS.state['ws-inv-data']['browser'] = "+json+";\n</script>"+(href?'<a aria-label="Go to next page" href="'+href+'">Next</a>':'')};
 }
 const html=Array.isArray(capture.htmlParts)&&capture.htmlParts.length&&capture.htmlParts.every(part=>typeof part==='string')?capture.htmlParts.join(''):capture.html;
 if(typeof html!=='string'||!html.trim())fail('invalid_capture');
 if(/\[truncated\b/i.test(html))fail('clipped_capture');
 const matches=[...html.matchAll(/^\s*DDC\.WS\.state\['ws-inv-data'\]\['[^']+'\]\s*=\s*(\{.*\});?\s*$/gm)];
 let wis;if(matches.length){if(matches.length!==1)fail('invalid_capture');try{wis=JSON.parse(matches[0][1]).WIS;}catch{fail('invalid_capture');}}
 return {wis,html};
}

/** Validate one complete source before returning any of its listing records. */
export function normalizeCapturedSource(source,captures,{now=Date.now()}={}){
 if(!Number.isFinite(now)||!Array.isArray(captures)||!captures.length||captures.length>100)fail('invalid_capture_count');
 const byUrl=new Map(),days=new Set();
 for(const capture of captures){
  if(!capture||typeof capture!=='object'||Array.isArray(capture))fail('invalid_capture');
  const url=safeUrl(capture.url,source),observedAt=observation(capture.observedAt,now);
  if(byUrl.has(url))fail('duplicate_page');
  days.add(observedAt.slice(0,10));byUrl.set(url,{capture,observedAt});
 }
 if(days.size!==1)fail('mixed_observation_days');
 // Require the exact reviewed starting URL, rather than accepting a filtered subset.
 if(!captures.some(capture=>capture.url===source.url)||!byUrl.has(source.url))fail('missing_first_page');
 const listings=new Map(),pages=[],visited=new Set();let url=source.url,expectedCount=null,lastObservation=-Infinity,ddc=false,expectedStart=0;
 while(url){
  if(visited.has(url))fail('pagination_loop');
  const saved=byUrl.get(url);if(!saved)fail('missing_page');
  visited.add(url);const {capture,observedAt}=saved,stamp=Date.parse(observedAt);
  if(stamp<lastObservation)fail('observation_order');lastObservation=stamp;
  const {wis,html}=renderedPage(capture),page=parsePublicInventory(html,url,source,observedAt),total=integer(page.expectedCount);
  if(total===null||total>100000)fail('invalid_source_total');
  if(expectedCount!==null&&expectedCount!==total)fail('changing_total');expectedCount=total;
  if(wis){
   if(pages.length&&!ddc)fail('changing_source_format');ddc=true;
   const start=integer(wis.pageInfo?.pageStart),size=integer(wis.pageInfo?.pageSize);
   if(start!==expectedStart||size===null||size<1||!Array.isArray(wis.inventory)||wis.inventory.length!==Math.max(0,Math.min(size,total-start)))fail('noncontiguous_pages');
   expectedStart=start+size;
  }else if(ddc||source.kind==='dealercom')fail('changing_source_format');
  for(const listing of page.listings){if(listings.has(listing.vin))fail('duplicate_vin');listings.set(listing.vin,listing);}
  let next=page.next?safeUrl(page.next,source,url):null;
  if(capture.nextHref!==null&&capture.nextHref!==undefined&&capture.nextHref!==''){
   const observedNext=safeUrl(capture.nextHref,source,url);if(next&&next!==observedNext)fail('conflicting_next_page');next=observedNext;
  }
  pages.push({url,observedAt,count:page.listings.length,expectedCount:total,...(wis?{pageStart:integer(wis.pageInfo.pageStart),pageSize:integer(wis.pageInfo.pageSize)}:{})});
  if(listings.size>total)fail('source_total_mismatch');
  // Terminal pages must not claim more pages; unvisited saved pages are rejected too.
  if(listings.size===total&&next)fail('unexpected_next_page');
  if(listings.size<total&&!next)fail('incomplete_snapshot');
  url=next;
 }
 if(visited.size!==byUrl.size)fail('unreachable_capture');
 if(expectedCount===null||listings.size!==expectedCount)fail('source_total_mismatch');
 const all=[...listings.values()],wholesale=all.filter(listing=>listing.condition==='Wholesale'),retail=all.filter(listing=>listing.condition!=='Wholesale');
 return {listings:retail,report:{id:source.id,name:source.name,url:source.url,scope:source.scope,condition:source.condition,status:'verified',complete:true,expectedCount,uniqueCount:all.length,retailCount:retail.length,wholesaleExcluded:wholesale.length,pricedCount:retail.filter(listing=>typeof listing.price==='number'&&listing.price>0).length,pages}};
}

export async function normalizeCaptureDirectory(directory,{now=Date.now(),sources=captureSources}={}){
 if(!path.isAbsolute(directory))fail('absolute_capture_directory_required');
 const entries=await fs.readdir(directory,{withFileTypes:true}),registry=new Map(sources.map(source=>[source.id,source])),reports=[],merged=new Map();
 for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
  if(!entry.isDirectory()&&!entry.isSymbolicLink())continue;
  const source=registry.get(entry.name);let result;
  try{
   if(!source||!/^[a-z0-9-]{1,80}$/.test(entry.name))fail('unknown_source');
   if(entry.isSymbolicLink())fail('symlink_capture');
   const files=(await fs.readdir(path.join(directory,entry.name),{withFileTypes:true})).filter(file=>file.name.endsWith('.json'));
   if(!files.length||files.length>100)fail('invalid_capture_count');
   const captures=[];
   for(const file of files){
    if(!file.isFile()||!/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(file.name))fail('unsafe_capture_file');
    const filename=path.join(directory,entry.name,file.name),stats=await fs.stat(filename);if(stats.size>16000000)fail('capture_too_large');
    try{captures.push(JSON.parse(await fs.readFile(filename,'utf8')));}catch{fail('invalid_capture_json');}
   }
   result=normalizeCapturedSource(source,captures,{now});reports.push(result.report);
  }catch(error){reports.push({id:entry.name,name:source?.name,url:source?.url,status:'failed',complete:false,error:typeof error?.code==='string'&&/^[a-z_]+$/.test(error.code)?error.code:'unverified_capture',previousDataUntouched:true,requiresPreviousSnapshot:true});continue;}
  for(const listing of result.listings){
   const prior=merged.get(listing.vin),sourceListings=[...(prior?.sourceListings||[]),provenance(listing)],latest=!prior||Date.parse(listing.observedAt)>Date.parse(prior.observedAt)?listing:prior;
   merged.set(listing.vin,{...latest,sourceListings});
  }
 }
 if(!reports.length)fail('no_source_directories');
 const comparables=[...merged.values()].sort((a,b)=>a.vin.localeCompare(b.vin)),failed=reports.filter(report=>report.status==='failed');
 return {comparables,report:{generatedAt:new Date(now).toISOString(),mode:'verified_browser_captures',complete:false,allCapturedSourcesVerified:failed.length===0,configuredSourceCount:sources.length,capturedSourceCount:reports.length,verifiedSourceCount:reports.length-failed.length,failedSourceCount:failed.length,uniqueComparables:comparables.length,sources:reports,limitations:['Only complete verified captured sources are included. This output alone is not a complete aggregate of all configured market sources.','Failed sources are excluded here; retain their previous complete dataset and original observation dates when combining for import.','Wholesale records are counted in source completeness but excluded from comparison output. No network requests or provider calls were made.']}};
}

async function main(){
 const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--dir'||args[2]!=='--out'||!path.isAbsolute(args[1])||!path.isAbsolute(args[3]))throw new Error('Use --dir <absolute-capture-directory> --out <new-absolute-output-directory>.');
 const directory=path.resolve(args[1]),output=path.resolve(args[3]);if(output===directory||output.startsWith(directory+path.sep))throw new Error('The output directory must be separate from the capture directory.');
 const normalized=await normalizeCaptureDirectory(directory);await fs.mkdir(output,{recursive:true});
 const names=['normalized-comparables.json','source-report.json'];
 for(const name of names){try{await fs.lstat(path.join(output,name));throw new Error('Output already exists; choose a new output directory.');}catch(error){if(error.code!=='ENOENT')throw error;}}
 await fs.writeFile(path.join(output,names[0]),JSON.stringify(normalized.comparables,null,2),{flag:'wx'});
 await fs.writeFile(path.join(output,names[1]),JSON.stringify(normalized.report,null,2),{flag:'wx'});
 console.log(JSON.stringify({status:normalized.report.failedSourceCount?'partial':'verified_captured_sources',verifiedSources:normalized.report.verifiedSourceCount,failedSources:normalized.report.failedSourceCount,uniqueComparables:normalized.comparables.length,output}));
 if(normalized.report.failedSourceCount)process.exitCode=2;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error.message);process.exitCode=1;});
