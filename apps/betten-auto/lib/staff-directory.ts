export function cleanStaffDirectory(input:unknown){
 if(!Array.isArray(input)||input.length>100)throw new Error('The directory supports up to 100 people.');
 const ids=new Set<string>();return input.map((row:any)=>{
 if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('Invalid staff entry.');
 const id=row.id||crypto.randomUUID();if(typeof id!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(id)||ids.has(id))throw new Error('Invalid or duplicate staff ID.');ids.add(id);
 const result:Record<string,string>={id};for(const [key,max]of Object.entries({name:150,role:150,department:100,extension:20,phone:60,mobile:60,email:254,location:150})){
 const value=row[key]??'';if(typeof value!=='string'||value.length>max)throw new Error('Invalid staff '+key+'.');result[key]=value.trim();}
 if(!result.name)throw new Error('Enter the employee name.');if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))throw new Error('Enter a valid staff email.');return result;
 });
}
