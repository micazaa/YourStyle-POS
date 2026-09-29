const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function run(timestamp, quantity = 1, alreadyMoved = false) {
  const c = vm.createContext({
    SpreadsheetApp: { flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }
  });
  for (const file of ['Constants.js', 'SalesAutomation.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../Backend', file), 'utf8'), c);
  }
  const indexes = vm.runInContext('SALES_IDX', c);
  const row = Array(26).fill('');
  const values = { TIMESTAMP: timestamp, RECEIPT_ID: 'R-1', CASHIER: 'Test', CODE: '600026',
    ITEM_NAME: 'RED', CATEGORY: 'PINS', QUANTITY: quantity, PRICE: 100, STATUS: 'COMPLETED',
    SALES_LINE_ID: 'SL-1', ENTRY_SOURCE: 'MANUAL', SYNC_STATUS: 'RETRY', SYNC_ERROR: 'Timestamp is required.' };
  for (const [key, value] of Object.entries(values)) row[indexes[key]] = value;
  const movements = [];
  c.salesMovementLineIds_ = () => alreadyMoved ? { 'SL-1': true } : {};
  c.ensureManualSaleInventoryItem_ = () => ({ skipMovement: false });
  c.changeInventoryStock = movement => movements.push(movement);
  const sheet = { getRange(_row, col) { return {
    getValues: () => [row], setValue: value => { row[col - 1] = value; },
    clearContent: () => { row[col - 1] = ''; }
  }; } };
  return { result: c.processSalesRows_(sheet, [2]), row, indexes, movements };
}

test('blank timestamp syncs stock and clears prior timestamp error without inventing a sale date', () => {
  const { result, row, indexes, movements } = run('');
  assert.equal(result.processed, 1);
  assert.equal(result.errors, 0);
  assert.equal(row[indexes.TIMESTAMP], '');
  assert.equal(row[indexes.SYNC_ERROR], '');
  assert.equal(movements[0].qtyChange, -1);
  assert.ok(row[indexes.PROCESSED_AT]);
});

test('existing sale timestamp is preserved', () => {
  const timestamp = new Date('2026-09-26T13:59:51Z');
  const { result, row, indexes } = run(timestamp);
  assert.equal(result.processed, 1);
  assert.equal(row[indexes.TIMESTAMP], timestamp);
});

test('blank timestamp does not bypass quantity validation or duplicate movement protection', () => {
  const invalid = run('', 0);
  assert.equal(invalid.result.errors, 1);
  assert.match(invalid.row[invalid.indexes.SYNC_ERROR], /Quantity/);
  assert.equal(invalid.movements.length, 0);
  const retry = run('', 1, true);
  assert.equal(retry.result.processed, 1);
  assert.equal(retry.movements.length, 0);
});
