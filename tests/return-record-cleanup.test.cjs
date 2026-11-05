const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function context(extra={}) {
  const c=vm.createContext({assertAppRequest_(){},generateInventoryMovementId:()=> 'MV-1',...extra});
  for(const file of ['Constants','InventoryMovement','SupplierReturns','GeneralDelivery','SummaryQueries'])vm.runInContext(fs.readFileSync('Backend/'+file+'.js','utf8'),c);
  return c;
}
const metadata=JSON.stringify({returnDate:'2026-11-04',preparedBy:'Cashier',driver:'Driver',batchBinding:'retry-token',physicalBundleAllocation:'PHYSICAL_BUNDLE|deliveryId=YSD-1|row=2|kind=FULL'});
function legacy() {const row=Array(16).fill('');Object.assign(row,{0:'MV-1',2:'SUPPLIER_RETURN',3:'YSR-1',4:'YSRL-1',5:'P1',8:-1,9:1,10:0,12:'Damaged',15:metadata});return row;}
test('return cleanup preserves identifiers, quantities, reason and exact retry metadata; rerun is unchanged',()=>{
  const c=context(),before=legacy(),after=c.cleanInventoryMovementRow_([...before]);
  assert.equal(after.length,18);assert.equal(after[2],'RETURN');assert.equal(after[15],'');assert.equal(after[17],metadata);
  for(const index of [0,3,4,5,8,9,10,12])assert.equal(after[index],before[index]);
  assert.deepEqual(c.cleanInventoryMovementRow_([...after]),after);
  assert.equal(c.inventoryMovementInternalNotes_(before),metadata);assert.equal(c.inventoryMovementInternalNotes_(after),metadata);
  assert.equal(c.parsePhysicalBundleAllocationNote_(c.inventoryMovementInternalNotes_(after)).deliveryId,'YSD-1');
});
test('return readers retain reporting and retry recovery across both storage formats',()=>{
  const old=legacy(),modern=context().cleanInventoryMovementRow_([...old]);
  for(const row of [old,modern]){
    const c=context({SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>2,getRange:()=>({getValues:()=>[row]})})})}});
    const found=c.findSupplierReturnMovement_('YSRL-1');assert.equal(found.id,'YSR-1');
    const report=c.getLegacySupplierReturnRecords_()[0];assert.equal(report.preparedBy,'Cashier');assert.equal(report.driver,'Driver');
    assert.equal(report.quantity,1);assert.equal(report.reason,'Damaged');
    assert.equal(JSON.parse(c.inventoryMovementInternalNotes_(found.row)).batchBinding,'retry-token');
  }
});
test('delivery cleanup clears only the exact repeated reference and keeps bundle markers and useful notes',()=>{
 const c=context();for(const [notes,wanted]of [['Delivery ID: YFD-1',''],['Delivery ID: YFD-2','Delivery ID: YFD-2'],['PHYSICAL_BUNDLE_RECEIPT','PHYSICAL_BUNDLE_RECEIPT'],['Box damaged','Box damaged']]){
  const row=legacy();row[2]='DELIVERY';row[3]='YFD-1';row[15]=notes;assert.equal(c.cleanInventoryMovementRow_(row)[15],wanted);
 }
});
test('stock movement writer emits clean RETURN with metadata outside visible notes',()=>{
 const c=context();const row=c.inventoryMovementRow_({code:'P1',type:'PINS',source:'SUPPLIER_RETURN',qtyChange:-1,stockBefore:1,stockAfter:0,reason:'Damaged',notes:metadata});
 assert.equal(row[2],'RETURN');assert.equal(row[12],'Damaged');assert.equal(row[15],'');assert.equal(row[16],'');assert.equal(row[17],metadata);
 assert.throws(()=>c.cleanInventoryMovementRow_([...row.slice(0,15),'{bad']),/JSON|property|Unexpected/);
});
test('summary and fallback inventory formulas count old and new return sources',()=>{
 const c=context({SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>null})}});assert.match(c.inventoryMovementQuery_(),/C2:C="SUPPLIER_RETURN"\)\+\('Inventory Movement Log'!C2:C="RETURN"/);
 vm.runInContext(fs.readFileSync('Backend/Inventory.js','utf8'),c);
 const writes=new Map();const sheet={getRange:(row,col)=>({setFormulas:v=>writes.set(col,v)})};
 c.setInventoryCalculatedFields_(sheet,2,1);const formula=writes.get(9)[0][0];
 assert.match(formula,/"SUPPLIER_RETURN"/);assert.match(formula,/"RETURN"/);
});
