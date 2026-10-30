const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('SYNC button repair does not merge or alter Sales Log cells', () => {
  const calls = [];
  const image = {
    setAnchorCell(cell) { calls.push(['anchor', cell.a1]); return this; },
    setWidth(width) { calls.push(['width', width]); return this; },
    setHeight(height) { calls.push(['height', height]); return this; },
    setAltTextTitle(title) { calls.push(['title', title]); return this; },
    setAltTextDescription(description) { calls.push(['description', description]); return this; },
    assignScript(name) { calls.push(['script', name]); return this; }
  };
  const sheet = {
    getRange(a1) { return { a1: a1 }; },
    getImages() { return []; },
    insertImage() { calls.push(['insert']); return image; }
  };
  const context = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }),
      flush() {}
    },
    Utilities: {
      base64Decode: () => [],
      newBlob: () => ({})
    }
  });

  vm.runInContext(
    fs.readFileSync('Backend/Constants.js', 'utf8') + '\n' +
      fs.readFileSync('Backend/SalesAutomation.js', 'utf8'),
    context
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(context.createOrRepairSalesSyncButton_())),
    { success: true, range: 'AD2:AF3' }
  );
  assert.deepEqual(calls, [
    ['insert'],
    ['anchor', 'AD2'],
    ['width', 180],
    ['height', 56],
    ['title', 'YourStyle Sales Sync Button'],
    ['description', 'Click to sync pending Sales Log rows.'],
    ['script', 'processPendingSalesLogRowsFromButton']
  ]);
});
