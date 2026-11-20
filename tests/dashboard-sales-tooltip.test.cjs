const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('Frontend/Pages/DashboardPage.html','utf8');
function fixture(){
 const nodes=new Map(),checks=['all','YOURFINDS','PINS','OTHERS','WHOLESALE'].map(category=>({checked:true,dataset:{salesChartCategory:category}}));
 const element=()=>({children:[],style:{setProperty(name,value){this[name]=value;}},attrs:{},hidden:false,textContent:'',offsetWidth:200,offsetHeight:130,
  append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(key,value){this.attrs[key]=value;},
  getBoundingClientRect(){return {left:20,top:100,width:700,height:350};}});
 const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const c=vm.createContext({Date,Intl,Map,document:{getElementById:node,createElement:element,createTextNode:text=>({textContent:text})},
  dashboardSalesChecks:checks,dashboardSalesSeries:[['YOURFINDS','YourFinds','#e77ca3'],['PINS','Pins','#a18ad7'],['OTHERS','Other items','#e4a173'],['WHOLESALE','Wholesale','#69ae9a']],
  dashboardNumberFormat:new Intl.NumberFormat('en-PH'),dashboardSalesMoney:{format:String},dashboardSalesCompact:{format:String},
  dashboardSalesShortDate:new Intl.DateTimeFormat('en-PH',{timeZone:'UTC',month:'short',day:'numeric'}),
  dashboardSalesHour:new Intl.DateTimeFormat('en-PH',{timeZone:'UTC',hour:'numeric',hour12:true}),
  dashboardSalesData:null,dashboardSalesChart:null,dashboardSalesPlot:node('plot'),dashboardSalesScroll:{scrollLeft:0},
  renderDashboardSalesEmptyState(){},updateDashboardSalesNavigation(){},matchMedia:()=>({matches:true}),
  Chart:class{constructor(canvas,config){this.canvas=canvas;this.options=config.options;this.data=config.data;}setDatasetVisibility(){}update(){}destroy(){}}
 });
 vm.runInContext(source.slice(source.indexOf('  const dashboardSalesTooltipMoney ='),source.indexOf('  const dashboardSalesCompact =')),c);
 for(const name of ['dashboardWeeklyActivity','renderDashboardSalesTooltip','renderDashboardSalesChart']){
  const start=source.indexOf('  function '+name+'('),end=source.indexOf('\n  }',start)+4;
  vm.runInContext(source.slice(start,end),c);
 }
 const context={chart:{canvas:node('dashboardSalesCanvas')},tooltip:{opacity:1,dataPoints:[{dataIndex:0}],caretX:350,caretY:100}};
 return {c,node,checks,context,rows:()=>node('dashboardSalesTooltipRows').children};
}
const point={start:'2026-10-04',end:'2026-10-04',units:[8,46,3,0],sales:[8400,18950.2,900,0]};
test('tooltip lists real category units and sales and aligns totals without counting the line again',()=>{
 const f=fixture();f.context.tooltip.dataPoints=[0,1,2,3,4].map(datasetIndex=>({datasetIndex,dataIndex:0}));f.c.renderDashboardSalesTooltip(f.context,[point],{hourly:false});
 assert.equal(f.rows().length,3);assert.equal(f.rows()[1].children[1].textContent,'46');assert.equal(f.rows()[1].children[2].textContent,'₱18,950');
 assert.equal(f.node('dashboardSalesTooltipDate').textContent,'Oct 4');assert.equal(f.node('dashboardSalesTooltipUnits').textContent,'57');assert.equal(f.node('dashboardSalesTooltipNet').textContent,'₱28,250');
assert.equal(f.rows()[0].children[0].children[0].children[0].style.backgroundColor,'#e77ca3');
});
test('tooltip follows selected categories, including zero values and negative net sales',()=>{
 const f=fixture();f.checks[1].checked=false;f.checks[3].checked=false;f.checks[4].checked=false;
 f.c.renderDashboardSalesTooltip(f.context,[{...point,sales:[8400,-50,900,0]}],{hourly:false});
 assert.equal(f.rows().length,1);assert.equal(f.node('dashboardSalesTooltipUnits').textContent,'46');assert.equal(f.node('dashboardSalesTooltipNet').textContent,'-₱50');
 f.checks.forEach(check=>check.checked=false);f.c.renderDashboardSalesTooltip(f.context,[point],{hourly:false});assert.equal(f.node('dashboardSalesTooltip').hidden,true);
});
test('hourly headings include the day and weekly headings use the full bucket range',()=>{
 const f=fixture();f.c.renderDashboardSalesTooltip(f.context,[{...point,start:'14:00'}],{hourly:true,period:{start:'2026-10-04'}});
 assert.equal(f.node('dashboardSalesTooltipDate').textContent,'Oct 4 · 2 PM');
 const week=f.c.dashboardWeeklyActivity([{...point,start:'2026-10-05',end:'2026-10-05'},{...point,start:'2026-10-06',end:'2026-10-06'}]);
 f.c.renderDashboardSalesTooltip(f.context,week,{hourly:false});assert.equal(f.node('dashboardSalesTooltipDate').textContent,'Oct 5 – Oct 6');assert.equal(f.node('dashboardSalesTooltipNet').textContent,'₱56,500');
});
test('chart updates replace the tooltip data closure and hide stale tooltips',()=>{
 const f=fixture();f.c.dashboardSalesData={hourly:false,activity:[point]};f.c.renderDashboardSalesChart();const chart=f.c.dashboardSalesChart;
 assert.equal(chart.options.plugins.tooltip.enabled,false);chart.options.plugins.tooltip.external({...f.context,chart});assert.equal(f.node('dashboardSalesTooltipNet').textContent,'₱28,250');
 f.c.dashboardSalesData={hourly:false,activity:[{...point,sales:[10,0,0,0]}]};f.c.renderDashboardSalesChart();assert.equal(f.node('dashboardSalesTooltip').hidden,true);
 chart.options.plugins.tooltip.external({...f.context,chart});assert.equal(f.node('dashboardSalesTooltipNet').textContent,'₱10');
 f.context.tooltip.opacity=0;chart.options.plugins.tooltip.external({...f.context,chart});assert.equal(f.node('dashboardSalesTooltip').hidden,true);
});
test('tooltip is clamped to the chart frame when the canvas is horizontally scrolled',()=>{
 const f=fixture();f.context.chart.canvas={getBoundingClientRect:()=>({left:-600,top:100})};
 f.c.renderDashboardSalesTooltip(f.context,[point],{hourly:false});assert.equal(f.node('dashboardSalesTooltip').style.left,'8px');assert.equal(f.node('dashboardSalesTooltip').style.top,'-42px');
 f.context.chart.canvas={getBoundingClientRect:()=>({left:1000,top:100})};f.c.renderDashboardSalesTooltip(f.context,[point],{hourly:false});assert.equal(f.node('dashboardSalesTooltip').style.left,'492px');
});

test('tooltip stays above the point, even above the plot, with an anchored caret',()=>{
 const f=fixture();f.c.renderDashboardSalesTooltip(f.context,[point],{hourly:false});
 const tip=f.node('dashboardSalesTooltip');assert(parseFloat(tip.style.top)+tip.offsetHeight<f.context.tooltip.caretY);assert.equal(tip.style['--dashboard-tooltip-caret'],'100px');
 f.context.tooltip.caretY=5;f.c.renderDashboardSalesTooltip(f.context,[point],{hourly:false});assert.equal(parseFloat(tip.style.top)+100,8);
});
test('zero-activity rows disappear while refunds and original decimal precision are preserved',()=>{
 const f=fixture();const original={...point,units:[0,0,0,0],sales:[0,0,-12.6,0]},copy=JSON.stringify(original);
 f.c.renderDashboardSalesTooltip(f.context,[original],{hourly:false});assert.equal(f.rows().length,1);assert.equal(f.rows()[0].children[2].textContent,'-₱13');assert.equal(f.node('dashboardSalesTooltipNet').textContent,'-₱13');assert.equal(JSON.stringify(original),copy);
 f.c.renderDashboardSalesTooltip(f.context,[{...original,sales:[0,0,0,0]}],{hourly:false});assert.equal(f.rows().length,0);assert.equal(f.node('dashboardSalesTooltipNet').textContent,'₱0');
});
