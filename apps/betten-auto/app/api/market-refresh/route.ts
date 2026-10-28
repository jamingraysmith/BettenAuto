import {enforceRoute} from '../../../lib/access';
import {json,body,checkOrigin} from '../../../lib/server';
import {refreshVehicleMarkets,marketError} from '../../../lib/market-service';
export async function POST(req:Request){try{await enforceRoute(req);checkOrigin(req)}catch{return json({status:'forbidden',code:'forbidden',message:'Cross-origin writes are not allowed.'},403)}try{const input=await body(req);const limit=Number(input.limit??3);if(!Number.isInteger(limit)||limit<1||limit>5)return json({message:'Refresh batches must contain 1–5 vehicles.'},400);return json(await refreshVehicleMarkets(limit));}catch(error){return json({status:'unavailable',...marketError(error)},503)}}
