import fs from 'node:fs/promises';
await fs.mkdir(new URL('../public/data/',import.meta.url),{recursive:true});
await Promise.all([['seed-inventory.json','inventory.json'],['seed-comps.json','comparables.json']].map(([source,dest])=>fs.copyFile(new URL('../lib/'+source,import.meta.url),new URL('../public/data/'+dest,import.meta.url))));
console.log('Prepared public listing assets; internal dealer records remain in D1.');
