/** Metadata from a verified first-party vehicle detail page. No asking prices are read. */
export type PublicMarketDetails={
 vin:string;detailsUrl:string;year?:number;make?:string;model?:string;trim?:string;schemaTrim?:string;title?:string;
 drivetrain?:string;engine?:string;bodyStyle?:string;mileage?:number;certified?:true;
 evidence:Record<string,string>;conflicts:string[];
};
const validVin=/^[A-HJ-NPR-Z0-9]{17}$/;
const text=(value:any)=>typeof value==='string'?value:typeof value?.name==='string'?value.name:'';
const types=(value:any)=>Array.isArray(value?.['@type'])?value['@type']:[value?.['@type']];
const key=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function decode(value:string){return value.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,hex,decimal)=>{const n=parseInt(hex||decimal,hex?16:10);return n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');}
const plain=(value:string)=>decode(value.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
function entities(value:any):any[]{if(!value||typeof value!=='object')return [];if(Array.isArray(value))return value.flatMap(entities);return [value,...Object.values(value).filter(item=>item&&typeof item==='object').flatMap(entities)];}
function canonical(value:string,base?:string){try{const url=new URL(value,base);if(url.protocol!=='https:'||url.username||url.password)return '';return url.origin.toLowerCase()+url.pathname.replace(/\/+$/,'').toLowerCase();}catch{return '';}}
function literal(value:string){return decode(value.replace(/\\(?:u([0-9a-f]{4})|x([0-9a-f]{2})|([\\'"/])|([nrt]))/gi,(_,unicode,hex,quote,control)=>unicode?String.fromCharCode(parseInt(unicode,16)):hex?String.fromCharCode(parseInt(hex,16)):quote||({n:'\n',r:'\r',t:'\t'} as Record<string,string>)[control]||''));}
function bindings(script:string){const values=new Map<string,string>();for(const match of script.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")\s*;/g)){const value=literal(match[2]??match[3]);if(value.length<=1000)values.set(match[1],value);}return values;}
function detailRegion(content:string){
 const start=/<div\b[^>]*class=["'][^"']*\boem-vehicle-details\b[^"']*["'][^>]*>/i.exec(content);if(!start)return '';
 let depth=1;const tail=content.slice(start.index+start[0].length);for(const tag of tail.matchAll(/<div\b[^>]*>|<\/div\s*>/gi)){depth+=/^<\//.test(tag[0])?-1:1;if(!depth)return tail.slice(0,tag.index);}return '';
}
function driveKey(value:string){const normalized=key(value);if(/4matic|4motion|allwheeldrive|^awd$/.test(normalized))return 'awd';if(/frontwheeldrive|^fwd$/.test(normalized))return 'fwd';if(/rearwheeldrive|^rwd$/.test(normalized))return 'rwd';if(/fourwheeldrive|^4wd$/.test(normalized))return '4wd';return normalized;}
const mileageValue=(value:any)=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(String(value).replace(/[,\s]/g,'')))&&Number(String(value).replace(/[,\s]/g,''))>=0?Number(String(value).replace(/[,\s]/g,'')):undefined;

/**
 * Parse only observed identity/spec fields after matching the primary schema VIN
 * and URL. Page scripts are read as literal data and never executed. Related
 * cars, generic navigation and schema Offer/MSRP fields cannot supply metadata.
 */
export function parsePublicMarketDetails(content:string,pageUrl:string,expectedVIN:string):PublicMarketDetails|null{
 const vin=String(expectedVIN||'').toUpperCase(),page=canonical(pageUrl);if(!validVin.test(vin)||!page||typeof content!=='string'||content.length>8000000)return null;
 const urlVin=new URL(pageUrl).pathname.match(/(?:^|[/_-])([A-HJ-NPR-Z0-9]{17})(?=$|[/_.-])/i)?.[1];if(urlVin&&urlVin.toUpperCase()!==vin)return null;
 const scripts=[...content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)],objects:any[]=[];
 for(const script of scripts){const type=script[1].match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1];if(!type||decode(type).toLowerCase()!=='application/ld+json')continue;try{objects.push(...entities(JSON.parse(script[2])));}catch{/* Unrelated malformed data cannot run. */}}
 const candidates=objects.filter(value=>types(value).some(type=>['Vehicle','Car','Motorcycle'].includes(type))&&String(value.vehicleIdentificationNumber||value.productID||'').toUpperCase()===vin&&canonical(text(value.url)||text(value['@id']).replace(/#.*$/,''),pageUrl)===page);
 if(!candidates.length)return null;
 const vehicle=candidates[0];if(candidates.some(other=>['model','vehicleModelDate'].some(field=>text(other[field])&&text(vehicle[field])&&key(text(other[field]))!==key(text(vehicle[field])))))return null;
 const result:PublicMarketDetails={vin,detailsUrl:pageUrl,evidence:{},conflicts:[]};
 const year=Number(vehicle.vehicleModelDate);if(Number.isInteger(year)&&year>=1886&&year<=2100)result.year=year;
 const make=text(vehicle.brand||vehicle.manufacturer),model=text(vehicle.model),name=text(vehicle.name).replace(/^(?:New|Used|Certified(?: Pre-Owned)?)\s+/i,'').trim(),schemaTrim=text(vehicle.vehicleConfiguration);
 if(make)result.make=make;if(model)result.model=model;if(name){result.title=name;result.evidence.title='Primary same-VIN Vehicle schema name';}if(schemaTrim){result.trim=schemaTrim;result.schemaTrim=schemaTrim;result.evidence.trim='Primary same-VIN Vehicle schema configuration';}
 let record:Map<string,string>|undefined;
 for(const script of scripts){const values=bindings(script[2]);if(values.get('vin')?.toUpperCase()!==vin)continue;if(values.get('make')&&make&&key(values.get('make')!)!==key(make))continue;if(values.get('model')&&model&&key(values.get('model')!)!==key(model))continue;if(values.get('year')&&result.year&&Number(values.get('year'))!==result.year)continue;record=values;break;}
 const style=record?.get('styleDescription')?.trim();if(style&&(!schemaTrim||key(style.replace(/\btheme\b/gi,'')).includes(key(schemaTrim.replace(/\btheme\b/gi,''))))){result.trim=style;result.evidence.trim='Full styleDescription in the public script declaring this exact VIN and matching identity';}
 const region=detailRegion(content),details=new Map<string,string>();
 for(const match of region.matchAll(/<div\b[^>]*class=["'][^"']*\bdetails-key\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["'][^"']*\b(?:details-value|mileage-value)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)){const label=plain(match[1]).replace(/:$/,'').toLowerCase(),value=plain(match[2]);if(value)details.set(label,value);}
 const publishedDescription=region.match(/\bvalidateDescription\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")\s*\)/)?.slice(1).find(value=>value!==undefined);
 const description=publishedDescription===undefined?'':plain(literal(publishedDescription));
 const schemaDrive=text(vehicle.driveWheelConfiguration),visibleDrive=details.get('drive type')||details.get('drivetrain')||'',recordDrive=record?.get('driveTrain')||'';
 const drives=[schemaDrive,visibleDrive,recordDrive].filter(Boolean),knownDrives=new Set(drives.map(driveKey));
 if(knownDrives.size>1)result.conflicts.push('drivetrain');else if(drives.length){result.drivetrain=visibleDrive||schemaDrive||recordDrive;result.evidence.drivetrain=visibleDrive?'Visible Drive Type on the verified primary vehicle detail page':schemaDrive?'Primary same-VIN Vehicle schema driveWheelConfiguration':'Public driveTrain record declaring this exact VIN';}
 const body=details.get('body type')||text(vehicle.bodyType)||record?.get('bodyType')||'';if(body){result.bodyStyle=body;result.evidence.bodyStyle=details.has('body type')?'Visible Body Type on the verified primary detail page':'Primary same-VIN public body type';}
 const engine=details.get('engine')||text(vehicle.vehicleEngine);if(engine){result.engine=engine;result.evidence.engine=details.has('engine')?'Visible Engine on the verified primary detail page':'Primary same-VIN Vehicle schema engine';}
 // Retain a directly advertised drivetrain badge in trim; AWD alone never
 // implies a marketing badge such as 4MATIC. Description is primary-VIN scoped.
 if(result.trim&&!result.conflicts.includes('drivetrain')&&description){const badge=description.match(new RegExp(escape(result.trim)+'\\s+(4MATIC(?:[®+]|\\b)|4MOTION\\b|AWD\\b|FWD\\b|RWD\\b|4WD\\b)','i'))?.[1];if(badge&&!/\b(?:4MATIC|4MOTION|AWD|FWD|RWD|4WD)\b/i.test(result.trim)){result.trim+=' '+badge.replace(/®/g,'');result.evidence.trim='Same-VIN published description explicitly follows its configuration with this drivetrain badge';}}
 const mileage=details.get('mileage')?.match(/^([\d,]+(?:\.\d+)?)\s+(?:Miles|mi)\b/i),visibleMiles=mileage?mileageValue(mileage[1]):undefined;
 const units=String(vehicle.mileageFromOdometer?.unitCode||vehicle.mileageFromOdometer?.unitText||'').toUpperCase(),schemaMiles=['SMI','MI','MILES'].includes(units)?mileageValue(vehicle.mileageFromOdometer?.value):undefined;
 const isNew=/NewCondition/i.test(text(vehicle.itemCondition))||/^New(?:\s|$)/i.test(text(vehicle.name));
 if(visibleMiles!==undefined&&schemaMiles!==undefined&&visibleMiles!==schemaMiles)result.conflicts.push('mileage');
 else if(visibleMiles!==undefined){result.mileage=visibleMiles;result.evidence.mileage='Visible Mileage explicitly labeled Miles on the verified primary detail page';}
 else if(schemaMiles!==undefined&&schemaMiles>0){result.mileage=schemaMiles;result.evidence.mileage='Positive primary same-VIN schema odometer explicitly labeled in miles';}
 // A schema zero without an advertised odometer may be a new-vehicle default.
 // Missing new mileage therefore stays unknown; no zero is manufactured.
 const cpoPath=new URL(pageUrl).pathname.match(/^\/viewdetails\/cpo\/([A-HJ-NPR-Z0-9]{17})(?:\/|$)/i);
 if(!isNew&&(cpoPath?.[1].toUpperCase()===vin||/^Certified(?:\s|$)/i.test(text(vehicle.name)))){result.certified=true;result.evidence.certified=cpoPath?'Official same-VIN listing URL explicitly advertises CPO':'Primary same-VIN Vehicle schema name explicitly advertises certified';}
 return result;
}
