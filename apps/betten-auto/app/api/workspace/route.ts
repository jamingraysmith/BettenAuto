import {projectWorkspace} from '../../../lib/access-model';
import {enforceRoute} from '../../../lib/access';
import {workspace,json,safeError} from '../../../lib/server';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{await enforceRoute(req);return json(projectWorkspace(await enforceRoute(req),await workspace(req)));}catch(e){return json({error:safeError(e)},503);}}
