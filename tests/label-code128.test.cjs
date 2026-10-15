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

test('receiving and selling labels shorten printed sizes without changing item data or barcode', () => {
  const c=vm.createContext({});
  vm.runInContext(fs.readFileSync('Backend/Label.js','utf8'),c);
  for(const [size,printed] of [['NO SIZE','NS'],['FREE SIZE','FS'],['BULKY','BNE'],['BNE','BNE'],
    ['XLNE','XLNE'],['EXTRA LARGE SIZE','ELS'],['OVERSIZED','OVER']]){
    const item={code:'123456',size,name:'Product',price:100};
    for(const html of [c.buildYourFindsLabelsHtml([item]),c.buildCompletedYourFindsLabelsHtml([item])]){
      assert.match(html,new RegExp('<div class="size">\\s*'+printed+'\\s*</div>'));
      assert.match(html,/<div class="code">\s*123456\s*<\/div>/);
    }
    assert.equal(item.size,size);
  }
});
