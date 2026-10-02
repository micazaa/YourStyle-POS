const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=name=>fs.readFileSync('Backend/'+name+'.js','utf8');
test('public product reads omit supplier costs; manager reads authenticate',()=>{
 const c=vm.createContext({});
 vm.runInContext(source('ProductMaster')+'\n'+source('InventoryMovement'),c);
 c.getProductMaster_=()=>[{productCode:'1',active:true,costPrice:42}];
 c.verifyInventoryManagerSession_=token=>{if(token!=='valid')throw Error('Unauthorized');return {success:true};};
 assert.equal(c.getProductMaster()[0].costPrice,undefined);
 assert.equal(c.getActiveProducts()[0].costPrice,undefined);
 assert.equal(c.getProductMasterByCode('1').product.costPrice,undefined);
 assert.equal(c.getActiveProductByCode('1').product.costPrice,undefined);
 assert.equal(c.getProductMasterForManagement('')[0].costPrice,undefined);
 assert.throws(()=>c.getProductMasterForManagement('forged'),/Unauthorized/);
 assert.equal(c.getProductMasterForManagement('valid')[0].costPrice,42);
 assert.equal(c.getProductMaster_()[0].costPrice,42);
});
test('invalidated product request cannot repopulate a new cache',async()=>{
 const callbacks=[];const c=vm.createContext({currentEmployee:{name:'Mica'},google:{script:{run:{withSuccessHandler(fn){callbacks.push(fn);return this;},withFailureHandler(){return this;},getYourStyleDeliveryProducts(){}}}}});
 vm.runInContext(fs.readFileSync('Frontend/Scripts/AppJS.html','utf8').split('let masterInventory')[0].replace('<script>',''),c);
 const old=c.getDeliveryCatalog();
 vm.runInContext('deliveryCatalogPending=null;deliveryCatalogCache=null;',c);
 const fresh=c.getDeliveryCatalog();callbacks[1]({success:true,products:[{productCode:'new'}]});await fresh;
 callbacks[0]({success:true,products:[{productCode:'old'}]});await old;
 assert.equal(c.cachedDeliveryCatalog()[0].productCode,'new');
});
test('login never launches a formula migration',()=>{
 assert.doesNotMatch(fs.readFileSync('Frontend/Modals/LoginModal.html','utf8'),/prepareSummaryQueries/);
});
test('sales sync batches 200 adjacent reads under lock, skips gaps and duplicate row IDs',()=>{
 let locked=false, reads=0;
 const c=vm.createContext({SpreadsheetApp:{flush(){}},LockService:{getScriptLock:()=>({waitLock(){locked=true;},releaseLock(){locked=false;}})}});
 vm.runInContext(source('Constants')+'\n'+source('SalesAutomation'),c);
 c.salesMovementLineIds_=()=>({});
 const sheet={getRange(row,col,height,width){assert.equal(locked,true);reads++;return {getValues:()=>Array.from({length:height},()=>Array(width).fill(''))};}};
 const contiguous=Array.from({length:200},(_,i)=>i+2);
 c.processSalesRows_(sheet,contiguous);assert.equal(reads,1);assert.equal(locked,false);
 reads=0;c.processSalesRows_(sheet,[2,3,10000,10000]);assert.equal(reads,2);assert.equal(locked,false);
 reads=0;c.processSalesRows_(sheet,[]);assert.equal(reads,0);
 reads=0;c.processSalesRows_(sheet,Array.from({length:401},(_,i)=>i+2));assert.equal(reads,3);
});
