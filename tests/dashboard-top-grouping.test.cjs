const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(){
 const element=()=>({children:[],style:{},dataset:{},textContent:'',attrs:{},hidden:false,append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(key,value){this.attrs[key]=value;},addEventListener(){}});
 const nodes=Object.fromEntries(['dashboardTopCategory','dashboardTopRankSales','dashboardTopItems','dashboardTopScroll','dashboardTopEmpty'].map(id=>[id,element()]));
 nodes.dashboardTopCategory.value='all';
 const options=['PINS','YOURFINDS'].map(category=>({hidden:true,dataset:{topGroup:category},input:{checked:false},querySelector(){return this.input;}}));
 const items=[
  {category:'PINS',name:'Yellow NEW',group:'NEW',units:2,sales:100},
  {category:'PINS',name:'Black NEW',group:'NEW',units:3,sales:150},
  {category:'YOURFINDS',code:'YFD-1001',name:'Item one',group:'SE',units:1,sales:500},
  {category:'YOURFINDS',code:'YFD-1002',name:'Item two',group:'SE',units:2,sales:700},
  {category:'OTHERS',name:'Bags',group:'OTHERS',units:4,sales:400},
  {category:'OTHERS',name:'Shoes',group:'OTHERS',units:6,sales:600}
 ];
 const c=vm.createContext({document:{getElementById:id=>nodes[id],querySelectorAll:()=>options,createElement:element,createDocumentFragment:element},
  dashboardSalesData:{items},dashboardSalesSeries:[['PINS','Pins'],['YOURFINDS','YourFinds'],['OTHERS','Other items']],
  dashboardNumberFormat:{format:String},dashboardSalesMoney:{format:String}});
 const source=fs.readFileSync('Frontend/Pages/DashboardPage.html','utf8');
 const start=source.indexOf('  function renderDashboardTopItems('),end=source.indexOf('\n  function ',start+1);
 vm.runInContext(source.slice(start,end),c);
 return {c,nodes,options,rows:()=>nodes.dashboardTopItems.children[0]?.children||[]};
}
test('All categories and an empty category selection show both grouping controls',()=>{
 const f=fixture();f.c.renderDashboardTopItems();assert(f.options.every(option=>!option.hidden));assert.equal(f.rows().length,6);
 f.nodes.dashboardTopCategory.value='';f.c.renderDashboardTopItems();assert(f.options.every(option=>!option.hidden));assert.equal(f.rows().length,6);
});
test('code and size grouping apply independently within All categories without grouping others',()=>{
 const f=fixture();f.options[0].input.checked=true;f.c.renderDashboardTopItems();assert.equal(f.rows().length,5);
 assert(f.rows().some(row=>row.children[2].textContent==='NEW'&&row.children[3].textContent==='5 units'));
 f.options[1].input.checked=true;f.nodes.dashboardTopRankSales.checked=true;f.c.renderDashboardTopItems();assert.equal(f.rows().length,4);
 const first=f.rows()[0];assert.equal(first.children[2].textContent,'SE');assert.equal(first.children[3].textContent,'3 units');assert.equal(first.children[3].children[0].textContent,' · 1200');
 assert(f.rows().some(row=>row.children[2].textContent==='Bags'));assert(f.rows().some(row=>row.children[2].textContent==='Shoes'));
 f.options[0].input.checked=false;f.c.renderDashboardTopItems();assert.equal(f.rows().length,5);
});
test('specific categories retain the relevant grouping option and selection',()=>{
 const f=fixture();f.options.forEach(option=>option.input.checked=true);
 f.nodes.dashboardTopCategory.value='PINS';f.c.renderDashboardTopItems();assert.equal(f.options[0].hidden,false);assert.equal(f.options[1].hidden,true);assert.equal(f.rows().length,1);
 f.nodes.dashboardTopCategory.value='YOURFINDS';f.c.renderDashboardTopItems();assert.equal(f.options[1].hidden,false);assert.equal(f.rows().length,1);
 f.nodes.dashboardTopCategory.value='all';f.c.renderDashboardTopItems();assert(f.options.every(option=>!option.hidden&&option.input.checked));assert.equal(f.rows().length,4);
});
