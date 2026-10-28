// Public government responses only. Never store employee/customer fields here.
export type PublicResult<T=any>={data:T|null;observedAt:string|null;expiresAt:string|null;stale:boolean;error?:string};
const inflight=new Map<string,Promise<PublicResult>>();
export async function cachedPublic(db:any,key:string,ttl:number,loader:()=>Promise<any>,now=Date.now()):Promise<PublicResult>{
 const id='system:government:'+key;let prior:any;try{const row=await db.prepare("SELECT data FROM records WHERE id=? AND kind='system'").bind(id).first();prior=row?JSON.parse(row.data):null}catch{}
 if(prior?.data!==undefined&&Date.parse(prior.expiresAt)>now)return {...prior,stale:false};
 if(inflight.has(id))return inflight.get(id)!;
 const task=(async()=>{try{const data=await loader(),observedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+ttl).toISOString();const value={data,observedAt,expiresAt};await db.prepare("INSERT INTO records(id,kind,data,revision,updated_at,actor,mutation_id) VALUES (?,'system',?,1,?,'Government data cache',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=records.revision+1,updated_at=excluded.updated_at,actor=excluded.actor,mutation_id=excluded.mutation_id").bind(id,JSON.stringify(value),observedAt,crypto.randomUUID()).run();return {...value,stale:false}}catch{return prior?.data!==undefined?{...prior,stale:true,error:'Source temporarily unavailable. Showing the previous observation.'}:{data:null,observedAt:null,expiresAt:null,stale:false,error:'Source temporarily unavailable. No verified result is available.'}}finally{inflight.delete(id)}})();inflight.set(id,task);return task;
}
const allowed=new Set(['vpic.nhtsa.dot.gov','api.nhtsa.gov','www.fueleconomy.gov','api.weather.gov']);
export async function publicJson(url:string){const u=new URL(url);if(u.protocol!=='https:'||!allowed.has(u.hostname)||u.username||u.password)throw Error('Unapproved government source.');const r=await fetch(url,{redirect:'manual',headers:{Accept:'application/json','User-Agent':'BettenHub/1.0 (https://betten-hub.roundlake4.chatgpt.site)'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Source unavailable.');const text=await r.text();if(text.length>3000000)throw Error('Source response too large.');return JSON.parse(text);}
export const day=86400000;
