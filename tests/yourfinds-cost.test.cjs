const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function setup(){
  const inventory=[Array(16).fill(''),['STANDARD','Shirt','S','YourFinds','UNIQUE','ACTIVE','','','','','','100','0','image','',''],['CUSTOM-1','Dress','FREE SIZE','YourFinds','UNIQUE','ACTIVE','','','','','','200','0','image','','']];
  let releases=0;
  const sheet={getName:()=> 'Inventory',getMaxColumns:()=>26,getLastRow:()=>inventory.length,getRange(row,col,height=1,width=1){return {
    getValue:()=>inventory[row-1]?.[col-1]??'',
    getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>inventory[row+i-1]?.[col+j-1]??'')),
    getDisplayValues(){return this.getValues().map(r=>r.map(String));},
    setValue(value){inventory[row-1]??=[];inventory[row-1][col-1]=value;},
    setValues(values){values.forEach((r,i)=>{inventory[row+i-1]??=[];r.forEach((value,j)=>inventory[row+i-1][col+j-1]=value);});}
  };}};
  const c=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet}),flush(){}},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){releases++;}})}});
  for(const file of ['Constants.js','Inventory.js','InventoryMovement.js','SalesAutomation.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Backend',file),'utf8'),c);
  c.verifyInventoryManagerSession_=token=>{if(token!=='manager')throw Error('Manager session invalid');return {success:true};};
  c.getProductMaster=()=>[{category:'YourFinds',description:'SNE',costPrice:50,active:true,imageUrl:'image'},{category:'YourFinds',description:'CUSTOM',costPrice:999,active:true,imageUrl:'image'}];
  c.getActiveProducts=c.getProductMaster;
  c.getFullInventory=()=>inventory.slice(1).map((r,i)=>({rowNumber:i+2,code:r[0],name:r[1],size:r[2],category:r[3],stock:-1}));
  c.readCostMap_=()=>({});
  c.setInventoryCalculatedFields_=()=>{};
  return {c,inventory,sheet,releases:()=>releases};
}
test('normal YourFinds editor saves standard and custom items at any stock without changing stock',()=>{
  for(const stock of [-1,0,1])for(const custom of [false,true]){
    const {c,inventory}=setup();
    const index=custom?2:1;
    inventory[index][9]=stock;
    c.getYourFindsItemForCompletion=()=>({success:true,item:{code:inventory[index][0],rowNumber:index+1,size:inventory[index][2],status:'ACTIVE',stock,imageUrl:'image',origPrice:0}});
    c.requireManager_=(_pin,token)=>{if(token!=='manager')throw Error('Manager authorization required');return {managerName:'Manager'};};
    const payload={code:inventory[index][0],description:'Updated',sellingPrice:150,managerToken:'manager',...(custom?{costPrice:25}:{})};
    assert.equal(c.saveYourFindsItemDetails(payload).success,true);
    assert.equal(inventory[index][1],'Updated');assert.equal(inventory[index][11],150);assert.equal(inventory[index][9],stock);
    if(custom)assert.equal(inventory[index][16],25);
    assert.throws(()=>c.saveYourFindsItemDetails({...payload,managerToken:''}),/Manager/);
  }
});
test('standard size aliases share cost, custom labels never inherit CUSTOM template cost',()=>{
  const {c}=setup();
  for(const [input,expected] of [[' s ','SNE'],['M','MNE'],['L','LNE'],['XL','XLNE'],['SE','SE'],['FREE SIZE','CUSTOM'],['NO SIZE','CUSTOM']])assert.equal(c.normalizeYourFindsSaleSize_(input),expected);
  const items=c.getInventoryForManagement('manager');assert.equal(items[0].costPrice,50);assert.equal(items[0].costSource,'SIZE');assert.equal(items[1].costPrice,null);assert.equal(items[1].costSource,'CUSTOM');
});
test('custom costs are manager-only, zero stays zero, and blank clears only that item',()=>{
  const {c,inventory,releases}=setup();
  assert.throws(()=>c.saveYourFindsCustomCost({code:'CUSTOM-1',costPrice:10}),/session/);
  assert.throws(()=>c.saveYourFindsCustomCost({code:'CUSTOM-1',costPrice:-1,managerToken:'manager'}),/non-negative/);
  assert.throws(()=>c.saveYourFindsCustomCost({code:'STANDARD',costPrice:10,managerToken:'manager'}),/nonstandard/);
  assert.equal(inventory[0][16],undefined);
  c.saveYourFindsCustomCost({code:'CUSTOM-1',costPrice:0,managerToken:'manager'});
  assert.equal(inventory[0][16],'Custom Cost Price');assert.equal(c.getInventoryForManagement('manager')[1].costPrice,0);
  assert.equal(Object.hasOwn(c.getInventoryForManagement('')[1],'costPrice'),false);
  c.saveYourFindsCustomCost({code:'CUSTOM-1',costPrice:'',managerToken:'manager'});
  assert.equal(c.getInventoryForManagement('manager')[1].costPrice,null);assert.equal(c.getInventoryForManagement('manager')[0].costPrice,50);assert.equal(releases(),5);
});
test('custom cost storage refuses to overwrite a conflicting header or unlabelled data',()=>{
  const {c,inventory}=setup();inventory[0][16]='Another field';assert.throws(()=>c.saveYourFindsCustomCost({code:'CUSTOM-1',costPrice:5,managerToken:'manager'}),/already used/);
  inventory[0][16]='';inventory[1][16]='Keep me';assert.throws(()=>c.saveYourFindsCustomCost({code:'CUSTOM-1',costPrice:5,managerToken:'manager'}),/contains data/);assert.equal(inventory[1][16],'Keep me');
});
test('POS/manual automation creates S as SNE, preserves FREE SIZE and NO SIZE, retries preserve custom cost',()=>{
  const {c,inventory}=setup();
  for(const [code,size,expected] of [['A','S','SNE'],['B','FREE SIZE','FREE SIZE'],['C','NO SIZE','NO SIZE']]){
    c.ensureManualSaleInventoryItem_({code,category:'YourFinds',name:'Item',size,price:100});assert.equal(inventory.at(-1)[2],expected);
  }
  c.saveYourFindsCustomCost({code:'B',costPrice:37,managerToken:'manager'});
  const before=inventory.length;c.ensureManualSaleInventoryItem_({code:'B',category:'YourFinds',name:'Item',size:'FREE SIZE',price:100});
  assert.equal(inventory.length,before);assert.equal(c.getInventoryForManagement('manager').find(i=>i.code==='B').costPrice,37);
  assert.equal(c.getInventoryForManagement('manager').find(i=>i.code==='C').costPrice,null);
});
