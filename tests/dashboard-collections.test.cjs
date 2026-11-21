const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const clean = value => JSON.parse(JSON.stringify(value));
function sale({date='2026-11-20T02:00:00Z',receipt='R1',cashier='Ana Cashier',net=100,charged=0,absorbed=0,method='Cash',parts=[],reason='',status='COMPLETED',code='PIN1',name='Yellow',size='',category='PINS',qty=1,price=100,received,change,original}={}) {
  const row=Array(34).fill('');
  Object.assign(row,{0:date,1:receipt,2:cashier,3:code,4:name,5:size,6:category,7:qty,8:price,10:charged,11:absorbed,12:net,13:method,15:status,19:reason});
  if(received!==undefined)row[16]=received;if(change!==undefined)row[17]=change;if(original!==undefined)row[20]=original;
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
    })})},toProperCase:String,normalizeYourFindsSaleSize_:size=>String(size).toUpperCase()});
  for(const file of ['Constants','Utils','Reservations','ReportHelpers','Dashboard','DeliveryReceiptReport'])vm.runInContext(fs.readFileSync('Backend/'+file+'.js','utf8'),c);
  return {c,cache,reads};
}
function shift(cashier,start,end='') {
  const row=Array(38).fill('');Object.assign(row,{2:'CASHIER SHIFT',4:cashier,6:start,7:end});return row;
}
const range={start:'2026-11-19',end:'2026-11-20'};

test('transaction summary counts receipts once, keeps net revenue and deduplicates received/change and split allocations',()=>{
 const {c,reads}=harness([
  sale({net:120,received:500,change:300}),sale({net:80,received:500,change:300}),
  sale({receipt:'SPLIT',net:96.8,absorbed:3.2,received:50,change:10,parts:[['Cash',40],['Credit Card',160]]}),
  sale({receipt:'SPLIT',net:100,received:50,change:10,parts:[['Cash',40],['Credit Card',160]]}),
  sale({receipt:'QR',cashier:'Bea',net:100,charged:1,method:'QR Code',received:0,change:0}),
  sale({receipt:'VOID',status:'VOIDED',net:10000,received:10000,change:0}),
 ]);
 const data=c.getDashboardSales(range),summary=clean(data.transactionSummary);
 assert.equal(summary.transactions,3);assert.equal(summary.sales,data.netSales);assert.equal(summary.average,165.6);
 assert.deepEqual(summary.days.map(d=>d.date),['2026-11-19','2026-11-20']);assert.equal(summary.days[0].transactions,0);
 const ana=summary.days[1].cashiers.find(c=>c.name==='Ana Cashier'),bea=summary.days[1].cashiers.find(c=>c.name==='Bea');
 assert.equal(ana.transactions,2);assert.equal(ana.average,198.4);
 assert.equal(ana.receipts[0].received,500);assert.equal(ana.receipts[0].change,300);assert.equal(ana.receipts[0].sales,200);
 assert.equal(ana.receipts[1].received,210);assert.equal(ana.receipts[1].change,10);assert.equal(ana.receipts[1].sales,196.8);
 assert.equal(bea.receipts[0].received,101);assert.equal(bea.receipts[0].change,0);
 assert.equal(summary.received,811);assert.equal(summary.change,310);
 c.getDashboardSales({start:'2026-11-20',end:'2026-11-20'});assert.deepEqual(reads,{sales:1,shifts:1});
});

test('transaction receipts keep reservation payment events and exchange anchors, including a zero-value exchange',()=>{
 const {c}=harness([
  sale({receipt:'RES',reason:'RESERVATION DEPOSIT',net:20,received:20,change:10,parts:[['Cash',10],['GCash',10]]}),
  sale({receipt:'RES',reason:'RESERVATION BALANCE',net:80,received:30,change:10,parts:[['Cash',20],['GCash',60]]}),
  sale({receipt:'EX-1',date:'2026-11-18T02:00:00Z',cashier:'Old cashier',reason:'EXCHANGE RETURN',net:-1000,received:0,change:0,original:'YS-OLD',qty:-1}),
  sale({receipt:'EX-1',date:'2026-11-20T10:00:00Z',cashier:'Bea',reason:'EXCHANGE REPLACEMENT',net:2800,received:2000,change:200,original:'YS-OLD'}),
  sale({receipt:'EX-2',reason:'EXCHANGE RETURN',net:-100,received:0,change:0,original:'YS-OLD2',qty:-1}),
  sale({receipt:'EX-2',reason:'EXCHANGE REPLACEMENT',net:100,received:0,change:0,original:'YS-OLD2'}),
 ]);
 const data=c.getDashboardSales({start:'2026-11-18',end:'2026-11-20'}),summary=clean(data.transactionSummary);
 assert.deepEqual(summary.days.map(d=>d.transactions),[0,0,3]);assert.equal(summary.sales,1900);assert.equal(summary.transactions,3);
 const receipts=summary.days[2].cashiers.flatMap(c=>c.receipts);
 const res=receipts.find(r=>r.receiptId==='RES');assert.equal(res.received,120);assert.equal(res.change,20);assert.equal(res.sales,100);
 const exchange=receipts.find(r=>r.receiptId==='EX-1');assert.equal(exchange.originalReceiptId,'YS-OLD');assert.equal(exchange.time,'6:00 PM');assert.equal(exchange.received,2000);assert.equal(exchange.change,200);assert.equal(exchange.sales,1800);
 assert(summary.days[2].cashiers.find(c=>c.name==='Bea').receipts.includes(exchange));assert(!JSON.stringify(summary).includes('Old cashier'));
 const even=receipts.find(r=>r.receiptId==='EX-2');assert.equal(even.sales,0);assert.equal(even.received,0);
});

test('transaction PDF uses cached receipts, merged horizontal cashiers, original subtitle, safe identity and access rules',()=>{
 const {c,reads}=harness([
  sale({receipt:'R<1>',cashier:'Ana <script>',net:80,received:100,change:20}),
  sale({receipt:'R2',cashier:'Ana <script>',net:120,received:200,change:80}),
  sale({receipt:'EX',cashier:'Bea',reason:'EXCHANGE RETURN',net:-100,received:0,change:0,original:'OLD<img>',qty:-1}),
  sale({receipt:'EX',cashier:'Bea',reason:'EXCHANGE REPLACEMENT',net:100,received:0,change:0,original:'OLD<img>'}),
 ]);
 let html;c.Utilities.newBlob=value=>{html=value;return {getAs:()=>({getBytes:()=>[1]})};};c.Utilities.base64Encode=()=> 'PDF';
 c.getDashboardSales(range);const result=c.createDashboardTransactionsPdf({...range,preparedBy:'Forged'});
 assert.equal(result.fileName,'Transactions_Report_Summary_2026-11-19_to_2026-11-20.pdf');
 assert.match(html,/TRANSACTIONS REPORT SUMMARY/);assert.match(html,/<th>Cashier<\/th><th>Receipt/);assert.match(html,/writing-mode:horizontal-tb/);assert.doesNotMatch(html,/writing-mode:vertical/);
 assert.match(html,/scope="rowgroup" rowspan="2"><span>Ana &lt;script&gt;<\/span>/);
 assert.match(html,/EX<small class="original">Original: OLD&lt;img&gt;<\/small>/);
 assert.match(html,/3 transactions · Average sale ₱66.67 · Sales ₱200/);assert.match(html,/class="date-metrics"/);
 assert(html.indexOf('Nov 19, 2026')<html.indexOf('Nov 20, 2026'));assert.match(html,/Mia &lt;Manager&gt;/);assert.doesNotMatch(html,/<script>|<img>|Forged|Extra payment|Replacement|Exchange<small/);
 assert.deepEqual(reads,{sales:1,shifts:1});c.ACCESS_REQUEST_CONTEXT_.actor.name='New preparer';c.createDashboardTransactionsPdf(range);assert.match(html,/New preparer/);
 c.ACCESS_REQUEST_CONTEXT_.actor.manager=false;const today={start:'2026-11-20',end:'2026-11-20'};
 const restricted=c.getDashboardSales(today);assert.equal(restricted.transactionSummary.canViewCashiers,false);assert.deepEqual(clean(restricted.transactionSummary.days[0].cashiers),[]);
 assert(!JSON.stringify(restricted.transactionSummary).includes('Ana'));assert.equal(c.createDashboardTransactionsPdf(today).success,false);
 assert.equal(c.createDashboardTransactionsPdf(range).success,false);c.ACCESS_REQUEST_CONTEXT_=null;assert.throws(()=>c.createDashboardTransactionsPdf(range),/Sign in/);
});

test('empty transaction dates contain only a No record date band while zero-value exchanges retain their rows and daily total',()=>{
 const {c}=harness([
  sale({receipt:'EVEN',reason:'EXCHANGE RETURN',net:-100,received:0,change:0,original:'OLD',qty:-1}),
  sale({receipt:'EVEN',reason:'EXCHANGE REPLACEMENT',net:100,received:0,change:0,original:'OLD'}),
 ]);
 const data=c.getDashboardSales({start:'2026-11-18',end:'2026-11-20'}),html=c.buildDashboardTransactionsHtml_(data,'Preparer');
 const days=html.split('<tbody><tr class="date-heading').slice(1);
 assert.equal(days.length,3);
 for(const day of days.slice(0,2)){
  assert.match(day,/class="date-metrics">No record<\/span>/);
  assert.doesNotMatch(day,/<tr|Daily total|No completed checkouts|0 transactions/);
 }
 assert.match(days[2],/has-records/);assert.doesNotMatch(days[2],/No record/);assert.match(days[2],/>EVEN<small class="original">Original: OLD/);
 assert.equal((html.match(/class="daily-total"/g)||[]).length,1);assert.match(html,/GRAND TOTAL/);
});

test('legacy missing cash amounts remain unknown while dashboard revenue and zero dates stay intact',()=>{
 const {c}=harness([sale()]);const data=c.getDashboardSales(range),summary=clean(data.transactionSummary);
 assert.equal(summary.days[0].average,0);assert.equal(summary.received,null);assert.equal(summary.change,null);
 assert.equal(summary.days[1].cashiers[0].receipts[0].received,null);
 const html=c.buildDashboardTransactionsHtml_(data,'Preparer');assert.match(html,/— = amount not recorded/);assert.equal(summary.sales,data.netSales);
});

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


test('units summary groups by code and size with price ranges, preserving reconciled amounts',()=>{
  const {c,reads}=harness([
    sale({code:'YF1',category:'YOURFINDS',size:'SNE',name:'TOP',net:180,price:200,qty:1}),
    sale({receipt:'YF2',code:'YF2',category:'YOURFINDS',size:'SNE',name:'TOY',net:190,price:700,qty:1}),
    sale({receipt:'YF3',code:'YF3',category:'YOURFINDS',size:'SE',net:300,price:300}),
    sale({receipt:'GREEN',name:'GREEN',code:'100007',price:180,net:180}),
    sale({receipt:'YELLOW',name:'YELLOW',code:'100001',price:150,net:140}),
    sale({receipt:'YELLOW-SALE',name:'YELLOW · SALE',code:'120001',price:120,net:120}),
    sale({receipt:'YELLOW2',name:'OLD LABEL',code:'100001',price:300,net:280}),
    sale({receipt:'RETURN',name:'YELLOW',code:'100001',price:150,net:-20,qty:-1,reason:'EXCHANGE RETURN'}),
    sale({receipt:'OTHER',category:'OTHERS',name:'BAGS',code:'200002',price:230,net:230}),
    sale({receipt:'WS',category:'WHOLESALE',name:'PURE TOPS (BOX)',code:'WS1',price:6000,net:6000}),
  ]);
  const data=c.getDashboardSales(range),groups=clean(data.unitSummary);
  assert.deepEqual(groups.map(group=>group.category),['YOURFINDS','PINS','OTHERS','WHOLESALE']);
  assert.deepEqual(groups[0].rows.map(row=>[row.code,row.description,row.units,row.sales]),[['SE','SE',1,300],['SNE','SNE',2,370]]);
  assert.equal(groups[0].rows[1].priceMin,200);assert.equal(groups[0].rows[1].priceMax,700);
  assert.equal(groups[0].rows.filter(row=>row.code==='SNE').length,1);
  assert.equal(groups[1].rows.find(row=>row.code==='100001').priceMax,300);
  assert.deepEqual(groups[1].rows.map(row=>[row.description,row.priceMin,row.sales]),[['GREEN',180,180],['YELLOW',150,400],['YELLOW',120,120]]);
  assert.equal(groups[1].rows[1].code,'100001');
  assert.equal(groups[1].rows[1].priceMax,300);
  assert.equal(groups[1].rows[1].units,2);
  assert.equal(groups.reduce((sum,group)=>sum+group.units,0),data.units);
  assert.equal(groups.reduce((sum,group)=>sum+group.sales,0),data.netSales);
  const html=[];c.Utilities.newBlob=value=>{html.push(value);return {getAs:()=>({getBytes:()=>[1]})};};c.Utilities.base64Encode=()=> 'PDF';
  const pdf=c.createDashboardUnitsPdf({...range,preparedBy:'Fake'});
  assert.equal(pdf.fileName,'Units_Sold_Report_Summary_2026-11-19_to_2026-11-20.pdf');
  assert.match(html[0],/UNITS SOLD REPORT SUMMARY/);assert.match(html[0],/>Code<\/th>/);
  assert.match(html[0],/<td>SNE<\/td><th scope="row">Small Non-Electronic/);
  assert.match(html[0],/₱200.00 - 700.00/);
  assert.match(html[0],/<td>100007<\/td><th scope="row">GREEN/);
  assert.match(html[0],/Mia &lt;Manager&gt;/);assert.doesNotMatch(html[0],/Fake|Incomplete|Low stock/);
  assert.deepEqual(reads,{sales:1,shifts:1},'Download reuses the dashboard snapshot');
  c.ACCESS_REQUEST_CONTEXT_.actor.manager=false;assert.equal(c.createDashboardUnitsPdf(range).success,false);
  c.ACCESS_REQUEST_CONTEXT_=null;assert.throws(()=>c.createDashboardUnitsPdf(range),/Sign in/);
});

test('units PDF uses cached data, codes, category bands and the authenticated preparer; keeps discounts and zero-unit adjustments',()=>{
 const {c,reads}=harness([
  sale({category:'YOURFINDS',code:'YF1',size:'SE',name:'ELECTRONIC',net:85,price:100}),
  sale({receipt:'R2',category:'OTHERS',name:'<BAG>',code:'000007',net:30,price:50,qty:1}),
  sale({receipt:'ADJ',name:'YELLOW',net:-5,price:100,qty:0}),
 ]);
 const data=c.getDashboardSales(range);let html;
 c.Utilities.newBlob=value=>{html=value;return {getAs:()=>({getBytes:()=>[1]})};};c.Utilities.base64Encode=()=> 'PDF';
 const result=c.createDashboardUnitsPdf({...range,preparedBy:'Forged'});
 assert.equal(result.fileName,'Units_Sold_Report_Summary_2026-11-19_to_2026-11-20.pdf');
 assert.match(html,/UNITS SOLD REPORT SUMMARY/);assert.match(html,/<th>Code<\/th>/);
 assert.match(html,/<td>SE<\/td><th scope="row">Small Electronic/);assert.match(html,/<td>000007<\/td><th scope="row">BAG/);
 assert.match(html,/Mia &lt;Manager&gt;/);assert.doesNotMatch(html,/Forged/);
 const sums=data.unitSummary.reduce((sum,group)=>({units:sum.units+group.units,sales:sum.sales+group.sales}),{units:0,sales:0});
 assert.equal(sums.units,data.units);assert.equal(sums.sales,data.netSales);assert.equal(data.netSales,110);
 assert.deepEqual(reads,{sales:1,shifts:1});
 c.ACCESS_REQUEST_CONTEXT_.actor.manager=false;assert.equal(c.createDashboardUnitsPdf(range).success,false);
 c.ACCESS_REQUEST_CONTEXT_=null;assert.throws(()=>c.createDashboardUnitsPdf(range),/Sign in/);
});


test('regular and sale rows remain separate per code, with independent price ranges and red SALE label in PDF',()=>{
 const {c}=harness([
  sale({receipt:'REG',code:'100002',name:'BLACK',price:200,net:200}),
  sale({receipt:'SALE1',code:'100002',name:'BLACK · SALE',price:159,qty:8,net:1272}),
  sale({receipt:'SALE2',code:'100002',name:'BLACK · SALE',price:149,qty:2,net:298}),
  sale({receipt:'REG2',code:'100002',name:'BLACK',price:250,net:250}),
 ]);
 const data=c.getDashboardSales(range),rows=data.unitSummary[0].rows;
 assert.equal(rows.length,2);assert.deepEqual(clean(rows.map(row=>[row.isSale,row.priceMin,row.priceMax,row.units,row.sales])),[[false,200,250,2,450],[true,149,159,10,1570]]);
 const html=c.buildDashboardUnitsHtml_(data,'Mia');assert.match(html,/class="sale" style="color:#a52d3b"/);assert.match(html,/BLACK · SALE/);assert.match(html,/₱149.00 - 159.00/);assert.equal(data.units,12);assert.equal(data.netSales,2020);
});
