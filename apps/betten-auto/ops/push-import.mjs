/** Send verified public source imports to this owner-private Site. Credentials enter on stdin only. */
import fs from 'node:fs/promises';
import readline from 'node:readline';
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);const value=k=>args[args.indexOf(k)+1];
if(!args.includes('--inventory')&&!args.includes('--market'))throw new Error('Use --inventory <JSON> and/or --market <JSON> [--partial-market] [--report <JSON>].');
if(process.stdin.isTTY)spawnSync('stty',['-echo'],{stdio:'inherit'});
console.error('Ready for Site service JSON on stdin (input hidden).');
const lineReader=readline.createInterface({input:process.stdin,terminal:false});
const input=await new Promise(resolve=>lineReader.once('line',resolve));lineReader.close();process.stdin.pause();
const credentials=JSON.parse(input);
const origin='https://betten-imports-inventory-desk.roundlake4.chatgpt.site';
if(credentials.origin&&credentials.origin!==origin)throw new Error('Unexpected Site origin.');
if(!credentials.token)throw new Error('Get the existing Site service credential through the supported Sites tool.');
const headers={'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+credentials.token};
async function request(path,body){const r=await fetch(origin+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});const raw=await r.text();let j;try{j=JSON.parse(raw)}catch{throw new Error('Site returned an unexpected response ('+r.status+').');}if(!r.ok)throw new Error(j.error||'Site request failed '+r.status);return j;}
const before=await request('/api/workspace');
const internal=w=>JSON.stringify(w.records.filter(r=>!(r.kind==='comp'&&r.data.publicListing)).map(r=>[r.id,r.revision,r.data]).sort((a,b)=>a[0].localeCompare(b[0])));
const beforeWork=internal(before),vehicles=args.includes('--inventory')?JSON.parse(await fs.readFile(value('--inventory'),'utf8')):null;
const inventoryResult=vehicles?await request('/api/import',{vehicles,source:'Betten Imports verified complete public browser import',complete:true,expectedCount:vehicles.length}):null;
let expectedMarket=[];
let marketResult=null;if(args.includes('--market')){const comparables=JSON.parse(await fs.readFile(value('--market'),'utf8'));const report=args.includes('--report')?JSON.parse(await fs.readFile(value('--report'),'utf8')):null;expectedMarket=comparables.map(c=>c.vin);marketResult=await request('/api/market-import',{comparables,complete:!args.includes('--partial-market'),expectedCount:comparables.length,report});}
const after=await request('/api/workspace');const actual=new Set(after.vehicles.map(v=>v.vin));if(vehicles&&(vehicles.some(v=>!actual.has(v.vin))||actual.size!==vehicles.length))throw new Error('Inventory readback coverage mismatch. Review before declaring success.');
const actualMarket=new Set(after.records.filter(r=>r.kind==='comp'&&r.data.publicListing).map(r=>r.data.vin));if(expectedMarket.some(vin=>!actualMarket.has(vin)))throw new Error('Market readback coverage mismatch.');
if(args.includes('--market')&&!args.includes('--partial-market')&&actualMarket.size!==expectedMarket.length)throw new Error('Complete market readback contains unexpected public VINs. Review preserved source snapshots before declaring success.');
if(internal(after)!==beforeWork)throw new Error('Dealer records changed during import; review audit before declaring success (another user may have edited concurrently).');
console.log(JSON.stringify({status:'verified',inventory:inventoryResult,market:marketResult,readbackVehicles:after.vehicles.length,publicComparables:after.records.filter(r=>r.kind==='comp'&&r.data.publicListing).length,dealerRecordsPreserved:true}));
