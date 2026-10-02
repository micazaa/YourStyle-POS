const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
function setup(){
 const elements={};const calls=[];const notices=[];
 const c=vm.createContext({currentEmployee:{accessLevel:2,dashboardToken:'session-a'},currentCashier:'A',dashboardInventoryReminder:'',
  document:{getElementById(id){return elements[id]||(elements[id]={style:{},innerHTML:'',value:''});}},
  showNotificationToast(message){notices.push(message);},
  google:{script:{get run(){const call={};calls.push(call);return {withSuccessHandler(fn){call.success=fn;return this;},withFailureHandler(fn){call.failure=fn;return this;},getInventoryForManagement(){}};}}}
 });
 const app=fs.readFileSync(path.join(root,'Frontend/Scripts/AppJS.html'),'utf8');
 vm.runInContext(app.split('let masterInventory')[0].replace('<script>',''),c);
 vm.runInContext(fs.readFileSync(path.join(root,'Frontend/Pages/InventoryPage.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
 c.filterInventoryTable=()=>{c.document.getElementById('inventoryTableBody').innerHTML=JSON.stringify(c.inventoryPageData);};
 return {c,elements,calls,notices};
}
test('inventory loads once, deduplicates pending visits, and reloads after invalidation',()=>{
 const {c,elements,calls}=setup();c.loadInventoryPage();c.loadInventoryPage();assert.equal(calls.length,1);
 calls[0].success([{code:'A',stock:5}]);c.loadInventoryPage();assert.equal(calls.length,1);assert.match(elements.inventoryTableBody.innerHTML,/"stock":5/);
 c.loadInventoryPage(true);assert.equal(calls.length,2);calls[1].failure({message:'offline'});
 c.loadInventoryPage();assert.equal(calls.length,3);calls[2].success([{stock:4}]);assert.equal(c.inventoryPageData[0].stock,4);
});
test('late inventory responses cannot replace invalidated data or repopulate a signed-out session',()=>{
 const {c,calls}=setup();c.loadInventoryPage();c.loadInventoryPage(true);calls[1].success([{stock:2}]);calls[0].success([{stock:9}]);assert.equal(c.inventoryPageData[0].stock,2);
 c.loadInventoryPage(true);c.pageReadCache.clear();c.currentEmployee=null;calls[2].success([{stock:99}]);assert.equal(c.inventoryPageData[0].stock,2);
});
test('cache keys isolate records, empty results and employee sessions',()=>{
 const {c}=setup();const first=c.beginPageRead('history','A');first.save([]);assert.equal(c.beginPageRead('history','A').cached.length,0);
 assert.equal(c.beginPageRead('history','B').cached,undefined);assert.equal(first.current(),false);
 const b=c.beginPageRead('history','B');b.save(['private']);c.currentEmployee={accessLevel:2,dashboardToken:'session-b'};
 assert.equal(b.current(),false);assert.equal(c.beginPageRead('history','B').cached,undefined);
});

test('delivery and return navigation reuse loaded results and retry failures',()=>{
 for(const [file,loader,view] of [['DeliveriesPage','loadDeliveriesPage','deliveries'],['SupplierReturnsPage','loadSupplierReturnsPage','supplierReturns']]) {
  const {c,calls}=setup();
  c.google.script={get run(){const call={};calls.push(call);return new Proxy({}, {get(_target,key){if(key==='withSuccessHandler')return fn=>{call.success=fn;return c.chain;};if(key==='withFailureHandler')return fn=>{call.failure=fn;return c.chain;};return ()=>{};}});}};
  // Each request uses a chain with callbacks captured in the latest call.
  c.chain=new Proxy({}, {get(_target,key){if(key==='withFailureHandler')return fn=>{calls.at(-1).failure=fn;return c.chain;};return ()=>{};}});
  c.console={error(){}};
  vm.runInContext(fs.readFileSync(path.join(root,'Frontend/Pages/'+file+'.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
  c.renderDeliverySummaryCards=()=>{};c.renderDeliveriesTable=()=>{};c.updateDeliveriesSummary=()=>{};c.renderSupplierReturns=()=>{};
  c[loader]();c[loader]();assert.equal(calls.length,1);
  calls[0].success(view==='deliveries'?{success:true,deliveries:[],summary:{success:true,receipts:[],bundles:[]}}:[]);
  if(view==='deliveries')assert.deepEqual(c.pageReadCache.get('deliverySummary').data.receipts,[]);
  c[loader]();assert.equal(calls.length,1);
  c.pageReadCache.delete(view);c[loader]();assert.equal(calls.length,2);
  calls[1].failure({message:'offline'});c[loader]();assert.equal(calls.length,3);
 }
});
test('successful login resets the remembered workspace tab',()=>{
 const login=fs.readFileSync(path.join(root,'Frontend/Modals/LoginModal.html'),'utf8');
 assert.match(login,/pageReadCache.clear\(\);\s*localStorage.removeItem\('ys_pos_inventory_tab'\)/);
});
