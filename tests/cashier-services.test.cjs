const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('Frontend/Pages/CashierPage.html','utf8');

function fixture() {
  const nodes={},notices=[];
  const node=id=>nodes[id]||={value:'',hidden:false,focus(){this.focused=true;},checkValidity(){return this.valid!==false;}};
  const c=vm.createContext({cart:[],cartReservation:()=>null,document:{getElementById:node},
    showNotificationToast:message=>notices.push(message),renderCart(){},saveSession(){}});
  vm.runInContext(source.slice(source.indexOf('function cashierBundleKind('),source.indexOf('function cashierBundleKey('))+
    source.slice(source.indexOf('function generateServiceCode()'),source.indexOf('function startNewTransaction()')),c);
  return {c,node,notices};
}

test('preset and custom services enter the cart with SERVICE category and entered price',()=>{
  const f=fixture();
  for(const [selection,name,price] of [['Steam','Steam','150'],['Place rent','Place rent','1200.50'],[' Packing ','Packing','25']]){
    f.node('serviceDescription').value=selection;
    f.node('customPrice').value=price;
    f.c.addCustomItem();
    const item=f.c.cart.at(-1);
    assert.equal(item.name,name);assert.equal(item.price,Number(price));
    assert.equal(item.category,'SERVICE');assert.equal(item.size,'');assert.equal(item.isCustom,true);
    assert.equal(item.priceSource,'MANUAL');assert.match(item.code,/^CUSTOM-\d{5}$/);
    assert.equal(f.node('serviceDescription').value,'');assert.equal(f.node('customPrice').value,'');
  }
  assert.equal(f.c.cart.length,3);assert.equal(new Set(f.c.cart.map(item=>item.code)).size,3);
});

test('service validation preserves the form and cart for missing or invalid values and reservation conflicts',()=>{
  for(const values of [['',100],[' ',100],['X'.repeat(101),100],['Steam',''],['Steam','-1'],['Steam','Infinity']]){
    const f=fixture();f.node('serviceDescription').value=values[0];
    f.node('customPrice').value=String(values[1]);f.c.addCustomItem();
    assert.equal(f.c.cart.length,0);assert.equal(f.notices.length,1);
    assert.equal(f.node('serviceDescription').value,values[0]);
  }
  const f=fixture();f.c.cartReservation=()=>({reservationReceiptId:'R1'});
  f.node('serviceDescription').value='Steam';f.node('customPrice').value='150';f.c.addCustomItem();
  assert.equal(f.c.cart.length,0);assert.equal(f.node('customPrice').value,'150');
});

test('short service codes keep five digits and avoid another code already in this cart',()=>{
  const f=fixture();f.c.Date={now:()=>99999};
  f.c.cart.push({code:'CUSTOM-99999'});
  assert.equal(f.c.generateServiceCode(),'CUSTOM-00000');
  f.c.cart.push({code:'CUSTOM-00000'});
  assert.equal(f.c.generateServiceCode(),'CUSTOM-00001');
});

test('manual SERVICE lines keep pricing and bypass inventory creation and stock movements',()=>{
  const c=vm.createContext({assertAppRequest_(){},changeInventoryStockBatch_(rows){assert.equal(rows.length,0);return rows;},
    ensureCustomYourFindsInventoryItem_(){throw Error('Service must not create YourFinds stock');}});
  for(const file of ['Constants','Inventory','Sales','SalesAutomation'])vm.runInContext(fs.readFileSync('Backend/'+file+'.js','utf8'),c);
  const lines=[{code:'CUSTOM-S1',name:'Steam',category:'SERVICE',size:'',price:150,quantity:1,isCustom:true}];
  const validated=c.validateSalePricing_(lines,[]);
  assert.equal(validated[0].category,'SERVICE');assert.equal(validated[0].price,150);assert.equal(validated[0].priceSource,'MANUAL');
  assert.equal(c.deductInventoryStock(validated,'R1','Cashier',[]).length,0);
  assert.equal(c.ensureManualSaleInventoryItem_(validated[0]).skipMovement,true);
});
