const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function backend(status='ACTIVE') {
  const saved=new Map(),writes=[],audits=[];
  const item={code:'YF-1',rowNumber:2,name:'Chair',size:'SNE',category:'YourFinds',inventoryType:'UNIQUE',status,stock:1,price:100,origPrice:50,imageUrl:'photo'};
  const actor={id:'EMP-1',name:'Cashier',role:'CASHIER',manager:false};
  const sheet={getRange(_row,col){return {setValue(value){writes.push({col,value});}};}};
  const c=vm.createContext({console:{error(){},warn(){}},
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet}),flush(){}},
    CacheService:{getScriptCache:()=>({get:key=>saved.get(key),put:(key,value)=>saved.set(key,value),remove:key=>saved.delete(key)})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{getUuid:()=> 'approval-1'},
    dashboardEmployee_:()=>actor,employeeCanAuthorizeManager_:value=>['OWNER','MANAGER'].includes(value.role),
    reservationInventoryItem_:()=>({...item}),getYourFindsItemForCompletion:()=>({success:true,item:{...item}}),
    verifyManagerPin:pin=>pin==='1234'?{success:true,managerName:'Manager'}:{success:false,message:'Incorrect manager PIN'},
    decodeInventoryImage_:()=>null,assertCompletedYourFinds_(){},normalizeYourFindsSaleSize_:value=>value,
    beginInventoryMutation_:()=>({}),finishInventoryMutation_:()=>({fromVersion:'v1',version:'v2'}),
    getInventoryChanges:()=>({success:true,version:'v2',items:[],removedCodes:[]})});
  for(const name of ['Constants','InventoryMovement','AccessControl'])vm.runInContext(fs.readFileSync('Backend/'+name+'.js','utf8'),c);
  c.accessRegistry_=()=>({saveYourFindsItemDetails:{permission:'inventory.edit',handler:c.saveYourFindsItemDetails}});
  c.actionSnapshot_=()=>({...item});
  c.actionBinding_=(operation,args)=>JSON.stringify([operation,args.map(({managerPin,managerToken,...rest})=>rest)]);
  c.beginAccessAudit_=access=>{audits.push({operation:access.operation,manager:access.approver?.managerName});return {};};
  c.finishAccessAudit_=()=>{};
  const request=(pin)=>({operation:'saveYourFindsItemDetails',sessionToken:'cashier-session',inventoryVersion:'v1',args:[{
    code:item.code,description:'Updated Chair',sellingPrice:150,originalPrice:75,...(pin===undefined?{}:{managerPin:pin})}]});
  return {c,item,actor,writes,audits,request};
}

test('cashiers can request manager approval to edit an existing in-stock YourFinds item',()=>{
  const {c,request,writes,audits}=backend();const action=request('1234');
  const preview=c.previewPosAction(action);assert.equal(preview.approvalRequired,true);
  action.approvalRequestId=preview.requestId;
  const result=c.callPosApi(action);assert.equal(result.success,true);assert.equal(result.manager,'Manager');
  assert.equal(result.sellingPrice,150);assert.equal(result.status,'ACTIVE');
  assert.ok(writes.some(write=>write.col===13&&write.value===150));assert.equal(audits[0].manager,'Manager');
  assert.equal(writes.some(write=>[1,3,4,5,7,8,9,10,11,12].includes(write.col)),false);
  const count=writes.length;assert.throws(()=>c.callPosApi(action),/Approval expired/);assert.equal(writes.length,count);
});

test('cashiers cannot edit an in-stock item without approval or with an incorrect manager PIN',()=>{
  for(const pin of [undefined,'wrong']){
    const {c,request,writes}=backend();const action=request(pin);
    const preview=c.previewPosAction(action);action.approvalRequestId=preview.requestId;
    assert.throws(()=>c.callPosApi(action),/manager PIN|authorization/i);assert.equal(writes.length,0);
  }
  const {c,request,writes}=backend();assert.throws(()=>c.callPosApi(request('1234')),/Approval expired/);assert.equal(writes.length,0);
});

test('cashiers can complete incomplete YourFinds selling details without a manager PIN',()=>{
  const {c,request,writes}=backend('INCOMPLETE');const action=request();
  const preview=c.previewPosAction(action);assert.equal(preview.approvalRequired,false);
  const result=c.callPosApi(action);assert.equal(result.success,true);assert.equal(result.wasCompleted,true);
  assert.equal(result.manager,'');assert.equal(result.status,'ACTIVE');assert.ok(writes.length>0);
});

test('this permission does not grant cashiers cost, stock, or product-master editing',()=>{
  const {c,request,actor,writes}=backend();const action=request('1234');action.args[0].costPrice=0;
  assert.throws(()=>c.previewPosAction(action),/Your role cannot/);
  assert.equal(c.permissionMode_(actor,'inventory.edit'),'deny');assert.equal(c.permissionMode_(actor,'inventory.create'),'deny');
  assert.equal(writes.length,0);
});

test('manager edits still work directly and incomplete completion still requires a signed-in app request',()=>{
  const {c,actor,request}=backend();actor.role='MANAGER';actor.name='Manager';actor.manager=true;
  assert.equal(c.callPosApi(request()).success,true);
  const incomplete=backend('INCOMPLETE');
  assert.throws(()=>incomplete.c.saveYourFindsItemDetails(incomplete.request().args[0]),/Authenticated app request required/);
});

test('approval cannot be reused after the item changes or used for returned items',()=>{
  const {c,request,item,writes}=backend();const action=request('1234'),preview=c.previewPosAction(action);
  action.approvalRequestId=preview.requestId;item.price=999;
  assert.throws(()=>c.callPosApi(action),/item changed/);assert.equal(writes.length,0);
  item.status='RETURNED';assert.throws(()=>c.previewPosAction(action),/Your role cannot/);
});

function frontend(status) {
  const nodes={},calls=[],notices=[];
  const c=vm.createContext({phase8SelectedItem:{code:'YF-1',status,imageUrl:'photo'},phase8YfSaving:false,
    phase8YfPhotoFileName:'',phase8YfPhotoDataUrl:'',currentEmployee:{role:'CASHIER',dashboardToken:'session'},
    document:{getElementById:id=>nodes[id]||=({value:'',style:{}})},
    inventoryIsManager:()=>false,canAuthorizeManagerActions:()=>false,yourFindsCustomCostChanged:()=>false,
    showNotificationToast:message=>notices.push(message),setYourFindsSaving(){},
    secureScriptRun:{withSuccessHandler(){return this;},withFailureHandler(){return this;},saveYourFindsItemDetails:payload=>calls.push(payload)}});
  const source=fs.readFileSync('Frontend/Modals/InventoryManagementModal.html','utf8');
  vm.runInContext(source.slice(source.indexOf('function saveYourFindsDetailsClient('),source.indexOf('function printCompletedYourFindsLabel(')),c);
  for(const [id,value]of Object.entries({yfEditorDescription:'Updated Chair',yfEditorSellingPrice:'150',yfEditorOriginalPrice:'75',yfEditorManagerPin:''}))c.document.getElementById(id).value=value;
  return {c,nodes,calls,notices};
}

test('cashier editor asks for a PIN only for existing items',()=>{
  const active=frontend('ACTIVE');active.c.saveYourFindsDetailsClient(false);
  assert.equal(active.calls.length,0);assert.match(active.notices[0],/manager PIN/i);
  active.nodes.yfEditorManagerPin.value='1234';active.c.saveYourFindsDetailsClient(false);
  assert.equal(active.calls.length,1);assert.equal(active.calls[0].managerPin,'1234');
  const incomplete=frontend('INCOMPLETE');incomplete.c.saveYourFindsDetailsClient(false);
  assert.equal(incomplete.calls.length,1);assert.equal(incomplete.calls[0].managerPin,undefined);
});

test('OIC staff also complete incomplete selling details without a PIN prompt',()=>{
  const {c,calls}=frontend('INCOMPLETE');c.inventoryIsManager=()=>true;c.employeeIsOic=()=>true;
  c.managerCredentials=()=>{throw Error('Incomplete selling details must not request a PIN');};
  c.saveYourFindsDetailsClient(false);assert.equal(calls.length,1);assert.equal(calls[0].managerPin,undefined);
});
