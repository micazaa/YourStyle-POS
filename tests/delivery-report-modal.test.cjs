const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const script = fs.readFileSync('Frontend/Modals/DeliveryReportModal.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

test('delivered items show five rows before their own scrollbar', () => {
  class Element {
    constructor() { this.children = []; this.style = {}; this.attributes = {}; }
    append(...nodes) { nodes.forEach(node => { node.parent = this; this.children.push(node); }); }
    replaceChildren() { this.children = []; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getBoundingClientRect() { return { top: this.parent.children.indexOf(this) * 82 }; }
  }
  const context = vm.createContext({ document: { createElement: () => new Element() } });
  vm.runInContext(script, context);
  vm.runInContext('deliveryViewData={yourFinds:false}', context);
  const items = Array.from({ length: 6 }, (_, index) => ({ name: 'Item ' + index, code: String(index), quantity: 1 }));
  const container = new Element();
  context.renderStandardDeliveryItems({ id: 'direct', items }, container);
  const list = container.children[0];
  assert.equal(list.children.length, 6);
  assert.equal(list.style.maxHeight, '410px');
  assert.equal(list.attributes.role, 'region');
  context.renderStandardDeliveryItems({ id: 'direct', items: items.slice(0, 5) }, container);
  assert.equal(container.children[0].children.length, 5);
  assert.equal(container.children[0].style.maxHeight, undefined);
});

test('Print Report shows generating state, blocks duplicate clicks, and restores button after failure', () => {
  let success, failure, requests = 0, message;
  const run = {
    withSuccessHandler(callback) { success = callback; return this; },
    withFailureHandler(callback) { failure = callback; return this; },
    createDeliveryReceiptPdf() { requests++; }
  };
  const context = vm.createContext({
    google: { script: { run } },
    loadingIndicator: label => '<spinner>' + label + '</spinner>',
    showNotificationToast: text => { message = text; }
  });
  vm.runInContext(script, context);
  const button = {
    disabled: false, innerHTML: 'Print Report', attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; }
  };
  context.printDeliveryReport('D1', button);
  assert.equal(button.disabled, true);
  assert.match(button.innerHTML, /Generating report/);
  assert.equal(button.attributes['aria-busy'], 'true');
  context.printDeliveryReport('D1', button);
  assert.equal(requests, 1);
  failure(new Error('PDF failed'));
  assert.equal(button.disabled, false);
  assert.equal(button.innerHTML, 'Print Report');
  assert.equal(button.attributes['aria-busy'], undefined);
  assert.equal(message, 'PDF failed');
  assert.equal(typeof success, 'function');
});
