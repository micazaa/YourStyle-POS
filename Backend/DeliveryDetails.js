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

// Read-only view; no active-holder restriction, so completed deliveries remain inspectable.
function getDeliveryDetails(deliveryId) {
  deliveryId=String(deliveryId||'').trim();
  if(!deliveryId)throw new Error('Delivery ID is required.');
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const log=ss.getSheetByName(SHEETS.DELIVERY_LOG);
  const rows=log?readDeliveryDetailRows_(log,findDeliveryDetailRows_(log,DELIVERY_COL.DELIVERY_ID,deliveryId),DELIVERY_LOG_COLUMN_COUNT,false).filter(r=>String(r[DELIVERY_IDX.DELIVERY_ID]).trim()===deliveryId):[];
  if(!rows.length)throw new Error('Delivery not found.');
  const first=rows[0], inventory=new Map();
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
  const moves=movement?readDeliveryDetailRows_(movement,findDeliveryDetailRows_(movement,MOVE_COL.REFERENCE_ID,deliveryId),MOVEMENT_LOG_COLUMN_COUNT,false):[];
  const codes=new Set(moves.filter(r=>String(r[MOVE_IDX.REFERENCE_ID]).trim()===deliveryId&&Number(r[MOVE_IDX.QTY_CHANGE])>0).map(r=>String(r[MOVE_IDX.CODE]).trim()));
  const sheet=ss.getSheetByName(SHEETS.INVENTORY);
  if(sheet&&sheet.getLastRow()>1&&codes.size){
    const codeRows=sheet.getRange(2,INV_COL.CODE,sheet.getLastRow()-1,1).getDisplayValues();
    const rowNumbers=[];
    codeRows.forEach((row,index)=>{if(codes.has(String(row[0]).trim()))rowNumbers.push(index+2);});
    readDeliveryDetailRows_(sheet,rowNumbers,INVENTORY_COLUMN_COUNT,true).forEach(r=>inventory.set(String(r[INV_IDX.CODE]).trim(),{name:r[INV_IDX.DESCRIPTION],size:r[INV_IDX.SIZE],category:r[INV_IDX.CATEGORY],status:r[INV_IDX.STATUS],imageUrl:r[INV_IDX.IMAGE]}));
  }
  const items=new Map();
  moves.forEach(r=>{
    const source=String(r[MOVE_IDX.SOURCE]),qty=Number(r[MOVE_IDX.QTY_CHANGE])||0;
    if(String(r[MOVE_IDX.REFERENCE_ID]).trim()!==deliveryId||qty<=0||!['DELIVERY','DISTRIBUTION'].includes(source))return;
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
    const label=String(first[DELIVERY_IDX.DELIVERY_TYPE]).toUpperCase()==='YOURFINDS'?item.size||'Unspecified size':item.name;
    counts[label]=(counts[label]||0)+item.quantity;
  });
  if(direct.items.length||!groups.length)groups.unshift(direct);
  const actual=groups.reduce((sum,g)=>sum+g.items.reduce((total,i)=>total+i.quantity,0),0);
  const bulkActual=groups.filter(g=>g.id!=='direct').reduce((sum,g)=>sum+g.items.reduce((total,i)=>total+i.quantity,0),0);
  const statuses=rows.map(r=>String(r[DELIVERY_IDX.STATUS]).toUpperCase());
  const status=statuses.includes('PARTIAL')?'PARTIAL':statuses.includes('PENDING')?'PENDING':statuses.includes('COMPLETED')?'COMPLETED':statuses[0];
  return {id:deliveryId,date:formatInventoryDateForClient(first[DELIVERY_IDX.DELIVERY_DATE]),driver:String(first[DELIVERY_IDX.DRIVER_NAME]||''),plate:String(first[DELIVERY_IDX.PLATE_NO]||''),acceptedBy:String(first[DELIVERY_IDX.ACCEPTED_BY]||''),category:String(first[DELIVERY_IDX.DELIVERY_TYPE]).toUpperCase()==='YOURFINDS'?'YourFinds':[...new Set(rows.map(r=>String(r[DELIVERY_IDX.TYPE]||r[DELIVERY_IDX.CATEGORY]||first[DELIVERY_IDX.DELIVERY_TYPE])))].join(' / '),yourFinds:String(first[DELIVERY_IDX.DELIVERY_TYPE]).toUpperCase()==='YOURFINDS',status:status,bundleCount:bundleCount,estimated:estimated,actual:actual,bulkActual:bulkActual,counts:counts,groups:groups};
}
