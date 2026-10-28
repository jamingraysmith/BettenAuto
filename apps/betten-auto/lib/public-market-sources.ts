import nationalSources from './public-market-national-sources.json';
export type PublicMarketSource={id:string;name:string;url:string;kind:'jsonld'|'dealercom';detailsLimit?:number;condition:'New'|'Used';scope:'regional'|'expanded';maxPages:number;refreshHours:number;pagination?:'page'|'pg'|'start';dealer?:string;city?:string;state?:string};

// Reviewed first-party public result pages. Never accept a caller-supplied URL.
// Add a source only after checking its robots policy, markup and pagination.
export const publicMarketSources:PublicMarketSource[]=([
 {id:'sharpe-used',name:'SHARPE Cars · used',url:'https://www.sharpecars.com/inventory/used',kind:'jsonld',condition:'Used',scope:'regional',maxPages:12,refreshHours:24,pagination:'page',dealer:'SHARPE Cars',city:'Grand Rapids',state:'MI'},
 {id:'sesi-used',name:'Sesi Volvo Cars Ann Arbor · used',url:'https://www.sesivolvocars.com/inventory/used',kind:'jsonld',condition:'Used',scope:'regional',maxPages:12,refreshHours:24,pagination:'page',dealer:'Sesi Volvo Cars',city:'Ann Arbor',state:'MI'},
 {id:'sesi-new-volvo',name:'Sesi Volvo Cars Ann Arbor · new',url:'https://www.sesivolvocars.com/inventory/new/volvo',kind:'jsonld',condition:'New',scope:'regional',maxPages:12,refreshHours:24,pagination:'page',dealer:'Sesi Volvo Cars',city:'Ann Arbor',state:'MI'},
 {id:'muller-used',name:'Muller Volkswagen · used',url:'https://www.mullervolkswagen.com/inventory/used',kind:'jsonld',condition:'Used',scope:'regional',maxPages:12,refreshHours:24,pagination:'page',dealer:'Muller Volkswagen',city:'Highland Park',state:'IL'},
 {id:'muller-new-volkswagen',name:'Muller Volkswagen · new',url:'https://www.mullervolkswagen.com/inventory/new/volkswagen',kind:'jsonld',condition:'New',scope:'regional',maxPages:16,refreshHours:24,pagination:'page',dealer:'Muller Volkswagen',city:'Highland Park',state:'IL'},
 {id:'castle-vw-used',name:'Castle Volkswagen Schaumburg · used',url:'https://www.castlevwcars.com/inventory/used',kind:'jsonld',condition:'Used',scope:'regional',maxPages:12,refreshHours:24,pagination:'page',dealer:'Castle Volkswagen Schaumburg',city:'Schaumburg',state:'IL'},
 {id:'autobarn-group-used',name:'Autobarn VW/Subaru group · used',url:'https://www.vwofchicagoland.com/inventory/used',kind:'jsonld',condition:'Used',scope:'regional',maxPages:12,refreshHours:24,pagination:'page',dealer:'Autobarn VW/Subaru group'},
 {id:'mb-bloomington-group-used',name:'Mercedes-Benz Bloomington/Peoria group · used',url:'https://www.mercedesbloomington.com/inventory/used',kind:'jsonld',condition:'Used',scope:'expanded',maxPages:12,refreshHours:24,pagination:'page',dealer:'Mercedes-Benz Bloomington/Peoria group'},
 ...['volkswagen','volvo','mercedes-benz'].map(make=>({id:'rohrman-used-'+make,name:'Rohrman group · used '+({volkswagen:'Volkswagen',volvo:'Volvo','mercedes-benz':'Mercedes-Benz'}[make]),url:'https://www.rohrman.com/cars/used/'+make+'/',kind:'jsonld' as const,condition:'Used' as const,scope:'expanded' as const,maxPages:12,refreshHours:24,pagination:'pg' as const,dealer:'Rohrman Auto Group'})),
 {id:'rohrman-new-volkswagen',name:'Rohrman group · new Volkswagen',url:'https://www.rohrman.com/cars/new/volkswagen/',kind:'jsonld',condition:'New',scope:'expanded',maxPages:12,refreshHours:24,pagination:'pg',dealer:'Rohrman Auto Group'},
 ...[
  ['montrosevolvocars','Montrose Volvo Cars','Cleveland','OH'],
  ['volvocarskeene','Volvo Cars Keene','East Swanzey','NH'],
  ['volvocarspaloalto','Volvo Cars Palo Alto','Palo Alto','CA'],
  ['volvoofmemphis','Volvo of Memphis','Cordova','TN'],
 ].flatMap(([host,dealer,city,state])=>['New','Used'].map(condition=>({id:host+'-'+condition.toLowerCase(),name:dealer+' · '+condition.toLowerCase()+' Volvo',url:'https://www.'+host+'.com/inventory/'+condition.toLowerCase()+'/volvo',kind:'jsonld' as const,condition:condition as 'New'|'Used',scope:'expanded' as const,maxPages:12,refreshHours:24,pagination:'page' as const,dealer,city,state}))),
 {id:'vw-oakland-new',name:'Volkswagen of Oakland · new',url:'https://vwofoakland.com/inventory/new/volkswagen',kind:'jsonld',condition:'New',scope:'expanded',maxPages:12,refreshHours:24,pagination:'page',dealer:'Volkswagen of Oakland',city:'Oakland',state:'CA'},
 {id:'vw-oakland-used',name:'Volkswagen of Oakland · used',url:'https://vwofoakland.com/inventory/used/volkswagen',kind:'jsonld',condition:'Used',scope:'expanded',maxPages:12,refreshHours:24,pagination:'page',dealer:'Volkswagen of Oakland',city:'Oakland',state:'CA'},
 {id:'mb-temecula-used',name:'Mercedes-Benz of Temecula · used',url:'https://www.mbtemecula.com/inventory/used/mercedes-benz',kind:'jsonld',condition:'Used',scope:'expanded',maxPages:12,refreshHours:24,pagination:'page',dealer:'Mercedes-Benz of Temecula',city:'Temecula',state:'CA'},
 ...['gla','glb','glc','gle','gls','c-class','e-class','cla'].map(model=>({id:'mb-temecula-new-'+model,name:'Mercedes-Benz of Temecula · new '+model.toUpperCase(),url:'https://www.mbtemecula.com/inventory/new/mercedes-benz/'+model,kind:'jsonld' as const,condition:'New' as const,scope:'expanded' as const,maxPages:12,refreshHours:24,pagination:'page' as const,dealer:'Mercedes-Benz of Temecula',city:'Temecula',state:'CA'})),

 ...nationalSources as PublicMarketSource[],
 ] as PublicMarketSource[]).map(source=>({...source,refreshHours:24,detailsLimit:source.kind==='jsonld'&&/volvo|mercedes|mb-/.test(source.id)?12:0}));
