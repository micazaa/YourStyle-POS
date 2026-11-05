const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=name=>fs.readFileSync('Backend/'+name+'.js','utf8');

function backend() {
  const c=vm.createContext({assertAppRequest_(){},recordInventoryChangedCodes_(){},
    Session:{getScriptTimeZone:()=> 'Asia/Manila'},
    Utilities:{formatDate:value=>new Date(new Date(value).getTime()+8*3600000).toISOString().slice(0,10)}});
  for(const file of ['Constants','GeneralDelivery','Inventory','InventoryMovement'])vm.runInContext(source(file),c);
  const {D,M,I}=vm.runInContext('({D:DELIVERY_IDX,M:MOVE_IDX,I:INV_IDX})',c);
  const products=[
    {productCode:'900001',description:'TOPS · (150) pcs',category:'WHOLESALE',defaultPrice:5000,status:'ACTIVE',active:true},
    {productCode:'900002',description:'TOPS · (75) pcs',category:'WHOLESALE',defaultPrice:2500,status:'ACTIVE',active:true},
    {productCode:'700001',description:'BUNDLE',category:'PINS',defaultPrice:5000,status:'ACTIVE',active:true},
    {productCode:'700002',description:'HALF BUNDLE',category:'PINS',defaultPrice:2500,status:'ACTIVE',active:true}
  ];
  const deliveries=[],movements=[],inventory=products.map(p=>{
    const row=Array(17).fill('');row[I.CODE]=p.productCode;row[I.DESCRIPTION]=p.description;row[I.CATEGORY]=p.category;
    row[I.INVENTORY_TYPE]='STOCK';row[I.STATUS]='ACTIVE';row[I.YS_PRICE]=p.defaultPrice;row[I.STOCK]=10;
    return row;
  });
  function sheet(rows){return {getLastRow:()=>rows.length+1,getRange(row,col,height=1,width=1){
    const values=()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>rows[row-2+i]?.[col-1+j]??''));
    return {getValues:values,getDisplayValues:()=>values().map(r=>r.map(String)),
      createTextFinder(code){return {matchEntireCell(){return this;},findNext(){const at=rows.findIndex(r=>String(r[I.CODE])===code);return at<0?null:{getRow:()=>at+2};}};}};
  }};}
  const sheets={'Delivery Log':sheet(deliveries),'Inventory Movement Log':sheet(movements),'Inventory':sheet(inventory)};
  c.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:name=>sheets[name]}),flush(){}};
  c.getProductMaster_=()=>products;
  const batches=[];c.changeInventoryStockBatch_=batch=>{batches.push(batch);return batch;};
  function move(values){const row=Array(18).fill('');Object.entries(values).forEach(([key,value])=>{row[M[key]]=value;});movements.push(row);return row;}
  function receipt(id,date,qty=2,code='900001'){
    const row=Array(20).fill('');Object.entries({DELIVERY_ID:id,DELIVERY_DATE:date,RECEIVE_MODE:'BULK',TYPE:'PINS',
      STATUS:'PENDING',BUNDLE_QTY:qty,ESTIMATED_QTY:qty*150}).forEach(([key,value])=>{row[D[key]]=value;});
    deliveries.push(row);
    if(code)move({SOURCE:'DELIVERY',REFERENCE_ID:id,SOURCE_LINE_ID:id+'-B01',CODE:code,NOTES:'PHYSICAL_BUNDLE_RECEIPT',QTY_CHANGE:qty});
    return deliveries.length+1;
  }
  const newer=receipt('YSD-20261102-002','11/2/2026'),older=receipt('YSD-20261014-001','10/14/2026');
  const choice=(row,bundleNo=1)=>({deliveryId:deliveries[row-2][D.DELIVERY_ID],sheetRow:row,bundleNo});
  const item=(selection,code='900001',quantity=1)=>{
    const p=products.find(p=>p.productCode===code);
    return {code,name:p.description,category:p.category,inventoryType:'STOCK',quantity,price:p.defaultPrice,bundleSelection:selection};
  };
  return {c,D,M,I,products,inventory,deliveries,movements,batches,move,receipt,newer,older,choice,item,sheets};
}

test('picker uses calendar FIFO and shows physical bundle codes and delivery IDs',()=>{
  const f=backend(),result=f.c.getCashierBundleChoices('900001');
  assert.equal(result.success,true);assert.equal(result.managed,true);
  assert.deepEqual(Array.from(result.choices,b=>[b.label,b.deliveryDate,b.sheetRow]),[
    ['001-A','2026-10-14',f.older],['001-B','2026-10-14',f.older],['002-A','2026-11-02',f.newer],['002-B','2026-11-02',f.newer]
  ]);
  assert.equal(f.c.physicalBundleDeliveryDate_(new Date('2026-09-30T16:00:00Z'),'D'),'2026-10-01');
  assert.equal(f.c.physicalBundleDeliveryDate_('2026-2-9','D'),'2026-02-09');
});

test('cashier can select a later bundle and its real allocation is recorded',()=>{
  const f=backend();f.c.deductInventoryStock([f.item(f.choice(f.newer,2))],'SALE','Cashier',f.products);
  assert.equal(f.batches.length,1);const movement=f.batches[0][0];
  assert.equal(movement.bundleNo,2);assert.equal(movement.qtyChange,-1);
  const allocation=f.c.parsePhysicalBundleAllocationNote_(movement.notes);
  assert.equal(allocation.deliveryId,'YSD-20261102-002');assert.equal(allocation.sheetRow,f.newer);
  assert.equal(movement.expectedStatus,'ACTIVE');
});

test('unselected older carts keep FIFO allocation',()=>{
  const f=backend();f.c.deductInventoryStock([f.item(undefined)],'SALE','Cashier',f.products);
  const allocation=f.c.parsePhysicalBundleAllocationNote_(f.batches[0][0].notes);
  assert.equal(allocation.deliveryId,'YSD-20261014-001');assert.equal(f.batches[0][0].bundleNo,1);
});

test('sold, distributed and split originals are excluded and split children use their actual codes',()=>{
  const f=backend();
  f.move({SOURCE:'SALE',QTY_CHANGE:-1,BUNDLE_NO:1,NOTES:f.c.physicalBundleAllocationNote_('YSD-20261014-001','FULL',f.older)});
  f.move({SOURCE:'DISTRIBUTION',QTY_CHANGE:10,BUNDLE_NO:2,REFERENCE_ID:'YSD-20261014-001',TYPE:'PINS',SOURCE_LINE_ID:'BUNDLE_ROW:'+f.older});
  f.move({SOURCE:'ADJUSTMENT',QTY_CHANGE:-1,NOTES:JSON.stringify({kind:'BUNDLE_SPLIT',deliveryId:'YSD-20261102-002',sheetRow:f.newer,
    bundleNo:1,parts:2,pieces:75,productCode:'900002',children:[3,4]})});
  assert.deepEqual(Array.from(f.c.getCashierBundleChoices('900001').choices,b=>b.label),['002-B']);
  assert.deepEqual(Array.from(f.c.getCashierBundleChoices('900002').choices,b=>b.label),['002-A-1','002-A-2']);
  f.c.deductInventoryStock([f.item(f.choice(f.newer,4),'900002')],'SALE','Cashier',f.products);
  assert.equal(f.batches[0][0].code,'900002');assert.equal(f.batches[0][0].bundleNo,4);
});

test('stale or forged bundle choices and duplicate full selections fail before any stock batch',()=>{
  for(const invalid of ['sold','row','product','duplicate','quantity','fractional','custom','inactive']){
    const f=backend(),selected=f.choice(f.older);let lines=[f.item(selected)];
    if(invalid==='sold')f.move({SOURCE:'SALE',QTY_CHANGE:-1,BUNDLE_NO:1,NOTES:f.c.physicalBundleAllocationNote_(selected.deliveryId,'FULL',selected.sheetRow)});
    if(invalid==='row')selected.sheetRow=f.newer;
    if(invalid==='product')lines=[f.item(selected,'900002')];
    if(invalid==='duplicate')lines.push(f.item({...selected}));
    if(invalid==='quantity')lines[0].quantity=2;
    if(invalid==='fractional')lines[0].quantity=1.5;
    if(invalid==='custom')lines[0].isCustom=true;
    if(invalid==='inactive')f.products[0].status='DEACTIVATED';
    assert.throws(()=>f.c.deductInventoryStock(lines,'SALE','Cashier',f.products),/bundle|Bundle/,invalid);
    assert.equal(f.batches.length,0,invalid);
  }
});

test('completed physical receipts cannot fall back to unlinked stock sales',()=>{
  const f=backend();f.deliveries.forEach(row=>{row[f.D.STATUS]='COMPLETED';});
  const result=f.c.getCashierBundleChoices('900001');assert.equal(result.managed,true);assert.equal(result.choices.length,0);
  assert.throws(()=>f.c.deductInventoryStock([f.item(f.choice(f.older))],'SALE','Cashier',f.products),/no longer available/);
  assert.throws(()=>f.c.deductInventoryStock([f.item(undefined)],'SALE','Cashier',f.products),/No eligible/);
  const standalone=f.c.getCashierBundleChoices('900002');assert.equal(standalone.managed,false);
});

test('manager pricing and active inventory remain mandatory',()=>{
  for(const field of ['price','inventory','product']){
    const f=backend();
    if(field==='price')f.inventory[0][f.I.YS_PRICE]=0;
    if(field==='inventory')f.inventory[0][f.I.STATUS]='INCOMPLETE';
    if(field==='product')f.products[0].status='DEACTIVATED';
    assert.throws(()=>f.c.getCashierBundleChoices('900001'),/manager|inactive/i);
  }
});

test('a selected half bundle allows its remaining halves and rejects overselling',()=>{
  const f=backend(),row=f.receipt('YSD-20260901-099','9/1/2026',1,null),selection=f.choice(row);
  f.c.deductInventoryStock([f.item(selection,'700002',2)],'SALE','Cashier',f.products);
  const sales=f.batches[0].filter(m=>m.source==='SALE');
  assert.equal(sales.length,2);assert.ok(sales.every(m=>m.bundleNo===1&&f.c.parsePhysicalBundleAllocationNote_(m.notes).sheetRow===row));
  f.move({SOURCE:'SALE',QTY_CHANGE:-1,BUNDLE_NO:1,NOTES:f.c.physicalBundleAllocationNote_(selection.deliveryId,'HALF',row)});
  assert.equal(f.c.getCashierBundleChoices('700002').choices[0].capacity,1);
  const before=f.batches.length;
  assert.throws(()=>f.c.deductInventoryStock([f.item(selection,'700002',2)],'SALE','Cashier',f.products),/no longer available/);
  assert.equal(f.batches.length,before);
});

test('stale selections fail before Sales Log writes and valid selections reuse a single stock plan',()=>{
  for(const stale of ['sold','inactive',false]){
    const f=backend(),selection=f.choice(f.older);let salesWrites=0,stockPlans=0;
    vm.runInContext(source('Sales'),f.c);
    const deduct=f.c.deductInventoryStock;
    f.c.deductInventoryStock=(...args)=>{stockPlans++;return deduct(...args);};
    f.c.getSalesLogSheet_=()=>({getLastRow:()=>1,getRange:()=>({setValues(){salesWrites++;}})});
    f.c.LockService={getScriptLock:()=>({waitLock(){},hasLock:()=>true,releaseLock(){}})};
    f.c.assertInventoryNotReserved_=()=>{};f.c.ensureSalesLogSplitPaymentColumns_=()=>{};
    f.c.roundToTwo=value=>Math.round(value*100)/100;f.c.generateSalesLineId=()=> 'SL-1';
    f.c.salesLogRowFromLegacyFields_=row=>row;f.c.consumeSaleAllocations_=()=>{};
    if(stale==='sold')f.move({SOURCE:'SALE',QTY_CHANGE:-1,BUNDLE_NO:1,NOTES:f.c.physicalBundleAllocationNote_(selection.deliveryId,'FULL',selection.sheetRow)});
    if(stale==='inactive')f.inventory[0][f.I.STATUS]='INACTIVE';
    const result=JSON.parse(f.c.executeCheckoutBackend([f.item(selection)],'Cash','', 'SALE','percentage',0,'Cashier',5000,0,false));
    assert.equal(result.success,!stale,result.message);
    assert.equal(salesWrites,stale?0:1);assert.equal(f.batches.length,stale?0:1);assert.equal(stockPlans,1);
  }
});

function frontend() {
  const nodes={},calls=[],toasts=[];let rendered=0,saved=0;
  const node=id=>nodes[id]||=( {style:{},hidden:false,disabled:false,value:'',textContent:'',children:[],isConnected:true,
    focus(){this.focused=true;},replaceChildren(){this.children=[];this.value='';},appendChild(n){this.children.push(n);},addEventListener(){}});
  const runner={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(fn){this.failure=fn;return this;},getCashierBundleChoices(code){calls.push(code);}};
  const c=vm.createContext({cart:[],cartReservation:()=>null,document:{getElementById:node,activeElement:node('opener'),createElement:()=>node('option'+Math.random())},
    secureScriptRun:runner,showNotificationToast:(...args)=>toasts.push(args),renderCart(){rendered++;},saveSession(){saved++;}});
  const cashier=fs.readFileSync('Frontend/Pages/CashierPage.html','utf8');
  vm.runInContext(cashier.slice(cashier.indexOf('function cashierBundleKind'),cashier.indexOf('var cashierSearchRows'))+'\n'+
    cashier.slice(cashier.indexOf('function addItemToCart('),cashier.indexOf('function startNewTransaction()')),c);
  vm.runInContext(fs.readFileSync('Frontend/Modals/CashierBundleModal.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
  const product={code:'900001',name:'TOPS · (150) pcs',category:'WHOLESALE',bundleKind:'FULL',price:5000,stock:3};
  const choices=[1,2].map(n=>({deliveryId:'YSD-20261014-001',deliveryDate:'2026-10-14',sheetRow:2,bundleNo:n,label:'001-'+(n===1?'A':'B'),kind:'FULL',capacity:1}));
  return {c,node,nodes,runner,calls,toasts,product,choices,rendered:()=>rendered,saved:()=>saved};
}

test('adding a bundle waits for selection, defaults to FIFO and stores the chosen bundle in cart',()=>{
  const f=frontend();f.c.addItemToCart(f.product,false);
  assert.equal(f.c.cart.length,0);assert.equal(f.node('cashierBundleConfirm').disabled,true);
  assert.deepEqual(f.calls,['900001']);f.runner.success({success:true,managed:true,choices:f.choices});
  assert.equal(f.node('cashierBundleSelect').value,'0');assert.equal(f.node('cashierBundleCode').textContent,'Bundle 001-A');
  f.node('cashierBundleSelect').value='1';f.c.renderCashierBundleChoice();f.c.confirmCashierBundleChoice();
  assert.equal(f.c.cart[0].bundleSelection.bundleNo,2);assert.equal(f.c.cart[0].quantity,1);
  assert.match(f.c.cart[0].variantKey,/BUNDLE/);assert.equal(f.node('cashierBundleModal').style.display,'none');assert.equal(f.saved(),1);
});

test('cart excludes duplicate physical bundles across price variants and supports changing selection',()=>{
  const f=frontend();f.c.addItemToCart(f.product,false);f.runner.success({success:true,managed:true,choices:f.choices});f.c.confirmCashierBundleChoice();
  f.c.addItemToCart({...f.product,priceSource:'SALE',price:4000,variantKey:'SALE-1'},false);
  f.runner.success({success:true,managed:true,choices:f.choices});
  assert.equal(f.node('cashierBundleSelect').children.length,1);assert.match(f.node('cashierBundleSelect').children[0].textContent,/001-B/);
  f.c.closeCashierBundlePicker();
  f.c.openCashierBundlePicker(f.c.cart[0],0);f.runner.success({success:true,managed:true,choices:f.choices});
  f.node('cashierBundleSelect').value='1';f.c.confirmCashierBundleChoice();
  assert.equal(f.c.cart.length,1);assert.equal(f.c.cart[0].bundleSelection.bundleNo,2);
});

test('picker errors and empty choices cannot add stock, retries work, and cancelled replies are ignored',()=>{
  const f=frontend();f.c.addItemToCart(f.product,false);f.runner.failure(new Error('Offline'));
  assert.equal(f.node('cashierBundleConfirm').disabled,true);assert.equal(f.node('cashierBundleRetry').hidden,false);
  assert.equal(f.c.cart.length,0);f.c.retryCashierBundlePicker();assert.equal(f.calls.length,2);
  f.runner.success({success:true,managed:true,choices:[]});assert.equal(f.node('cashierBundleConfirm').disabled,true);
  f.c.retryCashierBundlePicker();const late=f.runner.success;f.c.closeCashierBundlePicker();late({success:true,managed:true,choices:f.choices});
  assert.equal(f.node('cashierBundleModal').style.display,'none');assert.equal(f.c.cart.length,0);
});

test('normal products and unlinked stock keep their existing add-to-cart flow',()=>{
  const f=frontend();f.c.addItemToCart({code:'P1',name:'YELLOW',category:'PINS',price:100,stock:1},false);
  assert.equal(f.c.cart.length,1);assert.equal(f.calls.length,0);
  f.c.addItemToCart(f.product,false);f.runner.success({success:true,managed:false,choices:[]});
  assert.equal(f.c.cart.length,2);assert.equal(f.c.cart[1].bundleSelection,null);
});

test('selected full bundle quantity cannot increase; half quantities respect other cart allocations',()=>{
  const f=frontend();
  const cashier=fs.readFileSync('Frontend/Pages/CashierPage.html','utf8');
  vm.runInContext(cashier.slice(cashier.indexOf('function updateQty('),cashier.indexOf('function changeDiscountType(')),f.c);
  f.c.updateCashierCartTotals=()=>{};f.c.scheduleCashierSessionSave=()=>{};f.c.document.querySelector=()=>null;
  f.c.addItemToCart(f.product,false);f.runner.success({success:true,managed:true,choices:f.choices});f.c.confirmCashierBundleChoice();
  f.c.updateQty(0,'2');assert.equal(f.c.cart[0].quantity,1);assert.match(f.toasts.at(-1)[0],/exceeds the selected bundle/);
  f.c.cart[0].bundleSelection.kind='HALF';f.c.cart[0].bundleSelection.capacity=2;
  f.c.updateQty(0,'2');assert.equal(f.c.cart[0].quantity,2);
  f.c.cart[0].quantity=1;
  f.c.cart.push({...f.c.cart[0],variantKey:'SALE-HALF'});
  f.c.updateQty(0,'2');assert.equal(f.c.cart[0].quantity,1);
});
