// Read matching rows in short runs, keeping sheet calls low for large deliveries.
function readDeliveryDetailRows_(sheet, rowNumbers, width, displayValues) {
  const rows = [];
  const sorted = [...new Set(rowNumbers)].sort((a, b) => a - b);
  for (let index = 0; index < sorted.length;) {
    const start = sorted[index];
    let end = start;
    const firstIndex = index;
    while (index + 1 < sorted.length && sorted[index + 1] - end <= 20 && sorted[index + 1] - start < 500) {
      end = sorted[++index];
    }
    const range = sheet.getRange(start, 1, end - start + 1, width);
    const values = displayValues ? range.getDisplayValues() : range.getValues();
    for (let matched = firstIndex; matched <= index; matched++) {
      rows.push(values[sorted[matched] - start]);
    }
    index++;
  }
  return rows;
}

function findDeliveryDetailRows_(sheet, column, value) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, column, sheet.getLastRow() - 1, 1)
    .createTextFinder(value).matchEntireCell(true).findAll()
    .map(cell => cell.getRow());
}

function parseYourFindsConversionNote_(value) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && parsed.kind === "YOURFINDS_CONVERSION" ? parsed : null;
  } catch (error) {
    return null;
  }
}

// Read-only view; no active-holder restriction, so completed deliveries remain inspectable.
function getDeliveryDetails(deliveryId) {
  deliveryId=String(deliveryId||'').trim();
  if(!deliveryId)throw new Error('Delivery ID is required.');
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const log=ss.getSheetByName(SHEETS.DELIVERY_LOG);
  const rows=log?readDeliveryDetailRows_(log,findDeliveryDetailRows_(log,DELIVERY_COL.DELIVERY_ID,deliveryId),DELIVERY_LOG_COLUMN_COUNT,false).filter(r=>String(r[DELIVERY_IDX.DELIVERY_ID]).trim()===deliveryId):[];
  if(!rows.length)throw new Error('Delivery not found.');
  const first=rows[0], inventory=new Map();
  const yourFinds=String(first[DELIVERY_IDX.DELIVERY_TYPE]).toUpperCase()==='YOURFINDS';
  const groups=[],direct={id:'direct',label:'Direct',items:[]};
  let estimated=0,bundleCount=0;
  const counts={};
  rows.forEach(r=>{
    const type=String(r[DELIVERY_IDX.TYPE]||'').trim();
    if(String(r[DELIVERY_IDX.RECEIVE_MODE]).toUpperCase()==='BULK'){
      const quantity=Number(r[DELIVERY_IDX.BUNDLE_QTY])||0;bundleCount+=quantity;estimated+=Number(r[DELIVERY_IDX.ESTIMATED_QTY])||0;
      for(let n=1;n<=quantity;n++){
        const id=type+':'+n;
        const existing=groups.find(g=>g.id===id);
        if(existing){existing.code='Multiple holders · '+type;continue;}
        groups.push({id:id,label:'Bundle #'+n,type:type,code:String(r[DELIVERY_IDX.DESCRIPTION]||''),bundleNo:n,items:[]});
      }
    }
  });
  const movement=ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  const movementRows=movement
    ? findDeliveryDetailRows_(movement,MOVE_COL.REFERENCE_ID,deliveryId)
        .concat(findDeliveryDetailRows_(movement,MOVE_COL.SOURCE_LINE_ID,deliveryId))
    : [];
  const moves=movement?readDeliveryDetailRows_(movement,movementRows,MOVEMENT_LOG_COLUMN_COUNT,false):[];
  const codes=new Set(moves.map(r=>String(r[MOVE_IDX.CODE]).trim()).filter(Boolean));
  const sheet=ss.getSheetByName(SHEETS.INVENTORY);
  if(sheet&&sheet.getLastRow()>1&&codes.size){
    const codeRows=sheet.getRange(2,INV_COL.CODE,sheet.getLastRow()-1,1).getDisplayValues();
    const rowNumbers=[];
    codeRows.forEach((row,index)=>{if(codes.has(String(row[0]).trim()))rowNumbers.push(index+2);});
    readDeliveryDetailRows_(sheet,rowNumbers,INVENTORY_COLUMN_COUNT,true).forEach(r=>inventory.set(String(r[INV_IDX.CODE]).trim(),{name:r[INV_IDX.DESCRIPTION],size:r[INV_IDX.SIZE],category:r[INV_IDX.CATEGORY],status:r[INV_IDX.STATUS],stock:Number(String(r[INV_IDX.STOCK]||'').replace(/,/g,''))||0,imageUrl:r[INV_IDX.IMAGE]}));
  }
  const items=new Map();
  moves.forEach(r=>{
    const source=String(r[MOVE_IDX.SOURCE]).trim().toUpperCase(),qty=Number(r[MOVE_IDX.QTY_CHANGE])||0;
    const originalItem=String(r[MOVE_IDX.REFERENCE_ID]).trim()===deliveryId&&qty>0&&['DELIVERY','DISTRIBUTION'].includes(source);
    const conversionItem=yourFinds&&source===INVENTORY_MOVEMENT_SOURCE.ADJUSTMENT&&String(r[MOVE_IDX.SOURCE_LINE_ID]).trim().toUpperCase()===deliveryId.toUpperCase()&&qty>0&&parseYourFindsConversionNote_(r[MOVE_IDX.NOTES]);
    if(!originalItem&&!conversionItem)return;
    const code=String(r[MOVE_IDX.CODE]).trim(),product=inventory.get(code);
    // Negative holder movements are excluded; product inventory supplies the image and current status.
    if(!product)return;
    const group=source==='DISTRIBUTION'?groups.find(g=>g.type===String(r[MOVE_IDX.TYPE])&&g.bundleNo===Number(r[MOVE_IDX.BUNDLE_NO])):direct;
    if(!group)return;
    const key=group.id+'|'+code;
    if(!items.has(key))items.set(key,{...product,code:code,name:product.name||String(r[MOVE_IDX.ITEM])||product.size||code,quantity:0,group:group.id});
    items.get(key).quantity+=qty;
  });
  items.forEach(item=>{
    const group=item.group==='direct'?direct:groups.find(g=>g.id===item.group);group.items.push(item);
    if(String(item.status||'').trim().toUpperCase()!==INVENTORY_STATUS.CONVERTED){
      const label=yourFinds?item.size||'Unspecified size':item.name;
      counts[label]=(counts[label]||0)+item.quantity;
    }
  });
  if(direct.items.length||!groups.length)groups.unshift(direct);
  const actual=groups.reduce((sum,g)=>sum+g.items.reduce((total,i)=>total+(String(i.status||'').trim().toUpperCase()===INVENTORY_STATUS.CONVERTED?0:i.quantity),0),0);
  const bulkActual=groups.filter(g=>g.id!=='direct').reduce((sum,g)=>sum+g.items.reduce((total,i)=>total+i.quantity,0),0);
  const statuses=rows.map(r=>String(r[DELIVERY_IDX.STATUS]).toUpperCase());
  const status=statuses.includes('PARTIAL')?'PARTIAL':statuses.includes('PENDING')?'PENDING':statuses.includes('COMPLETED')?'COMPLETED':statuses[0];
  const sizeDescriptions={SNE:'Small non-electronic',MNE:'Medium non-electronic',LNE:'Large non-electronic',XLNE:'Extra large non-electronic','NO SIZE':'No size non-electronic',BNE:'Bulky non-electronic',BULKY:'Bulky non-electronic',SE:'Small electronic',ME:'Medium electronic',LE:'Large electronic',XLE:'Extra large electronic'};
  const reportLines=yourFinds
    ? rows.filter(r=>String(r[DELIVERY_IDX.RECEIVE_MODE]).toUpperCase()==='DIRECT').map(r=>{
        const size=String(r[DELIVERY_IDX.CATEGORY]||'').trim();
        return {code:size,description:sizeDescriptions[size.toUpperCase()]||size,quantity:Number(r[DELIVERY_IDX.ACTUAL_QTY])||0,remarks:''};
      })
    : direct.items.map(item=>({code:item.code,description:item.name,quantity:item.quantity,remarks:''}));
  if(!yourFinds){
    if(!direct.items.length)rows.filter(r=>String(r[DELIVERY_IDX.RECEIVE_MODE]).toUpperCase()==='DIRECT').forEach(r=>reportLines.push({code:'',description:String(r[DELIVERY_IDX.DESCRIPTION]||''),quantity:Number(r[DELIVERY_IDX.ACTUAL_QTY])||0,remarks:''}));
    rows.filter(r=>String(r[DELIVERY_IDX.RECEIVE_MODE]).toUpperCase()==='BULK').forEach(r=>reportLines.push({code:String(r[DELIVERY_IDX.DESCRIPTION]||''),description:String(r[DELIVERY_IDX.TYPE]||'')+' bundle',quantity:String(Number(r[DELIVERY_IDX.BUNDLE_QTY])||0)+' bundles',remarks:'Est. '+String(Number(r[DELIVERY_IDX.ESTIMATED_QTY])||0)+' pcs'}));
  }
  const directTotal=reportLines.reduce((sum,line)=>sum+(typeof line.quantity==='number'?line.quantity:0),0);
  const reportTotal=bundleCount?(directTotal?directTotal+' pcs + ':'')+bundleCount+' bundles':String(directTotal);
  const conversionGroups={};
  if(yourFinds)moves.forEach(r=>{
    if(String(r[MOVE_IDX.SOURCE]).trim().toUpperCase()!==INVENTORY_MOVEMENT_SOURCE.ADJUSTMENT||String(r[MOVE_IDX.SOURCE_LINE_ID]).trim().toUpperCase()!==deliveryId.toUpperCase())return;
    const detail=parseYourFindsConversionNote_(r[MOVE_IDX.NOTES]);
    if(!detail)return;
    const referenceId=String(r[MOVE_IDX.REFERENCE_ID]||'').trim();
    if(!referenceId)return;
    if(!conversionGroups[referenceId])conversionGroups[referenceId]={referenceId:referenceId,detail:detail,targetCodes:[],canonicalTargets:false};
    const group=conversionGroups[referenceId];
    if(Array.isArray(detail.targetCodes)&&detail.targetCodes.length){group.targetCodes=detail.targetCodes.map(String);group.canonicalTargets=true;}
    else if(Number(r[MOVE_IDX.QTY_CHANGE])>0&&!group.canonicalTargets)group.targetCodes.push(String(r[MOVE_IDX.CODE]||'').trim());
  });
  const adjustmentLines=Object.keys(conversionGroups).map(referenceId=>{
    const group=conversionGroups[referenceId],detail=group.detail;
    const targets=Array.isArray(detail.targets)&&detail.targets.length
      ?detail.targets.map(target=>({toSize:String(target.toSize||target.targetSize||''),toQuantity:Number(target.resultQuantity||target.quantity)||0,targetCodes:Array.isArray(target.targetCodes)?target.targetCodes.map(String):(Array.isArray(target.codes)?target.codes.map(String):[])}))
      :[{toSize:String(detail.toSize||''),toQuantity:Number(detail.resultQuantity)||group.targetCodes.length,targetCodes:group.targetCodes.slice()}];
    if(targets.length===1&&!targets[0].targetCodes.length)targets[0].targetCodes=group.targetCodes.slice();
    const targetCodes=targets.reduce((codes,target)=>codes.concat(target.targetCodes),[]);
    return {referenceId:referenceId,fromCode:String(detail.sourceCode||''),fromSize:String(detail.fromSize||''),fromQuantity:Number(detail.sourceQuantity)||1,toSize:targets.map(target=>target.toSize).filter(Boolean).join(' / '),toQuantity:targets.reduce((total,target)=>total+target.toQuantity,0),targetCodes:targetCodes,targets:targets,notes:String(detail.notes||'')};
  });
  const finalBySize={};
  reportLines.forEach(line=>{if(typeof line.quantity==='number')finalBySize[String(line.code||'').trim()]=(finalBySize[String(line.code||'').trim()]||0)+line.quantity;});
  adjustmentLines.forEach(line=>{finalBySize[line.fromSize]=(finalBySize[line.fromSize]||0)-line.fromQuantity;(line.targets||[]).forEach(target=>{finalBySize[target.toSize]=(finalBySize[target.toSize]||0)+target.toQuantity;});});
  const finalSizeOrder=YOURFINDS_SIZE_ORDER.filter(size=>size!=='CUSTOM');
  const finalReportLines=yourFinds?Object.keys(finalBySize).filter(size=>finalBySize[size]>0).sort((a,b)=>{const ai=finalSizeOrder.indexOf(a),bi=finalSizeOrder.indexOf(b);return (ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b);}).map(size=>({code:size,description:sizeDescriptions[size]||size,quantity:finalBySize[size],remarks:''})):reportLines.slice();
  const finalReportTotal=yourFinds?String(finalReportLines.reduce((sum,line)=>sum+(Number(line.quantity)||0),0)):reportTotal;
  return {id:deliveryId,date:formatInventoryDateForClient(first[DELIVERY_IDX.DELIVERY_DATE]),driver:String(first[DELIVERY_IDX.DRIVER_NAME]||''),plate:String(first[DELIVERY_IDX.PLATE_NO]||''),preparedBy:String(first[DELIVERY_IDX.PREPARED_BY]||first[DELIVERY_IDX.ACCEPTED_BY]||''),acceptedBy:String(first[DELIVERY_IDX.ACCEPTED_BY]||''),remarks:String(first[DELIVERY_IDX.REMARKS]||''),category:yourFinds?'YourFinds':[...new Set(rows.map(r=>String(r[DELIVERY_IDX.TYPE]||r[DELIVERY_IDX.CATEGORY]||first[DELIVERY_IDX.DELIVERY_TYPE])))].join(' / '),yourFinds:yourFinds,status:status,bundleCount:bundleCount,estimated:estimated,actual:actual,bulkActual:bulkActual,counts:counts,groups:groups,reportLines:reportLines,reportTotal:reportTotal,adjustmentLines:adjustmentLines,finalReportLines:finalReportLines,finalReportTotal:finalReportTotal};
}
