const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const source = fs.readFileSync('Backend/Label.js', 'utf8');
  const end = source.indexOf('/* ==========================================================\n   BARCODE SVG');
  const context = vm.createContext({});
  vm.runInContext(source.slice(0, end), context);
  return context;
}

test('numeric product codes use compact Code 128-C encoding', () => {
  const c = setup();
  assert.deepEqual(Array.from(c.getCode128Values('123456')), [105, 12, 34, 56, 44, 106]);
});

test('text product codes remain valid Code 128-B', () => {
  const c = setup();
  assert.deepEqual(Array.from(c.getCode128Values('ABC')), [104, 33, 34, 35, 1, 106]);
});
