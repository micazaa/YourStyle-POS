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
test('inventory keeps rows visible on revisit and after failed background refresh',()=>{
 const {c,elements,calls,notices}=setup();c.loadInventoryPage();assert.match(elements.inventoryTableBody.innerHTML,/spinner/);
 calls[0].success([{code:'A',stock:5}]);c.loadInventoryPage();assert.match(elements.inventoryTableBody.innerHTML,/"stock":5/);
 calls[1].failure({message:'offline'});assert.match(elements.inventoryTableBody.innerHTML,/"stock":5/);assert.match(notices[0],/previously loaded/);
 c.loadInventoryPage();calls[2].success([{code:'A',stock:4}]);assert.match(elements.inventoryTableBody.innerHTML,/"stock":4/);
});
test('late inventory responses cannot replace newer data or repopulate a signed-out session',()=>{
 const {c,calls}=setup();c.loadInventoryPage();c.loadInventoryPage();calls[1].success([{stock:2}]);calls[0].success([{stock:9}]);assert.equal(c.inventoryPageData[0].stock,2);
 c.loadInventoryPage();c.pageReadCache.clear();c.currentEmployee=null;calls[2].success([{stock:99}]);assert.equal(c.inventoryPageData[0].stock,2);
});
test('cache keys isolate records, empty results and employee sessions',()=>{
 const {c}=setup();const first=c.beginPageRead('history','A');first.save([]);assert.equal(c.beginPageRead('history','A').cached.length,0);
 assert.equal(c.beginPageRead('history','B').cached,undefined);assert.equal(first.current(),false);
 const b=c.beginPageRead('history','B');b.save(['private']);c.currentEmployee={accessLevel:2,dashboardToken:'session-b'};
 assert.equal(b.current(),false);assert.equal(c.beginPageRead('history','B').cached,undefined);
});
