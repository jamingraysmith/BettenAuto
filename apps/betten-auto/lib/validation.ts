const allowed=new Set(['vehicle','appraisal','comp','task','settings','sourcing']);
const numeric=new Set(['salePrice','jdBookTrade','jdBookLoan','jdBookRetail','kbbBookTrade','kbbBookLoan','kbbBookRetail','mmrBookTrade','mmrBookLoan','mmrBookRetail','blackBookTrade','blackBookLoan','blackBookRetail','cost','targetPrice','reconEstimate','reconActual','targetRetail','targetGross','recon','transport','fees','selling','carry','price','mileage','buyFees','otherCost','sellingExpense','wholesaleReserve','wholesaleProceeds','askingPrice','maxBid']);
const marketPrices=new Set(['marketAverage','marketMedian','marketMin','marketMax','marketSuggestedListPrice']);
const appraisalRanges:Record<string,[number,number,boolean]>={year:[1886,2100,true],marketSampleCount:[0,10000,true],marketSourceCount:[0,10000,true],marketYearDelta:[0,10,true],marketMileageDelta:[0,500000,false],marketMaxAgeDays:[1,365,true]};
export function validateRecord(p:any){
 if(!allowed.has(p.kind)||typeof p.id!=='string'||!p.id||p.id.length>200||p.id.startsWith('system:')||!p.data||typeof p.data!=='object'||Array.isArray(p.data))throw new Error('Invalid record.');
 if(p.kind==='vehicle'&&!/^[A-HJ-NPR-Z0-9]{17}$/.test(p.id))throw new Error('Vehicle record must use a valid VIN.');
 for(const [k,v] of Object.entries(p.data)){
  if(k==='sourceListings'&&p.kind==='comp'&&Array.isArray(v)&&v.length<=30&&v.every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.values(x).every(a=>a===null||['string','number','boolean'].includes(typeof a))))continue;
  if(p.kind!=='settings'&&v!==null&&typeof v==='object')throw new Error(k+' must be a text or numeric field.');
  if(k==='offer'&&v!==null&&v!==''&&!Number.isFinite(Number(v)))throw new Error('Offer must be a finite number.');
  if(numeric.has(k)&&v!==null&&v!==''&&(!Number.isFinite(Number(v))||Number(v)<0))throw new Error(k+' must be a nonnegative number.');
  if(p.kind==='appraisal'&&v!==null&&v!==undefined){
   if(marketPrices.has(k)&&(typeof v!=='number'||!Number.isFinite(v)||v<0))throw new Error(k+' must be a finite nonnegative number.');
   const range=appraisalRanges[k];
   if(range&&(typeof v!=='number'||!Number.isFinite(v)||v<range[0]||v>range[1]||(range[2]&&!Number.isInteger(v))))throw new Error('Enter a valid '+k+'.');
   if(['marketExactTrim','marketCertifiedOnly'].includes(k)&&typeof v!=='boolean')throw new Error('marketExactTrim must be a boolean.');
   if(k==='marketScope'&&!['regional','expanded','all'].includes(String(v)))throw new Error('Invalid marketScope.');
   if(k==='marketComparedAt'&&(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v))))throw new Error('Enter a valid marketComparedAt.');
   if(['marketBasis','marketAppliedBasis'].includes(k)&&(typeof v!=='string'||v.length>4000))throw new Error(k+' must be text of at most 4000 characters.');
   if(k==='marketVinList'&&(typeof v!=='string'||(v!==''&&(v.split(',').length>200||!v.split(',').every(vin=>/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))))))throw new Error('marketVinList must contain at most 200 comma-separated VINs.');
  }
  if(['acquiredDate','dueDate'].includes(k)&&v&&Number.isNaN(Date.parse(String(v))))throw new Error('Enter a valid '+k+'.');
 }
 if(p.kind==='vehicle'){if(p.data.saleGross!==null&&p.data.saleGross!==undefined&&p.data.saleGross!==''&&!Number.isFinite(Number(p.data.saleGross)))throw new Error('Sale gross must be a finite number.');if(p.data.keyStatus&&!['In','Out','Lost'].includes(p.data.keyStatus))throw new Error('Invalid key status.');if(p.data.keyStatus==='Out'&&!String(p.data.keyHolder||'').trim())throw new Error('Key checkout requires a holder.');}
 if(p.kind==='vehicle')for(const prefix of ['jd','kbb','mmr','black']){if(['Trade','Loan','Retail'].some(k=>p.data[prefix+'Book'+k]!==null&&p.data[prefix+'Book'+k]!==undefined&&p.data[prefix+'Book'+k]!=='')){const date=p.data[prefix+'BookDate'];if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Enter the valuation date for '+prefix+' book values.');}}
 if(JSON.stringify(p.data).length>200000)throw new Error('Record is too large.');
}
