const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('manager expected cash uses one Sales Log read and one report-date boundary', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'Backend/Sales.js'), 'utf8');
  const start = source.indexOf('function getExpectedCashForManager');
  const end = source.indexOf('function testManagerExpectedCash');
  const reads = [];
  const values = [
    ['2026-10-31T04:00:00.000Z', '', '', '', '', '', '', '', '', '', '', '', 100, 'Cash', '', 'COMPLETED'],
    ['2026-10-31T04:00:00.000Z', '', '', '', '', '', '', '', '', '', '', '', 50, 'GCash', '', 'COMPLETED'],
  ];
  const sheet = { getLastRow: () => 3, getRange: (_row, column, rows, width) => ({ getValues: () => { reads.push([column, rows, width]); return values; } }) };
  const context = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }) },
    SHEETS: { SALES_LOG: 'Sales Log' },
    SALES_COL: { TIMESTAMP: 1, STATUS: 16 },
    SALES_IDX: { TIMESTAMP: 0, NET_TOTAL: 12, PAYMENT_METHOD: 13, STATUS: 15 },
    Session: { getScriptTimeZone: () => 'Asia/Manila' },
    Utilities: { parseDate: value => new Date(value.replace(' ', 'T') + '.000Z') },
    roundToTwo: value => Math.round(value * 100) / 100,
  });
  vm.runInContext(source.slice(start, end), context);
  assert.equal(context.getExpectedCashForManager('2026-10-31').expectedCashDrawer, 100);
  assert.deepEqual(reads, [[1, 2, 16]]);
});
