/** Embed only exact approved application origins. A configured name or ID alone is not trusted. */
export function embeddedApplication(app:{url?:unknown}|null|undefined){
 if(typeof app?.url!=='string')return null;
 try{const url=new URL(app.url);if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
 if(url.hostname==='key-track.org'&&url.pathname==='/')return {frameUrl:'https://key-track.org/',signInUrl:'https://key-track.org/'};
 if(!['vauto.signin.coxautoinc.com','provision.vauto.app.coxautoinc.com'].includes(url.hostname))return null;
 if(url.hostname==='vauto.signin.coxautoinc.com'&&url.pathname!=='/')return null;
 if(url.hostname==='provision.vauto.app.coxautoinc.com'&&!url.pathname.startsWith('/Va/'))return null;
 return {frameUrl:'https://provision.vauto.app.coxautoinc.com/Va/Dashboard/Provision.aspx?tab=VehicleSummary',signInUrl:'https://vauto.signin.coxautoinc.com/?solutionID=VAT_prod&clientId=68e5c360aa114799a67e94c4d587ff65'};
 }catch{return null}
}
