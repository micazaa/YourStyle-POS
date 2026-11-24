const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function payments() {
  const source = fs.readFileSync('Backend/Sales.js', 'utf8');
  const start = source.indexOf('function saleDisplayName_');
  const end = source.indexOf('function executeCheckoutBackend');
  const context = vm.createContext({ roundToTwo: value => Math.round(Number(value || 0) * 100) / 100 });
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test('split payment requires two parts, exact allocation and non-cash references', () => {
  const context = payments();
  const parts = context.normalizeCheckoutPaymentParts_('Cash + GCash', [
    { method: 'Cash', amount: 200 },
    { method: 'GCash', amount: 258, reference: 'GC-123' }
  ], 458);
  assert.deepEqual(JSON.parse(JSON.stringify(parts)), [
    { method: 'Cash', amount: 200, reference: '' },
    { method: 'GCash', amount: 258, reference: 'GC-123' }
  ]);
  assert.throws(() => context.normalizeCheckoutPaymentParts_('Cash + GCash', [
    { method: 'Cash', amount: 200 }, { method: 'GCash', amount: 200, reference: 'GC-123' }
  ], 458), /must equal sale total/);
  assert.throws(() => context.normalizeCheckoutPaymentParts_('Cash + GCash', [
    { method: 'Cash', amount: 200 }, { method: 'GCash', amount: 258 }
  ], 458), /Reference number/);
});

function checkout() {
  const elements = {};
  const context = vm.createContext({calculatedBaseTotalDue:458,finalActiveGrandTotal:458,
    document:{querySelectorAll:()=>[],getElementById(id){return elements[id] ||= {value:'',checked:false,hidden:false,style:{},dataset:{},textContent:''};}}
  });
  vm.runInContext(fs.readFileSync('Frontend/Modals/CheckoutModal.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],context);
  const field=(id,value)=>context.document.getElementById(id).value=value;
  field('globalDiscountType','percentage');
  return {context,elements,field};
}

test('every distinct split pair preserves sale allocation, references and independently charged fees',()=>{
  const methods=['Cash','GCash','QR Code','Credit Card'];
  for(const first of methods)for(const second of methods.filter(method=>method!==first)) {
    const {context:c,elements,field}=checkout();
    c.document.getElementById('checkoutSplitToggle').checked=true;
    field('splitPaymentOneMethod',first);field('splitPaymentTwoMethod',second);
    for(const suffix of ['One','Two']) {
      field('splitPayment'+suffix+'ReferenceTime','14:30');field('splitPayment'+suffix+'ReferenceCode','a1b2');
      c.document.getElementById('splitPayment'+suffix+'Fee').checked=true;
    }
    const received=(method,amount,cash)=>method==='Cash'?cash:amount+Math.round(amount*(method==='QR Code'?.01:method==='Credit Card'?.032:0)*100)/100;
    field('checkoutOneCash',String(received(first,200,250)));field('checkoutTwoCash',String(received(second,258,300)));c.recalculateModalTotals();
    const payload=c.buildCheckoutPayload();
    assert(c.validateCheckout(payload));
    assert.equal(payload.paymentMethod,first+' + '+second);
    assert.deepEqual(Array.from(payload.paymentParts,part=>part.amount),[200,258]);
    const fees=[first,second].reduce((sum,method,i)=>sum+Math.round([200,258][i]*(method==='QR Code'?.01:method==='Credit Card'?.032:0)*100)/100,0);
    assert.equal(payload.totalDue,Math.round((458+fees)*100)/100);
    assert.equal(payload.changeGiven,first==='Cash'?50:second==='Cash'?42:0);
    assert.equal(elements.checkoutRemainingAmount.hidden,true);
    assert(payload.paymentParts.every(part=>part.method==='Cash'||part.reference==='2:30 PM - A1B2'));
    const server=payments();assert.doesNotThrow(()=>server.normalizeCheckoutPaymentParts_(payload.paymentMethod,payload.paymentParts,458));
    const actual=server.checkoutPaymentFees_(payload.paymentParts,payload.applyCardFee,payload.applyQrFee);
    assert.equal(actual.charged,fees);assert.equal(actual.absorbed,0);
  }
});

test('off switches cover fees in the shop and legacy QR callers still charge the customer',()=>{
  const c=payments(),parts=[{method:'QR Code',amount:200},{method:'Credit Card',amount:258}];
  assert.deepEqual({...c.checkoutPaymentFees_(parts,false,false)},{charged:0,absorbed:10.26});
  assert.deepEqual({...c.checkoutPaymentFees_(parts,true,false)},{charged:8.26,absorbed:2});
  assert.deepEqual({...c.checkoutPaymentFees_(parts,false,true)},{charged:2,absorbed:8.26});
  assert.deepEqual({...c.checkoutPaymentFees_([{method:'QR Code',amount:200}],false)},{charged:2,absorbed:0});
  const legacy=c.normalizeCheckoutPaymentParts_('Cash + Credit Card',[{method:'Cash',amount:200},{method:'Credit Card',amount:258,receivedAmount:266.53,reference:'OLD'}],458);
  assert.deepEqual({...c.checkoutPaymentFees_(legacy,true)},{charged:8.53,absorbed:0});
  assert.throws(()=>c.checkoutPaymentFees_(legacy,false),/Card fee changed/);
});

test('reference fields require a real time and exactly four alphanumerics',()=>{
  const {context:c,field}=checkout();c.selectCheckoutMethod('GCash');
  field('paymentReferenceInputTime','23:00');field('paymentReferenceInputCode','AB1');
  assert.equal(c.validateCheckout(c.buildCheckoutPayload()),false);
  field('paymentReferenceInputCode','ab12');assert(c.validateCheckout(c.buildCheckoutPayload()));
  assert.equal(c.buildCheckoutPayload().referenceNumber,'11:00 PM - AB12');
  field('paymentReferenceInputTime','24:00');assert.equal(c.validateCheckout(c.buildCheckoutPayload()),false);
});

test('cash change is nonnegative and unpaid cash appears only until covered',()=>{
  const {context:c,elements,field}=checkout();field('customerCashPaid','400');c.recalculateModalTotals();
  assert.equal(elements.customerChangeDue.textContent,'0.00');assert.equal(elements.checkoutRemainingAmount.textContent,'Still needed ₱58.00');
  assert.equal(c.validateCheckout(c.buildCheckoutPayload()),false);
  field('customerCashPaid','500');c.recalculateModalTotals();assert.equal(elements.customerChangeDue.textContent,'42.00');
  assert.equal(elements.checkoutRemainingAmount.hidden,true);assert(c.validateCheckout(c.buildCheckoutPayload()));
});

test('split payments start blank, retain independently entered amounts and accept 100 cash plus 20 GCash',()=>{
  const {context:c,elements,field}=checkout();c.calculatedBaseTotalDue=120;
  c.document.getElementById('checkoutSplitToggle').checked=true;
  field('splitPaymentOneMethod','Cash');field('splitPaymentTwoMethod','GCash');c.toggleCheckoutSplit();
  assert.equal(elements.checkoutOneCash.value,'');assert.equal(elements.checkoutTwoCash.value,'');
  field('checkoutOneCash','100');c.recalculateModalTotals();assert.equal(elements.checkoutTwoCash.value,'');
  assert.equal(elements.checkoutRemainingAmount.textContent,'Still needed ₱20.00');
  field('checkoutTwoCash','20');field('splitPaymentTwoReferenceTime','14:30');field('splitPaymentTwoReferenceCode','GC12');c.recalculateModalTotals();
  let payload=c.buildCheckoutPayload();assert(c.validateCheckout(payload));
  assert.deepEqual(Array.from(payload.paymentParts,part=>[part.method,part.amount]),[['Cash',100],['GCash',20]]);
  assert.equal(payload.cashReceived,100);assert.equal(payload.changeGiven,0);assert.equal(payload.totalDue,120);
  assert.equal(elements.checkoutRemainingAmount.hidden,true);
  field('checkoutOneCash','90');c.recalculateModalTotals();assert.equal(elements.checkoutRemainingAmount.textContent,'Still needed ₱10.00');assert.equal(c.validateCheckout(c.buildCheckoutPayload()),false);
  field('checkoutOneCash','200');c.recalculateModalTotals();payload=c.buildCheckoutPayload();assert(c.validateCheckout(payload));assert.equal(payload.changeGiven,100);assert.equal(payload.paymentParts[0].amount,100);assert.equal(elements.checkoutSplitChange.textContent,'100.00');
  assert.equal(elements.checkoutTwoCash.value,'20');
});

test('received amounts include toggled fees, keeping unequal sale portions and actual collections separate',()=>{
  const {context:c,elements,field}=checkout();c.calculatedBaseTotalDue=120;c.document.getElementById('checkoutSplitToggle').checked=true;
  field('splitPaymentOneMethod','Cash');field('splitPaymentTwoMethod','Credit Card');field('checkoutOneCash','100');field('checkoutTwoCash','20');
  field('splitPaymentTwoReferenceTime','14:30');field('splitPaymentTwoReferenceCode','CC12');
  c.document.getElementById('splitPaymentTwoFee').checked=true;c.toggleCheckoutPaymentFee(2);
  assert.equal(elements.checkoutTwoCash.value,'20.64');assert.equal(elements.checkoutOneCash.value,'100');
  const payload=c.buildCheckoutPayload();assert(c.validateCheckout(payload));assert.equal(payload.totalDue,120.64);
  assert.deepEqual(Array.from(payload.paymentParts,part=>part.amount),[100,20]);assert.equal(payload.paymentCollections[1].amount,20.64);
  c.document.getElementById('splitPaymentTwoFee').checked=false;c.toggleCheckoutPaymentFee(2);assert.equal(elements.checkoutTwoCash.value,'20.00');assert.equal(c.buildCheckoutPayload().totalDue,120);
});

test('digital overpayments, zero split portions, invalid received values and cent mismatches cannot submit',()=>{
  const {context:c,field}=checkout();c.calculatedBaseTotalDue=120;c.document.getElementById('checkoutSplitToggle').checked=true;
  field('splitPaymentOneMethod','GCash');field('splitPaymentTwoMethod','Credit Card');
  for(const suffix of ['One','Two']){field('splitPayment'+suffix+'ReferenceTime','14:30');field('splitPayment'+suffix+'ReferenceCode','AB12');}
  for(const amounts of [[100,21],[120,0],[100,-1],[100,'bad']]){
    field('checkoutOneCash',String(amounts[0]));field('checkoutTwoCash',String(amounts[1]));c.recalculateModalTotals();assert.equal(c.validateCheckout(c.buildCheckoutPayload()),false);
  }
  field('splitPaymentOneMethod','Cash');field('checkoutOneCash','119.53');field('checkoutTwoCash','.48');c.document.getElementById('splitPaymentTwoFee').checked=true;c.recalculateModalTotals();
  assert.equal(c.validateCheckout(c.buildCheckoutPayload()),false);
});
