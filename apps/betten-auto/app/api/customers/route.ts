import {json,body,checkOrigin,safeError} from '../../../lib/server';
import {readCustomers,saveCustomer} from '../../../lib/hub-directory';
export async function GET(req:Request){try{return json(await readCustomers(req))}catch(e){return json({error:safeError(e)},403)}}
export async function POST(req:Request){try{checkOrigin(req);return json(await saveCustomer(req,await body(req)))}catch(e){return json({error:safeError(e)},403)}}
