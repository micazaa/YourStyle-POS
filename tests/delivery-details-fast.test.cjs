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
  sheets.Inventory[100] = makeRow(inventory, { CODE: '001', DESCRIPTION: 'Yellow', SIZE: 'NO SIZE', CATEGORY: 'PINS', STATUS: 'ACTIVE', STOCK: 5, IMAGE: 'photo' }, 17);
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
  assert.equal(details.groups[0].items[0].stock, 5);
  assert.equal(details.preparedBy, 'Emerose');
  assert.equal(details.reportTotal, '5');
  assert.equal(details.reportLines[0].description, 'Yellow');
  assert.ok(reads.reduce((total, [, height, width]) => total + height * width, 0) < 5100);
  assert.deepEqual(Array.from(reads, ([name]) => name), ['Delivery Log', 'Inventory Movement Log', 'Inventory', 'Inventory']);
});

test('YourFinds delivery details retain original quantities and calculate conversion summary once', () => {
  const context = vm.createContext({ formatInventoryDateForClient: String });
  vm.runInContext(fs.readFileSync('Backend/Constants.js', 'utf8') + '\n' + fs.readFileSync('Backend/DeliveryDetails.js', 'utf8'), context);
  const [delivery, inventory, movement] = vm.runInContext('[DELIVERY_IDX,INV_IDX,MOVE_IDX]', context);
  const row = (indices, fields, width) => {
    const values = Array(width).fill('');
    for (const [name, value] of Object.entries(fields)) values[indices[name]] = value;
    return values;
  };
  const deliveryId = 'YFD-20261013-570';
  const detail = {kind:'YOURFINDS_CONVERSION',deliveryId,sourceCode:'101366001',fromSize:'ME',toSize:'SNE',sourceQuantity:1,resultQuantity:4,notes:'Actual contents'};
  const targetCodes = ['101361001','101361002','101361003','101361004'];
  const sheets = {
    'Delivery Log': [row(delivery, {DELIVERY_ID:deliveryId,DELIVERY_DATE:'2026-10-13',DELIVERY_TYPE:'YOURFINDS',CATEGORY:'ME',RECEIVE_MODE:'DIRECT',ACTUAL_QTY:2,STATUS:'COMPLETED'}, 20)],
    Inventory: [
      row(inventory, {CODE:'101366001',SIZE:'ME',CATEGORY:'YourFinds',INVENTORY_TYPE:'UNIQUE',STATUS:'CONVERTED'}, 17),
      row(inventory, {CODE:'101366002',SIZE:'ME',CATEGORY:'YourFinds',INVENTORY_TYPE:'UNIQUE',STATUS:'INCOMPLETE',STOCK:1}, 17),
      ...targetCodes.map(code => row(inventory, {CODE:code,SIZE:'SNE',CATEGORY:'YourFinds',INVENTORY_TYPE:'UNIQUE',STATUS:'INCOMPLETE'}, 17))
    ],
    'Inventory Movement Log': [
      row(movement, {REFERENCE_ID:deliveryId,SOURCE:'DELIVERY',CODE:'101366001',QTY_CHANGE:1,ITEM:'ME'}, 16),
      row(movement, {REFERENCE_ID:deliveryId,SOURCE:'DELIVERY',CODE:'101366002',QTY_CHANGE:1,ITEM:'ME'}, 16),
      row(movement, {REFERENCE_ID:'ADJ-1',SOURCE_LINE_ID:deliveryId,SOURCE:'ADJUSTMENT',CODE:'101366001',QTY_CHANGE:-1,NOTES:JSON.stringify({...detail,targetCodes})}, 16),
      ...targetCodes.map((code, index) => row(movement, {REFERENCE_ID:'ADJ-1',SOURCE_LINE_ID:deliveryId,SOURCE:'ADJUSTMENT',CODE:code,QTY_CHANGE:1,NOTES:JSON.stringify({...detail,targetIndex:index+1})}, 16))
    ]
  };
  context.SpreadsheetApp = {getActiveSpreadsheet: () => ({getSheetByName(name) {
    const data = sheets[name];
    return {getLastRow: () => data.length + 1, getRange(start, column, height, width) {
      const values = data.slice(start - 2, start - 2 + height).map(record => record.slice(column - 1, column - 1 + width));
      return {
        getValues: () => values,
        getDisplayValues: () => values,
        createTextFinder(value) { return {matchEntireCell() { return this; }, findAll() { return values.flatMap((record, index) => record[0] === value ? [{getRow: () => start + index}] : []); }}; }
      };
    }};
  }})};
  const result = context.getDeliveryDetails(deliveryId);
  assert.equal(result.reportLines[0].code, 'ME');
  assert.equal(result.reportLines[0].quantity, 2);
  assert.equal(result.adjustmentLines.length, 1);
  assert.deepEqual(Array.from(result.adjustmentLines[0].targetCodes), targetCodes);
  assert.deepEqual(Array.from(result.groups[0].items, item => [item.code,item.status]), [
    ['101366001','CONVERTED'],['101366002','INCOMPLETE'],
    ['101361001','INCOMPLETE'],['101361002','INCOMPLETE'],['101361003','INCOMPLETE'],['101361004','INCOMPLETE']
  ]);
  assert.equal(result.actual, 5);
  assert.deepEqual(Array.from(result.finalReportLines, line => [line.code, line.quantity]), [['SNE',4],['ME',1]]);
  assert.equal(result.finalReportTotal, '5');
});
