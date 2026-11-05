const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function search(items) {
  const nodes={manualItemSearch:{value:''},manualItemResults:{innerHTML:'',style:{}}};
  const c=vm.createContext({masterInventory:items,document:{getElementById:id=>nodes[id]},
    escapeInventoryHtml:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')});
  const source=fs.readFileSync('Frontend/Pages/CashierPage.html','utf8');
  vm.runInContext(source.slice(source.indexOf('var cashierSearchRows'),source.indexOf('function rememberCashierInventory'))+'\n'+
    source.slice(source.indexOf('function filterManualItemList'),source.indexOf('function handleManualSearchKeydown')),c);
  c.indexCashierInventory(items);
  return query=>{nodes.manualItemSearch.value=query;c.filterManualItemList();return nodes.manualItemResults.innerHTML;};
}

test('named full and split Wholesale bundles can be found by bundle, product name and code',()=>{
  const find=search([
    {code:'900001',name:'PURE TOPS (BOX) · (150) pcs',category:'WHOLESALE',price:5000},
    {code:'900002',name:'PURE TOPS (BOX) · (75) pcs',category:'WHOLE SALE',price:2500},
    {code:'600001',name:'YELLOW',category:'PINS',price:100}
  ]);
  for(const query of ['bundle','BUNDLES','whole sale','pure tops']){
    const html=find(query);
    assert.match(html,/selectManualItem\(0\)/);assert.match(html,/selectManualItem\(1\)/);
    assert.doesNotMatch(html,/selectManualItem\(2\)/);
  }
  assert.match(find('900002'),/selectManualItem\(1\)/);
  assert.doesNotMatch(find('900002'),/selectManualItem\(0\)/);
  assert.match(find('yellow'),/selectManualItem\(2\)/);
});

test('bundle and product updates invalidate cashier choices even when the inventory patch applies immediately',()=>{
  const source=fs.readFileSync('Frontend/Pages/InventoryPage.html','utf8');
  for(const immediate of [true,false]){
    let refreshed=false;
    const cache=new Map([['cashierInventory',{data:['old bundles']}],['productMaster',{data:['products'] }]]);
    const c=vm.createContext({pageReadCache:cache,applyInventoryPatch:()=>immediate,inventoryDatasetReady:()=>true,
      inventoryDataset:{stale:false},refreshInventoryChanges(){refreshed=true;},invalidateLocalInventoryReads(){throw Error('Unexpected full reload');}});
    vm.runInContext(source.slice(source.indexOf('function handleInventoryMutationResult'),source.indexOf('function checkInventoryVersionInBackground')),c);
    c.handleInventoryMutationResult({inventoryPatch:{success:true,deferred:!immediate,version:'new'}});
    assert.equal(cache.has('cashierInventory'),false);assert.equal(cache.has('productMaster'),true);
    assert.equal(refreshed,!immediate);
  }
});

test('only manager-priced active bundles reach cashier; incomplete YourFinds stay hidden',()=>{
  const c=vm.createContext({assertAppRequest_(){},inventoryRowIsSoldYourFinds_:()=>false});
  for(const name of ['Constants','Inventory'])vm.runInContext(fs.readFileSync('Backend/'+name+'.js','utf8'),c);
  const index=vm.runInContext('INV_IDX',c);
  const definitions=[
    ['900001','PURE TOPS (BOX) · (150) pcs','WHOLESALE','INCOMPLETE',0,3],
    ['900002','PURE TOPS (BOX) · (75) pcs','WHOLE SALE','ACTIVE',2500,2],
    ['900003','UNPRICED · (50) pcs','WHOLESALE','ACTIVE',0,2],
    ['900004','DISABLED · (50) pcs','WHOLESALE','INACTIVE',1500,2],
    ['900005','HIDDEN · (50) pcs','WHOLESALE','ACTIVE',1500,2],
    ['YF1','ITEM','YourFinds','INCOMPLETE',500,1]
  ];
  const rows=definitions.map(([code,name,category,status,price,stock])=>{
    const row=Array(17).fill('');
    for(const [key,value] of Object.entries({CODE:code,DESCRIPTION:name,CATEGORY:category,STATUS:status,YS_PRICE:price,STOCK:stock,
      INVENTORY_TYPE:category==='YourFinds'?'UNIQUE':'STOCK'}))row[index[key]]=value;
    return row;
  });
  const products=definitions.map(([productCode,description,category])=>({productCode,description,category,status:productCode==='900005'?'DEACTIVATED':'ACTIVE'}));
  c.getProductMaster_=()=>products;c.expireEndedProductSales_=()=>{};
  c.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>rows.length+1,getRange:()=>({getValues:()=>rows.map(row=>row.slice()),getDisplayValues:()=>rows.map(row=>row.map(String))})})})};
  let sellable=c.getSellableInventory();
  assert.deepEqual(Array.from(sellable,item=>item.code),['900002']);
  assert.match(search(sellable)('bundle'),/PURE TOPS/);
  // Saving selling details in Inventory activates the priced bundle.
  rows[0][index.YS_PRICE]=5000;rows[0][index.STATUS]='ACTIVE';
  sellable=c.getSellableInventory();
  assert.deepEqual(Array.from(sellable,item=>[item.code,item.price]),[['900001',5000],['900002',2500]]);
  const html=search(sellable)('bundle');assert.match(html,/selectManualItem\(0\)/);assert.match(html,/selectManualItem\(1\)/);
});
