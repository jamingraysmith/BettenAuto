import {enforceRoute} from '../../../lib/access';
import {workspace,json,safeError} from '../../../lib/server';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{await enforceRoute(req);return new Response(JSON.stringify({format:'betten-inventory-v1',exportedAt:new Date().toISOString(),...await workspace(req)},null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="betten-inventory-backup.json"','Cache-Control':'no-store'}});}catch(e){return json({error:safeError(e)},503);}}
