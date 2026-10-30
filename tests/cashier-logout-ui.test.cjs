const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function client() {
  const html=fs.readFileSync('Frontend/Modals/CashierReportModal.html','utf8');
  const elements={},calls=[],timers=[];
  for(const match of html.matchAll(/id="([^"]+)"/g)) elements[match[1]]={style:{},dataset:{},value:'',checked:false,hidden:false,disabled:false,textContent:'',innerHTML:''};
  elements.shiftReportModal.querySelectorAll=()=>Object.values(elements).filter(el=>el!==elements.shiftReportSubmit);
  elements.cashierEndManager.replaceChildren=(...options)=>{elements.cashierEndManager.options=options;};
  elements.cashierEndManager.add=option=>elements.cashierEndManager.options.push(option);
  const c=vm.createContext({console,Date,Intl,Math,
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
  return {c,elements,calls,timers,loaded,count,logouts:()=>logouts,manager:()=>managerPrompt};
}

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
  timers.shift()();
  const initial=calls.at(-1);
  elements.cashierReportDate.value='2026-10-28';c.loadCashReportByDate();
  assert.equal(calls.at(-1).method,initial.method);
  assert.ok(calls.at(-1).args.includes('2026-10-28'));
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
    pettyReceived:1870,managers:['Mia Manager'],cashBreakdown:{500:1,200:1},cashRemark:'Earlier count'});
  assert.equal(elements.d500.value,1);assert.equal(elements.d200.value,1);
  assert.equal(elements.cashDrawerCountTotalOut.textContent,'₱700.00');
  assert.equal(elements.cashDrawerVarianceReason.value,'Earlier count');
  assert.equal(elements.cashierDailyCashHint.hidden,false);assert.match(elements.cashierDailyCashHint.textContent,/700.00/);
  h.count();elements.d200.value='2';elements.cashierEndManager.value='Mia Manager';
  c.submitShiftReportTally();h.manager()('1234');
  assert.equal(calls.at(-1).args[0].reportId,'CR-20261030-001');
  assert.equal(calls.at(-1).args[0].cashBreakdown[500],1);
  assert.equal(calls.at(-1).args[0].cashBreakdown[200],2);
});

test('a dismissed modal ignores late context responses; fractional counts and missing vouchers cannot submit',()=>{
  const h=client(),{c,elements,calls}=h;
  c.chooseCashierLogout('pause');const pending=calls.at(-1);c.toggleShiftReportModal(false);
  pending.success({success:true,status:'CLOSED'});assert.equal(h.logouts(),0);
  h.loaded();h.count();elements.pr1000.value='1.5';c.submitShiftReportTally();
  assert.match(elements.cashierExitError.textContent,/whole numbers/);assert.equal(calls.filter(call=>call.method==='saveCashierShiftExit').length,0);
  elements.pr1000.value='0';c.submitShiftReportTally();assert.match(elements.cashierExitError.textContent,/voucher/);
});

test('login loads handovers without the removed hint element, blocks another holder, and sends the confirmed version',async()=>{
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
  c.initializeLogin();calls.at(-1).success({employees:[{fullName:'Ana Cashier'}],petty:{success:true,received:1800,previousReportId:'R1',previousEmployee:'Bea Cashier',previousCountedAt:'12:00 PM',version:'PH-1',holder:'Bea Cashier'}});
  await new Promise(setImmediate);
  assert.equal(c.phase10PettyLoaded,true);assert.equal(elements.pettyLoadingSpinner.style.display,'none');
  elements.cashierSelect.value='Ana Cashier';elements.cashierPin.value='2222';c.changeLoginMode('CASHIER');
  elements.confirmPettyHandover.checked=true;c.updateLoginReady();assert.equal(elements.loginShiftButton.disabled,true);
  c.reloadLoginPettyHandover();calls.at(-1).success({petty:{success:true,received:1800,previousReportId:'R1',previousEmployee:'Bea Cashier',previousCountedAt:'12:00 PM',version:'PH-2',holder:''}});
  await new Promise(setImmediate);
  elements.confirmPettyHandover.checked=true;c.updateLoginReady();assert.equal(elements.loginShiftButton.disabled,false);
  c.unlockTerminalSession();assert.equal(calls.at(-1).method,'loginAndStartShift');assert.equal(calls.at(-1).args[3],'PH-2');
});
