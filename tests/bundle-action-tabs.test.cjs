const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('Frontend/Modals/BulkDistributionModal.html','utf8');
function fixture({halves=0,disabled=false,actual=0,fullSold=false,estimate=150,rows=[],count=5}={}){
 const nodes={},calls=[],toasts=[],elements=[];
 function element(tag='div'){let text='';const n={tagName:tag.toUpperCase(),children:[],dataset:{},style:{},value:'',disabled:false,hidden:false,attributes:{},
  classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;},append(...v){this.children.push(...v);},replaceChildren(...v){text='';this.children=v;},focus(){},
  querySelector(){return null;},closest(){return null;}};
  Object.defineProperty(n,'textContent',{get(){return text+this.children.map(child=>typeof child==='string'?child:child.textContent||'').join('');},set(value){text=String(value??'');this.children=[];}});
  elements.push(n);return n;}
 const get=id=>nodes[id]||=(element(id.endsWith('Btn')||id.endsWith('Tab')?'button':'div'));
 const lineNodes=rows.map(item=>{const row=element();row.dataset={bundleNo:1,saved:item.saved?'true':'false'};
  const fields={'.bulk-distribution-product-code':{value:item.code||''},'.bulk-distribution-qty':{value:item.qty??1},'.bulk-distribution-product-search':{value:item.name||item.code||''}};
  row.querySelector=key=>fields[key]||element();row.querySelectorAll=()=>Object.values(fields);row.remove=()=>{lineNodes.splice(lineNodes.indexOf(row),1);};return row;});
 const fractions=[2,3,4].map(parts=>{const b=element('button');b.dataset.bundleSplitParts=String(parts);return b;});
 const runner={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(fn){this.failure=fn;return this;},
  splitPhysicalBundle(payload){calls.push({method:'split',payload});},distributeBulkBundle(payload){calls.push({method:'distribute',payload});}};
 const c=vm.createContext({document:{getElementById:get,createElement:element,querySelector:()=>null,querySelectorAll:selector=>{
  if(selector.includes('bulkDistributionLines'))return lineNodes;
  if(selector==='[data-bundle-split-parts]')return fractions;
  if(selector.includes('bulkDistributionModes'))return [get('bulkDistributionDistributeTab'),get('bulkDistributionSplitTab')];
  return [];}},pageReadCache:new Map(),secureScriptRun:runner,loadingIndicator:value=>value,
  showNotificationToast:(...v)=>toasts.push(v),refreshDeliveriesPage(){},bundleDisplayName_:(_id,no)=>'096-'+String.fromCharCode(64+no)});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],c);
 const bundles=Array.from({length:count},(_,i)=>({bundleNo:i+1,label:'096-'+String.fromCharCode(65+i),description:'PURE TOPS (BOX)',estimatedQuantity:estimate,productCode:'9001',actualQuantity:i?0:actual,disabled:i?false:disabled,fullSold:i?false:fullSold,soldHalves:i?0:halves,lines:[]}));
 c.seed={deliveryId:'YSD-20261016-096',type:'PINS',sheetRow:2,bundleQty:count,estimatedQuantity:estimate*count,actualQuantity:actual,bundles,physicalProducts:{'HOLDER':'9001'}};
 vm.runInContext("bulkDistributionHolder=seed;bulkDistributionProducts=[{productCode:'100001',description:'YELLOW',category:'PINS'}];bulkDistributionEmployee='Cashier';",c);
 get('bulkDistributionModal').style.display='flex';c.updateBulkDistributionSummary();
 return {c,nodes,get,calls,runner,toasts,lineNodes,fractions};
}
test('action tabs isolate split from item entry and preview the same child labels the backend assigns',()=>{
 const f=fixture();f.c.setBulkDistributionMode('split');
 assert.equal(f.get('bulkDistributionDistributePanel').hidden,true);assert.equal(f.get('bulkDistributionSplitPanel').hidden,false);
 assert.equal(f.get('confirmBulkDistributionBtn').hidden,true);assert.equal(f.get('bulkDistributionSplitBtn').disabled,false);
 assert.equal(f.get('bulkDistributionSplitParts').value,'2');assert.equal(f.fractions[2].disabled,true);
 assert.equal(f.get('bulkDistributionEmployeeLabel').textContent,'Split by');
 assert.equal(f.get('bulkDistributionSplitTab').hidden,false);
 assert.deepEqual(f.get('bulkDistributionSplitResultRows').children.map(row=>row.children.map(n=>n.textContent)),[['Bundle 096-A-1','75 pcs'],['Bundle 096-A-2','75 pcs']]);
 f.c.submitBulkDistribution(false);assert.equal(f.calls.length,0,'distribution cannot submit from Split mode');
 f.c.setBulkDistributionMode('distribute');f.c.submitBundleSplit();assert.equal(f.calls.length,0,'splitting cannot submit from Distribute mode');
});
test('draft items require explicit split confirmation and survive a failed split request',()=>{
 const f=fixture({rows:[{code:'100001',qty:25}]});f.c.setBulkDistributionMode('split');f.c.submitBundleSplit();
 assert.equal(f.calls.length,0);assert.equal(f.get('bulkDistributionSplitDraftNotice').hidden,false);assert.equal(f.get('bulkDistributionSplitBtn').textContent,'Confirm split');
 f.c.submitBundleSplit();assert.equal(f.calls.length,1);assert.equal(f.calls[0].payload.parts,2);
 assert.equal(f.lineNodes.length,1);f.runner.failure(new Error('Offline'));
 assert.equal(f.lineNodes.length,1);assert.match(f.get('bulkDistributionProductsError').textContent,/Offline/);
 assert.equal(f.get('bulkDistributionSplitBtn').disabled,false);
});
test('full bundle sales and saved distributions stay locked; half sales permit uncapped actual counts',()=>{
 for(const options of [{disabled:true,fullSold:true},{disabled:true,actual:160}]){
  const f=fixture(options);f.c.setBulkDistributionMode('split');assert.equal(f.get('bulkDistributionSplitPanel').hidden,true);
  assert.equal(f.get('bulkDistributionAddItemBtn').disabled,true);assert.equal(f.get('confirmBulkDistributionBtn').disabled,true);
  assert.equal(f.get('bulkDistributionRemarks').disabled,true);
 }
 for(const halves of [1,2]){
  const f=fixture({halves,rows:[{code:'100001',qty:200}]});
  assert.equal(f.get('bulkDistributionSplitTab').disabled,true);assert.equal(f.get('bulkDistributionAddItemBtn').disabled,false);
  assert.equal(f.get('bulkDistributionSelectedActualQty').textContent,'200 pcs');assert.equal(f.get('confirmBulkDistributionBtn').disabled,false);
  assert.equal(f.get('bulkDistributionCountNote').hidden,false);
 }
});
test('save waits for valid rows and keeps the modal open with saved entries locked',()=>{
 for(const rows of [[],[{code:'',qty:1}],[{code:'100001',qty:1.5}]])assert.equal(fixture({rows}).get('confirmBulkDistributionBtn').disabled,true);
 const f=fixture({rows:[{code:'100001',qty:155}]});f.c.submitBulkDistribution(false);
 assert.equal(f.calls[0].method,'distribute');assert.equal(f.calls[0].payload.lines[0].quantity,155);
 const bundles=structuredClone(f.c.seed.bundles);bundles[0].disabled=true;bundles[0].actualQuantity=155;
 f.runner.success({success:true,actualQuantity:155,bundles});
 assert.equal(f.get('bulkDistributionModal').style.display,'flex');assert.equal(f.lineNodes[0].dataset.saved,'true');
 assert.equal(f.get('bulkDistributionAddItemBtn').disabled,true);assert.equal(f.get('confirmBulkDistributionBtn').disabled,true);
 assert.equal(f.get('bulkDistributionSelectedActualQty').textContent,'155 pcs');
});
test('bundle navigation uses centered toggles for up to three bundles and a dropdown above three',()=>{
 for(const count of [1,3,4]){const f=fixture({count});f.c.renderBulkDistributionTabs();const children=f.get('bulkDistributionBundleTabs').children;
  assert.equal(children.some(n=>n.tagName==='SELECT'),count>3);if(count<=3)assert.equal(children[1].children.length,count);
 }
});
test('a split defaults to the first whole-piece fraction and the removed delivery summary has no dangling fields',()=>{
 const f=fixture({estimate:75});f.c.setBulkDistributionMode('split');assert.equal(f.get('bulkDistributionSplitParts').value,'3');
 assert.equal(f.get('bulkDistributionSplitOption3').textContent,'3 × 25 pcs');
 assert.doesNotMatch(html,/bulkDistribution(?:EstimatedQty|ActualQty|CurrentVariance|ProductSummary)|Delivery Summary/);
});

test('a split original locks both actions and displays the actual immediate child codes',()=>{
 const f=fixture({rows:[{code:'100001',qty:25}]});
 f.c.seed.bundles[0].split=true;
 f.c.seed.bundles.push({bundleNo:6,label:'096-A-1',parentBundleNo:1,estimatedQuantity:75},{bundleNo:7,label:'096-A-2',parentBundleNo:1,estimatedQuantity:75});
 f.c.updateBulkDistributionSummary();
 for(const id of ['bulkDistributionDistributeTab','bulkDistributionSplitTab','bulkDistributionAddItemBtn','confirmBulkDistributionBtn'])assert.equal(f.get(id).disabled,true,id);
 assert.equal(f.get('bulkDistributionRemarks').disabled,true);
 assert.equal(f.get('bulkDistributionModes').hidden,true);
 assert.equal(f.get('bulkDistributionDistributePanel').hidden,true);
 assert.equal(f.get('bulkDistributionSplitPanel').hidden,true);
 assert.equal(f.get('bulkDistributionSplitInto').hidden,false);
 assert.equal(f.get('bulkDistributionSplitInto').textContent,'Split into: 096-A-1 (75 pcs), 096-A-2 (75 pcs)');
 f.c.setBulkDistributionMode('split');f.c.submitBundleSplit();f.c.submitBulkDistribution(false);
 assert.equal(f.calls.length,0,'a stale enabled flag must not allow either write');
});
test('resulting bundles remain distributable but cannot be split again',()=>{
 const f=fixture({rows:[{code:'100001',qty:100}]});f.c.seed.bundles[0].parentBundleNo=9;f.c.seed.bundles[0].label='096-I-1';
 f.c.updateBulkDistributionSummary();f.c.setBulkDistributionMode('split');
 assert.equal(f.get('bulkDistributionDistributeTab').disabled,false);assert.equal(f.get('bulkDistributionSplitTab').disabled,true);
 assert.equal(f.get('bulkDistributionSplitTab').hidden,true);
 assert.equal(f.get('bulkDistributionAddItemBtn').disabled,false);assert.equal(f.get('confirmBulkDistributionBtn').disabled,false);
 assert.equal(f.get('bulkDistributionSplitInto').textContent,'Split from: 096-I');
 f.c.submitBundleSplit();assert.equal(f.calls.length,0);f.c.submitBulkDistribution(false);assert.equal(f.calls[0].method,'distribute');
});
test('child-code shortcuts switch bundles locally and restore item entry without losing drafts',()=>{
 const f=fixture({rows:[{code:'100001',qty:25}]});
 f.lineNodes[0].dataset.bundleNo=6;
 f.c.seed.bundles[0].split=true;
 f.c.seed.bundles.push({bundleNo:6,label:'096-A-1',parentBundleNo:1,estimatedQuantity:75,disabled:false},{bundleNo:7,label:'096-A-2',parentBundleNo:1,estimatedQuantity:75,disabled:false});
 f.c.updateBulkDistributionSummary();
 const buttons=f.get('bulkDistributionSplitInto').children.filter(node=>node.tagName==='BUTTON');
 assert.deepEqual(buttons.map(button=>button.textContent),['096-A-1','096-A-2']);
 assert.deepEqual(buttons.map(button=>button.attributes['aria-label']),['Open bundle 096-A-1','Open bundle 096-A-2']);
 buttons[0].onclick();assert.equal(f.c.getSelectedBulkBundle().bundleNo,6);
 assert.equal(f.get('bulkDistributionModes').hidden,false);assert.equal(f.get('bulkDistributionDistributePanel').hidden,false);
 assert.equal(f.get('bulkDistributionAddItemBtn').disabled,false);assert.equal(f.get('bulkDistributionSelectedActualQty').textContent,'25 pcs');
 assert.equal(f.get('bulkDistributionSplitTab').disabled,true);assert.equal(f.lineNodes.length,1);assert.equal(f.calls.length,0);
 f.c.selectBulkDistributionBundle(1);
 const second=f.get('bulkDistributionSplitInto').children.filter(node=>node.tagName==='BUTTON')[1];second.onclick();
 assert.equal(f.c.getSelectedBulkBundle().bundleNo,7);assert.equal(f.calls.length,0);
 f.c.selectBulkDistributionBundle(2);
 assert.equal(f.get('bulkDistributionSplitTab').hidden,false);assert.equal(f.get('bulkDistributionSplitTab').disabled,false);
});
function backendSplitFixture(bundle){
 let writes=0,released=false;const sheet={getLastRow:()=>1,deleteRows(){writes++;}};
 const c=vm.createContext({assertAppRequest_(){},SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet}),flush(){}},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){released=true;}})}});
 for(const file of ['Constants','GeneralDelivery'])vm.runInContext(fs.readFileSync('Backend/'+file+'.js','utf8'),c);
 c.readBulkBundleMovements_=()=>[];c.readBulkHolderDetails_=()=>({holder:{type:'PINS',bundles:[bundle]}});c.changeInventoryStockBatch_=()=>{writes++;};
 c.getYourStyleDeliveryProducts=()=>{throw Error('Must reject before loading products');};
 return {c,writes:()=>writes,released:()=>released};
}
test('backend rejects split descendants and distribution from split originals before stock writes',()=>{
 const payload={deliveryId:'YSD-20261016-096',sheetRow:2,bundleNo:1,parts:2,employee:'Cashier',lines:[{productCode:'100001',quantity:1}]};
 const child=backendSplitFixture({bundleNo:1,parentBundleNo:9,actualQuantity:0,disabled:false,soldHalves:0});
 assert.match(child.c.splitPhysicalBundle(payload).message,/cannot be split again/);assert.equal(child.writes(),0);assert.equal(child.released(),true);
 const original=backendSplitFixture({bundleNo:1,split:true,disabled:false,actualQuantity:0});
 assert.match(original.c.splitPhysicalBundle(payload).message,/Only an unopened, unsold bundle/);
 assert.match(original.c.distributeBulkBundle(payload).message,/no longer available for distribution/);assert.equal(original.writes(),0);assert.equal(original.released(),true);
});
test('child-code preview follows the persisted split record labels',()=>{
 const {c}=backendSplitFixture({});
 const row=Array(18).fill('');row[2]='ADJUSTMENT';row[8]=-1;row[15]=JSON.stringify({kind:'BUNDLE_SPLIT',deliveryId:'YSD-20261016-096',sheetRow:2,bundleNo:1,parts:2,pieces:75,productCode:'90002',children:[6,7]});
 const bundles=c.physicalBundleDefinitions_('YSD-20261016-096',2,5,[row]);
 const labels=Array.from(bundles.filter(b=>b.parentBundleNo===1),b=>b.label);
 const f=fixture();f.c.setBulkDistributionMode('split');
 assert.deepEqual(f.get('bulkDistributionSplitResultRows').children.map(row=>row.children[0].textContent.replace(/^Bundle /,'')),labels);
});
