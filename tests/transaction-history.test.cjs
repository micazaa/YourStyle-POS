const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function backend(rows, notes={}) {
  const reads=[];
  let formats=0;
  const sheet={getLastRow:()=>rows.length+1,getRange(row,col,count=1,width=1){
    return {
      getValues(){reads.push({kind:'values',row,col,count,width});return rows.slice(row-2,row-2+count).map(line=>line.slice(col-1,col-1+width));},
      getNotes(){reads.push({kind:'notes',row,col,count,width});return Array.from({length:count},(_,i)=>[notes[row+i]||'']);}
    };
  }};
  const c=vm.createContext({
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet})},
    Session:{getScriptTimeZone:()=> 'Asia/Manila'},
    Utilities:{
      parseDate(value){return new Date(value+'T00:00:00+08:00');},
      formatDate(value,_zone,pattern){formats++;const local=new Date(new Date(value).getTime()+8*3600000);if(pattern==='yyyy-MM-dd')return local.toISOString().slice(0,10);if(pattern==='h:mm a')return local.toISOString().slice(11,16);return 'Oct 30, 2026';}
    },roundToTwo:n=>Math.round(n*100)/100
  });
  vm.runInContext(fs.readFileSync('Backend/Constants.js','utf8'),c);
  vm.runInContext(fs.readFileSync('Backend/Sales.js','utf8'),c);
  return {c,reads,formats:()=>formats};
}
function line(receipt,code,time='2026-10-30T12:00:00+08:00',extra={}) {
  const row=Array(28).fill('');
  Object.entries({0:new Date(time),1:receipt,2:'Cashier A',3:code,4:'Product',7:1,12:100,13:'Cash',15:'COMPLETED',...extra}).forEach(([i,v])=>row[i]=v);
  return row;
}

test('history includes all receipt barcodes, preserving leading zeros and void totals',()=>{
  const {c}=backend([
    line('R1','001234'),line('R1','SECOND',undefined,{5:'MNE',7:2,12:200}),
    line('R1','VOID',undefined,{15:'VOIDED'}),line('R2','OTHER',undefined,{15:'VOIDED'}),
    line('R3','PARTIAL',undefined,{15:'VOIDED',7:1,12:25})
  ],{6:'PARTIALLY VOIDED'});
  const result=c.getTransactionHistory('Cashier A','2026-10-30','2026-10-30',true);
  assert.equal(result.success,true);
  const tx=result.transactions.find(tx=>tx.receiptId==='R1');
  assert.deepEqual(Array.from(tx.barcodes),['001234','SECOND','VOID']);
  assert.deepEqual(Array.from(tx.sizes),['MNE']);
  assert.equal(tx.items,3);assert.equal(tx.total,300);assert.equal(tx.status,'PARTIALLY VOIDED');
  assert.equal(result.transactions.find(tx=>tx.receiptId==='R2').total,0);
  assert.equal(result.transactions.find(tx=>tx.receiptId==='R3').total,25);
});

test('history reads one timestamp column then only required fields in date span',()=>{
  const rows=Array.from({length:10000},(_,i)=>line('OLD'+i,'OLD','2025-01-01T12:00:00+08:00'));
  for(let i=0;i<100;i++)rows.push(line('NEW'+i,'NEW'));
  const h=backend(rows);
  assert.equal(h.c.getTransactionHistory('Cashier A','2026-10-30','2026-10-30',true).transactions.length,100);
  assert.deepEqual(h.reads.map(r=>[r.kind,r.count,r.width]),[['values',10100,1],['values',100,16],['notes',100,1]]);
  const cells=h.reads.reduce((sum,r)=>sum+r.count*r.width,0);
  assert.equal(cells,11800);
  assert.ok(h.formats()<210,'date formatting must not run for all historical rows');
});

test('date span handles unsorted manual entries and store midnight boundaries',()=>{
  const h=backend([
    line('BEFORE','A','2026-10-29T23:59:59+08:00'),
    line('START','B','2026-10-30T00:00:00+08:00'),
    line('OLD','C','2025-01-01T12:00:00+08:00'),
    line('END','D','2026-10-30T23:59:59+08:00'),
    line('AFTER','E','2026-10-31T00:00:00+08:00')
  ]);
  assert.deepEqual(Array.from(h.c.getTransactionHistory('A','2026-10-30','2026-10-30',true).transactions,tx=>tx.receiptId),['END','START']);
  assert.equal(h.c.getTransactionHistory('A','2026-02-30','2026-03-01',true).success,false);
});

function frontend() {
  const elements={},calls=[];
  const c=vm.createContext({currentEmployee:{accessLevel:1},currentCashier:'A',console:{error(){}},
    document:{getElementById(id){return elements[id]||(elements[id]={value:'',style:{},innerHTML:'',appendChild(){}});},createElement(){return {}; }},
    showNotificationToast(){},google:{script:{get run(){const call={};calls.push(call);return {
      withSuccessHandler(fn){call.success=fn;return this;},withFailureHandler(fn){call.failure=fn;return this;},getTransactionHistory(){}
    };}}}
  });
  vm.runInContext(fs.readFileSync('Frontend/Scripts/AppJS.html','utf8').split('let masterInventory')[0].replace('<script>',''),c);
  vm.runInContext(fs.readFileSync('Frontend/Modals/TransactionHistoryModal.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
  c.renderTransactionHistory=rows=>{c.visible=rows;};
  c.document.getElementById('transactionHistoryFromDate').value='2026-10-30';
  c.document.getElementById('transactionHistoryToDate').value='2026-10-30';
  return {c,calls,elements};
}

test('barcode search uses cached receipt data and composes with payment filter',()=>{
  const {c,calls}=frontend();
  c.loadTransactionHistory();c.loadTransactionHistory();assert.equal(calls.length,1);
  calls[0].success({success:true,transactions:[
    {receiptId:'R1',barcodes:['001234','ABC'],sizes:['SNE'],paymentMethod:'Cash'},
    {receiptId:'R2',barcodes:['009999'],paymentMethod:'GCash'}
  ]});
  c.document.getElementById('transactionHistorySearch').value='001234';c.filterTransactionHistoryTable();
  assert.deepEqual(Array.from(c.visible,tx=>tx.receiptId),['R1']);
  c.document.getElementById('transactionHistoryPaymentFilter').value='GCash';c.filterTransactionHistoryTable();assert.equal(c.visible.length,0);
  c.document.getElementById('transactionHistoryPaymentFilter').value='';c.document.getElementById('transactionHistorySearch').value='sne';c.filterTransactionHistoryTable();assert.deepEqual(Array.from(c.visible,tx=>tx.receiptId),['R1']);
  c.loadTransactionHistory();assert.equal(calls.length,1);
  c.loadTransactionHistory(true);assert.equal(calls.length,2);
});

test('history retries failed reads and ignores stale or signed-out responses',()=>{
  const {c,calls}=frontend();
  c.loadTransactionHistory();calls[0].failure({message:'offline'});c.loadTransactionHistory();assert.equal(calls.length,2);
  c.loadTransactionHistory(true);calls[1].success({success:true,transactions:[{receiptId:'STALE'}]});
  assert.equal(c.transactionHistoryData.length,0);
  calls[2].success({success:false,message:'failed'});c.loadTransactionHistory();assert.equal(calls.length,4);
  c.currentEmployee=null;calls[3].success({success:true,transactions:[{receiptId:'PRIVATE'}]});
  assert.equal(c.transactionHistoryData.length,0);
});

test('cashier history stays within seven store dates and filters out other cashiers',()=>{
  const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  const h=backend([line('MINE','001',today+'T12:00:00+08:00'),line('OTHER','002',today+'T12:00:00+08:00',{2:'Cashier B'})]);
  assert.deepEqual(Array.from(h.c.getTransactionHistory('Cashier A',today,today,false).transactions,tx=>tx.receiptId),['MINE']);
  const before=h.reads.length;
  assert.equal(h.c.getTransactionHistory('Cashier A','2020-01-01',today,false).success,false);
  assert.equal(h.reads.length,before);
});

test('history expires cached reads and sorts across dates by timestamp',()=>{
  const {c,calls}=frontend();
  c.loadTransactionHistory();calls[0].success({success:true,transactions:[]});
  c.transactionHistoryLoadedAt=Date.now()-60001;c.loadTransactionHistory();assert.equal(calls.length,2);
  const sorted=c.getSortedTransactionHistory([
    {receiptId:'YESTERDAY',time:'11:00 PM',sortTimestamp:100},
    {receiptId:'TODAY',time:'1:00 AM',sortTimestamp:200}
  ]);
  assert.deepEqual(Array.from(sorted,tx=>tx.receiptId),['TODAY','YESTERDAY']);
  c.transactionHistorySort={key:'date',direction:'asc'};
  assert.deepEqual(Array.from(c.getSortedTransactionHistory([{receiptId:'LATER',sortTimestamp:200},{receiptId:'EARLIER',sortTimestamp:100}]),tx=>tx.receiptId),['EARLIER','LATER']);
});

test('history keeps its header visible while the loading body is locked',()=>{
  const {c,calls,elements}=frontend();
  c.loadTransactionHistory();
  assert.equal(elements.transactionHistoryLoading.style.display,'block');
  assert.equal(elements.transactionHistoryContent.style.display,'none');
  calls[0].success({success:true,transactions:[]});
  assert.equal(elements.transactionHistoryLoading.style.display,'none');
  assert.equal(elements.transactionHistoryContent.style.display,'block');
});

test('history shows Date column only for multi-day range',()=>{
  const {c,elements}=frontend();
  c.document.getElementById('transactionHistoryFromDate').value='2026-10-29';
  c.document.getElementById('transactionHistoryToDate').value='2026-10-30';
  c.updateTransactionHistoryDateColumn();
  assert.equal(elements.transactionHistoryDateHeader.style.display,'');
  assert.equal(c.getTransactionHistoryColumnCount(),8);
  c.document.getElementById('transactionHistoryToDate').value='2026-10-29';
  c.updateTransactionHistoryDateColumn();
  assert.equal(elements.transactionHistoryDateHeader.style.display,'none');
  assert.equal(c.getTransactionHistoryColumnCount(),7);
});

test('today history warmed after login is reused without a second server read',()=>{
  const {c,calls}=frontend();
  const today=c.getTransactionHistoryToday();
  c.warmTransactionHistory();
  assert.equal(calls.length,1);
  calls[0].success({success:true,transactions:[{receiptId:'READY',barcodes:[],paymentMethod:'Cash'}]});
  c.document.getElementById('transactionHistoryFromDate').value=today;
  c.document.getElementById('transactionHistoryToDate').value=today;
  c.loadTransactionHistory();
  assert.equal(calls.length,1);
  assert.equal(c.transactionHistoryData[0].receiptId,'READY');
});

test('successful sales mutations invalidate cached transaction lists',()=>{
  for(const file of ['CheckoutModal','VoidModal']){
    assert.match(fs.readFileSync('Frontend/Modals/'+file+'.html','utf8'),/pageReadCache\.delete\('transactions'\)/);
  }
  assert.match(fs.readFileSync('Frontend/Modals/CustomerExchangeModal.html','utf8'),/loadTransactionHistory\(true\)/);
});
