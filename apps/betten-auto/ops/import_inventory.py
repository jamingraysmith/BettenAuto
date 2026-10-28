#!/usr/bin/env python3
"""Import Betten Imports' public Dealer.com inventory with completeness checks.

No external packages.  Network failures never overwrite a previously good import.
Use --from-raw after the documented browser export when direct access is denied.
"""
from __future__ import annotations
import argparse, collections, datetime as dt, html, json, pathlib, re, sys, time
import urllib.error, urllib.parse, urllib.request
from html.parser import HTMLParser
ROOT = pathlib.Path(__file__).resolve().parents[1]
APPROOT = ROOT/'app' if (ROOT/'app/lib').is_dir() else ROOT
BASE = 'https://www.bettenimports.com'
START = BASE + '/all-inventory/index.htm'
ALLOWED = {'www.bettenimports.com', 'bettenimports.com'}

class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.scripts=[]; self.current=None; self.next_url=None
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag=='script': self.current=''
        if tag=='a' and ('Go to next page' in attrs.get('aria-label','') or attrs.get('rel')=='next'):
            self.next_url=attrs.get('href')
    def handle_data(self, data):
        if self.current is not None: self.current+=data
    def handle_endtag(self, tag):
        if tag=='script' and self.current is not None:
            self.scripts.append(self.current); self.current=None

def now(): return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')
def numeric(value):
    if value is None or value=='': return None
    try: return float(re.sub(r'[^0-9.\-]','',str(value)))
    except ValueError: return None

def plaintext(value):
    return html.unescape(re.sub(r'<[^>]+>',' ',value or '')).replace('Â®','®').replace('â€™','’').replace('â€“','–').strip()

def extract_states(scripts):
    result={}
    pattern=re.compile(r"^DDC\.WS\.state\['([^']+)'\]\['([^']+)'\] = (\{.*\});?\s*$")
    for script in scripts:
        for line in script.splitlines():
            match=pattern.match(line)
            if match:
                try: result.setdefault(match[1],{})[match[2]]=json.loads(match[3].removesuffix(';'))
                except json.JSONDecodeError: continue
    return result

def parse_page(content, url):
    parser=PageParser(); parser.feed(content)
    states=extract_states(parser.scripts)
    buses=list(states.get('ws-inv-data',{}).values())
    if not buses or not isinstance(buses[0].get('WIS',{}).get('inventory'),list):
        raise RuntimeError('No structured inventory on '+url+'; access denied or source markup changed.')
    data=buses[0]
    structured=[]
    for script in parser.scripts:
        try:
            obj=json.loads(script)
            if isinstance(obj,dict) and '@type' in obj: structured.append(obj)
        except (json.JSONDecodeError,ValueError): pass
    return {'url':url,'observedAt':now(),**data,'structuredData':structured},parser.next_url

def fetch(url):
    if urllib.parse.urlsplit(url).hostname not in ALLOWED: raise RuntimeError('Unapproved pagination host: '+url)
    request=urllib.request.Request(url,headers={'User-Agent':'BettenInventory/1.0 (Betten Imports internal inventory import)','Accept':'text/html'})
    with urllib.request.urlopen(request,timeout=35) as response:
        return response.read(12_000_000).decode('utf-8','replace')

def load_network(raw_dir):
    raw=[]; seen=set(); url=START
    for page_number in range(100):
        if url in seen: raise RuntimeError('Pagination repeated; refusing incomplete import.')
        seen.add(url)
        payload,next_url=parse_page(fetch(url),url)
        raw.append(payload)
        start=payload['WIS']['pageInfo']['pageStart']
        (raw_dir / ('bettenimports-'+str(start).zfill(3)+'.json')).write_text(json.dumps(payload,indent=2))
        page=payload['WIS']['pageInfo']
        if start+len(payload['WIS']['inventory'])>=page['totalCount']: break
        # Dealer.com encodes the same observed page offset in its pagination links.
        if not next_url:
            next_url='?start='+str(start+page['pageSize'])
        url=urllib.parse.urljoin(url,next_url)
        time.sleep(0.5)
    else: raise RuntimeError('Exceeded bounded page limit.')
    return raw

def fee_only_price_row(row):
    """A final-marked charge line is not a vehicle asking price."""
    kind=re.sub(r'[^a-z]','',str(row.get('typeClass','')).lower())
    if not re.search(r'price|value|msrp',kind) and (re.search(r'fees?$|tax(?:es)?$',kind) or kind in ('registration','title','license','licensing')):
        return True
    label=html.unescape(re.sub(r'<[^>]*>',' ',str(row.get('label','')))).lower()
    if re.search(r'\b(?:price|msrp|retail|selling|sale)\b',label) or not re.search(r'\b(?:fees?|tax(?:es)?)\b',label):
        return False
    rest=re.sub(r'\b(?:total|dealer|documentation|document|doc|miscellaneous|misc|electronic|title|titling|registration|license|licensing|sales|state|local|excise|taxes|tax|fees|fee|pre|delivery|service|processing|administrative|admin|filing|dmv|and|or)\b','',label)
    return not re.sub(r'[^a-z]','',rest)

def displayed_pricing(vehicle, schema=None):
    """Read the dealer's displayed final row without applying conditional offers.

    Dealer.com tracking values and JSON-LD can lag configured public incentives.
    Only an explicitly marked final numeric row establishes the current asking price.
    Retain competing source values for audit, never as an undisclosed fallback.
    """
    source_rows=vehicle.get('pricing',{}).get('dprice',[])
    rows=[{k:r[k] for k in ('label','type','typeClass','value','isFinalPrice','isDiscount') if k in r}
          for r in source_rows if isinstance(r,dict)]
    finals=[r for r in source_rows if r.get('isFinalPrice') is True and not fee_only_price_row(r)]
    final=finals[0] if len(finals)==1 else {}
    price=numeric(final.get('value'))
    if price is not None and price<=0: price=None
    label=plaintext(final.get('label',''))
    tracking=numeric(vehicle.get('trackingPricing',{}).get('askingPrice'))
    schema_price=numeric((schema or {}).get('offers',{}).get('price'))
    return {'price':price,'priceLabel':label or None,
            'pricingBasis':('Website displayed final '+label+'; published offers already included where shown; conditional offers not applied. Fee inclusion not independently verified.' if price is not None else 'No numeric final asking price published; request current price from dealership.'),
            'pricingRows':rows,'trackingAskingPrice':tracking if tracking else None,
            'schemaOfferPrice':schema_price if schema_price else None,
            'preFeePrice':None,'feeComponent':None}

def normalize(payload, previous):
    output=[]
    schemas={}
    for s in payload.get('structuredData',[]):
        for car in s.get('about',{}).get('offers',{}).get('itemOffered',[]):
            schemas[car.get('vehicleIdentificationNumber')]=car
    for v in payload['WIS']['inventory']:
        vin=v.get('vin','').upper(); attrs={x['name']:x.get('value') for x in v.get('trackingAttributes',[])}
        prices=v.get('trackingPricing',{}); old=previous.get(vin,{})
        car=schemas.get(vin,{})
        source=urllib.parse.urljoin(BASE,v.get('link',''))
        photos=list(dict.fromkeys(x['uri'] for x in v.get('images',[]) if x.get('uri','').startswith('https://')))
        pricing=displayed_pricing(v,car)
        condition='New' if v.get('type')=='new' else 'Used'
        record={
            'id':vin or v['uuid'],'uuid':v['uuid'],'vin':vin,
            'stockNumber':v.get('stockNumber'),'stock':v.get('stockNumber'),
            'year':v.get('year'),'make':v.get('make'),'model':v.get('model'),'trim':v.get('trim',''),
            'title':' '.join(v.get('title',[])), 'condition':condition,'sourceCondition':v.get('condition'),
            'certified':bool(v.get('certified')),**pricing,'msrp':numeric(prices.get('msrp')),
            'mileage':numeric(attrs.get('odometer')),'bodyStyle':v.get('bodyStyle'),
            'exteriorColor':attrs.get('exteriorColor'),'exterior':attrs.get('exteriorColor'),
            'interiorColor':attrs.get('interiorColor'),'interior':attrs.get('interiorColor'),
            'engine':attrs.get('engine'),'engineSize':attrs.get('engineSize'),
            'transmission':attrs.get('transmission'),'drivetrain':plaintext(attrs.get('driveLine')),
            'fuelType':v.get('fuelType') or attrs.get('fuelType'),
            'inventoryDate':v.get('inventoryDate'),
            'inventoryDateMeaning':'Website inventory date; not verified dealership acquisition date',
            'photos':photos,'image':photos[0] if photos else None,'photoCount':len(photos),
            'photoProviders':list(dict.fromkeys(x.get('provider') for x in v.get('images',[]) if x.get('provider'))),
            'description':car.get('description') or old.get('description') or '', 'features':old.get('features',[]),
            'sourceUrl':source,'url':source,'sourceUrls':[source],
            'source':'Betten Imports website','dealer':'Betten Imports','accountId':v.get('accountId'),
            'observedAt':payload['observedAt'],'firstSeenAt':old.get('firstSeenAt') or payload['observedAt'],
            'firstSeen':old.get('firstSeenAt') or payload['observedAt'],
            'historyReports':[{'label':x.get('imageAlt','Vehicle history'),'url':x['href']} for x in v.get('callout',[]) if 'carfax.com' in x.get('href','')],
            'sourceStatus':v.get('status'),'modelCode':v.get('modelCode'),
        }
        for field in ('dealerNotes','equipment','standardFeatures','packagesOptions','detailObservedAt','cityFuelEconomy','highwayFuelEconomy'):
            if old.get(field) is not None: record[field]=old[field]
        output.append(record)
    return output

def enrich(record,details_dir):
    path=details_dir/(record['vin']+'.json')
    if not path.exists(): return False
    detail=json.loads(path.read_text()); states=detail.get('states',{})
    one=lambda key: next(iter(states.get(key,{}).values()),{})
    spec=one('ws-quick-specs').get('quickSpecs',{})
    if str(spec.get('vin','')).upper()!=record['vin']:
        return False  # Keep prior details; never attach another vehicle's data.
    notes=one('ws-dealernotes').get('comments')
    if notes: record['description']=plaintext(notes); record['dealerNotes']=plaintext(notes)
    features=one('ws-hl-features').get('features',[])
    options=one('ws-pckg-accessories').get('options',[])
    record['features']=list(dict.fromkeys([plaintext(x[1]) for x in features if isinstance(x,list) and len(x)>1]+[plaintext(x.get('text','')) for x in options if isinstance(x,dict)]))
    record['equipment']=one('ws-detailed-specs').get('equipment',{})
    record['standardFeatures']=one('ws-standard-features').get('standardFeatures',[])
    record['packagesOptions']=one('ws-packages-options').get('packages',[])
    if spec.get('engine'): record['engine']=plaintext(spec['engine'])
    for source_key,keys in {'exteriorColor':('exteriorColor','exterior'),'interiorColor':('interiorColor','interior'),'transmission':('transmission',),'driveLine':('drivetrain',)}.items():
        if spec.get(source_key):
            for key in keys: record[key]=plaintext(spec[source_key])
    if spec.get('odometer') is not None: record['mileage']=numeric(spec['odometer'])
    for key in ('cityFuelEconomy','highwayFuelEconomy'):
        if spec.get(key) is not None: record[key]=spec[key]
    record['detailObservedAt']=detail.get('observedAt')
    return True

def compact_for_app(records):
    """Keep all display specs; omit provider IDs and sorting weights from the app seed.

    The complete normalized evidence remains in data/inventory.json. Compact equipment
    is [{category, items:[{label, detail?, availability?}]}] in source category order.
    """
    output=[]
    for record in records:
        compact=dict(record)
        equipment=record.get('equipment',{})
        if isinstance(equipment,list):
            compact['equipment']=equipment
            output.append(compact)
            continue
        specs={item.get('id'):item.get('spec',{}) for item in equipment.get('specification',[])}
        used=set(); groups=[]
        def display_item(spec):
            item={'label':plaintext(spec.get('description',''))}
            if spec.get('detail') is not None: item['detail']=plaintext(str(spec['detail']))
            if spec.get('availability') is not None: item['availability']=spec['availability']
            return item
        for category in equipment.get('specCategories',[]):
            items=[]
            for spec_id in category.get('specIds',[]):
                if spec_id in specs:
                    items.append(display_item(specs[spec_id]));used.add(spec_id)
            if items: groups.append({'category':category.get('category','Specifications'),'items':items})
        remaining=[display_item(spec) for spec_id,spec in specs.items() if spec_id not in used]
        if remaining: groups.append({'category':'Additional specifications','items':remaining})
        compact['equipment']=groups
        output.append(compact)
    return output

def atomic_json(path,data,compact=False):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(data,indent=None if compact else 2,ensure_ascii=False,separators=(',',':') if compact else None))
    temp.replace(path)

def load_previous_inventory(target,seed):
    """Fresh checkouts retain verified public details from the shipped seed."""
    path=target if target.exists() else seed
    if not path.exists(): return {}
    records=json.loads(path.read_text())
    if not isinstance(records,list) or any(not isinstance(v,dict) or not v.get('vin') for v in records):
        raise RuntimeError('Previous inventory is malformed; keep the prior import.')
    return {v['vin']:v for v in records}

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--from-raw',action='store_true',help='Normalize previously captured public browser DOM payloads')
    ap.add_argument('--raw-directory','--raw-dir',type=pathlib.Path,default=ROOT/'data/raw')
    args=ap.parse_args(); args.raw_directory.mkdir(parents=True,exist_ok=True)
    target=ROOT/'data/inventory.json'; previous=load_previous_inventory(target,APPROOT/'lib/seed-inventory.json')
    try:
        pages=[json.loads(p.read_text()) for p in sorted(args.raw_directory.glob('bettenimports-*.json'))] if args.from_raw else load_network(args.raw_directory)
        if not pages: raise RuntimeError('No inventory source pages available.')
        expected={p['WIS']['pageInfo']['totalCount'] for p in pages}
        if len(expected)!=1: raise RuntimeError('Source count changed during pagination; rerun rather than publish partial inventory.')
        expected=expected.pop(); records=[]
        for payload in pages: records.extend(normalize(payload,previous))
        seen={}; duplicates=[]
        for v in records:
            if not re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}',v['vin']): raise RuntimeError('Invalid or missing VIN in source: '+str(v['vin']))
            if v['vin'] in seen: duplicates.append(v['vin'])
            else: seen[v['vin']]=v
        records=list(seen.values())
        if len(records)!=expected: raise RuntimeError(f'Completeness mismatch: {len(records)} unique VINs vs {expected} advertised. Previous import retained.')
        detail_count=sum(enrich(v,args.raw_directory/'details') for v in records)
        report={
            'status':'complete','sourceUrl':START,'source':'Betten Imports combined public inventory',
            'observedAt':max(p['observedAt'] for p in pages),'startedAt':min(p['observedAt'] for p in pages),
            'expectedCount':expected,'importedCount':len(records),'uniqueVins':len(records),
            'pages':len(pages),'duplicatesRemoved':duplicates,'newCount':sum(v['condition']=='New' for v in records),
            'usedCount':sum(v['condition']=='Used' for v in records),'certifiedCount':sum(v['certified'] for v in records),
            'byMake':dict(collections.Counter(v['make'] for v in records)),
            'pricingAudit':{
                'basis':'Explicit numeric isFinalPrice row in public pricing.dprice; tracking and JSON-LD values retained only as evidence.',
                'displayedFinalCount':sum(v['price'] is not None for v in records),
                'unknownFinalCount':sum(v['price'] is None for v in records),
                'differsFromTrackingCount':sum(v['price']!=v['trackingAskingPrice'] for v in records),
                'differsFromSchemaOfferCount':sum(v['price']!=v['schemaOfferPrice'] for v in records),
                'discrepancies':[{'vin':v['vin'],'condition':v['condition'],'displayedFinal':v['price'],'priceLabel':v['priceLabel'],'trackingAskingPrice':v['trackingAskingPrice'],'schemaOfferPrice':v['schemaOfferPrice']} for v in records if v['price']!=v['trackingAskingPrice'] or v['price']!=v['schemaOfferPrice']],
                'conditionalOffersApplied':False,
                'feeAmountsInferred':False,
            },
            'photoCount':sum(v['photoCount'] for v in records),'detailEnrichedCount':detail_count,
            'facetEvidence':'data/raw/combined-facets.json',
            'detailFailedCount':len(json.loads((args.raw_directory/'detail-errors.json').read_text())) if (args.raw_directory/'detail-errors.json').exists() else 0,
            'detailRetainedCount':sum(bool(v.get('detailObservedAt')) for v in records)-detail_count,
            'detailLastObservedAt':max((v.get('detailObservedAt','') for v in records),default=None),
            'fieldCoverage':{key:sum(v.get(key) is not None and v.get(key)!='' and v.get(key)!=[] for v in records) for key in ('vin','stock','year','make','model','trim','price','msrp','mileage','bodyStyle','exterior','interior','engine','transmission','drivetrain','inventoryDate','image','description','features')},
            'sourcePages':[{'url':p['url'],'pageStart':p['WIS']['pageInfo']['pageStart'],'count':len(p['WIS']['inventory']),'observedAt':p['observedAt']} for p in pages],
            'officialSites':[{'name':'Betten Imports','url':'https://www.bettenimports.com/'},{'name':'Betten Mercedes-Benz','url':'https://www.betten.mercedesdealer.com/'},{'name':'Betten Volkswagen','url':'https://www.bettenvolkswagen.com/'},{'name':'Betten Volvo Cars','url':'https://www.bettenvolvo.com/'}],
            'limitations':['Website inventory date is not independently verified dealership acquisition date.','No dealership cost, sold history, reconditioning invoices, DMS data or licensed market valuations are exposed in this public inventory.','Direct HTTP access from this execution host returned 403; current successful import used public browser DOM. Unattended refresh needs an authorized dealer feed or successful source network access.','Combined Betten Imports public feed was imported; brand-specific feed parity has not yet been independently certified.']
        }
        atomic_json(target,records);atomic_json(ROOT/'data/source-report.json',report)
        atomic_json(APPROOT/'lib/seed-inventory.json',compact_for_app(records),compact=True);atomic_json(APPROOT/'lib/seed-sources.json',report,compact=True)
        print(json.dumps({'status':'complete','count':len(records),'photos':report['photoCount'],'details':detail_count,'seed':str(APPROOT/'lib/seed-inventory.json')}))
    except Exception as exc:
        atomic_json(ROOT/'data/last-import-attempt.json',{'status':'failed','attemptedAt':now(),'error':str(exc),'previousImportRetained':target.exists()})
        print('Import failed; previous inventory retained: '+str(exc),file=sys.stderr);return 1
    return 0
if __name__=='__main__': sys.exit(main())
