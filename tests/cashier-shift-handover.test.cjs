const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');

function harness() {
  const clock = {now: '2026-10-30T01:00:00Z'};
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.now])); } }
  const sheets = new Map(), cache = new Map();
  let locked = false, failCloseWrite = false, failReopenWrite = false;
  function sheet(name, rows) {
    return {rows, getLastRow: () => rows.length,
      getDataRange: () => ({getValues: () => rows.map(row => row.slice())}),
      getRange(r, c, h = 1, w = 1) { return {
        getValues: () => Array.from({length:h}, (_, i) => Array.from({length:w}, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? '')),
        setValues(values) {
          if (name === 'Cash Report Log' && failCloseWrite && values[0][35] === 'CLOSED') {
            failCloseWrite = false; throw new Error('Simulated report write failure');
          }
          if (name === 'Cash Report Log' && failReopenWrite && rows[r-1]?.[35] === 'CLOSED' && values[0][35] === 'OPEN') {
            failReopenWrite = false; throw new Error('Simulated reopen write failure');
          }
          for (let i = 0; i < h; i++) {
            rows[r - 1 + i] ||= [];
            for (let j = 0; j < w; j++) {
              const value = values[i][j];
              rows[r - 1 + i][c - 1 + j] = typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value;
            }
          }
        }
      }; }
    };
  }
  const reports = [Array(37).fill('')], sales = [Array(21).fill('')];
  const initial = Array(37).fill('');
  initial[0]='INITIAL-PETTY'; initial[1]=new ClockDate('2026-10-29T00:00:00Z');
  initial[2]='INITIAL PETTY'; initial[4]='SYSTEM'; initial[31]=1870; initial[35]='CLOSED'; initial[36]=initial[1];
  reports.push(initial);
  sheets.set('Cash Report Log', sheet('Cash Report Log', reports));
  sheets.set('Sales Log', sheet('Sales Log', sales));
  sheets.set('Employees', sheet('Employees', [Array(7).fill(''),
    ['a','Ana','Cashier','2222','Cashier',2,true], ['b','Bea','Cashier','3333','Cashier',2,true],
    ['m','Mia','Manager','1234','Manager',1,true]]));
  const c = vm.createContext({console, Date:ClockDate, Set, Map,
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:name=>sheets.get(name),insertSheet(name){assert.equal(locked,true);const created=sheet(name,[]);sheets.set(name,created);return created;}}),flush(){}},
    LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},
    CacheService:{getScriptCache:()=>({put:(key,value)=>cache.set(key,value),get:key=>cache.get(key),remove:key=>cache.delete(key)})},
    Session:{getScriptTimeZone:()=> 'Asia/Manila'},
    Utilities:{getUuid:randomUUID,formatDate(date,tz,pattern){
      const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(date)).map(part=>[part.type,part.value]));
      const day=p.year+'-'+p.month+'-'+p.day;
      if(pattern==='yyyyMMdd')return day.replaceAll('-','');
      if(pattern==='yyyy-MM-dd')return day;
      if(pattern==='h:mm a')return Number(p.hour)%12+':'+p.minute+' '+(Number(p.hour)<12?'AM':'PM');
      return day+'T'+p.hour+':'+p.minute+':'+p.second;
    }},
    toProperCase:value=>value,
  });
  for(const file of ['Constants','Utils','ReportHelpers','Dashboard','Employee','Report','CashierShift'])
    vm.runInContext(fs.readFileSync('Backend/'+file+'.js','utf8'),c);
  reports.length=0;c.cashReportSheet_();reports.push(initial);
  const realPdf=c.buildClosedCashierPdf_;
  c.buildClosedCashierPdf_=()=>({success:true,downloadUrl:'https://example.test/report.pdf'});
  function login(name='Ana Cashier',pin='2222') {
    const source=c.getLatestPettyHandover();
    const response=c.loginAndStartShift(name,pin,source.received,source.version);
    assert.equal(response.success,true,response.message);
    return response;
  }
  function payload(session, action='PAUSE', extra={}) {
    const context=c.getCashierShiftContext(session.employee.dashboardToken,session.shift.reportId);
    return {token:session.employee.dashboardToken,reportId:session.shift.reportId,receiveId:context.receiveId,
      requestId:'exit_'+randomUUID(),action,pettyBreakdown:{1000:1,500:1,200:1,100:1,50:1,20:1},
      cashBreakdown:{},managerCredential:'1234',managerName:'Mia Manager',acknowledged:true,...extra};
  }
  function sale(time, employee, amount) {
    const row=Array(21).fill('');
    row[0]=new ClockDate(time);row[1]=randomUUID();row[2]=employee;row[3]='P1';row[4]='Pin';row[6]='PINS';
    row[7]=1;row[8]=amount;row[12]=amount;row[13]='Cash';row[15]='COMPLETED';row[16]=amount;sales.push(row);
  }
  return {c,clock,reports,sheets,cache,login,payload,sale,realPdf,failClose(){failCloseWrite=true;},failReopen(){failReopenWrite=true;},events:()=>sheets.get('Petty Cash Handovers')?.rows.slice(1)||[]};
}

test('username cashier sign-in records the original employee name and resumes the same report',()=>{
  const h=harness(),{c,reports}=h,source=c.getLatestPettyHandover();
  const ana=c.loginAndStartShift('ANACASHIER2@YS.SYS','2222',source.received,source.version);
  assert.equal(ana.success,true);assert.equal(ana.employee.fullName,'Ana Cashier');
  assert.equal(reports[2][4],'Ana Cashier');assert.equal(c.getLatestPettyHandover().holder,'Ana Cashier');
  assert.equal(ana.shift.hasSavedReport,false);assert.equal(ana.shift.savedReport,null);
  c.saveCashierShiftExit(h.payload(ana));
  const latest=c.getLatestPettyHandover();
  const resumed=c.loginAndStartShift('anacashier2@ys.sys','2222',latest.received,latest.version);
  assert.equal(resumed.success,true);assert.equal(resumed.shift.reportId,ana.shift.reportId);
  assert.equal(reports.length,3);
});

test('pause hands over only petty cash; another cashier receives it; resume retains report and reconciles each segment',()=>{
  const h=harness(), {c,clock,reports}=h;
  h.sale('2026-10-30T00:30:00Z','Ana Cashier',99);
  const ana=h.login();
  assert.throws(()=>c.startManagedCashierShift_('Bea Cashier',1870,c.getLatestPettyHandover().version),/still with Ana/);
  h.sale('2026-10-30T01:30:00Z','Ana Cashier',300);
  clock.now='2026-10-30T04:00:00Z';
  const pause=h.payload(ana,'PAUSE',{pettyBreakdown:{1000:1,500:1,100:3},voucherNo:'PCV-A',reason:'Supplies'});
  assert.equal(c.saveCashierShiftExit(pause).status,'PAUSED');
  // The pause response is returned only after the handover is recorded in Sheets.
  const savedPause=h.events().at(-1);
  assert.equal(savedPause[1].toISOString(),clock.now.replace('Z','.000Z'));
  assert.equal(savedPause[2],ana.shift.reportId);assert.equal(savedPause[3],'Ana Cashier');
  assert.equal(savedPause[4],'PAUSE');assert.equal(savedPause[5],1870);
  assert.equal(savedPause[6],1800);assert.equal(savedPause[7],-70);
  assert.equal(JSON.parse(savedPause[8])['100'],3);
  assert.equal(savedPause[9],'PCV-A');assert.equal(savedPause[10],'Supplies');
  const count=h.events().length;
  c.saveCashierShiftExit(pause);assert.equal(h.events().length,count);
  assert.equal(reports[2][35],'OPEN');assert.equal(reports[2][18],'');
  assert.equal(c.getCashierShiftContext(ana.employee.dashboardToken,ana.shift.reportId).status,'PAUSED');
  assert.equal(c.getLatestPettyHandover().received,1800);
  clock.now='2026-10-30T04:01:00Z';
  const bea=h.login('Bea Cashier','3333');assert.equal(bea.shift.pettyReceived,1800);
  h.sale('2026-10-30T05:00:00Z','Bea Cashier',500);
  clock.now='2026-10-30T10:00:00Z';
  c.saveCashierShiftExit(h.payload(bea,'PAUSE',{pettyBreakdown:{1000:1,500:1,200:1,50:1},voucherNo:'PCV-B',reason:'Transport'}));
  const resumed=h.login();assert.equal(resumed.shift.reportId,ana.shift.reportId);assert.equal(resumed.shift.pettyReceived,1750);
  assert.equal(c.getCashierShiftContext(resumed.employee.dashboardToken,resumed.shift.reportId).pettyBreakdown,null);
  assert.throws(()=>c.saveCashierShiftExit({...pause,token:resumed.employee.dashboardToken,requestId:'another_request'}),/custody changed/);
  h.sale('2026-10-30T10:30:00Z','Ana Cashier',400);
  clock.now='2026-10-30T11:00:00Z';
  const end=c.saveCashierShiftExit(h.payload(resumed,'END',{pettyBreakdown:{1000:1,500:1,200:1,50:1},cashBreakdown:{500:1,200:1}}));
  assert.equal(end.status,'CLOSED');assert.equal(reports[2][8],700);assert.equal(reports[2][18],700);assert.equal(reports[2][19],0);
  assert.equal(reports[2][21],3620);assert.equal(reports[2][31],3550);assert.equal(reports[2][32],-70);
  assert.equal(c.getLatestPettyHandover().received,1750);
  assert.equal(c.getLatestPettyHandover().holder,'');
  assert.equal(reports[2][34],'Supplies');
  let rendered;
  c.buildCashierReportHTML=data=>{rendered=data;return '<p>Report</p>';};
  c.createPdfFromHtml=()=>({success:true,downloadUrl:'https://example.test/regenerated.pdf'});
  assert.equal(h.realPdf(c.getClosedCashReport(end.reportId).report).success,true);
  assert.equal(rendered.expectedCashDrawer,700);assert.equal(rendered.pettyReturnedTotal,3550);
  clock.now='2026-10-30T12:00:00Z';
  const rowCount=reports.length,originalStart=reports[2][6];
  const second=h.login();assert.equal(second.shift.reportId,ana.shift.reportId);
  assert.equal(second.shift.pettyBreakdown[1000],1);assert.equal(second.shift.savedReport.cashCounted,700);
  assert.equal(reports.length,rowCount);assert.equal(reports[2][35],'OPEN');
  assert.equal(reports[2][7],'');assert.equal(reports[2][6],originalStart);
  assert.equal(reports[2][18],700);
  const todayReport=c.getCashReportByDate('Ana Cashier','2026-10-30');
  assert.equal(todayReport.found,true);assert.equal(todayReport.report.reportId,ana.shift.reportId);
  assert.equal(todayReport.report.cashCounted,700);assert.equal(todayReport.report.status,'OPEN');
  const loaded=c.getCashierShiftContext(second.employee.dashboardToken,second.shift.reportId);
  assert.equal(loaded.cashBreakdown[500],1);
  assert.equal(loaded.savedReport.manager,'Mia Manager');assert.equal(loaded.savedReport.pettyRemark,'Supplies');
  assert.equal(loaded.hasSavedReport,true);assert.equal(loaded.savedReport.pettyReturned,3550);
  assert.equal(loaded.pettyBreakdown[1000],1);assert.equal(loaded.pettyBreakdown[200],1);
  assert.equal(Object.entries(loaded.pettyBreakdown).reduce((total,[d,count])=>total+Number(d)*count,0),1750);
  h.sale('2026-10-30T12:10:00Z','Ana Cashier',200);
  clock.now='2026-10-30T12:30:00Z';
  c.saveCashierShiftExit(h.payload(second,'END',{pettyBreakdown:{1000:1,500:1,200:1,50:1},cashBreakdown:{500:1,200:2}}));
  assert.equal(reports[2][8],900);assert.equal(reports[2][18],900);assert.equal(reports[2][19],0);
  assert.equal(reports[2][21],5370);assert.equal(reports[2][31],5300);assert.equal(reports[2][32],-70);
  assert.equal(reports.length,rowCount);
  const third=h.login();assert.equal(third.shift.reportId,ana.shift.reportId);
  assert.equal(reports[2][18],900);assert.equal(reports[2][35],'OPEN');
  assert.equal(h.login().shift.reportId,ana.shift.reportId);assert.equal(reports[2][35],'OPEN');
});

test('same-day reopening respects current petty custody and old close retries cannot close a reopened report',()=>{
  const h=harness(),ana=h.login(),{c,reports,clock}=h;
  const ended=h.payload(ana,'END');c.saveCashierShiftExit(ended);
  const bea=h.login('Bea Cashier','3333');
  const held=c.getLatestPettyHandover();
  const blocked=c.loginAndStartShift('Ana Cashier','2222',held.received,held.version);
  assert.equal(blocked.success,false);assert.match(blocked.message,/still with/);
  assert.equal(reports[2][35],'CLOSED');
  c.saveCashierShiftExit(h.payload(bea));
  const reopened=h.login();assert.equal(reopened.shift.reportId,ana.shift.reportId);
  assert.throws(()=>c.saveCashierShiftExit(ended),/reopened or resumed/);
  assert.equal(reports[2][35],'OPEN');
  c.saveCashierShiftExit(h.payload(reopened,'END'));
  clock.now='2026-10-30T17:00:00Z';
  const nextDay=h.login();assert.notEqual(nextDay.shift.reportId,ana.shift.reportId);
  assert.equal(reports[2][35],'CLOSED');assert.equal(reports.at(-1)[3],'2026-10-31');
});

test('retry after an interrupted reopen repairs the same row and does not replay an earlier END snapshot',()=>{
  const h=harness(),ana=h.login(),{c,reports}=h;
  c.saveCashierShiftExit(h.payload(ana,'END',{cashBreakdown:{1000:1}}));
  h.failReopen();
  const source=c.getLatestPettyHandover();
  const failed=c.loginAndStartShift('Ana Cashier','2222',source.received,source.version);
  assert.equal(failed.success,false);assert.match(failed.message,/reopen write failure/);
  assert.equal(reports[2][35],'CLOSED');const count=h.events().length;
  const retry=h.login();
  assert.equal(retry.shift.reportId,ana.shift.reportId);assert.equal(reports[2][35],'OPEN');
  assert.equal(reports[2][18],1000);assert.equal(h.events().length,count);
  assert.equal(h.login().shift.reportId,ana.shift.reportId);assert.equal(reports[2][35],'OPEN');
});

test('a same-day legacy closed report keeps its prior petty totals and vouchers on reopening',()=>{
  const h=harness(),{c,reports}=h,legacy=Array(37).fill('');
  legacy[0]='CR-20261030-legacy';legacy[1]=new Date('2026-10-30T00:00:00Z');
  legacy[2]='CASHIER SHIFT';legacy[3]='2026-10-30';legacy[4]='Ana Cashier';
  legacy[6]=legacy[1];legacy[7]=new Date('2026-10-30T00:30:00Z');legacy[21]=1200;
  legacy[22]=1;legacy[31]=1000;legacy[32]=-200;legacy[33]='PCV-OLD';legacy[34]='Earlier expense';
  legacy[35]='CLOSED';legacy[36]=legacy[7];reports.push(legacy);
  const ana=h.login();assert.equal(ana.shift.reportId,legacy[0]);assert.equal(ana.shift.pettyReceived,1000);
  assert.equal(ana.shift.pettyVoucherNo,'');assert.equal(ana.shift.pettyRemark,'');
  c.saveCashierShiftExit(h.payload(ana,'END',{pettyBreakdown:{1000:1}}));
  assert.equal(reports[2][21],2200);assert.equal(reports[2][31],2000);assert.equal(reports[2][32],-200);
  assert.equal(reports[2][33],'PCV-OLD');assert.match(reports[2][34],/Earlier expense/);
});

test('ownership, manager verification, voucher requirements, whole counts and stale confirmations are enforced before writes',()=>{
  const h=harness(),{c}=h,ana=h.login(), valid=h.payload(ana);
  const before=h.events().length;
  for(const change of [
    {token:'forged'}, {pettyBreakdown:{1000:-1}}, {pettyBreakdown:{1000:1.5}},
    {pettyBreakdown:{1000:1}}, {action:'END',managerCredential:'wrong'}, {receiveId:'stale'},
    {action:'END',acknowledged:false},
  ]) assert.throws(()=>c.saveCashierShiftExit({...valid,...change}));
  const bea=c.verifyEmployee('Bea Cashier','3333');
  assert.throws(()=>c.saveCashierShiftExit({...valid,token:bea.dashboardToken}),/No active cashier shift/);
  assert.equal(h.events().length,before);
  const staleVersion=c.getLatestPettyHandover().version;
  c.saveCashierShiftExit(valid);
  assert.throws(()=>c.startManagedCashierShift_('Bea Cashier',1870,staleVersion),/handover changed/);
});

test('end shift lists active managers and requires authorization for the selected manager',()=>{
  const h=harness(),ana=h.login(),{c}=h;
  h.sheets.get('Employees').rows.push(['n','Nia','Manager','1234','Manager',1,true],['x','Inactive','Manager','5555','Manager',1,false]);
  const context=c.getCashierShiftContext(ana.employee.dashboardToken,ana.shift.reportId);
  assert.deepEqual(Array.from(context.managers),['Mia Manager','Nia Manager']);
  const payload=h.payload(ana,'END'),before=h.events().length;
  assert.throws(()=>c.saveCashierShiftExit({...payload,managerName:''}),/Select a verifying manager/);
  assert.throws(()=>c.saveCashierShiftExit({...payload,managerName:'Ana Cashier'}),/Invalid Manager PIN/);
  assert.throws(()=>c.saveCashierShiftExit({...payload,managerName:'Inactive Manager',managerCredential:'5555'}),/Invalid Manager PIN/);
  const mia=c.verifyEmployee('Mia Manager','1234');
  assert.throws(()=>c.saveCashierShiftExit({...payload,managerName:'Nia Manager',managerCredential:{managerToken:mia.inventoryManagerToken}}),/match the selected manager/);
  assert.equal(h.events().length,before);
  assert.equal(c.saveCashierShiftExit({...payload,managerName:'Nia Manager'}).success,true);
  assert.equal(h.reports[2][5],'Nia Manager');
});

test('END retry repairs a partial report write without duplicating handover or rolling back a later correction',()=>{
  const h=harness(),{c,reports}=h,ana=h.login(),end=h.payload(ana,'END');
  h.failClose();assert.throws(()=>c.saveCashierShiftExit(end),/write failure/);
  assert.equal(reports[2][35],'OPEN');assert.equal(h.events().at(-1)[4],'END');
  assert.equal(c.getCashierShiftContext(ana.employee.dashboardToken,ana.shift.reportId).status,'CLOSED');
  assert.equal(reports[2][35],'CLOSED');
  const count=h.events().length;
  const saved=c.saveCashierShiftExit(end);assert.equal(saved.success,true);assert.equal(reports[2][35],'CLOSED');
  assert.equal(h.events().length,count);
  reports[2][20]='Manager corrected remark';
  c.saveCashierShiftExit(end);assert.equal(reports[2][20],'Manager corrected remark');
});

test('saving ends the shift without generating a PDF; optional print failure keeps the saved report',()=>{
  const h=harness(),{c,clock,reports}=h,ana=h.login();
  c.saveCashierShiftExit(h.payload(ana));
  clock.now='2026-10-30T16:30:00Z';
  const resumed=h.login();assert.equal(resumed.shift.reportId,ana.shift.reportId);
  c.buildClosedCashierPdf_=()=>{throw new Error('PDF offline');};
  const result=c.saveCashierShiftExit(h.payload(resumed,'END'));
  assert.equal(result.success,true);assert.equal(result.downloadUrl,undefined);assert.equal(reports[2][35],'CLOSED');
  assert.throws(()=>c.printEndedCashierShiftReport(resumed.employee.dashboardToken,result.reportId),/PDF offline/);
  assert.equal(reports[2][35],'CLOSED');
});

test('printed draft restores mismatched petty counts and voucher for its current receipt without handing over cash',()=>{
  const h=harness(),{c,reports,clock}=h,ana=h.login();
  clock.now='2026-10-30T02:00:00Z';
  c.saveOpenCashierShiftPreview_(c.findOpenShift_('Ana Cashier'),'Mia Manager',
    {returnBreakdown:{1000:1,500:1,100:3},voucherNo:'PCV-82',reason:'Supplies'}, {breakdown:{500:2}},1000,'Count checked');
  const ctx=c.getCashierShiftContext(ana.employee.dashboardToken,ana.shift.reportId);
  assert.equal(ctx.status,'OPEN');assert.equal(ctx.pettyBreakdown[100],3);
  assert.equal(ctx.pettyVoucherNo,'PCV-82');assert.equal(ctx.pettyRemark,'Supplies');
  assert.equal(ctx.savedReport.cashCounted,1000);
  assert.equal(c.getLatestPettyHandover().holder,'Ana Cashier');
  assert.equal(c.getLatestPettyHandover().received,1870);
  assert.equal(ctx.receiveId,h.events()[0][0]);assert.equal(h.events().at(-1)[4],'REPORT_SAVED');
  const saved=c.saveCashierShiftExit(h.payload(ana,'END',{pettyBreakdown:ctx.pettyBreakdown,
    voucherNo:ctx.pettyVoucherNo,reason:ctx.pettyRemark,cashBreakdown:{500:2}}));
  assert.equal(saved.status,'CLOSED');assert.equal(reports[2][21],1870);assert.equal(reports[2][31],1800);
  assert.equal(reports[2][33],'PCV-82');
  const snapshot=JSON.parse(h.events().at(-1)[12]);
  assert.equal(snapshot.acknowledgment.accepted,true);assert.equal(snapshot.acknowledgment.employee,'Ana Cashier');
  assert.match(snapshot.acknowledgment.statement,/true and complete/);
  assert.equal(c.printEndedCashierShiftReport(ana.employee.dashboardToken,saved.reportId).success,true);
  const bea=c.verifyEmployee('Bea Cashier','3333');
  assert.throws(()=>c.printEndedCashierShiftReport(bea.dashboardToken,saved.reportId),/another cashier/);
  const resumed=h.login();
  const reopened=c.getCashierShiftContext(resumed.employee.dashboardToken,resumed.shift.reportId);
  assert.equal(reopened.pettyVoucherNo,'');assert.equal(reopened.pettyRemark,'');
  assert.equal(reopened.pettyBreakdown[100],3);
  assert.throws(()=>c.printEndedCashierShiftReport(resumed.employee.dashboardToken,saved.reportId),/Only CLOSED/);
});

test('old printed snapshots keep their voucher and mismatched counts, and resumed drafts never duplicate earlier returns',()=>{
  const h=harness(),{c,reports}=h,ana=h.login();
  reports[2][18]=1000;reports[2][22]=1;reports[2][25]=3;reports[2][31]=1300;
  reports[2][33]='PCV-OLD';reports[2][34]='Existing draft';
  const legacy=c.getCashierShiftContext(ana.employee.dashboardToken,ana.shift.reportId);
  assert.equal(legacy.pettyBreakdown[100],3);assert.equal(legacy.pettyVoucherNo,'PCV-OLD');
  c.saveCashierShiftExit(h.payload(ana,'PAUSE',{pettyBreakdown:{1000:1,500:1,100:3},voucherNo:'PCV-1',reason:'Earlier supplies'}));
  const resumed=h.login();
  c.saveOpenCashierShiftPreview_(c.findOpenShift_('Ana Cashier'),'Mia Manager',
    {returnBreakdown:{1000:1,500:1,200:1},voucherNo:'PCV-2',reason:'Later supplies'},{breakdown:{}},0,'');
  const ctx=c.getCashierShiftContext(resumed.employee.dashboardToken,resumed.shift.reportId);
  assert.equal(ctx.pettyVoucherNo,'PCV-2');assert.equal(ctx.pettyBreakdown[200],1);
  c.saveCashierShiftExit(h.payload(resumed,'END',{pettyBreakdown:ctx.pettyBreakdown,voucherNo:ctx.pettyVoucherNo,reason:ctx.pettyRemark}));
  assert.equal(reports[2][21],3670);assert.equal(reports[2][31],3500);
  assert.equal(reports[2][33],'PCV-1, PCV-2');
});

test('legacy close cannot bypass the managed shift handover and verification flow',()=>{
  const h=harness(),{c,reports}=h;h.login();
  assert.throws(()=>c.closeCashierShift('Mia Manager','Ana Cashier','2026-10-30',{}, {},''),/Use End shift/);
  assert.equal(reports[2][35],'OPEN');
});

test('an existing handover sheet with incompatible headers is left untouched',()=>{
  const h=harness();
  const rows=[['Other business data']];
  h.sheets.set('Petty Cash Handovers',{getLastRow:()=>1,getRange:()=>({getValues:()=>rows})});
  assert.throws(()=>h.c.getLatestPettyHandover(),/headers do not match/);
  assert.throws(()=>h.c.startManagedCashierShift_('Ana Cashier',1870,'initial'),/headers do not match/);
  assert.equal(h.reports.length,2);assert.deepEqual(rows,[['Other business data']]);
  const setup=h.c.getLoginSetup();assert.equal(setup.employees.length,3);assert.equal(setup.petty.success,false);
});

test('a managed active shift continues across midnight, while the daily close cannot duplicate its sales',()=>{
  const h=harness(),ana=h.login();
  h.clock.now='2026-10-30T16:30:00Z';
  const resumed=h.login();assert.equal(resumed.shift.reportId,ana.shift.reportId);assert.equal(h.events().length,1);
  assert.throws(()=>h.c.closeCashierShift('Mia Manager','Ana Cashier','2026-10-31',{}, {},''),/Use End shift/);
  assert.equal(h.reports.length,3);
});

test('Cashier Shift Report prints and saves the ongoing shift after midnight, then End Shift sees the same entries',()=>{
  const h=harness(),{c,clock,reports}=h,ana=h.login();
  h.sale('2026-10-30T02:00:00Z','Ana Cashier',300);
  clock.now='2026-10-30T17:00:00Z';
  h.sale('2026-10-30T16:30:00Z','Ana Cashier',500);
  const resumed=h.login();assert.equal(resumed.shift.reportId,ana.shift.reportId);
  let rendered;
  c.buildCashierReportHTML=data=>{rendered=data;return '<p>Shift</p>';};
  c.createPdfFromHtml=()=>({success:true,downloadUrl:'https://example.test/shift.pdf'});
  const printed=c.generateCashierShiftReportPDF('Mia Manager','Ana Cashier','2026-10-31',
    {received:1870,returnBreakdown:{1000:1,500:1,100:3},voucherNo:'PCV-midnight',reason:'Supplies'},
    {breakdown:{500:1,100:3}},'Drawer checked');
  assert.equal(printed.success,true,printed.message);
  assert.equal(printed.preview,true);assert.equal(reports.length,3);assert.equal(reports[2][35],'OPEN');
  assert.equal(reports[2][8],800);assert.equal(rendered.expectedCashDrawer,800);
  const context=c.getCashierShiftContext(resumed.employee.dashboardToken,resumed.shift.reportId);
  assert.equal(context.savedReport.cashCounted,800);assert.equal(context.pettyBreakdown[100],3);
  assert.equal(context.pettyVoucherNo,'PCV-midnight');assert.equal(context.pettyRemark,'Supplies');
  assert.equal(context.savedReport.cashRemark,'Drawer checked');
});
