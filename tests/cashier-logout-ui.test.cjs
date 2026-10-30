const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function client() {
  const html=fs.readFileSync('Frontend/Modals/CashierReportModal.html','utf8');
  const elements={},calls=[],timers=[];
  const clock={now:Date.now()};
  class ClientDate extends Date {constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}}
  for(const match of html.matchAll(/id="([^"]+)"/g)) elements[match[1]]={style:{},dataset:{},value:'',checked:false,hidden:false,disabled:false,textContent:'',innerHTML:'',setAttribute(name,value){this[name]=value;}};
  elements.shiftReportModal.querySelectorAll=()=>Object.values(elements).filter(el=>el!==elements.shiftReportSubmit);
  elements.cashierEndManager.replaceChildren=(...options)=>{elements.cashierEndManager.options=options;};
  elements.cashierEndManager.add=option=>elements.cashierEndManager.options.push(option);
  const c=vm.createContext({console,Date:ClientDate,Intl,Math,
    Option:function(text,value){this.text=text;this.value=value;},
    currentEmployee:{dashboardToken:'token-a'},currentCashier:'Ana Cashier',currentSessionIsCashier:true,
    currentShiftReportId:'CR-20261030-001',currentShiftPettyCash:1870,cart:[],PETTY_DENOMS:[1000,500,200,100,50,20,10,5,1],
    document:{getElementById:id=>elements[id],querySelector:()=>elements.shiftReportSubmit},
    loadingIndicator:label=>label,saveSession(){},toggleSidebar(){},showNotificationToast(){},
    restoreForm(){},setTimeout:callback=>{timers.push(callback);},
    window:{open(){}},
    google:{script:{get run(){const call={};calls.push(call);const runner=new Proxy({}, {get(_target,key){
      if(key==='withSuccessHandler')return fn=>{call.success=fn;return runner;};
      if(key==='withFailureHandler')return fn=>{call.failure=fn;return runner;};
      return (...args)=>{call.method=key;call.args=args;};
    }});return runner;}}}
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],c);
  const sidebar=fs.readFileSync('Frontend/Layout/Sidebar.html','utf8');
  vm.runInContext(sidebar.slice(sidebar.indexOf('function triggerCleanLogout()'),sidebar.indexOf('  window.addEventListener("click"')),c);
  let logouts=0,managerPrompt;
  c.completeCleanLogout=()=>{logouts++;};
  c.requestManagerPin=(message,callback,forcePin)=>{managerPrompt=callback;c.managerPromptMessage=message;c.managerForcePin=forcePin;};
  const context={success:true,reportId:'CR-20261030-001',receiveId:'PH-receive',reportDate:'2026-10-29',status:'OPEN',pettyReceived:1870,managers:['Mia Manager']};
  function loaded(intent='pause') {c.chooseCashierLogout(intent);calls.at(-1).success(context);}
  function count() {for(const d of [1000,500,200,100,50,20])elements['pr'+d].value='1';c.updateCashierExitReady();}
  return {c,elements,calls,timers,clock,loaded,count,logouts:()=>logouts,manager:()=>managerPrompt};
}

test('a new shift uses its sign-in state immediately, with no saved-report fetch or loading overlay',()=>{
  const {c,elements,calls,clock}=client();
  c.rememberCashierReportContext({success:true,status:'OPEN',reportId:'CR-20261030-001',reportDate:c.getCashReportToday(),
    receiveId:'new-receipt',pettyReceived:1000,managers:['Mia Manager'],hasSavedReport:false,savedReport:null,cashBreakdown:{}});
  clock.now+=120000;
  c.toggleShiftReportModal(true,'end');
  assert.equal(calls.length,0);assert.equal(elements.cashierReportContent.hidden,false);assert.equal(elements.cashierReportLoading.hidden,true);
  assert.equal(elements.d1000.value,'');assert.equal(c.cashierExitContext.receiveId,'new-receipt');
  c.toggleShiftReportModal(false);c.toggleShiftReportModal(true,'report');
  assert.equal(calls.length,0);assert.equal(elements.cashierReportContent.hidden,false);assert.equal(elements.d500.value,'');
});

test('saved report reuse expires from the actual fetch time and never crosses employee sessions',()=>{
  const {c,elements,calls,clock}=client();
  const context={success:true,status:'OPEN',reportId:'CR-20261030-001',receiveId:'receipt',pettyReceived:1000,
    managers:['Mia Manager'],hasSavedReport:true,savedReport:{manager:'Mia Manager',cashBreakdown:{500:2}}};
  c.rememberCashierReportContext(context);c.toggleShiftReportModal(true,'end');
  assert.equal(calls.length,0);assert.equal(elements.d500.value,2);
  c.toggleShiftReportModal(false);clock.now+=20000;c.toggleShiftReportModal(true,'end');assert.equal(calls.length,0);
  c.toggleShiftReportModal(false);clock.now+=11000;c.toggleShiftReportModal(true,'end');
  assert.equal(calls.length,1);assert.equal(elements.cashierReportContent.hidden,true);
  calls.at(-1).success(context);c.toggleShiftReportModal(false);
  c.currentEmployee={dashboardToken:'another-session'};c.toggleShiftReportModal(true,'end');
  assert.equal(calls.length,2);assert.equal(elements.cashierReportContent.hidden,true);
});

test('dates with no saved report reopen without fetching again, and a forced refresh still reads Sheets',()=>{
  const {c,elements,calls,clock}=client();c.toggleShiftReportModal(true,'report');
  calls.at(-1).success({success:true,found:false});c.toggleShiftReportModal(false);
  c.toggleShiftReportModal(true,'report');assert.equal(calls.length,1);assert.equal(elements.cashierReportContent.hidden,false);
  c.refreshCashierReport();assert.equal(calls.length,2);assert.equal(elements.cashierReportContent.hidden,true);
  calls.at(-1).success({success:true,found:false});c.toggleShiftReportModal(false);
  clock.now+=31000;c.toggleShiftReportModal(true,'report');assert.equal(calls.length,3);
});

test('refreshing a new report discovers saved values, and a save attempt invalidates report copies',()=>{
  const h=client(),{c,elements,calls}=h;
  c.rememberCashierReportContext({success:true,status:'OPEN',reportId:'CR-20261030-001',receiveId:'receipt',pettyReceived:1000,
    managers:['Mia Manager'],hasSavedReport:false,savedReport:null});
  c.toggleShiftReportModal(true,'end');assert.equal(calls.length,0);
  c.refreshCashierReport();assert.equal(calls.at(-1).method,'getCashierShiftContext');
  calls.at(-1).success({success:true,status:'OPEN',reportId:'CR-20261030-001',receiveId:'receipt',pettyReceived:1000,
    managers:['Mia Manager'],hasSavedReport:true,pettyBreakdown:{1000:1},savedReport:{manager:'Mia Manager',cashBreakdown:{500:2}}});
  assert.equal(elements.d500.value,2);c.submitShiftReportTally();h.manager()('1234');
  assert.equal(calls.at(-1).method,'saveCashierShiftExit');assert.equal(c.cashierReportContextCache,null);
  assert.equal(c.cashierReportDateCache,null);
});

test('a new business day invalidates even a known-empty report copy',()=>{
  const {c,calls,clock}=client();
  c.rememberCashierReportContext({success:true,status:'OPEN',reportId:'CR-20261030-001',receiveId:'receipt',
    hasSavedReport:false,pettyReceived:1000,managers:['Mia Manager']});
  clock.now+=86400000;c.toggleShiftReportModal(true,'end');
  assert.equal(calls.length,1);assert.equal(calls[0].method,'getCashierShiftContext');
});

test('Cashier Shift Report button opens date navigation while End shift keeps today locked',()=>{
  const h=client(),{c,elements,calls,timers}=h;
  const page=fs.readFileSync('Frontend/Pages/CashierPage.html','utf8');
  const handler=page.match(/onclick="([^"]+)"[^>]*>Cashier Shift Report<\/button>/)[1];
  vm.runInContext(handler,c);
  assert.equal(c.cashierReportIntent,'report');
  assert.equal(elements.cashierReportMetadata.hidden,false);
  assert.equal(elements.cashierReportDate.disabled,false);
  assert.equal(elements.cashierClosingDate.hidden,true);
  assert.equal(elements.cashierReportDate.value,c.getCashReportToday());
  assert.equal(timers.length,0);
  assert.equal(elements.cashierReportContent.hidden,true);assert.equal(elements.cashierReportLoading.hidden,false);
  const initial=calls.at(-1);
  elements.cashierReportDate.value='2026-10-28';c.loadCashReportByDate();
  assert.equal(calls.at(-1).method,initial.method);
  assert.ok(calls.at(-1).args.includes('2026-10-28'));
  calls.at(-1).success({success:true,found:false});
  h.loaded('end');
  assert.equal(elements.cashierReportMetadata.hidden,true);
  assert.equal(elements.cashierReportDate.disabled,true);
  assert.equal(elements.cashierReportDate.value,c.getCashReportToday());
  assert.equal(h.logouts(),0);
});

test('cashier logout opens choices and pause shows only petty cash; cancel and failures keep session active',()=>{
  const h=client(),{c,elements,calls}=h;
  c.triggerCleanLogout();assert.equal(elements.cashierLogoutModal.style.display,'flex');assert.equal(h.logouts(),0);
  h.loaded();assert.equal(elements.cashierReportMetadata.hidden,true);assert.equal(elements.cashierSalesCashColumn.hidden,true);
  assert.equal(elements.cashierEndManagerField.hidden,true);
  assert.equal(elements.cashierHandoverConfirmed,undefined);
  assert.equal(elements.shiftReportSubmit.disabled,false);h.count();assert.equal(elements.shiftReportSubmit.disabled,false);
  c.submitShiftReportTally();c.submitShiftReportTally();assert.equal(calls.filter(call=>call.method==='saveCashierShiftExit').length,1);
  assert.equal(h.logouts(),0);assert.equal(calls.at(-1).args[0].action,'PAUSE');
  const request=calls.at(-1).args[0].requestId;calls.at(-1).failure({message:'Connection failed'});
  assert.equal(h.logouts(),0);assert.equal(elements.cashierExitError.textContent,'Connection failed');
  c.submitShiftReportTally();assert.equal(calls.at(-1).args[0].requestId,request);
  calls.at(-1).success({success:true,status:'PAUSED'});assert.equal(h.logouts(),1);
});

test('end shift shows cash count and waits for real manager authorization and save success before sign-out',()=>{
  const h=client(),{c,elements,calls}=h;h.loaded('end');h.count();
  assert.equal(elements.cashierSalesCashColumn.hidden,false);assert.equal(elements.cashierReportDate.disabled,true);
  assert.equal(elements.cashierReportMetadata.hidden,true);
  assert.equal(elements.cashierExitHint.hidden,true);
  assert.equal(elements.cashierReportModeLink,undefined);
  assert.equal(elements.cashierReportDate.value,c.getCashReportToday());
  assert.equal(elements.cashierClosingDate.hidden,false);
  assert.match(elements.cashierClosingDate.textContent,/^Today · /);
  assert.equal(elements.cashierEndManagerField.hidden,false);
  assert.equal(elements.cashierEndManager.options[1].value,'Mia Manager');
  assert.equal(elements.shiftReportSubmit.disabled,true);
  c.submitShiftReportTally();assert.equal(h.manager(),undefined);assert.match(elements.cashierExitError.textContent,/Select a verifying manager/);
  elements.cashierEndManager.value='Mia Manager';c.updateCashierExitReady();
  assert.equal(elements.shiftReportSubmit.disabled,false);
  c.submitShiftReportTally();assert.equal(calls.length,1);assert.equal(h.logouts(),0);
  assert.match(c.managerPromptMessage,/Mia Manager/);assert.equal(c.managerForcePin,true);
  h.manager()(null);assert.equal(c.cashierExitBusy,false);assert.equal(h.logouts(),0);
  c.submitShiftReportTally();h.manager()('1234');
  assert.equal(calls.at(-1).args[0].action,'END');assert.equal(calls.at(-1).args[0].managerCredential,'1234');
  assert.equal(calls.at(-1).args[0].managerName,'Mia Manager');
  calls.at(-1).success({success:true,status:'CLOSED',pdfWarning:'Report saved. PDF unavailable.'});
  assert.equal(h.logouts(),1);
});

test('a reopened daily report retains the saved cash count and sends the updated total without adding it twice',()=>{
  const h=client(),{c,elements,calls}=h;
  c.chooseCashierLogout('end');
  calls.at(-1).success({success:true,status:'OPEN',reportId:'CR-20261030-001',receiveId:'reopened',
    pettyReceived:1870,managers:['Mia Manager'],hasSavedReport:true,
    pettyBreakdown:{1000:1,500:1,200:1,100:1,50:1,20:1},
    savedReport:{manager:'Mia Manager',cashBreakdown:{500:1,200:1},cashRemark:'Earlier count',
      pettyBreakdown:{1000:2,500:2,200:2,100:2,50:2,20:2},pettyVoucherNo:'PCV-OLD',pettyRemark:'Earlier expense'}});
  assert.equal(elements.d500.value,1);assert.equal(elements.d200.value,1);
  assert.equal(elements.cashDrawerCountTotalOut.textContent,'₱700.00');
  assert.equal(elements.cashDrawerVarianceReason.value,'Earlier count');
  assert.equal(elements.cashierDailyCashHint,undefined);
  assert.equal(elements.cashierEndManager.value,'Mia Manager');
  assert.equal(elements.pr1000.value,1);assert.equal(elements.pettyReturnedTotalOut.textContent,'₱1870.00');
  assert.equal(elements.cashierSavedPettyNotes,undefined);
  assert.equal(elements.d1000.value,'');assert.equal(elements.pr10.value,'');
  assert.equal(elements.pettyVoucherNo.value,'');assert.equal(elements.pettyVarianceReason.value,'');
  elements.d200.value='2';
  c.submitShiftReportTally();h.manager()('1234');
  assert.equal(calls.at(-1).args[0].reportId,'CR-20261030-001');
  assert.equal(calls.at(-1).args[0].cashBreakdown[500],1);
  assert.equal(calls.at(-1).args[0].cashBreakdown[200],2);
  assert.equal(calls.at(-1).args[0].pettyBreakdown[1000],1);assert.equal(calls.at(-1).args[0].voucherNo,'');
});

test('saved zero counts still load; inactive saved managers require choosing an active manager',()=>{
  const h=client(),{c,elements,calls}=h;c.chooseCashierLogout('end');
  calls.at(-1).success({success:true,status:'OPEN',reportId:'CR-20261030-001',receiveId:'reopened',
    pettyReceived:1000,managers:['Mia Manager'],hasSavedReport:true,pettyBreakdown:null,
    savedReport:{manager:'Inactive Manager',cashBreakdown:{},cashRemark:'Zero cash'}});
  assert.equal(elements.d1000.value,'');assert.equal(elements.d500.value,'');
  assert.equal(elements.cashierEndManager.value,'');assert.equal(elements.shiftReportSubmit.disabled,true);
  assert.equal(elements.pr1000.value,'');assert.equal(elements.cashDrawerVarianceReason.value,'Zero cash');
});

test('report retrieval hides the entire form, blocks repeat opens and submissions, and restores retry after failure',()=>{
  const h=client(),{c,elements,calls}=h;
  c.chooseCashierLogout('end');const pending=calls.at(-1);
  assert.equal(elements.cashierReportContent.hidden,true);assert.equal(elements.cashierReportLoading.hidden,false);
  assert.equal(elements.shiftReportModal['aria-busy'],'true');
  c.toggleShiftReportModal(true,'end');c.submitShiftReportTally();
  assert.equal(calls.length,1);
  pending.failure({message:'Could not retrieve report'});
  assert.equal(elements.cashierReportContent.hidden,false);assert.equal(elements.cashierReportLoading.hidden,true);
  assert.equal(elements.cashierExitRetry.hidden,false);assert.equal(elements.shiftReportSubmit.disabled,true);
  c.loadCashierExitContext();assert.equal(calls.length,2);assert.equal(elements.cashierReportContent.hidden,true);
  calls.at(-1).success({success:true,status:'OPEN',reportId:'CR-20261030-001',receiveId:'current',pettyReceived:1000,
    managers:['Mia Manager'],savedReport:{manager:'Mia Manager',cashBreakdown:{500:2}},pettyBreakdown:{1000:1}});
  assert.equal(elements.cashierReportContent.hidden,false);assert.equal(elements.d500.value,2);assert.equal(elements.d200.value,'');
  assert.equal(elements.pr1000.value,1);assert.equal(elements.pr500.value,'');
});

test('cashier report date changes keep loading until the newest response and display saved zero counts as blanks',()=>{
  const h=client(),{c,elements,calls}=h;
  c.toggleShiftReportModal(true,'report');const older=calls.at(-1);
  elements.cashierReportDate.value='2026-10-28';c.loadCashReportByDate();const latest=calls.at(-1);
  older.success({success:true,found:false});assert.equal(elements.cashierReportContent.hidden,true);
  latest.success({success:true,found:true,report:{status:'CLOSED',reportId:'CR-past',reportDate:'2026-10-28',employee:'Ana Cashier',
    pettyReceived:1000,pettyBreakdown:{1000:1,500:0},cashBreakdown:{500:2,200:0}}});
  assert.equal(elements.cashierReportContent.hidden,false);assert.equal(elements.cashierReportLoading.hidden,true);
  assert.equal(elements.pr500.value,'');assert.equal(elements.d200.value,'');assert.equal(elements.d500.value,2);
  assert.equal(elements.shiftReportSubmit.style.display,'none');
});

test('a dismissed modal ignores late context responses; fractional counts and missing vouchers cannot submit',()=>{
  const h=client(),{c,elements,calls}=h;
  c.chooseCashierLogout('pause');const pending=calls.at(-1);c.toggleShiftReportModal(false);
  pending.success({success:true,status:'CLOSED'});assert.equal(h.logouts(),0);
  h.loaded();h.count();elements.pr1000.value='1.5';c.submitShiftReportTally();
  assert.match(elements.cashierExitError.textContent,/whole numbers/);assert.equal(calls.filter(call=>call.method==='saveCashierShiftExit').length,0);
  elements.pr1000.value='0';c.submitShiftReportTally();assert.match(elements.cashierExitError.textContent,/voucher/);
});

function loginClient() {
  const html=fs.readFileSync('Frontend/Modals/LoginModal.html','utf8'),elements={},calls=[];
  for(const match of html.matchAll(/id="([^"]+)"/g))elements[match[1]]={style:{},value:'',checked:false,disabled:false,children:[],setAttribute(){},appendChild(child){this.children.push(child);}};
  const c=vm.createContext({console:{log(){},error(){}},Promise,
    document:{getElementById:id=>elements[id]||null,createElement:()=>({})},
    loadingIndicator:label=>label,showNotificationToast(){},
    google:{script:{get run(){const call={};calls.push(call);const runner=new Proxy({}, {get(_target,key){
      if(key==='withSuccessHandler')return fn=>{call.success=fn;return runner;};
      if(key==='withFailureHandler')return fn=>{call.failure=fn;return runner;};
      return (...args)=>{call.method=key;call.args=args;};
    }});return runner;}}}
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],c);
  return {c,elements,calls};
}

test('successful cashier sign-in preloads the report state and manager choices without a second request',async()=>{
  const {c,elements,calls}=loginClient();let remembered=null,cleared=0;
  for(const id of ['cashierManagerReportBtn','terminalWorkspace','appSidebar'])elements[id]={style:{}};
  Object.assign(c,{pageReadCache:new Map(),localStorage:{removeItem(){}},updateSidebarProfile(){},
    updateCashierNavigationAvailability(){},showPage(){},saveSession(){},
    clearCashierReportCache(){cleared++;},rememberCashierReportContext(context){remembered=context;}});
  c.initializeLogin();calls.at(-1).success({employees:[{fullName:'Ana Cashier',username:'anacashier2@ys.sys',accessLevel:2},
    {fullName:'Mia Manager',username:'miamanager1@ys.sys',accessLevel:1}],petty:{success:true,received:1000,holder:''}});
  await new Promise(setImmediate);
  elements.cashierSelect.value='anacashier2@ys.sys';elements.cashierPin.value='2222';c.changeLoginMode('CASHIER');
  elements.confirmPettyHandover.checked=true;c.updateLoginReady();c.unlockTerminalSession();
  calls.at(-1).success({success:true,employee:{fullName:'Ana Cashier',accessLevel:2,dashboardToken:'owner-token'},
    shift:{success:true,status:'OPEN',reportId:'CR-today',receiveId:'receipt',reportDate:'2026-10-30',pettyReceived:1000,hasSavedReport:false,savedReport:null}});
  assert.equal(calls.length,2);assert.equal(cleared,1);assert.equal(remembered.hasSavedReport,false);
  assert.equal(remembered.reportId,'CR-today');assert.deepEqual(Array.from(remembered.managers),['Mia Manager']);
  assert.equal(c.currentEmployee.dashboardToken,'owner-token');assert.equal(c.currentShiftReportId,'CR-today');
});

test('normal sign-in stays ready while setup is pending or failed; only a submitted login shows loading',async()=>{
  const {c,elements,calls}=loginClient();
  c.initializeLogin();const setup=calls.at(-1);
  assert.equal(elements.loginShiftButton.textContent,'Sign in');assert.equal(elements.loginShiftButton.disabled,true);
  elements.cashierSelect.value='anacashier2@ys.sys';elements.cashierPin.value='2222';c.updateLoginReady();
  assert.equal(elements.loginShiftButton.disabled,false);assert.equal(elements.loginShiftButton.textContent,'Sign in');
  c.unlockTerminalSession();const auth=calls.at(-1);
  assert.equal(auth.method,'verifyEmployee');assert.equal(elements.loginShiftButton.innerHTML,'Logging in…');
  setup.failure({message:'Setup unavailable'});await new Promise(setImmediate);
  assert.equal(elements.loginShiftButton.disabled,true);assert.equal(elements.loginShiftButton.innerHTML,'Logging in…');
  auth.failure({message:'Incorrect password'});
  assert.equal(elements.loginShiftButton.disabled,false);assert.equal(elements.loginShiftButton.textContent,'Sign in');
  c.changeLoginMode('CASHIER');assert.equal(elements.loginShiftButton.disabled,true);assert.equal(elements.loginShiftButton.textContent,'Start cashier shift');
  c.changeLoginMode('STAFF');assert.equal(elements.loginShiftButton.disabled,false);assert.equal(elements.loginShiftButton.textContent,'Sign in');
});

test('only cashier shift waits for setup; late setup cannot reenable a submitted normal login',async()=>{
  const {c,elements,calls}=loginClient();
  c.initializeLogin();const setup=calls.at(-1);
  elements.cashierSelect.value='anacashier2@ys.sys';elements.cashierPin.value='2222';
  c.changeLoginMode('CASHIER');elements.confirmPettyHandover.checked=true;c.updateLoginReady();
  assert.equal(elements.loginShiftButton.disabled,true);assert.equal(elements.loginShiftButton.textContent,'Start cashier shift');
  c.changeLoginMode('STAFF');c.unlockTerminalSession();
  setup.success({employees:[{fullName:'Ana Cashier',username:'anacashier2@ys.sys'}],petty:{success:true,received:1800,holder:''}});
  await new Promise(setImmediate);
  assert.equal(elements.loginShiftButton.disabled,true);assert.equal(elements.loginShiftButton.innerHTML,'Logging in…');
  const count=calls.length;c.unlockTerminalSession();assert.equal(calls.length,count);
});

test('login loads handovers without the removed hint element, blocks another holder, and sends the confirmed version',async()=>{
  const {c,elements,calls}=loginClient();
  const employees=[{fullName:'Ana Cashier',username:'anacashier2@ys.sys'},{fullName:'Bea Cashier',username:'beacashier2@ys.sys'}];
  c.initializeLogin();calls.at(-1).success({employees,petty:{success:true,received:1800,previousReportId:'R1',previousEmployee:'Bea Cashier',previousCountedAt:'12:00 PM',version:'PH-1',holder:'Bea Cashier'}});
  await new Promise(setImmediate);
  assert.equal(c.phase10PettyLoaded,true);assert.equal(elements.pettyLoadingSpinner.style.display,'none');
  assert.equal(elements.loginShiftButton.disabled,true);
  elements.cashierSelect.value=' ANACASHIER2@YS.SYS ';elements.cashierPin.value='2222';c.updateLoginReady();
  assert.equal(elements.loginShiftButton.disabled,false);c.unlockTerminalSession();
  assert.equal(calls.at(-1).method,'verifyEmployee');assert.equal(calls.at(-1).args[0],'anacashier2@ys.sys');
  const normalAttempt=calls.at(-1),count=calls.length;
  c.updateLoginReady();c.unlockTerminalSession();assert.equal(calls.length,count);assert.equal(elements.loginShiftButton.disabled,true);
  normalAttempt.failure({message:'Incorrect username or password.'});
  elements.cashierSelect.value='anacashier2@ys.sys';elements.cashierPin.value='2222';c.changeLoginMode('CASHIER');
  elements.confirmPettyHandover.checked=true;c.updateLoginReady();assert.equal(elements.loginShiftButton.disabled,true);
  elements.cashierSelect.value=' BEACASHIER2@ys.sys ';c.updateLoginReady();assert.equal(elements.loginShiftButton.disabled,false);
  elements.cashierSelect.value=' ANACASHIER2@ys.sys ';
  c.reloadLoginPettyHandover();calls.at(-1).success({employees,petty:{success:true,received:1800,previousReportId:'R1',previousEmployee:'Bea Cashier',previousCountedAt:'12:00 PM',version:'PH-2',holder:''}});
  await new Promise(setImmediate);
  elements.confirmPettyHandover.checked=true;c.updateLoginReady();assert.equal(elements.loginShiftButton.disabled,false);
  c.unlockTerminalSession();assert.equal(calls.at(-1).method,'loginAndStartShift');assert.equal(calls.at(-1).args[3],'PH-2');
  assert.equal(calls.at(-1).args[0],'anacashier2@ys.sys');
  assert.equal(elements.loginShiftButton.disabled,true);assert.equal(elements.loginShiftButton.textContent,'Start cashier shift');
  c.updateLoginReady();assert.equal(elements.loginShiftButton.disabled,true);assert.equal(elements.loginShiftButton.textContent,'Start cashier shift');
});

test('a missing username access number explains the disabled shift button, and correcting it enables the current holder',async()=>{
  const {c,elements,calls}=loginClient();
  c.initializeLogin();calls.at(-1).success({employees:[{fullName:'Mica Tambalong',username:'micatambalong1@ys.sys'}],
    petty:{success:true,received:1200,previousEmployee:'Mica Tambalong',previousCountedAt:'9:36 PM',previousReportId:'CR-today',holder:'Mica Tambalong',version:'PH-current'}});
  await new Promise(setImmediate);
  elements.cashierSelect.value='micatambalong@ys.sys';elements.cashierPin.value='password';
  c.changeLoginMode('CASHIER');elements.confirmPettyHandover.checked=true;c.updateLoginReady();
  assert.equal(elements.loginShiftButton.disabled,true);assert.equal(elements.loginShiftBlockedReason.hidden,false);
  assert.match(elements.loginShiftBlockedReason.textContent,/access number/);
  elements.cashierSelect.value='micatambalong1@ys.sys';c.updateLoginReady();
  assert.equal(elements.loginShiftButton.disabled,false);assert.equal(elements.loginShiftBlockedReason.hidden,true);
  c.unlockTerminalSession();assert.equal(calls.at(-1).method,'loginAndStartShift');assert.equal(calls.at(-1).args[0],'micatambalong1@ys.sys');
});
