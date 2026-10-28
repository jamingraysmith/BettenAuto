import {enforceRoute} from '../../../lib/access';
import {json,body,checkOrigin,workspace} from '../../../lib/server';
import {lookupVehicleMarket,marketError,validateMarketVehicle} from '../../../lib/market-service';
export async function POST(req:Request){
 try{await enforceRoute(req);checkOrigin(req)}catch{return json({status:'forbidden',code:'forbidden',message:'Cross-origin writes are not allowed.'},403)}
 try{const input=await body(req);let vehicle=input.vehicle;
  if(input.vin){const w=await workspace();vehicle=w.vehicles.find(v=>v.vin===String(input.vin).trim().toUpperCase());if(!vehicle)return json({status:'invalid_vehicle',message:'Vehicle not found in current inventory.'},400);}
  try{vehicle=validateMarketVehicle(vehicle)}catch{return json({status:'invalid_vehicle',message:'Enter valid year, make, model, condition and odometer details.'},400)}
  return json(await lookupVehicleMarket(vehicle,input.options));
 }catch(error){const e=marketError(error);return json({status:e.code,...e},e.code==='configuration'?503:e.code==='daily_budget'||e.code==='monthly_budget'||e.code==='rate_limited'?429:502);}
}
