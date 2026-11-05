const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture({missingItem=false, missingSplitProduct=false, halves=0}={}) {
  const calls = {products:0, inventoryReads:0, ledgerReads:0, ledgerWrites:0, flushes:0, released:false};
  const products = [
    {productCode:'900001', description:'TOPS · (150) pcs', category:'WHOLESALE', inventoryType:'STOCK', defaultPrice:5000, active:true},
    {productCode:'900002', description:'TOPS · (75) pcs', category:'WHOLESALE', inventoryType:'STOCK', defaultPrice:0, active:true},
    {productCode:'600001', description:'YELLOW', category:'PINS', inventoryType:'STOCK', defaultPrice:100, imageUrl:'yellow.png', active:true},
    {productCode:'600002', description:'BLACK', category:'PINS', inventoryType:'STOCK', defaultPrice:150, active:true},
    {productCode:'600003', description:'BLUE', category:'PINS', inventoryType:'STOCK', defaultPrice:150, active:true}
  ].filter(p=>!missingSplitProduct || p.productCode!=='900002');
  let id=0, failCode='', failMetadata=false;
  const context = vm.createContext({console, assertAppRequest_(){},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){calls.released=true;}})},
    Session:{getScriptTimeZone:()=> 'Asia/Manila'},
    Utilities:{getUuid:()=>String(++id),formatDate:()=> '2026-11-05'},
    generateInventoryMovementId:()=> 'MOV-'+(++id),recordInventoryChangedCodes_(){},isSupplierReturnSource_:source=>['RETURN','SUPPLIER_RETURN'].includes(source),
    inventoryMovementInternalNotes_:row=>row[17]||row[15],
    normalizeInventoryCategoryValue_:value=>value==='PINS'?'PINS':value==='OTHERS'?'Others':value,
    setInventoryCalculatedFields_(){},allowWholesaleCategoryAtRow_(){},setInventoryStatusValidation_(){}});
  for (const file of ['Constants','GeneralDelivery','InventoryMovement','Inventory']) {
    vm.runInContext(fs.readFileSync('Backend/'+file+'.js','utf8'),context);
  }
  // Formula layout and validation have their own tests. Model their resulting stock here.
  context.setInventoryCalculatedFields_=()=>{};
  context.setInventoryStatusValidation_=()=>{};
  const constants = vm.runInContext('({DELIVERY_IDX,INV_IDX,MOVE_IDX,DELIVERY_LOG_COLUMN_COUNT})',context);
  const {DELIVERY_IDX:D, INV_IDX:I, MOVE_IDX:M}=constants;
  const deliveryId='YSD-20261105-096';
  const sheets={};
  function sheet(name,rows) {
    const result={rows,getLastRow:()=>rows.length,getMaxRows:()=>10000,getMaxColumns:()=>20,
      insertRowsAfter(){},insertColumnsAfter(){},getName:()=>name,
      deleteRow(row){rows.splice(row-1,1);},deleteRows(row,count){rows.splice(row-1,count);},
      getRangeList:()=>({setValue(){}}),
      appendRow(row){if(String(row[M.CODE])===failCode)throw Error('Movement write failed');calls.ledgerWrites++;rows.push(Array.from(row));},
      getRange(row,col,height=1,width=1){
        const values=()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>rows[row-1+i]?.[col-1+j]??''));
        const read=()=>{
          if(row>=2 && name==='Inventory')calls.inventoryReads++;
          if(row>=2 && name==='Inventory Movement Log')calls.ledgerReads++;
          return values();
        };
        return {getValues:read,getDisplayValues:()=>read().map(r=>r.map(String)),getValue:()=>read()[0][0],
          getDisplayValue:()=>String(values()[0][0]),
          setValues(data){
            if(name==='Inventory' && col===19 && failMetadata)throw Error('Delivery metadata write failed');
            if(name==='Inventory Movement Log'){
              if(data.some(r=>String(r[M.CODE])===failCode))throw Error('Movement write failed');
              calls.ledgerWrites++;
            }
            data.forEach((r,i)=>{rows[row-1+i]||=[];r.forEach((v,j)=>{rows[row-1+i][col-1+j]=v;});});
          },
          setValue(value){rows[row-1]||=[];rows[row-1][col-1]=value;},setNumberFormat(){},setFormulas(){},
          createTextFinder(code){return {matchEntireCell(){return this;},findNext(){const at=values().findIndex(r=>String(r[0])===code);return at<0?null:{getRow:()=>row+at};}};}};
      }};
    sheets[name]=result;return result;
  }
  const inventory=sheet('Inventory',[Array(20).fill('')]);
  inventory.rows[0][18]='Delivery ID';inventory.rows[0][19]='Date Delivered';
  products.filter(p=>!missingItem||p.productCode!=='600003').forEach(p=>{
    const row=Array(20).fill('');
    row[I.CODE]=p.productCode;row[I.DESCRIPTION]=p.description;row[I.CATEGORY]=p.category;
    row[I.INVENTORY_TYPE]='STOCK';row[I.STATUS]='ACTIVE';row[I.STOCK]=0;row[I.IMAGE]=p.imageUrl||'';
    inventory.rows.push(row);
  });
  const deliveries=sheet('Delivery Log',[Array(constants.DELIVERY_LOG_COLUMN_COUNT).fill(''),Array(constants.DELIVERY_LOG_COLUMN_COUNT).fill('')]);
  Object.entries({DELIVERY_ID:deliveryId, DELIVERY_DATE:'2026-11-05',DELIVERY_TYPE:'YOURSTYLE',RECEIVE_MODE:'BULK',TYPE:'PINS',
    STATUS:'PENDING',BUNDLE_QTY:3,ESTIMATED_QTY:450,ACTUAL_QTY:0,DESCRIPTION:'TOPS'}).forEach(([key,value])=>{deliveries.rows[1][D[key]]=value;});
  const movements=sheet('Inventory Movement Log',[Array(18).fill('')]);
  function movement(values){const row=Array(18).fill('');Object.entries(values).forEach(([key,value])=>{row[M[key]]=value;});movements.rows.push(row);}
  movement({CODE:'900001',QTY_CHANGE:3,SOURCE:'DELIVERY',REFERENCE_ID:deliveryId,SOURCE_LINE_ID:deliveryId+'-B01',NOTES:'PHYSICAL_BUNDLE_RECEIPT',TYPE:'OTHERS'});
  for(let i=0;i<halves;i++)movement({CODE:'900001',QTY_CHANGE:-0.5,SOURCE:'SALE',REFERENCE_ID:'SALE-'+i,BUNDLE_NO:1,
    NOTES:context.physicalBundleAllocationNote_(deliveryId,'HALF',2),TYPE:'OTHERS'});
  // Unrelated historical receipts and returns must not affect this holder.
  movement({CODE:'OTHER',QTY_CHANGE:10,SOURCE:'DISTRIBUTION',REFERENCE_ID:'OLD',BUNDLE_NO:1,TYPE:'PINS'});
  sheet('Product Master',[Array(18).fill(''),...products.map(p=>[p.productCode,p.description])]);
  function recalculate(){inventory.rows.slice(1).forEach(row=>{
    row[I.STOCK]=movements.rows.slice(1).reduce((sum,m)=>sum+(String(m[M.CODE])===String(row[I.CODE])?Number(m[M.QTY_CHANGE])||0:0),0);
  });}
  context.getProductMaster_=()=>{calls.products++;return products.map(p=>({...p}));};
  context.getProductMasterSheet_=()=>sheets['Product Master'];
  context.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:name=>sheets[name]}),flush(){calls.flushes++;recalculate();}};
  recalculate();
  const payload={deliveryId,sheetRow:2,bundleNo:1,employee:'Cashier',parts:2,remarks:'Counted',
    lines:[{productCode:'600001',quantity:10},{productCode:'600002',quantity:20},{productCode:'600003',quantity:130}]};
  return {context,calls,products,inventory,deliveries,movements,payload,I,M,D,failMovement:code=>{failCode=code;},
    failMetadata(){failMetadata=true;}};
}

test('distribution batches stock changes and reads products and bundle history once',()=>{
  const f=fixture(), result=f.context.distributeBulkBundle(f.payload);
  assert.equal(result.success,true,result.message);
  assert.equal(result.distributionActual,160);assert.equal(result.actualQuantity,160);assert.equal(result.remainingQuantity,290);
  assert.equal(result.bundles[0].actualQuantity,160);assert.equal(result.bundles[0].disabled,true);
  assert.equal(result.bundles[1].disabled,false);
  assert.equal(f.calls.products,1);assert.equal(f.calls.ledgerReads,1);
  assert.equal(f.calls.ledgerWrites,1);assert.equal(f.calls.flushes,1);assert.equal(f.calls.inventoryReads,3,JSON.stringify(f.calls));
  assert.deepEqual(f.movements.rows.slice(-3).map(row=>[row[f.M.CODE],row[f.M.QTY_CHANGE]]),[
    ['600001',10],['600002',20],['600003',130]]);
  assert.equal(f.calls.released,true);
});

test('split reuses its authoritative snapshots and returns locked source and usable children',()=>{
  const f=fixture(),result=f.context.splitPhysicalBundle(f.payload);
  assert.equal(result.success,true,result.message);
  assert.equal(result.holder.bundles[0].split,true);assert.equal(result.holder.bundles[0].disabled,true);
  assert.deepEqual(Array.from(result.holder.bundles.slice(-2),b=>[b.bundleNo,b.label,b.estimatedQuantity,b.parentBundleNo]),[
    [4,'096-A-1',75,1],[5,'096-A-2',75,1]]);
  assert.equal(f.calls.products,1);assert.equal(f.calls.ledgerReads,1);assert.equal(f.calls.ledgerWrites,1);
  assert.equal(f.calls.flushes,1);assert.equal(f.calls.inventoryReads,3,JSON.stringify(f.calls));
  assert.equal(f.inventory.rows.find(row=>row[f.I.CODE]==='900001')[f.I.STOCK],2);
  assert.equal(f.inventory.rows.find(row=>row[f.I.CODE]==='900002')[f.I.STOCK],2);
});

test('new distributed inventory starts at zero and receives actual counts without an estimate cap',()=>{
  const f=fixture({missingItem:true,halves:1}),result=f.context.distributeBulkBundle(f.payload);
  assert.equal(result.success,true,result.message);
  const row=f.inventory.rows.find(row=>row[f.I.CODE]==='600003');
  assert.equal(row[f.I.STOCK],130);assert.equal(row[18],f.payload.deliveryId);
  const move=f.movements.rows.find(row=>row[f.M.CODE]==='600003');
  assert.equal(move[f.M.STOCK_BEFORE],0);assert.equal(move[f.M.STOCK_AFTER],130);
  assert.equal(result.bundles[0].soldHalves,1);assert.equal(result.bundles[0].actualQuantity,160);
  assert.equal(f.calls.products,1);assert.equal(f.calls.flushes,1);
});

test('failed distribution keeps holder counts and stock and removes newly created rows',()=>{
  const f=fixture({missingItem:true}),before=JSON.stringify(f.movements.rows),inventoryCount=f.inventory.rows.length;
  f.failMovement('600003');
  const result=f.context.distributeBulkBundle(f.payload);
  assert.equal(result.success,false);assert.match(result.message,/Movement write failed/);
  assert.equal(JSON.stringify(f.movements.rows),before);assert.equal(f.inventory.rows.length,inventoryCount);
  assert.equal(f.deliveries.rows[1][f.D.ACTUAL_QTY],0);assert.equal(f.calls.released,true);
});

test('restoring a missing Inventory row keeps earlier movements in Stock Before',()=>{
  const f=fixture({missingItem:true}),prior=Array(18).fill('');
  prior[f.M.CODE]='600003';prior[f.M.SOURCE]='SALE';prior[f.M.QTY_CHANGE]=-2;
  f.movements.rows.push(prior);
  const result=f.context.distributeBulkBundle(f.payload);
  assert.equal(result.success,true,result.message);
  const move=f.movements.rows.at(-1);
  assert.equal(move[f.M.STOCK_BEFORE],-2);assert.equal(move[f.M.STOCK_AFTER],128);
  assert.equal(f.inventory.rows.find(row=>row[f.I.CODE]==='600003')[f.I.STOCK],128);
});

test('split creates missing Wholesale definition once and its stock remains incomplete for pricing',()=>{
  const f=fixture({missingSplitProduct:true}),result=f.context.splitPhysicalBundle(f.payload);
  assert.equal(result.success,true,result.message);assert.equal(result.createdBundleProducts,1);
  const row=f.inventory.rows.find(row=>row[f.I.CODE]===result.productCode);
  assert.equal(row[f.I.STOCK],2);assert.equal(row[f.I.STATUS],'INCOMPLETE');
  assert.equal(row[18],f.payload.deliveryId);assert.equal(f.calls.products,1);
  assert.equal(result.holder.bundles.length,5);
});

test('a saved child uses its own bundle number and cannot be saved twice',()=>{
  const f=fixture();const split=f.context.splitPhysicalBundle(f.payload);
  assert.equal(split.success,true,split.message);
  f.payload.bundleNo=split.holder.bundles[3].bundleNo;
  const saved=f.context.distributeBulkBundle(f.payload);
  assert.equal(saved.success,true,saved.message);assert.equal(saved.bundleActual,160);
  assert.equal(saved.bundles[0].split,true);assert.equal(saved.bundles[3].disabled,true);
  assert.equal(saved.bundles[4].disabled,false);
  assert.equal(f.context.distributeBulkBundle(f.payload).success,false);
});

test('failure after the movement batch restores holder totals, bundle availability and stock',()=>{
  for(const operation of ['distributeBulkBundle','splitPhysicalBundle']){
    const f=fixture(),before=JSON.stringify(f.movements.rows);
    f.failMetadata();
    const result=f.context[operation](f.payload);
    assert.equal(result.success,false);assert.match(result.message,/Delivery metadata write failed/);
    assert.equal(JSON.stringify(f.movements.rows),before);
    assert.equal(f.deliveries.rows[1][f.D.ACTUAL_QTY],0);
    assert.equal(f.inventory.rows.find(row=>row[f.I.CODE]==='900001')[f.I.STOCK],3);
    assert.equal(f.context.getBulkHolderDetails(f.payload.deliveryId,2).holder.bundles[0].disabled,false);
    assert.equal(f.calls.released,true);
  }
});

test('ordinary stock batches still read fresh inventory once and chain repeated code changes correctly',()=>{
  const f=fixture();
  const result=f.context.changeInventoryStockBatch_([
    {code:'900001',qtyChange:-1,source:'ADJUSTMENT',notes:'First'},
    {code:'900001',qtyChange:-1,source:'ADJUSTMENT',notes:'Second'}
  ]);
  assert.deepEqual(Array.from(result,row=>[row.stockBefore,row.stockAfter]),[[3,2],[2,1]]);
  assert.equal(f.calls.inventoryReads,1);assert.equal(f.calls.ledgerWrites,1);assert.equal(f.calls.flushes,1);
  assert.equal(f.movements.rows.at(-1)[f.M.NOTES],'Second');
});

test('delivery snapshots preserve formatted product codes with leading zeroes',()=>{
  const f=fixture();
  f.products[2].productCode='00600001';f.inventory.rows[3][f.I.CODE]=600001;
  f.payload.lines[0].productCode='00600001';
  const getRange=f.inventory.getRange;
  f.inventory.getRange=function(row,col,height,width){
    const range=getRange(row,col,height,width),display=range.getDisplayValues;
    range.getDisplayValues=function(){const rows=display();if(row===2&&col===1&&width===1)rows[2][0]='00600001';return rows;};
    return range;
  };
  const result=f.context.distributeBulkBundle(f.payload);
  assert.equal(result.success,true,result.message);
  assert.equal(f.inventory.rows.length,6,'formatted existing code must not create a duplicate row');
  assert.ok(f.movements.rows.some(row=>row[f.M.CODE]==='00600001'&&row[f.M.QTY_CHANGE]===10));
});

test('reserved products and stale bundles reject distribution before appending stock movements',()=>{
  const f=fixture();f.inventory.rows.find(row=>row[f.I.CODE]==='600002')[f.I.STATUS]='RESERVED';
  const before=f.movements.rows.length;
  assert.match(f.context.distributeBulkBundle(f.payload).message,/Reserved stock/);
  assert.equal(f.movements.rows.length,before);
  const fresh=fixture();assert.equal(fresh.context.distributeBulkBundle(fresh.payload).success,true);
  const savedCount=fresh.movements.rows.length;
  assert.equal(fresh.context.distributeBulkBundle(fresh.payload).success,false);
  assert.equal(fresh.movements.rows.length,savedCount);
});
