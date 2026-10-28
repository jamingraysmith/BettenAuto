/** Map only explicitly named financial fields. Age derives a stock date only when an explicit report date is supplied. */
export const dealerHeader=(v:unknown)=>String(v??'').replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases:Record<string,string[]>={cost:['cost','acquisitioncost','vehiclecost','unitcost'],acquiredDate:['acquireddate','acquisitiondate','stockdate','dateinstock'],buyFees:['buyfees'],transport:['transport','transportation'],reconActual:['reconactual'],reconEstimate:['reconestimate'],otherCost:['othercost'],sellingExpense:['sellingexpense']};
const fieldFor=(header:string)=>header==='vin'?'vin':Object.keys(aliases).find(field=>aliases[field].includes(header));
const blank=(v:any)=>v===null||v===undefined||typeof v==='string'&&!v.trim();
export function dealerRowsFromObjects(objects:Record<string,any>[],rowNumbers:number[]=[]){
 if(!objects.length||objects.length>5000)throw new Error('Choose a report with 1–5,000 vehicle rows.');
 const seen=new Set<string>();return objects.map((input,index)=>{
  const normalized=Object.fromEntries(Object.entries(input).map(([k,v])=>[dealerHeader(k),v]));
  const vin=String(normalized.vin||'').trim().toUpperCase();
  if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))throw new Error('Report row '+(rowNumbers[index]??index+1)+' needs a valid 17-character VIN.');
  if(seen.has(vin))throw new Error('Duplicate VIN '+vin+' in this report.');seen.add(vin);
  const row:any={vin};for(const [field,keys] of Object.entries(aliases)){
   const values=keys.map(k=>normalized[k]).filter(v=>!blank(v));if(!values.length)continue;
   if(values.length>1)throw new Error('More than one '+field+' column contains a value for '+vin+'. Keep one column.');
   const value=values[0];if(field==='acquiredDate'){
    if(value instanceof Date){if(!Number.isFinite(value.getTime()))throw new Error('Invalid date for '+vin);row[field]=value.toISOString().slice(0,10);}
    else if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.trim())&&Number.isFinite(Date.parse(value.trim()))&&new Date(value.trim()).toISOString().slice(0,10)===value.trim())row[field]=value.trim();
    else throw new Error('Use a formatted Excel date or YYYY-MM-DD acquisition date for '+vin+'.');
   }else{if(typeof value!=='number'&&typeof value!=='string')throw new Error('Invalid '+field+' for '+vin);const n=Number(typeof value==='string'?value.trim().replace(/[$,]/g,''):value);if(!Number.isFinite(n)||n<0)throw new Error('Invalid '+field+' for '+vin+'. Enter a nonnegative amount or leave it blank.');row[field]=n;}
  }
  return row;
 });
}
export type DealerSkippedRow={row:number;vehicle:string;stock:string;identifier:string;reason:string};
export function prepareDealerRows(objects:Record<string,any>[],rowNumbers:number[]=[],reportDate?:string){
 const evidence=new Map<string,any>();
 const eligible:Record<string,any>[]=[],positions:number[]=[],skippedRows:DealerSkippedRow[]=[];
 for(const [index,input] of objects.entries()){
  const n=Object.fromEntries(Object.entries(input).map(([k,v])=>[dealerHeader(k),v]));
  const identifier=String(n.vin||'').trim().toUpperCase(),disposition=String(n.disp??n.disposition??'').trim();
  const row=rowNumbers[index]??index+1;
  if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(identifier)&&/^wholesale$/i.test(disposition)){
   skippedRows.push({row,vehicle:String(n.vehicle||''),stock:String(n.stock||n.stocknumber||''),identifier,reason:'Wholesale vehicle with a nonstandard VIN/serial number; financial data not imported.'});continue;
  }
  let prepared=input;
  const hasDate=aliases.acquiredDate.some(k=>!blank(n[k]));
  if(reportDate&&!hasDate&&!blank(n.age)){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)||!Number.isFinite(Date.parse(reportDate))||new Date(reportDate).toISOString().slice(0,10)!==reportDate)throw new Error('Enter a valid report date.');
   const age=Number(n.age);if(!Number.isInteger(age)||age<0||age>50000)throw new Error('Report row '+row+' has an invalid Age.');
   const acquiredDate=new Date(Date.parse(reportDate)-age*86400000).toISOString().slice(0,10);
   prepared={...input,acquiredDate};evidence.set(identifier,{reportDate,age});
  }
  eligible.push(prepared);positions.push(row);
 }
 if(!eligible.length)throw new Error('No vehicles with standard VINs remain to import. All '+skippedRows.length+' rows were nonstandard wholesale entries.');
 return {rows:dealerRowsFromObjects(eligible,positions).map(row=>evidence.has(row.vin)?{...row,stockAgeEvidence:evidence.get(row.vin)}:row),skippedRows};
}
export function dealerRowsFromSheets(sheets:{sheet:string;data:any[][]}[],reportDate?:string){
 const candidates=[];
 for(const sheet of sheets){const index=sheet.data.slice(0,100).findIndex(row=>{const headers=row.map(dealerHeader);return headers.includes('vin')&&headers.some(h=>fieldFor(h)&&h!=='vin')});if(index>=0)candidates.push({sheet,index});}
 if(candidates.length!==1)throw new Error(candidates.length?'More than one worksheet contains vehicle costs. Keep the worksheet you want to import in a separate Excel file.':'No VIN and Cost (or acquisition date) header row was found in this Excel file.');
 const {sheet,index}=candidates[0],headers=sheet.data[index].map(dealerHeader),recognized=headers.map(fieldFor).filter(Boolean);
 if(new Set(recognized).size!==recognized.length)throw new Error('The report has duplicate financial or VIN columns. Keep one column for each field.');
 const vinColumn=headers.indexOf('vin'),objects=[],rowNumbers:number[]=[];
 for(const [offset,row] of sheet.data.slice(index+1).entries()){
  if(row.every(blank))continue;
  if(dealerHeader(row[vinColumn])==='vin')continue;
  if((blank(row[vinColumn])||/^\s*(?:grand\s+)?totals?\s*:?\s*$/i.test(String(row[vinColumn])))&&row.some(cell=>typeof cell==='string'&&/^\s*(?:grand\s+)?totals?\s*:?\s*$/i.test(cell)))continue;
  objects.push(Object.fromEntries(headers.map((h,i)=>[h,row[i]])));rowNumbers.push(index+offset+2);
 }
 return {...prepareDealerRows(objects,rowNumbers,reportDate),sheet:sheet.sheet};
}
export async function readDealerExcel(file:File,selectedReportDate?:string){
 if(file.size>20*1024*1024)throw new Error('Choose an Excel report smaller than 20 MB.');
 let sheets;try{const {default:readExcelFile}=await import('read-excel-file/browser');sheets=await readExcelFile(file);}catch{throw new Error('This Excel file could not be read. Use an unencrypted .xlsx workbook exported from vAuto.');}
 const reportDate=selectedReportDate||file.name.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
 if(!reportDate&&sheets.some(s=>s.data.slice(0,100).some(r=>r.some(c=>dealerHeader(c)==='age'))))throw new Error('Choose the report date below to convert its Age column to a stock date, then upload again.');
 return dealerRowsFromSheets(sheets,reportDate);
}
