/** Fixed native-workspace routes. Never forward arbitrary hosts, paths or service identities. */
export const deskMethods:Record<string,readonly string[]>={
 'workspace':['GET'],'records':['POST','DELETE'],'live-market':['POST'],
 'market-status':['GET'],'vehicle/decode':['GET'],'vehicle/research':['GET'],
 'vehicle-log':['GET'],'import':['POST'],'dealer-import':['POST'],
 'export':['GET'],'restore':['POST'],'sync':['POST']
};
export function deskRoute(action:unknown,method:unknown,query:unknown){
 if(typeof action!=='string'||!action.startsWith('desk:'))throw Error('Unknown workspace action.');
 const path=action.slice(5);
 if(typeof method!=='string'||!Object.hasOwn(deskMethods,path)||!deskMethods[path].includes(method))throw Error('Workspace action is not allowed.');
 if(typeof query!=='string'||query.length>8192||query&&!query.startsWith('?')||/[\r\n#]/.test(query))throw Error('Invalid workspace query.');
 return {path,method,query};
}
