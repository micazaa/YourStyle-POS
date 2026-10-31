const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function client() {
  const html=fs.readFileSync('Frontend/Modals/ManagerReportModal.html','utf8');
  const elements={},calls=[],downloads=[];
  for(const [,id] of html.matchAll(/id="([^"]+)"/g))elements[id]={style:{},dataset:{},value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,setAttribute(name,value){this[name]=value;}};
  const c=vm.createContext({console,Date,Math,
    currentEmployee:{fullName:'Mia Manager',dashboardToken:'manager',role:'Manager',accessLevel:1},
    currentManagerExpectedCash:0,PETTY_DENOMS:[1000,500,200,100,50,20,10,5,1],
    getCashReportToday:()=> '2026-10-30',loadingIndicator:label=>label,showNotificationToast(){},
    document:{getElementById:id=>elements[id]},window:{open:url=>downloads.push(url)},
    google:{script:{get run(){const call={};calls.push(call);const runner=new Proxy({}, {get(_target,key){
      if(key==='withSuccessHandler')return fn=>{call.success=fn;return runner;};
      if(key==='withFailureHandler')return fn=>{call.failure=fn;return runner;};
      return (...args)=>{call.method=key;call.args=args;};
    }});return runner;}}}
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],c);
  return {c,elements,calls,downloads};
}

test('manager report shows only loading under its header and blocks duplicate fetches and premature generation',()=>{
  const {c,elements,calls}=client();c.openManagerReportModal();
  assert.equal(elements.managerReportContent.hidden,true);assert.equal(elements.managerReportLoading.hidden,false);
  assert.equal(elements.managerDailyModal['aria-busy'],'true');assert.equal(elements.managerReportSubmit.disabled,true);
  c.openManagerReportModal();c.updateManagerExpectedCash();c.generateManagerDailyReport();assert.equal(calls.length,1);
  calls[0].success({expectedCashDrawer:1500});
  assert.equal(elements.managerReportContent.hidden,false);assert.equal(elements.managerReportLoading.hidden,true);
  assert.equal(elements.managerReportSubmit.disabled,false);assert.equal(elements.managerExpectedCashCountDisplay.textContent,'₱1500.00');
  assert.equal(elements.mgrd1000.value,'');assert.equal(elements.mgrd500.value,'');
});

test('manager date changes ignore stale responses and closing invalidates an outstanding fetch',()=>{
  const {c,elements,calls}=client();c.openManagerReportModal();const first=calls.at(-1);
  elements.managerReportDate.value='2026-10-29';c.updateManagerExpectedCash();const second=calls.at(-1);
  first.success({expectedCashDrawer:9000});assert.equal(elements.managerReportContent.hidden,true);
  second.success({expectedCashDrawer:1200});assert.equal(elements.managerExpectedCashCountDisplay.textContent,'₱1200.00');
  elements.managerReportDate.value='2026-10-28';c.updateManagerExpectedCash();const last=calls.at(-1);
  c.closeManagerReportModal();last.success({expectedCashDrawer:9999});
  assert.equal(elements.managerDailyModal.style.display,'none');assert.equal(c.managerReportExpectedReady,false);
  assert.equal(elements.managerExpectedCashCountDisplay.textContent,'₱1200.00');
});

test('manager fetch failure keeps counts unavailable until a successful retry',()=>{
  const {c,elements,calls}=client();c.openManagerReportModal();calls.at(-1).failure({message:'Read failed'});
  assert.equal(elements.managerReportContent.hidden,true);assert.equal(elements.managerReportLoading.hidden,true);
  assert.equal(elements.managerReportRetry.hidden,false);assert.equal(elements.managerReportError.textContent,'Read failed');
  assert.equal(elements.managerReportSubmit.disabled,true);c.generateManagerDailyReport();assert.equal(calls.length,1);
  c.updateManagerExpectedCash();calls.at(-1).success({expectedCashDrawer:0});
  assert.equal(elements.managerReportContent.hidden,false);assert.equal(elements.managerReportError.hidden,true);
  assert.equal(elements.managerReportSubmit.disabled,false);
});

test('warmed today report opens without a second expected-cash request',()=>{
  const {c,elements,calls}=client();
  c.warmManagerExpectedCash('2026-10-30');
  calls.at(-1).success({expectedCashDrawer:0});
  c.openManagerReportModal();
  assert.equal(calls.length,1);
  assert.equal(elements.managerExpectedCashCountDisplay.textContent,'₱0.00');
  assert.equal(elements.managerReportLoading.hidden,true);
});

test('manager generation hides the body, writes once, and restores entered counts on failure',()=>{
  const {c,elements,calls,downloads}=client();c.openManagerReportModal();calls.at(-1).success({expectedCashDrawer:1500});
  elements.mgrd1000.value='1';elements.mgrd500.value='1';
  c.generateManagerDailyReport();c.generateManagerDailyReport();
  assert.equal(calls.filter(call=>call.method==='generateManagerDailyReportPDF').length,1);
  assert.equal(elements.managerReportContent.hidden,true);assert.equal(elements.managerReportLoading.hidden,false);
  c.closeManagerReportModal();assert.equal(elements.managerDailyModal.style.display,'flex');
  calls.at(-1).failure({message:'PDF unavailable'});assert.equal(elements.managerReportContent.hidden,false);
  assert.equal(elements.mgrd1000.value,'1');assert.equal(elements.managerReportSubmit.disabled,false);
  c.generateManagerDailyReport();calls.at(-1).success({success:true,downloadUrl:'report.pdf'});
  assert.deepEqual(downloads,['report.pdf']);assert.equal(elements.managerDailyModal.style.display,'none');
});
