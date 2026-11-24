const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const legacyHeaders = ['Timestamp','Receipt ID','Cashier','Product Code','Item Name','Size','Category','Quantity','Selling Price','Discount','Fee Charged to Customer','Fee Absorbed by Merchant','Net Total','Payment Method','Reference Number','Status','Cash Received','Change Given','Authorized By','Reason / Void Reason','Original Receipt ID','Sales Line ID','Entry Source','Sync Status','Processed At','Sync Error','Price Source','Sale Reference ID','Payment 1 Method','Payment 1 Amount','Payment 1 Reference','Payment 2 Method','Payment 2 Amount','Payment 2 Reference'];
const order = [...Array(15).keys(),28,29,30,31,32,33,16,17,15,18,19,20,21,22,23,24,25,26,27];
const reorder = row => order.map(i => row[i] === undefined ? '' : row[i]);

function context(grouped) {
  const rows=[grouped ? reorder(legacyHeaders) : legacyHeaders.slice()];
  const calls={validations:[],headers:0,images:0};
  const sheet={getMaxColumns:()=>34,getMaxRows:()=>100,getLastRow:()=>rows.length,getImages(){calls.images++;return [];},
    getDataRange:()=>({getValues:()=>rows}),
    getRange(row,col,height=1,width=1){return {
      getDisplayValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>String(rows[row-1+i]?.[col-1+j]??''))),
      getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>rows[row-1+i]?.[col-1+j]??'')),
      getNotes:()=>Array.from({length:height},()=>['']),
      setValues(values){if(row===1)calls.headers++;values.forEach((line,i)=>{rows[row-1+i] ||= [];line.forEach((value,j)=>{rows[row-1+i][col-1+j]=value;});});return this;},
      setValue(value){rows[row-1][col-1]=value;},clearContent(){rows[row-1][col-1]='';},setDataValidation(){calls.validations.push({row,col,height,width});},
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
  return {c,sheet,rows,calls};
}

test('checkout returns after the sale save without rebuilding the full inventory catalogue',()=>{
  const {c,rows}=context(true);
  c.getSellableInventory=()=>{throw Error('Checkout must not rebuild the catalogue');};
  const result=JSON.parse(c.executeCheckoutBackend([{code:'600001',name:'Yellow',category:'PINS',quantity:1,price:100}],
    'Cash','N/A','YS-FAST','percentage',0,'Cashier',100,0,false));
  assert.equal(result.success,true,result.message);assert.equal(rows.length,2);
  assert.equal(result.updatedInventory,undefined);
});

test('checkout payment rules touch only the new rows and leave existing headers and button alone',()=>{
  const {c,sheet,calls}=context(true);sheet.getMaxRows=()=>10000;
  c.getSalesLogSheet_();c.ensureSalesLogSplitPaymentColumns_(sheet,3);
  assert.deepEqual(calls.validations,[{row:2,col:14,height:3,width:1}]);
  assert.equal(calls.headers,0);assert.equal(calls.images,0);
});

test('payment setup expands a full Sales Log only enough for the new transaction',()=>{
  const {c,sheet,rows,calls}=context(true);rows.push([],[]);
  let maximum=3;
  sheet.getMaxRows=()=>maximum;sheet.insertRowsAfter=(after,count)=>{assert.equal(after,3);maximum+=count;};
  c.getSalesLogSheet_();c.ensureSalesLogSplitPaymentColumns_(sheet,2);
  assert.equal(maximum,5);assert.deepEqual(calls.validations,[{row:4,col:14,height:2,width:1}]);
});

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

test('regular sales persist independently charged and shop-absorbed fees for every single and split payment',()=>{
  const methods=['Cash','GCash','QR Code','Credit Card'];
  const pairs=methods.map(method=>[method]).concat(methods.flatMap(first=>methods.filter(second=>second!==first).map(second=>[first,second])));
  for(const grouped of [false,true])for(const pair of pairs)for(const card of [false,true])for(const qr of [false,true]) {
    const {c,rows}=context(grouped);
    const parts=pair.map((method,index)=>({method,amount:pair.length===1?1000:index?600:400,reference:method==='Cash'?'':'2:30 PM - AB12'}));
    const response=JSON.parse(c.executeCheckoutBackend([{code:'CUSTOM-10001',name:'Steam',category:'SERVICE',quantity:1,price:1000,isCustom:true}],pair.join(' + '),parts.length===1?parts[0].reference:'','YS-MATRIX','percentage',0,'Cashier',pair.includes('Cash')?1100:0,pair.includes('Cash')?1100-parts.find(part=>part.method==='Cash').amount:0,card,parts,qr));
    assert.equal(response.success,true,response.message);
    const field=name=>rows[1][rows[0].indexOf(name)];
    let charged=0,absorbed=0;
    for(const part of parts){const rate=part.method==='Credit Card'?.032:part.method==='QR Code'?.01:0,fee=Math.round(part.amount*rate*100)/100;
      if(part.method==='Credit Card'?card:part.method==='QR Code'&&qr)charged+=fee;else absorbed+=fee;}
    assert.equal(field('Fee Charged to Customer'),Math.round(charged*100)/100);
    assert.equal(field('Fee Absorbed by Merchant'),Math.round(absorbed*100)/100);
    assert.equal(field('Net Total'),Math.round((1000-absorbed)*100)/100);
    assert.equal(field('Payment 1 Amount'),parts[0].amount);assert.equal(field('Payment 2 Amount'),parts[1]?.amount??'');
    assert.equal(field('Payment Method'),pair.join(' + '));
  }
});

test('reservation payments apply the same QR and card fee flags without changing cash change',()=>{
  const {c}=context(true);
  const payload={paymentMethod:'QR Code + Credit Card',paymentParts:[{method:'QR Code',amount:400,reference:'2:30 PM - QR12'},{method:'Credit Card',amount:600,reference:'2:31 PM - CC12'}],applyCardFee:true,applyQrFee:false};
  const payment=c.reservationPayment_(payload,1000);
  assert.equal(payment.charged,19.2);assert.equal(payment.absorbed,4);assert.equal(payment.received,0);assert.equal(payment.change,0);
  const cash=c.reservationPayment_({paymentMethod:'Cash + QR Code',paymentParts:[{method:'Cash',amount:400},{method:'QR Code',amount:600,reference:'2:30 PM - QR12'}],cashReceived:500,applyQrFee:false},1000);
  assert.equal(cash.change,100);assert.equal(cash.absorbed,6);assert.equal(cash.charged,0);
  assert.throws(()=>c.reservationPayment_({...payload,paymentParts:[{method:'QR Code',amount:400},{method:'Credit Card',amount:600,reference:'X'}]},1000),/Reference/);
});

test('exchange payments save the new fee choice and retain zero-due and cash-change behavior',()=>{
  for(const qrFee of [false,true])for(const method of ['QR Code','Cash + QR Code','QR Code + Credit Card','Cash']) {
    const {c,rows}=context(true);vm.runInContext(fs.readFileSync('Backend/Exchange.js','utf8'),c);
    const inventory=[{code:'OLD',name:'Old',category:'PINS',status:'ACTIVE',stock:0},{code:'NEW',name:'New',category:'PINS',status:'ACTIVE',stock:1,price:1100}];
    c.requireManager_=()=>({managerName:'Manager'});c.getExchangeableReceipt=()=>({success:true,receipt:{},items:[{...inventory[0],exchangeableQty:1,originalUnitExchangeValue:100}]});
    c.getFullInventory=()=>inventory;c.generateExchangeId=()=> 'EX-TEST';c.isYourFindsUnique_=()=>false;c.changeInventoryStockBatch_=()=>{};
    const oldSheet=c.SpreadsheetApp.getActiveSpreadsheet();c.SpreadsheetApp.getActiveSpreadsheet=()=>({getSheetByName:name=>name==='Inventory Movement Log'?{getLastRow:()=>1}:oldSheet.getSheetByName(name)});
    const parts=method.split(' + ').map((method,index,all)=>({method,amount:all.length===1?1000:index?600:400,reference:method==='Cash'?'':'2:30 PM - REF1'}));
    const result=c.completeCustomerExchange({originalReceiptId:'OLD-RECEIPT',employee:'Cashier',items:[{returnCode:'OLD',replacementCode:'NEW',returnQty:1,replacementQty:1}],paymentMethod:method,paymentParts:parts,paymentReference:'2:30 PM - REF1',cashReceived:1100,applyQrFee:qrFee,applyCardFee:true,expectedAmountDue:1000});
    assert.equal(result.success,true,result.message);
    const expected=parts.reduce((sum,part)=>sum+(part.method==='QR Code'&&qrFee?part.amount*.01:part.method==='Credit Card'?part.amount*.032:0),0);
    assert.equal(result.totalDue,1000+expected);assert.equal(result.changeGiven,parts.some(p=>p.method==='Cash')?1100-parts.find(p=>p.method==='Cash').amount:0);
    const idx=rows[0].indexOf('Fee Absorbed by Merchant');assert.equal(rows.slice(1).reduce((sum,row)=>sum+row[idx],0),qrFee?0:parts.reduce((sum,part)=>sum+(part.method==='QR Code'?part.amount*.01:0),0));
  }
});

test('a 120-peso Yellow sale saves an unequal 100 cash and 20 GCash split in either Sales Log layout',()=>{
  for(const grouped of [false,true]){
    const {c,rows}=context(grouped);
    const response=JSON.parse(c.executeCheckoutBackend([{code:'100001',name:'YELLOW',category:'PINS',quantity:1,price:120}],
      'Cash + GCash','','YS-UNEQUAL','percentage',0,'Cashier',100,0,false,
      [{method:'Cash',amount:100,reference:''},{method:'GCash',amount:20,reference:'2:30 PM - GC12'}],false));
    assert.equal(response.success,true,response.message);
    const field=name=>rows[1][rows[0].indexOf(name)];
    assert.equal(field('Payment 1 Amount'),100);assert.equal(field('Payment 2 Amount'),20);
    assert.equal(field('Cash Received'),100);assert.equal(field('Change Given'),0);assert.equal(field('Net Total'),120);
    assert.equal(field('Payment 2 Reference'),'2:30 PM - GC12');
  }
});
