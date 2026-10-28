import {buildDashboardSnapshot} from './dashboard-metrics';
import {env} from 'cloudflare:workers';
import seedSources from './seed-sources.json';
import seedMarketSources from './seed-market-sources.json';
import type {Vehicle} from './types';
import {readPublicSourceSnapshots,mergePublicMarketRecords} from './public-market-service';
type SeedData={vehicles:Vehicle[];comparables:any[]};
let seedCache:Promise<SeedData>|undefined;
async function loadSeeds(){
 if(!seedCache){seedCache=(async()=>{
  if(!env.ASSETS)throw new Error('Public inventory asset binding is unavailable.');
  const read=async(name:string)=>{const response=await env.ASSETS!.fetch(new Request('https://assets.local/data/'+name));if(!response.ok)throw new Error('Inventory asset could not be loaded: '+name);return response.json() as Promise<any[]>;};
  const [vehicles,comparables]=await Promise.all([read('inventory.json'),read('comparables.json')]);return {vehicles,comparables};
 })().catch(error=>{seedCache=undefined;throw error;});}
 return seedCache;
}
export async function getMarketSeed(){return (await loadSeeds()).comparables;}
export const db=()=>{if(!env.DB)throw new Error('Database is not connected.');return env.DB;};
export const json=(body:any,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function actor(req:Request){return req.headers.get('oai-authenticated-user-email')||req.headers.get('oai-authenticated-user-id')||'Site service';}
export function checkOrigin(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new Error('Cross-origin write rejected.');}
export async function body(req:Request){const raw=await req.text();if(raw.length>16000000)throw new Error('Import is too large. Use fewer than 16 MB.');return JSON.parse(raw);}
export function safeError(e:unknown){return e instanceof Error?e.message:'Operation failed';}
export function cleanVehicle(raw:any,observedAt=new Date().toISOString()):Vehicle{
 const vin=String(raw.vin||raw.vehicleIdentificationNumber||'').trim().toUpperCase();
 if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))throw new Error('Each vehicle needs a valid 17-character VIN.');
 const number=(v:any)=>v===null||v===undefined||v===''?null:Number(String(v).replace(/[$,]/g,''));
 const url=(v:any)=>typeof v==='string'&&/^https?:\/\//i.test(v)?v:'';
 const price=number(raw.price),mileage=number(raw.mileage);
 if((price!==null&&(!Number.isFinite(price)||price<0))||(mileage!==null&&(!Number.isFinite(mileage)||mileage<0)))throw new Error('Prices and mileage must be nonnegative numbers.');
 const photos=(Array.isArray(raw.photos)?raw.photos:raw.image?[raw.image]:[]).map(url).filter(Boolean).slice(0,150);
 const sourceObserved=typeof raw.observedAt==='string'&&!Number.isNaN(Date.parse(raw.observedAt))&&Date.parse(raw.observedAt)<=Date.now()+300000?new Date(raw.observedAt).toISOString():observedAt;
 const fields=Object.fromEntries(['make','model','trim','condition','exterior','interior','engine','transmission','drivetrain','bodyStyle','fuelType','dealer','source','description'].map(k=>[k,typeof raw[k]==='string'?raw[k]:raw[k]==null?'':String(raw[k])]));
 return {...raw,...fields,title:Array.isArray(raw.title)?raw.title.join(' '):typeof raw.title==='string'?raw.title:'',features:Array.isArray(raw.features)?raw.features.filter((v:any)=>typeof v==='string'):[],year:Number.isInteger(Number(raw.year))?Number(raw.year):undefined,vin,stock:String(raw.stock||raw.stockNumber||''),price,mileage,photos,image:photos[0]||'',url:url(raw.url||raw.sourceUrl),exterior:String(raw.exterior||raw.exteriorColor||''),interior:String(raw.interior||raw.interiorColor||''),firstSeen:String(raw.firstSeen||raw.firstSeenAt||sourceObserved),observedAt:sourceObserved};
}
export function autoDevOnly(){return (env as any).MARKET_DATA_AUTODEV_ONLY==='true';}
export async function workspace(req?:Request){
 const {vehicles:seedVehicles,comparables:seedComps}=await loadSeeds();
 const [inv,rec,history,runs,publicSnapshots,dashboardDays]=await Promise.all([db().prepare('SELECT data FROM inventory').all(),db().prepare("SELECT * FROM records WHERE kind != 'system' ORDER BY updated_at DESC").all(),db().prepare('SELECT * FROM audit ORDER BY created_at DESC LIMIT 150').all(),db().prepare('SELECT * FROM sync_runs ORDER BY created_at DESC LIMIT 20').all(),readPublicSourceSnapshots(db()),db().prepare("SELECT data FROM records WHERE kind='system' AND id GLOB 'system:dashboard-day:*' ORDER BY id DESC LIMIT 90").all()]);
 const vehicles=new Map<string,Vehicle>((seedVehicles as any[]).map(v=>[v.vin,v]));
 for(const row of inv.results as any[]) {const v=JSON.parse(row.data);vehicles.set(v.vin,v);}
 const storedIds=new Set((rec.results as any[]).map(r=>r.id));
 const publicComps=(seedComps as any[]).map(c=>({id:'public:'+c.vin,kind:'comp',data:{...c,publicListing:true},revision:0,updatedAt:c.observedAt})).filter(r=>!storedIds.has(r.id));
 const snapshot=await db().prepare("SELECT data FROM records WHERE id='system:inventorySnapshot'").first<any>();
 const lastSnapshot=snapshot?JSON.parse(snapshot.data):null;
 const marketRow=await db().prepare("SELECT data FROM records WHERE id='system:marketSnapshot'").first<any>();
 const marketSnapshot=marketRow?JSON.parse(marketRow.data):null;const marketVins=marketSnapshot?new Set([...marketSnapshot.vins,...(marketSnapshot.partialVins||[])]):null;
 const active=lastSnapshot?.vins?new Set([...lastSnapshot.vins,...(lastSnapshot.partialVins||[])]):null;
 const isActive=(v:Vehicle)=>!active||active.has(v.vin)||Date.parse(String(v.observedAt))>Date.parse(lastSnapshot.observedAt);
 const legacyRecords=[...publicComps,...(rec.results as any[]).map(r=>({id:r.id,kind:r.kind,data:JSON.parse(r.data),revision:r.revision,updatedAt:r.updated_at}))].filter(r=>r.kind!=='comp'||!r.data.publicListing||(!r.data._inactive&&(!marketVins||marketVins.has(r.data.vin))));
 return {dashboardHistory:(dashboardDays.results as any[]).map(r=>JSON.parse(r.data)),vehicles:[...vehicles.values()].filter(isActive),archivedVehicles:[...vehicles.values()].filter(v=>!isActive(v)),records:autoDevOnly()?legacyRecords.filter(r=>r.kind!=='comp'):mergePublicMarketRecords(legacyRecords,publicSnapshots,marketSnapshot),audit:(history.results as any[]).map(r=>({...r,data:JSON.parse(r.data)})),sources:{...seedSources,syncRuns:runs.results,lastSnapshot,marketSnapshot:autoDevOnly()?null:marketSnapshot,market:autoDevOnly()?null:seedMarketSources},importedAt:lastSnapshot?.observedAt||(seedSources as any).observedAt||(seedSources as any).importedAt,user:req?actor(req):''};
}
export async function importVehicles(payload:any,req:Request){
 if(!Array.isArray(payload.vehicles)||payload.vehicles.length===0||payload.vehicles.length>5000)throw new Error('Import requires 1–5,000 vehicles.');
 const now=new Date().toISOString();const dedup=new Map<string,Vehicle>();for(const raw of payload.vehicles){const v=cleanVehicle(raw,now);dedup.set(v.vin,v);}
 if(dedup.size!==payload.vehicles.length)throw new Error('Duplicate VINs found. Review the import before retrying.');
 if(payload.complete===true&&payload.expectedCount!==dedup.size)throw new Error('Complete snapshots require the verified source total as expectedCount.');
 const current=await workspace(req);const previous=new Map([...current.vehicles,...current.archivedVehicles].map(v=>[v.vin,v]));
 if(payload.complete===true&&dedup.size<Math.max(1,Math.floor(current.vehicles.length*0.7)))throw new Error('Complete snapshot is unexpectedly small. Existing inventory was preserved. Import as partial or verify the feed.');
 const sourceObservedAt=new Date(Math.max(...[...dedup.values()].map(v=>Date.parse(String(v.observedAt))))).toISOString();
 const currentSourceTime=Date.parse(current.sources.lastSnapshot?.observedAt||current.importedAt||'1970-01-01');
 if(payload.complete===true&&Date.parse(sourceObservedAt)<currentSourceTime)throw new Error('This complete snapshot is older than the current source. Previous inventory preserved.');
 const statements=[];
 for(const v of dedup.values()){const prior=previous.get(v.vin);if(prior&&Date.parse(String(prior.observedAt))>Date.parse(String(v.observedAt)))continue;v.firstSeen=prior?.firstSeen||v.firstSeen;if(!v.description&&prior?.description)v.description=prior.description;if(!v.features?.length&&prior?.features?.length)v.features=prior.features;statements.push(db().prepare('INSERT INTO inventory (vin,data,observed_at) VALUES (?,?,?) ON CONFLICT(vin) DO UPDATE SET data=excluded.data,observed_at=excluded.observed_at WHERE inventory.observed_at<=excluded.observed_at').bind(v.vin,JSON.stringify(v),v.observedAt));}
 for(const v of dedup.values()){const old=previous.get(v.vin);if(old&&Date.parse(String(old.observedAt))>Date.parse(String(v.observedAt)))continue;const fields=['price','mileage','stock','condition','trim','certified'];if(old&&fields.some(k=>old[k]!==v[k])){const before=Object.fromEntries(fields.map(k=>[k,old[k]??null])),after=Object.fromEntries(fields.map(k=>[k,v[k]??null]));statements.push(db().prepare('INSERT INTO audit(id,action,record_id,kind,data,actor,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'website inventory update',v.vin,'inventory',JSON.stringify({before,after,sourceObservedAt:v.observedAt}),actor(req),now));}}
 const source=String(payload.source||'Manual import').slice(0,500);
 if(payload.complete===true){const data=JSON.stringify({vins:[...dedup.keys()],source,observedAt:sourceObservedAt,count:dedup.size});statements.push(db().prepare("INSERT INTO records(id,kind,data,revision,updated_at,actor,mutation_id) VALUES ('system:inventorySnapshot','system',?,1,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=records.revision+1,updated_at=excluded.updated_at,actor=excluded.actor,mutation_id=excluded.mutation_id WHERE records.updated_at<=excluded.updated_at").bind(data,sourceObservedAt,actor(req),crypto.randomUUID()));}

 if(payload.complete!==true){statements.push(db().prepare(`UPDATE records SET data=json_set(data,'$.partialVins',json((SELECT json_group_array(vin) FROM (SELECT value AS vin FROM json_each(COALESCE(json_extract(records.data,'$.partialVins'),'[]')) UNION SELECT json_extract(value,'$.vin') AS vin FROM json_each(?) WHERE json_extract(value,'$.observedAt')>=json_extract(records.data,'$.observedAt'))))),revision=revision+1 WHERE id='system:inventorySnapshot'`).bind(JSON.stringify([...dedup.values()].map(v=>({vin:v.vin,observedAt:v.observedAt})))));}

 statements.push(db().prepare('INSERT INTO sync_runs(id,source,status,count,message,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),source,'success',dedup.size,payload.complete?'Complete verified snapshot':'Partial import; existing vehicles retained',now));
 statements.push(db().prepare('INSERT INTO audit(id,action,record_id,kind,data,actor,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'import','inventory','inventory',JSON.stringify({source,count:dedup.size,complete:payload.complete===true}),actor(req),now));
 if(payload.complete===true){const snapshot=buildDashboardSnapshot([...dedup.values()],current.records);const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());statements.push(db().prepare("INSERT INTO records(id,kind,data,revision,updated_at,actor,mutation_id) VALUES (?,'system',?,1,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=records.revision+1,updated_at=excluded.updated_at,actor=excluded.actor,mutation_id=excluded.mutation_id").bind('system:dashboard-day:'+day,JSON.stringify(snapshot),now,actor(req),crypto.randomUUID()));}
 // D1 batch is transactional; a validation or database failure leaves the prior inventory intact.
 await db().batch(statements);return {count:dedup.size,observedAt:now,complete:payload.complete===true};
}
