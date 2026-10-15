const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness(sourceOverrides = {}) {
  let inventoryLastRow = 2;
  let targetRows = [];
  let sourceStatus = 'INCOMPLETE';
  let sourceUpdatedAt = 'old';
  let movements = [];
  let released = false;
  let statusValidation = null;
  const calculated = [];
  const sourceItem = Object.assign({
    code: '101363001', rowNumber: 2, name: '', size: 'LNE', category: 'YourFinds',
    inventoryType: 'UNIQUE', status: 'INCOMPLETE', stock: 1, deliveryId: 'YFD-20261013-570'
  }, sourceOverrides);

  const inventory = {
    getLastRow() { return inventoryLastRow; },
    getRange(row, column, height = 1, width = 1) {
      return {
        setValues(values) { targetRows = values; inventoryLastRow = Math.max(inventoryLastRow, row + values.length - 1); },
        getValues() {
          const values = Array(17).fill('');
          values[5] = sourceStatus;
          values[16] = sourceUpdatedAt;
          return [values];
        },
        setDataValidation(value) { if (row === 2 && column === 6) statusValidation = value; },
        setValue(value) {
          if (row === 2 && column === 6) sourceStatus = value;
          if (row === 2 && column === 17) sourceUpdatedAt = value;
        }
      };
    },
    deleteRows() { throw new Error('Unexpected rollback'); }
  };
  const movement = { getLastRow() { return 1; }, deleteRows() { throw new Error('Unexpected rollback'); } };
  const productMaster = {};
  const spreadsheet = { getSheetByName(name) {
    return { Inventory: inventory, 'Inventory Movement Log': movement, 'Product Master': productMaster }[name] || null;
  } };
  const context = vm.createContext({
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      flush() {},
      newDataValidation() {
        const state = {values:[], allowInvalid:true};
        return {
          requireValueInList(values) { state.values = values.slice(); return this; },
          setAllowInvalid(value) { state.allowInvalid = value; return this; },
          build() { return state; }
        };
      }
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { released = true; } }) },
    Utilities: { formatDate: () => '20261013-120000' },
    Session: { getScriptTimeZone: () => 'Asia/Manila' },
    verifyManagerPin: pin => pin === '1234'
      ? { success: true, managerName: 'Test Manager' }
      : { success: false, message: 'Invalid Manager PIN.' },
    getInventoryItemByCode: () => ({ success: true, item: sourceItem }),
    generateYourFindsDeliveryCodes: (sheet, date, size, quantity) => {
      assert.equal(sheet, inventory);
      assert.equal(date, '2026-10-13');
      const codes = {
        SNE: ['101361001', '101361002', '101361003'],
        MNE: ['101362001', '101362002', '101362003'],
        LNE: ['101363002', '101363003', '101363004'],
        'NO SIZE': ['101310001', '101310002', '101310003'],
        BNE: ['101311001', '101311002', '101311003']
      }[size];
      assert.ok(codes, 'unexpected target size '+size);
      return codes.slice(0, quantity);
    },
    setInventoryCalculatedFields_: (sheet, row, count) => calculated.push([sheet, row, count]),
    changeInventoryStockBatch_: batch => { movements = batch; return { success: true }; },
    normalizeYourFindsCustomSizeLabel_: value => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase().replace(/^BULKY$/, 'BNE'),
    isStandardYourFindsSizeLabel_: value => ['S','M','L','XL','SNE','MNE','LNE','XLNE','NO SIZE','BNE','BULKY','SE','ME','LE','XLE','CUSTOM'].includes(String(value || '').toUpperCase())
  });
  vm.runInContext(fs.readFileSync('Backend/Constants.js', 'utf8') + '\n' + fs.readFileSync('Backend/InventoryMovement.js', 'utf8'), context);
  context.changeInventoryStockBatch_ = batch => { movements = batch; return { success: true }; };
  return { context, state: () => ({ targetRows, sourceStatus, sourceUpdatedAt, movements, released, calculated, statusValidation }) };
}

test('conversion marks one unique source converted and creates incomplete result codes', () => {
  const { context, state } = harness();
  const result = context.convertYourFindsDeliveryItem({
    sourceCode: '101363001', deliveryId: 'YFD-20261013-570', targetSize: 'SNE',
    resultQuantity: 3, notes: 'Actual count', employee: 'Mica Tambalong', managerPin: '1234'
  });
  const saved = state();
  assert.equal(result.success, true);
  assert.deepEqual(Array.from(result.codes), ['101361001', '101361002', '101361003']);
  assert.equal(saved.sourceStatus, 'CONVERTED');
  assert.deepEqual(Array.from(saved.statusValidation.values), ['ACTIVE','INACTIVE','INCOMPLETE','CONVERTED','RETURNED']);
  assert.equal(saved.statusValidation.allowInvalid, false);
  assert.equal(saved.targetRows.length, 3);
  assert.deepEqual(Array.from(saved.targetRows, row => [row[0], row[2], row[3], row[4], row[5]]), [
    ['101361001', 'SNE', 'YourFinds', 'UNIQUE', 'INCOMPLETE'],
    ['101361002', 'SNE', 'YourFinds', 'UNIQUE', 'INCOMPLETE'],
    ['101361003', 'SNE', 'YourFinds', 'UNIQUE', 'INCOMPLETE']
  ]);
  assert.equal(saved.movements.length, 4);
  assert.deepEqual(Array.from(saved.movements, line => line.qtyChange), [-1, 1, 1, 1]);
  assert.ok(saved.movements.every(line => line.source === 'ADJUSTMENT'));
  assert.ok(saved.movements.every(line => line.sourceLineId === 'YFD-20261013-570'));
  assert.ok(saved.movements.every(line => line.referenceId === result.adjustmentId));
  assert.equal(JSON.parse(saved.movements[0].notes).kind, 'YOURFINDS_CONVERSION');
  assert.equal(saved.released, true);
});

test('one unique source can convert into multiple sizes and quantities atomically', () => {
  const { context, state } = harness();
  const result = context.convertYourFindsDeliveryItem({
    sourceCode: '101363001', deliveryId: 'YFD-20261013-570',
    targets: [
      { targetSize: 'SNE', quantity: 2 },
      { targetSize: 'MNE', quantity: 1 }
    ],
    notes: 'Mixed contents', employee: 'Mica Tambalong', managerPin: '1234'
  });
  const saved = state();
  assert.equal(result.success, true);
  assert.equal(result.resultQuantity, 3);
  assert.deepEqual(Array.from(result.targets, target => [target.targetSize, target.resultQuantity, Array.from(target.codes)]), [
    ['SNE', 2, ['101361001', '101361002']],
    ['MNE', 1, ['101362001']]
  ]);
  assert.deepEqual(Array.from(saved.targetRows, row => [row[0], row[2], row[5]]), [
    ['101361001', 'SNE', 'INCOMPLETE'],
    ['101361002', 'SNE', 'INCOMPLETE'],
    ['101362001', 'MNE', 'INCOMPLETE']
  ]);
  assert.deepEqual(Array.from(saved.movements, line => [line.code, line.qtyChange, line.item]), [
    ['101363001', -1, 'LNE'],
    ['101361001', 1, 'SNE'],
    ['101361002', 1, 'SNE'],
    ['101362001', 1, 'MNE']
  ]);
  const detail = JSON.parse(saved.movements[0].notes);
  assert.deepEqual(detail.targets.map(target => [target.toSize, target.resultQuantity]), [['SNE', 2], ['MNE', 1]]);
  assert.equal(saved.sourceStatus, 'CONVERTED');
});

test('result can use same size as source', () => {
  const { context, state } = harness();
  const result = context.convertYourFindsDeliveryItem({
    sourceCode: '101363001', deliveryId: 'YFD-20261013-570',
    targets: [{ targetSize: 'LNE', quantity: 2 }],
    employee: 'Mica Tambalong', managerPin: '1234'
  });
  assert.deepEqual(Array.from(result.codes), ['101363002', '101363003']);
  assert.deepEqual(Array.from(state().targetRows, row => [row[0], row[2]]), [
    ['101363002', 'LNE'], ['101363003', 'LNE']
  ]);
});

test('NO SIZE and legacy BULKY convert into canonical standard sizes', () => {
  const { context } = harness();
  const result = context.convertYourFindsDeliveryItem({
    sourceCode: '101363001', deliveryId: 'YFD-20261013-570',
    targets: [{ targetSize: 'NO SIZE', quantity: 1 }, { targetSize: 'BULKY', quantity: 1 }],
    employee: 'Mica Tambalong', managerPin: '1234'
  });
  assert.deepEqual(Array.from(result.targets, target => [target.targetSize, Array.from(target.codes)]), [
    ['NO SIZE', ['101310001']], ['BNE', ['101311001']]
  ]);
});

test('conversion requires manager authorization before changing inventory', () => {
  const { context, state } = harness();
  assert.throws(() => context.convertYourFindsDeliveryItem({
    sourceCode: '101363001', deliveryId: 'YFD-20261013-570',
    targets: [{ targetSize: 'SNE', quantity: 2 }], employee: 'Mica Tambalong'
  }), /Invalid Manager PIN/);
  assert.equal(state().targetRows.length, 0);
  assert.equal(state().movements.length, 0);
});

test('converted or completed source item cannot be converted again', () => {
  for (const status of ['CONVERTED', 'ACTIVE']) {
    const { context, state } = harness({ status });
    assert.throws(() => context.convertYourFindsDeliveryItem({
      sourceCode: '101363001', deliveryId: 'YFD-20261013-570', targetSize: 'SNE',
      resultQuantity: 3, employee: 'Mica Tambalong', managerPin: '1234'
    }), /Only incomplete/);
    assert.equal(state().targetRows.length, 0);
    assert.equal(state().released, true);
  }
});

test('delivery detail UI exposes conversion only for incomplete stock-one items', () => {
  const source = fs.readFileSync('Frontend/Modals/YourFindsDeliveryDetails.html', 'utf8');
  assert.match(source, /id="yourFindsConversionModal"[^>]+z-index:10020/);
  assert.doesNotMatch(source, /deliveryConversionSourceStatus/);
  assert.match(source, /status === "INCOMPLETE" && Number\(item\.stock\) === 1/);
  assert.match(source, /id="deliveryConversionTargets"/);
  assert.match(source, /addYourFindsConversionTargetRow/);
  assert.match(source, /"NO SIZE", "BNE"/);
  assert.doesNotMatch(source, /data-conversion-custom-size/);
  assert.doesNotMatch(source, /<option value="CUSTOM">/);
  assert.match(source, /targets: targets/);
  assert.match(source, /requestManagerPin\("Enter Manager PIN to save this conversion:/);
  assert.doesNotMatch(source, /Result size must differ from source size/);
  assert.doesNotMatch(source, /<span>Current stock<\/span>/);
  assert.doesNotMatch(source, /<span>After change<\/span>/);
  assert.match(source, /\.convertYourFindsDeliveryItem\(payload\)/);
  assert.match(source, /openYourFindsLabelModal\(result\.deliveryId, result\.codes\)/);
  assert.match(source, /closeStandardDeliveryDetails\(\)/);
  assert.match(source, /refreshDeliveriesPage\(true\)/);
  assert.doesNotMatch(source, /printConvertedYourFindsLabels_/);
  assert.match(source, /status === "CONVERTED"/);
  const receiving = fs.readFileSync('Frontend/Modals/AcceptDeliveryModal.html', 'utf8');
  assert.match(receiving, /value:"NO SIZE", label:"NO SIZE"/);
  assert.match(receiving, /value:"BNE", label:"BNE"/);
  const cashier = fs.readFileSync('Frontend/Pages/CashierPage.html', 'utf8');
  assert.match(cashier, /<option value="NO SIZE">NO SIZE<\/option>/);
  assert.match(cashier, /<option value="BNE">BNE<\/option>/);
  const labels = fs.readFileSync('Frontend/Modals/YourFindsLabelModal.html', 'utf8');
  assert.match(labels, /Array\.isArray\(selectedCodes\)/);
  assert.match(labels, /checkbox\.checked = preferredCodes/);
});

test('multi-size conversion updates delivery row and cached details before background reload', () => {
  const source = fs.readFileSync('Frontend/Modals/YourFindsDeliveryDetails.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const detail = {id:'YFD-1',actual:2,counts:{LNE:2},groups:[{id:'direct',items:[
    {code:'OLD-1',size:'LNE',status:'INCOMPLETE',stock:1,quantity:1},
    {code:'OLD-2',size:'LNE',status:'INCOMPLETE',stock:1,quantity:1}
  ]}]};
  const delivery = {deliveryId:'YFD-1',totalQty:2,quantities:{LNE:2}};
  const cache = {entries:new Map([['YFD-1',{data:detail}]])};
  let rendered = 0;
  const context = vm.createContext({
    deliveryViewData:detail,
    deliveriesPageData:[delivery],
    filterDeliveriesPage:() => { rendered++; },
    pageReadCache:new Map([['standardDeliveryDetails',cache]])
  });
  vm.runInContext(source, context);
  context.applyYourFindsConversionClient_({
    adjustmentId:'ADJ-1',deliveryId:'YFD-1',sourceCode:'OLD-1',fromSize:'LNE',resultQuantity:3,
    codes:['NEW-S1','NEW-S2','NEW-M1'],
    targets:[
      {targetSize:'SNE',resultQuantity:2,codes:['NEW-S1','NEW-S2']},
      {targetSize:'MNE',resultQuantity:1,codes:['NEW-M1']}
    ]
  });
  assert.equal(delivery.totalQty,4);
  assert.deepEqual(Object.fromEntries(Object.entries(delivery.quantities)),{LNE:1,SNE:2,MNE:1});
  assert.equal(rendered,1);
  assert.equal(detail.actual,4);
  assert.deepEqual(Object.fromEntries(Object.entries(detail.counts)),{LNE:1,SNE:2,MNE:1});
  assert.equal(detail.groups[0].items[0].status,'CONVERTED');
  assert.deepEqual(Array.from(detail.groups[0].items.slice(-3),item=>[item.code,item.size,item.status]),[
    ['NEW-S1','SNE','INCOMPLETE'],['NEW-S2','SNE','INCOMPLETE'],['NEW-M1','MNE','INCOMPLETE']
  ]);
});
