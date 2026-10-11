const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

test('repairing an incomplete Inventory row writes the full A:Q schema', () => {
  let written;
  const sheet = {
    getRange(row, column, height, width) {
      return {
        getDisplayValues: () => [Array(width).fill('')],
        setValues(values) {
          written = values[0];
          assert.equal(written.length, width);
        },
      };
    },
  };
  const context = vm.createContext({
    Date,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }),
      flush() {},
    },
    normalizeInventoryCategoryValue_: (value) => value,
    setInventoryCalculatedFields_() {},
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'Backend/Constants.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'Backend/ProductMaster.js'), 'utf8'), context);

  context.repairIncompleteInventoryFromProductMaster_({
    productCode: '100001',
    description: 'Yellow',
    category: 'PINS',
    inventoryType: 'STOCK',
    defaultPrice: 120,
    imageUrl: 'image',
  }, 2);

  assert.equal(written.length, 17);
  assert.equal(written[9], '');
  assert.equal(written[10], '');
  assert.equal(written[11], '');
  assert.equal(written[12], 120);
  assert.equal(written[14], 'image');
});
