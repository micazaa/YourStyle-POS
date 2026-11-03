const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup(columns=20) {
  const rows=[Array(columns).fill(''),Array(columns).fill(''),Array(columns).fill('')];
  rows[0][17]='Custom Cost Price';
  if(columns>=20){rows[0][18]='Delivery ID';rows[0][19]='Date Delivered';}
  rows[1][0]='YF1';rows[1][2]='MNE';rows[1][3]='YourFinds';rows[1][4]='UNIQUE';rows[1][5]='INCOMPLETE';rows[1][17]=123;
  rows[2][0]='YF2';rows[2][3]='YourFinds';rows[2][4]='UNIQUE';rows[2][5]='ACTIVE';
  let maxColumns=columns;
  const formats=[],reads=[];
  const sheet={getLastRow:()=>rows.length,getMaxRows:()=>20,getMaxColumns:()=>maxColumns,
    insertColumnsAfter(after,count){assert.equal(after,maxColumns);maxColumns+=count;},
    getRange(row,col,height=1,width=1){
      const values=()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>rows[row-1+i]?.[col-1+j]??''));
      return {getValues(){reads.push([row,col,height,width]);return values();},getDisplayValues(){return values().map(line=>line.map(String));},
        setValues(data){assert.equal(data.length,height);data.forEach((line,i)=>{assert.equal(line.length,width);rows[row-1+i] ||= [];line.forEach((value,j)=>{rows[row-1+i][col-1+j]=value;});});},
        setNumberFormat(format){formats.push([col,format]);}};
    }};
  const c=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:name=>name==='Inventory'?sheet:null})},
    getProductMaster_:()=>[],Session:{getScriptTimeZone:()=> 'Asia/Manila'},
    Utilities:{formatDate(date,tz){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;}}});
  for(const file of ['Constants','GeneralDelivery','Inventory'])vm.runInContext(fs.readFileSync('Backend/'+file+'.js','utf8'),c);
  return {c,rows,sheet,formats,reads};
}

test('inventory reads stored delivery fields even on fast management reads, without loading movement history',()=>{
  const {c,rows}=setup();rows[1][18]='YFD-20261026-123';rows[1][19]='2026-10-26';
  c.getInventoryDeliveryMetadataByCode_=()=>{throw Error('Unexpected ledger read');};
  const item=c.getFullInventory({products:[],includeDeliveryMetadata:false})[0];
  assert.equal(item.deliveryId,'YFD-20261026-123');assert.equal(item.dateDelivered,'2026-10-26');assert.equal(item.deliveryMetadataLoaded,true);
  assert.equal(item.status,'INCOMPLETE');assert.equal(rows[1][17],123);
});

test('old inventory remains readable until the two optional delivery columns are added',()=>{
  const {c,rows,sheet}=setup(18);
  assert.equal(c.getFullInventory({products:[],includeDeliveryMetadata:false})[0].deliveryMetadataLoaded,false);
  c.getInventoryDeliveryMetadataByCode_=()=>({YF1:{deliveryId:'OLD',timestamp:'2026-10-01'}});
  assert.equal(c.getFullInventory()[0].deliveryId,'OLD');
  c.ensureInventoryDeliveryMetadataColumns_(sheet);
  assert.deepEqual(rows[0].slice(18),['Delivery ID','Date Delivered']);
  assert.equal(rows[1][17],123);
});

test('receipt metadata populates new items, preserves A:R and can be written again safely',()=>{
  const {c,rows,sheet}=setup(18),before=rows.map(row=>row.slice(0,18));
  c.writeInventoryDeliveryMetadata_(sheet,[2,3],'YFD-20261026-123','2026-10-26');
  assert.deepEqual(rows.map(row=>row.slice(0,18)),before);
  assert.deepEqual(rows[0].slice(18),['Delivery ID','Date Delivered']);
  assert.equal(c.formatInventoryDateForClient(rows[1][19]),'2026-10-26');assert.equal(rows[2][18],'YFD-20261026-123');
  c.writeInventoryDeliveryMetadata_(sheet,[2,2,3],'YFD-20261026-123','2026-10-26');
  assert.deepEqual(rows.map(row=>row.slice(0,18)),before);
});

test('migration refuses occupied or unlabelled S:T cells and keeps custom costs untouched',()=>{
  for(const conflict of ['header','data']){
    const {c,rows,sheet}=setup();
    rows[0][18]=conflict==='header'?'Other data':'';rows[0][19]='';rows[1][18]='Keep this';
    const before=JSON.stringify(rows);
    assert.throws(()=>c.ensureInventoryDeliveryMetadataColumns_(sheet),/already used|unlabelled/);
    assert.equal(JSON.stringify(rows),before);
  }
});

test('partial receipt metadata failures restore the old delivery links',()=>{
  const {c,rows,sheet}=setup();
  rows.push(Array(20).fill(''));
  rows[1][18]='ORIGINAL';rows[1][19]='2026-10-01';
  const before=JSON.stringify(rows),getRange=sheet.getRange;
  let fail=true;
  sheet.getRange=function(row,col,height,width){
    const range=getRange(row,col,height,width),setValues=range.setValues;
    range.setValues=function(values){
      if(row===4 && col===19 && fail){fail=false;throw Error('Write failed');}
      return setValues(values);
    };
    return range;
  };
  assert.throws(()=>c.writeInventoryDeliveryMetadata_(sheet,[2,4],'YFD-NEW','2026-10-26'),/Write failed/);
  assert.equal(JSON.stringify(rows),before);
});

test('bundle distribution carries the actual receipt date independently of its display format',()=>{
  const {c}=setup();
  const idx=vm.runInContext('DELIVERY_IDX',c),raw=Array(20).fill('');
  for(const [key,value] of Object.entries({DELIVERY_ID:'YSD-20261026-123',DELIVERY_DATE:new Date('2026-10-26T00:00:00+08:00'),DELIVERY_TYPE:'YOURSTYLE',RECEIVE_MODE:'BULK',TYPE:'PINS',STATUS:'PENDING',BUNDLE_QTY:1,ESTIMATED_QTY:80}))raw[idx[key]]=value;
  c.SpreadsheetApp.getActiveSpreadsheet=()=>({getSheetByName:()=>({getLastRow:()=>2,getRange:()=>({getValues:()=>[raw],getDisplayValues:()=>[raw.map((value,index)=>index===idx.DELIVERY_DATE?'10/26/2026':String(value))]})})});
  c.getBulkBundleProgress_=()=>({bundles:[],remarks:'',bundlesWithActivity:0});
  assert.equal(c.getBulkHolderDetails('YSD-20261026-123',2).holder.deliveryDate,'2026-10-26');
});
