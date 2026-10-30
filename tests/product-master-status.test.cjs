const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('explicit ACTIVE Product Master status keeps a YourFinds size available', () => {
  const header = Array(17).fill('');
  const noSize = Array(17).fill('');
  noSize[0] = '756735';
  noSize[1] = 'NO SIZE';
  noSize[2] = 'YOURFINDS';
  noSize[3] = 'UNIQUE';
  noSize[7] = false; // Legacy Active checkbox is blank/false in imported row.
  noSize[11] = 'ACTIVE';
  const data = [header, noSize];
  const sheet = {
    getLastRow: () => data.length,
    getMaxColumns: () => 17,
    getRange(row, column, height, width) {
      const values = Array.from({ length: height }, (_, i) =>
        Array.from({ length: width }, (_, j) => data[row - 1 + i][column - 1 + j])
      );
      return { getValues: () => values, getDisplayValues: () => values.map(row => row.map(String)) };
    }
  };
  const context = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }) },
    SHEETS: { PRODUCT_MASTER: 'Product Master' },
    PRODUCT_MASTER_COLUMN_COUNT: 17,
    PRODUCT_IDX: { PRODUCT_CODE: 0, DESCRIPTION: 1, CATEGORY: 2, INVENTORY_TYPE: 3, SELLING_PRICE: 4, COST_PRICE: 5, LOW_STOCK_AT: 6, ACTIVE: 7, IMAGE: 8, CREATED_AT: 9, UPDATED_AT: 10, STATUS: 11, SALE_PRICE: 12, SALE_QUANTITY: 13, SALE_REMAINING: 14, SALE_END: 15, SALE_REFERENCE_ID: 16 },
    PRODUCT_COL: { SALE_PRICES: 18 },
    PRODUCT_STATUS: { ACTIVE: 'ACTIVE', DEACTIVATED: 'DEACTIVATED', ON_SALE: 'ON SALE' },
    formatProductMasterDateForClient: value => String(value || ''),
    publicProduct_: item => item
  });
  vm.runInContext(fs.readFileSync('Backend/ProductMaster.js', 'utf8'), context);

  assert.equal(context.getActiveProducts().length, 1);
  assert.equal(context.getActiveProducts()[0].description, 'NO SIZE');
});
