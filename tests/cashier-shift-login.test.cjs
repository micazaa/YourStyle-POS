const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class ShiftDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : ['2026-10-30T01:00:00.000Z']));
  }
}

function loadReportWithCashLog(rows = []) {
  const columns = 37;
  const sheet = {
    getLastRow: () => rows.length + 1,
    getRange(row, column, rowCount, columnCount) {
      return {
        getValues: () => rows.slice(row - 2, row - 2 + rowCount).map(values => values.slice(0, columnCount)),
        setValues(values) {
          rows.push(...values.map(value => value.slice()));
        }
      };
    }
  };
  const context = vm.createContext({
    Date: ShiftDate,
    CASH_REPORT_COLUMN_COUNT: columns,
    CASH_REPORT_IDX: {
      REPORT_ID: 0, TIMESTAMP: 1, REPORT_TYPE: 2, REPORT_DATE: 3, EMPLOYEE: 4,
      SHIFT_START: 6, PETTY_RECEIVED: 21, PETTY_RETURNED: 31, STATUS: 35, UPDATED_AT: 36
    },
    SHEETS: { CASH_REPORT_LOG: 'Cash Report Log' },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }),
      flush() {}
    },
    Session: { getScriptTimeZone: () => 'Asia/Manila' },
    Utilities: {
      formatDate(date, _timezone, pattern) {
        if (pattern === 'yyyyMMdd') return date.toISOString().slice(0, 10).replaceAll('-', '');
        if (pattern === "yyyy-MM-dd'T'HH:mm:ss") return date.toISOString().slice(0, 19);
        return date.toISOString().slice(0, 10);
      }
    }
  });
  vm.runInContext(fs.readFileSync('Backend/Report.js', 'utf8'), context);
  return { startCashierShift: context.startCashierShift, rows };
}

test('cashier sign-in creates an ID, timestamp, and CASHIER SHIFT report row', () => {
  const { startCashierShift, rows } = loadReportWithCashLog();

  const result = startCashierShift('Ana Cashier', 1250);

  assert.equal(result.success, true);
  assert.equal(result.reportId, 'CR-20261030-001');
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], result.reportId);
  assert.equal(typeof rows[0][1].getTime, 'function');
  assert.equal(rows[0][2], 'CASHIER SHIFT');
  assert.equal(rows[0][4], 'Ana Cashier');
  assert.equal(rows[0][21], 1250);
  assert.equal(rows[0][35], 'OPEN');
});

test('signing back into an open cashier shift reuses its report ID without duplicating the report', () => {
  const { startCashierShift, rows } = loadReportWithCashLog();
  const first = startCashierShift('Ana Cashier', 1250);

  const resumed = startCashierShift('Ana Cashier', 1250);

  assert.equal(resumed.success, true);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.reportId, first.reportId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][2], 'CASHIER SHIFT');
});

test('an older OPEN shift does not prevent recording a new day cashier sign-in', () => {
  const oldShift = new Array(37).fill('');
  oldShift[0] = 'CR-20261012-001';
  oldShift[2] = 'CASHIER SHIFT';
  oldShift[3] = '2026-10-12';
  oldShift[4] = 'Mica Tambalong';
  oldShift[6] = new ShiftDate('2026-10-12T10:47:00Z');
  oldShift[21] = 412;
  oldShift[35] = 'OPEN';
  const closedReport = new Array(37).fill('');
  closedReport[0] = 'CR-20261015-001';
  closedReport[2] = 'CASHIER SHIFT';
  closedReport[3] = '2026-10-15';
  closedReport[4] = 'Mica Tambalong';
  closedReport[31] = 1870;
  closedReport[35] = 'CLOSED';
  const originalShift = oldShift.slice();
  const { startCashierShift, rows } = loadReportWithCashLog([oldShift, closedReport]);

  const result = startCashierShift('Mica Tambalong', 1870);

  assert.equal(result.success, true);
  assert.equal(result.resumed, false);
  assert.equal(result.reportId, 'CR-20261030-001');
  assert.equal(rows.length, 3);
  assert.equal(rows[2][0], result.reportId);
  assert.equal(rows[2][1].toISOString(), '2026-10-30T01:00:00.000Z');
  assert.equal(rows[2][2], 'CASHIER SHIFT');
  assert.equal(rows[2][3], '2026-10-30');
  assert.equal(rows[2][21], 1870);
  assert.equal(rows[2][35], 'OPEN');
  assert.deepEqual(rows[0], originalShift);
});
