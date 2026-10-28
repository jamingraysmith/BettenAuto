#!/usr/bin/env python3
"""Normalize public competitor snapshots; never fabricate market listings.

Sharpe is collected from public HTML. Crown accepts saved public Dealer.com DOM
payloads when direct server requests are denied. Full-market coverage is never
claimed. Usage: python import_market.py [--refresh-sharpe]
"""
from __future__ import annotations
import argparse,datetime as dt,html,json,pathlib,re,time,urllib.request
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[1]
APPROOT=ROOT/'app' if (ROOT/'app/lib').is_dir() else ROOT
RAW=ROOT/'data/market-raw'
BASE='https://www.sharpecars.com'
START=BASE+'/inventory/used'
SHARPE_URLS=[START]+[START+'?paymenttype=cash&instock=true&intransit=true&inproduction=true&page='+str(i) for i in range(2,5)]

def now():return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')
def numeric(v):
 try:return float(re.sub(r'[$,\s]','',str(v))) if v not in (None,'') else None
 except ValueError:return None

class Scripts(HTMLParser):
 def __init__(self):super().__init__();self.current=None;self.scripts=[]
 def handle_starttag(self,tag,attrs):
  if tag=='script':self.current=[dict(attrs),'']
 def handle_data(self,data):
  if self.current is not None:self.current[1]+=data
 def handle_endtag(self,tag):
  if tag=='script' and self.current is not None:self.scripts.append(self.current);self.current=None

def sharpe_page(content,page_url,observed):
 parser=Scripts();parser.feed(content);vehicles=[];address={};geo={};count=None
 for attrs,script in parser.scripts:
  if attrs.get('type')!='application/ld+json':continue
  try:o=json.loads(script)
  except ValueError:continue
  if o.get('@type')=='Vehicle':vehicles.append(o)
  if o.get('@type')=='ItemList':count=o.get('numberOfItems')
  for item in o.get('@graph',[]):
   if item.get('@type')=='PostalAddress':address=item
   if item.get('@type')=='GeoCoordinates':geo=item
 m=re.search(r"var ga4ASCDataLayerVehicle = '(.*?)';",content)
 analytics={x['item_id']:x for x in json.loads(m.group(1))} if m else {}
 cards={}
 starts=list(re.finditer(r'<div data-itemid="([^"]+)"',content))
 for index,match in enumerate(starts):
  card=content[match.start():starts[index+1].start() if index+1<len(starts) else len(content)]
  vin=re.search(r'([A-HJ-NPR-Z0-9]{17})$',html.unescape(match.group(1)))
  if vin:cards[vin.group(1)]=card
 output=[]
 for v in vehicles:
  vin=v.get('vehicleIdentificationNumber');a=analytics.get(vin,{});card=cards.get(vin,'')
  miles=re.search(r'\bmiles="(\d+)"',card)
  # The visible Price Now and schema Offer agree. The card's sellingPrice is
  # the pre-fee figure; analytics item_price can be an older list/MSRP figure.
  # Never interpret an analytics-to-offer difference as a fee.
  selling=re.search(r'\bsellingPrice:\s*"([^"]+)"',card)
  price=numeric(v.get('offers',{}).get('price'));base_price=numeric(selling.group(1)) if selling else None
  certification=a.get('item_condition')=='cpo' or bool(re.search(r'\bcertified\b',v.get('name',''),re.I))
  output.append({'id':'market:'+vin,'vin':vin,'stock':v.get('sku'),'year':int(v['vehicleModelDate']),'make':v.get('brand',{}).get('name'),'model':v.get('model'),'trim':v.get('vehicleConfiguration',''),'condition':'Used','certified':certification,'price':price,'mileage':int(miles.group(1)) if miles else None,'dealer':'SHARPE Cars','location':address.get('addressLocality','Grand Rapids')+', '+address.get('addressRegion','MI'),'city':address.get('addressLocality','Grand Rapids'),'state':address.get('addressRegion','MI'),'postalCode':address.get('postalCode'),'address':address.get('streetAddress'),'latitude':geo.get('latitude'),'longitude':geo.get('longitude'),'distanceMiles':None,'url':v.get('url'),'sourceUrl':page_url,'source':'SHARPE Cars public used inventory','observedAt':observed,'pricingBasis':'Visible Price Now / schema Offer; includes stated dealer fee component where present','preFeePrice':base_price,'feeComponent':round(price-base_price,2) if price is not None and base_price is not None else None,'image':v.get('image',{}).get('contentUrl') if isinstance(v.get('image'),dict) else v.get('image'),'bodyStyle':a.get('item_type'),'transmission':v.get('vehicleTransmission'),'exterior':v.get('color'),'sourceCount':count,'coverage':'Complete source used inventory snapshot; not the whole local market'})
 return output,count

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

def dealercom_pages(paths,base,source_label,fallback_dealer,fallback_city):
 output=[];reports=[]
 for path in paths:
  payload=json.loads(path.read_text());wis=payload.get('WIS',{})
  if not wis and payload.get('states'):
   wis=next(iter(payload['states'].get('ws-inv-data',{}).values()),{}).get('WIS',{})
  if not wis:continue
  page=wis.get('pageInfo',{});observed=payload.get('observedAt',now());page_url=payload.get('url',base+'/used-inventory/index.htm')
  reports.append({'url':page_url,'observedAt':observed,'pageStart':page.get('pageStart'),'count':len(wis.get('inventory',[])),'expectedCount':page.get('totalCount')})
  for v in wis.get('inventory',[]):
   if v.get('type')=='new':continue
   attrs={a['name']:a.get('value') for a in v.get('trackingAttributes',[])};p=v.get('trackingPricing',{});vin=v.get('vin','').upper()
   prices=v.get('pricing',{}).get('dprice',[])
   # Dealer.com can mark a documentation-fee row final when the vehicle is
   # advertised PLEASE_CALL. A fee is not a vehicle asking price.
   finals=[row for row in prices if row.get('isFinalPrice') is True and not fee_only_price_row(row) and numeric(row.get('value')) is not None and numeric(row.get('value'))>0]
   final=finals[0] if len(finals)==1 else None
   price=numeric(final.get('value')) if final else None
   base_price=next((numeric(row.get('value')) for row in prices if row is not final and row.get('typeClass') in ('askingPrice','internetPrice')),None)
   fees=next((numeric(row.get('value')) for row in prices if row.get('typeClass')=='totalFees'),None)
   fee_evidence='; '.join(html.unescape(re.sub(r'<[^>]*>',' ',row.get('label') or row.get('typeClass') or 'Fee'))+' '+str(row.get('value')) for row in prices if fee_only_price_row(row) and numeric(row.get('value')) is not None)
   price_basis=('Visible final '+html.unescape(final.get('label','asking price'))+'; includes displayed dealer fees' if fees is not None else 'Visible final '+html.unescape(final.get('label','asking price'))+'; fee inclusion not independently verified') if final else 'No unique positive displayed final price; asking price unknown'
   if fee_evidence:price_basis+='; published charge rows: '+fee_evidence
   if not re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}',vin):continue
   account=wis.get('accounts',{}).get(v.get('accountId'),{});address=account.get('address',{});dealer=account.get('name') or address.get('accountName') or fallback_dealer;city=address.get('city') or fallback_city;state=address.get('state') or 'MI'
   from urllib.parse import urljoin
   output.append({'id':'market:'+vin,'vin':vin,'stock':v.get('stockNumber'),'year':v.get('year'),'make':v.get('make'),'model':v.get('model'),'trim':v.get('trim',''),'condition':'Wholesale' if 'wholesale' in dealer.lower() else 'Used','certified':bool(v.get('certified')),'price':price if price else None,'mileage':numeric(attrs.get('odometer')),'dealer':dealer,'accountId':v.get('accountId'),'location':city+', '+state,'city':city,'state':state,'postalCode':address.get('postalCode'),'address':address.get('firstLineAddress'),'latitude':None,'longitude':None,'distanceMiles':None,'url':urljoin(base,v.get('link','')),'sourceUrl':page_url,'source':source_label,'observedAt':observed,'pricingBasis':price_basis,'preFeePrice':base_price,'feeComponent':fees,'rawTrackingAsking':numeric(p.get('askingPrice')),'image':next((i.get('uri') for i in v.get('images',[]) if i.get('uri')),None),'bodyStyle':v.get('bodyStyle'),'drivetrain':attrs.get('driveLine'),'transmission':attrs.get('transmission'),'sourceCount':page.get('totalCount'),'coverage':'Captured source pages; completeness checked in market-source-report.json','wholesaleSource':'wholesale' in dealer.lower()})
 return output,reports

def load_expanded(path):
 records=json.loads(path.read_text()) if path.exists() else []
 if not isinstance(records,list):raise RuntimeError('Expanded sample must be an array; previous comparison seed preserved')
 for record in records:
  if record.get('scope')!='expanded' or not re.fullmatch(r'[A-HJ-NPR-Z0-9]{17}',str(record.get('vin',''))) or not record.get('observedAt') or not record.get('url'):raise RuntimeError('Invalid expanded-market provenance; previous comparison seed preserved')
 return records

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--refresh-sharpe',action='store_true');args=ap.parse_args();RAW.mkdir(parents=True,exist_ok=True)
 if args.refresh_sharpe:
  for index,url in enumerate(SHARPE_URLS):
   request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
   with urllib.request.urlopen(request,timeout=40) as response:content=response.read(8_000_000).decode('utf8')
   (RAW/('sharpe'+(str(index+1) if index else '')+'.html')).write_text(content);time.sleep(.4)
 all_records=[];source_pages=[];totals=set()
 for index,url in enumerate(SHARPE_URLS):
  path=RAW/('sharpe'+(str(index+1) if index else '')+'.html')
  if not path.exists():raise RuntimeError('Missing Sharpe source page '+str(path))
  observed=dt.datetime.fromtimestamp(path.stat().st_mtime,dt.timezone.utc).isoformat().replace('+00:00','Z');records,total=sharpe_page(path.read_text(),url,observed);all_records.extend(records);totals.add(total);source_pages.append({'url':url,'count':len(records),'expectedCount':total,'observedAt':observed})
 unique={r['vin']:r for r in all_records}
 if len(totals)!=1 or len(unique)!=next(iter(totals)):raise RuntimeError('Sharpe source total mismatch; previous comparison seed preserved')
 crown,crown_report=dealercom_pages(sorted(RAW.glob('crown-*.json')),'https://www.crownvolkswagen.com','Crown group via Crown Volkswagen public used inventory','Crown group','Holland');all_records.extend(crown)
 volvo,volvo_report=dealercom_pages(sorted(RAW.glob('volvo-kalamazoo-*.json')),'https://www.volvocarskalamazoo.com','Volvo Cars Kalamazoo public used inventory','Volvo Cars Kalamazoo','Kalamazoo');all_records.extend(volvo)
 mercedes,mercedes_report=dealercom_pages(sorted(RAW.glob('mercedes-kalamazoo-*.json')),'https://www.mercedesbenzofkalamazoo.com','Mercedes-Benz of Kalamazoo public used inventory','Mercedes-Benz of Kalamazoo','Kalamazoo');all_records.extend(mercedes)
 # Retain independently verified expanded-market observations with their original
 # timestamps. A regional refresh must never erase the wider comparison sample.
 expanded_path=APPROOT/'lib/seed-expanded-comps.json'
 expanded=load_expanded(expanded_path)
 all_records.extend(expanded)
 # A VIN can appear on more than one official group site; keep latest observation
 # and retain every captured source in provenance.
 merged={}
 for record in all_records:
  vin=record['vin'];prior=merged.get(vin);sources=prior.get('sourceListings',[]) if prior else []
  sources.append({'dealer':record['dealer'],'url':record['url'],'price':record['price'],'observedAt':record['observedAt']})
  if prior is None or record['observedAt']>=prior['observedAt']:merged[vin]={**record,'sourceListings':sources}
  else:prior['sourceListings']=sources
 output=sorted(merged.values(),key=lambda r:(r['dealer'],r['make'],str(r['model']),r['year'],r['vin']))
 seed=APPROOT/'lib/seed-comps.json';temp=seed.with_suffix('.tmp');temp.write_text(json.dumps(output,indent=2,ensure_ascii=False));temp.replace(seed)
 def source_report(name,records,pages):
  vins={r['vin'] for r in records};expected={r['expectedCount'] for r in pages}
  return {'dealer':name,'status':'complete source snapshot' if len(expected)==1 and len(vins)==next(iter(expected)) else 'partial or unavailable','uniqueCount':len(vins),'expectedCount':next(iter(expected)) if len(expected)==1 else sorted(expected),'pages':pages}
 report={'observedAt':now(),'uniqueVehicles':len(output),'retailVehicles':sum(r['condition']=='Used' for r in output),'wholesaleVehicles':sum(r['condition']=='Wholesale' for r in output),'expandedVehicles':len(expanded),'sources':[{'dealer':'Expanded US targeted listings','status':'selected verified listings; not complete nationwide coverage','uniqueCount':len({r['vin'] for r in expanded}),'pages':[{'url':r['url'],'observedAt':r['observedAt']} for r in expanded]},{'dealer':'SHARPE Cars','status':'complete source snapshot','expectedCount':next(iter(totals)),'uniqueCount':len(unique),'pages':source_pages},source_report('Crown group via Crown Volkswagen',crown,crown_report),source_report('Volvo Cars Kalamazoo',volvo,volvo_report),source_report('Mercedes-Benz of Kalamazoo',mercedes,mercedes_report)],'limitations':['Selected official dealer listings only, not a comprehensive local market.','Asking prices are not sold prices; mileage, trim, equipment, certification and fee bases require review before pricing decisions.','No invented distance or demand metric; distanceMiles stays null unless later computed from verified coordinates.','Public listings can change or be sold after the observation timestamp.']}
 (ROOT/'data/market-source-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))

if __name__=='__main__':main()
