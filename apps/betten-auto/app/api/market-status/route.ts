import {enforceRoute} from '../../../lib/access';
import {json} from '../../../lib/server';
import {marketStatus} from '../../../lib/market-service';
export async function GET(req:Request){try{await enforceRoute(req);return json(await marketStatus())}catch{return json({status:'unavailable',message:'Market connection status is unavailable.'},503)}}
