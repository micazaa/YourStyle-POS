const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const context = vm.createContext({ formatInventoryDateForClient: String });
  vm.runInContext(fs.readFileSync('Backend/Constants.js', 'utf8') + '\n' + fs.readFileSync('Backend/DeliveryDetails.js', 'utf8'), context);
  const [delivery, inventory, movement] = vm.runInContext('[DELIVERY_IDX,INV_IDX,MOVE_IDX]', context);
  const makeRow = (indices, fields, width) => {
    const row = Array(width).fill('');
    for (const [name, value] of Object.entries(fields)) row[indices[name]] = value;
    return row;
  };
  const sheets = {
    'Delivery Log': Array.from({ length: 1000 }, () => makeRow(delivery, { DELIVERY_ID: 'OTHER' }, 20)),
    Inventory: Array.from({ length: 5000 }, (_, index) => makeRow(inventory, { CODE: 'UNRELATED-' + index }, 17)),
    'Inventory Movement Log': Array.from({ length: 20000 }, () => makeRow(movement, { REFERENCE_ID: 'OTHER' }, 16))
  };
  sheets['Delivery Log'][7] = makeRow(delivery, { DELIVERY_ID: 'D1', DELIVERY_DATE: '2026-10-03', DELIVERY_TYPE: 'YOURSTYLE', TYPE: 'PINS', RECEIVE_MODE: 'DIRECT', STATUS: 'ACCEPTED', PREPARED_BY: 'Emerose', ACCEPTED_BY: 'Mica', ACTUAL_QTY: 5 }, 20);
  sheets.Inventory[100] = makeRow(inventory, { CODE: '001', DESCRIPTION: 'Yellow', SIZE: 'NO SIZE', CATEGORY: 'PINS', STATUS: 'ACTIVE', IMAGE: 'photo' }, 17);
  sheets['Inventory Movement Log'][105] = makeRow(movement, { REFERENCE_ID: 'D1', SOURCE: 'DELIVERY', CODE: '001', QTY_CHANGE: 5, ITEM: 'Yellow' }, 16);
  sheets['Inventory Movement Log'][106] = makeRow(movement, { REFERENCE_ID: 'D1', SOURCE: 'SALE', CODE: '001', QTY_CHANGE: -1 }, 16);
  const reads = [];
  context.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName(name) {
    const data = sheets[name];
    return { getLastRow: () => data.length + 1, getRange(start, column, height, width) {
      const values = data.slice(start - 2, start - 2 + height).map(row => row.slice(column - 1, column - 1 + width));
      return {
        getValues() { reads.push([name, height, width]); return values; },
        getDisplayValues() { reads.push([name, height, width]); return values; },
        createTextFinder(value) { return { matchEntireCell() { return this; }, findAll() { return values.flatMap((row, index) => row[0] === value ? [{ getRow: () => start + index }] : []); } }; }
      };
    } };
  } }) };
  return { context, reads };
}

test('delivery details reads matching history and inventory products without full-width scans', () => {
  const { context, reads } = setup();
  const details = context.getDeliveryDetails('D1');
  assert.equal(details.actual, 5);
  assert.equal(details.groups[0].items[0].name, 'Yellow');
  assert.equal(details.groups[0].items[0].imageUrl, 'photo');
  assert.equal(details.preparedBy, 'Emerose');
  assert.equal(details.reportTotal, '5');
  assert.equal(details.reportLines[0].description, 'Yellow');
  assert.ok(reads.reduce((total, [, height, width]) => total + height * width, 0) < 5100);
  assert.deepEqual(Array.from(reads, ([name]) => name), ['Delivery Log', 'Inventory Movement Log', 'Inventory', 'Inventory']);
});
