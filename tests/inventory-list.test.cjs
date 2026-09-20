const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function frontend() {
  const elements = {};
  function element() {
    return { style: {}, dataset: {}, value: '', children: [], innerHTML: '',
      appendChild(child) { this.children.push(child); }, setAttribute() {}, addEventListener() {},
      querySelector(selector) { if (selector === '.inventory-actions') return this.actions || (this.actions = element()); return null; } };
  }
  const context = vm.createContext({currentEmployee:{accessLevel:1}, document:{
    getElementById(id) { return elements[id] || (elements[id] = element()); },
    querySelectorAll() { return []; }, createElement:element,
  }});
  vm.runInContext(fs.readFileSync(path.join(root,'Frontend/Pages/InventoryPage.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1], context);
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
test('cashiers get view only; managers get edit, view, delete and active column', () => {
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
  const inventory={deleteRow(){deleted=true;},getRange(){return {getValues(){return [Array(15).fill('')];},setValues(){writes++;}};}};
  const history={getName(){return 'Sales';},getLastRow(){return references.length+1;},getLastColumn(){return 1;},getRange(){return {getDisplayValues(){return references;}};}};
  const sheet={getSheets(){return [history];},getSheetByName(){return inventory;}};
  const c=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet(){return sheet;}},LockService:{getScriptLock(){return {waitLock(){},releaseLock(){released=true;}};}},verifyManagerPin(){return {success:authorized,message:'Manager authorization failed'};},getFullInventory(){return [item];},getProductMaster(){return [];},getInventoryItemByCode(){return {success:true,item};},SHEETS:{INVENTORY:'Inventory',PRODUCT_MASTER:'Product Master',EMPLOYEES:'Employees'},INVENTORY_STATUS:{ACTIVE:'ACTIVE',INACTIVE:'INACTIVE'},INVENTORY_TYPE:{UNIQUE:'UNIQUE'},INVENTORY_COLUMN_COUNT:15,INV_IDX:{STATUS:5,UPDATED_AT:14}});
  vm.runInContext(fs.readFileSync(path.join(root,'Backend/InventoryMovement.js'),'utf8'),c);
  return {c,state:()=>({deleted,released,writes})};
}
test('delete rejects unauthorized requests, stocked items and historical references', () => {
  for (const [options,pattern] of [[{authorized:false},/authorization/],[{stock:1},/zero-stock/],[{references:[['123456']]},/existing records/]]) {
    const {c,state}=backend(options);
    assert.throws(()=>c.deleteUnusedInventoryItemPhase8({code:'123456',managerPin:'bad'}),pattern);
    assert.equal(state().deleted,false);
  }
});
test('delete removes unused zero-stock row and releases lock', () => {
  const {c,state}=backend();
  assert.equal(c.deleteUnusedInventoryItemPhase8({code:'123456',managerPin:'valid'}).success,true);
  assert.deepEqual(state(),{deleted:true,released:true,writes:0});
});
test('status updates reject incomplete and returned records, and require authorization', () => {
  for (const status of ['INCOMPLETE','RETURNED']) {
    const {c,state}=backend({status});
    assert.throws(()=>c.setInventoryAdministrativeStatusPhase8({code:'123456',status:'ACTIVE',managerPin:'valid'}),/Complete unfinished/);
    assert.equal(state().writes,0);assert.equal(state().released,true);
  }
  const {c}=backend({authorized:false});
  assert.throws(()=>c.setInventoryAdministrativeStatusPhase8({code:'123456',status:'ACTIVE'}),/authorization/);
});
test('valid inline status change writes once and releases lock', () => {
  const {c,state}=backend();
  assert.equal(c.setInventoryAdministrativeStatusPhase8({code:'123456',status:'INACTIVE',managerPin:'valid'}).status,'INACTIVE');
  assert.deepEqual(state(),{deleted:false,released:true,writes:1});
});
function yourFindsEditor(manager=false) {
  const {context:c}=frontend();
  vm.runInContext(fs.readFileSync(path.join(root,'Frontend/Modals/InventoryManagementModal.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
  c.currentEmployee={accessLevel:manager?1:2};
  c.phase8SelectedItem={code:'YF1',name:'Sample',size:'M',category:'YOURFINDS',inventoryType:'UNIQUE',status:'INCOMPLETE',imageUrl:'photo',origPrice:45,price:90};
  c.document.getElementById('yfEditorDescription').value='Sample';
  c.document.getElementById('yfEditorSellingPrice').value='90';
  c.document.getElementById('yfEditorOriginalPrice').value='45';
  c.showNotificationToast=()=>{};c.loadInventoryPage=()=>{};
  const calls={saves:0,prints:0};
  c.printCompletedYourFindsLabelPhase8=()=>{calls.prints++;};
  c.google={script:{run:{
    withSuccessHandler(fn){calls.success=fn;return this;},
    withFailureHandler(fn){calls.failure=fn;return this;},
    saveYourFindsItemDetailsPhase8(payload){calls.saves++;calls.payload=payload;},
  }}};
  return {c,calls};
}
test('cashier Save omits original price, blocks double submits and skips labels',()=>{
  const {c,calls}=yourFindsEditor();
  c.saveYourFindsDetailsClientPhase8(false);
  c.saveYourFindsDetailsClientPhase8(true);
  assert.equal(calls.saves,1);assert.equal(Object.hasOwn(calls.payload,'originalPrice'),false);
  assert.equal(c.document.getElementById('yfEditorSaveLabelBtn').disabled,true);
  calls.success({success:true,code:'YF1',wasCompleted:true});
  assert.equal(calls.prints,0);assert.equal(c.phase8YfSaving,false);
});
test('Save & Generate requests a label only after a successful save',()=>{
  const {c,calls}=yourFindsEditor(true);
  c.saveYourFindsDetailsClientPhase8(true);
  assert.equal(calls.payload.originalPrice,45);assert.equal(calls.prints,0);
  calls.failure({message:'Save failed'});
  assert.equal(calls.prints,0);assert.equal(c.document.getElementById('yfEditorSaveBtn').disabled,false);
  c.saveYourFindsDetailsClientPhase8(true);
  calls.success({success:true,code:'YF1',wasCompleted:true});
  assert.equal(calls.prints,1);
});
test('original price editor is hidden and blank for cashiers, visible for managers',()=>{
  for (const manager of [false,true]) {
    const {c}=yourFindsEditor(manager);
    c.openYourFindsEditorPhase8();
    assert.equal(c.document.getElementById('yfEditorOriginalPriceWrap').style.display,manager?'block':'none');
    assert.equal(c.document.getElementById('yfEditorOriginalPrice').value,manager?45:'');
  }
});
test('backend preserves omitted original price when saving an unfinished item',()=>{
  const {c}=backend({status:'INCOMPLETE',stock:1});
  let saved;
  c.INV_IDX={IMAGE:0,DESCRIPTION:1,ORIG_PRICE:3,YS_PRICE:4,STATUS:5,UPDATED_AT:14};
  c.INVENTORY_STATUS.INCOMPLETE='INCOMPLETE';
  c.getYourFindsItemForCompletion=()=>({success:true,item:{code:'YF1',rowNumber:2,status:'INCOMPLETE',stock:1,size:'M',origPrice:45,imageUrl:'photo'}});
  c.SpreadsheetApp={flush(){},getActiveSpreadsheet(){return {getSheetByName(){return {getRange(){return {getValues(){return [Array(15).fill('')];},setValues(rows){saved=rows[0];}};}};}};}};
  const result=c.saveYourFindsItemDetailsPhase8({code:'YF1',description:'Sample',sellingPrice:90});
  assert.equal(result.success,true);assert.equal(saved[3],45);assert.equal(saved[5],'ACTIVE');
});
test('item view includes original price only for managers',()=>{
  for(const manager of [false,true]){
    const {c}=yourFindsEditor(manager);
    c.inventoryPageData=[c.phase8SelectedItem];
    c.phase8RenderInventoryPhoto_=()=>{};
    c.openInventoryDetailsPhase8('YF1');
    assert.equal(c.document.getElementById('invDetailBody').innerHTML.includes('Original Price'),manager);
    assert.equal(c.document.getElementById('invYfEditBtn').textContent,'Add Selling Details');
  }
});
