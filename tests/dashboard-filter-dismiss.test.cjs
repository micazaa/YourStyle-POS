const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const page=fs.readFileSync('Frontend/Pages/DashboardPage.html','utf8');
const start=page.indexOf('  function dismissDashboardFilters('),end=page.indexOf('\n  function ',start+1);
function fixture(){
 const filters=['sales','top'].map(name=>({open:true,selected:true,contains:target=>target?.filter===name}));
 const context=vm.createContext({document:{querySelectorAll:()=>filters.filter(filter=>filter.open)}});
 vm.runInContext(page.slice(start,end),context);return {context,filters};
}
test('outside pointer closes both dashboard filters without changing selections',()=>{
 const {context,filters}=fixture();context.dismissDashboardFilters({target:{filter:'outside'}});
 assert(filters.every(filter=>!filter.open&&filter.selected));
});
test('using controls inside one filter keeps it open and closes the other filter',()=>{
 const {context,filters}=fixture();context.dismissDashboardFilters({target:{filter:'top'}});
 assert.equal(filters[0].open,false);assert.equal(filters[1].open,true);
});
test('filter dismissal is harmless when both filters are closed',()=>{
 const {context,filters}=fixture();filters.forEach(filter=>filter.open=false);
 assert.doesNotThrow(()=>context.dismissDashboardFilters({target:null}));
});
