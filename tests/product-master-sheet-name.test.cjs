const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Product Master lookup accepts spacing and case changes after a sheet copy', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'Backend/ProductMaster.js'), 'utf8');
  const start = source.indexOf('function getProductMasterSheet_');
  const end = source.indexOf('function getProductMaster_');
  const renamed = { getName: () => ' product-master ' };
  const context = vm.createContext({ SHEETS: { PRODUCT_MASTER: 'Product Master' }, SpreadsheetApp: { getActiveSpreadsheet() {} } });
  vm.runInContext(source.slice(start, end), context);
  const spreadsheet = { getSheetByName: () => null, getSheets: () => [renamed] };
  assert.equal(context.getProductMasterSheet_(spreadsheet), renamed);
});

test('Product Master lookup recovers a renamed copy from its header schema', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'Backend/ProductMaster.js'), 'utf8');
  const start = source.indexOf('function getProductMasterSheet_');
  const end = source.indexOf('function getProductMaster_');
  const copied = {
    getName: () => 'Copy of Catalog', getLastRow: () => 4, getMaxColumns: () => 18,
    getRange: () => ({ getDisplayValues: () => [['Product Code', 'Description', 'Category', 'Inventory Type', 'Selling Price', 'Cost Price']] }),
  };
  const context = vm.createContext({ SHEETS: { PRODUCT_MASTER: 'Product Master' }, SpreadsheetApp: { getActiveSpreadsheet() {} } });
  vm.runInContext(source.slice(start, end), context);
  const spreadsheet = { getSheetByName: () => null, getSheets: () => [copied] };
  assert.equal(context.getProductMasterSheet_(spreadsheet), copied);
});
