const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

test('sale labels appear in cart and sales records without duplicate suffixes', () => {
  const cashierSource=fs.readFileSync(path.join(root,'Frontend/Pages/CashierPage.html'),'utf8');
  const cashierCode=cashierSource.slice(cashierSource.indexOf('function cashierItemDisplayName'),cashierSource.indexOf('function renderCart'));
  const salesSource=fs.readFileSync(path.join(root,'Backend/Sales.js'),'utf8');
  const salesCode=salesSource.slice(salesSource.indexOf('function saleDisplayName_'),salesSource.indexOf('function executeCheckoutBackend'));
  const c=vm.createContext({});vm.runInContext(cashierCode+'\n'+salesCode,c);
  assert.equal(c.cashierItemDisplayName({name:'TEST',priceSource:'SALE'}),'TEST · SALE');
  assert.equal(c.cashierItemDisplayName({name:'TEST',priceSource:'REGULAR'}),'TEST');
  assert.equal(c.saleDisplayName_('TEST · SALE','SALE'),'TEST · SALE');
});

test('checkout stock changes use one inventory read, one movement write and one flush', () => {
  const source=fs.readFileSync(path.join(root,'Backend/InventoryMovement.js'),'utf8');
  const code=source.slice(source.indexOf('function changeInventoryStockBatch_'),source.indexOf('function logInventoryMovement'));
  const inventoryRows=[
    ['A','Yellow','','PINS','STOCK','ACTIVE','','','','',10],
    ['B','Black','','PINS','STOCK','ACTIVE','','','','',5]
  ].map(row=>row.concat(Array(17-row.length).fill('')));
  let inventoryReads=0,movementWrites=0,flushes=0,ids=0,written=[];
  const inventorySheet={getLastRow:()=>3,getRange(row,col,height,width){return {getValues(){inventoryReads++;return inventoryRows.map(item=>item.slice());},setValue(){}};},getRangeList(){return {setValue(){}};}};
  const movementSheet={getLastRow:()=>1,getRange(){return {setValues(rows){movementWrites++;written=rows;}};}};
  const c=vm.createContext({Date,SpreadsheetApp:{getActiveSpreadsheet(){return {getSheetByName(name){return name==='Inventory'?inventorySheet:movementSheet;}};},flush(){flushes++;}},SHEETS:{INVENTORY:'Inventory',INVENTORY_MOVEMENT_LOG:'Movements'},INVENTORY_COLUMN_COUNT:17,MOVEMENT_LOG_COLUMN_COUNT:16,INV_IDX:{CODE:0,CATEGORY:3,INVENTORY_TYPE:4,STOCK:10},INV_COL:{UPDATED_AT:17},getInventoryMovementType:()=> 'PINS',generateInventoryMovementId:()=>`M${++ids}`});
  vm.runInContext(code,c);
  const result=c.changeInventoryStockBatch_([
    {code:'A',qtyChange:-2,source:'SALE',referenceId:'R1'},
    {code:'A',qtyChange:-1,source:'SALE',referenceId:'R1'}
  ]);
  assert.equal(inventoryReads,1);assert.equal(movementWrites,1);assert.equal(flushes,1);
  assert.equal(JSON.stringify(Array.from(result,x=>[x.stockBefore,x.stockAfter])),'[[10,8],[8,7]]');
  assert.equal(JSON.stringify(written.map(row=>[row[9],row[10]])),'[[10,8],[8,7]]');
});

test('sellable inventory creates virtual partial-sale row without duplicating stock', () => {
  const source = fs.readFileSync(path.join(root, 'Backend/Inventory.js'), 'utf8');
  const code = source.slice(source.indexOf('function getSellableInventory()'), source.indexOf('function getInventoryDisplayStatus'));
  const items = [
    {code:'A', name:'YELLOW', status:'ACTIVE', productStatus:'ON SALE', stock:10, regularPrice:120, salePrice:99, saleRemaining:3, saleReferenceId:'SALE-1'},
    {code:'B', name:'BLACK', status:'ACTIVE', productStatus:'ON SALE', stock:4, regularPrice:150, salePrice:100, saleRemaining:null, saleReferenceId:'SALE-2'},
    {code:'C', name:'BLUE', status:'ACTIVE', productStatus:'DEACTIVATED', stock:8, regularPrice:120},
    {code:'D', name:'RED', status:'ACTIVE', productStatus:'ON SALE', stock:2, regularPrice:120, salePrice:90, saleRemaining:5, saleReferenceId:'SALE-3'}
  ];
  const c = vm.createContext({getFullInventory:()=>items,getProductMaster_:()=>[], INVENTORY_STATUS:{ACTIVE:'ACTIVE'}, PRODUCT_STATUS:{ACTIVE:'ACTIVE',DEACTIVATED:'DEACTIVATED',ON_SALE:'ON SALE'}});
  vm.runInContext(code, c);
  c.expireEndedProductSales_ = () => {};
  const result = c.getSellableInventory();
  assert.deepEqual(Array.from(result, x=>[x.code,x.priceSource,x.stock,x.price]), [
    ['A','REGULAR',7,120], ['A','SALE',3,99], ['B','SALE',4,100], ['D','SALE',2,90]
  ]);
});

test('sale checkout rejects stale references and accepts current sale price', () => {
  const source = fs.readFileSync(path.join(root, 'Backend/Sales.js'), 'utf8');
  const code = source.slice(source.indexOf('function validateSalePricing_'), source.indexOf('function consumeSaleAllocations_'));
  const product = {productCode:'A',status:'ON SALE',salePrice:99,saleRemaining:3,saleReferenceId:'SALE-1'};
  const c = vm.createContext({getProductMaster_:()=>[product],PRODUCT_STATUS:{ON_SALE:'ON SALE'}});
  vm.runInContext(code,c);
  assert.equal(c.validateSalePricing_([{code:'A',name:'YELLOW',price:99,quantity:2,priceSource:'SALE',saleReferenceId:'SALE-1'}])[0].priceSource,'SALE');
  assert.throws(()=>c.validateSalePricing_([{code:'A',name:'YELLOW',price:99,quantity:1,priceSource:'SALE',saleReferenceId:'OLD'}]),/sale changed/i);
});

test('two sale allocations create distinct sellable variants without duplicating stock', () => {
  const source = fs.readFileSync(path.join(root, 'Backend/Inventory.js'), 'utf8');
  const code = source.slice(source.indexOf('function getSellableInventory()'), source.indexOf('function getInventoryDisplayStatus'));
  const item = {code:'A',name:'YELLOW',status:'ACTIVE',productStatus:'ON SALE',stock:10,regularPrice:500,
    salePrices:[{price:450,remaining:6,referenceId:'SALE-1'},{price:400,remaining:4,referenceId:'SALE-2'}]};
  const c=vm.createContext({getProductMaster_:()=>[],getFullInventory:()=>[item],
    INVENTORY_STATUS:{ACTIVE:'ACTIVE'},PRODUCT_STATUS:{ACTIVE:'ACTIVE',DEACTIVATED:'DEACTIVATED',ON_SALE:'ON SALE'}});
  vm.runInContext(code,c);c.expireEndedProductSales_=()=>{};
  const result=c.getSellableInventory();
  assert.deepEqual(Array.from(result,row=>[row.variantKey,row.stock,row.price]),[
    ['A|SALE|SALE-1',6,450],['A|SALE|SALE-2',4,400]]);
  assert.equal(result.reduce((sum,row)=>sum+row.stock,0),10);
});

test('checkout validates each price reference and aggregated quantity', () => {
  const source=fs.readFileSync(path.join(root,'Backend/Sales.js'),'utf8');
  const code=source.slice(source.indexOf('function validateSalePricing_'),source.indexOf('function consumeSaleAllocations_'));
  const product={productCode:'A',status:'ON SALE',salePrices:[
    {price:450,remaining:2,referenceId:'S1'},{price:400,remaining:4,referenceId:'S2'}]};
  const c=vm.createContext({getProductMaster_:()=>[product],PRODUCT_STATUS:{ON_SALE:'ON SALE'}});
  vm.runInContext(code,c);
  assert.equal(c.validateSalePricing_([
    {code:'A',quantity:1,price:450,priceSource:'SALE',saleReferenceId:'S1'},
    {code:'A',quantity:3,price:400,priceSource:'SALE',saleReferenceId:'S2'}]).length,2);
  assert.throws(()=>c.validateSalePricing_([
    {code:'A',quantity:2,price:450,priceSource:'SALE',saleReferenceId:'S1'},
    {code:'A',quantity:1,price:450,priceSource:'SALE',saleReferenceId:'S1'}]),/only 2 sale item/i);
  assert.throws(()=>c.validateSalePricing_([{code:'A',quantity:1,price:450,priceSource:'SALE',saleReferenceId:'S2'}]),/sale price changed/i);
});

test('checkout consumes only the selected sale allocations', () => {
  const source=fs.readFileSync(path.join(root,'Backend/Sales.js'),'utf8');
  const code=source.slice(source.indexOf('function consumeSaleAllocations_'),source.indexOf('function getExpectedCashForCurrentCashier'));
  const product={productCode:'A',rowNumber:2,status:'ON SALE',salePricesStored:true,salePrices:[
    {price:450,quantity:2,remaining:2,referenceId:'S1'},
    {price:400,quantity:4,remaining:4,referenceId:'S2'}]};
  let written;
  const sheet={getRange(){return {setValue(){}};}};
  const c=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet})},
    SHEETS:{PRODUCT_MASTER:'Product Master'},PRODUCT_COL:{UPDATED_AT:11},PRODUCT_STATUS:{ON_SALE:'ON SALE'},
    writeProductSalePrices_(_sheet,_row,tiers){written=tiers.filter(tier=>tier.remaining>0);return written;}});
  vm.runInContext(code,c);
  c.consumeSaleAllocations_([
    {code:'A',quantity:2,priceSource:'SALE',saleReferenceId:'S1'},
    {code:'A',quantity:1,priceSource:'SALE',saleReferenceId:'S2'}], 'Cashier', [product]);
  assert.deepEqual(Array.from(written,tier=>[tier.referenceId,tier.remaining]),[['S2',3]]);
});
