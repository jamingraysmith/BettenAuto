import {enforceRoute} from '../../../../lib/access';
import {db,json,safeError} from '../../../../lib/server';
import {decodePublicVin} from '../../../../lib/vehicle-research';
export async function GET(req:Request){try{await enforceRoute(req);const vin=new URL(req.url).searchParams.get('vin')?.toUpperCase()||'';if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))throw Error('Enter a 17-character VIN.');const result=await decodePublicVin(db(),vin);if(!result.data)throw Error(result.error||'VIN decode unavailable.');return json({...result.data,observedAt:result.observedAt,expiresAt:result.expiresAt,stale:result.stale,warning:result.error});}catch(e){return json({error:safeError(e)},400)}}
