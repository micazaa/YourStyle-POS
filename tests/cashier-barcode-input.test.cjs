const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('Frontend/Pages/CashierPage.html','utf8');

function fixture(entries=[['101',[{code:'101'}]]]) {
  const timers=new Map(),owner={},catalogue=[],calls={added:0,clicked:0};let id=0;
  const input={value:'101',offsetParent:{},disabled:false,matches(){return this.disabled;}};
  const nodes={codeInput:input,manualItemSelect:{value:''},manualItemResults:{style:{display:'block'}},
    cashierAddToCart:{click(){calls.clicked++;if(input.value){calls.added++;input.value='';timers.clear();}}}};
  const c=vm.createContext({document:{getElementById:key=>nodes[key],activeElement:input},
    currentEmployee:owner,masterInventory:catalogue,cashierIndexedInventory:catalogue,cashierBarcodeIndex:new Map(entries),
    setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(key){timers.delete(key);},filterManualItemList(){},
    resetManualItemSearch(){timers.clear();},handleManualSearchKeydown(){}});
  vm.runInContext(source.slice(source.indexOf('var cashierBarcodeTimer'),source.indexOf('function addCashierSearchItem()')),c);
  return {c,input,nodes,calls,flush(){const jobs=Array.from(timers.values());timers.clear();jobs.forEach(fn=>fn());}};
}

test('a complete unique barcode adds without Enter; its Enter suffix does not add twice',()=>{
  const f=fixture();f.c.handleCashierSearchInput({});f.flush();assert.equal(f.calls.added,1);
  f.c.handleCashierSearchKeydown({key:'Enter',preventDefault(){}});f.flush();assert.equal(f.calls.added,1);
  f.input.value='101';f.c.handleCashierSearchInput({});f.c.handleCashierSearchKeydown({key:'Enter',preventDefault(){}});
  f.flush();assert.equal(f.calls.added,2);assert.equal(f.calls.clicked,3);
});

test('partial, ambiguous and name searches do not automatically choose a product',()=>{
  for(const [value,entries] of [['10',[['101',[{}]]]],['101',[['101',[{},{}]]]],
    ['101',[['101',[{}]],['10199',[{}]]]],['Bags',[['101',[{}]]]]]){
    const f=fixture(entries);f.input.value=value;f.c.handleCashierSearchInput({});f.flush();assert.equal(f.calls.added,0);
  }
});

test('pending barcode adds stop after focus, account, value, visibility or disabled-state changes',()=>{
  for(const change of [f=>{f.c.document.activeElement=null;},f=>{f.c.currentEmployee={};},
    f=>{f.input.value='other';},f=>{f.input.offsetParent=null;},f=>{f.input.disabled=true;}]){
    const f=fixture();f.c.handleCashierSearchInput({});change(f);f.flush();assert.equal(f.calls.added,0);
  }
});

test('new input replaces the pending scan; arrow navigation and IME input cancel automatic adds',()=>{
  const f=fixture();f.c.handleCashierSearchInput({});f.c.handleCashierSearchInput({});f.flush();assert.equal(f.calls.added,1);
  for(const event of [{key:'ArrowDown'},{key:'Escape',preventDefault(){}},{key:'Enter',isComposing:true}]){
    const f=fixture();f.c.handleCashierSearchInput({});f.c.handleCashierSearchKeydown(event);f.flush();assert.equal(f.calls.added,0);
  }
  const g=fixture();g.c.handleCashierSearchInput({isComposing:true});g.flush();assert.equal(g.calls.added,0);
});
