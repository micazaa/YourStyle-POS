const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const backend=name=>fs.readFileSync('Backend/'+name+'.js','utf8');
const script=path=>fs.readFileSync(path,'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture(){
 const c=vm.createContext({formatInventoryDateForClient:String});
 vm.runInContext(backend('Constants')+'\n'+backend('DeliverySummary')+'\n'+backend('GeneralDelivery'),c);
 const [D,I,M]=vm.runInContext('[DELIVERY_IDX,INV_IDX,MOVE_IDX]',c);
 function row(index,values){const r=Array(20).fill('');for(const [key,value] of Object.entries(values))r[index[key]]=value;return r;}
 const deliveries=[row(D,{DELIVERY_ID:'D1',DELIVERY_DATE:'2026-09-28',DELIVERY_TYPE:'YOURSTYLE',RECEIVE_MODE:'DIRECT'}),row(D,{DELIVERY_ID:'D2',DELIVERY_DATE:'2026-09-29',DELIVERY_TYPE:'YOURSTYLE',TYPE:'PINS',RECEIVE_MODE:'BULK',BUNDLE_QTY:3,STATUS:'PARTIAL'}),row(D,{DELIVERY_ID:'D3',DELIVERY_DATE:'2026-09-29',DELIVERY_TYPE:'YOURFINDS'}),row(D,{DELIVERY_ID:'D4',DELIVERY_TYPE:'YOURSTYLE',TYPE:'PINS',RECEIVE_MODE:'BULK',BUNDLE_QTY:7,STATUS:'COMPLETED'})];
 const inventory=[row(I,{CODE:'001',DESCRIPTION:'Yellow',CATEGORY:'PINS',STOCK:-50}),row(I,{CODE:'Y1',CATEGORY:'YOURFINDS',SIZE:'FREE SIZE'}),row(I,{CODE:'Y2',CATEGORY:'YOURFINDS',SIZE:'FREE SIZE'})];
 const movement=(id,code,qty,source='DELIVERY',type='PINS',bundle=0)=>row(M,{REFERENCE_ID:id,CODE:code,ITEM:'Yellow',QTY_CHANGE:qty,SOURCE:source,TYPE:type,BUNDLE_NO:bundle});
 const movements=[movement('D1','001',20),movement('D2','001',40,'DISTRIBUTION','PINS',1),movement('D2','HOLDER',300,'DELIVERY','BULK_PINS'),movement('D2','HOLDER',-100,'DISTRIBUTION','BULK_PINS',1),movement('D1','001',-30,'SALE'),movement('D1','001',-2,'SUPPLIER_RETURN'),movement('D1','001',10,'ADJUSTMENT'),movement('D3','Y1',1,'DELIVERY','YOURFINDS'),movement('D3','Y2',1,'DELIVERY','YOURFINDS')];
 return {c,deliveries,inventory,movements};
}
test('receipt totals use positive product movements, not estimates, stock, sales or adjustments',()=>{
 const {c,deliveries,inventory,movements}=fixture();const result=c.buildDeliverySummaryData_(deliveries,inventory,movements);
 assert.equal(result.receipts.reduce((n,r)=>n+r.quantity,0),62);
 assert.deepEqual(Array.from(result.receipts.filter(r=>r.category==='PINS'),r=>r.quantity),[20,40]);
 assert.equal(result.receipts.find(r=>r.category==='YOURFINDS').quantity,2);
 assert.equal(result.receipts.find(r=>r.category==='YOURFINDS').name,'FREE SIZE');
 assert.equal(result.bundles.length,3);assert.deepEqual(Array.from(result.bundles,b=>b.status),['In progress','Unopened','Unopened']);
 assert.equal(result.bundles[0].sheetRow,3);
});
test('summary reads each sheet once regardless of delivery count',()=>{
 const {c,deliveries,inventory,movements}=fixture();const reads=[];
 const sheets={'Delivery Log':deliveries,'Inventory':inventory,'Inventory Movement Log':movements};
 c.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:name=>({getLastRow:()=>sheets[name].length+1,getRange:()=>({getValues(){reads.push(name);return sheets[name];},getDisplayValues(){reads.push(name);return sheets[name];}})})})};
 assert.equal(c.getDeliverySummaryData().receipts.length,3);assert.equal(reads.length,3);assert.equal(new Set(reads).size,3);
});
test('bundle shortcut selects the requested holder and rejects another delivery row',()=>{
 const {c,deliveries}=fixture();
 c.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>deliveries.length+1,getRange:()=>({getValues:()=>deliveries})})})};
 c.getBulkHolderDetails=(id,sheetRow)=>({holder:{deliveryId:id,sheetRow}});
 assert.equal(c.getBulkDistributionData('D2',true,3).holder.sheetRow,3);
 assert.throws(()=>c.getBulkDistributionData('D2',true,2),/No pending bundles/);
 assert.throws(()=>c.getBulkDistributionData('D4',true,5),/No pending bundles/);
});
function frontend(){
 const elements={};let handler;const element=id=>elements[id]??={style:{},textContent:'',innerHTML:'',value:'',hidden:false,addEventListener(_name,fn){handler=fn;}};
 const c=vm.createContext({currentEmployee:{id:'A'},currentCashier:'A',document:{getElementById:element,querySelectorAll:()=>[]},loadingIndicator:()=> 'loading',escapeDeliveriesHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),normalizeDeliveryFilterDate:String,closeModal:id=>{element(id).style.display='none';}});
 vm.runInContext(fs.readFileSync('Frontend/Scripts/AppJS.html','utf8').split('let masterInventory')[0].replace('<script>',''),c);
 vm.runInContext(script('Frontend/Modals/DeliverySummaryModal.html'),c);
 return {c,element,click:dataset=>handler({target:{closest:()=>({dataset})}})};
}
test('filtered cards, received-item grouping, history and numeric sorting agree',()=>{
 const {c,element,click}=frontend();const f=fixture();const data=f.c.buildDeliverySummaryData_(f.deliveries,f.inventory,f.movements);
 c.beginPageRead('deliverySummary').save(data);c.deliverySummaryVisible=[{deliveryId:'D1',deliveryType:'YOURSTYLE'},{deliveryId:'D2',deliveryType:'YOURSTYLE'}];
 c.renderDeliverySummaryCards();assert.equal(element('deliveryItemsValue').textContent,'60 pcs');assert.equal(element('deliveryBundlesValue').textContent,'2 unopened');
 c.deliverySummaryKind='items';c.renderDeliverySummary();assert.match(element('deliverySummaryTable').innerHTML,/>60</);
 const key=data.receipts[0].productKey;click({receiptHistory:key});assert.match(element('deliveryReceiptTable').innerHTML,/>20</);assert.match(element('deliveryReceiptTable').innerHTML,/>40</);
 c.setDeliverySort('receipts','quantity');let html=element('deliveryReceiptTable').innerHTML;assert.ok(html.indexOf('>20<')<html.indexOf('>40<'));
 c.setDeliverySort('receipts','quantity');html=element('deliveryReceiptTable').innerHTML;assert.ok(html.indexOf('>40<')<html.indexOf('>20<'));
 c.deliverySummaryVisible=[{deliveryId:'D3',deliveryType:'YOURFINDS'}];c.renderDeliverySummaryCards();assert.equal(element('deliveryItemsValue').textContent,'2 pcs');
});
test('summary cache deduplicates requests, retries errors and discards invalidated responses',()=>{
 const {c}=frontend();const calls=[];
 c.google={script:{get run(){const call={};calls.push(call);return {withSuccessHandler(fn){call.success=fn;return this;},withFailureHandler(fn){call.failure=fn;return this;},getDeliverySummaryData(){}};}}};
 c.loadDeliverySummaryData();c.loadDeliverySummaryData();assert.equal(calls.length,1);
 calls[0].failure();c.loadDeliverySummaryData();assert.equal(calls.length,2);
 c.pageReadCache.delete('deliverySummary');calls[1].success({success:true,receipts:[],bundles:[]});assert.equal(c.deliverySummaryData(),undefined);
 c.loadDeliverySummaryData();calls[2].success({success:true,receipts:[],bundles:[]});c.loadDeliverySummaryData();assert.equal(calls.length,3);
});
test('delivery shortcut clears filters and focuses the actual matching row',()=>{
 const {c,element}=frontend();let shown='',filtered=false,focused=false;
 const row={dataset:{deliveryId:'D2'},classList:{toggle(_key,value){assert.equal(value,true);}},scrollIntoView(){},focus(){focused=true;}};
 c.document.querySelectorAll=()=>[row];c.showPage=page=>{shown=page;};c.filterDeliveriesPage=()=>{filtered=true;};element('deliveriesSearch').value='old';
 c.jumpToDeliveryRow('D2');assert.equal(shown,'deliveriesPage');assert.equal(filtered,true);assert.equal(focused,true);assert.equal(element('deliveriesSearch').value,'');
});
test('receipt history replaces the items table; Back and reopening restore the cached sorted list',()=>{
 const {c,element,click}=frontend();const f=fixture();
 const data=f.c.buildDeliverySummaryData_(f.deliveries,f.inventory,f.movements);
 c.beginPageRead('deliverySummary').save(data);
 c.deliverySummaryVisible=[{deliveryId:'D1',deliveryType:'YOURSTYLE'},{deliveryId:'D2',deliveryType:'YOURSTYLE'}];
 c.google={script:{get run(){throw Error('Unexpected request for cached history');}}};
 element('deliveriesSearch').value='Yellow';
 c.openDeliverySummary('items');c.setDeliverySort('items','quantity');
 const original=element('deliverySummaryTable').innerHTML;
 const cards=element('deliverySummaryBreakdown').innerHTML;
 click({receiptHistory:data.receipts[0].productKey});
 assert.equal(element('deliverySummaryTable').hidden,true);
 assert.equal(element('deliveryReceiptHistory').hidden,false);
 assert.equal(element('deliverySummaryBreakdown').innerHTML,cards);
 c.setDeliverySort('receipts','quantity');
 assert.equal(element('deliverySummaryTable').hidden,true);
 c.closeDeliveryReceiptHistory();
 assert.equal(element('deliverySummaryTable').hidden,false);
 assert.equal(element('deliveryReceiptHistory').hidden,true);
 assert.equal(element('deliverySummaryTable').innerHTML,original);
 assert.equal(element('deliveriesSearch').value,'Yellow');
 click({receiptHistory:data.receipts[0].productKey});
 c.closeModal('deliverySummaryModal');c.openDeliverySummary('items');
 assert.equal(c.deliveryReceiptKey,'');
 assert.equal(element('deliverySummaryTable').hidden,false);
 assert.equal(element('deliveryReceiptHistory').hidden,true);
 assert.equal(element('deliverySummaryTable').innerHTML,original);
});
