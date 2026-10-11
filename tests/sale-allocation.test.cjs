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

test('sellable inventory creates virtual partial-sale row without duplicating stock', () => {
  const source = fs.readFileSync(path.join(root, 'Backend/Inventory.js'), 'utf8');
  const code = source.slice(source.indexOf('function getSellableInventory()'), source.indexOf('function getInventoryDisplayStatus'));
  const items = [
    {code:'A', name:'YELLOW', status:'ACTIVE', productStatus:'ON SALE', stock:10, regularPrice:120, salePrice:99, saleRemaining:3, saleReferenceId:'SALE-1'},
    {code:'B', name:'BLACK', status:'ACTIVE', productStatus:'ON SALE', stock:4, regularPrice:150, salePrice:100, saleRemaining:null, saleReferenceId:'SALE-2'},
    {code:'C', name:'BLUE', status:'ACTIVE', productStatus:'DEACTIVATED', stock:8, regularPrice:120},
    {code:'D', name:'RED', status:'ACTIVE', productStatus:'ON SALE', stock:2, regularPrice:120, salePrice:90, saleRemaining:5, saleReferenceId:'SALE-3'}
  ];
  const c = vm.createContext({getFullInventory:()=>items, INVENTORY_STATUS:{ACTIVE:'ACTIVE'}, PRODUCT_STATUS:{ACTIVE:'ACTIVE',DEACTIVATED:'DEACTIVATED',ON_SALE:'ON SALE'}});
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
