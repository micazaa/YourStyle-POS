/* ==========================================================
   PHASE 9 — CUSTOMER EXCHANGE
   Sales Log remains the financial ledger.
   Status remains COMPLETED / VOIDED.
========================================================== */

const EXCHANGE_REASON = {
  RETURN: "EXCHANGE RETURN",
  REPLACEMENT: "EXCHANGE REPLACEMENT"
};

function generateExchangeId() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SALES_LOG);
  const today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyyMMdd");
  const prefix = "EX-" + today + "-";
  let highest = 0;
  if (sheet && sheet.getLastRow() >= 2) {
    sheet.getRange(2, SALES_COL.RECEIPT_ID, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(function(r) {
      const id = String(r[0] || "").trim();
      if (!id.startsWith(prefix)) return;
      const n = Number(id.substring(prefix.length));
      if (Number.isInteger(n) && n > highest) highest = n;
    });
  }
  return prefix + String(highest + 1).padStart(3, "0");
}

function getExchangeableReceipt(receiptId) {
  try {
    receiptId = String(receiptId || "").trim().toUpperCase();
    if (!receiptId) throw new Error("Receipt ID is required.");
    if (receiptId.startsWith("EX-")) throw new Error("Enter the original sales receipt, not an exchange receipt.");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.SALES_LOG);
    if (!sheet || sheet.getLastRow() < 2) throw new Error("Sales transactions were not found.");
    const n = sheet.getLastRow() - 1;
    const data = sheet.getRange(2, 1, n, SALES_LOG_COLUMN_COUNT).getValues();
    const disp = sheet.getRange(2, 1, n, SALES_LOG_COLUMN_COUNT).getDisplayValues();
    const originals = [];
    for (let i=0;i<data.length;i++) {
      const rid=String(disp[i][SALES_IDX.RECEIPT_ID]||"").trim().toUpperCase();
      const status=String(disp[i][SALES_IDX.STATUS]||"").trim().toUpperCase();
      if (rid===receiptId && status==="COMPLETED") originals.push({row:data[i],d:disp[i]});
    }
    if (!originals.length) throw new Error("Completed original receipt not found: " + receiptId);
    const exchanged={};
    for (let i=0;i<data.length;i++) {
      const original=String(disp[i][SALES_IDX.ORIGINAL_RECEIPT_ID]||"").trim().toUpperCase();
      const status=String(disp[i][SALES_IDX.STATUS]||"").trim().toUpperCase();
      const reason=String(disp[i][SALES_IDX.REASON]||"").trim().toUpperCase();
      if (original!==receiptId || status!=="COMPLETED" || reason!==EXCHANGE_REASON.RETURN) continue;
      const code=String(disp[i][SALES_IDX.CODE]||"").trim();
      const qty=Math.abs(Number(data[i][SALES_IDX.QUANTITY])||0);
      if(code&&qty>0) exchanged[code]=(exchanged[code]||0)+qty;
    }
    const map={};
    originals.forEach(function(e){
      const code=String(e.d[SALES_IDX.CODE]||"").trim(); if(!code)return;
      const qty=Number(e.row[SALES_IDX.QUANTITY])||0; if(qty<=0)return;
      const price=Number(e.row[SALES_IDX.PRICE])||0;
      const net=Number(e.row[SALES_IDX.NET_TOTAL])||0;
      const unit=qty>0 ? Math.max(0,net/qty) : price;
      if(!map[code]) map[code]={code:code,name:String(e.d[SALES_IDX.ITEM_NAME]||"").trim(),size:String(e.d[SALES_IDX.SIZE]||"").trim(),category:String(e.d[SALES_IDX.CATEGORY]||"").trim(),purchasedQty:0,originalStickerPrice:price,originalUnitExchangeValue:unit};
      map[code].purchasedQty+=qty;
    });
    const items=Object.keys(map).map(function(code){const x=map[code];x.alreadyExchangedQty=Number(exchanged[code])||0;x.exchangeableQty=Math.max(0,x.purchasedQty-x.alreadyExchangedQty);return x;}).filter(x=>x.exchangeableQty>0);
    const first=originals[0].d;
    return {success:true,receipt:{receiptId:receiptId,cashier:String(first[SALES_IDX.CASHIER]||"").trim(),timestamp:String(first[SALES_IDX.TIMESTAMP]||"").trim(),status:"COMPLETED"},items:items};
  } catch(err) { return {success:false,message:err.message||String(err),items:[]}; }
}

function getExchangeReplacementProducts() {
  try {
    const products=(getFullInventory()||[]).filter(function(x){return String(x.status||"").trim().toUpperCase()==="ACTIVE" && (Number(x.stock)||0)>0 && String(x.code||"").trim();}).map(function(x){return {code:String(x.code||"").trim(),name:String(x.name||"").trim(),size:String(x.size||"").trim(),category:String(x.category||"").trim(),inventoryType:String(x.inventoryType||"").trim().toUpperCase(),stock:Number(x.stock)||0,price:Number(x.price)||0,imageUrl:String(x.imageUrl||"").trim()};}).sort((a,b)=>a.name.localeCompare(b.name)||a.code.localeCompare(b.code));
    return {success:true,products:products};
  } catch(err){return {success:false,message:err.message||String(err),products:[]};}
}

function completeCustomerExchange(payload) {
  payload=payload||{};
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const originalReceiptId=String(payload.originalReceiptId||"").trim().toUpperCase();
    const returnCode=String(payload.returnCode||"").trim();
    const replacementCode=String(payload.replacementCode||"").trim();
    const returnQty=Number(payload.returnQty), replacementQty=Number(payload.replacementQty);
    const employee=String(payload.employee||"").trim();
    const paymentMethod=String(payload.paymentMethod||"Cash").trim();
    const paymentReference=String(payload.paymentReference||"").trim();
    const cashReceived=Number(payload.cashReceived)||0;
    const notes=String(payload.notes||"").trim();
    if(!originalReceiptId||!returnCode||!replacementCode) throw new Error("Original receipt, returned item, and replacement item are required.");
    if(!Number.isInteger(returnQty)||returnQty<1||!Number.isInteger(replacementQty)||replacementQty<1) throw new Error("Exchange quantities must be positive whole numbers.");
    if(!employee) throw new Error("Logged-in employee is required.");
    const auth=verifyManagerPin(payload.managerPin); if(!auth||!auth.success) throw new Error(auth&&auth.message?auth.message:"Invalid Manager PIN.");

    // Revalidate original receipt while locked.
    const receipt=getExchangeableReceipt(originalReceiptId); if(!receipt.success) throw new Error(receipt.message);
    const returned=receipt.items.find(x=>String(x.code)===returnCode); if(!returned) throw new Error("Returned item is no longer exchangeable.");
    if(returnQty>returned.exchangeableQty) throw new Error("Return quantity exceeds remaining exchangeable quantity ("+returned.exchangeableQty+").");

    // Revalidate replacement from current Inventory while locked.
    const replacementResult=getInventoryItemByCode(replacementCode); if(!replacementResult||!replacementResult.success) throw new Error("Replacement inventory item was not found.");
    const replacement=replacementResult.item;
    if(String(replacement.status||"").trim().toUpperCase()!=="ACTIVE") throw new Error("Replacement item is inactive.");
    const replacementStock=Number(replacement.stock)||0;
    if(replacementStock<replacementQty) throw new Error("Insufficient replacement stock. Available: "+replacementStock+".");
    const replacementPrice=Number(replacement.price)||0;
    const returnUnitValue=Number(returned.originalUnitExchangeValue)||0;
    const returnValue=roundToTwo(returnUnitValue*returnQty);
    const replacementValue=roundToTwo(replacementPrice*replacementQty);
    if(replacementValue<returnValue) throw new Error("Replacement value must be equal to or higher than the returned value.");
    const amountDue=roundToTwo(replacementValue-returnValue);
    if(amountDue>0 && !paymentMethod) throw new Error("Payment method is required for the additional amount.");
    if(amountDue>0 && paymentMethod!=="Cash" && !paymentReference) throw new Error("Payment reference is required for non-cash exchange payment.");
    const changeGiven=paymentMethod==="Cash"?roundToTwo(Math.max(0,cashReceived-amountDue)):0;
    if(paymentMethod==="Cash" && amountDue>0 && cashReceived<amountDue) throw new Error("Cash received is less than the amount due.");

    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const sales=ss.getSheetByName(SHEETS.SALES_LOG), mov=ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG), inv=ss.getSheetByName(SHEETS.INVENTORY);
    if(!sales||!mov||!inv) throw new Error("Required Sales/Inventory sheets are missing.");
    const exchangeId=generateExchangeId();
    const salesStart=sales.getLastRow(), movementStart=mov.getLastRow();
    const returnResult=getInventoryItemByCode(returnCode); if(!returnResult||!returnResult.success) throw new Error("Returned inventory item was not found.");
    const returnItem=returnResult.item;
    const returnCell=inv.getRange(returnItem.rowNumber,INV_COL.STOCK), replacementCell=inv.getRange(replacement.rowNumber,INV_COL.STOCK);
    const returnBefore=Number(returnCell.getValue())||0, replacementBefore=Number(replacementCell.getValue())||0;
    if(replacementBefore<replacementQty) throw new Error("Replacement stock changed. Available: "+replacementBefore+".");
    try {
      // Physical stock: return comes back, replacement leaves.
      returnCell.setValue(returnBefore+returnQty);
      replacementCell.setValue(replacementBefore-replacementQty);
      logInventoryMovement({code:returnCode,type:getInventoryMovementType(returnItem.category,returnItem.inventoryType),qtyChange:returnQty,stockBefore:returnBefore,stockAfter:returnBefore+returnQty,referenceId:exchangeId,employee:employee,item:returnItem.name,reason:EXCHANGE_REASON.RETURN,source:INVENTORY_MOVEMENT_SOURCE.EXCHANGE,notes:"Original receipt: "+originalReceiptId+(notes?" | "+notes:"")});
      logInventoryMovement({code:replacementCode,type:getInventoryMovementType(replacement.category,replacement.inventoryType),qtyChange:-replacementQty,stockBefore:replacementBefore,stockAfter:replacementBefore-replacementQty,referenceId:exchangeId,employee:employee,item:replacement.name,reason:EXCHANGE_REASON.REPLACEMENT,source:INVENTORY_MOVEMENT_SOURCE.EXCHANGE,notes:"Original receipt: "+originalReceiptId+(notes?" | "+notes:"")});
      const now=new Date();
      const commonPayment=paymentMethod||"Cash";
      const rows=[
        [now,exchangeId,employee,returnCode,returned.name,returned.size,returned.category,-returnQty,returnUnitValue,0,0,0,-returnValue,commonPayment,paymentMethod==="Cash"?"N/A":paymentReference,"COMPLETED",0,0,auth.managerName,EXCHANGE_REASON.RETURN,originalReceiptId],
        [now,exchangeId,employee,replacementCode,replacement.name,replacement.size,replacement.category,replacementQty,replacementPrice,0,0,0,replacementValue,commonPayment,paymentMethod==="Cash"?"N/A":paymentReference,"COMPLETED",paymentMethod==="Cash"?cashReceived:0,changeGiven,auth.managerName,EXCHANGE_REASON.REPLACEMENT,originalReceiptId]
      ];
      sales.getRange(sales.getLastRow()+1,1,rows.length,SALES_LOG_COLUMN_COUNT).setValues(rows);
      SpreadsheetApp.flush();
      return {success:true,exchangeId:exchangeId,originalReceiptId:originalReceiptId,returnValue:returnValue,replacementValue:replacementValue,amountDue:amountDue,paymentMethod:commonPayment,cashReceived:paymentMethod==="Cash"?cashReceived:0,changeGiven:changeGiven,authorizedBy:auth.managerName};
    } catch(writeErr) {
      try{returnCell.setValue(returnBefore);replacementCell.setValue(replacementBefore);}catch(e){}
      if(mov.getLastRow()>movementStart) mov.deleteRows(movementStart+1,mov.getLastRow()-movementStart);
      if(sales.getLastRow()>salesStart) sales.deleteRows(salesStart+1,sales.getLastRow()-salesStart);
      SpreadsheetApp.flush(); throw writeErr;
    }
  } catch(err){return {success:false,message:err.message||String(err)};} finally {try{lock.releaseLock();}catch(e){}}
}
