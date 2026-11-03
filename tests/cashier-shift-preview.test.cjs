const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('cashier report PDF saves an active-shift snapshot without closing it', () => {
  const source = fs.readFileSync('Backend/Report.js', 'utf8');
  const start = source.indexOf('function generateCashierShiftReportPDF');
  const end = source.indexOf('/* ==========================================================\n   PHASE 10', start);
  const generator = source.slice(start, end);
  assert.match(source, /function saveOpenCashierShiftPreview_/);
  assert.match(source, /row\[CASH_REPORT_IDX\.STATUS\] = 'OPEN'/);
  assert.match(source, /setValues\(\[row\]\)/);
  assert.match(generator, /const activeShiftPreview = openShift/);
  assert.match(generator, /saveOpenCashierShiftPreview_\(/);
  assert.match(generator, /output\.preview = Boolean\(closeResult\.preview\)/);
});
