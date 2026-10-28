/** Assemble saved public observations. No network, credentials or seed writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {captureSources} from './normalize-public-captures.mjs';

const legacy={
 crown:{id:'browser-crown-used',url:'https://www.crownvolkswagen.com/used-inventory/index.htm'},
 'volvo-kalamazoo':{id:'browser-volvo-kalamazoo-used',url:'https://www.volvocarskalamazoo.com/used-inventory/index.htm'},
 'mercedes-kalamazoo':{id:'browser-mercedes-kalamazoo-used',url:'https://www.mercedesbenzofkalamazoo.com/used-inventory/index.htm'},
};
const vinPattern=/^[A-HJ-NPR-Z0-9]{17}$/,integer=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const wholesale=row=>row?.wholesaleSource===true||/^wholesale$/i.test(String(row?.condition));
function officialPath(value){try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return '';return url.origin+url.pathname.replace(/\/+$/,'');}catch{return '';}}
const belongs=(row,source)=>row?.publicSourceId===source.id||!!officialPath(row?.sourceUrl)&&officialPath(row.sourceUrl)===officialPath(source.url);
const observed=(value,now)=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now;
function validListing(row,now){
 if(!row||!vinPattern.test(row.vin||'')||!observed(row.observedAt,now)||!officialPath(row.url)||!row.make||!row.model||!integer(Number(row.year))||Number(row.year)<1886||Number(row.year)>2100||!/^new$|used|pre.?owned|certified|^wholesale$/i.test(String(row.condition)))throw new Error('Invalid public listing identity or observation.');
 if(row.price!==null&&row.price!==undefined&&(typeof row.price!=='number'||!Number.isFinite(row.price)||row.price<=0))throw new Error('Invalid public asking price.');
 if(row.mileage!==null&&row.mileage!==undefined&&(typeof row.mileage!=='number'||!Number.isFinite(row.mileage)||row.mileage<0))throw new Error('Invalid public mileage.');
}
function proof(row){
 const result={};for(const field of ['publicSourceId','source','dealer','url','sourceUrl','condition','price','observedAt','pricingBasis','preFeePrice','feeComponent','city','state'])if(row[field]!==undefined&&row[field]!==null&&['string','number','boolean'].includes(typeof row[field]))result[field]=row[field];
 if(result.price===undefined)result.price=null;return result;
}
function provenance(row,now){return [...(Array.isArray(row.sourceListings)?row.sourceListings:[]),row].filter(item=>item&&observed(item.observedAt,now)&&officialPath(item.url)&&!wholesale(item)).map(item=>proof(item.url===row.url?{...item,publicSourceId:item.publicSourceId||row.publicSourceId,sourceUrl:item.sourceUrl||row.sourceUrl}:item));}
function reportSources(report){
 if(Array.isArray(report))return report.map(item=>({...item,...legacy[item.source],legacy:true,id:legacy[item.source]?.id,expectedCount:item.total,uniqueCount:item.uniqueVINs,wholesaleExcluded:item.wholesale,retailCount:integer(item.total)&&integer(item.wholesale)?item.total-item.wholesale:undefined}));
 if(!report||!Array.isArray(report.sources))throw new Error('A bundle needs a source report.');return report.sources.map(item=>({...item,legacy:false}));
}
function verifySource(source,rows,now,registry){
 if(source.complete!==true||source.status&&source.status!=='verified')throw new Error('source_not_complete');
 if(!source.id||!officialPath(source.url))throw new Error('unrecognized_source');
 if(!source.legacy){const configured=registry.get(source.id);if(!configured||configured.url!==source.url)throw new Error('unrecognized_source');}
 if(!integer(source.expectedCount)||source.uniqueCount!==source.expectedCount||!integer(source.wholesaleExcluded||0)||!integer(source.retailCount)||source.retailCount+(source.wholesaleExcluded||0)!==source.expectedCount||!Array.isArray(source.pages)||!source.pages.length||source.pages.length>100)throw new Error('invalid_source_counts');
 let count=0,cutoff=0;const pageUrls=new Set();
 for(const page of source.pages){if(officialPath(page.url)!==officialPath(source.url)||pageUrls.has(page.url)||!integer(page.count)||page.expectedCount!==source.expectedCount||!observed(page.observedAt,now))throw new Error('invalid_source_pages');pageUrls.add(page.url);count+=page.count;cutoff=Math.max(cutoff,Date.parse(page.observedAt));}
 if(count!==source.expectedCount)throw new Error('source_page_count_mismatch');
 const members=[];for(const row of rows){const proofs=provenance(row,now),matching=belongs(row,source)||proofs.some(item=>belongs(item,source));if(matching){validListing(row,now);members.push(row);}}
 const retailVins=new Set(members.filter(row=>!wholesale(row)).map(row=>row.vin)),wholeVins=new Set(members.filter(wholesale).map(row=>row.vin));
 if(retailVins.size!==source.retailCount||source.legacy&&wholeVins.size!==(source.wholesaleExcluded||0)||!source.legacy&&wholeVins.size&&wholeVins.size!==(source.wholesaleExcluded||0))throw new Error('source_vin_count_mismatch');
 return {...source,cutoff,members:members.filter(row=>!wholesale(row))};
}

/** Preserve base sources unless a complete verified replacement proves retirement. */
export function assembleMarketSnapshot(base,bundles=[],expanded=[],{now=Date.now(),sources=captureSources}={}){
 if(!Number.isFinite(now)||!Array.isArray(base)||!Array.isArray(bundles)||!Array.isArray(expanded))throw new Error('Supply arrays of saved public observations.');
 for(const row of [...base,...expanded])validListing(row,now);
 const registry=new Map(sources.map(source=>[source.id,source])),replacements=new Map(),sourceReports=[];
 for(const bundle of bundles){
  if(!bundle||!Array.isArray(bundle.comparables))throw new Error('Invalid normalized bundle.');
  for(const source of reportSources(bundle.report)){
   try{
    const verified=verifySource(source,bundle.comparables,now,registry),prior=replacements.get(source.id);
    if(!prior||verified.cutoff>prior.cutoff)replacements.set(source.id,verified);
    sourceReports.push({id:source.id,url:source.url,status:'verified',expectedCount:source.expectedCount,retailCount:source.retailCount,wholesaleExcluded:source.wholesaleExcluded||0,observedAt:new Date(verified.cutoff).toISOString()});
   }catch(error){sourceReports.push({id:source.id||source.source||'unknown',url:source.url,status:'preserved_previous',error:/^[a-z_]+$/.test(error.message)?error.message:'invalid_source_listing'});}
  }
 }
 let retired=0,provenanceTrimmed=0,retainedAlternateObservations=0;
 const wholesaleExcluded=new Set([...base,...expanded,...bundles.flatMap(bundle=>bundle.comparables)].filter(wholesale).map(row=>row.vin)).size,candidates=[],history=new Map(),replacementVINs=new Set([...replacements.values()].flatMap(source=>source.members.map(row=>row.vin)));
 for(const row of base){
  if(wholesale(row))continue;
  const replacement=[...replacements.values()].find(source=>belongs(row,source));
  if(replacement&&Date.parse(row.observedAt)<=replacement.cutoff){
   retired++;history.set(row.vin,[...(history.get(row.vin)||[]),...provenance(row,now)]);
   if(!replacementVINs.has(row.vin))for(const item of provenance(row,now)){
    if([...replacements.values()].some(source=>belongs(item,source)&&Date.parse(item.observedAt)<=source.cutoff))continue;
    // A different saved dealer observation may survive retirement of the
    // selected primary source. Its price/date survive; undocumented specs do not.
    const configured=registry.get(item.publicSourceId),fallback={vin:row.vin,year:row.year,make:row.make,model:row.model,trim:'',condition:item.condition||row.condition,mileage:null,certified:null,scope:configured?.scope||row.scope,...item,publicListing:true};
    candidates.push(fallback);retainedAlternateObservations++;
   }
   continue;
  }
  candidates.push(row);
 }
 for(const replacement of replacements.values())candidates.push(...replacement.members);
 candidates.push(...expanded.filter(row=>!wholesale(row)));
 const merged=new Map();
 for(const row of candidates){
  validListing(row,now);const prior=merged.get(row.vin),latest=!prior||Date.parse(row.observedAt)>Date.parse(prior.observedAt)?row:prior,byProof=new Map();
  for(const item of [...(history.get(row.vin)||[]),...(prior?.sourceListings||[]),...provenance(row,now)])byProof.set([item.publicSourceId||'',item.sourceUrl||'',item.url,item.observedAt].join('|'),item);
  const sourceListings=[...byProof.values()].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));if(sourceListings.length>30)provenanceTrimmed+=sourceListings.length-30;
  merged.set(row.vin,{...latest,publicListing:true,sourceListings:sourceListings.slice(-30)});
 }
 const comparables=[...merged.values()].sort((a,b)=>a.vin.localeCompare(b.vin)),coverage=new Map();
 for(const row of comparables)for(const item of provenance(row,now)){const identity=item.publicSourceId||officialPath(item.sourceUrl)||officialPath(item.url);if(!coverage.has(identity))coverage.set(identity,new Set());coverage.get(identity).add(row.vin);}
 return {comparables,report:{mode:'complete_selected_source_aggregate',complete:true,completeNationalCoverage:false,generatedAt:new Date(now).toISOString(),baseUniqueVINs:new Set(base.map(row=>row.vin)).size,uniqueVehicles:comparables.length,retailVehicles:comparables.length,newVehicles:comparables.filter(row=>/^new$/i.test(row.condition)).length,usedVehicles:comparables.filter(row=>!/^new$/i.test(row.condition)).length,pricedVehicles:comparables.filter(row=>typeof row.price==='number'&&row.price>0).length,retiredBaseRows:retired,retainedAlternateObservations,wholesaleExcluded,expandedInputCount:expanded.length,verifiedReplacementSources:replacements.size,preservedFailedSources:sourceReports.filter(source=>source.status==='preserved_previous').length,provenanceTrimmed,sources:sourceReports,retainedSourceCoverage:[...coverage].map(([id,vins])=>({id,uniqueVINs:vins.size})),limitations:['Complete aggregate of the supplied saved base, verified source replacements and expanded sample; not complete national market coverage.','Failed and unselected sources retain their original saved observations. Source listing times are never reset to assembly time.','An alternate saved observation whose full specifications were not retained keeps its price/date with unknown comparison metadata.','Asking prices, fees and incentive basis remain source observations. Wholesale comparisons are excluded.','Source provenance keeps at most the latest 30 observations per VIN, matching the application record limit. No network requests or paid provider calls were made.']}};
}

async function readArray(filename){if(!path.isAbsolute(filename))throw new Error('Input file paths must be absolute.');const value=JSON.parse(await fs.readFile(filename,'utf8'));if(!Array.isArray(value))throw new Error('Comparison files must contain an array.');return value;}
async function main(){
 const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--config'||args[2]!=='--out'||!path.isAbsolute(args[1])||!path.isAbsolute(args[3]))throw new Error('Use --config <absolute-config.json> --out <new-absolute-output-directory>.');
 const config=JSON.parse(await fs.readFile(args[1],'utf8'));if(!config.base||!Array.isArray(config.bundles))throw new Error('Config needs base, bundles [{comparables,report}] and optional expanded paths.');
 const base=await readArray(config.base),bundles=[];for(const bundle of config.bundles){if(!path.isAbsolute(bundle.report))throw new Error('Report paths must be absolute.');bundles.push({comparables:await readArray(bundle.comparables),report:JSON.parse(await fs.readFile(bundle.report,'utf8'))});}
 const result=assembleMarketSnapshot(base,bundles,config.expanded?await readArray(config.expanded):[]),output=path.resolve(args[3]);await fs.mkdir(output,{recursive:true});
 for(const name of ['comparables.json','source-report.json']){try{await fs.lstat(path.join(output,name));throw new Error('Output already exists; choose a new output directory.');}catch(error){if(error.code!=='ENOENT')throw error;}}
 await fs.writeFile(path.join(output,'comparables.json'),JSON.stringify(result.comparables,null,2),{flag:'wx'});await fs.writeFile(path.join(output,'source-report.json'),JSON.stringify(result.report,null,2),{flag:'wx'});
 console.log(JSON.stringify({status:'assembled_selected_sources',uniqueVehicles:result.comparables.length,verifiedReplacementSources:result.report.verifiedReplacementSources,preservedFailedSources:result.report.preservedFailedSources,retiredBaseRows:result.report.retiredBaseRows,output}));
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error.message);process.exitCode=1;});
