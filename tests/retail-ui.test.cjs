const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = file => fs.readFileSync('Frontend/' + file + '.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

function dialogFixture() {
  let document;
  function element(tag='button',parent=null) {
    const attrs=new Map(),events={};
    return {tagName:tag.toUpperCase(),parentElement:parent,style:{display:'block',zIndex:'9999'},classList:{toggle(){}},events,attrs,isConnected:true,textContent:'',id:'',
      setAttribute(k,v){attrs.set(k,String(v));},getAttribute:k=>attrs.get(k)??null,hasAttribute:k=>attrs.has(k),removeAttribute:k=>attrs.delete(k),
      getClientRects(){return this.style.display==='none'||this.parentElement?.getClientRects().length===0?[]:[{}];},
      closest(){return null;},matches:s=>s.includes(tag),focus(){document.activeElement=this;},click(){events.click?.({});},
      addEventListener(k,fn){events[k]=fn;},querySelector(){return null;},querySelectorAll(){return [];},contains(other){return other===this||other?.parentElement===this;}};
  }
  const body=element('body'),root=element('html'),opener=element(),dialogs=[];
  root.style.setProperty=()=>{};
  document={body,documentElement:root,readyState:'loading',activeElement:opener,events:{},
    addEventListener(k,fn){this.events[k]=fn;},getElementById(){return null;},
    querySelectorAll:s=>s==='.generic-overlay-blur,dialog'?dialogs:[]};
  const observers=[];
  const c=vm.createContext({document,window:{innerHeight:800,addEventListener(){}},MutationObserver:class{constructor(fn){observers.push(fn);}observe(){}},
    getComputedStyle:el=>({visibility:'visible',zIndex:el.style.zIndex}),Event});
  function makeDialog(id,zIndex='9999') {
    const dialog=element('div');dialog.id=id;dialog.style.display='none';dialog.style.zIndex=zIndex;
    const title=element('h2',dialog),close=element('button',dialog),input=element('input',dialog);title.textContent=id;
    dialog.querySelector=s=>s==='h1,h2,h3,h4,h5,h6'?title:s==='.btn-close'?close:null;
    dialog.querySelectorAll=s=>s==='.btn-close'?[close]:[close,input];
    dialog.close=close;dialog.input=input;
    close.events.click=()=>{dialog.style.display='none';};
    dialogs.push(dialog);return dialog;
  }
  return {c,document,opener,makeDialog,run(){vm.runInContext(script('Scripts/RetailUI'),c);document.events.DOMContentLoaded();}};
}

test('custom dialogs keep focus inside, use their existing close handler and restore the opener',()=>{
  const f=dialogFixture(),dialog=f.makeDialog('Test dialog');f.run();
  f.document.events.pointerdown({target:{closest:()=>f.opener}});
  dialog.style.display='flex';f.c.window.YourStyleUI.syncDialogs();
  assert.equal(f.document.activeElement,dialog.input);
  assert.equal(dialog.getAttribute('role'),'dialog');assert.equal(dialog.getAttribute('aria-modal'),'true');
  assert.equal(dialog.close.getAttribute('aria-label'),'Close Test dialog');
  let prevented=false;
  f.document.events.keydown({key:'Tab',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(f.document.activeElement,dialog.close);
  f.document.events.keydown({key:'Tab',shiftKey:true,preventDefault(){}});
  assert.equal(f.document.activeElement,dialog.input);
  f.document.events.keydown({key:'Escape',preventDefault(){}});
  f.c.window.YourStyleUI.syncDialogs();
  assert.equal(dialog.style.display,'none');assert.equal(f.document.activeElement,f.opener);
});

test('nested manager approval keeps focus above the underlying workflow',()=>{
  const f=dialogFixture(),parent=f.makeDialog('Return'),approval=f.makeDialog('Manager','10600');f.run();
  parent.style.display='flex';f.c.window.YourStyleUI.syncDialogs();
  approval.style.display='flex';f.c.window.YourStyleUI.syncDialogs();
  assert.equal(f.c.window.YourStyleUI.topDialog(),approval);
  assert.equal(f.document.activeElement,approval.input);
  assert.equal(parent.getAttribute('aria-modal'),'false');
  approval.close.events.click=()=>{};
  f.document.events.keydown({key:'Escape',preventDefault(){}});
  assert.equal(approval.style.display,'flex');
});

test('phone inventory filter changes wait for Apply and keep the existing filter query',()=>{
  const source=script('Pages/InventoryPage');
  const start=source.indexOf('function handleInventoryFilterChange()'),end=source.indexOf('function inventoryListQuery()',start);
  const checks=[{checked:true}],button={},calls=[];
  let phone=true;
  const c=vm.createContext({inventoryFiltersDirty:false,window:{matchMedia:()=>({matches:phone})},document:{querySelectorAll:()=>checks,getElementById:()=>button},
    updateInventoryFilterButton:()=>calls.push('label'),filterInventoryTable:()=>calls.push('filter'),bootstrap:{Dropdown:{getInstance:()=>({hide:()=>calls.push('close')})}}});
  vm.runInContext(source.slice(start,end),c);
  c.handleInventoryFilterChange();assert.equal(c.inventoryFiltersDirty,true);assert.deepEqual(calls,['label']);
  c.applyInventoryFilters();assert.equal(c.inventoryFiltersDirty,false);assert.deepEqual(calls,['label','close','filter']);
  phone=false;c.handleInventoryFilterChange();assert.equal(calls.at(-1),'filter');
  phone=true;c.clearInventoryFilters();assert.equal(checks[0].checked,false);assert.equal(c.inventoryFiltersDirty,true);
});

test('closing an edited supplier return confirms discard while successful saves close directly',()=>{
  const source=script('Pages/SupplierReturnsPage');
  const extract=name=>source.slice(source.indexOf('function '+name+'('),source.indexOf('\n',source.indexOf('function '+name+'(')));
  const fields=Object.fromEntries(['Date','PreparedBy','Driver','Plate','CheckedBy','Remarks','AllReason'].map(id=>['supplierReturn'+id,{value:''}]));
  fields.supplierReturnModal={style:{display:'flex'}};let confirms=0,accept=false;
  const c=vm.createContext({supplierReturnBusy:false,supplierReturnLoad:0,supplierReturnDraftBaseline:'',supplierReturnSelected:[],supplierReturnPending:new Set(),
    document:{getElementById:id=>fields[id]},confirm:()=>{confirms++;return accept;}});
  vm.runInContext(extract('supplierReturnDraftFingerprint')+'\n'+extract('closeSupplierReturn'),c);
  c.supplierReturnDraftBaseline=c.supplierReturnDraftFingerprint();fields.supplierReturnRemarks.value='Handle with care';
  c.closeSupplierReturn();assert.equal(confirms,1);assert.equal(fields.supplierReturnModal.style.display,'flex');
  c.closeSupplierReturn(true);assert.equal(confirms,1);assert.equal(fields.supplierReturnModal.style.display,'none');
  fields.supplierReturnModal.style.display='flex';c.supplierReturnBusy=true;c.closeSupplierReturn(true);assert.equal(fields.supplierReturnModal.style.display,'flex');
});

test('brand and status text meet 4.5:1 contrast on their paired surfaces',()=>{
  const source=fs.readFileSync('Frontend/Styles/CSS.html','utf8');
  const tokens=Object.fromEntries([...source.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map(match=>[match[1],match[2]]));
  const luminance=hex=>hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  assert.equal(tokens['pink-main'],'#e1bfc5');
  for(const [text,surface] of [['pink-ink','pink-main'],['pink-ink','pink-hover'],['pink-ink','pink-active'],['pink-ink','card-bg'],['text-gray','card-bg'],['text-dark','bg-main'],...['success','warning','danger','info'].map(status=>['color-'+status,'color-'+status+'-bg'])]){
    const a=luminance(tokens[text]),b=luminance(tokens[surface]);assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,text);
  }
});

test('checkout loading blocks edits and restores original disabled states without clearing values',()=>{
  const source=script('Modals/CheckoutModal');
  const start=source.indexOf('  function setCheckoutLoading('),end=source.indexOf('function handleCheckoutFailure',start);
  const confirm={disabled:false,innerHTML:''},cash={disabled:false,value:'1250'},locked={disabled:true,value:'saved reference'};
  const modal={setAttribute(){},querySelectorAll:()=>[confirm,cash,locked]};
  const c=vm.createContext({checkoutSubmitting:false,checkoutDisabledControls:new Map(),document:{getElementById:id=>id==='checkoutModal'?modal:confirm},loadingIndicator:label=>label});
  vm.runInContext(source.slice(start,end),c);
  c.setCheckoutLoading(true);assert.equal(confirm.disabled,true);assert.equal(cash.disabled,true);assert.equal(c.checkoutSubmitting,true);
  c.setCheckoutLoading(true);c.setCheckoutLoading(false);
  assert.equal(cash.disabled,false);assert.equal(locked.disabled,true);assert.equal(confirm.disabled,false);
  assert.equal(cash.value,'1250');assert.equal(locked.value,'saved reference');assert.equal(c.checkoutDisabledControls.size,0);
});
