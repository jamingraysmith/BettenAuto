import * as workspace from '../app/api/workspace/route';
import * as records from '../app/api/records/route';
import * as liveMarket from '../app/api/live-market/route';
import * as marketStatus from '../app/api/market-status/route';
import * as decode from '../app/api/vehicle/decode/route';
import * as research from '../app/api/vehicle/research/route';
import * as vehicleLog from '../app/api/vehicle-log/route';
import * as inventoryImport from '../app/api/import/route';
import * as dealerImport from '../app/api/dealer-import/route';
import * as exportData from '../app/api/export/route';
import * as restore from '../app/api/restore/route';
import * as sync from '../app/api/sync/route';
import {deskRoute} from './hub-desk-policy';
import {can,type Access} from './access-model';
const routes:Record<string,Record<string,(req:Request)=>Promise<Response>>>={workspace:{GET:workspace.GET},records,'live-market':liveMarket,'market-status':marketStatus,'vehicle/decode':decode,'vehicle/research':research,'vehicle-log':vehicleLog,import:inventoryImport,'dealer-import':dealerImport,export:{GET:exportData.GET},restore,sync};
export async function dispatchDesk(p:any,access:Access,origin:string){
 if(access.service||!access.email||(!access.owner&&access.status!=='active'))throw Error('Your Hub account needs active employee access.');
 if(!['inventory','pricing','keys','appraisals','recon','merchandising','wholesale','sourcing','reports','connections'].some(k=>can(access,k)))throw Error('Your account does not have access to BettenAuto.');
 const {path,method,query}=deskRoute(p.action,p.method,p.query||'');
 // Each existing handler rechecks the employee's permissions and preserves field projections and revisions.
 const request=new Request(origin+'/api/'+path+query,{method,headers:{'oai-authenticated-user-email':access.email,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(p.body??{})})});
 return routes[path][method](request);
}
