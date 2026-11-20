const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=path=>fs.readFileSync('Frontend/'+path+'.html','utf8');
const script=path=>html(path).match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture({cashier=false,manager=false,dev=false,saved}={}) {
  const storage=new Map(),elements={},loads=[],calls=[];
  const dashboardRequests=[],returnDownloads=[],returnResponses=[];
  const salesChecks=['all','YOURFINDS','PINS','OTHERS','WHOLESALE'].map(category=>({checked:false,dataset:{salesChartCategory:category},addEventListener(){}}));
  if(saved)storage.set('ys_pos_active_page',saved);
  const element=id=>elements[id]||=({style:{display:'none'},dataset:{},tBodies:[],addEventListener(){},contains(){return false;},showModal(){this.open=true;},close(){this.open=false;},replaceChildren(){this.innerHTML='';},value:'',checked:false,disabled:false,setAttribute(){},removeAttribute(){},hasAttribute(){return false;},classList:{toggle(){},remove(){}},querySelectorAll:()=>[]});
  const mascotRun={withSuccessHandler(){return this;},withFailureHandler(){return this;},getDashboardMascotArtwork(){}};
  const c=vm.createContext({google:{script:{run:mascotRun}},clearTimeout,setInterval:()=>1,clearInterval(){},Image:class{},currentEmployee:{fullName:'Test User',role:manager?'MANAGER':'CASHIER'},currentSessionIsCashier:cashier,
    currentCashier:'',currentShiftPettyCash:0,currentShiftReportId:'',loginAttempt:0,pageReadCache:new Map(),
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    document:{addEventListener(){},removeEventListener(){},body:{dataset:{dashboardEnabled:String(dev)},classList:{toggle(){},contains(){return false;}}},getElementById:element,querySelector:selector=>selector==='.sidebar-menu'?element('sidebarMenu'):null,querySelectorAll:selector=>selector==='[data-sales-chart-category]'?salesChecks:[]},
    window:{addEventListener(){},matchMedia:()=>({matches:true})},
    hasManagerViewAccess:()=>manager,canAuthorizeManagerActions:()=>manager,
    prioritizeWorkspacePage(){},finishWorkspacePageLoad(){},
    secureScriptRun:{
      withSuccessHandler(success){this.success=success;return this;},
      withFailureHandler(failure){this.failure=failure;return this;},
      getDashboardPage(range){dashboardRequests.push({range,success:this.success,failure:this.failure});},
      createDashboardReturnPdf(range){returnDownloads.push(range);returnResponses.push({success:this.success,failure:this.failure});}
    },
    loadInventoryPage:()=>loads.push('inventoryPage'),loadDeliveriesPage:()=>loads.push('deliveriesPage'),
    loadSupplierReturnsPage:()=>loads.push('supplierReturnsPage'),loadDashboardPage:()=>loads.push('dashboardPage'),refreshInventory:()=>loads.push('posPage'),
    showNotificationToast:message=>calls.push(message),loadingIndicator:()=>'',rememberLoginUsername(){},saveSession(){}});
  vm.runInContext(script('Layout/Sidebar'),c);
  const app=script('Scripts/AppJS');
  vm.runInContext(app.slice(app.indexOf('  function beginPageRead('),app.indexOf('  var workspacePreloadState')),c);
  vm.runInContext(script('Scripts/DashboardMascot'),c);
  vm.runInContext(script('Pages/DashboardPage'),c);
  c.loadDashboardChartLibrary=()=>null;
  return {c,storage,elements,loads,calls,element,dashboardRequests,returnDownloads,returnResponses};
}

const emptyDashboardOverview={inventory:{stock:0,low:0},delivery:{count:0,incomplete:0},returns:{count:0,items:0}};
const emptyDashboardSales={activity:[],items:[],payments:[],hourly:true,netSales:0,units:0,transactions:0};
const packet=(overview=emptyDashboardOverview,sales=emptyDashboardSales)=>({overview,sales});

test('payment donut expands the active method and updates its center without a tooltip',()=>{
 const f=fixture({dev:true,manager:true});
 const node=()=>({children:[],attrs:{},events:{},style:{setProperty(){}},textContent:'',append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(key,value){this.attrs[key]=String(value);},addEventListener(key,handler){this.events[key]=handler;}});
 f.c.document.createElement=node;
 f.c.document.createElementNS=node;
 f.elements.dashboardPaymentPlot=node();
 f.elements.dashboardPaymentLegend=node();
 f.c.renderDashboardSales({...emptyDashboardSales,absorbedCardFees:80,payments:[{method:'Cash',amount:10000},{method:'Credit card',amount:2500},{method:'QR Code',amount:1515}]});
 const plot=f.element('dashboardPaymentPlot');
 assert.equal(plot.children.length,1);
 const [ring,center]=plot.children[0].children;
 const [amount,label,share,fee]=center.children;
 assert.equal(amount.textContent,'₱14,015');assert.equal(label.textContent,'Total collected');assert.equal(share.hidden,true);
 ring.children[1].events.pointerenter();
 assert.equal(label.textContent,'Credit card');assert.equal(amount.textContent,'₱2,500');
 assert.match(share.textContent,/of payments/);assert.match(fee.textContent,/₱80.00 \(3.2%\)/);
 assert.equal(ring.children[1].attrs['data-active'],'true');assert.equal(ring.children[0].attrs['data-active'],'false');
 ring.children[1].events.pointerleave();assert.equal(label.textContent,'Total collected');assert.equal(fee.hidden,true);
 const qr=f.element('dashboardPaymentLegend').children[2].children[0];
 qr.events.focus();assert.equal(label.textContent,'QR Code');assert.match(fee.textContent,/₱0.00 \(1%\)/);
 qr.events.click();assert.equal(ring.children[2].attrs['aria-pressed'],'true');
 qr.events.keydown({key:'Escape'});assert.equal(label.textContent,'Total collected');assert.equal(qr.attrs['aria-pressed'],'false');
});

test('graph interval controls appear for multiple days and hide for a single day',()=>{
 const f=fixture({dev:true,manager:true});
 f.c.renderDashboardSales({...emptyDashboardSales,hourly:false});
 assert.equal(f.element('dashboardGraphGrouping').hidden,false);
 assert.equal(f.element('dashboardSalesInterval').textContent,'Daily');
 f.element('dashboardGraphWeekly').checked=true;
 f.c.renderDashboardSalesChart();
 assert.equal(f.element('dashboardSalesInterval').textContent,'Weekly');
 f.c.renderDashboardSales({...emptyDashboardSales,hourly:true});
 assert.equal(f.element('dashboardGraphGrouping').hidden,true);
 assert.equal(f.element('dashboardSalesInterval').textContent,'Hourly');
});

for (const [kind,download,endpoint] of [
 ['NetSales','downloadDashboardNetSalesSummary','createDashboardNetSalesPdf'],
 ['Return','downloadDashboardReturnSummary','createDashboardReturnPdf'],
 ['Delivery','downloadDashboardDeliverySummary','createDashboardDeliveryPdf'],
 ['Inventory','downloadDashboardInventoryReport','getDashboardInventoryReport'],
]) test(kind+' report download uses the button loading state and resets after failure and retry',()=>{
 const f=fixture({dev:true,manager:true}),requests=[];
 f.c.updateDashboardHeader(new Date('2026-11-18T04:00:00Z'));
 f.element('dashboardDeliveryTable').hidden=false;
 f.element('dashboardInventoryTotals').hidden=false;
 vm.runInContext("dashboardSalesData={period:{start:'2026-11-18',end:'2026-11-18'},collections:{days:[],total:0}};dashboardDeliverySummaryRequest={start:'2026-11-18',end:'2026-11-18'}",f.c);
 f.c.pageReadCache.set('dashboardOverview',{data:{overview:{returns:{count:1}}}});
 f.c.secureScriptRun[endpoint]=function(){requests.push({success:this.success,failure:this.failure});};
 const button=f.element('dashboard'+kind+'Download'),message=f.element('dashboard'+kind+'Message'),attrs={};
 button.setAttribute=(key,value)=>{attrs[key]=value;};button.removeAttribute=key=>{delete attrs[key];};
 f.c.downloadSupplierReturnPdf_=()=>{};
 f.c[download]();assert.equal(button.disabled,true);assert.equal(attrs['aria-busy'],'true');assert.equal(message.textContent,'');
 f.c[download]();assert.equal(requests.length,1);
 requests[0].failure(new Error('Try again'));assert.equal(attrs['aria-busy'],undefined);assert.equal(button.disabled,false);assert.equal(message.textContent,'Try again');
 f.c[download]();requests[1].success({success:true,base64:'PDF'});assert.equal(attrs['aria-busy'],undefined);assert.equal(button.disabled,false);assert.equal(message.textContent,'');
});

test('net sales summary opens from the cached dashboard and uses its period for actions',()=>{
 const f=fixture({dev:true,manager:true});
 const node=()=>({children:[],attrs:{},events:{},append(...items){this.children.push(...items);},setAttribute(key,value){this.attrs[key]=value;},addEventListener(key,handler){this.events[key]=handler;},insertCell(){const cell=node();this.append(cell);return cell;}});
 const body=f.element('dashboardNetSalesRows');
 body.rows=[];
 body.replaceChildren=()=>{body.rows=[];};
 body.insertRow=()=>{const row=node();body.rows.push(row);return row;};
 f.c.document.createElement=node;
 const period={start:'2026-11-10',end:'2026-11-13'};
 f.c.renderDashboardSales({...emptyDashboardSales,period,units:3,netSales:350,
  collections:{canViewCashiers:true,total:350,days:[{date:'2026-11-10',total:350,payments:[{name:'Cash',amount:350}],cashiers:[{name:'Samantha',shift:'9 AM – 3 PM',amount:350}]},{date:'2026-11-11',total:0,payments:[],cashiers:[]}]}});
 f.c.openDashboardNetSalesSummary();
 assert.equal(f.element('dashboardNetSalesCard').disabled,false);
 assert.equal(f.element('dashboardNetSalesSummary').open,true);
 assert.match(f.element('dashboardNetSalesPeriod').textContent,/November 10\s*–\s*13, 2026/);
 const toggle=body.rows[0].children[0].children[0];
 assert.equal(toggle.textContent,'Nov 10, 2026');
 assert.equal(toggle.attrs['aria-expanded'],'true');
 assert.equal(body.rows[1].hidden,false);
 toggle.events.click();
 assert.equal(body.rows[1].hidden,true);
 f.c.setDashboardCollectionMode('cashiers');
 assert.equal(body.rows[1].children[0].children[0].textContent,'Samantha');
 assert.equal(body.rows[1].children[0].children[1].textContent,'9 AM – 3 PM');
 assert.equal(body.rows[1].hidden,true,'Changing breakdown preserves collapsed dates');
 assert.equal(body.rows[3].children[0].children[0].textContent,'No collections recorded');
 assert.equal(f.element('dashboardNetSalesTotal').textContent,'₱350');
 assert.equal(f.dashboardRequests.length,0);
 let pdfRequests=0;
 f.c.secureScriptRun.createDashboardNetSalesPdf=function(range){pdfRequests++;assert.deepEqual({...range},{...period,breakdown:'cashiers'});};
 f.c.downloadDashboardNetSalesSummary();
 f.c.downloadDashboardNetSalesSummary();
 assert.equal(pdfRequests,1);
 let historyPeriod;
 f.c.openTransactionHistoryModal=range=>{historyPeriod=range;};
 f.c.viewDashboardSalesTransactions();
 assert.equal(f.element('dashboardNetSalesSummary').open,false);
 assert.deepEqual(historyPeriod,period);
 const next={start:'2026-11-14',end:'2026-11-14'};
 f.c.renderDashboardSales({...emptyDashboardSales,period:next,collections:{canViewCashiers:true,total:20,days:[
  {date:next.start,total:20,payments:[{name:'Cash',amount:20}],cashiers:[{name:'Alex',shift:'3 PM – 9 PM',amount:20}]},
 ]}});
 f.c.openDashboardNetSalesSummary();
 assert.equal(body.rows[0].children[0].children[0].attrs['aria-expanded'],'true','A new date range starts with its first date expanded');
 assert.equal(f.dashboardRequests.length,0);
 f.c.clearDashboardState();
 assert.equal(body.rows.length,0);
 assert.equal(f.element('dashboardNetSalesSummary').open,false);
 assert.equal(vm.runInContext('dashboardCollectionMode',f.c),'payments');
});

test('sales comparisons follow the selected period and ignore late responses from another date or sign-in',()=>{
 const f=fixture({dev:true,manager:true});
 f.c.updateDashboardHeader(new Date('2026-11-13T04:00:00Z'));
 f.c.loadDashboardOverview();
 const today=f.dashboardRequests.at(-1);
 assert.deepEqual({...today.range},{start:'2026-11-13',end:'2026-11-13'});
 vm.runInContext('dashboardRange = [dashboardDate(2026,10,12),dashboardDate(2026,10,12)]',f.c);
 f.c.loadDashboardOverview();
 const yesterday=f.dashboardRequests.at(-1);
 const sales={activity:[],items:[],payments:[],hourly:true,netSales:4000,units:4,transactions:2};
 const warnings=new Map();
 f.element('dashboardSalesTransactionsComparison').classList.toggle=(name,on)=>warnings.set(name,on);
 yesterday.success(packet(undefined,{...sales,previous:{start:'2026-11-11',end:'2026-11-11',netSales:2000,units:4,transactions:3}}));
 assert.equal(f.element('dashboardSalesNetComparison').textContent,'₱2,000 more than Nov 11');
 assert.equal(f.element('dashboardSalesTransactionsComparison').textContent,'1 fewer than Nov 11');
 assert.equal(warnings.get('dashboard-card-attention'),true);
 today.success(packet(undefined,{...sales,netSales:8000}));
 assert.equal(f.element('dashboardSalesNet').textContent,'₱4,000');
 f.c.currentEmployee=null;
 f.c.clearDashboardState();
 yesterday.success(packet(undefined,sales));
 assert.equal(f.element('dashboardSalesNet').textContent,'—');
});

test('a cold dashboard shows one loader under the header until snapshot and chart are ready',async()=>{
 const f=fixture({dev:true,manager:true});
 const source=html('Pages/DashboardPage');
 assert(source.indexOf('</header>') < source.indexOf('id="dashboardOverviewStatus"'));
 assert(source.indexOf('id="dashboardOverviewStatus"') < source.indexOf('id="dashboardContent"'));
 let resolveChart;
 const chartReady=new Promise(resolve=>{resolveChart=resolve;});
 f.c.loadDashboardChartLibrary=()=>chartReady;
 f.c.updateDashboardHeader(new Date('2026-11-13T04:00:00Z'));
 f.c.loadDashboardOverview();
 assert.equal(f.element('dashboardContent').hidden,true);
 assert.equal(f.element('dashboardOverviewStatus').textContent,'Loading dashboard…');
 f.c.loadDashboardOverview();
 assert.equal(f.dashboardRequests.length,1);
 f.dashboardRequests[0].success(packet({...emptyDashboardOverview,inventory:{stock:25,low:1}},{...emptyDashboardSales,netSales:5500}));
 assert.equal(f.element('dashboardContent').hidden,true);
 resolveChart();
 await chartReady;
 assert.equal(f.element('dashboardContent').hidden,false);
 assert.equal(f.element('dashboardOverviewStatus').textContent,'');
 assert.equal(f.element('dashboardStockTotal').textContent,'25');
 assert.equal(f.element('dashboardSalesNet').textContent,'₱5,500');
});

test('cached dashboard panels display together and stay visible during one background refresh',()=>{
 const f=fixture({dev:true,manager:true});
 f.c.updateDashboardHeader(new Date('2026-11-13T04:00:00Z'));
 const saved=packet({...emptyDashboardOverview,inventory:{stock:12,low:1}},{...emptyDashboardSales,netSales:4000});
 let persisted;
 f.c.readDeviceDashboard=(kind,range)=>{assert.equal(kind,'page');assert.equal(range.end,'2026-11-13');return saved;};
 f.c.writeDeviceDashboard=(kind,range,data)=>{persisted={kind,range,data};};
 f.c.loadDashboardOverview();
 assert.equal(f.element('dashboardContent').hidden,false);
 assert.equal(f.element('dashboardStockTotal').textContent,'12');
 assert.equal(f.element('dashboardSalesNet').textContent,'₱4,000');
 assert.equal(f.element('dashboardOverviewStatus').textContent,'');
 f.c.loadDashboardOverview();
 assert.equal(f.dashboardRequests.length,1);
 f.dashboardRequests[0].success(packet({...saved.overview,inventory:{stock:9,low:1}},{...saved.sales,netSales:5500}));
 assert.equal(f.element('dashboardStockTotal').textContent,'9');
 assert.equal(f.element('dashboardSalesNet').textContent,'₱5,500');
 assert.equal(persisted.kind,'page');
 assert.equal(persisted.data.sales.netSales,5500);
});

test('sales graph uses the preview palette, rounded stacks, shadowed white line and separate axes',()=>{
 const f=fixture({dev:true,manager:true});
 const source=html('Pages/DashboardPage');
 assert.match(source,/scrollbar-color: [^;]+ transparent/);
 let config;
 f.c.Chart=function(canvas,options){config=options;};
 f.c.matchMedia=()=>({matches:false});
 vm.runInContext('dashboardSalesChecks.forEach(input => {input.checked=true;});',f.c);
 f.c.renderDashboardSales({...emptyDashboardSales,activity:[
  {start:'08:00',sales:[0,0,0,0],units:[0,0,0,0]},
  {start:'09:00',sales:[400,200,0,0],units:[3,2,0,0]},
  {start:'10:00',sales:[500,120,0,0],units:[4,2,0,0]},
 ]});
 assert.deepEqual(Array.from(config.data.labels),['9 AM','10 AM']);
 const [line,finds,pins,others,wholesale]=config.data.datasets;
 assert.equal(line.borderColor,'#fff');assert.equal(line.borderWidth,2);
 assert.equal(line.tension,.2);assert.equal(line.type,'line');
 assert.equal(typeof config.plugins[0].beforeDatasetDraw,'function');
 assert.deepEqual([finds,pins,others,wholesale].map(entry=>entry.backgroundColor),['#e77ca3','#a18ad7','#e4a173','#69ae9a']);
 assert.equal(finds.borderRadius,4);
 assert.equal(config.options.scales.sales.title.text,'Net sales (₱)');
 assert.equal(config.options.scales.units.title.text,'Units sold');
 assert.equal(config.options.scales.units.stacked,true);
});

test('weekly chart buckets preserve totals and respect Monday boundaries within the selected range',()=>{
 const {c}=fixture();
 const points=['2026-11-07','2026-11-08','2026-11-09'].map((date,index)=>({
  start:date,end:date,units:[index+1,0,0,0],sales:[100,10,0,0]
 }));
 const weeks=c.dashboardWeeklyActivity(points);
 assert.deepEqual(Array.from(weeks,row=>[row.start,row.end,row.units[0],row.sales[0]]),[
  ['2026-11-07','2026-11-08',3,200],['2026-11-09','2026-11-09',3,100]
 ]);
});
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
 const latest=f.dashboardRequests.at(-1);
 assert.equal(latest.range.start,'2026-11-24');
 assert.equal(latest.range.end,'2026-11-28');
 const totals={sales:{net:24580,count:86,own:true},inventory:{stock:1248,low:12},delivery:{count:6,incomplete:2},returns:{count:3,items:14,groups:[]}};
 latest.success(packet(totals));
 const requestCount=f.dashboardRequests.length;
 f.c.loadDashboardOverview();
 assert.equal(f.dashboardRequests.length,requestCount);
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
 latest.success(packet(totals));
 assert.equal(f.element('dashboardStockTotal').textContent,'—');
 assert.equal(label.textContent,'Date range');
 assert.equal(quote.textContent,'');
 assert.equal(vm.runInContext('dashboardRange',f.c),null);
});
test('return PDF downloads directly, prevents duplicate clicks, retries errors, and ignores logged-out requests',()=>{
 const f=fixture({dev:true}),downloaded=[];
 f.c.downloadSupplierReturnPdf_=result=>downloaded.push(result);
 f.c.updateDashboardHeader(new Date('2026-11-13T04:00:00Z'));
 assert.doesNotMatch(html('Pages/DashboardPage'), /dashboardReturnPrintDialog|dashboardReturnPreparedBy|dashboardReturnDriver|dashboardReturnPlate/);
 f.c.pageReadCache.set('dashboardOverview',{data:{overview:{returns:{count:2}}}});
 f.c.downloadDashboardReturnSummary();
 assert.deepEqual({...f.returnDownloads[0]},{start:'2026-11-13',end:'2026-11-13'});
 vm.runInContext('dashboardRange = [dashboardDate(2026,10,1),dashboardDate(2026,10,30)]',f.c);
 f.c.downloadDashboardReturnSummary();assert.equal(f.returnDownloads.length,1);
 f.returnResponses[0].failure(new Error('Try again'));
 assert.equal(f.element('dashboardReturnMessage').textContent,'Try again');
 assert.equal(f.element('dashboardReturnDownload').disabled,false);
 f.c.downloadDashboardReturnSummary();
 assert.deepEqual({...f.returnDownloads[1]},{start:'2026-11-01',end:'2026-11-30'});
 f.returnResponses[1].success({success:true,base64:'PDF'});
 assert.equal(downloaded.length,1);assert.equal(f.element('dashboardReturnDownload').disabled,false);
 f.c.downloadDashboardReturnSummary();
 f.c.clearDashboardState();
 f.returnResponses[2].success({success:true,base64:'CANCELLED'});
 assert.equal(downloaded.length,1);
});
test('clicking the sidebar Inventory button opens Inventory from Delivery',()=>{
 const f=fixture({saved:'deliveriesPage'});f.c.restoreActivePage();
 const handler=html('Layout/Sidebar').match(/id="inventorySidebarButton"[^>]*onclick="([^"]+)"/)[1];
 vm.runInContext(handler,f.c);
 assert.deepEqual(f.loads,['deliveriesPage','inventoryPage']);
 assert.equal(f.storage.get('ys_pos_active_page'),'inventoryPage');
});
test('UAT restores Dashboard first and leaves other workspace reads demand-loaded',()=>{
 const f=fixture({dev:true,saved:'deliveriesPage'});f.c.currentEmployee.dashboardToken='session';
 const app=script('Scripts/AppJS');
 const queued=[];
 Object.assign(f.c,{workspacePreloadState:null,resetWorkspacePreload(){},setTimeout:run=>queued.push(run),warmDeliveryCatalog(){}});
 vm.runInContext(app.slice(app.indexOf('  function prioritizeWorkspacePage('),app.indexOf('  function preloadHistoryAndReports(')),f.c);
 f.c.restoreActivePage();
 assert.equal(f.storage.get('ys_pos_active_page'),'dashboardPage');
 assert.equal(queued.length,0);
 assert.deepEqual(f.loads,[]);
 assert.equal(f.dashboardRequests.length,1);
 f.c.showPage('dashboardPage');
 assert.equal(f.dashboardRequests.length,1);
 f.dashboardRequests[0].failure();
 assert.equal(queued.length,1);
 queued[0]();
 assert.deepEqual(f.loads,[]);
});
test('saved Dashboard totals render before the server responds and refresh without blocking navigation',()=>{
 const f=fixture({dev:true});
 f.c.currentEmployee.dashboardToken='session';
 const totals={inventory:{stock:10,low:1},delivery:{count:1,incomplete:0,items:0,groups:[]},returns:{count:0,items:0,groups:[]},
  reminders:{incomplete:2,sold:0,low:1,undistributed:4}};
 let released=0,saved;
 f.c.readDeviceDashboard=()=>packet(totals);
 f.c.writeDeviceDashboard=(kind,range,data)=>{saved=data.overview;};
 f.c.finishWorkspacePageLoad=()=>released++;
 f.c.restoreActivePage();
 assert.equal(f.element('dashboardStockTotal').textContent,'10');
 assert.equal(f.element('dashboardOverviewStatus').textContent,'');
 assert.equal(released,1);assert.equal(f.dashboardRequests.length,1);
 f.c.toggleDashboardInventoryReminders(true);
 assert.deepEqual(['incomplete','sold','low','undistributed'].map(kind=>f.element('dashboardReminder-'+kind).textContent),['2','0','1','4']);
 assert.equal(f.dashboardRequests.length,1);
 f.c.openDashboardDeliverySummary();
 assert.equal(f.element('dashboardDeliveryReceiptCount').textContent,'1');
 assert.equal(f.element('dashboardDeliveryMessage').textContent,'No received items in this date range.');
 assert.equal(f.dashboardRequests.length,1);
 const fresh={...totals,inventory:{...totals.inventory,stock:600},reminders:{...totals.reminders,undistributed:3}};
 f.dashboardRequests[0].success(packet(fresh));
 assert.equal(f.element('dashboardStockTotal').textContent,'600');assert.equal(saved,fresh);
 assert.equal(f.element('dashboardReminder-undistributed').textContent,'3');
 assert.equal(f.element('dashboardOverviewStatus').textContent,'');
});
test('switching A to B to A reuses pending requests and retains both date results',()=>{
 const f=fixture({dev:true});f.c.currentEmployee.dashboardToken='session';
 const totals=net=>({sales:{net,count:1,own:true},inventory:{stock:net,low:0},delivery:{count:1,incomplete:0},returns:{count:0,items:0,groups:[]}});
 const select=day=>{vm.runInContext(`dashboardRange=[new Date('2026-11-${day}T00:00:00Z'),new Date('2026-11-${day}T00:00:00Z')];`,f.c);f.c.loadDashboardOverview();};
 select('10');select('11');select('10');
 assert.equal(f.dashboardRequests.length,2);
 f.dashboardRequests[1].success(packet(totals(200)));
 assert.equal(f.element('dashboardContent').hidden,true);
 assert.equal(f.element('dashboardOverviewStatus').textContent,'Loading dashboard…');
 f.dashboardRequests[0].success(packet(totals(100)));
 assert.equal(f.element('dashboardStockTotal').textContent,'100');
 select('11');assert.equal(f.element('dashboardStockTotal').textContent,'200');
 select('10');assert.equal(f.element('dashboardStockTotal').textContent,'100');
 assert.equal(f.dashboardRequests.length,2);
 f.c.clearDashboardState();assert.equal(Array.from(f.c.pageReadCache.keys()).filter(key=>key.startsWith('dashboardOverview')).length,0);
});
test('a sales read failure preserves a complete saved dashboard and allows retry',()=>{
 const f=fixture({dev:true,manager:true});
 f.c.updateDashboardHeader(new Date('2026-11-13T04:00:00Z'));
 f.c.readDeviceDashboard=kind=>kind==='page'?packet(undefined,{...emptyDashboardSales,netSales:4500}):null;
 f.c.loadDashboardOverview();
 f.dashboardRequests[0].success(packet(undefined,{unavailable:'Couldn’t load sales.',retryable:true}));
 assert.equal(f.element('dashboardContent').hidden,false);
 assert.equal(f.element('dashboardSalesNet').textContent,'₱4,500');
 assert.equal(f.element('dashboardOverviewRetry').hidden,false);
 f.c.loadDashboardOverview();
 assert.equal(f.dashboardRequests.length,2);
 f.dashboardRequests[1].success(packet(undefined,{...emptyDashboardSales,netSales:5200}));
 assert.equal(f.element('dashboardSalesNet').textContent,'₱5,200');
 assert.equal(f.element('dashboardOverviewRetry').hidden,true);
});
test('compact Return Summary shows category subtotals and grand total, replacing previous rows',()=>{
 const f=fixture({dev:true});
 const node=()=>({children:[],textContent:'',append(...items){this.children.push(...items);},insertCell(){const cell=node();this.children.push(cell);return cell;},insertRow(){const row=node();this.children.push(row);return row;}});
 f.c.document.createElement=node;
 const table=f.element('dashboardReturnTable');
 table.createTBody=()=>{const body=node();body.remove=()=>table.tBodies.splice(table.tBodies.indexOf(body),1);table.tBodies.push(body);return body;};
 const groups=[{title:'YourFinds · Size',rows:[{description:'SNE',quantity:4},{description:'XLNE',quantity:1}]},
  {title:'YourStyle · Pins',rows:[{description:'-',quantity:98}]},
  {title:'YourStyle · Other',rows:[{description:'Shoes',quantity:1},{description:'Bags',quantity:2}]}];
 f.c.renderDashboardReturnSummary({count:5,items:106,groups});
 const heading=body=>body.children[0].children[0].children[0].children;
 assert.equal(heading(table.tBodies[0])[1].textContent,'5 pcs');
 assert.equal(heading(table.tBodies[1])[1].textContent,'98 pcs');
 assert.equal(heading(table.tBodies[2])[0].textContent,'YourStyle · Others');
 assert.equal(table.tBodies[1].children[1].children[0].textContent,'Standard');
 assert.equal(table.tBodies[2].children[1].children[0].textContent,'SHOES');
 assert.equal(table.tBodies[2].children[2].children[0].textContent,'BAGS');
 assert.equal(f.element('dashboardReturnItemCount').textContent,'106');
 assert.equal(f.element('dashboardReturnDownload').disabled,false);
 f.c.renderDashboardReturnSummary({count:0,items:0,groups:[]});
 assert.equal(table.tBodies.length,0);assert.equal(table.hidden,true);
 assert.equal(f.element('dashboardReturnItemCount').textContent,'0');assert.equal(f.element('dashboardReturnDownload').disabled,true);
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
    getDashboardPage(){},
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

test('dashboard reminders open the matching inventory or delivery filter',()=>{
 const f=fixture({dev:true});
 f.c.dashboardInventoryReminder='';
 f.c.clearDeliveriesFilters=render=>assert.equal(render,false);
 f.c.renderDashboardOverview({inventory:{stock:12,low:2},delivery:{count:1,incomplete:1},returns:{count:0,items:0},
  reminders:{incomplete:1,sold:3,low:2,undistributed:4}});
 assert.equal(f.element('dashboardReminder-undistributed').textContent,'4');
 f.c.toggleDashboardInventoryReminders(true);
 assert.equal(f.element('dashboardInventoryReminders').hidden,false);
 for(const [kind, filter] of [['incomplete','INCOMPLETE'],['sold','SOLD OUT'],['low','LOW STOCK']]){
  f.c.openDashboardReminder(kind);
  assert.equal(f.c.dashboardInventoryReminder,filter);
  assert.equal(f.storage.get('ys_pos_active_page'),'inventoryPage');
 }
 f.c.openDashboardReminder('undistributed');
 assert.equal(f.c.dashboardInventoryReminder,'WHOLESALE');
 assert.equal(f.storage.get('ys_pos_active_page'),'inventoryPage');
 assert.equal(f.element('dashboardInventoryReminders').hidden,true);
});

test('expanded stock rows navigate directly and highlight Delivery or Return rather than Inventory',()=>{
 const f=fixture({dev:true,manager:true});
 const pages=['dashboardPage','posPage','inventoryPage','deliveriesPage','supplierReturnsPage'];
 const nodes=Object.fromEntries(pages.map(page=>[page,{attrs:{},active:false,classList:{toggle(key,on){this.active=on;}},setAttribute(key,value){this.attrs[key]=value;},removeAttribute(key){delete this.attrs[key];}}]));
 const oldQuery=f.c.document.querySelector,oldQueries=f.c.document.querySelectorAll;
 f.c.document.querySelector=selector=>nodes[selector.match(/data-page="([^"]+)"/)?.[1]]||oldQuery(selector);
 f.c.document.querySelectorAll=selector=>selector==='.sidebar-item[data-page]'?Object.values(nodes):oldQueries(selector);
 for(const [page,label] of [['deliveriesPage','Delivery'],['supplierReturnsPage','Return']]){
  const markup=html('Layout/Sidebar').match(new RegExp('<button[^>]*class="sidebar-item inventory-expanded-item"[^>]*data-page="'+page+'"[^>]*>'))[0];
  assert(markup.includes('aria-label="'+label+'"'));
  vm.runInContext(markup.match(/onclick="([^"]+)"/)[1],f.c);
  assert.equal(f.storage.get('ys_pos_active_page'),page);
  assert.equal(nodes[page].attrs['aria-current'],'page');
  assert.equal(nodes.inventoryPage.attrs['aria-current'],undefined);
  assert(f.loads.includes(page));
 }
});

test('stock flyout opens only in the collapsed desktop sidebar',()=>{
 const f=fixture({dev:true,manager:true});let desktop=true,collapsed=false;
 f.c.window.matchMedia=()=>({matches:desktop});
 f.c.document.body.classList.contains=name=>name==='sidebar-collapsed'&&collapsed;
 const menu=f.element('inventorySidebarFlyout');menu.hidden=true;menu.offsetWidth=200;menu.offsetHeight=150;
 f.element('inventorySidebarButton').getBoundingClientRect=()=>({top:120,bottom:166});
 f.element('appSidebar').getBoundingClientRect=()=>({left:0,right:88});
 f.c.window.innerWidth=1200;f.c.window.innerHeight=800;
 f.c.openInventoryFlyout();assert.equal(menu.hidden,true);
 collapsed=true;f.c.openInventoryFlyout();assert.equal(menu.hidden,false);
 f.c.closeInventoryFlyout();desktop=false;f.c.openInventoryFlyout();assert.equal(menu.hidden,true);
});
