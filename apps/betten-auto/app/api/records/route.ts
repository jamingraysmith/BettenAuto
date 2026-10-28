import {getAccess} from '../../../lib/access';
import {mergeAuthorized,projectRecord} from '../../../lib/access-model';
import {enforceRoute} from '../../../lib/access';
import {db,json,body,checkOrigin,actor,safeError} from '../../../lib/server';
import {validateRecord} from '../../../lib/validation';
export async function POST(req:Request){try{await enforceRoute(req);checkOrigin(req);const p=await body(req);const access=await getAccess(req);const previous:any=await db().prepare('SELECT * FROM records WHERE id=?').bind(p.id).first();p.data=mergeAuthorized(access,p.kind,previous?JSON.parse(previous.data):{},p.data);validateRecord(p);
 const revision=Number(p.revision||0);if(!Number.isInteger(revision)||revision<0)throw new Error('Invalid revision.');
 const now=new Date().toISOString(),mutation=crypto.randomUUID(),next=revision+1,data=JSON.stringify(p.data),user=actor(req);
 const result=await db().batch([
 db().prepare('INSERT INTO records(id,kind,data,revision,updated_at,actor,mutation_id) SELECT ?,?,?,?,?,?,? WHERE ?=0 OR EXISTS (SELECT 1 FROM records WHERE id=?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=records.revision+1,updated_at=excluded.updated_at,actor=excluded.actor,mutation_id=excluded.mutation_id WHERE records.revision=? AND records.kind=excluded.kind RETURNING *').bind(p.id,p.kind,data,next,now,user,mutation,revision,p.id,revision),
 db().prepare('INSERT INTO audit(id,action,record_id,kind,data,actor,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND mutation_id=?)').bind(mutation,revision?'update':'create',p.id,p.kind,data,user,now,p.id,mutation)
 ]);
 const row=result[0].results[0] as any;if(!row)return json({error:'This record changed in another session. Reload before saving.'},409);
 return json({record:projectRecord(access,{id:row.id,kind:row.kind,data:JSON.parse(row.data),revision:row.revision,updatedAt:row.updated_at})});
 }catch(e){return json({error:safeError(e)},400);}}
export async function DELETE(req:Request){try{checkOrigin(req);const p=await body(req);const old=await db().prepare('SELECT * FROM records WHERE id=?').bind(p.id).first<any>();const access=await getAccess(req);if(!access.owner&&!access.service)throw new Error('Only the owner can delete records.');if(!old||old.kind==='system')throw new Error('Record not found.');if(old.revision!==p.revision)return json({error:'This record changed. Reload before deleting.'},409);
 const mutation=crypto.randomUUID(),now=new Date().toISOString();const r=await db().batch([db().prepare('DELETE FROM records WHERE id=? AND revision=? RETURNING id').bind(p.id,p.revision),db().prepare('INSERT INTO audit(id,action,record_id,kind,data,actor,created_at) SELECT ?,?,?,?,?,?,? WHERE changes() > 0').bind(mutation,'delete',old.id,old.kind,old.data,actor(req),now)]);if(!r[0].results.length)return json({error:'This record changed. Reload before deleting.'},409);return json({deleted:true});}catch(e){return json({error:safeError(e)},400);}}
