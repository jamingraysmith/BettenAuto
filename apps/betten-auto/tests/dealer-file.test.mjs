import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import readExcelFile from 'read-excel-file/node';
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/dealer-file.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {dealerRowsFromObjects,dealerRowsFromSheets,prepareDealerRows}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const vin='3VWGW7BU6TM020418';
test('real XLSX report recognizes title rows, VIN and numeric Cost without importing age or unrelated values',async()=>{
 const sheets=await readExcelFile(fileURLToPath(new URL('./fixtures/dealer-report-synthetic.xlsx',import.meta.url)));
 assert.deepEqual(dealerRowsFromSheets(sheets),{sheet:'Inventory',rows:[{vin,cost:12345}],skippedRows:[]});
});
test('multiline headers, blank values, zero costs and formatted Excel dates retain their meaning',()=>{
 const result=dealerRowsFromSheets([{sheet:'Export',data:[['VIN','Unit\nCost','Acquisition Date','Age'],[vin,0,new Date('2026-10-20T00:00:00Z'),15],['Total',null,null,null]]}]);assert.deepEqual(result.rows,[{vin,cost:0,acquiredDate:'2026-10-20'}]);
 assert.deepEqual(dealerRowsFromObjects([{VIN:vin,Cost:'',Age:3,'Last $ Change':46317.5}]),[{vin}]);
 assert.deepEqual(dealerRowsFromObjects([{VIN:vin,Cost:'$12,345.67'}]),[{vin,cost:12345.67}]);
});
test('ambiguous sheets, duplicate VINs, invalid money and unsafe date guesses fail before writes',()=>{
 const sheet={sheet:'One',data:[['VIN','Cost'],[vin,50]]};
 assert.throws(()=>dealerRowsFromSheets([sheet,{...sheet,sheet:'Two'}]),/More than one worksheet/);
 assert.throws(()=>dealerRowsFromObjects([{VIN:vin,Cost:1},{VIN:vin,Cost:2}]),/Duplicate VIN/);
 for(const value of [-1,'N/A',true])assert.throws(()=>dealerRowsFromObjects([{VIN:vin,Cost:value}]),/Invalid cost/);
 for(const date of [46317,'2026-02-30','10/20/2026'])assert.throws(()=>dealerRowsFromObjects([{VIN:vin,acquiredDate:date}]),/date/);
 assert.throws(()=>dealerRowsFromSheets([{sheet:'Bad',data:[['VIN','Cost','Unit Cost'],[vin,1,2]]}]),/duplicate financial/);
});

test('wholesale serials are explicitly skipped with actual Excel rows; retail VIN errors still stop import',()=>{
 const data=[['Report title'],['VIN','Vehicle','Stock #','Disp','Cost'],[vin,'Car','P1','Retail',50],['JH29G0B118209','1970 Dodge Challenger','P22966','Wholesale',8509],['VSX1T16773','1978 Vespa','P18293','Wholesale',2497]];
 const r=dealerRowsFromSheets([{sheet:'Sheet1',data}]);assert.deepEqual(r.rows,[{vin,cost:50}]);assert.deepEqual(r.skippedRows.map(r=>[r.row,r.stock,r.identifier]),[[4,'P22966','JH29G0B118209'],[5,'P18293','VSX1T16773']]);
 assert.throws(()=>dealerRowsFromSheets([{sheet:'Sheet1',data:[...data,['BAD','Retail car','P2','Retail',100]]}]),/row 6 needs/);
 assert.throws(()=>prepareDealerRows([{VIN:'BAD',Disp:'Retail',Cost:20}]),/17-character/);
 assert.throws(()=>prepareDealerRows([{VIN:vin,Disp:'Wholesale',Cost:-1}]),/Invalid cost/);
});

test('Age derives a stock date only from an explicit report date and preserves date provenance',()=>{
 const s=[{sheet:'Report',data:[['VIN','Cost','Age'],[vin,12345,436]]}];
 const r=dealerRowsFromSheets(s,'2026-10-23');assert.equal(r.rows[0].acquiredDate,'2025-08-13');assert.deepEqual(r.rows[0].stockAgeEvidence,{reportDate:'2026-10-23',age:436});
 assert.equal(dealerRowsFromSheets(s).rows[0].acquiredDate,undefined);
 assert.throws(()=>dealerRowsFromSheets(s,'2026-02-30'),/report date/);
 const explicit=dealerRowsFromSheets([{sheet:'Report',data:[['VIN','Age','Acquisition Date'],[vin,436,'2025-01-01']]}],'2026-10-23');assert.equal(explicit.rows[0].acquiredDate,'2025-01-01');assert.equal(explicit.rows[0].stockAgeEvidence,undefined);
});
