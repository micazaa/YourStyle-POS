const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=name=>fs.readFileSync('Backend/'+name+'.js','utf8');

test('stock deduction reuses the validated product snapshot and keeps a single authoritative movement batch',()=>{
  const calls=[];
  const c=vm.createContext({assertAppRequest_(){},getProductMaster_(){throw Error('Duplicate product read');},
    normalizePhysicalBundleName_:name=>String(name).toUpperCase(),changeInventoryStockBatch_:rows=>{calls.push(rows);return rows;}});
  vm.runInContext(source('Constants')+'\n'+source('Inventory'),c);
  const lines=[{code:'A',name:'RUBBER',category:'PINS',quantity:2,salesLineId:'SL-1'}];
  const result=c.deductInventoryStock(lines,'R-1','Cashier',[]);
  assert.equal(calls.length,1);assert.equal(result[0].qtyChange,-2);assert.equal(result[0].sourceLineId,'SL-1');
});

function router(operation='executeCheckoutBackend',success=true) {
  const calls={changes:0,finish:0,handler:0};
  const c=vm.createContext({console:{warn(){},error(){}},
    beginInventoryMutation_:()=>({version:'pending'}),finishInventoryMutation_(){calls.finish++;return {version:'v2',fromVersion:'v1',reset:false};},
    getInventoryChanges(){calls.changes++;return {success:true,version:'v2',fromVersion:'v1',items:[],removedCodes:[]};}});
  vm.runInContext(source('AccessControl'),c);
  c.accessRequest_=()=>({operation,permission:'sales.create',actor:{name:'A'},mode:'allow',args:[[{code:'A'}]],
    definition:{handler(){calls.handler++;return JSON.stringify({success});}}});
  c.requireCashierAccess_=()=>{};c.bindAccessArguments_=()=>{};c.employeeCanAuthorizeManager_=()=>false;
  return {c,calls};
}

test('authenticated checkout finishes its mutation but defers the display refresh until after success',()=>{
  const {c,calls}=router();
  const result=JSON.parse(c.callPosApi({inventoryVersion:'v1'}));
  assert.equal(result.success,true);assert.equal(result.inventoryPatch.deferred,true);
  assert.equal(result.inventoryPatch.version,'v2');assert.equal(calls.changes,0);assert.equal(calls.finish,1);
});

test('failed checkout stays failed and does not send a success refresh hint',()=>{
  const {c,calls}=router('executeCheckoutBackend',false);
  const result=JSON.parse(c.callPosApi({inventoryVersion:'v1'}));
  assert.equal(result.success,false);assert.equal(result.inventoryPatch,undefined);assert.equal(calls.changes,0);assert.equal(calls.finish,1);
});

test('other inventory mutations retain their immediate inventory patch',()=>{
  const {c,calls}=router('processReservationPayment');
  const result=JSON.parse(c.callPosApi({inventoryVersion:'v1'}));
  assert.equal(calls.changes,1);assert.equal(result.inventoryPatch.deferred,undefined);
  assert.equal(result.inventoryPatch.version,'v2');
});

function shift() {
  const reads=[];
  const c=vm.createContext({});vm.runInContext(source('Constants')+'\n'+source('CashierShift')+'\n'+source('AccessControl'),c);
  const idx=vm.runInContext('CASH_REPORT_IDX',c),headers=vm.runInContext('PETTY_HANDOVER_HEADERS',c);
  const report=Array(37).fill('');
  report[idx.REPORT_ID]='CR-1';report[idx.EMPLOYEE]='Cashier';report[idx.REPORT_TYPE]='CASHIER SHIFT';report[idx.STATUS]='OPEN';
  const events=[['CR-1','Cashier','RECEIVE'],['CR-1','Cashier','REPORT_SAVED']];
  const reports={getLastRow:()=>10001,getRange(row,col,height,width){return {
    createTextFinder:()=>({matchCase(){return this;},matchEntireCell(){return this;},findAll:()=>[{getRow:()=>9999}]}),
    getValues(){reads.push({sheet:'reports',height,width});assert.equal(row,9999);return [report];}
  };}};
  const log={getLastRow:()=>events.length+1,getRange(row,col,height,width){return {getValues(){reads.push({sheet:'events',height,width});
    if(row===1)return [headers];assert.equal(col,3);assert.equal(width,3);return events;
  }};}};
  c.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:name=>name==='Cash Report Log'?reports:log})};
  return {c,events,report,idx,reads};
}

test('checkout checks the current shift without downloading historical reports or draft JSON',()=>{
  const {c,events,reads}=shift();
  const access={permission:'sales.create',actor:{name:'Cashier',cashierReportId:'CR-1'}},request={shiftReportId:'CR-1'};
  c.requireCashierAccess_(access,request);
  assert.deepEqual(reads,[{sheet:'reports',height:1,width:37},{sheet:'events',height:1,width:13},{sheet:'events',height:2,width:3}]);
  events.push(['CR-1','Cashier','PAUSE']);assert.throws(()=>c.requireCashierAccess_(access,request),/Start or resume/);
  events.push(['CR-1','Cashier','RECEIVE']);c.requireCashierAccess_(access,request);
  events.push(['CR-1','Cashier','END']);assert.throws(()=>c.requireCashierAccess_(access,request),/Start or resume/);
});

test('fast shift checks preserve account and report ownership requirements',()=>{
  const {c,report,idx,events}=shift();
  assert.throws(()=>c.requireCashierAccess_({permission:'sales.create',actor:{name:'Other',cashierReportId:'CR-1'}},{shiftReportId:'CR-1'}),/No active cashier/);
  report[idx.STATUS]='CLOSED';
  assert.throws(()=>c.requireCashierAccess_({permission:'sales.create',actor:{name:'Cashier',cashierReportId:'CR-1'}},{shiftReportId:'CR-OTHER'}),/Start or resume/);
  events.length=0;
  assert.throws(()=>c.requireCashierAccess_({permission:'sales.create',actor:{name:'Cashier',cashierReportId:'CR-1'}},{shiftReportId:'CR-1'}),/Start or resume/);
});

test('checkout success is displayed while the catalogue refresh is still pending',()=>{
  const nodes={},calls=[];
  const c=vm.createContext({cart:[{code:'A'}],pageReadCache:new Map(),document:{getElementById:id=>nodes[id]||=( {style:{},value:''})},
    invalidateDeliveryItemCaches(){},refreshInventory(){calls.push('background refresh');},renderCart(){},saveSession(){}});
  vm.runInContext(fs.readFileSync('Frontend/Modals/CheckoutModal.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
  c.toggleCheckoutModal=()=>calls.push('close checkout');
  c.handleCheckoutSuccess({success:true},{receiptId:'R-1',changeGiven:25});
  assert.equal(nodes.successModal.style.display,'flex');assert.equal(nodes.successReceiptId.textContent,'R-1');
  assert.equal(nodes.successChangeGiven.textContent,'₱25.00');assert.equal(c.cart.length,0);
  assert.deepEqual(calls,['background refresh','close checkout']);
});
