// The list cache contains display data only. Checkout and edits always re-read authoritative stock.
const INVENTORY_READ_SECONDS_ = 300;
let INVENTORY_EXECUTION_INDEX_ = null;
function invalidateInventoryRead_(spreadsheetId) {
  const id = spreadsheetId || SpreadsheetApp.getActiveSpreadsheet().getId();
  PropertiesService.getScriptProperties().setProperty('inventory-read:'+id,Utilities.getUuid());
  INVENTORY_EXECUTION_INDEX_=null;
}
function inventoryReadVersion_() {
  const id=SpreadsheetApp.getActiveSpreadsheet().getId();
  return id+':'+(PropertiesService.getScriptProperties().getProperty('inventory-read:'+id)||'initial');
}
function inventoryRowIsSoldYourFinds_(item) {
  return String(item.category).trim().toUpperCase()==='YOURFINDS' && String(item.inventoryType).toUpperCase()==='UNIQUE' &&
    Number(item.stock)<=0 && ['ACTIVE','INACTIVE'].includes(String(item.status).toUpperCase());
}
function inventoryListStatus_(item) {
  if (['INCOMPLETE','RESERVED','RETURNED','CONVERTED'].includes(item.status)) return item.status;
  if (item.stock<0) return 'NEGATIVE STOCK';
  if (item.stock===0) return 'SOLD OUT';
  if (item.inventoryType==='UNIQUE' || item.category==='YOURFINDS') return 'IN STOCK';
  return item.lowStockAt>0 && item.stock<=item.lowStockAt ? 'LOW STOCK' : 'IN STOCK';
}
function readInventoryListIndex_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet(), sheet=ss.getSheetByName(SHEETS.INVENTORY);
  if(!sheet || sheet.getLastRow()<2)return [];
  const products=getProductMaster_({cashierOnly:true,compactRead:true});
  const byCode=new Map(products.map(product=>[product.productCode,product]));
  const count=sheet.getLastRow()-1;
  const values=sheet.getRange(2,1,count,INV_COL.IMAGE).getValues();
  // Only identifiers need displayed values, so formatted leading zeros survive.
  const codes=sheet.getRange(2,INV_COL.CODE,count,1).getDisplayValues();
  return values.map((row,index)=>{
    const code=String(codes[index][0]||'').trim(), product=byCode.get(code);
    if(!code && !row[INV_IDX.DESCRIPTION])return null;
    const item={code:code,name:String(row[INV_IDX.DESCRIPTION]||'').trim(),
      size:String(row[INV_IDX.SIZE]||'').trim().replace(/^BULKY$/i,'BNE'),
      category:String(row[INV_IDX.CATEGORY]||'OTHERS').trim().toUpperCase(),
      inventoryType:String(row[INV_IDX.INVENTORY_TYPE]||'STOCK').trim().toUpperCase(),
      status:String(row[INV_IDX.STATUS]||'ACTIVE').trim().toUpperCase(),
      stock:Number(row[INV_IDX.STOCK])||0,totalSold:Number(row[INV_IDX.TOTAL_SOLD])||0,
      price:Number(row[INV_IDX.YS_PRICE])||0,imageUrl:String(row[INV_IDX.IMAGE]||'').trim(),
      lowStockAt:product ? Number(product.lowStockAt)||0 : 0,
      productStatus:product ? product.status : 'ACTIVE',salePrices:product ? product.salePrices : []};
    if(inventoryRowIsSoldYourFinds_(item))item.status='INACTIVE';
    // Administrative status of a unique item belongs to Inventory, not its shared size definition.
    if(item.inventoryType==='UNIQUE' || item.status==='INACTIVE')item.productStatus=item.status==='INACTIVE'?'DEACTIVATED':'ACTIVE';
    item.availability=inventoryListStatus_(item);
    item.searchText=[code,item.name,item.category,item.size].join(' ').toLowerCase();
    return item;
  }).filter(Boolean);
}
function inventoryListIndex_(version) {
  if(INVENTORY_EXECUTION_INDEX_&&INVENTORY_EXECUTION_INDEX_.version===version)return INVENTORY_EXECUTION_INDEX_.items;
  const cache=CacheService.getScriptCache(), prefix='inventory-list:'+version;
  let raw;try{raw=cache.get(prefix);}catch(error){console.warn('Inventory list cache unavailable.');}
  if(raw){
    try {
      const manifest=JSON.parse(raw), keys=Array.from({length:manifest.count},(_,i)=>prefix+':'+manifest.id+':'+i);
      const chunks=cache.getAll(keys);
      if(keys.every(key=>chunks[key]!==undefined && chunks[key]!==null)){
        const items=keys.flatMap(key=>JSON.parse(chunks[key]));INVENTORY_EXECUTION_INDEX_={version:version,items:items};return items;
      }
    } catch(error){console.warn('Inventory list cache missed.');}
  }
  const started=Date.now(), items=readInventoryListIndex_(), id=Utilities.getUuid();
  INVENTORY_EXECUTION_INDEX_={version:version,items:items};
  // Small chunks stay below CacheService's per-entry byte limit, including Unicode names.
  const chunks=[], pending=[];let length=2;
  items.forEach(item=>{
    const json=JSON.stringify(item);
    if(length+json.length+1>18000 && pending.length){chunks.push('['+pending.join(',')+']');pending.length=0;length=2;}
    pending.push(json);length+=json.length+1;
  });
  if(pending.length)chunks.push('['+pending.join(',')+']');
  if(chunks.length<=500 && inventoryReadVersion_()===version){
    const entries={};chunks.forEach((chunk,i)=>{entries[prefix+':'+id+':'+i]=chunk;});
    try {if(chunks.length)cache.putAll(entries,INVENTORY_READ_SECONDS_);cache.put(prefix,JSON.stringify({id:id,count:chunks.length}),INVENTORY_READ_SECONDS_);}
    catch(error){console.warn('Inventory list cache unavailable.');}
  }
  console.log(JSON.stringify({event:'inventory_list_index',rows:items.length,buildMs:Date.now()-started}));
  return items;
}
function inventoryListRequest_(request) {
  request=request||{};
  const sortKeys=['code','name','category','size','price','stock','availability','active'];
  return {search:String(request.search||'').trim().toLowerCase().slice(0,200),category:String(request.category||'').toUpperCase(),
    status:String(request.status||'').toUpperCase(),stockStatus:String(request.stockStatus||'').toUpperCase(),
    exclude:Array.from(new Set((Array.isArray(request.exclude)?request.exclude:[request.exclude===undefined?'DEACTIVATED':request.exclude])
      .map(value=>String(value||'').trim().toUpperCase()).filter(Boolean))).sort(),incompleteOnly:request.incompleteOnly===true,
    sort:sortKeys.includes(request.sort)?request.sort:'name',direction:Number(request.direction)===-1?-1:1,
    page:Math.max(1,Math.floor(Number(request.page)||1)),pageSize:50};
}
function inventoryListExcluded_(item,request) {
  if(!request.exclude)return false;
  const exclusions=Array.isArray(request.exclude)?request.exclude:[request.exclude];
  return exclusions.some(status=>status==='DEACTIVATED'?item.productStatus==='DEACTIVATED'||item.status==='INACTIVE':
    status==='ON SALE'?item.productStatus==='ON SALE':item.availability===status||status==='SOLD OUT'&&item.availability==='NEGATIVE STOCK');
}
function inventoryItemSearchText_(item) {
  const values=['code','name','size','category','inventoryType','status','productStatus','availability','stockStatus',
    'stock','price','regularPrice','origPrice','lowStockAt','totalSold','deliveryId','dateDelivered','createdAt','updatedAt','costPrice','costSource']
    .map(field=>item[field]??'');
  ['price','regularPrice','origPrice','costPrice'].forEach(field=>{
    if(item[field]!==undefined&&item[field]!==null&&Number.isFinite(Number(item[field])))values.push(Number(item[field]).toFixed(2));
  });
  (item.salePrices||[]).forEach(tier=>values.push(tier.price,Number(tier.price).toFixed(2),tier.end||'',tier.remaining??''));
  if(item.status==='INACTIVE'||item.productStatus==='DEACTIVATED')values.push('disabled inactive');
  if(item.availability==='NEGATIVE STOCK'||Number(item.stock)<=0)values.push('sold out');
  return values.join(' ').toLowerCase();
}
function inventoryListMatches_(item,request) {
  if(request.search){const text=item.searchText||inventoryItemSearchText_(item);if(!request.search.split(/\s+/).every(term=>text.includes(term)))return false;}
  return (!request.category||item.category===request.category) &&
    (!request.status||item.productStatus===request.status) &&
    (!request.stockStatus||item.availability===request.stockStatus||request.stockStatus==='SOLD OUT'&&item.availability==='NEGATIVE STOCK') &&
    (!request.incompleteOnly||item.category==='YOURFINDS'&&item.status==='INCOMPLETE');
}
function inventoryGroupKey_(item) {
  const name=String(item.category==='YOURFINDS'?(item.size||'Unspecified size'):(item.name||'Unnamed item')).trim().replace(/\s+/g,' ');
  return JSON.stringify([item.category,name.toUpperCase()]);
}
function inventoryListGroups_(items,request) {
  const groups=new Map(),matches=new Set();
  items.forEach(item=>{
    if(inventoryListExcluded_(item,request))return;
    const key=inventoryGroupKey_(item);
    if(inventoryListMatches_(item,request))matches.add(key);
    if(!groups.has(key))groups.set(key,{key:key,category:item.category,
      name:item.category==='YOURFINDS'?(item.size||'Unspecified size'):(item.name||'Unnamed item'),stock:0,positiveStock:0,lowStockAt:0});
    const group=groups.get(key);
    if(!['RETURNED','CONVERTED'].includes(item.status)){group.stock+=item.stock;group.positiveStock+=Math.max(0,item.stock);}
    group.lowStockAt=Math.max(group.lowStockAt,item.lowStockAt);
  });
  return Array.from(groups.values()).filter(group=>matches.has(group.key)).map(group=>{
    group.status=group.stock<=0?'SOLD OUT':group.category!=='YOURFINDS'&&group.lowStockAt>0&&group.stock<=group.lowStockAt?'LOW STOCK':'IN STOCK';return group;
  });
}
function inventoryListSaleRows_(items) {
  return items.flatMap(item=>{
    const tiers=item.salePrices||[];
    if(item.productStatus!=='ON SALE'||!tiers.length)return [item];
    let available=Math.max(0,item.stock);
    const saleRows=tiers.map((tier,index)=>{
      const quantity=tier.remaining==null?available:Math.min(available,Math.max(0,Number(tier.remaining)||0));available-=quantity;
      return {...item,stock:quantity,price:Number(tier.price)||0,saleVariant:'SALE',saleTierIndex:index,saleReferenceId:tier.referenceId,saleEnd:tier.end};
    });
    const regular=available>0||item.stock<0?[{...item,stock:item.stock<0?item.stock:available,saleVariant:'REGULAR'}]:[];
    return regular.concat(saleRows);
  });
}
function inventoryPageSlice_(items,page,size) {
  const pageCount=Math.max(1,Math.ceil(items.length/size)),current=Math.min(page,pageCount);
  return {items:items.slice((current-1)*size,current*size),total:items.length,page:current,pageCount:pageCount,pageSize:size};
}
function inventoryResponseCacheKey_(version,kind,query) {
  const manager=!!(ACCESS_REQUEST_CONTEXT_&&ACCESS_REQUEST_CONTEXT_.actor&&ACCESS_REQUEST_CONTEXT_.actor.manager);
  const digest=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([manager,query])));
  return 'inventory-response:v3:'+kind+':'+version+':'+digest;
}
function readInventoryResponse_(key) {
  try {const raw=CacheService.getScriptCache().get(key);return raw?JSON.parse(raw):null;}
  catch(error){return null;}
}
function cacheInventoryResponses_(entries,version) {
  // Never publish a result over a concurrent inventory mutation.
  if(inventoryReadVersion_()!==version)return;
  const safe={};
  Object.keys(entries).forEach(key=>{
    const json=JSON.stringify(entries[key]);
    if(Utilities.newBlob(json).getBytes().length<=90000)safe[key]=json;
  });
  if(!Object.keys(safe).length)return;
  try {CacheService.getScriptCache().putAll(safe,INVENTORY_READ_SECONDS_);}
  catch(error){console.warn('Inventory page cache unavailable.');}
}
function inventorySortComparer_() {
  // Reuse locale rules for the whole sort instead of constructing them for every comparison.
  const compare=typeof Intl!=='undefined'&&Intl.Collator
    ? new Intl.Collator(undefined,{numeric:true,sensitivity:'base'}).compare
    : (left,right)=>left.localeCompare(right,undefined,{numeric:true,sensitivity:'base'});
  return (left,right)=>compare(String(left==null?'':left),String(right==null?'':right));
}
function inventoryListResponse_(rows,query,version,cards) {
  const result=inventoryPageSlice_(rows,query.page,query.pageSize);
  result.items=result.items.map(item=>({code:item.code,name:item.name,size:item.size,category:item.category,inventoryType:item.inventoryType,
    status:item.status,stock:item.stock,price:item.price,productStatus:item.productStatus,lowStockAt:item.lowStockAt,
    imageUrl:item.imageUrl,saleVariant:item.saleVariant||'',saleTierIndex:item.saleTierIndex,saleReferenceId:item.saleReferenceId||'',listOnly:true}));
  return {success:true,...result,version:version,cards:cards};
}
function inventoryPriorityPages_(version,query,response) {
  if(query.page!==1||response.pageCount<2)return [];
  const queries=Array.from({length:Math.min(3,response.pageCount)-1},(_,index)=>({...query,page:index+2}));
  const keys=queries.map(page=>inventoryResponseCacheKey_(version,'list-v2',page));
  try {
    const cached=CacheService.getScriptCache().getAll(keys);
    if(keys.some(key=>!cached[key]))return null;
    return queries.map((page,index)=>({query:page,data:JSON.parse(cached[keys[index]])}));
  }catch(error){return null;}
}
function getInventoryPage(request) {
  assertAppRequest_();
  const started=Date.now(),version=inventoryReadVersion_(),query=inventoryListRequest_(request);
  if(request&&request.knownVersion===version)return {success:true,notModified:true,version:version};
  const key=inventoryResponseCacheKey_(version,'list-v2',query),cached=readInventoryResponse_(key);
  if(cached){
    const priorityPages=inventoryPriorityPages_(version,query,cached);
    if(priorityPages!==null){
      console.log(JSON.stringify({event:'inventory_page',cacheHit:true,rowsReturned:cached.items.length,priorityPages:priorityPages.length,elapsedMs:Date.now()-started}));
      return {...cached,priorityPages:priorityPages};
    }
  }
  const base=inventoryListIndex_(version),index=query.search?inventorySearchIndex_(base,version):base,groups=inventoryListGroups_(index,query);
  const rows=inventoryListSaleRows_(index.filter(item=>!inventoryListExcluded_(item,query)&&inventoryListMatches_(item,query)));
  const compare=inventorySortComparer_();
  rows.sort((a,b)=>{
    const key=query.sort;
    const left=key==='active'?a.productStatus:key==='availability'?inventoryListStatus_(a):a[key];
    const right=key==='active'?b.productStatus:key==='availability'?inventoryListStatus_(b):b[key];
    const comparison=typeof left==='number'?left-right:compare(left,right);
    return comparison*query.direction||compare(a.code,b.code)||(a.saleTierIndex||0)-(b.saleTierIndex||0);
  });
  const cards={products:groups.length,low:groups.filter(group=>group.status==='LOW STOCK').length,sold:groups.filter(group=>group.status==='SOLD OUT').length};
  const response=inventoryListResponse_(rows,query,version,cards),entries={[key]:response};
  response.summaryPreviews=['products','low','sold'].map(kind=>{
    const summaryQuery={...query,page:1,kind:kind,summarySort:'category',summaryDirection:1};
    return {query:summaryQuery,data:inventorySummaryResponse_(groups,summaryQuery,version)};
  });
  // Send the first three pages together; render only fifty rows at a time in the browser.
  response.priorityPages=[];
  const lastPage=query.page===1?Math.min(3,response.pageCount):Math.min(response.page+1,response.pageCount);
  for(let page=response.page+1;page<=lastPage;page++){
    const next={...query,page:page},data=inventoryListResponse_(rows,next,version,cards);
    entries[inventoryResponseCacheKey_(version,'list-v2',next)]=data;
    if(query.page===1)response.priorityPages.push({query:next,data:data});
  }
  // Cache pages separately to keep each cache entry small; assemble the priority bundle on reads.
  entries[key]={...response};delete entries[key].priorityPages;
  cacheInventoryResponses_(entries,version);
  console.log(JSON.stringify({event:'inventory_page',cacheHit:false,rowsReturned:response.items.length,rowsMatched:response.total,elapsedMs:Date.now()-started}));
  return response;
}

function inventorySummaryResponse_(groups,request,version) {
  const query=inventoryListRequest_(request),kind=String(request&&request.kind||'products');
  const matching=groups.filter(group=>kind==='low'?group.status==='LOW STOCK':kind==='sold'?group.status==='SOLD OUT':kind==='stock'?group.stock>0:true);
  const key=['category','name','stock','status'].includes(request&&request.summarySort)?request.summarySort:'category';
  const direction=Number(request&&request.summaryDirection)===-1?-1:1,compare=inventorySortComparer_();
  matching.sort((a,b)=>(key==='stock'?a.stock-b.stock:compare(a[key],b[key]))*direction||compare(a.key,b.key));
  const categories=['PINS','OTHERS','YOURFINDS'].map(category=>{
    const rows=matching.filter(group=>group.category===category);
    return {category:category,groups:rows.length,units:rows.reduce((sum,group)=>sum+group.positiveStock,0)};
  });
  return {success:true,...inventoryPageSlice_(matching,query.page,query.pageSize),version:version,categories:categories,
    positiveUnits:matching.reduce((sum,group)=>sum+group.positiveStock,0)};
}
function getInventorySummaryPage(request) {
  assertAppRequest_();
  const query=inventoryListRequest_(request),version=inventoryReadVersion_();
  const cacheKey=inventoryResponseCacheKey_(version,'summary',[query,request&&request.kind,request&&request.summarySort,request&&request.summaryDirection]);
  const cached=readInventoryResponse_(cacheKey);if(cached)return cached;
  const base=inventoryListIndex_(version),groups=inventoryListGroups_(query.search?inventorySearchIndex_(base,version):base,query);
  const response=inventorySummaryResponse_(groups,request,version);
  cacheInventoryResponses_({[cacheKey]:response},version);
  return response;
}
const INVENTORY_SNAPSHOT_FIELDS_ = ['code','name','size','category','inventoryType','status','stock','price','imageUrl','lowStockAt','productStatus','salePrices'];
function getInventorySnapshotBatch(request) {
  assertAppRequest_();
  request=request||{};
  const version=inventoryReadVersion_();
  if(request.version&&request.version!==version)return {success:true,changed:true,version:version};
  const offset=Math.max(0,Math.floor(Number(request.offset)||0));
  const limit=Math.max(1,Math.min(1000,Math.floor(Number(request.limit)||1000)));
  const index=inventoryListIndex_(version),items=index.slice(offset,offset+limit);
  const current=inventoryReadVersion_();
  if(current!==version)return {success:true,changed:true,version:current};
  return {success:true,version:version,offset:offset,total:index.length,nextOffset:offset+items.length,
    done:offset+items.length>=index.length,fields:INVENTORY_SNAPSHOT_FIELDS_,
    items:items.map(item=>INVENTORY_SNAPSHOT_FIELDS_.map(field=>item[field]))};
}
function inventoryBrowserQueryFunctions_() {
  // Export only the pure display/query functions. No authentication, sheet access or cost readers.
  return [inventoryListStatus_,inventoryListRequest_,inventoryListExcluded_,inventoryItemSearchText_,inventoryListMatches_,inventoryGroupKey_,
    inventoryListGroups_,inventoryListSaleRows_,inventoryPageSlice_,inventorySortComparer_,inventoryListResponse_,inventorySummaryResponse_]
    .map(fn=>fn.toString()).join('\n');
}

function getInventoryItemDetails(code) {
  assertAppRequest_();
  code=String(code||'').trim();
  const version=inventoryReadVersion_(),manager=!!ACCESS_REQUEST_CONTEXT_.actor.manager;
  const cacheKey=inventoryResponseCacheKey_(version,'item-details',[code,manager]);
  const cached=readInventoryResponse_(cacheKey);if(cached)return cached;
  const ss=SpreadsheetApp.getActiveSpreadsheet(),sheet=ss.getSheetByName(SHEETS.INVENTORY);
  if(!sheet||sheet.getLastRow()<2)throw new Error('Inventory item not found.');
  const matches=sheet.getRange(2,INV_COL.CODE,sheet.getLastRow()-1,1).createTextFinder(code).matchCase(true).matchEntireCell(true).findAll();
  if(matches.length!==1)throw new Error('Inventory item is missing or its barcode is duplicated.');
  const products=getProductMaster_({compactRead:true});
  const item=getFullInventory({products:products,rowNumber:matches[0].getRow(),includeDeliveryMetadata:false})[0];
  if(!item)throw new Error('Inventory item not found.');
  if(inventoryRowIsSoldYourFinds_(item)){item.status='INACTIVE';item.productStatus='DEACTIVATED';}
  if(manager)applyInventoryDetailCosts_([item],products,sheet);
  const response={success:true,item:item,version:version};
  cacheInventoryResponses_({[cacheKey]:response},version);
  return response;
}
function applyInventoryDetailCosts_(items,products,sheet) {
  const byCode=new Map(),bySize=new Map();
  products.forEach(product=>{
    if(!byCode.has(product.productCode))byCode.set(product.productCode,product);
    if(String(product.category).toUpperCase()==='YOURFINDS'){
      const size=normalizeYourFindsSaleSize_(product.description);
      if(!bySize.has(size))bySize.set(size,product);
    }
  });
  const custom=items.filter(item=>isYourFindsUnique_(item)&&normalizeYourFindsSaleSize_(item.size)==='CUSTOM');
  const column=custom.length?customCostColumn_(sheet,false):null;
  const start=custom.length?Math.min(...custom.map(item=>item.rowNumber)):0;
  const end=custom.length?Math.max(...custom.map(item=>item.rowNumber)):0;
  const costs=column?sheet.getRange(start,column,end-start+1,1).getValues():[];
  items.forEach(item=>{
    const yourFinds=isYourFindsUnique_(item),size=normalizeYourFindsSaleSize_(item.size);
    if(yourFinds&&size==='CUSTOM'){
      const raw=column?costs[item.rowNumber-start][0]:'';
      item.costPrice=raw===''||raw===null?null:Number(raw)||0;item.costSource='CUSTOM';
    }else{
      const product=yourFinds?bySize.get(size):byCode.get(item.code);
      item.costPrice=product?product.costPrice:null;if(yourFinds)item.costSource='SIZE';
    }
  });
}
function inventoryDetailProducts_(version) {
  const key=inventoryResponseCacheKey_(version,'detail-products',[]),cached=readInventoryResponse_(key);
  if(cached)return cached.products;
  const products=getProductMaster_({compactRead:true});
  cacheInventoryResponses_({[key]:{products:products}},version);
  return products;
}
function inventorySearchIndex_(index,version) {
  const keys=Array.from({length:Math.ceil(index.length/100)},(_,offset)=>inventoryResponseCacheKey_(version,'search-details',offset));
  let cached={};try{cached=CacheService.getScriptCache().getAll(keys);}catch(error){}
  let rows;
  if(keys.every(key=>cached[key])){
    try{rows=keys.flatMap(key=>JSON.parse(cached[key]));}catch(error){}
  }
  if(!rows){
    const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY),products=inventoryDetailProducts_(version);
    const stored=inventoryHasStoredDeliveryMetadata_(sheet),metadata=stored?{}:inventoryDetailDeliveryMetadata_(version);
    const items=getFullInventory({products:products,deliveryMetadataByCode:metadata});
    if(ACCESS_REQUEST_CONTEXT_.actor.manager)applyInventoryDetailCosts_(items,products,sheet);
    const texts=new Map();
    items.forEach(item=>{item.availability=inventoryListStatus_(item);texts.set(item.code,(texts.get(item.code)||'')+' '+inventoryItemSearchText_(item));});
    rows=index.map(item=>[item.code,texts.get(item.code)||inventoryItemSearchText_(item)]);
    const entries={};keys.forEach((key,offset)=>{entries[key]=rows.slice(offset*100,offset*100+100);});
    cacheInventoryResponses_(entries,version);
  }
  return index.map((item,offset)=>({...item,searchText:rows[offset][1]}));
}
function inventoryDetailDeliveryMetadata_(version) {
  const key=inventoryResponseCacheKey_(version,'detail-deliveries',[]),cached=readInventoryResponse_(key);
  if(cached)return cached.metadata;
  const metadata=getInventoryDeliveryMetadataByCode_(),dates=new Map();
  const log=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DELIVERY_LOG);
  if(log&&log.getLastRow()>1)log.getRange(2,DELIVERY_COL.DELIVERY_ID,log.getLastRow()-1,2).getValues().forEach(row=>{
    const id=String(row[0]||'').trim();if(!dates.has(id))dates.set(id,row[1]);
  });
  Object.values(metadata).forEach(item=>{item.timestamp=formatInventoryDateForClient(dates.get(item.deliveryId)||item.timestamp);});
  cacheInventoryResponses_({[key]:{metadata:metadata}},version);
  return metadata;
}
function getInventoryItemDetailsBatch(request) {
  assertAppRequest_();
  request=request||{};
  const version=inventoryReadVersion_();
  if(request.version!==version)return {success:true,changed:true,version:version};
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY);
  const total=sheet?Math.max(0,sheet.getLastRow()-1):0;
  const offset=Math.min(total,Math.max(0,Math.floor(Number(request.offset)||0)));
  const count=Math.min(total-offset,Math.max(1,Math.min(200,Math.floor(Number(request.limit)||200))));
  let items=[];
  if(count){
    const products=inventoryDetailProducts_(version);
    const stored=inventoryHasStoredDeliveryMetadata_(sheet);
    const metadata=stored?{}:inventoryDetailDeliveryMetadata_(version);
    items=getFullInventory({products:products,rowNumber:offset+2,rowCount:count,deliveryMetadataByCode:metadata});
    const counts=new Map();
    inventoryListIndex_(version).forEach(item=>counts.set(item.code,(counts.get(item.code)||0)+1));
    // Duplicated barcodes must still fail the authoritative single-item lookup.
    items=items.filter(item=>item.code&&counts.get(item.code)===1);
    items.forEach(item=>{item.deliveryMetadataLoaded=true;});
    if(ACCESS_REQUEST_CONTEXT_.actor.manager)applyInventoryDetailCosts_(items,products,sheet);
  }
  const current=inventoryReadVersion_();
  if(current!==version)return {success:true,changed:true,version:current};
  return {success:true,version:version,offset:offset,nextOffset:offset+count,total:total,done:offset+count>=total,items:items};
}
function getInventoryChangeChoices() {
  assertAppRequest_();
  const version=inventoryReadVersion_();
  return {success:true,version:version,items:inventoryListIndex_(version).filter(item=>item.inventoryType==='STOCK'&&item.status==='ACTIVE'&&item.productStatus!=='DEACTIVATED')
    .map(item=>({code:item.code,name:item.name,category:item.category,stock:item.stock,price:item.price,inventoryType:item.inventoryType,status:item.status}))};
}
