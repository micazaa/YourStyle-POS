const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function history(rows) {
  const c=vm.createContext({assertAppRequest_(){},SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({
    getLastRow:()=>rows.length+1,getRange:()=>({getDisplayValues:()=>rows})
  })})}});
  for(const name of ['Constants','InventoryMovement'])vm.runInContext(fs.readFileSync('Backend/'+name+'.js','utf8'),c);
  return c.getInventoryMovementHistoryByCode('1015261134').movements;
}
function movement(source,reason,notes,reference='YFR-20261104-731') {
  const row=Array(16).fill('');
  Object.assign(row,{0:'MV-1',1:'11/4/2026 21:50:40',2:source,3:reference,4:'LINE-1',5:'1015261134',
    6:'TOY STORY WOODY WATER BOTTLE',7:'YOURFINDS',8:'-1',9:'1',10:'0',11:'Samantha Lindaya',12:reason,15:notes});
  return row;
}

test('return history shows RETURN and the entered reason without internal return metadata',()=>{
  const row=movement('SUPPLIER_RETURN','Damaged',JSON.stringify({returnDate:'2026-11-04',preparedBy:'Cashier',batchBinding:'retry-token'}));
  const original=JSON.stringify(row),item=history([row])[0];
  assert.equal(item.source,'RETURN');assert.equal(item.reason,'Damaged');assert.equal(item.notes,'');
  assert.equal(item.referenceId,'YFR-20261104-731');assert.equal(item.qtyChange,-1);assert.equal(item.stockAfter,0);
  assert.equal(JSON.stringify(row),original,'history formatting must preserve metadata used for return retries and reports');
});

test('delivery history omits repeated delivery IDs and preserves actual notes',()=>{
  const id='YFD-20261015-877';
  const rows=[movement('DELIVERY','','Delivery ID: '+id,id),movement('DELIVERY','','Box was wet',id),
    movement('ADJUSTMENT','PHYSICAL COUNT CORRECTION','Counted twice','ADJ-1')];
  const result=history(rows);
  assert.equal(result[2].notes,'');assert.equal(result[2].referenceId,id);
  assert.equal(result[1].notes,'Box was wet');assert.equal(result[0].reason,'PHYSICAL COUNT CORRECTION');
  assert.equal(result[0].notes,'Counted twice');
});

test('history notes render without a leading separator and escape user text',()=>{
  const source=fs.readFileSync('Frontend/Modals/InventoryManagementModal.html','utf8');
  const start=source.indexOf('function openMovementHistory('),end=source.indexOf('\nfunction ',start+1);
  const nodes={},c=vm.createContext({phase8SelectedItem:{code:'1015261134',name:'Bottle'},
    beginPageRead:()=>({shouldFetch:true,current:()=>true,save(){}}),
    document:{getElementById:id=>nodes[id]||=({innerHTML:'',style:{}})},
    escapeInventoryHtml:value=>String(value||'').replaceAll('<','&lt;').replaceAll('>','&gt;'),
    secureScriptRun:{withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(){return this;},
      getInventoryMovementHistoryByCode(){this.success({movements:[{source:'DELIVERY',notes:'<Box wet>',qtyChange:1,stockAfter:1}]});}}});
  vm.runInContext(source.slice(start,end<0?source.indexOf('</script>',start):end),c);c.openMovementHistory();
  const html=nodes.movementHistoryBody.innerHTML;
  assert.match(html,/<td>&lt;Box wet&gt;<\/td>/);assert.doesNotMatch(html,/<td> ·/);
});
