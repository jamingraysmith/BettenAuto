import type {PublicMarketSource} from './public-market-sources';

export class PublicSourceError extends Error {constructor(public code:string,public retryAfterSeconds?:number){super(code);}}
const USER_AGENT='BettenInventoryDesk/1.0';
const vinPattern=/^[A-HJ-NPR-Z0-9]{17}$/;
const number=(v:any):number|null=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(/[$,\s]/g,''));return Number.isFinite(n)&&n>=0?n:null;};
const text=(v:any)=>typeof v==='string'?v:typeof v?.name==='string'?v.name:'';
const types=(v:any)=>Array.isArray(v?.['@type'])?v['@type']:[v?.['@type']];
/** A final marker on a charge line does not make it the vehicle asking price. */
export function isFeeOnlyPriceRow(row:any){
 const type=String(row?.typeClass||'').toLowerCase().replace(/[^a-z]/g,'');
 if(!/price|value|msrp/.test(type)&&(/fees?$|tax(?:es)?$/.test(type)||/^(?:registration|title|license|licensing)$/.test(type)))return true;
 const label=decode(String(row?.label||'').replace(/<[^>]*>/g,' ')).toLowerCase();
 if(/\b(?:price|msrp|retail|selling|sale)\b/.test(label)||! /\b(?:fees?|tax(?:es)?)\b/.test(label))return false;
 return !label.replace(/\b(?:total|dealer|documentation|document|doc|miscellaneous|misc|electronic|title|titling|registration|license|licensing|sales|state|local|excise|taxes|tax|fees|fee|pre|delivery|service|processing|administrative|admin|filing|dmv|and|or)\b/g,'').replace(/[^a-z]/g,'');
}
function entities(value:any):any[]{if(!value||typeof value!=='object')return [];if(Array.isArray(value))return value.flatMap(entities);return [value,...Object.values(value).filter(v=>v&&typeof v==='object').flatMap(entities)];}
function decode(s:string){return s.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,hex,decimal)=>{const n=parseInt(hex||decimal,hex?16:10);return n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function publicUrl(raw:any,base:string){if(typeof raw!=='string'||!raw.trim())return '';try{const u=new URL(raw,base),b=new URL(base);if(u.protocol!=='https:'||u.username||u.password||u.origin!==b.origin)return '';u.hash='';return u.toString();}catch{return '';}}

/** Longest matching Allow/Disallow rule, for our actual crawler identity. */
export function robotsAllows(robots:string,url:string,userAgent=USER_AGENT){
 const groups:{agents:string[];rules:{allow:boolean;path:string}[]}[]=[];let group:{agents:string[];rules:{allow:boolean;path:string}[]}|null=null,startedRules=false;
 for(const raw of robots.split(/\r?\n/)){const line=raw.replace(/#.*$/,'').trim(),m=line.match(/^([^:]+):\s*(.*)$/);if(!m)continue;const key=m[1].trim().toLowerCase(),value=m[2].trim();if(key==='user-agent'){if(!group||startedRules){group={agents:[],rules:[]};groups.push(group);startedRules=false;}group.agents.push(value.toLowerCase());}else if(group&&(key==='allow'||key==='disallow')){startedRules=true;if(value)group.rules.push({allow:key==='allow',path:value});}}
 const agent=userAgent.toLowerCase(),specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&agent.includes(a)));const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));const path=new URL(url).pathname+new URL(url).search;let length=-1,allowed=true;
 for(const g of selected)for(const rule of g.rules){const end=rule.path.endsWith('$'),p=end?rule.path.slice(0,-1):rule.path,pattern='^'+p.split('*').map(x=>x.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*')+(end?'$':'');if(new RegExp(pattern).test(path)){const n=p.replace(/\*/g,'').length;if(n>length||n===length&&rule.allow){length=n;allowed=rule.allow;}}}return allowed;
}

export function parsePublicInventory(content:string,pageUrl:string,source:PublicMarketSource,observedAt:string){
 const inline=parseDealerInventory(content,pageUrl,source,observedAt);if(inline)return inline;
 const objects:any[]=[];for(const match of content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){const type=match[1].match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1];if(!type||decode(type).toLowerCase()!=='application/ld+json')continue;try{objects.push(...entities(JSON.parse(match[2])));}catch{/* Malformed unrelated structured data cannot be executed. */}}
 const address=objects.find(o=>types(o).includes('PostalAddress'))||{},geo=objects.find(o=>types(o).includes('GeoCoordinates'))||{};
 const counts=objects.filter(o=>types(o).includes('ItemList')&&number(o.numberOfItems)!==null).map(o=>number(o.numberOfItems)!);const expectedCount=counts.length?Math.max(...counts):null;
 const visibleCount=content.match(/\bvar\s+resultCount\s*=\s*["'](\d+)["']/i)?.[1];if(visibleCount!==undefined&&expectedCount!==null&&Number(visibleCount)!==expectedCount)throw new PublicSourceError('changing_total');
 const listings:any[]=[];const seen=new Set<string>();
 for(const v of objects){if(!types(v).some((t:any)=>['Vehicle','Car','Motorcycle'].includes(t)))continue;const vin=String(v.vehicleIdentificationNumber||v.sku||v.productID||'').toUpperCase();if(!vinPattern.test(vin)||seen.has(vin))continue;
  const cards=[...content.matchAll(/<div\b[^>]*data-itemid=["']([^"']+)["'][^>]*>/gi)];const cardIndex=cards.findIndex(m=>m[1].toUpperCase().endsWith(vin));const card=cardIndex>=0?content.slice(cards[cardIndex].index!,cards[cardIndex+1]?.index??content.length):'';
  const offers=(Array.isArray(v.offers)?v.offers:[v.offers]).filter(Boolean).filter((o:any)=>!o.priceCurrency||o.priceCurrency==='USD');const prices:number[]=[...new Set<number>(offers.map((o:any)=>number(o.price)).filter((p:any)=>p!==null&&p>0))];const offer=offers.find((o:any)=>number(o.price)===prices[0]);
  const itemCondition=text(v.itemCondition||offer?.itemCondition);const condition=/NewCondition/i.test(itemCondition)?'New':/UsedCondition/i.test(itemCondition)?'Used':source.condition;
  if(condition!==source.condition)throw new PublicSourceError('condition_mismatch');
  const name=text(v.name).replace(/^(?:New|Used|Certified(?: Pre-Owned)?)\s+/i,''),year=number(v.vehicleModelDate||name.match(/^(\d{4})\b/)?.[1]),make=text(v.brand||v.manufacturer),schemaTrim=text(v.vehicleConfiguration),prefix=year&&make?new RegExp('^'+year+'\\s+'+make.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+','i'):null;let trim=schemaTrim;
  let model=text(v.model);if(!model&&prefix){model=name.replace(prefix,'');if(model===name)model='';if(trim&&model.toLowerCase().endsWith(' '+trim.toLowerCase()))model=model.slice(0,-trim.length-1);}
  const headingPrefix=[year,make,model].join(' ').toLowerCase()+' ',headingTitles=[...card.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi)].map(m=>decode(m[1].replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim().replace(/^(?:New|Used|Certified(?: Pre-Owned)?)\s+/i,''));const fullTitle=headingTitles.find(title=>title.toLowerCase().startsWith(headingPrefix));if(fullTitle)trim=fullTitle.slice(headingPrefix.length).trim()||schemaTrim;
  const details=new Map<string,string>();for(const detail of card.matchAll(/<div\b[^>]*class=["'][^"']*details-item-label[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["'][^"']*details-item-value[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi))details.set(decode(detail[1].replace(/<[^>]*>/g,' ')).trim().toLowerCase(),decode(detail[2].replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim());
  const drivetrain=text(v.driveWheelConfiguration)||details.get('drivetrain')||fullTitle?.match(/\b(?:4MATIC\+?|4MOTION|AWD|FWD|RWD|4WD)\b/i)?.[0]||'',engine=text(v.vehicleEngine)||details.get('engine')||'';
  const url=publicUrl(v.url||offer?.url,pageUrl);if(!year||year<1886||year>2100||!make||!model||!url)throw new PublicSourceError('invalid_listing');
  const units=String(v.mileageFromOdometer?.unitCode||'SMI').toUpperCase();let mileage=units==='SMI'||units==='MI'?number(v.mileageFromOdometer?.value):null;
  // DealerOn/Dealer Inspire cards may omit odometer from JSON-LD. Read only
  // the card tied to this VIN, never another vehicle or an analytics price.
  if(mileage===null){const miles=card.match(/\bmiles=["'](\d+)["']/i)||decode(card.replace(/<[^>]*>/g,' ')).match(/\bMileage\s*:?\s+([\d,]+)\s+Miles\b/i);if(miles)mileage=number(miles[1]);}
  const seller=offer?.seller&&typeof offer.seller==='object'?offer.seller:{};const dealer=text(seller.name)||source.dealer||source.name;const sellerAddress=seller.address||(source.city?address:{});
  const advertisedCpo=/\bcertified\b/i.test(text(v.name))||condition==='Used'&&(new URL(url).pathname.toLowerCase().includes('/viewdetails/cpo/'+vin.toLowerCase())||card.includes('popover-'+vin)&&/certified-img-item/i.test(card)&&/<img\b[^>]*(?:certified logo|\/cpo\.)/i.test(card));
  const price=prices.length===1?prices[0]:null;if(offers.some((o:any)=>/SoldOut|OutOfStock|Discontinued/i.test(text(o.availability))))continue;
  // Hidden sellingPrice metadata can be a different incentive scenario, even
  // when positive. Never infer fees by subtracting it from the public Offer.
  seen.add(vin);listings.push({vin,year,make,model,trim,schemaTrim,trimBasis:fullTitle?'Visible heading on the same VIN card':'Published schema configuration',title:fullTitle||name,condition,price,mileage,certified:advertisedCpo?true:null,dealer,city:sellerAddress.addressLocality||source.city||'',state:sellerAddress.addressRegion||source.state||'',postalCode:sellerAddress.postalCode||'',latitude:source.city?number(geo.latitude):null,longitude:source.city&&geo.longitude!=null?Number(geo.longitude):null,url,sourceUrl:pageUrl,source:source.name,publicSourceId:source.id,publicListing:true,scope:source.scope,observedAt,pricingBasis:'Public structured USD asking price; conditional discounts and fee inclusion require review',preFeePrice:null,feeComponent:null,bodyStyle:text(v.bodyType)||details.get('body style')||'',fuelType:text(v.fuelType),transmission:text(v.vehicleTransmission),drivetrain,engine,exterior:text(v.color),distanceMiles:null});
 }
 let next:string|null=null;for(const m of content.matchAll(/<(?:a|link)\b([^>]+)>/gi)){const attrs=m[1];if(!/\brel\s*=\s*["'][^"']*\bnext\b[^"']*["']/i.test(attrs))continue;const href=attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];if(href){next=publicUrl(decode(href),pageUrl)||null;if(!next)throw new PublicSourceError('unsafe_pagination');}}
 return {listings,expectedCount,next};
}

/** Parse the public, rendered Dealer.com inventory widget as JSON data only. */
export function parseDealerInventory(content:string,pageUrl:string,source:PublicMarketSource,observedAt:string){
 const matches=[...content.matchAll(/^\s*DDC\.WS\.state\['ws-inv-data'\]\['[^']+'\]\s*=\s*(\{.*\});?\s*$/gm)];if(!matches.length)return null;
 let wis:any;try{const payloads=matches.map(m=>JSON.parse(m[1]));if(payloads.length!==1)throw new Error();wis=payloads[0].WIS;}catch{throw new PublicSourceError('invalid_listing');}
 const expectedCount=number(wis?.pageInfo?.totalCount);if(!Number.isInteger(expectedCount)||!Array.isArray(wis?.inventory))throw new PublicSourceError('invalid_listing');
 const seen=new Set<string>(),listings:any[]=[];
 for(const v of wis.inventory){
  const vin=String(v.vin||'').toUpperCase(),url=publicUrl(v.link,pageUrl);if(!vinPattern.test(vin)||seen.has(vin)||!url)throw new PublicSourceError('invalid_listing');seen.add(vin);
  const attrs=Object.fromEntries((Array.isArray(v.trackingAttributes)?v.trackingAttributes:[]).filter((a:any)=>typeof a?.name==='string').map((a:any)=>[a.name,a.value]));
  const account=wis.accounts?.[v.accountId]||{},address=account.address||{},dealer=text(account.name)||source.dealer||source.name;
  const condition=/wholesale/i.test(dealer)?'Wholesale':v.type==='new'?'New':v.type==='used'?'Used':null;if(!condition||condition!==source.condition&&!(condition==='Wholesale'&&source.condition==='Used'))throw new PublicSourceError('condition_mismatch');
  const rows=Array.isArray(v.pricing?.dprice)?v.pricing.dprice:[],finals=rows.filter((r:any)=>r.isFinalPrice===true&&!isFeeOnlyPriceRow(r));const final=finals.length===1?finals[0]:null,rawPrice=number(final?.value),price=rawPrice&&rawPrice>0?rawPrice:null;
  const fee=number(rows.find((r:any)=>r.typeClass==='totalFees')?.value),preFee=number(rows.find((r:any)=>['askingPrice','internetPrice'].includes(r.typeClass))?.value);
  const feeEvidence=rows.filter((r:any)=>isFeeOnlyPriceRow(r)&&number(r.value)!==null).map((r:any)=>decode(text(r.label)||String(r.typeClass||'Fee')).replace(/<[^>]*>/g,'')+' '+String(r.value)).join('; ');
  const year=number(v.year),make=text(v.make),model=text(v.model);if(!year||!make||!model)throw new PublicSourceError('invalid_listing');
  listings.push({vin,year,make,model,trim:text(v.trim),title:Array.isArray(v.title)?v.title.join(' '):text(v.title),condition,certified:v.certified===true?true:v.certified===false?false:null,price,mileage:number(attrs.odometer),drivetrain:text(attrs.driveLine),engine:[text(attrs.engine),text(attrs.engineSize)].filter(Boolean).join(' '),transmission:text(attrs.transmission),fuelType:text(v.fuelType||attrs.fuelType),bodyStyle:text(v.bodyStyle),stock:text(v.stockNumber),dealer,city:text(address.city)||source.city||'',state:text(address.state)||source.state||'',postalCode:text(address.postalCode),address:text(address.firstLineAddress),url,sourceUrl:pageUrl,source:source.name,publicSourceId:source.id,publicListing:true,scope:source.scope,observedAt,distanceMiles:null,pricingBasis:(price!==null?'Displayed final '+decode(text(final?.label)).replace(/<[^>]*>/g,'')+(fee!==null?'; includes displayed dealer fees':' ; fee basis not independently verified'):'No unique numeric final vehicle asking price; fees alone are excluded')+(feeEvidence?'; published charge rows: '+feeEvidence:''),preFeePrice:preFee,feeComponent:fee,trimBasis:'Public vehicle inventory widget'});
 }
 let next:string|null=null;for(const m of content.matchAll(/<a\b([^>]+)>/gi)){if(!/\baria-label\s*=\s*["']Go to next page["']/i.test(m[1]))continue;const href=m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];if(href){next=publicUrl(decode(href),pageUrl)||null;if(!next)throw new PublicSourceError('unsafe_pagination');}}
 return {listings,expectedCount,next};
}

async function readResponse(response:Response,maxBytes:number){const reader=response.body?.getReader();if(!reader)return '';const chunks:Uint8Array[]=[];let length=0;while(true){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>maxBytes){await reader.cancel();throw new PublicSourceError('response_too_large');}chunks.push(r.value);}const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return new TextDecoder().decode(bytes);}

/** One shared source snapshot serves every current/future matching VIN. */
export async function collectPublicSource(source:PublicMarketSource,fetcher:typeof fetch=fetch,now=Date.now(),previousListings:any[]=[]){
 const base=new URL(source.url),observedAt=new Date(now).toISOString(),deadline=Date.now()+75000;let lastRequestAt=0,gap=fetcher===fetch?500:0;
 // workerd rejects redirect:'error' before sending I/O. Manual mode plus an
 // explicit status check preserves our no-redirect boundary on that runtime.
 const request=async(url:string,maxBytes:number)=>{const pause=lastRequestAt+gap-Date.now();if(pause>0)await new Promise(resolve=>setTimeout(resolve,pause));const remaining=deadline-Date.now();if(remaining<=0)throw new PublicSourceError('timeout');lastRequestAt=Date.now();let r:Response;try{r=await fetcher(url,{headers:{'User-Agent':USER_AGENT,'Accept':'text/html,application/xhtml+xml,text/plain'},redirect:'manual',signal:AbortSignal.timeout(Math.min(20000,remaining))});}catch{throw new PublicSourceError(Date.now()>=deadline?'timeout':'source_unavailable');}if(r.status>=300&&r.status<400)throw new PublicSourceError('redirect_rejected');if(r.status===401||r.status===403)throw new PublicSourceError('access_denied');if(r.status===429){const retry=r.headers.get('Retry-After')||'',seconds=/^\d+$/.test(retry)?Number(retry):(Date.parse(retry)-Date.now())/1000;throw new PublicSourceError('rate_limited',Number.isFinite(seconds)?Math.max(1,Math.min(604800,Math.ceil(seconds))):undefined);}if(!r.ok&&r.status!==404)throw new PublicSourceError('http_error');return {status:r.status,body:await readResponse(r,maxBytes)};};
 const robots=await request(base.origin+'/robots.txt',150000);const policy=robots.status===404?'':robots.body;
 // A stricter delay anywhere in the policy is safe to honor conservatively.
 const delays=[...policy.matchAll(/^\s*crawl-delay:\s*([\d.]+)\s*(?:#.*)?$/gim)].map(m=>Number(m[1])*1000).filter(Number.isFinite);gap=Math.max(gap,...delays);if(gap>60000)throw new PublicSourceError('source_unavailable');
 const listings=new Map<string,any>(),visited=new Set<string>();let next:string|null=source.url,expectedCount:number|null=null,pages=0;
 while(next&&pages<source.maxPages){if(!robotsAllows(policy,next))throw new PublicSourceError('robots_disallowed');if(visited.has(next))throw new PublicSourceError('pagination_loop');visited.add(next);const r=await request(next,8000000);if(r.status===404)throw new PublicSourceError('source_unavailable');const page=parsePublicInventory(r.body,next,source,observedAt);if(page.expectedCount!==null){if(expectedCount!==null&&expectedCount!==page.expectedCount)throw new PublicSourceError('changing_total');expectedCount=page.expectedCount;}for(const v of page.listings)listings.set(v.vin,v);pages++;
  if(expectedCount!==null&&listings.size>=expectedCount){next=null;break;}
  let nextPage=page.next;if(!nextPage&&expectedCount!==null&&page.listings.length&&source.pagination&&source.pagination!=='start'){const u=new URL(source.url);u.searchParams.set(source.pagination,String(pages+1));nextPage=u.toString();}
  if(nextPage){const u=new URL(nextPage);if(u.origin!==base.origin||u.pathname!==base.pathname)throw new PublicSourceError('unsafe_pagination');}
  next=nextPage;
 }
 if(expectedCount===null||listings.size!==expectedCount||next)throw new PublicSourceError('incomplete_snapshot');
 if(listings.size>3000)throw new PublicSourceError('response_too_large');
 let output=[...listings.values()];let details={pendingDetails:0,detailsChecked:0,detailsFailed:0};
 if(source.detailsLimit){
  const {enrichPublicListings}=await import('./public-market-enrichment');
  const enriched=await enrichPublicListings(output,previousListings,Math.min(12,source.detailsLimit),async url=>{
   const safe=publicUrl(url,source.url);if(!safe||!robotsAllows(policy,safe))throw new PublicSourceError('robots_disallowed');
   const response=await request(safe,8000000);if(response.status===404)throw new PublicSourceError('source_unavailable');return response.body;
  },now);
  output=enriched.listings;details={pendingDetails:enriched.pendingDetails,detailsChecked:enriched.detailsChecked,detailsFailed:enriched.detailsFailed};
 }
 return {listings:output,expectedCount,pages,complete:true,observedAt,...details};
}
