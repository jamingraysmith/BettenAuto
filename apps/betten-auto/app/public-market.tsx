'use client';

import {useEffect,useState} from 'react';
import {ArrowRight,CheckCircle2,ChevronDown,CircleHelp,Clock3,ExternalLink,LoaderCircle,TrendingUp} from 'lucide-react';

type PublicSource = {
 id:string;
 name:string;
 url:string;
 status:'ready'|'error'|'pending'|'refreshing'|'inactive'|'disabled';
 stale?:boolean;
 pendingDetails?:number;
 detailsFailed?:number;
 count:number;
 lastSuccessAt?:string|null;
 lastAttemptAt?:string|null;
 nextRunAt?:string|null;
 message?:string;
};
export type PublicMarketStatus = {
 mode:'public';
 refreshHours:number;
 sources:PublicSource[];
 totalListings:number;
 activeSources:number;
 subscriptionCost:number;
 coverage:{total:number;withMatches:number;withEnoughData:number};
 lastSuccessAt?:string|null;
};

const observed=(value?:string|null)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-US',{timeZone:'America/Detroit',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not observed yet';
const safeSource=(value:string)=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:undefined}catch{return undefined}};
const sourceLabel=(source:PublicSource)=>source.status==='ready'?(source.stale?'Refresh overdue':source.pendingDetails?'Checking vehicle details':'Active'):source.status==='error'?'Collection failed':source.status==='refreshing'?'Collecting':source.status==='pending'?'Waiting for collection':'Inactive';

// Status reads show saved collection state. The server scheduler performs collection.
export function usePublicMarketStatus(){
 const [status,setStatus]=useState<PublicMarketStatus|null>(null),[error,setError]=useState('');
 useEffect(()=>{
  let active=true,pending:AbortController|null=null;
  async function load(){
   if(pending)return;
   const controller=new AbortController();pending=controller;
   try{
    const response=await fetch('/api/public-market/status',{cache:'no-store',signal:controller.signal});
    const data=await response.json() as PublicMarketStatus;
    if(!response.ok)throw new Error('Automatic comparison status is unavailable.');
    if(active){setStatus(data);setError('')}
   }catch{if(active&&!controller.signal.aborted)setError('Automatic comparison status is unavailable.');}
   finally{if(pending===controller)pending=null}
  }
  const onFocus=()=>{void load()};
  void load();
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load()},60000);
  window.addEventListener('focus',onFocus);
  return()=>{active=false;pending?.abort();window.clearInterval(timer);window.removeEventListener('focus',onFocus)};
 },[]);
 return {status,error};
}

export function AutomaticComparisons({status,error,detailed=false,onDetails}:{status:PublicMarketStatus|null;error?:string;detailed?:boolean;onDetails?:()=>void}){
 const failed=status?.sources.filter(source=>source.status==='error').length||0;
 const waiting=status?.sources.filter(source=>source.status==='pending'||source.status==='inactive'||source.status==='disabled').length||0;
 const collecting=status?.sources.some(source=>source.status==='refreshing');
 const overdue=status?.sources.filter(source=>source.status==='ready'&&source.stale).length||0;
 const active=status?.activeSources||0;
 const pendingDetails=status?.sources.reduce((total,source)=>total+(source.pendingDetails||0),0)||0;
 const noSources=!!status&&!status.sources.length;
 const tone=error||failed||overdue||!active?'attention':'ready';
 const stateLabel=error?'Status unavailable':!status?'Checking status':collecting?'Collection in progress':noSources?'No sources configured':active?`${active} ${active===1?'source':'sources'} observed`:'No sources observed yet';
 const Icon=!status&&!error||collecting?LoaderCircle:error||failed||overdue||!active?CircleHelp:CheckCircle2;
 const summary=<><span className={'automatic-market-icon '+tone}><TrendingUp size={19}/></span><div className="automatic-market-heading"><strong>Automatic dealer comparisons</strong><span>{status?`${status.totalListings.toLocaleString()} collected listings · ${status.coverage.withMatches} of ${status.coverage.total} inventory vehicles with matches`:error?'Comparison status could not be loaded.':'Checking the shared comparison library…'}</span></div><span className={'automatic-market-state '+tone}><Icon size={13} className={Icon===LoaderCircle?'spin':undefined}/>{stateLabel}</span></>;
 if(!detailed)return <section className="automatic-market-bar" aria-label="Automatic dealer comparison status"><div className="automatic-market-summary">{summary}</div><div className="automatic-market-bar-details"><span><Clock3 size={12}/>Observed: {observed(status?.lastSuccessAt)}</span><span>{status?`Daily update target: 9:00 AM Eastern · $0 subscription · no per-VIN request fee`:'Shared collection · no per-VIN request fee'}</span>{failed>0&&<span className="automatic-market-warning">{failed} failed {failed===1?'source':'sources'}</span>}{waiting>0&&<span>{waiting} waiting / inactive</span>}{overdue>0&&<span className="automatic-market-warning">{overdue} refresh overdue</span>}{error&&<span className="automatic-market-warning">{error} {status?'Showing the last known status.':''}</span>}{onDetails&&<button className="text-button" onClick={onDetails}>Source details<ArrowRight size={13}/></button>}</div></section>;
 return <section className="card automatic-market-card" aria-label="Automatic dealer comparison sources"><div className="card-heading"><div><h2>Automatic dealer comparisons</h2><p>Public dealer listings collected on a shared schedule for the whole inventory.</p></div><TrendingUp size={21}/></div><div className="card-body"><div className="automatic-market-summary">{summary}</div>{error&&<p className="automatic-market-warning" role="status">{error} {status?'Showing the last known status.':''}</p>}<div className="automatic-market-metrics"><div><strong>{status?.totalListings.toLocaleString()??'—'}</strong><span>Collected listings</span></div><div><strong>{status?`${status.coverage.withMatches} / ${status.coverage.total}`:'—'}</strong><span>Inventory vehicles with matches</span></div><div><strong>{status?.coverage.withEnoughData??'—'}</strong><span>Vehicles with at least 3 matches</span></div><div><strong>$0</strong><span>Comparison subscription</span></div></div><p className="automatic-market-explainer">{status?`Daily update target: 9:00 AM Eastern.`:'Collection follows the server schedule.'} New collected listings appear automatically in vehicle comparisons. Shared collection has no per-VIN request fee. Hosting and maintenance costs are separate. Observed: {observed(status?.lastSuccessAt)} (Eastern).</p><details className="automatic-market-note"><summary><span>Dealer source details ({status?.sources.length??0}) · {failed} failed · {waiting} waiting{pendingDetails>0?` · ${pendingDetails.toLocaleString()} vehicle details pending`:""}</span><ChevronDown size={13}/></summary><div className="automatic-market-sources">{status?.sources.map(source=>{const href=safeSource(source.url);return <article className={'automatic-market-source '+source.status} key={source.id}><div className="automatic-market-source-title"><div><strong>{source.name}</strong>{href&&<a href={href} target="_blank" rel="noreferrer">Dealer source<ExternalLink size={11}/></a>}</div><span className={'automatic-market-state '+(source.status==='ready'&&!source.stale?'ready':'attention')}>{source.status==='refreshing'&&<LoaderCircle size={12} className="spin"/>}{sourceLabel(source)}</span></div><div className="automatic-market-source-count"><strong>{source.count.toLocaleString()}</strong> saved listings</div><p>{source.message|| (source.status==='pending'?'The first scheduled collection has not completed.':source.status==='error'?'The latest collection failed. Review the source status on the next scheduled check.':source.status==='ready'?'Latest scheduled collection completed.':'Collection is not currently active.')}</p>{(source.pendingDetails||0)>0&&<p className="help-text">{source.pendingDetails!.toLocaleString()} listings awaiting a vehicle-detail check. Verified asking prices remain available; missing specifications are not assumed.</p>}{(source.detailsFailed||0)>0&&<p className="automatic-market-warning">{source.detailsFailed!.toLocaleString()} vehicle-detail checks could not be verified in the last pass. Prior verified details keep their original dates.</p>}<dl><div><dt>Last observed</dt><dd>{observed(source.lastSuccessAt)}</dd></div><div><dt>Last attempt</dt><dd>{source.lastAttemptAt?observed(source.lastAttemptAt):'Not attempted yet'}</dd></div><div><dt>Refresh due after</dt><dd>{source.nextRunAt?observed(source.nextRunAt):'Not available'}</dd></div></dl></article>})}{noSources&&<p className="help-text">No public comparison sources are configured. Saved and manually supplied listings remain available.</p>}</div></details><details className="automatic-market-note"><summary>How to read this sample<ChevronDown size={13}/></summary><p>Coverage depends on the dealers collected and the vehicle filters. This is a selected listing sample; nationwide coverage is incomplete. Observation times reflect collection, and listings can change between scheduled checks. Asking prices are not sold values. Failed sources retain their last successful collection until replaced by a successful refresh.</p></details></div></section>;
}
