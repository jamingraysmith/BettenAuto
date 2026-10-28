import {enforceRoute} from '../../../lib/access';
import {db,json,checkOrigin,safeError} from '../../../lib/server';
import {readMessaging,writeMessaging} from '../../../lib/hub-messaging';
export async function GET(req:Request){try{const access=await enforceRoute(req);return json(await readMessaging(db(),req,access))}catch(e){return json({error:safeError(e)},403)}}
export async function POST(req:Request){try{const access=await enforceRoute(req);checkOrigin(req);const text=await req.text();if(text.length>12000)throw new Error('Message request is too large.');return json(await writeMessaging(db(),req,JSON.parse(text),access))}catch(e){return json({error:safeError(e)},400)}}
