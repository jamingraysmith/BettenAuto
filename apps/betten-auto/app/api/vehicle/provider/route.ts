import {getAccess} from '../../../../lib/access';
import {can} from '../../../../lib/access-model';
import {checkOrigin,db,json,workspace} from '../../../../lib/server';
import {marketConfiguration} from '../../../../lib/market-service';
import {providerQuery,providerTools,validProviderVin,type ProviderTool} from '../../../../lib/vehicle-provider-tools';

const dailyMicros=2_000_000, monthlyMicros=10_000_000;

// Count attempts before the outbound call. A timeout can still be billable.
async function reserveLookup(micros:number){
  const stamp=new Date().toISOString();
  const id='system:vehicle-research-budget:'+stamp.slice(0,7);
  const day='$.days.d'+stamp.slice(8,10);
  const initial=JSON.stringify({total:micros,days:{['d'+stamp.slice(8,10)]:micros}});
  return db().prepare(`INSERT INTO records(id,kind,data,revision,updated_at,actor,mutation_id)
    VALUES (?,'system',?,1,?,'vehicle research',?)
    ON CONFLICT(id) DO UPDATE SET
    data=json_set(records.data,'$.total',CAST(json_extract(records.data,'$.total') AS INTEGER)+?,
      ?,COALESCE(CAST(json_extract(records.data,?) AS INTEGER),0)+?),
    revision=records.revision+1,updated_at=excluded.updated_at,mutation_id=excluded.mutation_id
    WHERE records.kind='system'
      AND CAST(json_extract(records.data,'$.total') AS INTEGER)+?<=?
      AND COALESCE(CAST(json_extract(records.data,?) AS INTEGER),0)+?<=?
    RETURNING id`)
    .bind(id,initial,stamp,crypto.randomUUID(),micros,day,day,micros,micros,monthlyMicros,day,micros,dailyMicros).first();
}

function selectResult(tool:ProviderTool, data:any){
  switch(tool){
    case 'vin': return data.vehicle;
    case 'build': return data.build;
    case 'specs': return data.specs;
    case 'recalls': return Array.isArray(data.data)?data.data.slice(0,100):null;
    case 'photos': return Array.isArray(data.data?.retail)?data.data.retail.filter((url:unknown)=>typeof url==='string'&&/^https:\/\/api\.auto\.dev\/photos\/retail\/[A-Z0-9-]+\.jpg$/i.test(url)).slice(0,40):null;
    case 'tco': return data.tco?.total;
    case 'apr': return data.apr;
    case 'payments': return data.paymentsData;
  }
}

export async function POST(req:Request){
  let access;
  try{checkOrigin(req);access=await getAccess(req);}catch{return json({error:'Vehicle lookup is restricted.'},403);}
  if(access.service)return json({error:'Sign in to use vehicle lookups.'},403);
  let input;
  try{
    const raw=await req.text();
    if(raw.length>4000)throw Error();
    input=JSON.parse(raw);
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error();
  }catch{return json({error:'Invalid vehicle lookup request.'},400);}
  if(typeof input.tool!=='string'||!Object.hasOwn(providerTools,input.tool))return json({error:'Choose an available vehicle tool.'},400);
  const tool=input.tool as ProviderTool, config=providerTools[tool];
  if(!can(access,config.permission))return json({error:'Your account cannot use this vehicle tool.'},403);
  const vin=typeof input.vin==='string'?input.vin.trim().toUpperCase():'';
  if(!validProviderVin(vin))return json({error:'This tool requires a standard 17-character VIN.'},400);
  try{
    const provider=marketConfiguration();
    if(!provider.configured||provider.provider!=='autodev')return json({error:'Vehicle data is not connected.'},503);
    const w=await workspace();
    const vehicle=w.vehicles.find(v=>v.vin===vin)||w.archivedVehicles.find(v=>v.vin===vin);
    if(!vehicle)return json({error:'This VIN is not in dealership inventory.'},404);
    let query;
    try{query=providerQuery(tool,input,vehicle.mileage);}catch(error){return json({error:(error as Error).message},400);}
    if(!await reserveLookup(config.micros))return json({error:'The dealership’s vehicle research spending limit has been reached.'},429);
    const url=new URL('https://api.auto.dev/'+tool+'/'+vin);
    url.search=query.toString();
    const response=await fetch(url,{headers:{Authorization:'Bearer '+provider.apiKey,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
    if(response.status===401||response.status===402||response.status===403)return json({error:'The vehicle data account did not authorize this lookup. Check plan access and the connection.'},403);
    if(response.status===429)return json({error:'The vehicle data account reached a request or usage limit. Try later.'},429);
    if(response.status===404)return json({error:'No provider record is available for this VIN.'},404);
    if(!response.ok)return json({error:'The vehicle data service could not complete this lookup.'},502);
    const payload=await response.json() as any;
    const result=selectResult(tool,payload);
    const returnedVin=payload.build?.vin??payload.vehicle?.vin;
    if(typeof returnedVin==='string'&&returnedVin.toUpperCase()!==vin)return json({error:'The provider returned details for a different VIN.'},502);
    if(result==null&&response.status!==207)return json({error:'The vehicle data service returned an incomplete response.'},502);
    return json({result:result??null,partial:response.status===207||Array.isArray(payload.missing)&&payload.missing.length>0,checkedAt:new Date().toISOString(),removedAt:tool==='photos'?payload.removedAt:undefined});
  }catch{return json({error:'The vehicle data service is temporarily unavailable.'},502);}
}
