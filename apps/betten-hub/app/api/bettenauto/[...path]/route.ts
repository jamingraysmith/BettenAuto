import {forwardDesk} from '../../../../lib/hub-client';
async function handle(req:Request,{params}:{params:Promise<{path:string[]}>}){const {path}=await params;return forwardDesk(req,path.join('/'));}
export const GET=handle;
export const POST=handle;
export const DELETE=handle;
