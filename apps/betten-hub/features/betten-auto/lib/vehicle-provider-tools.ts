export const providerTools = {
  vin: {label:'Enhanced VIN decode', micros:2500, permission:'inventory'},
  specs: {label:'Detailed specifications', micros:1500, permission:'inventory'},
  build: {label:'Factory build report', micros:100000, permission:'merchandising'},
  recalls: {label:'Recall campaigns', micros:10000, permission:'inventory'},
  photos: {label:'Listing photos', micros:900, permission:'merchandising'},
  tco: {label:'Five-year ownership estimate', micros:60000, permission:'inventory'},
  payments: {label:'Payment estimate', micros:5000, permission:'pricing'},
  apr: {label:'Used-auto APR estimates', micros:5000, permission:'pricing'},
} as const;
export type ProviderTool = keyof typeof providerTools;
export const financingTerms = [36,48,60,72,84];
export const lookupPrice = (tool:ProviderTool) => '$'+(providerTools[tool].micros/1_000_000).toString();
export const validProviderVin = (vin:string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);

function numberInput(input:Record<string,unknown>, key:string, label:string, min:number, max:number, integer=false){
  const value=input[key];
  const n=typeof value==='number'||typeof value==='string'&&/^\d+(\.\d+)?$/.test(value)?Number(value):NaN;
  if(!Number.isFinite(n)||n<min||n>max||integer&&!Number.isInteger(n))throw Error(label+' must be between '+min+' and '+max+'.');
  return n;
}

export function providerQuery(tool:ProviderTool,input:Record<string,unknown>,mileage:number|null|undefined){
  const query=new URLSearchParams();
  if(tool==='tco'||tool==='apr'||tool==='payments'){
    const zip=String(input.zip??'').trim();
    if(!/^\d{5}$/.test(zip))throw Error('Enter a five-digit ZIP code.');
    query.set('zip',zip);
  }
  if(tool==='apr'||tool==='payments'){
    query.set('creditScore',String(numberInput(input,'creditScore','Example credit score',300,850,true)));
  }
  if(tool==='apr'&&typeof mileage==='number'&&Number.isInteger(mileage)&&mileage>=0&&mileage<=2000000){
    query.set('vehicleMileage',String(mileage));
  }
  if(tool==='payments'){
    const price=numberInput(input,'price','Selling price',1,1000000);
    const term=numberInput(input,'loanTerm','Term',36,84,true);
    if(!financingTerms.includes(term))throw Error('Choose a supported term.');
    const down=numberInput(input,'downPayment','Down payment',0,price);
    const trade=numberInput(input,'tradeIn','Net trade credit',0,price-down);
    query.set('price',String(price));
    query.set('loanTerm',String(term));
    query.set('downPayment',String(down));
    query.set('tradeIn',String(trade));
    query.set('docFee',String(numberInput(input,'docFee','Document fee',0,5000)));
  }
  return query;
}
