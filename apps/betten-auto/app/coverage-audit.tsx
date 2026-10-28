'use client';

import {useMemo,useState} from 'react';
import {ChevronDown,Search,ShieldCheck} from 'lucide-react';
import {matchComparables,modelKey,samplePricing} from '../lib/pricing';

const key=(value:unknown)=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const condition=(value:unknown)=>/^new$/i.test(String(value))?'new':/used|pre.?owned|certified/i.test(String(value))?'used':'';
const bucket=(vehicle:any)=>[key(vehicle.make),modelKey(vehicle),Number(vehicle.year),condition(vehicle.condition)].join('|');
const title=(vehicle:any)=>[vehicle.year,vehicle.make,vehicle.model,vehicle.trim].filter(Boolean).join(' ');
const observed=(value:number|null)=>value===null?'No matched observation':new Date(value).toLocaleString('en-US',{timeZone:'America/Detroit',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

/** The same strict saved-listing sample used by vehicle pricing, for every VIN. */
export default function CoverageAudit({vehicles,comparables,onOpen}:{vehicles:any[];comparables:any[];onOpen:(vehicle:any)=>void}){
 const [search,setSearch]=useState(''),[side,setSide]=useState<'all'|'new'|'used'>('all'),[coverage,setCoverage]=useState('all'),[page,setPage]=useState(1);
 const audit=useMemo(()=>{
  // Prefilter only exact default identity fields, then let the shared matcher
  // enforce trim, certification, mileage, freshness and duplicate rules.
  const buckets=new Map<string,any[]>();
  for(const raw of comparables){const listing=raw?.data??raw;if(!listing)continue;const id=bucket(listing),group=buckets.get(id)||[];group.push(listing);buckets.set(id,group);}
  return vehicles.map(vehicle=>{
   const matches=matchComparables(vehicle,buckets.get(bucket(vehicle))||[],{certifiedOnly:vehicle.certified===true}).matched;
   const stats=samplePricing(vehicle,matches),states=[...new Set(matches.map(listing=>String(listing.state||listing.dealerState||'').trim().toUpperCase()).filter(state=>/^[A-Z]{2}$/.test(state)))].sort();
   const times=matches.map(listing=>Date.parse(String(listing.observedAt))).filter(Number.isFinite);
   return {vehicle,count:matches.length,sourceCount:stats.sourceCount,states,observedAt:times.length?Math.max(...times):null,side:condition(vehicle.condition)};
  });
 },[vehicles,comparables]);
 const totals={all:audit.length,new:audit.filter(row=>row.side==='new').length,used:audit.filter(row=>row.side==='used').length,enough:audit.filter(row=>row.count>=3).length,limited:audit.filter(row=>row.count>0&&row.count<3).length,missing:audit.filter(row=>row.count===0).length};
 const term=search.trim().toLowerCase();
 const filtered=audit.filter(row=>(side==='all'||row.side===side)&&(coverage==='all'||coverage==='enough'&&row.count>=3||coverage==='limited'&&row.count>0&&row.count<3||coverage==='missing'&&row.count===0)&&(!term||[row.vehicle.vin,row.vehicle.stock,row.vehicle.stockNumber,title(row.vehicle)].join(' ').toLowerCase().includes(term)));
 const pages=Math.max(1,Math.ceil(filtered.length/20)),current=Math.min(page,pages),shown=filtered.slice((current-1)*20,current*20);
 return <section className="card space-top" aria-label="Inventory comparison coverage audit">
  <div className="card-heading"><div><h2>Comparison coverage for every vehicle</h2><p>See which vehicles have a usable saved dealer sample and which still need data.</p></div><ShieldCheck size={21}/></div>
  <div className="card-body">
   <div className="automatic-market-metrics">
    <div><strong>{totals.all.toLocaleString()}</strong><span>All inventory vehicles</span></div>
    <div><strong>{totals.enough.toLocaleString()}</strong><span>3+ matching listings</span></div>
    <div><strong>{totals.limited.toLocaleString()}</strong><span>1–2 matches · limited sample</span></div>
    <div><strong>{totals.missing.toLocaleString()}</strong><span>No matches · needs data</span></div>
   </div>
   <p className="help-text">Counts above cover the whole inventory. Matching uses the same year, equivalent trim, New/Used condition, observed drivetrain, ±25,000-mile range and 14-day freshness rules as Inventory pricing. Certified vehicles require advertised certification. Three matches are needed for sample percentages, rank and a list-price starting point. This is a selected dealer sample; it does not establish complete national coverage.</p>
  </div>
  <div className="inventory-tabs" role="group" aria-label="Coverage inventory side">
   {(['all','new','used'] as const).map(value=><button type="button" key={value} className={side===value?'selected':''} aria-pressed={side===value} onClick={()=>{setSide(value);setPage(1)}}>{value==='all'?'All inventory':value==='new'?'New':'Used / certified'} <span>{totals[value]}</span></button>)}
  </div>
  <div className="table-toolbar"><div className="filters">
   <label className="search-box"><Search size={16}/><input aria-label="Search coverage by VIN, stock or vehicle" value={search} onChange={event=>{setSearch(event.target.value);setPage(1)}} placeholder="Search VIN, stock, make or model…"/></label>
   <label className="select-wrap"><select aria-label="Filter comparison coverage" value={coverage} onChange={event=>{setCoverage(event.target.value);setPage(1)}}><option value="all">All coverage</option><option value="missing">No matches · needs data</option><option value="limited">1–2 matches · limited</option><option value="enough">3+ matches</option></select><ChevronDown size={13}/></label>
  </div></div>
  <div className="table-scroll"><table><thead><tr><th>Vehicle / stock / VIN</th><th>Comparison sample</th><th>Dealers / sources</th><th>Observed dealer states</th><th>Latest matched observation</th><th/></tr></thead><tbody>
   {shown.map((row,index)=><tr key={row.vehicle.vin||index}>
    <td><strong>{title(row.vehicle)||'Vehicle identity needed'}</strong><span className="cell-sub">Stock: {row.vehicle.stock||row.vehicle.stockNumber||'Not supplied'} · {row.side==='new'?'New':row.side==='used'?'Used':'Condition unknown'}{row.vehicle.certified===true?' · Certified':''}</span><span className="cell-sub mono">{row.vehicle.vin||'VIN not supplied'}</span></td>
    <td><strong>{row.count.toLocaleString()} {row.count===1?'match':'matches'}</strong><span className={'badge '+(row.count>=3?'green':row.count?'amber':'gray')}>{row.count>=3?'3+ · sufficient sample':row.count?'Limited sample':'Needs data'}</span></td>
    <td>{row.sourceCount.toLocaleString()}</td><td>{row.states.length?row.states.join(', '):'Not supplied'}</td><td>{observed(row.observedAt)}{row.observedAt!==null&&<span className="cell-sub">Eastern · individual dates in pricing</span>}</td>
    <td><button type="button" className="text-button" aria-label={'Open pricing for '+title(row.vehicle)+', stock '+(row.vehicle.stock||'not supplied')} onClick={()=>onOpen(row.vehicle)}>Open pricing</button></td>
   </tr>)}
   {!shown.length&&<tr><td colSpan={6}>No inventory vehicles match these filters.</td></tr>}
  </tbody></table></div>
  <div className="table-footer"><span>{filtered.length?`${(current-1)*20+1}–${Math.min(current*20,filtered.length)} of ${filtered.length} vehicles`:'0 vehicles'} · 20 per page</span><div className="pagination"><button type="button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current} of {pages}</span><button type="button" disabled={current===pages} onClick={()=>setPage(current+1)}>Next</button></div></div>
 </section>;
}
