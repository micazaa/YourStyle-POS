const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = name => fs.readFileSync(`Backend/${name}.js`, 'utf8');

function fixture(existingMovement = false) {
  const headers = [
    'Return ID', 'Return Line ID', 'Return Date', 'Timestamp', 'Prepared By',
    'Approved By', 'Driver Name', 'Plate No.', 'Received By', 'Supplier',
    'Original Delivery ID', 'Product Code', 'Item Name', 'Size', 'Category',
    'Quantity Returned', 'Return Reason', 'Item Condition', 'Status', 'Remarks'
  ];
  const returns = [headers];
  const movements = [Array(16).fill('')];
  const requestId = '12345678-1234-1234-1234-123456789abc';
  const lineId = `YSRL-${requestId.toUpperCase()}`;
  if (existingMovement) {
    const row = Array(16).fill('');
    row[2] = 'SUPPLIER_RETURN'; row[3] = 'YSR-20261001-12345678'; row[4] = lineId;
    row[5] = 'P1'; row[6] = 'Red Pin'; row[7] = 'PINS'; row[8] = -2;
    movements.push(row);
  }
  const sheets = {
    'Return Log': makeSheet(returns),
    'Inventory Movement Log': makeSheet(movements)
  };
  const c = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => sheets[name] }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: () => '2026-10-01' },
    Session: { getScriptTimeZone: () => 'Asia/Manila' }
  });
  vm.runInContext(source('Constants') + '\n' + source('SupplierReturns'), c);
  c.requireManager_ = () => ({ managerName: 'Manager One' });
  c.getInventoryItemByCode = () => ({ success: true, item: { code: 'P1', name: 'Red Pin', size: 'NO SIZE', category: 'PINS', stock: 5, inventoryType: 'STOCK', status: 'ACTIVE' } });
  let movementWrites = 0;
  c.changeInventoryStock = options => {
    movementWrites++;
    const row = Array(16).fill('');
    row[2] = options.source; row[3] = options.referenceId; row[4] = options.sourceLineId;
    row[5] = options.code; row[6] = options.item; row[7] = 'PINS'; row[8] = options.qtyChange;
    row[11] = options.employee; row[12] = options.reason; row[15] = options.notes;
    movements.push(row);
  };
  return { c, returns, movements, requestId, lineId, movementWrites: () => movementWrites };
}

function makeSheet(rows) {
  return {
    getLastRow: () => rows.length,
    appendRow: row => rows.push(row),
    getRange(row, column, height = 1, width = 1) {
      const values = () => Array.from({ length: height }, (_, y) =>
        Array.from({ length: width }, (_, x) => rows[row + y - 1]?.[column + x - 1] ?? '')
      );
      return { getValues: values, getDisplayValues: () => values().map(line => line.map(String)) };
    }
  };
}

function payload(requestId) {
  return {
    requestId, returnDate: '2026-10-01', code: 'P1', quantity: 2,
    supplier: 'YourStyle', reason: 'Damaged shipment', condition: 'DAMAGED',
    status: 'RECEIVED', receivedBy: 'Supplier Staff', originalDeliveryId: 'YSD-1',
    driver: 'Driver', plate: 'abc 123', preparedBy: 'Cashier One', remarks: 'Box torn'
  };
}

test('supplier return writes all fields and stock movement once', () => {
  const f = fixture();
  const result = f.c.saveSupplierReturn(payload(f.requestId));
  assert.equal(result.success, true);
  assert.equal(f.returns.length, 2);
  assert.equal(f.returns[1].length, 20);
  assert.deepEqual(Array.from(f.returns[1].slice(0, 6)), [result.id, f.lineId, '2026-10-01', f.returns[1][3], 'Cashier One', 'Manager One']);
  assert.deepEqual(Array.from(f.returns[1].slice(8, 20)), ['Supplier Staff', 'YourStyle', 'YSD-1', 'P1', 'Red Pin', 'NO SIZE', 'PINS', 2, 'Damaged shipment', 'DAMAGED', 'RECEIVED', 'Box torn']);
  assert.equal(f.movements[1][8], -2);
  assert.equal(f.movementWrites(), 1);
  f.c.saveSupplierReturn(payload(f.requestId));
  assert.equal(f.returns.length, 2);
  assert.equal(f.movementWrites(), 1);
});

test('retry repairs missing Return Log row without removing stock twice', () => {
  const f = fixture(true);
  const result = f.c.saveSupplierReturn(payload(f.requestId));
  assert.equal(result.id, 'YSR-20261001-12345678');
  assert.equal(f.returns.length, 2);
  assert.equal(f.movementWrites(), 0);
});

test('received status requires receiver and every return requires condition', () => {
  const f = fixture();
  assert.throws(() => f.c.saveSupplierReturn({ ...payload(f.requestId), receivedBy: '' }), /Received By/);
  assert.throws(() => f.c.saveSupplierReturn({ ...payload(f.requestId), condition: '' }), /condition/);
  assert.equal(f.movementWrites(), 0);
});
