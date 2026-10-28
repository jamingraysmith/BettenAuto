import {json,body,checkOrigin,safeError} from '../../../lib/server';
import {listUsers,saveUser} from '../../../lib/access';
export async function GET(req:Request){try{return json(await listUsers(req))}catch(e){return json({error:safeError(e)},403)}}
export async function POST(req:Request){try{checkOrigin(req);return json(await saveUser(req,await body(req)))}catch(e){return json({error:safeError(e)},403)}}
