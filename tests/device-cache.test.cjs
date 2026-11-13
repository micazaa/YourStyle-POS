const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync('Frontend/Scripts/DeviceCache.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1];
function fixture(enabled=true) {
  const storage = new Map();
  const context = vm.createContext({Intl,Date,document:{body:{dataset:{deviceCacheEnabled:String(enabled)}}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    currentEmployee:{dashboardToken:'first'},inventoryDataset:null,inventoryDownload:null,inventoryListVersion:'',
    inventoryDatasetReady:()=>!!context.inventoryDataset,refreshInventoryChanges:()=>context.refreshes++});
  context.refreshes=0;
  vm.runInContext(script,context);
  return {context,storage};
}
test('daily catalog survives account changes and stores display fields without credentials or costs',()=>{
  const {context:c,storage}=fixture();
  c.writeDeviceCache('cashier',[{code:'A',name:'Item',stock:10,price:500,costPrice:100,managerToken:'secret',priceSource:'SALE',saleReferenceId:'SALE-1'}],'v1');
  const saved=[...storage.values()][0];
  assert.doesNotMatch(saved,/costPrice|managerToken|secret/);
  c.currentEmployee=null;assert.equal(c.readDeviceCache('cashier'),null);
  c.currentEmployee={dashboardToken:'second'};
  const item=c.readDeviceCache('cashier').items[0];
  assert.equal(item.stock,10);assert.equal(item.priceSource,'SALE');assert.equal(item.saleReferenceId,'SALE-1');
  c.clearDeviceInventoryCache();assert.equal(storage.size,0);
});
test('only dev caches data; expired, malformed and unavailable storage fall back to live loading',()=>{
  const {context:c,storage}=fixture(false);c.writeDeviceCache('inventory',[{code:'A'}],'v1');assert.equal(storage.size,0);
  c.document.body.dataset.deviceCacheEnabled='true';
  storage.set('ys_uat_daily_v1_inventory',JSON.stringify({day:'2000-01-01',items:[]}));assert.equal(c.readDeviceCache('inventory'),null);
  storage.set('ys_uat_daily_v1_inventory','bad json');assert.equal(c.readDeviceCache('inventory'),null);
  c.localStorage.setItem=()=>{throw Error('quota');};assert.doesNotThrow(()=>c.writeDeviceCache('inventory',[],'v1'));
});
test('restored inventory belongs to the new session and immediately requests stock changes',()=>{
  const {context:c}=fixture();
  c.writeDeviceCache('inventory',[{code:'A',stock:10,costPrice:100}],'version-1');
  c.currentEmployee={dashboardToken:'second'};c.restoreDeviceInventory();
  assert.equal(c.inventoryDataset.owner,'second');assert.equal(c.inventoryDataset.items[0].stock,10);
  assert.equal(c.inventoryDataset.items[0].costPrice,undefined);assert.equal(c.inventoryListVersion,'version-1');assert.equal(c.refreshes,1);
  c.restoreDeviceInventory();assert.equal(c.refreshes,1);
});
test('cashier shows saved products before the live refresh finishes, then replaces them',()=>{
  const {context:c}=fixture();
  c.writeDeviceCache('cashier',[{code:'A',stock:10,price:500}],'v1');
  const displayed=[];
  c.masterInventory=[];
  c.cashierInventoryCacheKey=()=>'';
  c.finishWorkspacePageLoad=()=>{};
  c.populateManualDropdown=items=>displayed.push(items[0].stock);
  c.pageReadCache=new Map([['cashierInventory',{}]]);
  c.beginPageRead=()=>({shouldFetch:true,current:()=>true,save(){}});
  c.rememberCashierBundlePreload=()=>{};
  c.secureScriptRun={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(){return this;},getSellableInventory(){}};
  const source=fs.readFileSync('Frontend/Pages/CashierPage.html','utf8');
  vm.runInContext(source.slice(source.indexOf('function refreshInventory(callback)'),source.indexOf('function populateManualDropdown')),c);
  c.refreshInventory();assert.deepEqual(displayed,[10]);
  c.secureScriptRun.success({inventory:[{code:'A',stock:8,price:500}],version:'v2'});
  assert.deepEqual(displayed,[10,8]);assert.equal(c.readDeviceCache('cashier').items[0].stock,8);
});
test('dashboard snapshots are isolated by employee, permissions, date range and day',()=>{
  const {context:c}=fixture();
  const account={employeeId:'EMP1',fullName:'Cashier One',role:'CASHIER',permissions:{'dashboard.view':'allow'},dashboardToken:'first'};
  c.currentEmployee=account;
  const range={start:'2026-11-13',end:'2026-11-13'};
  c.writeDeviceOverview(range,{sales:{net:500}});
  c.currentEmployee={...account,dashboardToken:'next'};
  assert.equal(c.readDeviceOverview(range).sales.net,500);
  assert.equal(c.readDeviceOverview({...range,start:'2026-11-12'}),null);
  c.currentEmployee={...account,employeeId:'EMP2'};assert.equal(c.readDeviceOverview(range),null);
  c.currentEmployee={...account,permissions:{'dashboard.view':'deny'}};assert.equal(c.readDeviceOverview(range),null);
  c.currentEmployee=account;c.deviceCacheDay=()=>'tomorrow';assert.equal(c.readDeviceOverview(range),null);
});
