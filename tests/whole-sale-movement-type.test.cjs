const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('WHOLE SALE products log as OTHERS inventory movements', () => {
  const root = path.join(__dirname, '..');
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'Backend/Constants.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'Backend/InventoryMovement.js'), 'utf8'), context);

  assert.equal(
    context.getInventoryMovementType('WHOLE SALE', 'STOCK'),
    'OTHERS'
  );
});
