/** Scanner matches only an exact active VIN or stock number. It never chooses a fuzzy first result. */
export function findKeyVehicle(rows:any[],query:string,mode:'in'|'out'):{row?:any;error?:string}{
 const key=query.trim().replace(/^#\s*/,'').toUpperCase();
 if(!key)return {error:'Scan a VIN or enter the complete stock number.'};
 const matches=rows.filter(r=>r.m?.status!=='sold'&&[r.v?.vin,r.v?.stock].some(v=>String(v||'').trim().toUpperCase()===key));
 if(matches.length!==1)return {error:matches.length?'More than one vehicle has that stock number. Scan its VIN instead.':'No active vehicle matches. Check the stock number or switch Used / New cars.'};
 const row=matches[0];
 if(mode==='out'&&row.m.keyStatus!=='In')return {error:row.m.keyStatus==='Out'?'This key is already out'+(row.m.keyHolder?' with '+row.m.keyHolder:'')+'. Use Check Back In when it is returned.':'This key is not confirmed available. Open Details to review its status first.'};
 if(mode==='in'&&row.m.keyStatus==='In')return {error:'This key is already checked in.'};
 return {row};
}
