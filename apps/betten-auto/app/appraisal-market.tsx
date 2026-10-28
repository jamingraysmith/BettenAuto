'use client';

import {useState} from 'react';
import {ChevronDown, ExternalLink, TrendingUp} from 'lucide-react';
import {money} from '../lib/types';
import type {appraisalMarket} from '../lib/appraisal';
import type {Comparable} from '../lib/pricing';
import ReviewComparables from './review-comparables';

type Market=ReturnType<typeof appraisalMarket>;
const date=(v:any)=>v?new Date(v).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'America/Detroit'}):'Undated';
const link=(v:any)=>{try{const u=new URL(String(v));return /^https?:$/.test(u.protocol)?u.href:null}catch{return null}};

export default function AppraisalMarket({market,listings,form,saved,onPatch}:{market:Market;listings:Comparable[];form:any;saved?:any;onPatch:(patch:any)=>void}){
 const [expanded,setExpanded]=useState(false);
 const {stats,matched,options}=market;
 const ready=!!(market.vehicle.year&&market.vehicle.make&&market.vehicle.model&&market.vehicle.mileage!==null&&market.vehicle.mileage!==undefined);
 function apply(value:number|null,basis:string){if(value!==null)onPatch({targetRetail:Math.round(value),marketAppliedBasis:basis,marketDataSource:'collected'});}
 return <section className="appraisal-market" aria-label="Appraisal market pricing">
  <div className="appraisal-market-heading"><span className="appraisal-market-icon"><TrendingUp size={18}/></span><div><h3>Market pricing for this appraisal</h3><p>Collected US asking-price sample · {stats.count} matches from {stats.sourceCount} dealers / sources</p></div></div>
  <div className="appraisal-market-stats" aria-live="polite">
   <div className="average"><span>Average market asking price</span><strong>{money(stats.average)}</strong><small>Arithmetic mean of matching listings</small></div>
   <div><span>Median asking price</span><strong>{money(stats.median)}</strong><small>Middle of the selected sample</small></div>
   <div><span>Advertised price range</span><strong>{stats.count?money(stats.min)+' – '+money(stats.max):'—'}</strong><small>{stats.count} priced listings</small></div>
  </div>
  <div className="appraisal-market-filters">
   <label><span>Model years</span><select aria-label="Appraisal model year range" value={options.maxYearDelta} onChange={e=>onPatch({marketYearDelta:Number(e.target.value),marketAppliedBasis:null})}><option value={0}>Same year</option><option value={1}>±1 year</option><option value={2}>±2 years</option><option value={3}>±3 years</option></select></label>
   <label><span>Mileage range</span><select aria-label="Appraisal mileage range" value={options.maxMileageDelta??''} onChange={e=>onPatch({marketMileageDelta:Number(e.target.value),marketAppliedBasis:null})}><option value={10000}>±10,000 mi</option><option value={25000}>±25,000 mi</option><option value={50000}>±50,000 mi</option></select></label>
   <label><span>Observed within</span><select aria-label="Appraisal listing freshness" value={options.maxAgeDays} onChange={e=>onPatch({marketMaxAgeDays:Number(e.target.value),marketAppliedBasis:null})}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label>
   <label className="appraisal-trim"><input type="checkbox" checked={!!options.exactTrim} onChange={e=>onPatch({marketExactTrim:e.target.checked,marketAppliedBasis:null})}/>Equivalent trim</label>
   <label className="appraisal-scope"><span>Source coverage</span><select aria-label="Appraisal source coverage" value={options.marketScope||'all'} onChange={e=>onPatch({marketScope:e.target.value,marketAppliedBasis:null})}><option value="all">All collected US listings</option><option value="expanded">Expanded US sample</option><option value="regional">Regional dealer sample</option></select></label>
   <label className="appraisal-trim"><input type="checkbox" checked={!!options.certifiedOnly} onChange={e=>onPatch({marketCertifiedOnly:e.target.checked,marketAppliedBasis:null})}/>Advertised certified only</label>
  </div>
  {!ready?<p className="appraisal-market-message">Enter year, make, model{options.exactTrim?', trim':''} and odometer miles, or load an inventory vehicle, to see matching prices.</p>:!stats.count?<p className="appraisal-market-message">No current listings match these vehicle details and filters. Verify the model and trim, broaden the filters, or add real comparables in Pricing.</p>:!stats.enoughData?<p className="appraisal-market-message">Limited sample: {stats.count} matching {stats.count===1?'listing':'listings'}. The average is shown for review; at least 3 matches are required for a list-price suggestion.</p>:null}
  <div className="appraisal-list-plan"><div><span>Sample-based list-price starting point</span><strong>{money(stats.recommendedListPrice)}</strong><small>{stats.enoughData?'Sample median rounded to the nearest $100. Review condition and equipment.':'Waiting for at least 3 matching listings.'}</small></div><button type="button" className="button primary" disabled={stats.recommendedListPrice===null} onClick={()=>apply(stats.recommendedListPrice,'Sample median rounded to $100')}>Use suggested list</button></div>
  <div className="appraisal-market-actions"><button type="button" className="button" disabled={stats.average===null} onClick={()=>apply(stats.average,'Average asking price')}>Use average for expected retail</button>{form.marketAppliedBasis&&<span>Applied: {form.marketAppliedBasis}</span>}</div>
  <p className="appraisal-market-footnote">Asking prices are not confirmed sale values. This is a selected US listing sample, with coverage that varies by vehicle, and no verified distance radius or adjustment for condition, equipment, fees or incentives. Your maximum offer updates from expected retail and the expenses below.</p>
  <details className="appraisal-matches"><summary>Review {stats.count} matching {stats.count===1?'listing':'listings'}<ChevronDown size={14}/></summary>{matched.length>0&&<><div className="table-scroll"><table><thead><tr><th>Vehicle / seller</th><th>Mileage</th><th>Asking price</th></tr></thead><tbody>{(expanded?matched:matched.slice(0,8)).map((c,i)=><tr key={c.vin||c.url||i}><td><strong>{[c.year,c.make,c.model,c.trim].filter(Boolean).join(' ')}</strong><span className="cell-sub">{c.dealer||c.source||'Manual listing'}{c.city?' · '+c.city:''}{c.state?', '+c.state:''}{c.certified===true?' · Certified':''} · Seen {date(c.observedAt)}</span>{c.url&&link(c.url)&&<a className="source-link" href={link(c.url)!} target="_blank" rel="noreferrer">Source listing<ExternalLink size={10}/></a>}</td><td>{c.mileage===null||c.mileage===undefined?'Unknown':Number(c.mileage).toLocaleString()+' mi'}</td><td><strong>{money(c.price)}</strong>{c.pricingBasis&&<span className="cell-sub price-basis">{String(c.pricingBasis)}</span>}</td></tr>)}</tbody></table></div>{matched.length>8&&<button type="button" className="text-button" onClick={()=>setExpanded(x=>!x)}>{expanded?'Show fewer listings':'Show all '+matched.length+' matches'}</button>}</>}{!matched.length&&<p>No matching listings in the current sample.</p>}<p className="appraisal-match-basis">{market.basis}</p></details>
  <ReviewComparables vehicle={market.vehicle} listings={listings} options={options}/>
  {saved?.marketComparedAt&&<details className="appraisal-saved-basis"><summary>Saved pricing basis · {date(saved.marketComparedAt)}</summary><p>Average {money(saved.marketAverage)} · Median {money(saved.marketMedian)} · {saved.marketSampleCount??0} matching listings. {saved.marketBasis}</p><p>The prices above use the current workspace sample. Saving updates the recorded pricing basis.</p></details>}
 </section>
}
