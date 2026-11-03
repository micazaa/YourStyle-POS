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

test('checkout exposes supported split options and records both payment parts', () => {
  const checkout = fs.readFileSync('Frontend/Modals/CheckoutModal.html', 'utf8');
  const constants = fs.readFileSync('Backend/Constants.js', 'utf8');
  assert.match(checkout, /Cash \+ GCash/);
  assert.match(checkout, /Cash \+ Credit Card/);
  assert.match(checkout, /GCash \+ Credit Card/);
  assert.match(checkout, /paymentParts/);
  assert.match(checkout, /if \(splitMethods\) referenceNumber = ""/);
  assert.match(constants, /PAYMENT_1_METHOD: 28/);
  assert.match(constants, /PAYMENT_2_REFERENCE: 33/);
});

function checkout() {
  const elements = {};
  const context = vm.createContext({
    calculatedBaseTotalDue: 458,
    finalActiveGrandTotal: 458,
    document: {
      getElementById(id) {
        return elements[id] || (elements[id] = { value: '', checked: false, style: {}, textContent: '' });
      }
    }
  });
  vm.runInContext(fs.readFileSync('Frontend/Modals/CheckoutModal.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1], context);
  return { context, elements };
}

test('GCash and card show entered excess against the displayed total due', () => {
  const { context: c, elements } = checkout();
  c.document.getElementById('paymentMethod').value = 'GCash + Credit Card';
  c.document.getElementById('splitPaymentOneAmount').value = '200';
  c.document.getElementById('splitPaymentTwoAmount').value = '458';
  c.document.getElementById('applyCardFeeCheckbox').checked = true;
  c.recalculateModalTotals();
  assert.equal(elements.modalGrandTotal.textContent, '472.66');
  assert.equal(elements.customerChangeDue.textContent, '185.34');

  elements.splitPaymentTwoAmount.value = '400';
  c.recalculateModalTotals();
  assert.equal(elements.modalGrandTotal.textContent, '470.80');
  assert.equal(elements.customerChangeDue.textContent, '129.20');

  elements.applyCardFeeCheckbox.checked = false;
  c.recalculateModalTotals();
  assert.equal(elements.modalGrandTotal.textContent, '458.00');
  assert.equal(elements.customerChangeDue.textContent, '142.00');
});

test('all split methods show excess and never display negative change for underpayment', () => {
  for (const method of ['Cash + GCash', 'Cash + Credit Card', 'GCash + Credit Card']) {
    const { context: c, elements } = checkout();
    c.document.getElementById('paymentMethod').value = method;
    c.document.getElementById('splitPaymentOneAmount').value = '200';
    c.document.getElementById('splitPaymentTwoAmount').value = '300';
    c.recalculateModalTotals();
    assert.equal(elements.customerChangeDue.textContent, '42.00');
    elements.splitPaymentTwoAmount.value = '258';
    c.recalculateModalTotals();
    assert.equal(elements.customerChangeDue.textContent, '0.00');
    elements.splitPaymentTwoAmount.value = '100';
    c.recalculateModalTotals();
    assert.equal(elements.customerChangeDue.textContent, '0.00');
  }
});

test('cash-only checkout still displays cash change', () => {
  const { context: c, elements } = checkout();
  c.document.getElementById('paymentMethod').value = 'Cash';
  c.document.getElementById('customerCashPaid').value = '500';
  c.recalculateModalTotals();
  assert.equal(elements.customerChangeDue.textContent, '42.00');
});
