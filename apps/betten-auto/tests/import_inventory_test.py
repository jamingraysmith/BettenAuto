import importlib.util,json,pathlib,tempfile,unittest
spec=importlib.util.spec_from_file_location('betten_inventory',pathlib.Path(__file__).resolve().parents[1]/'ops/import_inventory.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class InventoryPreservation(unittest.TestCase):
 def test_tampa_misc_fee_final_is_not_the_vehicle_ask_and_all_charge_evidence_survives(self):
  rows=[{'label':'Selling Price','typeClass':'retailValue','value':'PLEASE_CALL'},{'label':'Pre-Delivery Service Fee','typeClass':'documentFee','value':'$998'},{'isFinalPrice':True,'label':'Electronic Title Fee','typeClass':'miscFee','value':'$294'},{'label':'Volvo Cars Tampa Price','typeClass':'internetPrice','value':'PLEASE_CALL'}]
  result=module.displayed_pricing({'pricing':{'dprice':rows},'trackingPricing':{'askingPrice':998}})
  self.assertIsNone(result['price']);self.assertEqual(result['pricingRows'],rows)
  for charge in ({'typeClass':'registrationFees'},{'typeClass':'taxes'},{'label':'Electronic Title Fee'},{'label':'Sales Tax'}):
   self.assertIsNone(module.displayed_pricing({'pricing':{'dprice':[{'isFinalPrice':True,'value':'$294',**charge}]}})['price'])
  for final in ({'typeClass':'internetPrice','label':'Selling Price'},{'typeClass':'priceAfterFees','label':'Vehicle Price Including Fees'}):
   self.assertEqual(module.displayed_pricing({'pricing':{'dprice':rows+[{'isFinalPrice':True,'value':'$294',**final}]}})['price'],294)
 def test_a_final_documentation_fee_cannot_be_used_as_the_vehicle_price(self):
  result=module.displayed_pricing({'pricing':{'dprice':[{'typeClass':'askingPrice','value':'PLEASE_CALL'},{'isFinalPrice':True,'typeClass':'totalFees','value':'$314'},{'typeClass':'priceAfterFees','value':'PLEASE_CALL'}]},'trackingPricing':{'askingPrice':314}},{'offers':{'price':314}})
  self.assertIsNone(result['price']);self.assertEqual(result['pricingRows'][1]['value'],'$314')
 def test_fresh_checkout_uses_seed_details_and_keeps_their_original_observation_date(self):
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory);seed=root/'seed.json';target=root/'missing.json'
   previous={'vin':'3VWGW7BU6TM020418','features':['Verified option'],'equipment':[{'category':'Powertrain','items':[{'label':'Engine liters','detail':'1.5L'}]}],'description':'Verified public description','detailObservedAt':'2026-10-20T14:00:00Z','firstSeenAt':'2026-10-01T00:00:00Z'}
   seed.write_text(json.dumps([previous]));loaded=module.load_previous_inventory(target,seed)
   payload={'observedAt':'2026-10-21T14:00:00Z','WIS':{'inventory':[{'vin':previous['vin'],'uuid':'one','title':['2026','Volkswagen','Jetta'],'type':'used','year':2026,'make':'Volkswagen','model':'Jetta','trim':'SEL','images':[],'link':'/used/one.htm','trackingAttributes':[],'pricing':{'dprice':[{'isFinalPrice':True,'value':'28162'}]}}]}}
   result=module.normalize(payload,loaded)[0]
   self.assertEqual(result['price'],28162)
   for field in ('features','equipment','description','detailObservedAt','firstSeenAt'):self.assertEqual(result[field],previous[field])
 def test_latest_normalized_inventory_has_precedence_over_the_seed(self):
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory);seed=root/'seed.json';target=root/'inventory.json';seed.write_text('[{"vin":"one","description":"old"}]');target.write_text('[{"vin":"one","description":"new"}]')
   self.assertEqual(module.load_previous_inventory(target,seed)['one']['description'],'new')
 def test_a_mismatched_detail_capture_cannot_replace_retained_vehicle_details(self):
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory);record={'vin':'3VWGW7BU6TM020418','engine':'Verified original engine','detailObservedAt':'2026-10-20T00:00:00Z'}
   (root/(record['vin']+'.json')).write_text(json.dumps({'observedAt':'2026-10-21T00:00:00Z','states':{'ws-quick-specs':{'one':{'quickSpecs':{'vin':'WP1AF2A53JLB71283','engine':'Different vehicle'}}}}}))
   self.assertFalse(module.enrich(record,root));self.assertEqual(record['engine'],'Verified original engine');self.assertEqual(record['detailObservedAt'],'2026-10-20T00:00:00Z')

if __name__=='__main__':unittest.main()
