'use client';

import {useRef,useState} from 'react';
import {createPortal,flushSync} from 'react-dom';
import type {Vehicle} from '../lib/types';
import {vehicleTitle} from '../lib/types';
import {financingTerms,lookupPrice,providerTools,validProviderVin,type ProviderTool} from '../lib/vehicle-provider-tools';

const dollars=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
const usd=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?dollars.format(value):undefined;
const textValue=(value:unknown)=>typeof value==='string'||typeof value==='number'?String(value):undefined;
const objectEntries=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.entries(value):[];
type Fact=[string,unknown];

function specificationRows(value:unknown,prefix='',depth=0):Fact[]{
  if(depth>4||value==null)return [];
  if(typeof value==='boolean')return [[prefix,value?'Yes':'No']];
  if(textValue(value))return [[prefix,value]];
  if(Array.isArray(value))return value.slice(0,100).flatMap((item,i)=>specificationRows(item,prefix+' '+(i+1),depth+1));
  return objectEntries(value).slice(0,100).flatMap(([key,item])=>specificationRows(item,prefix?prefix+' · '+key:key,depth+1));
}

function Facts({rows}:{rows:Fact[]}){
  const supplied=rows.filter(([,value])=>textValue(value)?.trim());
  if(!supplied.length)return <p>No details were supplied.</p>;
  return <dl className="provider-facts">{supplied.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{textValue(value)}</dd></div>)}</dl>;
}

function BuildReport({vehicle,data,checkedAt}:{vehicle:Vehicle;data:any;checkedAt:string}){
  const reportedOptions=objectEntries(data.options).filter(([,value])=>typeof value==='string'&&value.trim());
  const isEmissionsDesignation=(value:unknown)=>typeof value==='string'&&/\b(?:S?ULEV|[PS]ZEV|partial zero emissions? vehicle|super ultra low emissions? vehicle)\b/i.test(value.replace(/[-–]/g,' '));
  const options=reportedOptions.filter(([,value])=>!isEmissionsDesignation(value));
  const emissions=reportedOptions.filter(([,value])=>isEmissionsDesignation(value));
  const listedEquipment=(vehicle.features??[]).filter(item=>item.trim()&&!isEmissionsDesignation(item));
  return <article className="provider-build-report">
    <header><strong>BETTEN IMPORTS</strong><span>Sales reference · Factory build report</span></header>
    <h2>{vehicleTitle(vehicle)}</h2>
    <p>VIN {vehicle.vin}{vehicle.stock?' · Stock '+vehicle.stock:''}</p>
    <p>VIN-specific factory build data for sales reference. Original manufacturer PDFs are available separately when linked.</p>
    <Facts rows={[
      ['Factory trim',data.trim],['Series',data.series],['Body style',data.style],['Drivetrain',data.drivetrain],
      ['Engine',data.engine],['Transmission',data.transmission],
      ['Exterior',Object.keys(data.exteriorColor||{}).filter(k=>typeof data.exteriorColor[k]==='string').join(', ')],
      ['Interior',Object.keys(data.interiorColor||{}).filter(k=>typeof data.interiorColor[k]==='string').join(', ')],
    ]}/>
    <h3>Reported factory options and packages</h3>
    {options.length?<ul>{options.map(([code,name])=><li key={code}><b>{code}</b> · {String(name)}</li>)}</ul>:<p>The factory record returned no usable package or equipment entries.</p>}
    {!!emissions.length&&<><h3>Emissions information</h3><ul>{emissions.map(([code,name])=><li key={code}>{String(name)}</li>)}</ul></>}
    {!!listedEquipment.length&&<><h3>Equipment from Betten’s listing</h3><p>These details come from the dealership listing. Use the manufacturer PDF to confirm factory packages.</p><ul>{listedEquipment.map((name,index)=><li key={index}>{name}</li>)}</ul></>}
    <small>Checked {new Date(checkedAt).toLocaleString('en-US',{timeZone:'America/Detroit'})} Eastern</small>
  </article>;
}

function BuildPreview({vehicle,data,checkedAt}:{vehicle:Vehicle;data:any;checkedAt:string}){
  const [printing,setPrinting]=useState(false);
  const report=<BuildReport vehicle={vehicle} data={data} checkedAt={checkedAt}/>;
  function print(){
    flushSync(()=>setPrinting(true));
    try{window.print();}finally{setPrinting(false);}
  }
  return <><button className="button" onClick={print}>Print / Save Build Report PDF</button>{report}
    {printing&&createPortal(<div className="window-print-root">{report}</div>,document.body)}</>;
}

function Results({tool,data,vehicle,checkedAt,removedAt}:{tool:ProviderTool;data:any;vehicle:Vehicle;checkedAt:string;removedAt?:string}){
  if(!data)return <p>No {tool==='build'?'VIN-specific factory build record':'matching details'} available for this VIN.</p>;
  switch(tool){
    case 'build': return <BuildPreview vehicle={vehicle} data={data} checkedAt={checkedAt}/>;
    case 'vin': return <Facts rows={['year','make','model','trim','body','manufacturer'].map(k=>[k,data[k]])}/>;
    case 'specs': return <>
      <Facts rows={[[ 'Configuration',data.name],['Seating',data.totalSeating],['Base MSRP',usd(data.price?.baseMsrp)]]}/>
      <p>Configuration specifications describe the matched style. Check the factory build report for VIN-specific options.</p>
      {['styleAttributes','features','orderedFeatures'].map(key=>{
        const rows=specificationRows(data[key]);
        return rows.some(([,v])=>textValue(v))?<details key={key}><summary>{{styleAttributes:'Style attributes',features:'Features',orderedFeatures:'Equipment details'}[key]}</summary><Facts rows={rows.slice(0,100)}/></details>:null;
      })}
    </>;
    case 'recalls': return <>
      <p>Confirm open status and completed repairs with the manufacturer before release.</p>
      {data.length?data.map((campaign:any,index:number)=><details key={index} className="research-campaign">
        <summary>{campaign.nhtsaCampaignNumber||'Campaign'} · {campaign.component||'Component unavailable'}</summary>
        {campaign.parkIt===true&&<p className="research-warning">Campaign instruction: Do not drive. Verify VIN applicability.</p>}
        {campaign.parkOutSide===true&&<p className="research-warning">Campaign instruction: Park outside. Verify VIN applicability.</p>}
        <p>{campaign.summary}</p><p>{campaign.remedy}</p>
      </details>):<p>No U.S. campaigns were returned. VIN-specific repair status remains unverified.</p>}
    </>;
    case 'photos': return <>
      <p>Source listing photos for reference. Confirm the vehicle and usage rights before reuse.</p>
      {removedAt&&<p>The source listing was last seen {removedAt}.</p>}
      {data.length?<div className="provider-photos">{data.map((url:string,i:number)=><a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} loading="lazy" referrerPolicy="no-referrer" alt={'Listing photo '+(i+1)}/></a>)}</div>:<p>No retail listing photos were returned.</p>}
    </>;
    case 'tco': return <Facts rows={[
      ['Five-year estimate',usd(data.tcoPrice)],['Average per mile',usd(data.averageCostPerMile)],
      ['Depreciation',usd(data.depreciation)],['Fuel',usd(data.fuel)],['Maintenance',usd(data.maintenance)],
      ['Repairs',usd(data.repairs)],['Insurance',usd(data.insurance)],['Taxes and fees',usd(data.taxesAndFees)],
      ['Financing interest',usd(data.financeInterest)],['Federal tax credit',usd(data.federalTaxCredit)],
    ]}/>;
    case 'apr': return <Facts rows={financingTerms.map(term=>[term+' months',typeof data[term]==='number'?data[term]+'%':undefined])}/>;
    case 'payments': return <Facts rows={[
      ['Monthly payment with taxes',usd(data.loanMonthlyPaymentWithTaxes)],['Monthly payment before taxes',usd(data.loanMonthlyPayment)],
      ['Loan amount',usd(data.loanAmount)],['Estimated taxes and fees',usd(data.totalTaxesAndFees)],
      ['Term',data.calculationCriteria?.numberOfMonths],['Estimated APR',typeof data.calculationCriteria?.financeRate==='number'?data.calculationCriteria.financeRate+'%':undefined],
    ]}/>;
  }
}

const summaries:Record<ProviderTool,string>={
  vin:'Check the VIN against an additional vehicle data source.',
  specs:'See the specifications available for the matched vehicle configuration.',
  build:'Look up the factory trim, colors and equipment available for this VIN.',
  recalls:'See reported U.S. recall campaigns and remedies.',
  photos:'Preview photos from the provider’s retail listings.',
  tco:'Estimate five years of depreciation, fuel, insurance, maintenance and other costs.',
  apr:'Compare indicative used-auto APRs by term. Use a hypothetical credit score.',
  payments:'Estimate a payment with a sample credit score. Amounts are estimates; lenders set actual terms.',
};

function Lookup({vehicle,tools}:{vehicle:Vehicle;tools:readonly ProviderTool[]}){
  const [tool,setTool]=useState(tools[0]);
  const [values,setValues]=useState({zip:'49546',creditScore:'720',price:vehicle.price&&vehicle.price>0?String(vehicle.price):'',loanTerm:'60',downPayment:'0',tradeIn:'0',docFee:'0'});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [result,setResult]=useState<any>(null);
  const inFlight=useRef(false);
  const finance=tool==='apr'||tool==='payments';
  const change=(key:keyof typeof values,value:string)=>{setValues(current=>({...current,[key]:value}));setResult(null);setError('');};
  const field=(key:keyof typeof values,label:string,type='number',min=0,max?:number)=>
    <label>{label}<input required type={type} value={values[key]} onChange={e=>change(key,e.target.value)} min={type==='number'?min:undefined} max={max} step={key==='creditScore'?1:0.01} pattern={key==='zip'?'[0-9]{5}':undefined} inputMode={key==='zip'?'numeric':undefined}/></label>;

  async function run(event:React.FormEvent){
    event.preventDefault();
    if(inFlight.current)return;
    inFlight.current=true;
    setBusy(true);setError('');setResult(null);
    try{
      const res=await fetch('/api/vehicle/provider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vin:vehicle.vin,tool,...values})});
      const data=await res.json() as {error?:string;result?:unknown;partial?:boolean;checkedAt?:string};
      if(!res.ok)throw Error(data.error||'The lookup could not be completed.');
      setResult(data);
    }catch(e){setError(e instanceof Error?e.message:'The lookup could not be completed.');}
    finally{inFlight.current=false;setBusy(false);}
  }

  return <>
    <form className="provider-lookup-form" onSubmit={run}>
      <fieldset disabled={busy||!validProviderVin(vehicle.vin)}>
        {tools.length>1&&<label>Lookup type<select value={tool} onChange={e=>{setTool(e.target.value as ProviderTool);setResult(null);setError('');}}>{tools.map(key=><option key={key} value={key}>{providerTools[key].label}</option>)}</select></label>}
        <p>{summaries[tool]}</p>
        <div className="provider-inputs">
          {(finance||tool==='tco')&&field('zip','ZIP code','text')}
          {finance&&field('creditScore','Example credit score','number',300,850)}
          {tool==='payments'&&<>
            {field('price','Selling price ($)','number',1,1000000)}
            <label>Term<select value={values.loanTerm} onChange={e=>change('loanTerm',e.target.value)}>{financingTerms.map(n=><option value={n} key={n}>{n} months</option>)}</select></label>
            {field('downPayment','Down payment ($)')}
            {field('tradeIn','Net trade credit ($)')}
            {field('docFee','Document fee ($)','number',0,5000)}
          </>}
        </div>
        <button type="submit" className="button">{busy?'Checking…':'Look up · '+lookupPrice(tool)+' per call'}</button>
      </fieldset>
    </form>
    {!validProviderVin(vehicle.vin)&&<p>A standard 17-character VIN is required.</p>}
    {error&&<p className="notice error" role="alert">{error}</p>}
    {result&&<div className="provider-result" aria-live="polite">
      {result.partial&&<p>Only partial information was available for this VIN.</p>}
      <Results tool={tool} data={result.result} vehicle={vehicle} checkedAt={result.checkedAt} removedAt={result.removedAt}/>
      {tool!=='build'&&<small>Checked {new Date(result.checkedAt).toLocaleString('en-US',{timeZone:'America/Detroit'})} Eastern</small>}
    </div>}
  </>;
}

export function ProviderResearch({vehicle,tools,title}:{vehicle:Vehicle;tools:readonly ProviderTool[];title:string}){
  return <section className="workspace-panel provider-research">
    <h3>{title}</h3>
    <Lookup key={vehicle.vin} vehicle={vehicle} tools={tools}/>
  </section>;
}
