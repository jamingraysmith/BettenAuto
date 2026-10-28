import {enforceRoute} from '../../../lib/access';
import {db,json,body,checkOrigin,actor,safeError,workspace} from '../../../lib/server';
import {validateRecord} from '../../../lib/validation';
const amounts=['cost','buyFees','transport','reconActual','reconEstimate','otherCost','sellingExpense'];
const missing=(value:any)=>value===undefined||value===null||value==='';
export async function POST(req:Request){
 let writing=false;
 try{await enforceRoute(req);
  checkOrigin(req);const payload=await body(req);
  if(!Array.isArray(payload.rows)||payload.rows.length<1||payload.rows.length>5000)throw new Error('Supply 1–5,000 dealer cost rows.');
  if(payload.skipUnknown!==undefined&&typeof payload.skipUnknown!=='boolean')throw new Error('Skip unknown must be true or false.');
  if(payload.overwrite!==undefined&&typeof payload.overwrite!=='boolean')throw new Error('Overwrite must be true or false.');
  const current=await workspace(req),known=new Set([...current.vehicles,...current.archivedVehicles].map(v=>v.vin));
  const records=new Map(current.records.filter(r=>r.kind==='vehicle').map(r=>[r.id,r]));
  const seen=new Set<string>(),updates:any[]=[];let skipped=0;const skippedUnknownVins:string[]=[];
  for(const row of payload.rows){
   if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('Every dealer row must be an object.');
   const vin=String(row.vin||'').trim().toUpperCase();
   if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))throw new Error('Every dealer row needs a valid 17-character VIN.');
   if(!known.has(vin)){if(payload.skipUnknown===true){skippedUnknownVins.push(vin);skipped++;continue;}throw new Error('VIN '+vin+' is not in the dealership inventory. Import the vehicle first.');}
   if(seen.has(vin))throw new Error('Duplicate VIN '+vin+' in dealer import.');seen.add(vin);
   const old=records.get(vin),before=old?.data||{},data={...before};let changed=false;
   // Validate every supplied value, including fields that fill-missing mode will preserve.
   const supplied:any={};
   for(const field of amounts){if(missing(row[field]))continue;const raw=row[field];if(!['number','string'].includes(typeof raw))throw new Error(field+' must be a number.');const cleaned=typeof raw==='string'?raw.trim().replace(/[$,]/g,''):raw;if(cleaned==='')continue;const value=Number(cleaned);if(!Number.isFinite(value)||value<0)throw new Error(field+' must be a nonnegative number.');supplied[field]=value;}
   if(!missing(row.acquiredDate)){
    if(typeof row.acquiredDate!=='string')throw new Error('Acquisition date must be a date string.');
    const raw=row.acquiredDate.trim(),time=Date.parse(raw);if(!Number.isFinite(time))throw new Error('Enter a valid acquisition date.');const date=new Date(time).toISOString().slice(0,10);
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)&&date!==raw)throw new Error('Enter a valid acquisition date.');supplied.acquiredDate=date;
   }
   if(row.stockAgeEvidence){const e=row.stockAgeEvidence;
    if(!e||typeof e.reportDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.reportDate)||!Number.isFinite(Date.parse(e.reportDate))||new Date(e.reportDate).toISOString().slice(0,10)!==e.reportDate||!Number.isInteger(e.age)||e.age<0||e.age>50000||new Date(Date.parse(e.reportDate)-e.age*86400000).toISOString().slice(0,10)!==supplied.acquiredDate)throw new Error('Invalid report Age/date evidence.');
   }
   for(const [field,value] of Object.entries(supplied)){if((payload.overwrite===true||missing(before[field]))&&before[field]!==value){data[field]=value;changed=true;}}
   if(row.stockAgeEvidence&&supplied.acquiredDate&&data.acquiredDate===supplied.acquiredDate&&(payload.overwrite===true||missing(before.acquiredDate))){data.acquiredDateSource='vauto_report_age';data.stockAgeReportDate=row.stockAgeEvidence.reportDate;data.stockAgeAtReport=row.stockAgeEvidence.age;}
   validateRecord({id:vin,kind:'vehicle',data});
   if(!changed){skipped++;continue;}
   updates.push({id:vin,revision:old?.revision||0,before,data});
  }
  if(!updates.length)return json({updated:0,skipped,skippedUnknownVins,message:'No missing dealer fields were changed. Existing records were preserved.'});
  const now=new Date().toISOString(),user=actor(req),statements=[];
  // D1 executes a batch in a transaction. The conditional JSON error aborts that
  // transaction before any writes if any record changed since the workspace read.
  // CASE evaluates the error branch only on a real revision/kind conflict.
  statements.push(db().prepare(`SELECT CASE WHEN EXISTS (
   SELECT 1 FROM json_each(?) expected LEFT JOIN records r ON r.id=json_extract(expected.value,'$.id')
   WHERE (json_extract(expected.value,'$.revision')=0 AND r.id IS NOT NULL)
    OR (json_extract(expected.value,'$.revision')>0 AND (r.id IS NULL OR r.revision!=json_extract(expected.value,'$.revision') OR r.kind!='vehicle'))
  ) THEN json('dealer_import_revision_conflict') ELSE 1 END`).bind(JSON.stringify(updates.map(({id,revision})=>({id,revision})))));
  for(const update of updates){const mutation=crypto.randomUUID();
   statements.push(db().prepare(`INSERT INTO records(id,kind,data,revision,updated_at,actor,mutation_id) VALUES (?,'vehicle',?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=records.revision+1,updated_at=excluded.updated_at,actor=excluded.actor,mutation_id=excluded.mutation_id WHERE records.revision=? AND records.kind='vehicle'`).bind(update.id,JSON.stringify(update.data),update.revision+1,now,user,mutation,update.revision));
   statements.push(db().prepare('INSERT INTO audit(id,action,record_id,kind,data,actor,created_at) VALUES (?,?,?,?,?,?,?)').bind(mutation,'dealer cost import',update.id,'vehicle',JSON.stringify({before:update.before,after:update.data,overwrite:payload.overwrite===true}),user,now));
  }
  writing=true;await db().batch(statements);
  return json({updated:updates.length,skipped,skippedUnknownVins,message:`Updated ${updates.length} vehicle records; ${skipped} unchanged. ${payload.overwrite===true?'Only supplied dealer fields were replaced.':'Existing values and dealership work were preserved.'}`});
 }catch(error){const message=safeError(error);if(writing&&/malformed JSON|dealer_import_revision_conflict/i.test(message))return json({error:'Dealer records changed during import. Nothing was imported; reload and try again.'},409);return json({error:message},400);}
}
