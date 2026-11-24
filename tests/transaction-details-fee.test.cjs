const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function frontend(){
  const nodes={},calls=[];
  function element(){return {style:{setProperty(key,value){this[key]=value;}},textContent:'',innerHTML:'',hidden:false,children:[],
    appendChild(child){this.children.push(child);},setAttribute(){},addEventListener(){},
    get lastElementChild(){return this.last ||= element();}};}
  const c=vm.createContext({currentEmployee:{},cashierTransactionActionsEnabled:()=>true,
    escapeTransactionHtml:value=>String(value??''),buildTransactionStatusBadge:value=>value,showNotificationToast(){},
    document:{getElementById:id=>nodes[id] ||= element(),createElement:element},
    secureScriptRun:{withSuccessHandler(handler){this.success=handler;return this;},withFailureHandler(){return this;},getTransactionDetails(id){calls.push(id);}}
  });
  vm.runInContext(fs.readFileSync('Frontend/Modals/TransactionDetailsModal.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
  return {c,nodes,calls};
}
const transaction=items=>({receiptId:'YS-FEE',paymentMethod:'QR Code',referenceNumber:'9:41 AM - EDFE',status:'COMPLETED',total:118.8,items});

test('details show recorded absorbed fees once per row and preserve the saved transaction total',()=>{
  const {c,nodes}=frontend();
  c.renderTransactionDetails(transaction([{name:'Yellow',quantity:4,price:120,feeAbsorbed:2.37,feeCharged:99,netTotal:118.8,status:'COMPLETED'}]));
  assert.equal(nodes.transactionDetailsAbsorbedFeeRow.style.display,'flex');
  assert.equal(nodes.transactionDetailsAbsorbedFee.textContent,'₱2.37');
  assert.equal(nodes.transactionDetailsTotal.textContent,'₱118.80');
  assert.equal(nodes.transactionDetailsReference.textContent,'9:41 AM - EDFE');
});

test('details sum item fees while excluding voided rows and including adjusted and reservation rows',()=>{
  const {c,nodes}=frontend();
  c.renderTransactionDetails(transaction([
    {quantity:3,feeAbsorbed:1.2,status:'COMPLETED'},
    {quantity:1,feeAbsorbed:99,status:' voided '},
    {quantity:1,feeAbsorbed:.5,status:'PARTIALLY VOIDED'},
    {quantity:0,feeAbsorbed:.25,status:'COMPLETED',reason:'RESERVATION DEPOSIT'},
    {quantity:1,status:'COMPLETED'}
  ]));
  assert.equal(nodes.transactionDetailsAbsorbedFee.textContent,'₱1.95');
});

test('fee-free and fully voided details hide the fee after a previous charged transaction',()=>{
  const {c,nodes}=frontend();
  c.renderTransactionDetails(transaction([{quantity:1,feeAbsorbed:1.2}]));
  assert.equal(nodes.transactionDetailsAbsorbedFeeRow.style.display,'flex');
  c.renderTransactionDetails(transaction([{quantity:1,feeAbsorbed:0,feeCharged:1.2}]));
  assert.equal(nodes.transactionDetailsAbsorbedFeeRow.style.display,'none');
  assert.equal(nodes.transactionDetailsAbsorbedFee.textContent,'₱0.00');
  c.renderTransactionDetails({...transaction([{quantity:1,feeAbsorbed:1.2,status:'VOIDED'}]),status:'VOIDED',total:0});
  assert.equal(nodes.transactionDetailsAbsorbedFeeRow.style.display,'none');
  assert.equal(nodes.transactionDetailsTotal.textContent,'₱0.00');
});

test('opening another receipt clears the fee while retaining the existing single details request',()=>{
  const {c,nodes,calls}=frontend();
  c.renderTransactionDetails(transaction([{quantity:1,feeAbsorbed:1.2}]));
  c.openTransactionDetails('NEXT');
  assert.equal(nodes.transactionDetailsAbsorbedFeeRow.style.display,'none');
  assert.equal(nodes.transactionDetailsAbsorbedFee.textContent,'₱0.00');
  assert.deepEqual(calls,['NEXT']);
});
