import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/public-market-details.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parsePublicMarketDetails:parse}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const vin='4JGFB6FB5VB728789',url='https://dealer.example/viewdetails/new/'+vin.toLowerCase()+'/2027-mercedes-benz-gle-suv';
const schema=(changes={})=>({'@type':'Vehicle',vehicleIdentificationNumber:vin,url,vehicleModelDate:'2027',brand:{name:'Mercedes-Benz'},model:'GLE',vehicleConfiguration:'GLE 450',name:'New 2027 Mercedes-Benz GLE GLE 450',itemCondition:'https://schema.org/NewCondition',vehicleEngine:{name:'3.0L I6 Turbo'},bodyType:'SUV',mileageFromOdometer:{value:0,unitCode:'SMI'},offers:{price:78405},...changes});
const page=(vehicle,body='',record='')=>`<script type='application/ld&#x2B;json'>${JSON.stringify({'@graph':[vehicle]})}</script><script>${record}</script>${body}`;
const detail=(label,value)=>`<div><div class="details-key font-weight-bold">${label}:</div><div class="details-value">${value}</div></div>`;
const region=body=>`<div class="oem-vehicle-details">${body}</div>`;

test('actual Temecula-style VDP recovers observed AWD/4MATIC but leaves an unadvertised new zero-mileage unknown and never returns prices',()=>{
 const html=page(schema(),region(`<div v-html="validateDescription('Black 2027 Mercedes-Benz GLE GLE 450 4MATIC&#xAE; 4MATIC&#xAE; 9-Speed Automatic 3.0L I6 Turbo.')"></div>${detail('Drive Type','AWD')}${detail('Engine','3.0L I6 Turbo')}`),`var vin = "${vin.toLowerCase()}";var make='Mercedes-Benz';var model='GLE';var year='2027';var styleDescription='';var driveTrain='AWD';`);
 const result=parse(html,url,vin);assert.equal(result.trim,'GLE 450 4MATIC');assert.equal(result.drivetrain,'AWD');assert.equal(result.engine,'3.0L I6 Turbo');assert.equal(result.mileage,undefined);assert.equal(result.certified,undefined);assert.deepEqual(result.conflicts,[]);assert.equal(Object.hasOwn(result,'price'),false);assert.equal(Object.hasOwn(result,'offers'),false);assert.equal(JSON.stringify(result).includes('78405'),false);
});

test('actual Memphis-style same-VIN style, explicit CPO path and visible miles preserve full Volvo powertrain/theme',()=>{
 const v='YV4L12UM0S2594810',u='https://dealer.example/viewdetails/cpo/'+v.toLowerCase()+'/2025-volvo-xc40-sport-utility';
 const html=page(schema({vehicleIdentificationNumber:v,url:u,brand:{name:'Volvo'},model:'XC40',vehicleModelDate:'2025',vehicleConfiguration:'Ultra Dark Theme',name:'Used 2025 Volvo XC40 Ultra Dark Theme',itemCondition:'https://schema.org/UsedCondition',mileageFromOdometer:{value:12410,unitCode:'SMI'}}),region(detail('Drive Type','AWD')+detail('Mileage','12,410 Miles')),`var vin="${v.toLowerCase()}";var year='2025';var make='Volvo';var model='XC40';var styleDescription='B5 AWD Ultra Dark Theme';var driveTrain='AWD';`);
 const result=parse(html,u,v);assert.equal(result.trim,'B5 AWD Ultra Dark Theme');assert.equal(result.mileage,12410);assert.equal(result.certified,true);assert.equal(result.drivetrain,'AWD');assert.match(result.evidence.certified,/same-VIN/);assert.match(result.evidence.trim,/styleDescription/);
});

test('wrong primary VIN or URL cannot use a related car or unrelated metadata record',()=>{
 const other='4JGFB6FB4VB750704',otherUrl=url.replace(vin.toLowerCase(),other.toLowerCase());
 assert.equal(parse(page(schema({vehicleIdentificationNumber:other,url:otherUrl}),region(detail('Drive Type','AWD')),`var vin="${other}";var styleDescription='B5 AWD Ultra';`),otherUrl,vin),null);
 assert.equal(parse(page(schema(),region(detail('Drive Type','AWD'))),otherUrl,vin),null);
 assert.equal(parse(page(schema({url:otherUrl})),url,vin),null);
});

test('an unrelated script style cannot enrich a verified primary vehicle',()=>{
 const result=parse(page(schema(),'',`var vin='4JGFB6FB4VB750704';var styleDescription='GLE 450 4MATIC';var driveTrain='AWD';`),url,vin);
 assert.equal(result.trim,'GLE 450');assert.equal(result.drivetrain,undefined);
});

test('generic certified navigation and another VIN CPO link never certify the primary used listing',()=>{
 const u=url.replace('/new/','/used/');const result=parse(page(schema({url:u,name:'Used 2027 Mercedes-Benz GLE GLE 450',itemCondition:'https://schema.org/UsedCondition'}),'<nav>Certified Pre-Owned Inventory</nav><a href="/viewdetails/cpo/4jgfb6fb4vb750704/car">Certified</a>'),u,vin);assert.equal(result.certified,undefined);
});

test('kilometers and unspecified odometer units are not silently treated as miles',()=>{
 for(const unit of ['KMT','KM','']){const result=parse(page(schema({mileageFromOdometer:{value:25000,unitCode:unit}}),region(detail('Mileage','25,000 Kilometers'))),url,vin);assert.equal(result.mileage,undefined);}
});

test('an explicit visible zero-mile odometer is distinguishable from an omitted new odometer',()=>{
 const result=parse(page(schema(),region(detail('Mileage','0 Miles'))),url,vin);assert.equal(result.mileage,0);assert.match(result.evidence.mileage,/Visible/);
});

test('contradictory drivetrain and mileage observations stay unresolved rather than choosing the favorable record',()=>{
 const result=parse(page(schema({driveWheelConfiguration:'RearWheelDrive',mileageFromOdometer:{value:1200,unitCode:'SMI'}}),region(detail('Drive Type','AWD')+detail('Mileage','1,250 Miles'))),url,vin);assert.equal(result.drivetrain,undefined);assert.equal(result.mileage,undefined);assert.deepEqual(result.conflicts,['drivetrain','mileage']);
});

test('literal data parsing cannot execute public scripts or accept incompatible identity/style records',()=>{
 globalThis.__publicDetailsExecuted=false;
 const result=parse(page(schema(),'',`var vin="${vin}";var make='Other Make';var model='Other Model';var styleDescription='GLE 450 4MATIC';globalThis.__publicDetailsExecuted=true;`),url,vin);assert.equal(globalThis.__publicDetailsExecuted,false);assert.equal(result.trim,'GLE 450');delete globalThis.__publicDetailsExecuted;
});

test('visible generic details outside the primary vehicle detail region cannot supply metadata',()=>{
 const result=parse(page(schema({vehicleEngine:undefined,bodyType:undefined,mileageFromOdometer:undefined}),detail('Drive Type','AWD')+detail('Mileage','20 Miles')),url,vin);assert.equal(result.drivetrain,undefined);assert.equal(result.mileage,undefined);
});
