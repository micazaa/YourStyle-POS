const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const clean = value => JSON.parse(JSON.stringify(value));
function sale({date='2026-11-20T02:00:00Z',receipt='R1',cashier='Ana Cashier',net=100,charged=0,absorbed=0,method='Cash',parts=[],reason='',status='COMPLETED'}={}) {
  const row=Array(34).fill('');
  Object.assign(row,{0:date,1:receipt,2:cashier,3:'PIN1',4:'Yellow',6:'PINS',7:1,8:100,10:charged,11:absorbed,12:net,13:method,15:status,19:reason});
  parts.forEach((part,index)=>{row[28+index*3]=part[0];row[29+index*3]=part[1];});
  return row;
}
function harness(rows,shifts=[]) {
  const header=Array(34).fill('');header[15]='Status';
  const cache=new Map(),reads={sales:0,shifts:0};
  const c=vm.createContext({console,Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-11-20T14:00:00Z']));}},
    ACCESS_REQUEST_CONTEXT_:{actor:{manager:true,name:'Mia <Manager>'}},assertAppRequest_(){if(!c.ACCESS_REQUEST_CONTEXT_)throw Error('Sign in');},isDashboardEnabled_:()=>true,
    Session:{getScriptTimeZone:()=> 'Asia/Manila'},
    Utilities:{getUuid:()=>String(cache.size),parseDate:date=>new Date(date+'T00:00:00+08:00'),formatDate(date,zone,format){
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'numeric',minute:'2-digit',hour12:true}).formatToParts(date).map(part=>[part.type,part.value]));
      if(format==='yyyy-MM-dd')return `${parts.year}-${parts.month}-${parts.day}`;
      if(format==='HH')return String(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(date));
      if(format==='h:mm a')return `${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
      return `${parts.month}/${parts.day}/${parts.year}`;
    }},
    inventoryReadVersion_:()=> 'collections-v1',inventoryListIndex_:()=>[],
    inventoryResponseCacheKey_:(version,kind,query)=>JSON.stringify([version,kind,c.ACCESS_REQUEST_CONTEXT_.actor.manager,query]),
    CacheService:{getScriptCache:()=>({get:key=>cache.get(key),put:(key,value)=>cache.set(key,value),getAll:keys=>Object.fromEntries(keys.map(key=>[key,cache.get(key)])),putAll:entries=>Object.entries(entries).forEach(([key,value])=>cache.set(key,value))})},
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:name=>({
      getRange:()=>({getDisplayValues:()=>[header]}),
      getDataRange:()=>({getValues(){if(name==='Cash Report Log'){reads.shifts++;return [[],...shifts];}reads.sales++;return [header,...rows];}})
    })})},toProperCase:String});
  for(const file of ['Constants','Utils','Reservations','ReportHelpers','Dashboard','DeliveryReceiptReport'])vm.runInContext(fs.readFileSync('Backend/'+file+'.js','utf8'),c);
  return {c,cache,reads};
}
function shift(cashier,start,end='') {
  const row=Array(38).fill('');Object.assign(row,{2:'CASHIER SHIFT',4:cashier,6:start,7:end});return row;
}
const range={start:'2026-11-19',end:'2026-11-20'};

test('expected daily collections reconcile by payment and recorded cashier shifts, including split fees and refunds',()=>{
  const {c,reads}=harness([
    sale({receipt:'CASH',net:100}),
    sale({receipt:'SPLIT',net:48.4,absorbed:1.6,parts:[['Cash',40],['Credit Card',60]]}),
    sale({receipt:'SPLIT',net:49.68,absorbed:.32,parts:[['Cash',40],['Credit Card',60]]}),
    sale({receipt:'QR',cashier:'Bea <Cashier>',date:'2026-11-20T10:00:00Z',method:'QR Code',net:200,charged:2}),
    sale({receipt:'CHARGED',method:'Credit Card',net:100,charged:3.2}),
    sale({receipt:'REFUND',net:-20}),
    sale({receipt:'VOID',status:'VOIDED',net:999}),
    sale({date:'2026-11-19T15:59:59Z',receipt:'PRIOR',net:10}),
    sale({date:'2026-11-19T16:00:00Z',receipt:'MIDNIGHT',net:5,cashier:'Legacy Cashier'}),
  ],[
    shift('Ana Cashier','2026-11-20T01:00:00Z','2026-11-20T07:00:00Z'),
    shift('Bea <Cashier>','2026-11-20T07:00:00Z'),
  ]);
  const result=c.getDashboardSales(range);
  assert.deepEqual(clean(result.collections.days.map(day=>day.date)),['2026-11-19','2026-11-20']);
  const [prior,today]=clean(result.collections.days);
  assert.equal(today.total,490.2);assert.equal(prior.total,10);assert.equal(result.collections.total,500.2);
  assert.deepEqual(today.payments,[{name:'Cash',amount:125},{name:'Credit card',amount:163.2},{name:'QR Code',amount:202}]);
  assert.deepEqual(today.cashiers,[{name:'Ana Cashier',shift:'9:00 AM – 3:00 PM',amount:283.2},{name:'Bea <Cashier>',shift:'3:00 PM – Ongoing',amount:202},{name:'Legacy Cashier',shift:'Shift not recorded',amount:5}]);
  for(const day of result.collections.days) {
    for(const key of ['payments','cashiers'])assert.equal(Math.round(day[key].reduce((sum,item)=>sum+item.amount,0)*100),Math.round(day.total*100));
  }
  c.getDashboardSales({start:'2026-11-20',end:'2026-11-20'});
  assert.deepEqual(reads,{sales:1,shifts:1},'Changing dates uses the same cached sales and shift snapshot');
});

test('reservation payment stages and cross-date exchanges belong to the same day/cashier as existing reports',()=>{
  const {c}=harness([
    sale({date:'2026-11-18T02:00:00Z',receipt:'RES',reason:'RESERVATION DEPOSIT',net:50,parts:[['Cash',20],['GCash',30]]}),
    sale({receipt:'RES',reason:'RESERVATION BALANCE',net:100,parts:[['Cash',40],['GCash',60]]}),
    sale({date:'2026-11-19T02:00:00Z',receipt:'EX',reason:'EXCHANGE RETURN',net:-80,parts:[['Cash',10],['GCash',10]]}),
    sale({receipt:'EX',cashier:'Bea Cashier',reason:'EXCHANGE REPLACEMENT',net:100,parts:[['Cash',10],['GCash',10]]}),
  ]);
  const data=c.getDashboardSales({start:'2026-11-18',end:'2026-11-20'});
  assert.deepEqual(clean(data.collections.days.map(day=>[day.date,day.total])),[['2026-11-18',50],['2026-11-19',0],['2026-11-20',120]]);
  assert.deepEqual(clean(data.collections.days[2].cashiers.map(row=>[row.name,row.amount])),[['Ana Cashier',100],['Bea Cashier',20]]);
});

test('repeated cashier names keep separate real shifts and empty dates stay visible',()=>{
  const {c}=harness([sale(),sale({date:'2026-11-20T10:00:00Z',receipt:'R2',net:20})],[
    shift('Ana Cashier','2026-11-20T01:00:00Z','2026-11-20T07:00:00Z'),
    shift('Ana Cashier','2026-11-20T08:00:00Z','2026-11-20T14:00:00Z'),
  ]);
  const {days}=c.getDashboardSales(range).collections;
  assert.equal(days[1].cashiers.length,2);assert.notEqual(days[1].cashiers[0].shift,days[1].cashiers[1].shift);
  assert.equal(days[0].total,0);assert.equal(days[0].payments.length,0);
});

test('download includes all dates and the requested details, escapes names and rejects unsupported modes',()=>{
  const {c,reads}=harness([sale({cashier:'Ana <script>',net:123.45}),sale({date:'2026-11-19T02:00:00Z',receipt:'R2',net:20})]);
  const html=[];c.Utilities.newBlob=value=>{html.push(value);return {getAs:()=>({getBytes:()=>[1]})};};c.Utilities.base64Encode=()=> 'PDF';
  c.getDashboardSales(range);
  const result=c.createDashboardNetSalesPdf({...range,breakdown:'cashiers'});
  assert.equal(result.fileName,'Sales_Report_Summary_2026-11-19_to_2026-11-20.pdf');
  assert.match(html[0],/SALES REPORT SUMMARY/);assert.match(html[0],/<th bgcolor="#f2dede">Date<\/th><th bgcolor="#f2dede">Cashier<\/th><th bgcolor="#f2dede">Sales<\/th>/);assert.match(html[0],/Ana &lt;script&gt;/);
  assert.match(html[0],/November 19, 2026/);assert(html[0].indexOf('Nov 19<small>')<html[0].indexOf('Nov 20<small>'));assert.equal((html[0].match(/Daily total/g)||[]).length,2);
  assert.match(html[0],/GRAND TOTAL<\/th><td bgcolor="#f2dede">₱143.45/);assert.doesNotMatch(html[0],/<script>|Shift 1|driver|Expected collection/);
  assert.match(html[0],/class="day" scope="rowgroup" rowspan="2"/);
  assert.match(html[0],/Mia &lt;Manager&gt;<\/div><div class="sign-label">Prepared by/);
  c.createDashboardNetSalesPdf({...range,breakdown:'payments'});assert.match(html[1],/<th bgcolor="#f2dede">Date<\/th><th bgcolor="#f2dede">Payment method<\/th><th bgcolor="#f2dede">Sales<\/th>/);assert.doesNotMatch(html[1],/Ana &lt;script/);
  assert.throws(()=>c.createDashboardNetSalesPdf({...range,breakdown:'<script>'}),/breakdown/);
  c.ACCESS_REQUEST_CONTEXT_.actor.name='Bea Account';
  c.createDashboardNetSalesPdf({...range,preparedBy:'Forged name'});
  assert.match(html[2],/Bea Account<\/div><div class="sign-label">Prepared by/);
  assert.doesNotMatch(html[2],/Forged name|Mia &lt;Manager&gt;/);
  assert.deepEqual(reads,{sales:1,shifts:1},'Shared cached totals do not cache the prepared-by identity');
  c.ACCESS_REQUEST_CONTEXT_.actor.manager=false;
  assert.equal(c.createDashboardNetSalesPdf(range).success,false);
  const today={start:'2026-11-20',end:'2026-11-20'};
  const cashierData=c.getDashboardSales(today);
  assert.equal(cashierData.collections.canViewCashiers,false);
  assert.equal(cashierData.collections.days[0].cashiers.length,0,'Other cashier amounts are never sent to a cashier account');
  assert.equal(c.createDashboardNetSalesPdf({...today,breakdown:'cashiers'}).success,false);
  assert.equal(c.createDashboardNetSalesPdf(today).success,true);
  c.ACCESS_REQUEST_CONTEXT_=null;assert.throws(()=>c.createDashboardNetSalesPdf(range),/Sign in/);
});
