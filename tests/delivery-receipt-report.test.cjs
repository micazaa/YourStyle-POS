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
