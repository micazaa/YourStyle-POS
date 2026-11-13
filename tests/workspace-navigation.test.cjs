const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=path=>fs.readFileSync('Frontend/'+path+'.html','utf8');
const script=path=>html(path).match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture({cashier=false,manager=false,dev=false,saved}={}) {
  const storage=new Map(),elements={},loads=[],calls=[];
  const overviewRequests=[],returnDownloads=[];
  if(saved)storage.set('ys_pos_active_page',saved);
  const element=id=>elements[id]||=({style:{display:'none'},tBodies:[],addEventListener(){},contains(){return false;},showModal(){this.open=true;},close(){this.open=false;},replaceChildren(){this.innerHTML='';},value:'',checked:false,disabled:false,setAttribute(){},removeAttribute(){},hasAttribute(){return false;},classList:{toggle(){},remove(){}},querySelectorAll:()=>[]});
  const c=vm.createContext({clearTimeout,currentEmployee:{fullName:'Test User',role:manager?'MANAGER':'CASHIER'},currentSessionIsCashier:cashier,
    currentCashier:'',currentShiftPettyCash:0,currentShiftReportId:'',loginAttempt:0,pageReadCache:new Map(),
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    document:{addEventListener(){},body:{dataset:{dashboardEnabled:String(dev)},classList:{toggle(){}}},getElementById:element,querySelector:selector=>selector==='.sidebar-menu'?element('sidebarMenu'):null,querySelectorAll:()=>[]},
    window:{addEventListener(){},matchMedia:()=>({matches:true})},
    hasManagerViewAccess:()=>manager,canAuthorizeManagerActions:()=>manager,
    prioritizeWorkspacePage(){},finishWorkspacePageLoad(){},
    secureScriptRun:{
      withSuccessHandler(success){this.success=success;return this;},
      withFailureHandler(failure){this.failure=failure;return this;},
      getDashboardOverview(range){overviewRequests.push({range,success:this.success,failure:this.failure});},
      createDashboardReturnPdf(range){returnDownloads.push(range);}
    },
    loadInventoryPage:()=>loads.push('inventoryPage'),loadDeliveriesPage:()=>loads.push('deliveriesPage'),
    loadSupplierReturnsPage:()=>loads.push('supplierReturnsPage'),loadDashboardPage:()=>loads.push('dashboardPage'),refreshInventory:()=>loads.push('posPage'),
    showNotificationToast:message=>calls.push(message),loadingIndicator:()=>'',rememberLoginUsername(){},saveSession(){}});
  vm.runInContext(script('Layout/Sidebar'),c);
  const app=script('Scripts/AppJS');
  vm.runInContext(app.slice(app.indexOf('  function beginPageRead('),app.indexOf('  var workspacePreloadState')),c);
  vm.runInContext(script('Pages/DashboardPage'),c);
  return {c,storage,elements,loads,calls,element,overviewRequests,returnDownloads};
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
test('dev restores the dashboard header with daily quotes and selectable ranges',()=>{
 const f=fixture({dev:true,saved:'dashboardPage'});f.c.restoreActivePage();
 assert.equal(f.element('dashboardPage').style.display,'block');
 assert.deepEqual(f.loads,[]);
 const now=new Date('2026-11-10T22:00:00Z');
 const label=f.element('dashboardPeriodLabel'),quote=f.element('dashboardQuote');
 f.c.updateDashboardHeader(now);
 assert.equal(f.element('dashboardGreeting').textContent,'Good morning, Test!');
 assert.equal(label.textContent,'November 11, 2026');
 const originalQuote=quote.textContent;
 f.c.updateDashboardHeader(new Date('2026-11-11T10:00:00Z'));
 assert.equal(quote.textContent,originalQuote);
 f.c.updateDashboardHeader(new Date('2026-11-11T16:00:00Z'));
 assert.notEqual(quote.textContent,originalQuote);
 const iso=dates=>Array.from(dates,date=>date.toISOString().slice(0,10));
 assert.deepEqual(iso(f.c.dashboardPresetRange('last-month',new Date('2026-01-11'))),['2025-12-01','2025-12-31']);
 vm.runInContext('dashboardToday = dashboardDate(2026, 10, 11); dashboardMonth = dashboardDate(2026, 10, 1); dashboardDraft = [dashboardToday, dashboardToday]',f.c);
 f.c.selectDashboardDay({target:{dataset:{day:'29'}}});
 f.c.moveDashboardMonth(1);
 f.c.selectDashboardDay({target:{dataset:{day:'3'}}});
 assert.match(f.element('dashboardCalendarDays').innerHTML,/data-day="2"[^>]*class="in-range"/);
 f.c.applyDashboardCalendar();
 assert.match(label.textContent,/November 29\s*–\s*December 3, 2026/);
 f.c.openDashboardCalendar();
 const hit={dataset:{day:'24'}};
 const grid={setPointerCapture(id){assert.equal(id,1);},contains:target=>target===hit};
 f.c.document.elementFromPoint=()=>hit;
 const pointer={pointerId:1,button:0,currentTarget:grid};
 f.c.startDashboardDrag({...pointer,target:{dataset:{day:'28'}}});
 f.c.moveDashboardDrag(pointer);
 assert.match(f.element('dashboardCalendarDays').innerHTML,/data-day="25"[^>]*class="in-range"/);
 f.c.cancelDashboardDrag(pointer);
 assert.match(f.element('dashboardCalendarSelection').textContent,/November 29\s*–\s*December 3, 2026/);
 f.c.startDashboardDrag({...pointer,target:{dataset:{day:'28'}}});
 f.c.moveDashboardDrag(pointer);
 f.c.finishDashboardDrag(pointer);
 f.c.applyDashboardCalendar();
 assert.match(label.textContent,/November 24\s*–\s*28, 2026/);
 const latest=f.overviewRequests.at(-1);
 assert.equal(latest.range.start,'2026-11-24');
 assert.equal(latest.range.end,'2026-11-28');
 const totals={sales:{net:24580,count:86,own:true},inventory:{stock:1248,low:12},delivery:{count:6,incomplete:2},returns:{count:3,items:14,groups:[]}};
 latest.success(totals);
 const requestCount=f.overviewRequests.length;
 f.c.loadDashboardOverview();
 assert.equal(f.overviewRequests.length,requestCount);
 assert.equal(f.element('dashboardSalesScope').textContent,'Your net sales');
 assert.equal(f.element('dashboardStockTotal').textContent,'1,248');
 assert.equal(f.element('dashboardDeliveryDetail').textContent,'2 still incomplete');
 f.c.openDashboardReturnSummary();
 assert.equal(f.element('dashboardReturnSummary').open,true);
 assert.equal(f.element('dashboardReturnReceiptCount').textContent,'3');
 assert.equal(f.element('dashboardReturnItemCount').textContent,'14');
 assert.equal(f.element('dashboardReturnDownload').disabled,false);
 f.c.downloadDashboardReturnSummary();
 assert.equal(f.returnDownloads[0].start,'2026-11-24');
 assert.equal(f.returnDownloads[0].end,'2026-11-28');
 f.c.clearDashboardState();
 assert.equal(f.element('dashboardReturnSummary').open,false);
 latest.success(totals);
 assert.equal(f.element('dashboardStockTotal').textContent,'—');
 assert.equal(label.textContent,'Date range');
 assert.equal(quote.textContent,'');
 assert.equal(vm.runInContext('dashboardRange',f.c),null);
});
test('clicking the sidebar Inventory button opens Inventory from Delivery',()=>{
 const f=fixture({saved:'deliveriesPage'});f.c.restoreActivePage();
 const handler=html('Layout/Sidebar').match(/id="inventorySidebarButton"[^>]*onclick="([^"]+)"/)[1];
 vm.runInContext(handler,f.c);
 assert.deepEqual(f.loads,['deliveriesPage','inventoryPage']);
 assert.equal(f.storage.get('ys_pos_active_page'),'inventoryPage');
});
test('UAT restores Dashboard first and waits for its totals before other workspace reads',()=>{
 const f=fixture({dev:true,saved:'deliveriesPage'});f.c.currentEmployee.dashboardToken='session';
 const app=script('Scripts/AppJS');
 const queued=[];
 Object.assign(f.c,{workspacePreloadState:null,resetWorkspacePreload(){},setTimeout:run=>queued.push(run),warmDeliveryCatalog(){}});
 vm.runInContext(app.slice(app.indexOf('  function prioritizeWorkspacePage('),app.indexOf('  function preloadHistoryAndReports(')),f.c);
 f.c.restoreActivePage();
 assert.equal(f.storage.get('ys_pos_active_page'),'dashboardPage');
 assert.equal(queued.length,0);
 assert.deepEqual(f.loads,[]);
 assert.equal(f.overviewRequests.length,1);
 f.c.showPage('dashboardPage');
 assert.equal(f.overviewRequests.length,1);
 f.overviewRequests[0].failure();
 assert.equal(queued.length,1);
 queued[0]();
 assert.deepEqual(f.loads,['inventoryPage','deliveriesPage','supplierReturnsPage']);
});
test('saved Dashboard totals render before the server responds and refresh without blocking navigation',()=>{
 const f=fixture({dev:true});
 f.c.currentEmployee.dashboardToken='session';
 const totals={sales:{net:500,count:2,own:true},inventory:{stock:10,low:1},delivery:{count:1,incomplete:0},returns:{count:0,items:0,groups:[]}};
 let released=0,saved;
 f.c.readDeviceOverview=()=>totals;
 f.c.writeDeviceOverview=(range,data)=>{saved=data;};
 f.c.finishWorkspacePageLoad=()=>released++;
 f.c.restoreActivePage();
 assert.equal(f.element('dashboardSalesTotal').textContent,'₱500');
 assert.equal(f.element('dashboardOverviewStatus').textContent,'Saved totals · refreshing…');
 assert.equal(released,1);assert.equal(f.overviewRequests.length,1);
 const fresh={...totals,sales:{...totals.sales,net:600}};
 f.overviewRequests[0].success(fresh);
 assert.equal(f.element('dashboardSalesTotal').textContent,'₱600');assert.equal(saved,fresh);
 assert.equal(f.element('dashboardOverviewStatus').textContent,'');
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
test('UAT sign-in lands on Dashboard for staff and cashiers, with existing defaults elsewhere',()=>{
 for(const dev of [false,true])for(const manager of [false,true])for(const cashier of [false,true]){
  const f=fixture({manager,cashier,dev});vm.runInContext(script('Modals/LoginModal'),f.c);
  f.c.selectedLoginMode=cashier?'CASHIER':'STAFF';f.c.updateSidebarProfile=()=>{};f.c.updateCashierNavigationAvailability=()=>{};
  f.c.rememberLoginUsername=()=>{};
  f.element('cashierSelect').value='test1@ys.sys';f.element('cashierPin').value='password';
  f.element('startingPettyCashInput').value='0';f.element('confirmPettyHandover').checked=true;
  const runner={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(){return this;},
    getDashboardOverview(){},
    verifyEmployee(){this.success({success:true,employee:f.c.currentEmployee});},
    loginAndStartShift(){this.success({success:true,employee:f.c.currentEmployee,shift:{success:true,reportId:'CR-1',pettyReceived:0}});}};
  f.c.secureScriptRun=runner;f.c.unlockTerminalSession();
  assert.equal(f.storage.get('ys_pos_active_page'),dev?'dashboardPage':cashier?'posPage':'inventoryPage');
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
