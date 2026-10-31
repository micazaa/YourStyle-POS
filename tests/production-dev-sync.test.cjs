const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Backend/ProductionDevSync.js'), 'utf8');

test('Production to Dev sync rejects runs outside Production before touching Dev', () => {
  let opened = false;
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => 'wrong-sheet' }), openById() { opened = true; } },
  });
  vm.runInContext(source, context);
  assert.throws(() => context.syncProductionToDevelopment_(), /Production spreadsheet only/);
  assert.equal(opened, false);
});

test('Production to Dev sync copies every source tab before replacing Dev tabs and creates backup', () => {
  const events = [];
  function sheet(name, id) {
    return { name, id, getName() { return this.name; }, getSheetId() { return this.id; }, setName(value) { this.name = value; }, copyTo(destination) { const copy = sheet('copy', 100 + destination.sheets.length); destination.sheets.push(copy); events.push('copy:' + name); return copy; } };
  }
  const production = { getId: () => '1PXY61BjpfR9cuubzPOKCBOSj2DgAfkiXCqbFIrIw_9c', getSheets: () => [sheet('Sales Log', 1), sheet('Inventory', 2)] };
  const old = sheet('Old Dev', 9);
  const development = { sheets: [old], getSheets() { return this.sheets.slice(); }, deleteSheet(target) { events.push('delete:' + target.name); this.sheets = this.sheets.filter(sheet => sheet !== target); }, setActiveSheet(sheet) { this.active = sheet; }, moveActiveSheet(position) { events.push('move:' + position); } };
  const context = vm.createContext({
    Date, Utilities: { formatDate: () => '20261031-120000' }, Session: { getScriptTimeZone: () => 'Asia/Manila' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: { getFileById: () => ({ makeCopy: name => events.push('backup:' + name) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => production, openById: () => development, flush: () => events.push('flush') },
  });
  vm.runInContext(source, context);
  const result = context.syncProductionToDevelopment_();
  assert.equal(result.sheetCount, 2);
  assert.deepEqual(events.slice(0, 4), ['copy:Sales Log', 'copy:Inventory', 'backup:YourStyle Dev Backup 20261031-120000', 'delete:Old Dev']);
  assert.deepEqual(development.sheets.map(item => item.name), ['Sales Log', 'Inventory']);
});
