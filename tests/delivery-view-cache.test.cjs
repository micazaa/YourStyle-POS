const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('delivery view reuses results, deduplicates requests, and refetches after invalidation', async () => {
  const callbacks = [];
  const nodes = new Map();
  const c = vm.createContext({pageReadCache:new Map(),currentEmployee:{name:'A'},loadingIndicator:()=>'',document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{style:{}});return nodes.get(id);}},google:{script:{run:{withSuccessHandler(fn){callbacks.push(fn);return this;},withFailureHandler(){return this;},getDeliveryDetails(){}}}}});
  vm.runInContext(fs.readFileSync('Frontend/Modals/DeliveryReportModal.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
  let renders=0;
  c.renderStandardDeliveryDetails=()=>{renders++;};
  c.prefetchDeliveryDetails('D1');c.viewDeliveryDetails('D1');c.viewDeliveryDetails('D1');
  assert.equal(callbacks.length,1);
  callbacks[0]({id:'D1'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(renders,1);
  c.closeStandardDeliveryDetails();c.viewDeliveryDetails('D1');
  assert.equal(callbacks.length,1);assert.equal(renders,2);
  c.pageReadCache.delete('standardDeliveryDetails');c.viewDeliveryDetails('D1');
  assert.equal(callbacks.length,2);
  c.currentEmployee={name:'B'};c.viewDeliveryDetails('D1');
  assert.equal(callbacks.length,3);
});

test('successful checkout invalidates delivery stock views so reopening shows the sold item', async () => {
  const callbacks=[], nodes={}, renders=[];
  const c=vm.createContext({currentEmployee:{name:'A'},cart:[{code:'YF-1',quantity:1}],
    document:{getElementById:id=>nodes[id] ||= {style:{},value:''}},
    populateManualDropdown(){},toggleCheckoutModal(){},renderCart(){},saveSession(){},
    google:{script:{run:{withSuccessHandler(fn){callbacks.push(fn);return this;},withFailureHandler(){return this;},getDeliveryDetails(){}}}}});
  vm.runInContext(fs.readFileSync('Frontend/Scripts/AppJS.html','utf8').split('let masterInventory')[0].replace('<script>',''),c);
  for(const file of ['DeliveryReportModal','CheckoutModal'])vm.runInContext(fs.readFileSync('Frontend/Modals/'+file+'.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],c);
  c.toggleCheckoutModal=()=>{};
  c.renderStandardDeliveryDetails=()=>renders.push(vm.runInContext('getDeliveryItemDisplayStatus(deliveryViewData.groups[0].items[0])',c));
  const details=stock=>({id:'D1',yourFinds:true,actual:1,groups:[{id:'direct',items:[{code:'YF-1',status:'ACTIVE',stock,quantity:1}]}]});
  c.viewDeliveryDetails('D1');callbacks[0](details(1));await new Promise(setImmediate);
  for(const key of ['deliveryItems','deliveryDetails','deliveryLabels'])c.pageReadCache.set(key,{data:'old'});
  c.handleCheckoutSuccess({updatedInventory:[{code:'YF-1',status:'ACTIVE',stock:0}]},{receiptId:'YS-1',changeGiven:0});
  for(const key of ['standardDeliveryDetails','deliveryItems','deliveryDetails','deliveryLabels'])assert.equal(c.pageReadCache.has(key),false);
  c.viewDeliveryDetails('D1');assert.equal(callbacks.length,2);
  callbacks[1](details(0));await new Promise(setImmediate);
  assert.deepEqual(renders,['IN STOCK','SOLD']);
  assert.equal(vm.runInContext('deliveryViewData.groups[0].items[0].quantity',c),1);
  assert.equal(vm.runInContext('deliveryViewData.actual',c),1);
});
