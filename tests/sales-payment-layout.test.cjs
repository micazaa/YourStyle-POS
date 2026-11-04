const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const legacyHeaders = ['Timestamp','Receipt ID','Cashier','Product Code','Item Name','Size','Category','Quantity','Selling Price','Discount','Fee Charged to Customer','Fee Absorbed by Merchant','Net Total','Payment Method','Reference Number','Status','Cash Received','Change Given','Authorized By','Reason / Void Reason','Original Receipt ID','Sales Line ID','Entry Source','Sync Status','Processed At','Sync Error','Price Source','Sale Reference ID','Payment 1 Method','Payment 1 Amount','Payment 1 Reference','Payment 2 Method','Payment 2 Amount','Payment 2 Reference'];
const order = [...Array(15).keys(),28,29,30,31,32,33,16,17,15,18,19,20,21,22,23,24,25,26,27];
const reorder = row => order.map(i => row[i] === undefined ? '' : row[i]);

function context(grouped) {
  const rows=[grouped ? reorder(legacyHeaders) : legacyHeaders.slice()];
  const sheet={getMaxColumns:()=>34,getMaxRows:()=>100,getLastRow:()=>rows.length,getImages:()=>[],
    getDataRange:()=>({getValues:()=>rows}),
    getRange(row,col,height=1,width=1){return {
      getDisplayValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>String(rows[row-1+i]?.[col-1+j]??''))),
      getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>rows[row-1+i]?.[col-1+j]??'')),
      getNotes:()=>Array.from({length:height},()=>['']),
      setValues(values){values.forEach((line,i)=>{rows[row-1+i] ||= [];line.forEach((value,j)=>{rows[row-1+i][col-1+j]=value;});});return this;},
      setValue(value){rows[row-1][col-1]=value;},clearContent(){rows[row-1][col-1]='';},setDataValidation(){},
      createTextFinder:()=>({matchCase(){return this;},matchEntireCell(){return this;},findNext:()=>null})
    };}};
  const c=vm.createContext({
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:name=>name==='Sales Log'?sheet:null}),flush(){},newDataValidation:()=>({requireValueInList(){return this;},setAllowInvalid(){return this;},build:()=>({})})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){},hasLock:()=>true})},
    Session:{getScriptTimeZone:()=> 'Asia/Manila'},
    Utilities:{getUuid:()=> 'TEST',formatDate(value,_zone,format){const date=new Date(new Date(value).getTime()+8*3600000);return format==='yyyy-MM-dd'?date.toISOString().slice(0,10):'11/04/2026';},parseDate:value=>new Date(value.slice(0,10)+'T00:00:00+08:00')},
    assertAppRequest_(){},assertInventoryNotReserved_(){},invalidateInventoryRead_(){},getProductMaster_:()=>[],getSellableInventory:()=>[],
    generateSalesLineId:()=> 'SL-TEST',deductInventoryStock(){},employeeIsOic_:()=>false,
    ACCESS_REQUEST_CONTEXT_:{actor:{name:'Cashier'}}
  });
  for(const name of ['Constants','Utils','Sales','Reservations','ReportHelpers','SalesAutomation'])vm.runInContext(fs.readFileSync('Backend/'+name+'.js','utf8'),c);
  return {c,sheet,rows};
}

test('checkout writes payment amounts, references and status into both supported layouts',()=>{
  for(const grouped of [false,true]) {
    const {c,rows}=context(grouped);
    const response=JSON.parse(c.executeCheckoutBackend([{code:'600001',name:'Yellow',size:'',category:'PINS',quantity:1,price:1000}],
      'Cash + GCash','','YS-TEST','percentage',0,'Cashier',250,50,false,
      [{method:'Cash',amount:200,reference:''},{method:'GCash',amount:800,reference:'000123'}]));
    assert.equal(response.success,true,response.message);
    const field=name=>rows[1][rows[0].indexOf(name)];
    assert.equal(field('Payment 1 Amount'),200);assert.equal(field('Payment 2 Amount'),800);
    assert.equal(field('Payment 2 Reference'),'000123');assert.equal(field('Cash Received'),250);
    assert.equal(field('Change Given'),50);assert.equal(field('Status'),'COMPLETED');
    assert.equal(field('Sales Line ID'),'SL-TEST');assert.equal(field('Sync Status'),'PROCESSED');
  }
});

test('cashier and manager reports preserve payment totals, fees and sale names after moving columns',()=>{
  const results=[];
  for(const grouped of [false,true]) {
    const {c,rows}=context(grouped),row=Array(34).fill('');
    Object.assign(row,{0:new Date('2026-11-04T10:00:00+08:00'),1:'YS-TEST',2:'Cashier',3:'600001',4:'Yellow',6:'PINS',7:1,8:1000,11:25.6,12:974.4,13:'Cash + Credit Card',15:'COMPLETED',16:250,17:50,26:'SALE',28:'Cash',29:200,31:'Credit Card',32:800,33:'000123'});
    rows.push(grouped?reorder(row):row);
    c.getSalesLogSheet_();
    const metrics=c.collectSalesMetrics(rows,'2026-11-04','Cashier');
    assert.equal(metrics.totalSales,974.4);assert.equal(metrics.payments.Cash.gross,200);
    assert.equal(metrics.payments['Credit Card'].gross,800);assert.equal(metrics.totalCashReceived,250);assert.equal(metrics.totalChangeGiven,50);
    assert.match(Object.values(metrics.items)[0].name,/sale/i);
    assert.equal(c.getExpectedCashForManager('2026-11-04').expectedCashDrawer,200);
    results.push(JSON.stringify(metrics));
  }
  assert.equal(results[0],results[1]);
});

test('manual sales sync reads the moved IDs and updates only the moved processing fields',()=>{
  const {c,rows,sheet}=context(true),row=Array(34).fill('');
  Object.assign(row,{1:'YS-MANUAL',2:'Cashier',3:'600001',4:'Yellow',6:'PINS',7:1,8:100,15:'COMPLETED',21:'SL-MANUAL',22:'MANUAL',23:'PENDING'});
  rows.push(reorder(row));c.getSalesLogSheet_();
  const movements=[];c.salesMovementLineIds_=()=>({});c.ensureManualSaleInventoryItem_=()=>({skipMovement:false});c.changeInventoryStock=value=>movements.push(value);
  const result=c.processSalesRows_(sheet,[2]);
  assert.equal(result.processed,1);assert.equal(result.errors,0);assert.equal(movements[0].sourceLineId,'SL-MANUAL');
  assert.equal(rows[1][rows[0].indexOf('Sync Status')],'PROCESSED');assert.equal(rows[1][23],'COMPLETED');
  assert.equal(rows[1][15],'');
});

test('history reads the moved status and supports switching back to the backed-up layout',()=>{
  const {c,rows}=context(true),row=Array(34).fill('');
  Object.assign(row,{0:new Date('2026-11-04T10:00:00+08:00'),1:'YS-TEST',2:'Cashier',3:'600001',4:'Yellow',7:1,12:100,13:'Cash',15:'COMPLETED'});
  rows.push(reorder(row));
  const result=c.getTransactionHistory('Cashier','2026-11-04','2026-11-04',true);
  assert.equal(result.success,true,result.message);assert.equal(result.transactions[0].total,100);assert.equal(result.transactions[0].status,'COMPLETED');
  c.configureSalesLogColumnsFromHeaders_(legacyHeaders);
  assert.equal(vm.runInContext('SALES_COL.STATUS',c),16);
  assert.throws(()=>c.configureSalesLogColumnsFromHeaders_(Array(34).fill('')),/not recognized/);
});

test('SYNC stays outside payment columns and expands space for its AJ anchor',()=>{
  const {c,sheet}=context(true);
  let columns=34,anchor;
  sheet.getMaxColumns=()=>columns;
  sheet.insertColumnsAfter=(after,count)=>{assert.equal(after,34);columns+=count;};
  const image={getAltTextTitle:()=>vm.runInContext('SALES_SYNC_BUTTON_TITLE',c),setAnchorCell(range){anchor=range;return this;}};
  for(const method of ['setWidth','setHeight','setAltTextTitle','setAltTextDescription','assignScript'])image[method]=()=>image;
  sheet.getImages=()=>[image];
  c.createOrRepairSalesSyncButton_();
  assert.equal(columns,38);assert.ok(anchor);
});
