import {env} from 'cloudflare:workers';
import {bridgeSignature} from './hub-bridge';
const origin='https://betten-imports-inventory-desk.jamingray555.chatgpt.site';
export async function forward(req:Request,action:string){const email=req.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();if(!email)throw new Error('Sign in to Betten Hub with your invited email address.');if(!['GET','POST'].includes(req.method))throw new Error('Method not allowed.');const requestOrigin=req.headers.get('origin');if(requestOrigin&&requestOrigin!==new URL(req.url).origin)throw new Error('Cross-origin request rejected.');const text=req.method==='POST'?await req.text():'';if(text.length>85000)throw new Error('Request is too large.');const payload=JSON.stringify({action,email,method:req.method,query:new URL(req.url).search,body:text?JSON.parse(text):undefined,timestamp:Date.now(),nonce:crypto.randomUUID()});const config=env as any,secret=String(config.HUB_BRIDGE_SECRET||''),token=String(config.INVENTORY_SERVICE_TOKEN||'');if(!token||!secret)throw new Error('The Hub connection is not configured.');const response=await fetch(origin+'/api/hub-gateway',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+token,'X-Betten-Signature':await bridgeSignature(secret,payload)},body:payload,signal:AbortSignal.timeout(20000)});if(response.status>=300&&response.status<400)throw new Error('The dealership connection redirected unexpectedly.');let data:any;try{data=await response.json()}catch{throw new Error('The dealership connection is unavailable.');}if(!response.ok)throw new Error(data.error||'Access is restricted.');return data;}
export async function respond(req:Request,action:string){try{return Response.json(await forward(req,action),{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}catch(e){return Response.json({error:e instanceof Error?e.message:'Request failed.'},{status:403,headers:{'Cache-Control':'no-store'}})}}

/** Same-origin native workspace transport; upstream status and safe response headers are preserved. */
export async function forwardDesk(req:Request,path:string){
 try{
  const email=req.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if(!email)throw Error('Sign in to Betten Hub with your invited email address.');
  const originHeader=req.headers.get('origin');if(originHeader&&originHeader!==new URL(req.url).origin)throw Error('Cross-origin request rejected.');
  const {deskRoute}=await import('./hub-desk-policy');
  deskRoute('desk:'+path,req.method,new URL(req.url).search);
  const text=req.method==='GET'?'':await req.text();if(text.length>15000000)throw Error('Import is too large.');
  const payload=JSON.stringify({action:'desk:'+path,email,method:req.method,query:new URL(req.url).search,body:text?JSON.parse(text):undefined,timestamp:Date.now(),nonce:crypto.randomUUID()});
  const config=env as any,secret=String(config.HUB_BRIDGE_SECRET||''),token=String(config.INVENTORY_SERVICE_TOKEN||'');
  if(!secret||!token)throw Error('The Hub connection is not configured.');
  const upstream=await fetch(origin+'/api/hub-gateway',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+token,'X-Betten-Signature':await bridgeSignature(secret,payload)},body:payload,signal:AbortSignal.timeout(60000)});
  if(upstream.status>=300&&upstream.status<400)throw Error('The dealership connection redirected unexpectedly.');
  const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  const disposition=upstream.headers.get('Content-Disposition');if(disposition)headers.set('Content-Disposition',disposition);
  return new Response(upstream.body,{status:upstream.status,headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Workspace unavailable.'},{status:403,headers:{'Cache-Control':'no-store'}})}
}
