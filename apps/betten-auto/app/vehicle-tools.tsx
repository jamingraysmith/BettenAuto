'use client';
import {useEffect,useMemo,useState} from 'react';
import {ProviderResearch} from './provider-research';
import {ArrowUpRight,FileText,Printer,QrCode,ScanSearch} from 'lucide-react';
import {createPortal,flushSync} from 'react-dom';
import qrcode from 'qrcode-generator';
import {money,vehicleTitle} from '../lib/types';
import {auditChanges,stockAge} from '../lib/dashboard-metrics';
const providers=[['jd','J.D. Power'],['kbb','Kelley Blue Book'],['mmr','Manheim MMR'],['black','Black Book']];
const safe=(v:any)=>{try{const u=new URL(v);return /^https?:$/.test(u.protocol)?u.href:''}catch{return ''}};
const parse=(v:any)=>{try{return JSON.parse(v||'[]').filter((x:any)=>typeof x==='string'&&safe(x))}catch{return []}};
const display=(v:any)=>v==null?'—':typeof v==='boolean'?v?'Yes':'No':String(v);
export function VehicleInfoPanel({v,form,update,draftDescription}:any){return <div className="vehicle-info-grid"><section className="workspace-panel"><h3>Vehicle Attributes</h3><div className="attribute-fields"><label>Disposition<select value={form.status||'retail'} onChange={e=>update('status',e.target.value)}><option value="retail">Used / New — Retail</option><option value="wholesale">Wholesale</option><option value="sold">Sold — confirmed</option></select></label><label>Stock date<input type="date" value={form.acquiredDate||''} onChange={e=>update('acquiredDate',e.target.value)}/></label><label><input type="checkbox" checked={form.salePending===true} onChange={e=>update('salePending',e.target.checked)}/> Sale pending</label><label><input type="checkbox" checked={form.stopSale===true} onChange={e=>update('stopSale',e.target.checked)}/> Internal stop sale</label><label>Recall review<select value={form.recallReview||'Unknown'} onChange={e=>update('recallReview',e.target.value)}><option>Unknown</option><option>Needs review</option><option>Open recall reported</option><option>Reviewed by dealership</option></select></label><p className="help-text">Flags record your team's review. They do not change your website or verify recall status.</p><dl><dt>VIN</dt><dd>{v.vin}</dd><dt>Stock</dt><dd>{v.stock}</dd><dt>Certification advertised</dt><dd>{v.certified==null?'Unknown':v.certified?'Yes':'No'}</dd><dt>Days in stock</dt><dd>{stockAge(form.acquiredDate)??'Unknown'}</dd><dt>Engine</dt><dd>{v.engine||'Not supplied'}</dd><dt>Interior</dt><dd>{v.interior||'Not supplied'}</dd></dl></div><details><summary>Factory / imported equipment</summary><ul>{(v.features||[]).map((f:string,i:number)=><li key={i}>{f}</li>)}</ul>{!v.features?.length&&<p>No equipment imported.</p>}</details></section><section className="workspace-panel"><h3>Description</h3><div className={'description-review '+(form.descriptionReviewedAt?'reviewed':'')}>{form.descriptionReviewedAt?'Reviewed '+new Date(form.descriptionReviewedAt).toLocaleDateString():'Description not yet reviewed'}<button className="button" onClick={()=>update('descriptionReviewedAt',form.descriptionReviewedAt?null:new Date().toISOString())}>{form.descriptionReviewedAt?'Mark unreviewed':'Mark reviewed'}</button></div><label className="field"><span>Dealership description draft</span><textarea rows={13} value={form.merchandisingDescription??v.description??''} onChange={e=>{update('merchandisingDescription',e.target.value);update('descriptionReviewedAt',null)}}/></label><div className="workspace-actions"><button className="button" onClick={draftDescription}>Build description from vehicle facts</button><button className="button" onClick={()=>navigator.clipboard.writeText(form.merchandisingDescription??v.description??'')}>Copy description</button></div><p className="help-text">Save vehicle to keep your draft and review status. Publishing remains with your website provider.</p><div className="vehicle-spec-strip">{[v.bodyStyle,v.exterior,v.drivetrain,v.transmission].filter(Boolean).join(' · ')}</div></section></div>}
export function BookValuesPanel({form,update}:any){return <section className="book-workspace"><div className="workspace-panel"><h3>Book Value Summary</h3><p>Record a bookout obtained from your valuation service. These are staff-entered values; automatic provider connections are not enabled.</p><table><thead><tr><th>Book</th><th>As of</th><th>Trade / wholesale</th><th>Loan</th><th>Retail</th></tr></thead><tbody>{providers.map(([k,label])=><tr key={k}><td>{label}</td><td>{form[k+'BookDate']||'—'}</td><td>{money(form[k+'BookTrade'])}</td><td>{money(form[k+'BookLoan'])}</td><td>{money(form[k+'BookRetail'])}</td></tr>)}</tbody></table></div>{providers.map(([key,label])=><details className="book-provider" key={key}><summary>{label}<span>{form[key+'BookDate']?'Recorded '+form[key+'BookDate']:'No bookout entered'} · Manual</span></summary><div className="book-entry"><label>Valuation date<input type="date" value={form[key+'BookDate']||''} onChange={e=>update(key+'BookDate',e.target.value)}/></label><label>Condition / grade<input value={form[key+'BookCondition']||''} onChange={e=>update(key+'BookCondition',e.target.value)} placeholder="As shown on the bookout"/></label>{[['Trade','Trade-in / wholesale'],['Loan','Loan'],['Retail','Retail']].map(([suffix,text])=><label key={suffix}>{text}<input type="number" min="0" step="0.01" value={form[key+'Book'+suffix]??''} onChange={e=>update(key+'Book'+suffix,e.target.value)}/></label>)}<label className="book-notes">Equipment / mileage adjustment notes<textarea value={form[key+'BookNotes']||''} onChange={e=>update(key+'BookNotes',e.target.value)} placeholder="Record the provider's adjustments, mileage and selected equipment."/></label></div></details>)}</section>}
export function MediaPanel({v,form,update}:any){const [view,setView]=useState('Grid'),[tab,setTab]=useState('Photos'),[url,setUrl]=useState(''),[error,setError]=useState(''),[selected,setSelected]=useState<string[]>([]);const source=Array.from(new Set([...(v.photos||[]),v.image,...parse(form.mediaExtraUrls)].filter((x:any)=>safe(x)))) as string[];const hidden=new Set(parse(form.mediaHiddenUrls));const order=parse(form.mediaOrder);const photos=[...order.filter((u:string)=>source.includes(u)),...source.filter(u=>!order.includes(u))].filter(u=>!hidden.has(u));function add(){const u=safe(url);if(!u){setError('Enter a complete public photo URL.');return;}update('mediaExtraUrls',JSON.stringify([...new Set([...parse(form.mediaExtraUrls),u])]));setUrl('');setError('');}function move(u:string,delta:number){const next=[...photos],i=next.indexOf(u),j=i+delta;if(j<0||j>=next.length)return;[next[i],next[j]]=[next[j],next[i]];update('mediaOrder',JSON.stringify(next));}
return <section className="media-workspace"><div className="classic-subtabs">{['Photos','360 Spin','Video'].map(t=><button key={t} className={t===tab?'selected':''} onClick={()=>setTab(t)}>{t}</button>)}</div>{tab==='Photos'?<><div className="media-toolbar"><strong>Total Photos: {photos.length}</strong><label><input type="checkbox" checked={!!photos.length&&selected.length===photos.length} onChange={e=>setSelected(e.target.checked?photos:[])}/> Select All</label>{['Grid','List'].map(t=><button className={'button '+(view===t?'primary':'')} key={t} onClick={()=>setView(t)}>{t}</button>)}<button className="button" disabled={!selected.length} onClick={()=>{update('mediaHiddenUrls',JSON.stringify([...hidden,...selected]));setSelected([])}}>Hide selected</button>{hidden.size>0&&<button className="button" onClick={()=>update('mediaHiddenUrls','[]')}>Restore hidden ({hidden.size})</button>}</div><div className="media-add"><input aria-label="New vehicle photo URL" type="url" placeholder="https://… public photo URL" value={url} onChange={e=>setUrl(e.target.value)}/><button className="button" onClick={add}>Add photo link</button></div>{error&&<p role="alert">{error}</p>}<p className="help-text">Imported website photos are available below. Changes affect your Hub gallery only; source photos are retained. Save vehicle to keep order and visibility.</p><div className={'media-library '+view.toLowerCase()}>{photos.map((u,i)=><article key={u}><label><input type="checkbox" aria-label={'Select photo '+(i+1)} checked={selected.includes(u)} onChange={e=>setSelected(e.target.checked?[...selected,u]:selected.filter(s=>s!==u))}/>{i===0?'Primary photo':'Photo '+(i+1)}</label><a href={safe(u)} target="_blank" rel="noreferrer"><img src={u} alt={vehicleTitle(v)+' photo '+(i+1)} loading="lazy"/></a><div><button className="button" disabled={i===0} onClick={()=>move(u,-1)}>← Earlier</button><button className="button" disabled={i===photos.length-1} onClick={()=>move(u,1)}>Later →</button></div></article>)}</div>{!photos.length&&<div className="workspace-empty">No photos in this gallery. Add a public photo link or refresh dealership inventory.</div>}</>:<div className="workspace-panel"><h3>{tab==='Video'?'Vehicle Video':'360° Vehicle Spin'}</h3><label className="field"><span>Hosted {tab==='Video'?'video':'spin'} URL</span><input type="url" value={form[tab==='Video'?'vehicleVideoUrl':'vehicleSpinUrl']||''} onChange={e=>update(tab==='Video'?'vehicleVideoUrl':'vehicleSpinUrl',e.target.value)}/></label>{safe(form[tab==='Video'?'vehicleVideoUrl':'vehicleSpinUrl'])&&<a className="button" target="_blank" rel="noreferrer" href={safe(form[tab==='Video'?'vehicleVideoUrl':'vehicleSpinUrl'])}>Open {tab}</a>}<p className="help-text">Use your existing hosted media link. No video or 360 capture service is connected.</p></div>}</section>}
function dealerListingUrl(value:unknown){
 if(typeof value!=='string'||value.length>1000)return '';
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port)return '';
  if(!['www.bettenimports.com','bettenimports.com'].includes(url.hostname))return '';
  return /^\/(new|used|certified)\/.+\.htm$/i.test(url.pathname)?url.href:'';
 }catch{return '';}
}

function DealerListingQr({url}:{url:string}){
 const {size,path}=useMemo(()=>{
  const code=qrcode(0,'M');
  code.addData(url,'Byte');
  code.make();
  const count=code.getModuleCount(),margin=4;
  let path='';
  for(let row=0;row<count;row++){
   for(let column=0;column<count;column++){
    if(code.isDark(row,column))path+='M'+(column+margin)+' '+(row+margin)+'h1v1h-1z';
   }
  }
  return {size:count+margin*2,path};
 },[url]);
 return <svg viewBox={'0 0 '+size+' '+size} width="172" height="172" role="img" aria-label="Scan to open this vehicle’s Betten Imports listing" shapeRendering="crispEdges">
  <rect width={size} height={size} fill="#fff"/><path d={path} fill="#000"/>
 </svg>;
}

export function WindowStickersPanel({v,form,update,canEdit}:any){
 const [documentKind,setDocumentKind]=useState<'dealer'|'original'|'build'>('dealer');
 const [preview,setPreview]=useState(false),[printReady,setPrintReady]=useState(false);
 const listing=dealerListingUrl(v.url);
 const sheet=<div className="dealer-window-sheet">
  <header><strong>BETTEN IMPORTS</strong><span>5901 28th St SE · Grand Rapids, MI 49546</span></header>
  <h1>{vehicleTitle(v)}</h1>
  {listing&&<figure className="dealer-sticker-qr">
   <DealerListingQr url={listing}/>
   <figcaption><a href={listing} target="_blank" rel="noreferrer">View this vehicle on BettenImports.com</a><small>Scan for current price, photos and availability.</small></figcaption>
  </figure>}
  <dl>{[['VIN',v.vin],['Stock',v.stock],['Odometer',v.mileage==null?'Not supplied':Number(v.mileage).toLocaleString()+' miles'],['Exterior',v.exterior],['Interior',v.interior],['Engine',v.engine],['Transmission',v.transmission],['Drivetrain',v.drivetrain]].map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value||'Not supplied'}</dd></div>)}</dl>
  <h3>Equipment</h3><ul>{(v.features||[]).slice(0,18).map((feature:string,i:number)=><li key={i}>{feature}</li>)}</ul>
  <footer>Dealer vehicle information. Confirm equipment and availability with Betten Imports. See the official Buyers Guide separately.</footer>
 </div>;
 const original=safe(form.originalStickerUrl);
 return <div className="desk-documents">
  <div className="desk-section-intro"><span className="desk-kicker">PRINT & DOCUMENTS</span><h3>Vehicle documents</h3><p>Choose the document you need for the lot or the sales desk.</p></div>
  <div className="document-picker" role="group" aria-label="Document type">
   {([
    ['dealer',QrCode,'Dealer sticker','Scan to see current pricing on the listing.'],
    ['original',FileText,'Original Monroney','Open the manufacturer PDF linked to this vehicle.'],
    ['build',ScanSearch,'Factory build report','Look up the options recorded for this VIN.'],
   ] as const).map(([key,Icon,title,description])=><button type="button" key={key} aria-pressed={documentKind===key} onClick={()=>setDocumentKind(key)}>
    <span className="document-icon"><Icon size={22}/></span><strong>{title}</strong><small>{description}</small>
   </button>)}
  </div>
  <div hidden={documentKind!=='dealer'}>
   <div className="document-action">
    <div><h4>Dealer window sticker</h4><p>Print a price-free sticker with a QR code to this vehicle’s listing.</p>{!listing&&<p role="status">This vehicle has no linked Betten Imports listing. Its sticker will print without a QR code.</p>}</div>
    <button type="button" className="button primary" onClick={()=>{setPreview(true);if(canEdit)update('windowSheetPreparedAt',new Date().toISOString())}}><FileText size={16}/>Preview sticker</button>
   </div>
   {preview&&<div className="window-preview"><div className="workspace-actions">
    <button type="button" className="button primary" onClick={()=>{flushSync(()=>setPrintReady(true));try{window.print()}finally{setPrintReady(false)}}}><Printer size={16}/>Print / Save PDF</button>
    <button type="button" className="button" onClick={()=>setPreview(false)}>Close preview</button>
   </div>{sheet}</div>}
   <div className="workspace-actions">
    <a className="table-link" href="https://www.ftc.gov/business-guidance/resources/buyers-guide-fillable-form" target="_blank" rel="noreferrer">Official FTC Buyers Guide <ArrowUpRight size={13}/></a>
    <button type="button" className="table-link" onClick={()=>navigator.clipboard.writeText([vehicleTitle(v),v.stock?'Stock #'+v.stock:'',v.vin,form.merchandisingDescription||v.description||''].join('\n'))}>Copy sales summary</button>
   </div>
  </div>
  <div hidden={documentKind!=='original'} className="document-action">
   <div><h4>Original manufacturer PDF</h4>
    {original?<p>The linked PDF opens in a new tab for printing.</p>:<p>No manufacturer PDF is linked to this vehicle. Paste its link below when you have the original.</p>}
    {!original&&listing&&<p><a className="table-link" href={listing} target="_blank" rel="noreferrer">Check the dealership listing <ArrowUpRight size={13}/></a></p>}
    {canEdit&&<label className="field"><span>Manufacturer PDF link</span><input type="url" placeholder="https://…" value={form.originalStickerUrl||''} onChange={e=>update('originalStickerUrl',e.target.value)}/><small>Use Save vehicle to keep this link.</small></label>}
   </div>
   {original&&<a className="button primary" href={original} target="_blank" rel="noreferrer">Open original PDF <ArrowUpRight size={16}/></a>}
  </div>
  <div hidden={documentKind!=='build'}>
   <ProviderResearch vehicle={v} title="Factory build report" tools={['build']}/>
   <p className="document-note">Auto.dev supplies build data when it has a record for this VIN. Use Original Monroney for the manufacturer PDF.</p>
  </div>
  {printReady&&typeof document!=='undefined'&&createPortal(<div className="window-print-root">{sheet}</div>,document.body)}
 </div>;
}
export function VehicleLogPanel({vin}:any){const [events,setEvents]=useState<any[]>([]),[error,setError]=useState(''),[limited,setLimited]=useState(false),[busy,setBusy]=useState(true),[search,setSearch]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');useEffect(()=>{const controller=new AbortController();setBusy(true);fetch('/api/vehicle-log?vin='+encodeURIComponent(vin),{cache:'no-store',signal:controller.signal}).then(async r=>{const j:any=await r.json();if(!r.ok)throw Error(j.error);setEvents(j.events);setLimited(j.limited)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});return()=>controller.abort()},[vin]);const rows=useMemo(()=>auditChanges(events).filter(r=>{const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit'}).format(new Date(r.at));return (!from||day>=from)&&(!to||day<=to)&&(!search||[r.field,r.actor,display(r.oldValue),display(r.newValue)].join(' ').toLowerCase().includes(search.toLowerCase()))}),[events,from,to,search]);function exportCsv(){const cell=(v:any)=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';const content=[['Date','Field','User','Old Value','New Value'],...rows.map(r=>[r.at,r.field,r.actor,display(r.oldValue),display(r.newValue)])].map(r=>r.map(cell).join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/csv'}));a.download=vin+'-vehicle-log.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}return <section><div className="log-toolbar"><input aria-label="Search vehicle log" placeholder="Quick Search…" value={search} onChange={e=>setSearch(e.target.value)}/><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button className="button" onClick={()=>{setSearch('');setFrom('');setTo('')}}>Clear</button><button className="button" onClick={exportCsv}>Export CSV</button></div>{busy?<p>Loading vehicle history…</p>:error?<p role="alert">{error}</p>:<div className="table-scroll"><table className="vehicle-log-table"><thead><tr><th>Date</th><th>Field Label</th><th>User</th><th>Old Value</th><th>New Value</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{new Date(r.at).toLocaleString('en-US',{timeZone:'America/Detroit'})}</td><td>{r.field.replace(/([a-z])([A-Z])/g,'$1 $2')}</td><td>{r.actor}</td><td><details><summary>{display(r.oldValue).slice(0,80)}</summary>{display(r.oldValue)}</details></td><td><details><summary>{display(r.newValue).slice(0,120)}</summary>{display(r.newValue)}</details></td></tr>)}</tbody></table>{!rows.length&&<p className="workspace-empty">No saved changes match these filters.</p>}</div>}<p className="help-text">History starts with changes recorded in this application. {limited?'Showing the latest 201 saved events. ':''}Earlier vAuto and KeyTrack history has not been imported.</p></section>}
