const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'Backend/Code.js'), 'utf8');

function titleFor(spreadsheetId) {
  const context = vm.createContext({
    DEVELOPMENT_SPREADSHEET_ID: 'dev-sheet',
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => spreadsheetId }) },
  });
  vm.runInContext(code, context);
  return context.getYourStyleAppTitle_();
}

test('app title identifies Production and UAT by spreadsheet', () => {
  assert.equal(titleFor('prod-sheet'), 'YourStyle');
  assert.equal(titleFor('dev-sheet'), 'YourStyle UAT');
});
