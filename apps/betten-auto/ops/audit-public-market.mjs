/** Read saved public coverage; no provider calls and no private dealer records in output. */
import readline from 'node:readline';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
const output=process.argv[process.argv.indexOf('--out')+1];
if(!process.argv.includes('--out')||!path.isAbsolute(output))throw new Error('Use --out <absolute-public-audit-directory>.');
const origin='https://betten-imports-inventory-desk.roundlake4.chatgpt.site';
if(process.stdin.isTTY)spawnSync('stty',['-echo'],{stdio:'inherit'});
console.error('Ready for Site service JSON on stdin (input hidden).');
const reader=readline.createInterface({input:process.stdin,terminal:false});const line=await new Promise(resolve=>reader.once('line',resolve));reader.close();process.stdin.pause();
const {token}=JSON.parse(line);if(!token)throw new Error('Use the existing private Site service credential.');
async function read(endpoint){const response=await fetch(origin+endpoint,{headers:{'OAI-Sites-Authorization':'Bearer '+token},signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error('Site coverage read failed.');return response.json();}
const [status,workspace]=await Promise.all([read('/api/public-market/status'),read('/api/workspace')]);
const publicListings=workspace.records.filter(r=>r.kind==='comp'&&r.data.publicListing).map(r=>r.data),byVin=new Map((status.coverage.vehicles||[]).map(v=>[v.vin,v]));
const vehicles=workspace.vehicles.map(v=>({vin:v.vin,stock:v.stock,title:[v.year,v.make,v.model,v.trim].filter(Boolean).join(' '),year:v.year,make:v.make,model:v.model,trim:v.trim,condition:v.condition,mileage:v.mileage,certified:v.certified,drivetrain:v.drivetrain,engine:v.engine,bodyStyle:v.bodyStyle,price:v.price,...byVin.get(v.vin)}));
const report={checkedAt:new Date().toISOString(),totalListings:status.totalListings,activeSources:status.activeSources,sourceCount:status.sources.length,coverage:{total:status.coverage.total,withMatches:status.coverage.withMatches,withEnoughData:status.coverage.withEnoughData},failed:status.sources.filter(s=>s.status==='error').map(s=>({id:s.id,message:s.message})),pending:status.sources.filter(s=>s.status==='pending'||s.pendingDetails>0).map(s=>({id:s.id,pendingDetails:s.pendingDetails})),vehicles};
await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'coverage.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(output,'public-listings.json'),JSON.stringify(publicListings));
console.log(JSON.stringify({...report,vehicles:undefined}));
