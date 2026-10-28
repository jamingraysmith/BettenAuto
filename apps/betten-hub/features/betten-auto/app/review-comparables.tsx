import {ChevronDown,ExternalLink} from 'lucide-react';
import {money,type Vehicle} from '../lib/types';
import type {Comparable,MatchOptions} from '../lib/pricing';
import {reviewComparables} from '../lib/review-comparables';

const sourceUrl=(value:unknown)=>{try{const url=new URL(String(value));return /^https?:$/.test(url.protocol)?url.href:null;}catch{return null;}};
const mileage=(value:unknown)=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?'Unknown':Number(value).toLocaleString('en-US')+' mi';
const observed=(value:string|undefined)=>value?new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Detroit',timeZoneName:'short'}):'Unknown';

export default function ReviewComparables({vehicle,listings,options}:{vehicle:Vehicle;listings:Comparable[];options:MatchOptions}){
 const candidates=reviewComparables(vehicle,listings,options);
 return <details className="appraisal-matches review-comparables"><summary>Related listings requiring review ({candidates.length})<ChevronDown size={14}/></summary>
  <p className="help-text">Read-only listings with trim, mileage or certification eligibility to verify. These are not included in the sample average, median, price percentage, rank or price suggestions. Review does not change filters or apply a price.</p>
  {candidates.length?<div className="table-scroll"><table><thead><tr><th>Vehicle / review flags</th><th>Mileage</th><th>Asking price / source</th></tr></thead><tbody>{candidates.map(({listing:c,reasons},index)=>{const url=sourceUrl(c.url);return <tr key={c.vin||c.url||index}>
   <td><strong>{[c.year,c.make,c.model].filter(Boolean).join(' ')}</strong><span className="cell-sub">Trim: {c.trim||'Not supplied'}</span><span className="cell-sub">{reasons.join(' · ')}</span><span className="cell-sub">{c.dealer||c.source||'Manual listing'}{c.city?' · '+c.city:''}{c.state?', '+c.state:''}</span></td>
   <td>{mileage(c.mileage)}</td><td><strong>{money(c.price)}</strong><span className="cell-sub">Observed {observed(c.observedAt)}</span>{url?<a className="source-link" href={url} target="_blank" rel="noreferrer">Source listing<ExternalLink size={10}/></a>:<span className="cell-sub">Source URL not supplied</span>}</td>
  </tr>;})}</tbody></table></div>:<p>No related listings require review within the current year, mileage, condition, source, freshness and distance limits.</p>}
 </details>;
}
