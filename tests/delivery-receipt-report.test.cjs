const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadReport(details) {
  let html;
  const context = vm.createContext({
    getDeliveryDetails: () => details,
    Utilities: {
      newBlob(value) {
        html = value;
        return { getAs: () => ({ getBytes: () => [37, 80, 68, 70] }) };
      },
      base64Encode: bytes => Buffer.from(bytes).toString('base64')
    }
  });
  vm.runInContext(fs.readFileSync('Backend/DeliveryReceiptReport.js', 'utf8'), context);
  return { context, getHtml: () => html };
}

test('delivery receipt keeps title bold and information above table regular weight', () => {
  const details = {
    id: 'YFD-20261003-742', date: '2026-10-03', yourFinds: true,
    driver: 'Jeffrey <Q>', plate: 'NGO 2724', preparedBy: 'Emerose C. Estrada',
    acceptedBy: 'Mica Tambalong', remarks: 'Checked',
    reportLines: [{ code: 'SNE', description: 'Small non-electronic', quantity: 40, remarks: '' }],
    reportTotal: '40'
  };
  const { context, getHtml } = loadReport(details);
  const result = context.createDeliveryReceiptPdf(details.id);
  const html = getHtml();
  assert.equal(result.success, true);
  assert.equal(result.fileName, 'Delivery_Receipt_YFD-20261003-742.pdf');
  assert.equal(result.base64, 'JVBERg==');
  assert.match(html, /h1\{[^}]*font-weight:700/);
  assert.match(html, /\.header-right\{[^}]*font-weight:400/);
  assert.match(html, /\.detail-value\{[^}]*font-weight:400/);
  assert.match(html, /\.delivery-id\{[^}]*border:1px solid #d8a7a7/);
  assert.match(html, /\.items th\{[^}]*background-color:#f2dede/);
  assert.match(html, /<th bgcolor="#f2dede">Code<\/th>/);
  assert.match(html, /Jeffrey &lt;Q&gt;/);
  assert.match(html, /October 3, 2026/);
  assert.match(html, /<td>SNE<\/td><td>Small non-electronic<\/td><td class="qty">40<\/td>/);
});

test('delivery receipt keeps original items and adds conversion and final-summary tables', () => {
  const details = {
    id: 'YFD-20261013-570', date: '2026-10-13', yourFinds: true,
    driver: 'Driver', plate: 'ABC 123', preparedBy: 'Preparer', acceptedBy: 'Receiver', remarks: '',
    reportLines: [
      { code: 'LNE', description: 'Large non-electronic', quantity: 1, remarks: '' },
      { code: 'ME', description: 'Medium electronic', quantity: 2, remarks: '' }
    ],
    reportTotal: '3',
    adjustmentLines: [{
      referenceId: 'ADJ-1', fromCode: '101326001', fromSize: 'ME', fromQuantity: 1,
      toSize: 'SNE / MNE', toQuantity: 3, targetCodes: ['101321001', '101321002', '101322001'],
      targets: [
        {toSize:'SNE',toQuantity:2,targetCodes:['101321001','101321002']},
        {toSize:'MNE',toQuantity:1,targetCodes:['101322001']}
      ],
      notes: 'Actual contents used mixed sizes.'
    }],
    finalReportLines: [
      { code: 'SNE', description: 'Small non-electronic', quantity: 2, remarks: '' },
      { code: 'MNE', description: 'Medium non-electronic', quantity: 1, remarks: '' },
      { code: 'LNE', description: 'Large non-electronic', quantity: 1, remarks: '' },
      { code: 'ME', description: 'Medium electronic', quantity: 1, remarks: '' }
    ],
    finalReportTotal: '5'
  };
  const { context, getHtml } = loadReport(details);
  assert.equal(context.createDeliveryReceiptPdf(details.id).success, true);
  const html = getHtml();
  assert.match(html, /<h2>Items Received<\/h2>/);
  assert.match(html, /<td>ME<\/td><td>Medium electronic<\/td><td class="qty">2<\/td>/);
  assert.match(html, /<h2>Adjustments<\/h2>/);
  assert.match(html, /<td>ME<\/td><td class="qty">1<\/td><td>SNE × 2<br>MNE × 1<\/td>/);
  assert.doesNotMatch(html, /101326001|101321001|101321002|101322001/);
  assert.match(html, /<h2>Final Items Received<\/h2>/);
  assert.match(html, /Final inventory units<\/td><td class="qty">5<\/td>/);
});
