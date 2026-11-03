// The list cache contains display data only. Checkout and edits always re-read authoritative stock.
const INVENTORY_READ_SECONDS_ = 60;
function invalidateInventoryRead_(spreadsheetId) {
  const id = spreadsheetId || SpreadsheetApp.getActiveSpreadsheet().getId();
  PropertiesService.getScriptProperties().setProperty('inventory-read:'+id,Utilities.getUuid());
}
function inventoryReadVersion_() {
  const id=SpreadsheetApp.getActiveSpreadsheet().getId();
  return id+':'+(PropertiesService.getScriptProperties().getProperty('inventory-read:'+id)||'initial')+':'+Math.floor(Date.now()/(INVENTORY_READ_SECONDS_*1000));
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
  const cache=CacheService.getScriptCache(), prefix='inventory-list:'+version;
  let raw;try{raw=cache.get(prefix);}catch(error){console.warn('Inventory list cache unavailable.');}
  if(raw){
    try {
      const manifest=JSON.parse(raw), keys=Array.from({length:manifest.count},(_,i)=>prefix+':'+manifest.id+':'+i);
      const chunks=cache.getAll(keys);
      if(keys.every(key=>chunks[key]!==undefined && chunks[key]!==null))return keys.flatMap(key=>JSON.parse(chunks[key]));
    } catch(error){console.warn('Inventory list cache missed.');}
  }
  const started=Date.now(), items=readInventoryListIndex_(), id=Utilities.getUuid();
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
    exclude:request.exclude===undefined?'DEACTIVATED':String(request.exclude).toUpperCase(),incompleteOnly:request.incompleteOnly===true,
    sort:sortKeys.includes(request.sort)?request.sort:'name',direction:Number(request.direction)===-1?-1:1,
    page:Math.max(1,Math.floor(Number(request.page)||1)),pageSize:50};
}
function inventoryListExcluded_(item,request) {
  if(!request.exclude)return false;
  if(request.exclude==='DEACTIVATED')return item.productStatus==='DEACTIVATED'||item.status==='INACTIVE';
  return request.exclude==='ON SALE'?item.productStatus==='ON SALE':
    item.availability===request.exclude || request.exclude==='SOLD OUT'&&item.availability==='NEGATIVE STOCK';
}
function inventoryListMatches_(item,request) {
  return (!request.search||item.searchText.includes(request.search)) && (!request.category||item.category===request.category) &&
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
function getInventoryPage(request) {
  assertAppRequest_();
  const version=inventoryReadVersion_();
  if(request && request.knownVersion===version)return {success:true,notModified:true,version:version};
  const started=Date.now(),query=inventoryListRequest_(request),index=inventoryListIndex_(version), groups=inventoryListGroups_(index,query);
  const rows=inventoryListSaleRows_(index.filter(item=>!inventoryListExcluded_(item,query)&&inventoryListMatches_(item,query)));
  rows.sort((a,b)=>{
    const key=query.sort;
    const left=key==='active'?a.productStatus:key==='availability'?inventoryListStatus_(a):a[key];
    const right=key==='active'?b.productStatus:key==='availability'?inventoryListStatus_(b):b[key];
    const comparison=typeof left==='number'?left-right:String(left||'').localeCompare(String(right||''),undefined,{numeric:true,sensitivity:'base'});
    return comparison*query.direction || a.code.localeCompare(b.code,undefined,{numeric:true}) || (a.saleTierIndex||0)-(b.saleTierIndex||0);
  });
  const result=inventoryPageSlice_(rows,query.page,query.pageSize);
  result.items=result.items.map(item=>({code:item.code,name:item.name,size:item.size,category:item.category,inventoryType:item.inventoryType,
    status:item.status,stock:item.stock,price:item.price,productStatus:item.productStatus,lowStockAt:item.lowStockAt,
    imageUrl:item.imageUrl,saleVariant:item.saleVariant||'',saleTierIndex:item.saleTierIndex,saleReferenceId:item.saleReferenceId||'',listOnly:true}));
  console.log(JSON.stringify({event:'inventory_page',rowsReturned:result.items.length,rowsMatched:result.total,elapsedMs:Date.now()-started}));
  return {success:true,...result,version:version,cards:{products:groups.length,low:groups.filter(g=>g.status==='LOW STOCK').length,sold:groups.filter(g=>g.status==='SOLD OUT').length}};
}
function getInventorySummaryPage(request) {
  assertAppRequest_();
  const query=inventoryListRequest_(request),version=inventoryReadVersion_();
  let groups=inventoryListGroups_(inventoryListIndex_(version),query);
  const kind=String(request && request.kind||'products');
  groups=groups.filter(group=>kind==='low'?group.status==='LOW STOCK':kind==='sold'?group.status==='SOLD OUT':kind==='stock'?group.stock>0:true);
  const key=['category','name','stock','status'].includes(request && request.summarySort)?request.summarySort:'category';
  const direction=Number(request && request.summaryDirection)===-1?-1:1;
  groups.sort((a,b)=>(key==='stock'?a.stock-b.stock:String(a[key]).localeCompare(String(b[key]),undefined,{numeric:true,sensitivity:'base'}))*direction||a.key.localeCompare(b.key));
  const categories=['PINS','OTHERS','YOURFINDS'].map(category=>{
    const matching=groups.filter(group=>group.category===category);
    return {category:category,groups:matching.length,units:matching.reduce((sum,group)=>sum+group.positiveStock,0)};
  });
  return {success:true,...inventoryPageSlice_(groups,query.page,query.pageSize),version:version,categories:categories,
    positiveUnits:groups.reduce((sum,group)=>sum+group.positiveStock,0)};
}
function getInventoryItemDetails(code) {
  assertAppRequest_();
  code=String(code||'').trim();
  const ss=SpreadsheetApp.getActiveSpreadsheet(),sheet=ss.getSheetByName(SHEETS.INVENTORY);
  if(!sheet||sheet.getLastRow()<2)throw new Error('Inventory item not found.');
  const matches=sheet.getRange(2,INV_COL.CODE,sheet.getLastRow()-1,1).createTextFinder(code).matchCase(true).matchEntireCell(true).findAll();
  if(matches.length!==1)throw new Error('Inventory item is missing or its barcode is duplicated.');
  const products=getProductMaster_({compactRead:true});
  const item=getFullInventory({products:products,rowNumber:matches[0].getRow(),includeDeliveryMetadata:false})[0];
  if(!item)throw new Error('Inventory item not found.');
  if(inventoryRowIsSoldYourFinds_(item)){item.status='INACTIVE';item.productStatus='DEACTIVATED';}
  if(ACCESS_REQUEST_CONTEXT_.actor.manager){
    const yourFinds=isYourFindsUnique_(item),size=normalizeYourFindsSaleSize_(item.size);
    const product=products.find(product=>yourFinds&&size!=='CUSTOM'
      ?String(product.category).toUpperCase()==='YOURFINDS'&&normalizeYourFindsSaleSize_(product.description)===size:product.productCode===code);
    if(yourFinds&&size==='CUSTOM'){
      const column=customCostColumn_(sheet,false),raw=column?sheet.getRange(item.rowNumber,column).getValue():'';
      item.costPrice=raw===''||raw===null?null:Number(raw)||0;item.costSource='CUSTOM';
    }else {item.costPrice=product?product.costPrice:null;if(yourFinds)item.costSource='SIZE';}
  }
  return {success:true,item:item,version:inventoryReadVersion_()};
}
function getInventoryChangeChoices() {
  assertAppRequest_();
  const version=inventoryReadVersion_();
  return {success:true,version:version,items:inventoryListIndex_(version).filter(item=>item.inventoryType==='STOCK'&&item.status==='ACTIVE'&&item.productStatus!=='DEACTIVATED')
    .map(item=>({code:item.code,name:item.name,category:item.category,stock:item.stock,price:item.price,inventoryType:item.inventoryType,status:item.status}))};
}
