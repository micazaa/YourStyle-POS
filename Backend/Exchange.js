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
  assertAppRequest_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SALES_LOG);
  const today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "MMdd");
  const prefix = "EX-" + today;
  const used = new Set();
  if (sheet && sheet.getLastRow() >= 2) {
    sheet.getRange(2, SALES_COL.RECEIPT_ID, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(function(r) {
      const id = String(r[0] || "").trim();
      if (id.startsWith(prefix)) used.add(id);
    });
  }
  const start = Math.floor(Math.random() * 9000);
  for (let offset = 0; offset < 9000; offset++) {
    const id = prefix + String(1000 + (start + offset) % 9000);
    if (!used.has(id)) return id;
  }
  throw new Error("No exchange receipt numbers remain for this date.");
}

function readExchangeReceiptRows_(sheet, column, receiptId) {
  const count = sheet.getLastRow() - 1;
  if (count < 1) return [];
  const matches = sheet.getRange(2, column, count, 1).createTextFinder(receiptId)
    .matchCase(false).matchEntireCell(true).findAll()
    .map(cell=>cell.getRow()).sort((a,b)=>a-b);
  const runs = [];
  matches.forEach(function(row) {
    const previous = runs[runs.length - 1];
    if (previous && row === previous.end + 1) previous.end = row;
    else runs.push({start:row,end:row});
  });
  const result = [];
  runs.forEach(function(run) {
    const range = sheet.getRange(run.start, 1, run.end-run.start+1, SALES_COL.ORIGINAL_RECEIPT_ID);
    const values = range.getValues(), display = range.getDisplayValues();
    values.forEach((row,index)=>result.push({row:row,d:display[index]}));
  });
  return result;
}

function getExchangeableReceipt(receiptId) {
  assertAppRequest_();
  try {
    receiptId = String(receiptId || "").trim().toUpperCase();
    if (!receiptId) throw new Error("Receipt ID is required.");
    if (receiptId.startsWith("EX-")) throw new Error("Enter the original sales receipt, not an exchange receipt.");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.SALES_LOG);
    if (!sheet || sheet.getLastRow() < 2) throw new Error("Sales transactions were not found.");
    const reservation = findReservation_(receiptId);
    if (reservation && reservation.status === 'EXCHANGED') throw new Error('This deposit was already used on ' + reservation.exchangeId + '.');
    if (reservation && reservation.status === 'RESERVED') {
      return {success:true, receipt:{receiptId:receiptId, cashier:reservation.cashier, status:'RESERVED', reservationCredit:true},
        items:[{code:reservation.code, name:reservation.name, size:reservation.size, category:'YourFinds',
          purchasedQty:1, exchangeableQty:1, alreadyExchangedQty:0, originalStickerPrice:reservation.price,
          originalUnitExchangeValue:reservation.deposit}]};
    }
    const originals = readExchangeReceiptRows_(sheet, SALES_COL.RECEIPT_ID, receiptId)
      .filter(entry=>String(entry.d[SALES_IDX.STATUS]||'').trim().toUpperCase()==='COMPLETED');
    if (!originals.length) throw new Error("Completed original receipt not found: " + receiptId);
    const exchanged={};
    readExchangeReceiptRows_(sheet, SALES_COL.ORIGINAL_RECEIPT_ID, receiptId).forEach(function(entry) {
      const status=String(entry.d[SALES_IDX.STATUS]||"").trim().toUpperCase();
      const reason=String(entry.d[SALES_IDX.REASON]||"").trim().toUpperCase();
      if (status!=="COMPLETED" || reason!==EXCHANGE_REASON.RETURN) return;
      const code=String(entry.d[SALES_IDX.CODE]||"").trim();
      const qty=Math.abs(Number(entry.row[SALES_IDX.QUANTITY])||0);
      if(code&&qty>0) exchanged[code]=(exchanged[code]||0)+qty;
    });
    const map={};
    originals.forEach(function(e){
      const code=String(e.d[SALES_IDX.CODE]||"").trim(); if(!code)return;
      const qty=Number(e.row[SALES_IDX.QUANTITY])||0; if(qty<=0)return;
      const price=Number(e.row[SALES_IDX.PRICE])||0;
      const net=Number(e.row[SALES_IDX.NET_TOTAL])||0;
      if(!map[code]) map[code]={code:code,name:String(e.d[SALES_IDX.ITEM_NAME]||"").trim(),size:String(e.d[SALES_IDX.SIZE]||"").trim(),category:String(e.d[SALES_IDX.CATEGORY]||"").trim(),purchasedQty:0,originalStickerPrice:price,originalExchangeTotal:0};
      map[code].purchasedQty+=qty;
      map[code].originalExchangeTotal+=Math.max(0,net);
    });
    const items=Object.keys(map).map(function(code){const x=map[code];x.originalUnitExchangeValue=reservation && reservation.status === "COMPLETED" ? reservation.price : x.originalExchangeTotal/x.purchasedQty;delete x.originalExchangeTotal;x.alreadyExchangedQty=Number(exchanged[code])||0;x.exchangeableQty=Math.max(0,x.purchasedQty-x.alreadyExchangedQty);return x;}).filter(x=>x.exchangeableQty>0);
    const first=originals[0].d;
    return {success:true,receipt:{receiptId:receiptId,cashier:String(first[SALES_IDX.CASHIER]||"").trim(),timestamp:String(first[SALES_IDX.TIMESTAMP]||"").trim(),status:"COMPLETED"},items:items};
  } catch(err) { return {success:false,message:err.message||String(err),items:[]}; }
}

function getExchangeReplacementProducts() {
  assertAppRequest_();
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY);
    if (!sheet || sheet.getLastRow() < 2) return {success:true,products:[]};
    // Replacement choices need no Product Master, delivery ledger, or cost data.
    const range = sheet.getRange(2, 1, sheet.getLastRow()-1, INV_COL.IMAGE);
    const values = range.getValues(), display = range.getDisplayValues();
    const products = [];
    values.forEach(function(row,index) {
      const d = display[index], code = String(d[INV_IDX.CODE]||'').trim();
      const stock = Number(row[INV_IDX.STOCK])||0;
      if (!code || stock <= 0 || String(d[INV_IDX.STATUS]||'').trim().toUpperCase() !== 'ACTIVE') return;
      products.push({code:code,name:String(d[INV_IDX.DESCRIPTION]||'').trim(),size:String(d[INV_IDX.SIZE]||'').trim(),
        category:String(d[INV_IDX.CATEGORY]||'').trim(),inventoryType:String(d[INV_IDX.INVENTORY_TYPE]||'').trim().toUpperCase(),
        stock:stock,price:Number(row[INV_IDX.YS_PRICE])||0,imageUrl:String(d[INV_IDX.IMAGE]||'').trim()});
    });
    products.sort((a,b)=>a.name.localeCompare(b.name)||a.code.localeCompare(b.code));
    return {success:true,products:products};
  } catch(err){return {success:false,message:err.message||String(err),products:[]};}
}

function getCustomerExchangeData(receiptId, includeProducts) {
  assertAppRequest_();
  const result = getExchangeableReceipt(receiptId);
  if (!result.success || !result.items.length || includeProducts === false) return result;
  const catalog = getExchangeReplacementProducts();
  if (!catalog.success) return catalog;
  result.products = catalog.products;
  return result;
}

function completeCustomerExchange(payload) {
  assertAppRequest_();
  payload = payload || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const originalReceiptId = String(payload.originalReceiptId || "").trim().toUpperCase();
    const employee = String(payload.employee || "").trim();
    const notes = String(payload.notes || "").trim();
    const items = Array.isArray(payload.items) ? payload.items : [payload];
    if (!originalReceiptId || !items.length) throw new Error("Original receipt and exchange items are required.");
    if (items.length > 100) throw new Error("An exchange cannot contain more than 100 item rows.");
    if (!employee) throw new Error("Logged-in employee is required.");
    const auth = requireManager_(payload.managerPin, payload.managerToken);
    const receipt = getExchangeableReceipt(originalReceiptId);
    if (!receipt.success) throw new Error(receipt.message);
    const reservation = receipt.receipt.reservationCredit ? findReservation_(originalReceiptId) : null;
    if (reservation) {
      const session = dashboardEmployee_(payload.sessionToken);
      if (session.name !== employee) throw new Error('Employee session changed. Reopen exchange.');
      const held = reservationInventoryItem_(reservation.code);
      if (held.status !== 'RESERVED' || held.stock !== 1) throw new Error('Reserved inventory changed. Ask a manager to review it.');
    }
    const inventory = new Map(getFullInventory({includeDeliveryMetadata:false}).map(item=>[String(item.code), item]));
    const returns = new Map(), replacements = new Map();
    items.forEach(function(item) {
      const returnCode = String(item.returnCode || "").trim();
      const replacementCode = String(item.replacementCode || "").trim();
      const returnQty = Number(item.returnQty), replacementQty = Number(item.replacementQty);
      if (!returnCode || !replacementCode) throw new Error("Returned and replacement items are required for every row.");
      if (!Number.isInteger(returnQty) || returnQty < 1 || !Number.isInteger(replacementQty) || replacementQty < 1) {
        throw new Error("Exchange quantities must be positive whole numbers.");
      }
      if (reservation && (returnCode !== reservation.code || returnQty !== 1)) throw new Error('Select the reserved deposit credit.');
      if (!reservation) returns.set(returnCode, (returns.get(returnCode) || 0) + returnQty);
      replacements.set(replacementCode, (replacements.get(replacementCode) || 0) + replacementQty);
    });
    let returnValue = 0, replacementValue = 0;
    const returnLines = [], replacementLines = [];
    returns.forEach(function(quantity, code) {
      const item = receipt.items.find(item=>String(item.code) === code);
      if (!item || !inventory.has(code)) throw new Error("Returned item is no longer exchangeable: " + code);
      if (quantity > Number(item.exchangeableQty)) throw new Error("Return quantity exceeds remaining exchangeable quantity for " + code + " (" + item.exchangeableQty + ").");
      const price = Number(item.originalUnitExchangeValue) || 0;
      const value = roundToTwo(price * quantity);
      returnValue += value;
      returnLines.push({item:item, code:code, quantity:-quantity, price:price, value:-value, reason:EXCHANGE_REASON.RETURN});
    });
    if (reservation) {
      returnValue = reservation.deposit;
      returnLines.push({item:inventory.get(reservation.code), code:reservation.code, quantity:0,
        price:reservation.deposit, value:-reservation.deposit, reason:'RESERVATION CREDIT'});
    }
    replacements.forEach(function(quantity, code) {
      const item = inventory.get(code);
      if (!item || String(item.status).toUpperCase() !== "ACTIVE") throw new Error("Replacement item is unavailable: " + code);
      if (quantity > Number(item.stock)) throw new Error("Insufficient replacement stock for " + code + ". Available: " + item.stock + ".");
      const price = Number(item.price) || 0;
      if (price < 0 || !Number.isFinite(price)) throw new Error("Invalid replacement price for " + code + ".");
      const value = roundToTwo(price * quantity);
      replacementValue += value;
      replacementLines.push({item:item, code:code, quantity:quantity, price:price, value:value, reason:EXCHANGE_REASON.REPLACEMENT});
    });
    returnValue = roundToTwo(returnValue);replacementValue = roundToTwo(replacementValue);
    if (replacementValue < returnValue) throw new Error("Replacement value must be equal to or higher than the returned value.");
    const amountDue = roundToTwo(replacementValue - returnValue);
    if (payload.expectedAmountDue !== undefined &&
        (!Number.isFinite(Number(payload.expectedAmountDue)) || Math.abs(Number(payload.expectedAmountDue)-amountDue) > .01)) {
      throw new Error("Exchange values changed. Review the original receipt and replacements again.");
    }
    const paymentMethod = String(payload.paymentMethod || "Cash").trim();
    const allowed = {Cash:["Cash"],GCash:["GCash"],"QR Code":["QR Code"],"Credit Card":["Credit Card"],
      "Cash + GCash":["Cash","GCash"],"Cash + Credit Card":["Cash","Credit Card"],"GCash + Credit Card":["GCash","Credit Card"]};
    const methods = allowed[paymentMethod];
    if (!methods) throw new Error("Select a valid payment method.");
    const reference = String(payload.paymentReference || "").trim();
    let parts;
    if (methods.length === 2 && amountDue > 0) {
      parts = normalizeCheckoutPaymentParts_(paymentMethod, payload.paymentParts, amountDue);
      if (parts.length !== 2 || parts.some((part,index)=>part.method !== methods[index])) throw new Error("Split payment methods do not match the selected payment.");
    } else {
      if (amountDue > 0 && paymentMethod !== "Cash" && !reference) throw new Error("Payment reference is required for non-cash exchange payment.");
      parts = [{method:amountDue > 0 ? paymentMethod : "Cash",amount:amountDue,reference:reference}];
    }
    if (parts.some(part=>!Number.isFinite(part.amount) || part.amount < 0)) throw new Error("Invalid payment amount.");
    const cardBase = parts.reduce((sum,part)=>sum+(part.method === "Credit Card" ? part.amount : 0),0);
    const chargedCardBase = parts.reduce((sum,part)=>sum+(part.method === "Credit Card" ? (part.receivedAmount === undefined ? part.amount : part.receivedAmount) : 0),0);
    const qrBase = parts.reduce((sum,part)=>sum+(part.method === "QR Code" ? part.amount : 0),0);
    const feeCharged = roundToTwo(qrBase * .01 + (payload.applyCardFee ? chargedCardBase * .032 : 0));
    const feeAbsorbed = payload.applyCardFee ? 0 : roundToTwo(cardBase * .032);
    const cashReceived = Number(payload.cashReceived) || 0;
    const cashPart = parts.find(part=>part.method === "Cash");
    const cashDue = cashPart ? cashPart.amount : 0;
    if (!Number.isFinite(cashReceived) || cashReceived < 0 || (cashPart && cashReceived < cashDue)) throw new Error("Cash received is less than the amount due.");
    const changeGiven = cashPart ? roundToTwo(Math.max(0,cashReceived-cashDue)) : 0;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sales = ss.getSheetByName(SHEETS.SALES_LOG), movement = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
    if (!sales || !movement) throw new Error("Required Sales/Inventory sheets are missing.");
    ensureSalesLogSplitPaymentColumns_(sales);
    const exchangeId = generateExchangeId(), now = new Date();
    const lines = returnLines.concat(replacementLines);
    let chargedLeft = feeCharged, absorbedLeft = feeAbsorbed;
    replacementLines.forEach(function(line,index) {
      const last = index === replacementLines.length - 1;
      const share = replacementValue > 0 ? line.value / replacementValue : 0;
      line.feeCharged = last ? chargedLeft : roundToTwo(feeCharged * share);
      line.feeAbsorbed = last ? absorbedLeft : roundToTwo(feeAbsorbed * share);
      chargedLeft = roundToTwo(chargedLeft-line.feeCharged);absorbedLeft = roundToTwo(absorbedLeft-line.feeAbsorbed);
    });
    const rows = lines.map(function(line,index) {
      line.salesLineId = generateSalesLineId();
      const row = Array(SALES_LOG_COLUMN_COUNT).fill("");
      row[SALES_IDX.TIMESTAMP]=now;row[SALES_IDX.RECEIPT_ID]=exchangeId;row[SALES_IDX.CASHIER]=employee;
      row[SALES_IDX.CODE]=line.code;row[SALES_IDX.ITEM_NAME]=line.item.name;row[SALES_IDX.SIZE]=line.item.size||"";
      row[SALES_IDX.CATEGORY]=line.item.category;row[SALES_IDX.QUANTITY]=line.quantity;row[SALES_IDX.PRICE]=line.price;
      row[SALES_IDX.DISCOUNT]=0;row[SALES_IDX.FEE_CHARGED]=line.feeCharged||0;row[SALES_IDX.FEE_ABSORBED]=line.feeAbsorbed||0;
      row[SALES_IDX.NET_TOTAL]=roundToTwo(line.value-(line.feeAbsorbed||0));
      row[SALES_IDX.PAYMENT_METHOD]=amountDue ? paymentMethod : "Cash";row[SALES_IDX.REFERENCE]=paymentMethod === "Cash" ? "N/A" : reference;
      row[SALES_IDX.STATUS]="COMPLETED";row[SALES_IDX.CASH_RECEIVED]=index === returnLines.length ? cashReceived : 0;
      row[SALES_IDX.CHANGE]=index === returnLines.length ? changeGiven : 0;row[SALES_IDX.AUTHORIZED_BY]=auth.managerName;
      row[SALES_IDX.REASON]=line.reason;row[SALES_IDX.ORIGINAL_RECEIPT_ID]=originalReceiptId;row[SALES_IDX.SALES_LINE_ID]=line.salesLineId;
      row[SALES_IDX.ENTRY_SOURCE]="POS";row[SALES_IDX.SYNC_STATUS]="PROCESSED";row[SALES_IDX.PROCESSED_AT]=now;row[SALES_IDX.PRICE_SOURCE]="REGULAR";
      row[SALES_IDX.PAYMENT_1_METHOD]=parts[0].method;row[SALES_IDX.PAYMENT_1_AMOUNT]=parts[0].amount;row[SALES_IDX.PAYMENT_1_REFERENCE]=parts[0].reference;
      if (parts[1]) {row[SALES_IDX.PAYMENT_2_METHOD]=parts[1].method;row[SALES_IDX.PAYMENT_2_AMOUNT]=parts[1].amount;row[SALES_IDX.PAYMENT_2_REFERENCE]=parts[1].reference;}
      return row;
    });
    const salesStart = sales.getLastRow(), movementStart = movement.getLastRow();
    const reservationSheet = reservation ? reservationSheet_(false) : null;
    const reservationBefore = reservation ? reservationSheet.getRange(reservation.rowNumber, 1, 1, RESERVATION_HEADERS_.length).getValues() : null;
    const heldItem = reservation ? inventory.get(reservation.code) : null;
    const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);
    const heldUpdatedAt = heldItem ? inventorySheet.getRange(heldItem.rowNumber, INV_COL.UPDATED_AT).getValue() : null;
    try {
      changeInventoryStockBatch_(lines.filter(line=>line.quantity !== 0).map(line=>({code:line.code,qtyChange:-line.quantity,
        referenceId:exchangeId,sourceLineId:line.salesLineId,employee:employee,item:line.item.name,
        reason:line.reason,source:INVENTORY_MOVEMENT_SOURCE.EXCHANGE,
        notes:"Original receipt: "+originalReceiptId+(notes ? " | "+notes : "")})));
      sales.getRange(salesStart+1,1,rows.length,SALES_LOG_COLUMN_COUNT).setValues(rows);
      if (reservation) {
        setReservationInventoryStatus_(heldItem, 'ACTIVE');
        const updated = reservationBefore[0].slice();
        updated[6] = 0; updated[7] = 'EXCHANGED'; updated[10] = now; updated[11] = employee; updated[12] = exchangeId;
        reservationSheet.getRange(reservation.rowNumber, 1, 1, updated.length).setValues([updated]);
      }
      SpreadsheetApp.flush();
      return {success:true,exchangeId:exchangeId,originalReceiptId:originalReceiptId,returnValue:returnValue,
        replacementValue:replacementValue,amountDue:amountDue,totalDue:roundToTwo(amountDue+feeCharged),
        cashReceived:cashReceived,changeGiven:changeGiven,authorizedBy:auth.managerName};
    } catch (error) {
      if (reservation) {
        reservationSheet.getRange(reservation.rowNumber, 1, 1, RESERVATION_HEADERS_.length).setValues(reservationBefore);
        setReservationInventoryStatus_(heldItem, 'RESERVED');
        inventorySheet.getRange(heldItem.rowNumber, INV_COL.UPDATED_AT).setValue(heldUpdatedAt);
      }
      if (movement.getLastRow()>movementStart) movement.deleteRows(movementStart+1,movement.getLastRow()-movementStart);
      if (sales.getLastRow()>salesStart) sales.deleteRows(salesStart+1,sales.getLastRow()-salesStart);
      SpreadsheetApp.flush();throw error;
    }
  } catch (error) { return {success:false,message:error.message||String(error)}; }
  finally { lock.releaseLock(); }
}
