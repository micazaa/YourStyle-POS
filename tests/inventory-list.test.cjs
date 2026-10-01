const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function fakeClassList() {
 const values=new Set();return {contains:key=>values.has(key),remove:key=>values.delete(key),add:key=>values.add(key),toggle(key,force){const enabled=force===undefined?!values.has(key):force;if(enabled)values.add(key);else values.delete(key);return enabled;}};
}
function frontend() {
  const elements = {};
  function element() {
    return { classList:fakeClassList(), style: {}, dataset: {}, value: '', children: [], innerHTML: '',
      replaceChildren() { this.children=[]; }, appendChild(child) { this.children.push(child); }, setAttribute() {}, removeAttribute() {}, addEventListener() {},
      querySelector(selector) { if (selector === '.inventory-actions') return this.actions || (this.actions = element()); return null; } };
  }
  const context = vm.createContext({currentEmployee:{accessLevel:1}, document:{body:{classList:fakeClassList()},
    getElementById(id) { return elements[id] || (elements[id] = element()); },
    querySelectorAll() { return []; }, createElement:element,
  }});
  vm.runInContext(fs.readFileSync(path.join(root,'Frontend/Pages/InventoryPage.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1], context);
  vm.runInContext(fs.readFileSync(path.join(root, 'Frontend/Scripts/AppJS.html'), 'utf8').split('let masterInventory')[0].replace('<script>', ''), context);
  return {context,elements};
}
test('search and numeric sorting compose without changing source inventory', () => {
  const {context:c} = frontend();
  c.inventoryPageData = [{code:'2',name:'Pin',price:100},{code:'1',name:'Pin',price:9},{code:'3',name:'Shoe',price:1}];
  c.document.getElementById('inventorySearch').value='pin';
  c.renderInventoryTable = items => { c.visible=items; };
  c.sortInventoryTable('price');
  assert.deepEqual(Array.from(c.visible, x=>x.code),['1','2']);
  c.sortInventoryTable('price');
  assert.deepEqual(Array.from(c.visible, x=>x.code),['2','1']);
  assert.deepEqual(c.inventoryPageData.map(x=>x.code),['2','1','3']);
});
test('cashiers can view; only managers get edit, delete and active column', () => {
  const {context:c,elements} = frontend();
  const item={code:'100001',name:'Pin',category:'PINS',stock:2,status:'ACTIVE',price:10};
  c.renderInventoryTable([item]);
  let row=elements.inventoryTableBody.children.at(-1);
  assert.deepEqual(row.actions.children.map(b=>b.title),['Edit item','View item','Delete item']);
  assert.match(row.innerHTML,/inventory-active/);
  c.currentEmployee={accessLevel:2};
  c.renderInventoryTable([item]);row=elements.inventoryTableBody.children.at(-1);
  assert.deepEqual(row.actions.children.map(b=>b.title),['View item']);
  assert.doesNotMatch(row.innerHTML,/inventory-active/);
  c.currentEmployee={accessLevel:''};assert.equal(c.inventoryIsManager(),false);
});
test('incomplete and returned statuses are retained; administrative state is separate', () => {
  const {context:c,elements}=frontend();
  assert.equal(c.getInventoryDisplayStatus({status:'INACTIVE',stock:3}),'IN STOCK');
  assert.equal(c.getInventoryDisplayStatus({status:'RETURNED',stock:0}),'RETURNED');
  c.renderInventoryTable([{code:'1',status:'INCOMPLETE',category:'YOURFINDS',inventoryType:'UNIQUE',stock:1}]);
  assert.match(elements.inventoryTableBody.children.at(-1).innerHTML,/inventory-active[^>]+disabled/);
});
function backend({stock=0,status='ACTIVE',references=[],authorized=true}={}) {
  let deleted=false, released=false, writes=0;
  const item={code:'123456',stock,status,rowNumber:2,category:'PINS',inventoryType:'STOCK'};
  const inventory={deleteRow(){deleted=true;},getRange(){return {getValues(){return [Array(15).fill('')];},setValues(){writes++;},setValue(){writes++;}};}};
  const history={getName(){return 'Sales';},getLastRow(){return references.length+1;},getLastColumn(){return 1;},getRange(){return {getDisplayValues(){return references;}};}};
  const sheet={getSheets(){return [history];},getSheetByName(){return inventory;}};
  const c=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet(){return sheet;}},LockService:{getScriptLock(){return {waitLock(){},releaseLock(){released=true;}};}},verifyManagerPin(){return {success:authorized,message:'Manager authorization failed'};},getFullInventory(){return [item];},getProductMaster_(){return [];},getInventoryItemByCode(){return {success:true,item};},SHEETS:{INVENTORY:'Inventory',PRODUCT_MASTER:'Product Master',EMPLOYEES:'Employees'},INVENTORY_STATUS:{ACTIVE:'ACTIVE',INACTIVE:'INACTIVE'},INVENTORY_TYPE:{UNIQUE:'UNIQUE'},INVENTORY_COLUMN_COUNT:15,INV_COL:{STATUS:6,UPDATED_AT:16,IMAGE:14,DESCRIPTION:2,ORIG_PRICE:13,YS_PRICE:12},INV_IDX:{STATUS:5,UPDATED_AT:15}});
  vm.runInContext(fs.readFileSync(path.join(root,'Backend/InventoryMovement.js'),'utf8'),c);
  return {c,state:()=>({deleted,released,writes})};
}
test('delete rejects unauthorized requests, stocked items and historical references', () => {
  for (const [options,pattern] of [[{authorized:false},/authorization/],[{stock:1},/zero-stock/],[{references:[['123456']]},/existing records/]]) {
    const {c,state}=backend(options);
    assert.throws(()=>c.deleteUnusedInventoryItem({code:'123456',managerPin:'bad'}),pattern);
    assert.equal(state().deleted,false);
  }
});
test('delete removes unused zero-stock row and releases lock', () => {
  const {c,state}=backend();
  assert.equal(c.deleteUnusedInventoryItem({code:'123456',managerPin:'valid'}).success,true);
  assert.deepEqual(state(),{deleted:true,released:true,writes:0});
});
test('status updates reject incomplete and returned records, and require authorization', () => {
  for (const status of ['INCOMPLETE','RETURNED']) {
    const {c,state}=backend({status});
    assert.throws(()=>c.setInventoryAdministrativeStatus({code:'123456',status:'ACTIVE',managerPin:'valid'}),/Complete unfinished/);
    assert.equal(state().writes,0);assert.equal(state().released,true);
  }
  const {c}=backend({authorized:false});
  assert.throws(()=>c.setInventoryAdministrativeStatus({code:'123456',status:'ACTIVE'}),/authorization/);
});
test('valid inline status change writes status and timestamp and releases lock', () => {
  const {c,state}=backend();
  assert.equal(c.setInventoryAdministrativeStatus({code:'123456',status:'INACTIVE',managerPin:'valid'}).status,'INACTIVE');
  assert.deepEqual(state(),{deleted:false,released:true,writes:2});
});
function yourFindsEditor(manager=false) {
  const {context:c}=frontend();
  vm.runInContext(fs.readFileSync(path.join(root,'Frontend/Modals/InventoryManagementModal.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
  c.currentEmployee={accessLevel:manager?1:2,inventoryManagerToken:manager?"test-session":""};
  c.phase8SelectedItem={code:'YF1',name:'Sample',size:'M',category:'YOURFINDS',inventoryType:'UNIQUE',status:'INCOMPLETE',imageUrl:'photo',origPrice:45,price:90};
  c.document.getElementById('yfEditorDescription').value='Sample';
  c.document.getElementById('yfEditorSellingPrice').value='90';
  c.document.getElementById('yfEditorOriginalPrice').value='45';
  c.showNotificationToast=()=>{};c.loadInventoryPage=()=>{};
  const calls={saves:0,prints:0};
  c.printCompletedYourFindsLabel=()=>{calls.prints++;};
  c.google={script:{run:{
    withSuccessHandler(fn){calls.success=fn;return this;},
    withFailureHandler(fn){calls.failure=fn;return this;},
    saveYourFindsItemDetails(payload){calls.saves++;calls.payload=payload;},
  }}};
  return {c,calls};
}
test('cashier Save sends original price but no cost, blocks duplicate submits and skips labels',()=>{
  const {c,calls}=yourFindsEditor();
  c.saveYourFindsDetailsClient(false);
  c.saveYourFindsDetailsClient(true);
  assert.equal(calls.saves,1);assert.equal(calls.payload.originalPrice,45);assert.equal(Object.hasOwn(calls.payload,'costPrice'),false);
  assert.equal(c.document.getElementById('yfEditorSaveLabelBtn').disabled,true);
  calls.success({success:true,code:'YF1',wasCompleted:true});
  assert.equal(calls.prints,0);assert.equal(c.phase8YfSaving,false);
});
test('Save & Generate requests a label only after a successful save',()=>{
  const {c,calls}=yourFindsEditor(true);
  c.saveYourFindsDetailsClient(true);
  assert.equal(calls.payload.originalPrice,45);assert.equal(calls.prints,0);
  calls.failure({message:'Save failed'});
  assert.equal(calls.prints,0);assert.equal(c.document.getElementById('yfEditorSaveBtn').disabled,false);
  c.saveYourFindsDetailsClient(true);
  calls.success({success:true,code:'YF1',wasCompleted:true});
  assert.equal(calls.prints,1);
});
test('YF original price is editable by both roles; only managers see cost',()=>{
  for (const manager of [false,true]) {
    const {c}=yourFindsEditor(manager);
    c.phase8SelectedItem.costSource='CUSTOM';
    c.openYourFindsEditor();
    assert.equal(c.document.getElementById('yfEditorOriginalPriceWrap').style.display,'block');assert.equal(c.document.getElementById('yfEditorCostWrap').style.display,manager?'block':'none');
    assert.equal(c.document.getElementById('yfEditorOriginalPrice').value,45);
  }
});
test('backend preserves omitted original price when saving an unfinished item',()=>{
  const {c}=backend({status:'INCOMPLETE',stock:1});
  const saved=[];
  c.INV_IDX={IMAGE:0,DESCRIPTION:1,ORIG_PRICE:3,YS_PRICE:4,STATUS:5,UPDATED_AT:14};
  c.INVENTORY_STATUS.INCOMPLETE='INCOMPLETE';
  c.getYourFindsItemForCompletion=()=>({success:true,item:{code:'YF1',rowNumber:2,status:'INCOMPLETE',stock:1,size:'M',origPrice:45,imageUrl:'photo'}});
  c.SpreadsheetApp={flush(){},getActiveSpreadsheet(){return {getSheetByName(){return {getRange(row,col){return {getValues(){return [Array(17).fill('')];},setValue(value){saved[col-1]=value;}};}};}};}};
  const result=c.saveYourFindsItemDetails({code:'YF1',description:'Sample',sellingPrice:90});
  assert.equal(result.success,true);assert.equal(saved[12],45);assert.equal(saved[5],'ACTIVE');
});
test('YF view includes original price for both roles and cost only for managers',()=>{
  for(const manager of [false,true]){
    const {c}=yourFindsEditor(manager);
    c.inventoryPageData=[c.phase8SelectedItem];
    c.renderInventoryPhoto_=()=>{};
    c.openInventoryDetails('YF1');
    assert.equal(c.document.getElementById('invDetailBody').innerHTML.includes('Original Price'),true);assert.equal(c.document.getElementById('invDetailBody').innerHTML.includes('Cost Price'),manager);
    assert.equal(c.document.getElementById('invYfEditBtn').textContent,'Add Selling Details');
  }
});
test('category, search and summary cards use the same matching items',()=>{
  const {context:c}=frontend();
  c.inventoryPageData=[{code:'1',name:'Black pin',category:'PINS',stock:1,lowStockAt:2},{code:'2',name:'White pin',category:'PINS',stock:0},{code:'3',name:'Box',category:'YOURFINDS',stock:1}];
  assert.equal(c.getFilteredInventoryItems().length,3);
  c.document.getElementById('inventoryCategoryFilter').value='PINS';
  assert.deepEqual(Array.from(c.getInventorySummaryItems('products'),x=>x.name),['Black pin','White pin']);
  assert.deepEqual(Array.from(c.getInventorySummaryItems('low'),x=>x.name),['Black pin']);
  assert.deepEqual(Array.from(c.getInventorySummaryItems('sold'),x=>x.name),['White pin']);
  c.document.getElementById('inventorySearch').value='white';
  assert.equal(c.getInventorySummaryItems('stock').length,0);
});
test('PINS detail view omits size and delivery metadata',()=>{
  const {c}=yourFindsEditor(true);
  c.phase8SelectedItem.category='PINS';c.phase8SelectedItem.inventoryType='STOCK';
  c.inventoryPageData=[c.phase8SelectedItem];c.renderInventoryPhoto_=()=>{};
  c.openInventoryDetails('YF1');
  const html=c.document.getElementById('invDetailBody').innerHTML;
  for(const label of ['<b>Size</b>','<b>Delivered</b>','<b>Delivery ID</b>'])assert.equal(html.includes(label),false);
  assert.match(html,/Selling Price/);
});
test('manager inventory credentials use session without prompting for PIN',()=>{
  const {c}=yourFindsEditor(true);
  c.window={prompt(){throw Error('Unexpected PIN prompt');}};
  assert.equal(c.managerCredentials('PIN').managerToken,'test-session');
  delete c.currentEmployee.inventoryManagerToken;
  assert.equal(c.managerCredentials('PIN'),null);
});
function managerSessionHarness(){
  const entries=new Map();
  const rows=[['id','first','last','pin','role','level','active'],['1','Test','Manager','1234','Manager',1,true],['2','Test','Cashier','5678','Cashier',2,true]];
  const cache={put(key,value){entries.set(key,value);},get(key){return entries.get(key)||null;},remove(key){entries.delete(key);}};
  const c=vm.createContext({CacheService:{getScriptCache(){return cache;}},Utilities:{getUuid(){return '11111111-1111-4111-8111-111111111111';}},SHEETS:{EMPLOYEES:'Employees'},SpreadsheetApp:{getActiveSpreadsheet(){return {getSheetByName(){return {getDataRange(){return {getValues(){return rows;}};}};}};}}});
  vm.runInContext(fs.readFileSync(path.join(root,'Backend/Dashboard.js'),'utf8'),c);
  vm.runInContext(fs.readFileSync(path.join(root,'Backend/Employee.js'),'utf8'),c);
  vm.runInContext(fs.readFileSync(path.join(root,'Backend/InventoryMovement.js'),'utf8'),c);
  return {c,rows,entries};
}
test('only successful manager login issues a usable inventory authorization token',()=>{
  const {c,entries}=managerSessionHarness();
  assert.equal(c.verifyEmployee('Test Manager','wrong').success,false);assert.equal(entries.size,0);
  assert.equal(c.verifyEmployee('Test Cashier','5678').inventoryManagerToken,'');
  const token=c.verifyEmployee('Test Manager','1234').inventoryManagerToken;
  assert.equal(c.requireManager_('',token).managerName,'Test Manager');
  assert.throws(()=>c.requireManager_('','forged'),/sign out/);
});
test('manager authorization rejects expired, revoked and demoted sessions',()=>{
  const {c,rows,entries}=managerSessionHarness();
  let token=c.verifyEmployee('Test Manager','1234').inventoryManagerToken;
  c.revokeInventoryManagerSession(token);assert.throws(()=>c.verifyInventoryManagerSession_(token),/expired/);
  token=c.verifyEmployee('Test Manager','1234').inventoryManagerToken;
  rows[1][5]=2;assert.throws(()=>c.verifyInventoryManagerSession_(token),/active manager/);assert.equal([...entries.keys()].filter(key=>key.startsWith('inventory-manager:')).length,0);
});
test('summary groups YourFinds by size and other products by normalized name within category',()=>{
  const {context:c}=frontend();
  const groups=c.buildInventorySummaryGroups([
    {category:'YOURFINDS',size:'SNE',name:'Shoe',stock:1},
    {category:'YourFinds',size:' sne ',name:'Bag',stock:3,status:'INCOMPLETE'},
    {category:'PINS',name:'Black',stock:2},{category:'PINS',name:' black ',stock:3},
    {category:'OTHERS',name:'Black',stock:10}
  ]);
  assert.equal(groups.length,3);
  assert.equal(groups.find(x=>x.category==='YOURFINDS').stock,4);
  assert.equal(groups.find(x=>x.category==='PINS').stock,5);
  assert.equal(groups.find(x=>x.category==='OTHERS').stock,10);
});
test('YourFinds aggregate status has no low-stock threshold',()=>{
  const {context:c}=frontend();
  for(const [stock,status] of [[0,'SOLD OUT'],[1,'IN STOCK'],[4,'IN STOCK'],[5,'IN STOCK'],[10,'IN STOCK']]){
    assert.equal(c.buildInventorySummaryGroups([{category:'YOURFINDS',size:'SNE',stock}])[0].status,status);
  }
});
test('searching one YourFinds barcode retains full size total and category counters',()=>{
  const {context:c}=frontend();
  c.inventoryPageData=Array.from({length:5},(_,i)=>({code:'YF'+i,category:'YOURFINDS',size:'SNE',stock:1}));
  c.document.getElementById('inventorySearch').value='YF0';
  const group=c.getInventorySummaryItems('products')[0];
  assert.equal(group.stock,5);assert.equal(group.status,'IN STOCK');
  c.updateInventorySummary();
  assert.equal(c.document.getElementById('inventoryTotalProducts').textContent,1);
  c.openInventorySummary('products');
  assert.match(c.document.getElementById('inventorySummaryCategoryCounts').innerHTML,/5 units/);
  assert.match(c.document.getElementById('inventorySummaryCategoryCounts').innerHTML,/1 sizes/);
  assert.doesNotMatch(c.document.getElementById('inventorySummaryBody').innerHTML,/YF0|<button/);
});
test('group stock sorting is numeric in both directions and ignores returned quantities',()=>{
  const {context:c}=frontend();
  const groups=c.buildInventorySummaryGroups([{category:'PINS',name:'A',stock:2},{category:'PINS',name:'B',stock:10},{category:'PINS',name:'A',stock:99,status:'RETURNED'}]);
  c.inventorySummarySort={key:'stock',direction:1};
  assert.deepEqual(Array.from(c.sortInventorySummaryGroups(groups),x=>x.stock),[2,10]);
  c.inventorySummarySort.direction=-1;
  assert.deepEqual(Array.from(c.sortInventorySummaryGroups(groups),x=>x.stock),[10,2]);
});
test('saved selling details use manager session, while cashiers still need PIN',()=>{
  for(const manager of [true,false]){
    const {c,calls}=yourFindsEditor(manager);c.phase8SelectedItem.status='ACTIVE';
    c.phase8SelectedItem.costSource='CUSTOM';
    c.openYourFindsEditor();
    assert.equal(c.document.getElementById('yfEditorManagerPinWrap').style.display,manager?'none':'block');
    c.saveYourFindsDetailsClient(false);assert.equal(calls.saves,manager?1:0);
    if(manager)assert.equal(calls.payload.managerToken,'test-session');
    else{c.document.getElementById('yfEditorManagerPin').value='1234';c.saveYourFindsDetailsClient(false);assert.equal(calls.payload.managerPin,'1234');}
  }
});
test('saved YourFinds view shows the corner edit icon and hides initial details button',()=>{
  const {c}=yourFindsEditor(false);c.phase8SelectedItem.status='ACTIVE';c.phase8SelectedItem.stock=1;
  c.inventoryPageData=[c.phase8SelectedItem];c.renderInventoryPhoto_=()=>{};
  c.openInventoryDetails('YF1');
  assert.equal(c.document.getElementById('invDetailEditSellingBtn').style.display,'inline-block');
  assert.equal(c.document.getElementById('invYfEditBtn').style.display,'none');
});
test('backend rejects invalid session authorization for saved selling details',()=>{
  const {c}=backend({authorized:false,status:'ACTIVE',stock:1});
  c.getYourFindsItemForCompletion=()=>({success:true,item:{code:'YF1',rowNumber:2,status:'ACTIVE',stock:1,size:'M',origPrice:45,imageUrl:'photo'}});
  c.verifyInventoryManagerSession_=()=>{throw Error('Manager session invalid');};
  assert.throws(()=>c.saveYourFindsItemDetails({code:'YF1',description:'Saved',sellingPrice:90,managerToken:'invalid-session'}),/session invalid/);
});
function reprintClient(){
  const {context:c}=frontend();
  vm.runInContext(fs.readFileSync(path.join(root,'Frontend/Modals/YourFindsReprintModal.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
  c.document.getElementById('yourFindsReprintType').value='ALL';
  c.yourFindsReprintItems=[{code:'A',description:'Bag',labelType:'COMPLETED',deliveryId:'D1',sellingPrice:10},{code:'B',description:'Box',labelType:'INCOMPLETE',deliveryId:'D1'},{code:'C',description:'Shoe',labelType:'COMPLETED',deliveryId:'D2',sellingPrice:2}];
  c.showNotificationToast=()=>{};
  return c;
}
test('reprint select-all selects only filtered rows and reports hidden selection',()=>{
  const c=reprintClient();c.document.getElementById('yourFindsReprintSearch').value='Bag';
  c.selectVisibleYourFindsReprintItems(true);assert.deepEqual(Object.keys(c.yourFindsReprintSelection),['A']);
  c.document.getElementById('yourFindsReprintSearch').value='Box';c.renderYourFindsReprintItems();
  assert.match(c.document.getElementById('yourFindsReprintSelectedCount').textContent,/1 hidden/);
  c.selectVisibleYourFindsReprintItems(true);assert.deepEqual(Object.keys(c.yourFindsReprintSelection),['A','B']);
  c.selectVisibleYourFindsReprintItems(false);assert.deepEqual(Object.keys(c.yourFindsReprintSelection),['A']);
});
test('mixed reprint locks duplicate submissions and exposes both download links',()=>{
  const c=reprintClient();let requests=0,success;
  c.yourFindsReprintSelection={A:true,B:true};
  c.google={script:{run:{withSuccessHandler(fn){success=fn;return this;},withFailureHandler(){return this;},createYourFindsReprintPDFByGroups(done,initial){requests++;assert.deepEqual(Array.from(done),['A']);assert.deepEqual(Array.from(initial),['B']);}}}};
  c.printSelectedYourFindsReprintLabels();c.printSelectedYourFindsReprintLabels();assert.equal(requests,1);
  assert.equal(c.document.getElementById('yourFindsReprintControls').disabled,true);
  success({success:true,labelCount:2,files:[{labelType:'COMPLETED',labelCount:1,fileUrl:'https://example.com/selling'},{labelType:'INCOMPLETE',labelCount:1,fileUrl:'https://example.com/initial'}]});
  const links=c.document.getElementById('yourFindsReprintResult').children;
  assert.equal(links.length,2);assert.match(links[0].textContent,/Click here to print/);assert.match(links[0].textContent,/40 × 30/);assert.match(links[1].textContent,/30 × 20/);
  assert.equal(c.yourFindsReprintBusy,false);
});
test('logout dismisses sidebar and item overlays before displaying login',()=>{
  const {context:c}=frontend();const overlays=[{id:'inventoryDetailsModal',style:{display:'flex'}}];let sidebarClosed=false,refreshed=false;
  c.document.querySelectorAll=selector=>selector==='.generic-overlay-blur'?overlays:[];
  c.updatePettyCashDisplay=()=>{};c.confirm=()=>true;c.toggleSidebar=show=>{sidebarClosed=!show;};c.clearSession=()=>{};
  c.localStorage={removeItem(){}};c.renderCart=()=>{};c.initializeLogin=()=>{refreshed=true;};
  const source=fs.readFileSync(path.join(root,'Frontend/Layout/Sidebar.html'),'utf8');
  vm.runInContext(source.slice(source.indexOf('function triggerCleanLogout()'),source.indexOf('  window.addEventListener("click"')),c);
  c.yourFindsReprintRequest=0;c.loginAttempt=0;c.bulkDistributionRequest=0;c.supplierReturnLoad=0;c.populateManualDropdown=()=>{};
  c.triggerCleanLogout();
  assert.equal(sidebarClosed,true);assert.equal(overlays[0].style.display,'none');assert.equal(c.document.getElementById('loginOverlay').style.display,'flex');assert.equal(c.currentEmployee,null);assert.equal(refreshed,true);
});
test('bulk label backend deduplicates codes and validates both groups before generating',()=>{
  const c=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root,'Backend/Label.js'),'utf8'),c);
  c.getYourFindsItemsForLabelReprint=()=>({items:[{code:'A',labelType:'COMPLETED'},{code:'B',labelType:'INCOMPLETE'}]});
  const calls=[];c.createYourFindsReprintPDFByCodes=(codes,type)=>{calls.push(type);return {success:true,labelCount:codes.length,fileUrl:'https://example.com/'+type};};
  assert.throws(()=>c.createYourFindsReprintPDFByGroups(['A'],['missing']),/no longer available/);assert.equal(calls.length,0);
  const result=c.createYourFindsReprintPDFByGroups(['A','A'],[' B ']);
  assert.equal(result.labelCount,2);assert.equal(result.files.length,2);assert.equal(result.files[1].labelType,'INCOMPLETE');
});
test('desktop sidebar collapse persists and navigation does not dismiss it',()=>{
  const {context:c}=frontend();const store=new Map();let desktop=true;
  c.window={matchMedia(){return {matches:desktop};},addEventListener(){}};
  c.localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
  vm.runInContext(fs.readFileSync(path.join(root,'Frontend/Layout/Sidebar.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
  c.restoreSidebarLayout();assert.equal(c.document.body.classList.contains('pos-session-active'),true);
  c.toggleSidebar();assert.equal(store.get('ys_pos_sidebar_collapsed'),'true');
  c.toggleSidebar(false);assert.equal(store.get('ys_pos_sidebar_collapsed'),'true');
  c.toggleSidebar();assert.equal(store.get('ys_pos_sidebar_collapsed'),'false');
  desktop=false;c.toggleSidebar();assert.equal(c.document.getElementById('sidebarOverlay').classList.contains('show'),true);
  c.toggleSidebar(false);assert.equal(c.document.getElementById('sidebarOverlay').classList.contains('show'),false);
});
test('shared PIN authorization accepts only valid manager session credentials',()=>{
  const {c}=managerSessionHarness();
  const token=c.verifyEmployee('Test Manager','1234').inventoryManagerToken;
  assert.equal(c.verifyManagerPin({managerToken:token}).success,true);
  assert.equal(c.verifyManagerPin({managerToken:'forged'}).success,false);
  assert.equal(c.verifyManagerPin('1234').success,true);
  c.revokeInventoryManagerSession(token);
  assert.equal(c.verifyManagerPin({managerToken:token}).success,false);
});
test('report actions are in cashier page; cashier displays petty cash and cashier has void/exchange',()=>{
  const sidebar=fs.readFileSync(path.join(root,'Frontend/Layout/Sidebar.html'),'utf8');
  const cashier=fs.readFileSync(path.join(root,'Frontend/Pages/CashierPage.html'),'utf8');
  assert.doesNotMatch(sidebar,/openAcceptDeliveryTypeModal|openManagerReportModal/);
  assert.match(cashier,/id="cashierPettyCash"/);
  assert.doesNotMatch(sidebar,/sidebarCollapseBtn|openPettyCashSidebar|onclick="toggleVoidModal|onclick="openCustomerExchangeModal/);
  assert.match(cashier,/onclick="toggleVoidModal\(true\)"/);assert.match(cashier,/onclick="openCustomerExchangeModal\(\)"/);
  assert.match(cashier,/id="cashierManagerReportBtn"/);
  assert.match(cashier,/toggleShiftReportModal\(true\)/);
});

function costHarness() {
  const {c}=backend();
  const records={
    Inventory:[['Code','Name','Size','Category','Type','Status','','','','','','','','','','','Custom Cost Price'],['YF1','YF','FREE SIZE','YourFinds','UNIQUE','INCOMPLETE',0,0,0,1,'IN STOCK',90,45,'photo','','',30]],
    'Product Master':[['Code','Description','Category','Type','Selling Price','Cost Price','Low Stock At','Active','Image','Created At','Updated At'],['123456','Pin','PINS','STOCK',100,40,5,true,'','','']]
  };
  function sheet(name){return {getName:()=>name,getMaxColumns:()=>26,getLastRow:()=>records[name].length,
    getRange(row,col,height=1,width=1){return {
      getValue(){return records[name][row-1]?.[col-1]??'';},
      getValues(){return Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>records[name][row+i-1]?.[col+j-1]??''));},
      getDisplayValues(){return this.getValues().map(r=>r.map(String));},
      setValue(value){records[name][row-1][col-1]=value;},
      setValues(values){values.forEach((r,i)=>r.forEach((v,j)=>records[name][row+i-1][col+j-1]=v));}
    };},appendRow(row){records[name].push(row);}};}
  c.SpreadsheetApp={flush(){},getActiveSpreadsheet(){return {getSheetByName:sheet};}};
  c.Utilities={formatDate:()=> '2026-10-01'};c.Session={getScriptTimeZone:()=> 'Asia/Manila'};
  c.verifyInventoryManagerSession_=token=>{if(token!=='manager')throw Error('Manager session invalid');return {success:true,managerName:'Manager'};};
  vm.runInContext(fs.readFileSync(path.join(root,'Backend/Constants.js'),'utf8'),c);
  vm.runInContext(fs.readFileSync(path.join(root,'Backend/ProductMaster.js'),'utf8'),c);
  // Use production size normalization, while retaining isolated sheet mutations.
  const inventorySource=fs.readFileSync(path.join(root,'Backend/Inventory.js'),'utf8');
  vm.runInContext(inventorySource.slice(inventorySource.indexOf('function normalizeYourFindsSaleSize_'),inventorySource.indexOf('function getYourFindsSaleTemplate_')),c);
  c.getFullInventory=()=>[{code:'YF1',category:'YOURFINDS',size:'FREE SIZE'},{code:'123456',category:'PINS'}];
  c.getYourFindsItemForCompletion=()=>({success:true,item:{code:'YF1',rowNumber:2,status:records.Inventory[1][5],stock:1,size:'FREE SIZE',origPrice:records.Inventory[1][12],imageUrl:'photo'}});
  return {c,records};
}
test('cost reads require a valid manager session; ordinary reads omit costs',()=>{
  const {c}=costHarness();
  assert.equal(Object.hasOwn(c.getInventoryForManagement('')[0],'costPrice'),false);
  assert.equal(Object.hasOwn(c.getProductMasterForManagement('')[0],'costPrice'),false);
  assert.throws(()=>c.getInventoryForManagement('cashier'),/session invalid/);
  assert.throws(()=>c.getProductMasterForManagement('cashier'),/session invalid/);
  assert.deepEqual(Array.from(c.getInventoryForManagement('manager'),item=>item.costPrice),[30,40]);
  assert.equal(c.getProductMasterForManagement('manager')[0].costPrice,40);
});
test('cashier completion saves original and selling prices without PIN, preserves cost',()=>{
  const {c,records}=costHarness();
  c.requireManager_=()=>{throw Error('Unexpected PIN prompt');};
  c.saveYourFindsItemDetails({code:'YF1',description:'YF',originalPrice:55,sellingPrice:95});
  assert.equal(records.Inventory[1][12],55);assert.equal(records.Inventory[1][11],95);
  assert.equal(records.Inventory[1][16],30);assert.equal(records.Inventory[1][5],'ACTIVE');
});
test('manager saves YF cost independently; forged and negative cost writes fail before changes',()=>{
  const {c,records}=costHarness();
  for(const payload of [{costPrice:5,managerPin:'approved'},{costPrice:-1,managerToken:'manager'}]){
    assert.throws(()=>c.saveYourFindsItemDetails({code:'YF1',description:'YF',sellingPrice:100,...payload}),/session invalid|non-negative/);
    assert.equal(records.Inventory[1][11],90);assert.equal(records.Inventory[1][16],30);
  }
  c.saveYourFindsItemDetails({code:'YF1',description:'YF',originalPrice:55,sellingPrice:100,costPrice:35,managerToken:'manager'});
  assert.equal(records.Inventory[1][16],35);assert.equal(records.Inventory[1][12],55);
});
test('PINS edit preserves omitted cost; manager cost is separate',()=>{
  const {c,records}=costHarness();
  const payload={productCode:'123456',description:'Pin',category:'PINS',defaultPrice:110,lowStockAt:5,isNew:false,managerPin:'approved'};
  c.saveProductMaster(payload);
  assert.equal(records['Product Master'][1][4],110);assert.equal(records['Product Master'][1][5],40);
  c.saveProductMaster({...payload,costPrice:50,managerToken:'manager'});
  assert.equal(records['Product Master'][1][5],50);
  assert.throws(()=>c.saveProductMaster({...payload,costPrice:1}),/session invalid/);
});
test('missing legacy costs stay unknown rather than being inferred from original price',()=>{
  const {c,records}=costHarness();records.Inventory[0][16]='';records['Product Master'][1][5]='';
  assert.deepEqual(Array.from(c.getInventoryForManagement('manager'),item=>item.costPrice),[null,null]);
  assert.equal(c.costPayload_({costPrice:0,managerToken:'manager'}),0);
  assert.equal(c.costPayload_({costPrice:'',managerToken:'manager'}),'');
  records.Inventory[0][16]='Other field';
  assert.throws(()=>c.customCostColumn_(c.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inventory'),true),/already used/);
});
test('inventory workspace remembers Delivery when leaving and returning',()=>{
  const {context:c}=frontend();const store=new Map();let loaded='';
  c.document.querySelector=()=>null;c.window={matchMedia:()=>({matches:true}),addEventListener(){}};
  c.localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
  c.loadDashboardPage=()=>{loaded='dashboard';};c.loadDeliveriesPage=()=>{loaded='delivery';};c.loadInventoryPage=()=>{loaded='inventory';};
  vm.runInContext(fs.readFileSync(path.join(root,'Frontend/Layout/Sidebar.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
  c.showPage('deliveriesPage');c.showPage('posPage');c.openInventoryWorkspace();
  assert.equal(loaded,'delivery');assert.equal(store.get('ys_pos_active_page'),'deliveriesPage');
  c.showPage('inventoryPage');c.showPage('dashboardPage');c.openInventoryWorkspace();assert.equal(loaded,'inventory');
});

test('summary cards count positive units while table preserves negative balances',()=>{
  const {context:c}=frontend();
  const items=[{category:'OTHERS',name:'Bag',stock:5},{category:'OTHERS',name:'Bag',stock:-20},{category:'OTHERS',name:'Hat',stock:-3},{category:'OTHERS',name:'Bag',stock:8,status:'RETURNED'}];
  const groups=c.buildInventorySummaryGroups(items);
  assert.equal(groups.find(g=>g.name==='Bag').stock,-15);
  assert.equal(groups.find(g=>g.name==='Hat').stock,-3);
  assert.equal(groups.reduce((total,g)=>total+g.positiveStock,0),5);
  c.getInventorySummaryItems=()=>groups;
  c.renderInventorySummary();
  assert.match(c.document.getElementById('inventorySummaryCount').textContent,/5 units/);
  assert.match(c.document.getElementById('inventorySummaryCategoryCounts').innerHTML,/5 units/);
  assert.match(c.document.getElementById('inventorySummaryBody').innerHTML,/>-15<|>-3</);
  assert.equal(items[1].stock,-20);
});
