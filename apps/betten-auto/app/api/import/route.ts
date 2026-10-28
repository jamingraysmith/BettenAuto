import {enforceRoute} from '../../../lib/access';
import {importVehicles,json,body,checkOrigin,safeError} from '../../../lib/server';
export async function POST(req:Request){try{await enforceRoute(req);checkOrigin(req);return json(await importVehicles(await body(req),req));}catch(e){return json({error:safeError(e)},400);}}
