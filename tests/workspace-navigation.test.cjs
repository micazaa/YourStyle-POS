const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=path=>fs.readFileSync('Frontend/'+path+'.html','utf8');
const script=path=>html(path).match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture({cashier=false,manager=false,saved}={}) {
  const storage=new Map(),elements={},loads=[],calls=[];
  if(saved)storage.set('ys_pos_active_page',saved);
  const element=id=>elements[id]||=({style:{},value:'',checked:false,disabled:false,setAttribute(){},classList:{toggle(){},remove(){}},querySelectorAll:()=>[]});
  const c=vm.createContext({currentEmployee:{fullName:'Test User',role:manager?'MANAGER':'CASHIER'},currentSessionIsCashier:cashier,
    currentCashier:'',currentShiftPettyCash:0,currentShiftReportId:'',loginAttempt:0,pageReadCache:new Map(),
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    document:{body:{classList:{toggle(){}}},getElementById:element,querySelector:()=>null,querySelectorAll:()=>[]},
    window:{addEventListener(){},matchMedia:()=>({matches:true})},
    hasManagerViewAccess:()=>manager,canAuthorizeManagerActions:()=>manager,
    prioritizeWorkspacePage(){},finishWorkspacePageLoad(){},
    loadInventoryPage:()=>loads.push('inventoryPage'),loadDeliveriesPage:()=>loads.push('deliveriesPage'),
    loadSupplierReturnsPage:()=>loads.push('supplierReturnsPage'),loadDashboardPage:()=>loads.push('dashboardPage'),refreshInventory:()=>loads.push('posPage'),
    showNotificationToast:message=>calls.push(message),loadingIndicator:()=>'',rememberLoginUsername(){},saveSession(){}});
  vm.runInContext(script('Layout/Sidebar'),c);
  return {c,storage,elements,loads,calls,element};
}
test('non-cashier sessions default to Inventory, including managers; cashier sessions default to POS',()=>{
 for(const manager of [false,true])for(const cashier of [false,true]){
  const f=fixture({manager,cashier});f.c.restoreActivePage();
  assert.equal(f.storage.get('ys_pos_active_page'),cashier?'posPage':'inventoryPage');
  assert.deepEqual(f.loads,[cashier?'posPage':'inventoryPage']);
 }
});
test('old Dashboard sessions fall back to the session default and Dashboard cannot open directly',()=>{
 for(const cashier of [false,true]){
  const f=fixture({cashier,saved:'dashboardPage'});f.c.restoreActivePage();
  const wanted=cashier?'posPage':'inventoryPage';assert.equal(f.storage.get('ys_pos_active_page'),wanted);
  f.c.showPage('dashboardPage');assert.deepEqual(f.loads,[wanted]);assert.equal(f.element('dashboardPage').style.display,'none');
 }
 assert.match(html('Layout/Sidebar'),/<button disabled[^>]*id="sidebarAvatar"/);
});
test('staff cannot restore a POS page without cashier access; valid inventory workspace tabs still restore',()=>{
 const f=fixture({saved:'posPage'});f.c.restoreActivePage();assert.equal(f.storage.get('ys_pos_active_page'),'inventoryPage');
 for(const saved of ['inventoryPage','deliveriesPage','supplierReturnsPage']){
  const f=fixture({saved});f.c.restoreActivePage();assert.equal(f.storage.get('ys_pos_active_page'),saved);
 }
 const manager=fixture({manager:true,saved:'posPage'});manager.c.restoreActivePage();
 assert.equal(manager.storage.get('ys_pos_active_page'),'inventoryPage');
 manager.c.showPage('posPage');assert.equal(manager.storage.get('ys_pos_active_page'),'posPage','managers can still choose the cashier reports page');
});
test('successful staff and cashier sign-in use the correct landing page',()=>{
 for(const manager of [false,true])for(const cashier of [false,true]){
  const f=fixture({manager,cashier});vm.runInContext(script('Modals/LoginModal'),f.c);
  f.c.selectedLoginMode=cashier?'CASHIER':'STAFF';f.c.updateSidebarProfile=()=>{};f.c.updateCashierNavigationAvailability=()=>{};
  f.c.rememberLoginUsername=()=>{};
  f.element('cashierSelect').value='test1@ys.sys';f.element('cashierPin').value='password';
  f.element('startingPettyCashInput').value='0';f.element('confirmPettyHandover').checked=true;
  const runner={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(){return this;},
    verifyEmployee(){this.success({success:true,employee:f.c.currentEmployee});},
    loginAndStartShift(){this.success({success:true,employee:f.c.currentEmployee,shift:{success:true,reportId:'CR-1',pettyReceived:0}});}};
  f.c.secureScriptRun=runner;f.c.unlockTerminalSession();
  assert.equal(f.storage.get('ys_pos_active_page'),cashier?'posPage':'inventoryPage');
 }
});
test('saving a session without a remembered page uses the correct session default',()=>{
 const source=html('Scripts/AppJS');
 for(const cashier of [false,true]){
  const f=fixture({cashier});f.c.startAccountSessionMonitor=()=>true;f.c.cart=[];
  vm.runInContext(source.slice(source.indexOf('  function saveSession()'),source.indexOf('  function restoreSession()')),f.c);
  f.c.saveSession();
  const saved=JSON.parse(f.storage.get('ys_pos_session'));
  assert.equal(saved.activePage,cashier?'posPage':'inventoryPage');assert.equal(saved.isCashierSession,cashier);
 }
});
