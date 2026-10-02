const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup(ids, random = 0) {
  const sheet = { getLastRow: () => ids.length + 1, getRange: () => ({ getDisplayValues: () => ids.map(id => [id]) }) };
  const context = vm.createContext({ Math: Object.assign(Object.create(Math), { random: () => random }), SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }) } });
  vm.runInContext(fs.readFileSync('Backend/Constants.js', 'utf8') + '\n' + fs.readFileSync('Backend/GeneralDelivery.js', 'utf8') + '\n' + fs.readFileSync('Backend/Inventory.js', 'utf8'), context);
  return context;
}
test('delivery suffix skips used IDs and preserves type/date boundaries', () => {
  const c = setup(['YFD-20261002-001', 'YFD-20261002-001', 'YSD-20261002-002']);
  assert.equal(c.generateYourFindsDeliveryId('2026-10-02'), 'YFD-20261002-002');
  assert.equal(c.generateDeliveryIdentifiers('YOURSTYLE', '2026-10-02').deliveryId, 'YSD-20261002-001');
});
test('delivery suffix uses random selection across remaining three-digit IDs', () => {
  assert.equal(setup([], 0.999).generateYourFindsDeliveryId('2026-10-02'), 'YFD-20261002-999');
});
test('exhausted delivery suffixes fail without reusing an ID', () => {
  const ids = Array.from({ length: 999 }, (_, i) => 'YFD-20261002-' + String(i + 1).padStart(3, '0'));
  assert.throws(() => setup(ids).generateYourFindsDeliveryId('2026-10-02'), /Maximum of 999/);
});
