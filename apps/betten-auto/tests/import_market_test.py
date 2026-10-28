import importlib.util,json,pathlib,tempfile,unittest
spec=importlib.util.spec_from_file_location('market',pathlib.Path(__file__).resolve().parents[1]/'ops/import_market.py')
market=importlib.util.module_from_spec(spec);spec.loader.exec_module(market)
class MarketImportTests(unittest.TestCase):
 def test_tampa_call_for_price_excludes_misc_title_fee_and_preserves_explicit_charges(self):
  rows=[{'label':'Selling Price','typeClass':'retailValue','value':'PLEASE_CALL'},{'label':'Pre-Delivery Service Fee','typeClass':'documentFee','value':'$998'},{'isFinalPrice':True,'label':'Electronic Title Fee','typeClass':'miscFee','value':'$294'},{'label':'Volvo Cars Tampa Price','typeClass':'internetPrice','value':'PLEASE_CALL'}]
  with tempfile.TemporaryDirectory() as directory:
   filename=pathlib.Path(directory)/'tampa.json'
   def read(prices):
    vehicles=[{'vin':vin,'type':'used','make':'Jeep' if i==0 else 'Kia','model':'Cherokee' if i==0 else 'Forte','year':2017 if i==0 else 2020,'pricing':{'dprice':prices},'trackingPricing':{'askingPrice':998}} for i,vin in enumerate(('1C4PJLDS3HW526818','3KPF24ADXLE223963'))]
    filename.write_text(json.dumps({'observedAt':'2026-10-22T13:20:00Z','WIS':{'inventory':vehicles}}));return market.dealercom_pages([filename],'https://dealer.example','Official inventory','Dealer','City')[0]
   for listing in read(rows):
    self.assertIsNone(listing['price']);self.assertIn('Electronic Title Fee $294',listing['pricingBasis']);self.assertIn('Pre-Delivery Service Fee $998',listing['pricingBasis'])
   for charge in ({'typeClass':'titleFee'},{'typeClass':'registrationFees'},{'typeClass':'taxes'},{'label':'Electronic Title Fee'}):
    self.assertIsNone(read([{'isFinalPrice':True,'value':'$294',**charge}])[0]['price'])
   for final in ({'typeClass':'internetPrice','label':'Selling Price'},{'typeClass':'priceAfterFees','label':'Vehicle Price Including Fees'}):
    self.assertEqual(read(rows+[{'isFinalPrice':True,'value':'$294',**final}])[0]['price'],294)
 def test_visible_final_price_is_required_and_tracking_cannot_supply_it(self):
  with tempfile.TemporaryDirectory() as d:
   path=pathlib.Path(d)/'page.json'
   for rows,expected in [([],None),([{'isFinalPrice':True,'value':0}],None),([{'typeClass':'askingPrice','value':'PLEASE_CALL'},{'isFinalPrice':True,'typeClass':'totalFees','value':'$314'},{'typeClass':'priceAfterFees','value':'PLEASE_CALL'}],None),([{'isFinalPrice':True,'typeClass':'totalFees','value':'$314'},{'isFinalPrice':True,'typeClass':'priceAfterFees','value':'$27,814'}],27814),([{'isFinalPrice':True,'value':26000},{'isFinalPrice':True,'value':27000}],None),([{'isFinalPrice':True,'value':27500}],27500)]:
    v={'vin':'3VWGW7BU0TM006871','type':'used','make':'Volkswagen','model':'Jetta','year':2026,'trim':'SEL','pricing':{'dprice':rows},'trackingPricing':{'askingPrice':99999},'trackingAttributes':[{'name':'odometer','value':9583}]}
    path.write_text(json.dumps({'observedAt':'2026-10-20T15:50:53Z','WIS':{'inventory':[v]}}))
    actual,_=market.dealercom_pages([path],'https://dealer.example','Official inventory','Dealer','City')
    self.assertEqual(actual[0]['price'],expected)
 def test_expanded_observation_is_retained_without_changing_its_time(self):
  with tempfile.TemporaryDirectory() as d:
   path=pathlib.Path(d)/'expanded.json'
   records=[{'vin':'3VWGW7BU0TM006871','scope':'expanded','observedAt':'2026-10-20T15:50:53Z','url':'https://dealer.example/vehicle','price':25348}]
   path.write_text(json.dumps(records));self.assertEqual(market.load_expanded(path),records)
   self.assertEqual(market.load_expanded(pathlib.Path(d)/'absent.json'),[])
   records[0]['vin']='invalid';path.write_text(json.dumps(records))
   with self.assertRaises(RuntimeError):market.load_expanded(path)
if __name__=='__main__':unittest.main()
