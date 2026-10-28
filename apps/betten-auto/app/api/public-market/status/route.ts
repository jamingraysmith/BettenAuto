import {enforceRoute} from '../../../../lib/access';
import {db,json,workspace} from '../../../../lib/server';
import {publicMarketStatus} from '../../../../lib/public-market-service';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{await enforceRoute(req);return json(await publicMarketStatus(db(),await workspace()));}catch{return json({mode:'public',status:'unavailable',message:'Public collection status is temporarily unavailable.'},503);}}
