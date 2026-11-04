/* Supplier returns use Return Log for business records and Movement Log for stock. */

const SUPPLIER_RETURN_HEADERS = [
  "Return ID", "Return Line ID", "Return Date", "Timestamp", "Prepared By",
  "Approved By", "Driver Name", "Plate No.", "Received By", "Supplier",
  "Original Delivery ID", "Product Code", "Item Name", "Size", "Category",
  "Quantity Returned", "Return Reason", "Item Condition", "Status", "Remarks"
];

function supplierReturnCategoryForSheet_(value) {
  const category = String(value || "").trim().toUpperCase();
  if (category === "YOURFINDS") return "YourFinds";
  if (category === "OTHERS") return "Others";
  return category;
}

function supplierReturnDate_(value, fallback) {
  const date = String(value || fallback || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Return Date must use YYYY-MM-DD format.");
  return date;
}

function getSupplierReturnLogSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.RETURN_LOG);
  if (!sheet) throw new Error("Return Log sheet not found.");
  const headers = sheet.getRange(1, 1, 1, RETURN_LOG_COLUMN_COUNT).getDisplayValues()[0];
  SUPPLIER_RETURN_HEADERS.forEach(function(header, index) {
    if (String(headers[index] || "").trim() !== header) {
      throw new Error('Return Log column ' + (index + 1) + ' should be "' + header + '".');
    }
  });
  return sheet;
}

function supplierReturnRecordFromLogRow_(row, display) {
  return {
    requestId: String(display[RETURN_IDX.RETURN_LINE_ID] || ""),
    lineId: String(display[RETURN_IDX.RETURN_LINE_ID] || ""),
    id: String(display[RETURN_IDX.RETURN_ID] || ""),
    returnDate: formatInventoryDateForClient(row[RETURN_IDX.RETURN_DATE]),
    date: String(display[RETURN_IDX.TIMESTAMP] || display[RETURN_IDX.RETURN_DATE] || ""),
    timestamp: String(display[RETURN_IDX.TIMESTAMP] || ""),
    preparedBy: String(display[RETURN_IDX.PREPARED_BY] || ""),
    employee: String(display[RETURN_IDX.PREPARED_BY] || ""),
    approvedBy: String(display[RETURN_IDX.APPROVED_BY] || ""),
    driver: String(display[RETURN_IDX.DRIVER_NAME] || ""),
    plate: String(display[RETURN_IDX.PLATE_NO] || ""),
    receivedBy: String(display[RETURN_IDX.RECEIVED_BY] || ""),
    supplier: String(display[RETURN_IDX.SUPPLIER] || ""),
    originalDeliveryId: String(display[RETURN_IDX.ORIGINAL_DELIVERY_ID] || ""),
    code: String(display[RETURN_IDX.PRODUCT_CODE] || ""),
    name: String(display[RETURN_IDX.ITEM_NAME] || ""),
    size: String(display[RETURN_IDX.SIZE] || ""),
    category: String(display[RETURN_IDX.CATEGORY] || "").trim().toUpperCase(),
    quantity: Math.abs(Number(row[RETURN_IDX.QUANTITY_RETURNED]) || 0),
    reason: String(display[RETURN_IDX.RETURN_REASON] || ""),
    condition: String(display[RETURN_IDX.ITEM_CONDITION] || ""),
    status: String(display[RETURN_IDX.STATUS] || ""),
    remarks: String(display[RETURN_IDX.REMARKS] || "")
  };
}

function getSupplierReturnLogRecords_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.RETURN_LOG);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, RETURN_LOG_COLUMN_COUNT).getValues();
  const display = sheet.getRange(2, 1, sheet.getLastRow() - 1, RETURN_LOG_COLUMN_COUNT).getDisplayValues();
  return values.map(function(row, index) {
    return supplierReturnRecordFromLogRow_(row, display[index]);
  }).filter(function(record) { return record.id && record.lineId; });
}

function getLegacySupplierReturnRecords_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, MOVEMENT_LOG_COLUMN_COUNT).getValues()
    .filter(function(row) {
      return String(row[MOVE_IDX.SOURCE] || "").trim().toUpperCase() === INVENTORY_MOVEMENT_SOURCE.SUPPLIER_RETURN;
    })
    .map(function(row) {
      let details = {};
      try { details = JSON.parse(String(row[MOVE_IDX.NOTES] || "{}")); } catch (error) { details = {}; }
      return {
        requestId: String(row[MOVE_IDX.SOURCE_LINE_ID] || ""),
        lineId: String(row[MOVE_IDX.SOURCE_LINE_ID] || ""),
        id: String(row[MOVE_IDX.REFERENCE_ID] || ""),
        returnDate: details.returnDate || "",
        date: row[MOVE_IDX.TIMESTAMP] instanceof Date
          ? Utilities.formatDate(row[MOVE_IDX.TIMESTAMP], Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")
          : String(row[MOVE_IDX.TIMESTAMP] || ""),
        timestamp: row[MOVE_IDX.TIMESTAMP] instanceof Date
          ? Utilities.formatDate(row[MOVE_IDX.TIMESTAMP], Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")
          : String(row[MOVE_IDX.TIMESTAMP] || ""),
        preparedBy: String(details.preparedBy || row[MOVE_IDX.EMPLOYEE] || ""),
        employee: String(details.preparedBy || row[MOVE_IDX.EMPLOYEE] || ""),
        approvedBy: String(details.approvedBy || details.authorizedBy || ""),
        driver: String(details.driver || ""),
        plate: String(details.plate || ""),
        receivedBy: String(details.receivedBy || ""),
        supplier: String(details.supplier || ""),
        originalDeliveryId: String(details.originalDeliveryId || ""),
        code: String(row[MOVE_IDX.CODE] || ""),
        name: String(row[MOVE_IDX.ITEM] || ""),
        size: String(details.size || ""),
        category: String(row[MOVE_IDX.TYPE] || "").trim().toUpperCase(),
        quantity: Math.abs(Number(row[MOVE_IDX.QTY_CHANGE]) || 0),
        reason: String(row[MOVE_IDX.REASON] || ""),
        condition: String(details.condition || ""),
        status: String(details.status || "RELEASED"),
        remarks: String(details.remarks || "")
      };
    });
}

function getSupplierReturns() {
  assertAppRequest_();
  const records = getSupplierReturnLogRecords_();
  const lineIds = {};
  records.forEach(function(record) { lineIds[record.lineId] = true; });
  getLegacySupplierReturnRecords_().forEach(function(record) {
    if (!lineIds[record.lineId]) records.push(record);
  });
  return records.reverse();
}

function findSupplierReturnMovement_(lineId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, MOVEMENT_LOG_COLUMN_COUNT).getValues();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (String(row[MOVE_IDX.SOURCE] || "").trim().toUpperCase() === INVENTORY_MOVEMENT_SOURCE.SUPPLIER_RETURN &&
        String(row[MOVE_IDX.SOURCE_LINE_ID] || "").trim() === lineId) {
      return { id: String(row[MOVE_IDX.REFERENCE_ID] || ""), row: row };
    }
  }
  return null;
}

function saveSupplierReturn(payload) {
  assertAppRequest_();
  payload = payload || {};
  if (Array.isArray(payload.items)) return saveSupplierReturnItems_(payload);
  const auth = requireManager_(payload.managerPin, payload.managerToken);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const requestId = String(payload.requestId || "").trim();
    if (!/^[a-zA-Z0-9-]{10,80}$/.test(requestId)) throw new Error("Invalid return request. Reopen the form.");

    const lineId = "YSRL-" + requestId.toUpperCase();
    const existingLog = getSupplierReturnLogRecords_().find(function(record) { return record.lineId === lineId; });
    if (existingLog) return { success: true, id: existingLog.id, lineId: lineId };

    const now = new Date();
    const fallbackDate = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
    const returnDate = supplierReturnDate_(payload.returnDate, fallbackDate);
    const code = String(payload.code || "").trim();
    const quantity = Number(payload.quantity);
    const reason = String(payload.reason || "").trim();
    const condition = String(payload.condition || "").trim().toUpperCase();
    const supplier = String(payload.supplier || "").trim();
    const status = String(payload.status || "RELEASED").trim().toUpperCase();
    const receivedBy = String(payload.receivedBy || "").trim();
    const preparedBy = String(payload.preparedBy || payload.employee || auth.managerName || "").trim();
    const approvedBy = String(auth.managerName || preparedBy).trim();

    if (!code || !Number.isInteger(quantity) || quantity < 1 || !reason || !supplier || !preparedBy) {
      throw new Error("Product, supplier, reason, prepared by and positive whole quantity are required.");
    }
    if (["SEALED", "OPENED", "DAMAGED", "OTHER"].indexOf(condition) === -1) throw new Error("Select item condition.");
    if (["RELEASED", "RECEIVED"].indexOf(status) === -1) throw new Error("Status must be RELEASED or RECEIVED.");
    if (status === "RECEIVED" && !receivedBy) throw new Error("Received By is required for received returns.");

    const result = getInventoryItemByCode(code);
    if (!result || !result.success || !result.item) throw new Error("Inventory item not found.");
    const item = result.item;
    const existingMovement = findSupplierReturnMovement_(lineId);
    let returnId = existingMovement ? existingMovement.id : "";

    if (!existingMovement) {
      if (quantity > Number(item.stock) || ["RETURNED","RESERVED","CONVERTED"].includes(String(item.status).toUpperCase())) {
        throw new Error("Return quantity exceeds available stock.");
      }
      if (String(item.inventoryType).toUpperCase() === "UNIQUE" && quantity !== 1) {
        throw new Error("Unique items must be returned one at a time.");
      }
      returnId = "YSR-" + returnDate.replace(/-/g, "") + "-" + requestId.replace(/-/g, "").slice(0, 8).toUpperCase();
      const notes = {
        supplier: supplier,
        driver: String(payload.driver || "").trim(),
        plate: String(payload.plate || "").trim().toUpperCase(),
        remarks: String(payload.remarks || "").trim(),
        preparedBy: preparedBy,
        approvedBy: approvedBy,
        receivedBy: receivedBy,
        originalDeliveryId: String(payload.originalDeliveryId || "").trim(),
        size: String(item.size || "").trim(),
        condition: condition,
        status: status,
        returnDate: returnDate
      };
      changeInventoryStock({
        code: code,
        qtyChange: -quantity,
        referenceId: returnId,
        sourceLineId: lineId,
        employee: preparedBy,
        item: item.name,
        reason: reason,
        source: INVENTORY_MOVEMENT_SOURCE.SUPPLIER_RETURN,
        notes: JSON.stringify(notes)
      });
    }

    const row = [
      returnId, lineId, returnDate, now, preparedBy, approvedBy,
      String(payload.driver || "").trim(), String(payload.plate || "").trim().toUpperCase(),
      receivedBy, supplier, String(payload.originalDeliveryId || "").trim(), code,
      String(item.name || "").trim(), String(item.size || "").trim(),
      supplierReturnCategoryForSheet_(item.category), quantity, reason, condition, status,
      String(payload.remarks || "").trim()
    ];
    if (row.length !== RETURN_LOG_COLUMN_COUNT) throw new Error("Return Log row does not match A:T mapping.");
    getSupplierReturnLogSheet_().appendRow(row);
    return { success: true, id: returnId, lineId: lineId };
  } finally {
    lock.releaseLock();
  }
}

function supplierReturnType_(item) {
  return String(item.category || '').toUpperCase() === 'YOURFINDS' || String(item.inventoryType).toUpperCase() === 'UNIQUE' ? 'YOURFINDS' : 'YOURSTYLE';
}

function getSupplierReturnInventory() {
  assertAppRequest_();
  return readInventoryListIndex_().filter(item => Number(item.stock)>0 && !['RESERVED','RETURNED','CONVERTED'].includes(item.status))
    .map(item => ({code:item.code,name:item.name,size:item.size,category:item.category,inventoryType:item.inventoryType,
      stock:item.stock,status:item.status,imageUrl:item.imageUrl,deliveryId:item.deliveryId}));
}

function supplierReturnBatchId_(type, date, requestId, usedIds) {
  const prefix=(type==='YOURFINDS'?'YFR':'YSR')+'-'+date.replace(/-/g,'')+'-';
  let hash=0;for (const letter of requestId) hash=(hash*31+letter.charCodeAt(0))%1000;
  for(let offset=0;offset<1000;offset++) {
    const id=prefix+String((hash+offset)%1000).padStart(3,'0');
    if(!usedIds.has(id))return id;
  }
  throw new Error('No return numbers available for this date.');
}

// One approval and locked batch. Retries repair a missing business record without deducting stock twice.
function saveSupplierReturnItems_(payload) {
  const auth=requireManager_(payload.managerPin,payload.managerToken);
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  let movementSheet,log,inventory,movementStart,logStart;
  const statusRollback=[],updatedRollback=[];
  try {
    const text=value=>String(value||'').trim();
    const requestId=text(payload.requestId).toUpperCase();
    if(!/^[A-Z0-9-]{10,80}$/.test(requestId))throw new Error('Invalid return request. Reopen the form.');
    const type=text(payload.returnType).toUpperCase();
    if(!['YOURSTYLE','YOURFINDS'].includes(type))throw new Error('Choose YourStyle or YourFinds.');
    const date=supplierReturnDate_(payload.returnDate), parsedDate=new Date(date+'T00:00:00Z');
    if(isNaN(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date)throw new Error('Enter a valid return date.');
    const preparedBy=text(payload.preparedBy),driver=text(payload.driver),plate=text(payload.plate).toUpperCase();
    if(!preparedBy||!driver||!plate)throw new Error('Prepared by, driver and plate number are required.');
    const status=text(payload.status||'RELEASED').toUpperCase(),receivedBy=text(payload.receivedBy);
    if(!['RELEASED','RECEIVED'].includes(status)||status==='RECEIVED'&&!receivedBy)throw new Error('Received By is required when received by supplier.');
    const supplier=text(payload.supplier)|| (type==='YOURFINDS'?'YourFinds':'YourStyle');
    if(!Array.isArray(payload.items)||!payload.items.length||payload.items.length>100)throw new Error('Select between 1 and 100 products.');
    const codes=new Set();
    const items=payload.items.map(line=>{
      const code=text(line.code),quantity=Number(line.quantity),reason=text(line.reason),condition=text(line.condition||'OTHER').toUpperCase();
      if(!code||codes.has(code)||!Number.isSafeInteger(quantity)||quantity<1||!reason)throw new Error('Each product needs a valid quantity and reason. Duplicate barcodes are not allowed.');
      if(!['SEALED','OPENED','DAMAGED','OTHER'].includes(condition))throw new Error('Invalid item condition.');
      codes.add(code);return {code:code,quantity:quantity,reason:reason,condition:condition};
    }).sort((a,b)=>a.code.localeCompare(b.code));
    const common={returnDate:date,preparedBy:preparedBy,driver:driver,plate:plate,supplier:supplier,status:status,
      receivedBy:receivedBy,remarks:text(payload.remarks),approvedBy:auth.managerName,recordedBy:text(payload.employee)};
    const binding=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify({type:type,...common,approvedBy:undefined,items:items})));
    const ss=SpreadsheetApp.getActiveSpreadsheet();
    log=getSupplierReturnLogSheet_();movementSheet=ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);inventory=ss.getSheetByName(SHEETS.INVENTORY);
    if(!movementSheet||!inventory||inventory.getLastRow()<2)throw new Error('Inventory sheets are missing.');
    const logRows=log.getLastRow()>1?log.getRange(2,1,log.getLastRow()-1,RETURN_LOG_COLUMN_COUNT).getValues():[];
    const moves=movementSheet.getLastRow()>1?movementSheet.getRange(2,1,movementSheet.getLastRow()-1,MOVEMENT_LOG_COLUMN_COUNT).getValues():[];
    const prefix='YSRL-'+requestId+'-';
    const previousMoves=moves.filter(row=>String(row[MOVE_IDX.SOURCE_LINE_ID]).startsWith(prefix)&&String(row[MOVE_IDX.SOURCE])===INVENTORY_MOVEMENT_SOURCE.SUPPLIER_RETURN);
    previousMoves.forEach(row=>{let note;try{note=JSON.parse(row[MOVE_IDX.NOTES]);}catch(error){note={};}
      if(note.batchBinding!==binding)throw new Error('This return request already exists with different details. Reopen the form.');});
    const ids=new Set(previousMoves.map(row=>String(row[MOVE_IDX.REFERENCE_ID])));
    if(ids.size>1)throw new Error('Return request has conflicting records. Contact a manager.');
    const returnId=ids.size?Array.from(ids)[0]:supplierReturnBatchId_(type,date,requestId,new Set(logRows.map(row=>String(row[RETURN_IDX.RETURN_ID])).concat(moves.map(row=>String(row[MOVE_IDX.REFERENCE_ID])))));
    const values=inventory.getRange(2,1,inventory.getLastRow()-1,inventoryHasStoredDeliveryMetadata_(inventory)?INV_COL.DATE_DELIVERED:INVENTORY_COLUMN_COUNT).getValues();
    const codeValues=inventory.getRange(2,INV_COL.CODE,values.length,1).getDisplayValues();
    const byCode=new Map();
    values.forEach((row,index)=>{const code=text(codeValues[index][0]);if(codes.has(code)){
      if(byCode.has(code))throw new Error('Duplicate inventory barcode: '+code);
      byCode.set(code,{code:code,rowNumber:index+2,name:text(row[INV_IDX.DESCRIPTION]),size:text(row[INV_IDX.SIZE]),
        category:text(row[INV_IDX.CATEGORY]),inventoryType:text(row[INV_IDX.INVENTORY_TYPE]),status:text(row[INV_IDX.STATUS]).toUpperCase(),
        stock:Number(row[INV_IDX.STOCK])||0,updatedAt:row[INV_IDX.UPDATED_AT],deliveryId:text(row[INV_IDX.DELIVERY_ID])});
    }});
    const pendingMoves=[],pendingLog=[],now=new Date();
    items.forEach(line=>{
      const lineId=prefix+line.code,item=byCode.get(line.code);
      if(!item||supplierReturnType_(item)!==type)throw new Error('Product does not match the selected return type: '+line.code);
      const oldMoves=previousMoves.filter(row=>String(row[MOVE_IDX.SOURCE_LINE_ID])===lineId);
      const logged=logRows.filter(row=>String(row[RETURN_IDX.RETURN_LINE_ID])===lineId);
      if(logged.length){
        if(logged.length!==1||String(logged[0][RETURN_IDX.RETURN_ID])!==returnId||!oldMoves.length)throw new Error('Return records need manager review.');
        return;
      }
      const original=oldMoves.length?JSON.parse(String(oldMoves[0][MOVE_IDX.NOTES])):null;
      const metadata=original||{...common,batchBinding:binding,originalDeliveryId:item.deliveryId,size:item.size};
      if(!oldMoves.length){
        updatedRollback.push({rowNumber:item.rowNumber,updatedAt:item.updatedAt});
        if(['RESERVED','RETURNED','CONVERTED'].includes(item.status)||line.quantity>item.stock)throw new Error('Item is unavailable or return quantity exceeds stock: '+line.code);
        if(String(item.inventoryType).toUpperCase()==='UNIQUE'&&line.quantity!==1)throw new Error('Unique items must have quantity 1.');
        const movement={code:item.code,qtyChange:-line.quantity,referenceId:returnId,sourceLineId:lineId,
          employee:common.recordedBy||preparedBy,item:item.name,reason:line.reason,source:INVENTORY_MOVEMENT_SOURCE.SUPPLIER_RETURN};
        const namedBundle=String(item.category).toUpperCase()==='WHOLESALE'&&/ · \([1-9]\d*\) pcs$/i.test(item.name);
        const queue=namedBundle?buildPhysicalBundleSaleQueue_(item.category,item.code):[];
        if(queue.length){
          const available=queue.filter(bundle=>!bundle.distributed&&!bundle.fullSold&&!bundle.soldHalves);
          if(available.length<line.quantity)throw new Error('Not enough unopened bundles available to return: '+item.code);
          available.slice(0,line.quantity).forEach(bundle=>pendingMoves.push({...movement,qtyChange:-1,bundleNo:bundle.bundleNo,
            notes:JSON.stringify({...metadata,physicalBundleAllocation:physicalBundleAllocationNote_(bundle.deliveryId,'FULL',bundle.sheetRow)})}));
        }else pendingMoves.push({...movement,notes:JSON.stringify(metadata)});
      }
      pendingLog.push([returnId,lineId,date,now,metadata.preparedBy,metadata.approvedBy,metadata.driver,metadata.plate,
        metadata.receivedBy,metadata.supplier,metadata.originalDeliveryId,item.code,item.name,item.size,
        supplierReturnCategoryForSheet_(item.category),line.quantity,line.reason,line.condition,status,metadata.remarks]);
      if(String(item.inventoryType).toUpperCase()==='UNIQUE'&&item.status!=='RETURNED')statusRollback.push({rowNumber:item.rowNumber,status:item.status});
    });
    movementStart=movementSheet.getLastRow();logStart=log.getLastRow();
    if(pendingMoves.length)changeInventoryStockBatch_(pendingMoves);
    if(pendingLog.length) {
      const end=logStart+pendingLog.length;if(end>log.getMaxRows())log.insertRowsAfter(log.getMaxRows(),end-log.getMaxRows());
      log.getRange(logStart+1,1,pendingLog.length,RETURN_LOG_COLUMN_COUNT).setValues(pendingLog);
    }
    statusRollback.forEach(item=>{
      const cell=inventory.getRange(item.rowNumber,INV_COL.STATUS);setInventoryStatusValidation_(cell);cell.setValue(INVENTORY_STATUS.RETURNED);
    });
    recordInventoryChangedCodes_(items.map(item=>item.code));SpreadsheetApp.flush();
    return {success:true,id:returnId,lineIds:items.map(item=>prefix+item.code),quantity:items.reduce((n,item)=>n+item.quantity,0)};
  } catch(error) {
    if(logStart!==undefined&&log.getLastRow()>logStart)log.deleteRows(logStart+1,log.getLastRow()-logStart);
    if(movementStart!==undefined&&movementSheet.getLastRow()>movementStart)movementSheet.deleteRows(movementStart+1,movementSheet.getLastRow()-movementStart);
    if(movementStart!==undefined){
      statusRollback.forEach(item=>inventory.getRange(item.rowNumber,INV_COL.STATUS).setValue(item.status));
      updatedRollback.forEach(item=>inventory.getRange(item.rowNumber,INV_COL.UPDATED_AT).setValue(item.updatedAt));
    }
    SpreadsheetApp.flush();throw error;
  } finally {lock.releaseLock();}
}
