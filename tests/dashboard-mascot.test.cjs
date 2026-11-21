const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture() {
  const elements=new Map(),images=[],timers=new Map(),listeners={},charts=[],artworkRequests=[];
  const run={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(fn){this.failure=fn;return this;},getDashboardMascotArtwork(id){artworkRequests.push({id,success:this.success,failure:this.failure});}};
  const node=id=>{
    if(!elements.has(id)){const classes=new Set();elements.set(id,{hidden:false,dataset:{},style:{},textContent:'',
      classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)}});}
    return elements.get(id);
  };
  const checks=['all','YOURFINDS','PINS','OTHERS','WHOLESALE'].map(key=>({checked:true,dataset:{salesChartCategory:key}}));
  const c=vm.createContext({console,Date,Intl,Map,google:{script:{run}},dashboardInitialMascotArtwork:{id:"1DZIkmEWEym2yUuSz3SQVTeVB5RC_y6QC",src:fs.readFileSync("Frontend/Assets/DashboardMascots/happy.html","utf8")},matchMedia:()=>({matches:true}),Image:class{constructor(){images.push(this);}},
    setInterval:callback=>{const id=timers.size+1;timers.set(id,callback);return id;},clearInterval:id=>timers.delete(id),
    document:{hidden:false,getElementById:node,querySelectorAll:()=>checks,addEventListener:(name,fn)=>listeners[name]=fn},
    dashboardSalesData:null,dashboardSalesChart:null,dashboardSalesChecks:checks,dashboardSalesPlot:node('dashboardSalesPlot'),dashboardSalesScroll:{scrollLeft:0},
    dashboardSalesShortDate:new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',timeZone:'UTC'}),
    dashboardSalesHour:new Intl.DateTimeFormat('en-PH',{hour:'numeric',timeZone:'UTC'}),
    dashboardSalesSeries:[['YOURFINDS','YourFinds','#f09'],['PINS','Pins','#94f'],['OTHERS','Others','#e94'],['WHOLESALE','Wholesale','#5a9']],
    updateDashboardSalesNavigation(){},dashboardSalesMoney:{format:String},dashboardSalesCompact:{format:String},
    Chart:class{constructor(canvas,config){this.data=config.data;charts.push(this);}destroy(){this.destroyed=true;}}
  });
  const source=fs.readFileSync('Frontend/Scripts/DashboardMascot.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];vm.runInContext(source,c);
  const page=fs.readFileSync('Frontend/Pages/DashboardPage.html','utf8');
  vm.runInContext(page.slice(page.indexOf('  function renderDashboardSalesChart('),page.indexOf('  function renderDashboardTopItems(')),c);
  return {c,node,checks,images,timers,listeners,charts,artworkRequests};
}
const today={period:{start:'2026-11-18',end:'2026-11-18'},hourly:true,activity:[]};
test('all twenty mascot assets rotate once per Manila calendar day without repeats in a cycle',()=>{
  const {c}=fixture(),ids=new Set();
  for(let day=0;day<20;day++)ids.add(c.dashboardSalesMascotForDay(new Date(Date.UTC(2026,10,18+day,1))).id);
  assert.equal(ids.size,20);
  const first=c.dashboardSalesMascotForDay(new Date('2026-11-18T01:00:00Z'));
  assert.equal(first.mood,'happy');assert.equal(first.id,c.dashboardSalesMascotForDay(new Date('2026-12-08T01:00:00Z')).id);
});
test('the mascot switches to sad at Manila noon, stays sad at 10 PM, and resumes rotation at midnight',()=>{
  const {c}=fixture();
  const morning=c.dashboardSalesMascotForDay(new Date('2026-11-18T01:00:00Z')),afternoon=c.dashboardSalesMascotForDay(new Date('2026-11-18T07:00:00Z'));
  assert.notEqual(morning.id,afternoon.id);assert(morning.morning);assert.equal(afternoon.morning,false);assert.equal(afternoon.mood,'sad');
  assert.equal(c.dashboardSalesMascotForDay(new Date('2026-11-18T03:59:59Z')).mood,'happy');
  assert.equal(c.dashboardSalesMascotForDay(new Date('2026-11-18T04:00:00Z')).mood,'sad');
  assert.equal(c.dashboardSalesMascotForDay(new Date('2026-11-18T14:00:00Z')).mood,'sad');
  const before=c.dashboardSalesMascotForDay(new Date('2026-11-18T15:59:59Z')),after=c.dashboardSalesMascotForDay(new Date('2026-11-18T16:00:00Z'));
  assert.equal(before.day,'2026-11-18');assert.equal(after.day,'2026-11-19');assert.notEqual(before.id,after.id);assert.equal(after.mood,'excited');
});
test('loaded zero sales keeps the full-height card with time-aware copy and a cached daily image',()=>{
  const {c,node,images,timers}=fixture();
  c.renderDashboardSalesEmptyState(today,true,new Date('2026-11-18T01:00:00Z'));
  assert.equal(node('dashboardSalesEmpty').hidden,false);assert(node('dashboardSalesPanel').classList.contains('dashboard-graph-empty'));
  assert.equal(node('dashboardGraphCaption').hidden,true);assert.match(node('dashboardSalesEmptyHeading').textContent,/little win/);
  assert.match(node('dashboardSalesMascotImage').src,/^data:image\/png;base64,/);assert.equal(images.length,1);assert.equal(timers.size,1);
  const src=node('dashboardSalesMascotImage').src;
  vm.runInContext('dashboardMascotArtwork.set("1YspQq4CF-ZsDs9Rm_ahJmUi0E29_ALwf",'+JSON.stringify(fs.readFileSync('Frontend/Assets/DashboardMascots/sad.html','utf8'))+')',c);
  c.renderDashboardSalesEmptyState(today,true,new Date('2026-11-18T07:00:00Z'));
  assert.notEqual(node('dashboardSalesMascotImage').src,src);assert.match(node('dashboardSalesMascotImage').alt,/sad/);assert.equal(images.length,2);assert.equal(timers.size,1);assert.match(node('dashboardSalesEmptyHeading').textContent,/quiet/);
});
test('historical date ranges use neutral copy and unselected categories receive a clear prompt',()=>{
  const {c,node,checks}=fixture();c.renderDashboardSalesEmptyState({...today,period:{start:'2026-11-10',end:'2026-11-17'}},true,new Date('2026-11-18T07:00:00Z'));
  assert.equal(node('dashboardSalesEmptyHeading').textContent,'No sales in this period.');
  checks.forEach(input=>input.checked=false);c.renderDashboardSalesEmptyState(today,true,new Date('2026-11-18T07:00:00Z'));
  assert.match(node('dashboardSalesEmptyHeading').textContent,/Choose a category/);assert.match(node('dashboardSalesEmptyHint').textContent,/selection is empty/);
});
test('loading and sales errors do not display the zero-sales mascot and stop its refresh timer',()=>{
  const {c,node,timers}=fixture();c.renderDashboardSalesEmptyState(today,true,new Date('2026-11-18T01:00:00Z'));
  for(const data of [null,{unavailable:'Offline'}]){c.renderDashboardSalesEmptyState(data,true);assert.equal(node('dashboardSalesEmpty').hidden,true);assert.equal(timers.size,0);}
});
test('the real chart renderer swaps the mascot for sales and preserves chart failure messages',()=>{
  const {c,node,charts,timers}=fixture();c.dashboardSalesData=today;c.renderDashboardSalesChart();assert.equal(node('dashboardSalesEmpty').hidden,false);
  c.dashboardSalesData={...today,activity:[{start:'09:00',sales:[200,0,0,0],units:[1,0,0,0]}]};c.renderDashboardSalesChart();
  assert.equal(node('dashboardSalesEmpty').hidden,true);assert.equal(node('dashboardSalesCanvas').hidden,false);assert.equal(node('dashboardGraphCaption').hidden,false);assert.equal(charts.length,1);assert.equal(charts[0].data.datasets.length,5);assert.equal(timers.size,0);
  c.Chart=undefined;c.renderDashboardSalesChart();assert.equal(node('dashboardSalesEmpty').hidden,true);assert.equal(node('dashboardGraphStatus').textContent,'Couldn’t load the sales graph.');
});
test('image failures keep the empty-state message visible and preloads retain at most two images',()=>{
  const {c,node}=fixture();c.renderDashboardSalesEmptyState(today,true,new Date('2026-11-18T01:00:00Z'));node('dashboardSalesMascotImage').onerror();
  assert.equal(node('dashboardSalesMascotImage').hidden,true);assert.match(node('dashboardSalesEmptyMessage').textContent,/No sales/);
  for(let day=0;day<4;day++)c.preloadDashboardSalesMascot(new Date(Date.UTC(2026,10,18+day,1)));
  assert(vm.runInContext('dashboardMascotImages.size',c)<=2);
});

test('daily rollover loads bundled artwork once and retries failures without external image URLs',()=>{
  const {c,artworkRequests}=fixture();
  const next=new Date('2026-11-19T01:00:00Z');
  c.preloadDashboardSalesMascot(next);c.preloadDashboardSalesMascot(next);
  assert.equal(artworkRequests.length,1);
  artworkRequests[0].failure();c.preloadDashboardSalesMascot(next);
  assert.equal(artworkRequests.length,2);
  const src=fs.readFileSync('Frontend/Assets/DashboardMascots/excited.html','utf8');
  artworkRequests[1].success({id:artworkRequests[1].id,src});
  c.preloadDashboardSalesMascot(next);
  assert.equal(artworkRequests.length,2);
  assert.equal(c.dashboardSalesMascotUrl(c.dashboardSalesMascotForDay(next)),src);
});

test('server artwork bootstrap serves exactly one approved transparent PNG and rejects arbitrary file IDs',()=>{
  const context=vm.createContext({Date,Utilities:{formatDate:(date,zone,format)=>format==='HH'?'09':'2026-11-18'},HtmlService:{createHtmlOutputFromFile:name=>({getContent:()=>fs.readFileSync(name+'.html','utf8')})}});
  vm.runInContext(fs.readFileSync('Backend/DashboardMascotArtwork.js','utf8'),context);
  const {c}=fixture();
  for(let i=0;i<20;i++){
    const selected=c.dashboardSalesMascotForDay(new Date(Date.UTC(2026,10,18+i,1)));
    const art=context.getDashboardMascotArtwork(selected.id);
    const png=Buffer.from(art.src.split(',')[1],'base64');
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png.readUInt32BE(16),180);assert.equal(png.readUInt32BE(20),180);
    assert.equal(png[25],6,'RGBA artwork must keep transparency');
  }
  assert.equal(context.getDashboardMascotArtwork().id,'1DZIkmEWEym2yUuSz3SQVTeVB5RC_y6QC');
  context.Utilities.formatDate=(date,zone,format)=>format==='HH'?'22':'2026-11-18';
  assert.equal(context.getDashboardMascotArtwork().id,'1YspQq4CF-ZsDs9Rm_ahJmUi0E29_ALwf');
  assert.throws(()=>context.getDashboardMascotArtwork('../private-file'),/Unknown mascot/);
});
