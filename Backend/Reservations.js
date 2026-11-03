// Reservations hold stock without creating a stock movement. Payments remain in Sales Log.
const RESERVATION_HEADERS_ = [
  'Receipt ID', 'Product Code', 'Item Name', 'Size', 'Agreed Price', 'Down Payment',
  'Balance', 'Status', 'Created At', 'Cashier', 'Completed At', 'Completed By',
  'Exchange Receipt ID', 'Deposit Request ID', 'Balance Request ID', 'Original Price'
];

function reservationSheet_(create) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.RESERVATIONS);
  if (!sheet && create) {
    sheet = ss.insertSheet(SHEETS.RESERVATIONS);
    sheet.getRange(1, 1, 1, RESERVATION_HEADERS_.length).setValues([RESERVATION_HEADERS_]);
    sheet.getRange('E:G').setNumberFormat('₱#,##0.00');
    sheet.getRange('B:B').setNumberFormat('@');
  }
  if (sheet) {
    const headers = sheet.getRange(1, 1, 1, RESERVATION_HEADERS_.length).getDisplayValues()[0];
    if (headers.some((value, index) => value !== RESERVATION_HEADERS_[index])) {
      throw new Error('Reservations sheet has unexpected columns. No reservation data was changed.');
    }
  }
  return sheet;
}

function reservationFromRow_(row, rowNumber) {
  return {receiptId:String(row[0]), code:String(row[1]), name:String(row[2]), size:String(row[3]),
    price:Number(row[4]), deposit:Number(row[5]), balance:Number(row[6]), status:String(row[7]),
    cashier:String(row[9]), exchangeId:String(row[12] || ''), depositRequestId:String(row[13]),
    balanceRequestId:String(row[14] || ''), originalPrice:Number(row[15]), rowNumber:rowNumber};
}

function readReservations_() {
  const sheet = reservationSheet_(false);
  return sheet && sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, RESERVATION_HEADERS_.length).getValues()
      .map((row, index) => reservationFromRow_(row, index + 2)).filter(row => row.receiptId) : [];
}

function findReservation_(receiptId) {
  const sheet = reservationSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const match = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(String(receiptId).trim().toUpperCase())
    .matchCase(false).matchEntireCell(true).findNext();
  return match ? reservationFromRow_(sheet.getRange(match.getRow(), 1, 1, RESERVATION_HEADERS_.length).getValues()[0], match.getRow()) : null;
}

function reservationForClient_(reservation) {
  return {receiptId:reservation.receiptId, code:reservation.code, name:reservation.name, size:reservation.size,
    price:reservation.price, deposit:reservation.deposit, balance:reservation.status === 'RESERVED' ? reservation.balance : 0,
    status:reservation.status, cashier:reservation.cashier, exchangeId:reservation.exchangeId};
}

function reservationInventoryItem_(code) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('Inventory item not found.');
  const matches = sheet.getRange(2, INV_COL.CODE, sheet.getLastRow() - 1, 1).createTextFinder(String(code))
    .matchCase(true).matchEntireCell(true).findAll();
  if (matches.length !== 1) throw new Error('Item is missing or its barcode is duplicated. Reload inventory.');
  const rowNumber = matches[0].getRow();
  const row = sheet.getRange(rowNumber, 1, 1, INVENTORY_COLUMN_COUNT).getValues()[0];
  return {code:String(row[0]), name:String(row[1]), size:String(row[2]), category:String(row[3]),
    inventoryType:String(row[4]).toUpperCase(), status:String(row[5]).toUpperCase(),
    stock:Number(row[10]), price:Number(row[12]), imageUrl:String(row[14] || ''), rowNumber:rowNumber};
}

function setReservationInventoryStatus_(item, status) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY);
  const cell = sheet.getRange(item.rowNumber, INV_COL.STATUS);
  setInventoryStatusValidation_(cell);
  cell.setValue(status);
  sheet.getRange(item.rowNumber, INV_COL.UPDATED_AT).setValue(new Date());
}

function assertInventoryNotReserved_(codes) {
  const requested = new Set((Array.isArray(codes) ? codes : [codes]).map(code => String(code).trim()));
  if (!requested.size) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY);
  if (!sheet || sheet.getLastRow() < 2) return;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, INV_COL.STATUS).getDisplayValues();
  rows.forEach(row => {
    if (requested.has(String(row[INV_IDX.CODE]).trim()) && String(row[INV_IDX.STATUS]).toUpperCase() === 'RESERVED') {
      throw new Error('Item ' + row[INV_IDX.CODE] + ' is reserved. Complete its transaction or exchange its deposit from Transaction History.');
    }
  });
}

// Deposit and balance can share a receipt, but are separate payment events in cash reports.
function salesPaymentKey_(row) {
  const receiptId = String(row[SALES_IDX.RECEIPT_ID] || '').trim();
  const reason = String(row[SALES_IDX.REASON] || '').toUpperCase();
  return /^RESERVATION (DEPOSIT|BALANCE)$/.test(reason) ? receiptId + '|' + reason : receiptId;
}

function reservationPayment_(payload, amount) {
  const method = String(payload.paymentMethod || 'Cash');
  const parts = normalizeCheckoutPaymentParts_(method, payload.paymentParts, amount);
  if (Math.round(parts.reduce((sum, part) => sum + part.amount, 0) * 100) !== Math.round(amount * 100)) throw new Error('Payment must cover the reservation amount exactly.');
  const reference = String(payload.referenceNumber || payload.paymentReference || '').trim();
  parts.forEach(part => {
    if (part.receivedAmount !== undefined && !payload.applyCardFee) throw new Error('Card fee changed. Review payment again.');
    if (part.method !== 'Cash' && !part.reference) {
      if (parts.length === 1 && reference) part.reference = reference;
      else throw new Error('Payment reference is required for ' + part.method + '.');
    }
  });
  const card = parts.filter(part => part.method === 'Credit Card');
  const charged = roundToTwo(parts.reduce((sum, part) => sum + (part.method === 'QR Code' ? part.amount * .01 : 0), 0)
    + (payload.applyCardFee ? card.reduce((sum, part) => sum + (part.receivedAmount === undefined ? part.amount : part.receivedAmount) * .032, 0) : 0));
  const absorbed = payload.applyCardFee ? 0 : roundToTwo(card.reduce((sum, part) => sum + part.amount * .032, 0));
  const cash = parts.find(part => part.method === 'Cash');
  const received = Number(payload.cashReceived || 0);
  if (!Number.isFinite(received) || received < 0 || (cash && received < cash.amount)) throw new Error('Cash received is less than the amount due.');
  return {method:method, reference:reference, parts:parts, charged:charged, absorbed:absorbed,
    received:cash ? received : 0, change:cash ? roundToTwo(received - cash.amount) : 0};
}

function reservationSalesRow_(reservation, payment, employee, balance, now) {
  const amount = balance ? reservation.balance : reservation.deposit;
  const row = Array(SALES_LOG_COLUMN_COUNT).fill('');
  row[SALES_IDX.TIMESTAMP] = now; row[SALES_IDX.RECEIPT_ID] = reservation.receiptId;
  row[SALES_IDX.CASHIER] = employee; row[SALES_IDX.CODE] = reservation.code;
  row[SALES_IDX.ITEM_NAME] = reservation.name; row[SALES_IDX.SIZE] = reservation.size;
  row[SALES_IDX.CATEGORY] = 'YourFinds'; row[SALES_IDX.QUANTITY] = balance ? 1 : 0;
  row[SALES_IDX.PRICE] = balance ? roundToTwo(reservation.originalPrice - reservation.deposit) : amount;
  row[SALES_IDX.DISCOUNT] = balance ? roundToTwo(reservation.originalPrice - reservation.price) : 0;
  row[SALES_IDX.FEE_CHARGED] = payment.charged; row[SALES_IDX.FEE_ABSORBED] = payment.absorbed;
  row[SALES_IDX.NET_TOTAL] = roundToTwo(amount - payment.absorbed);
  row[SALES_IDX.PAYMENT_METHOD] = payment.method; row[SALES_IDX.REFERENCE] = payment.reference || 'N/A';
  row[SALES_IDX.STATUS] = 'COMPLETED'; row[SALES_IDX.CASH_RECEIVED] = payment.received; row[SALES_IDX.CHANGE] = payment.change;
  row[SALES_IDX.REASON] = balance ? 'RESERVATION BALANCE' : 'RESERVATION DEPOSIT';
  row[SALES_IDX.SALES_LINE_ID] = generateSalesLineId(); row[SALES_IDX.ENTRY_SOURCE] = 'POS';
  row[SALES_IDX.SYNC_STATUS] = 'PROCESSED'; row[SALES_IDX.PROCESSED_AT] = now; row[SALES_IDX.PRICE_SOURCE] = 'RESERVATION';
  payment.parts.forEach((part, index) => {
    const start = SALES_IDX.PAYMENT_1_METHOD + index * 3;
    row[start] = part.method; row[start + 1] = part.amount; row[start + 2] = part.reference;
  });
  return row;
}

function generateReservationReceiptId_(sales) {
  const prefix = 'YS-' + Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'MMdd');
  for (let attempt = 0; attempt < 100; attempt++) {
    const id = prefix + Math.floor(1000 + Math.random() * 9000);
    if (sales.getLastRow() < 2 || !sales.getRange(2, SALES_COL.RECEIPT_ID, sales.getLastRow() - 1, 1)
      .createTextFinder(id).matchEntireCell(true).findNext()) return id;
  }
  throw new Error('Unable to allocate a receipt number. Please retry.');
}

function getReservationForCheckout(receiptId, sessionToken) {
  assertAppRequest_();
  try {
    dashboardEmployee_(sessionToken);
    const reservation = findReservation_(receiptId);
    if (!reservation || reservation.status !== 'RESERVED') throw new Error('This reservation is no longer open. Refresh Transaction History.');
    const item = reservationInventoryItem_(reservation.code);
    if (item.status !== 'RESERVED' || item.stock !== 1) throw new Error('Reserved inventory changed. Ask a manager to review it.');
    return {success:true, reservation:reservationForClient_(reservation), item:{...item, price:reservation.price}};
  } catch (error) { return {success:false, message:error.message || String(error)}; }
}

function processReservationPayment(payload) {
  assertAppRequest_();
  payload = payload || {};
  const lock = LockService.getScriptLock();
  try {
    const employee = dashboardEmployee_(payload.sessionToken).name;
    lock.waitLock(30000);
    const balance = payload.kind === 'RESERVATION_BALANCE';
    if (!balance && payload.kind !== 'RESERVATION_DEPOSIT') throw new Error('Invalid reservation payment.');
    const requestId = String(payload.requestId || '');
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestId)) throw new Error('Reopen checkout before paying.');
    const ss = SpreadsheetApp.getActiveSpreadsheet(), sales = ss.getSheetByName(SHEETS.SALES_LOG);
    if (!sales) throw new Error('Sales Log sheet not found.');
    let reservation = balance ? findReservation_(payload.originalReceiptId) : readReservations_().find(row => row.depositRequestId === requestId);
    if (reservation && (balance ? reservation.balanceRequestId === requestId : true)) {
      return {success:true, receiptId:reservation.receiptId, reservation:reservationForClient_(reservation)};
    }
    if (balance && (!reservation || reservation.status !== 'RESERVED')) throw new Error('This reservation is no longer open.');
    const item = reservationInventoryItem_(balance ? reservation.code : payload.item && payload.item.code);
    if (!isYourFindsUnique_(item) || item.stock !== 1 || item.status !== (balance ? 'RESERVED' : 'ACTIVE')) {
      throw new Error('Only an available, unique YourFinds item can be reserved or completed. Reload inventory.');
    }
    if (!balance) {
      const input = payload.item || {};
      if (Number(input.quantity) !== 1 || input.isCustom || !Number.isFinite(Number(input.price)) || !Number.isFinite(item.price) || item.price <= 0 || Math.abs(Number(input.price) - item.price) > .001) {
        throw new Error('Item changed. Reload inventory and add one YourFinds item.');
      }
      function reduction(value, type, base) {
        value = Number(value || 0);
        if (!Number.isFinite(value) || value < 0 || (type === 'percentage' && value > 100)) throw new Error('Invalid reservation discount.');
        return Math.min(base, type === 'percentage' ? base * value / 100 : value);
      }
      const afterItemDiscount = roundToTwo(item.price - reduction(input.discountValue, input.discountType, item.price));
      const price = roundToTwo(afterItemDiscount - reduction(payload.globalDiscountValue, payload.globalDiscountType, afterItemDiscount));
      const deposit = roundToTwo(price * .5);
      if (!Number.isFinite(price) || deposit <= 0 || deposit >= price) throw new Error('Reservation price must allow a deposit and remaining balance.');
      reservation = {receiptId:generateReservationReceiptId_(sales), code:item.code, name:item.name, size:item.size,
        price:price, originalPrice:item.price, deposit:deposit, balance:roundToTwo(price - deposit), status:'RESERVED', cashier:employee, depositRequestId:requestId};
    }
    const due = balance ? reservation.balance : reservation.deposit;
    if (!Number.isFinite(Number(payload.expectedAmountDue)) || Math.abs(Number(payload.expectedAmountDue) - due) > .001) {
      throw new Error('Reservation amount changed. Reopen checkout.');
    }
    const payment = reservationPayment_(payload, due), now = new Date();
    const sheet = reservationSheet_(true), inventory = ss.getSheetByName(SHEETS.INVENTORY);
    ensureSalesLogSplitPaymentColumns_(sales);
    const salesStart = sales.getLastRow(), reservationStart = sheet.getLastRow();
    const movement = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
    if (balance && !movement) throw new Error('Inventory Movement Log sheet not found.');
    const movementStart = movement ? movement.getLastRow() : 0;
    const oldUpdatedAt = inventory.getRange(item.rowNumber, INV_COL.UPDATED_AT).getValue();
    const oldStatusNote = inventory.getRange(item.rowNumber, INV_COL.STATUS).getNote();
    const oldReservationRow = balance ? sheet.getRange(reservation.rowNumber, 1, 1, RESERVATION_HEADERS_.length).getValues() : null;
    const row = reservationSalesRow_(reservation, payment, employee, balance, now);
    try {
      // Claim the item before recording payment. The shared script lock excludes competing POS writes.
      setReservationInventoryStatus_(item, balance ? 'ACTIVE' : 'RESERVED');
      sales.getRange(salesStart + 1, 1, 1, SALES_LOG_COLUMN_COUNT).setValues([row]);
      if (balance) {
        changeInventoryStockBatch_([{code:item.code, qtyChange:-1, source:INVENTORY_MOVEMENT_SOURCE.SALE,
          referenceId:reservation.receiptId, sourceLineId:row[SALES_IDX.SALES_LINE_ID], employee:employee,
          item:item.name, reason:'RESERVATION BALANCE', notes:'Reserved item paid in full.'}]);
        const updated = oldReservationRow[0].slice();
        updated[6] = 0; updated[7] = 'COMPLETED'; updated[10] = now; updated[11] = employee; updated[14] = requestId;
        sheet.getRange(reservation.rowNumber, 1, 1, updated.length).setValues([updated]);
      } else {
        sheet.getRange(reservationStart + 1, 1, 1, RESERVATION_HEADERS_.length).setValues([[
          reservation.receiptId, item.code, item.name, item.size, reservation.price, reservation.deposit,
          reservation.balance, 'RESERVED', now, employee, '', '', '', requestId, '', item.price
        ]]);
      }
      SpreadsheetApp.flush();
    } catch (error) {
      sales.getRange(salesStart + 1, 1, 1, SALES_LOG_COLUMN_COUNT).clearContent();
      if (movement && movement.getLastRow() > movementStart) movement.getRange(movementStart + 1, 1, movement.getLastRow() - movementStart, MOVEMENT_LOG_COLUMN_COUNT).clearContent();
      if (balance) sheet.getRange(reservation.rowNumber, 1, 1, RESERVATION_HEADERS_.length).setValues(oldReservationRow);
      else if (sheet.getLastRow() > reservationStart) sheet.getRange(reservationStart + 1, 1, 1, RESERVATION_HEADERS_.length).clearContent();
      setReservationInventoryStatus_(item, item.status);
      inventory.getRange(item.rowNumber, INV_COL.STATUS).setNote(oldStatusNote);
      inventory.getRange(item.rowNumber, INV_COL.UPDATED_AT).setValue(oldUpdatedAt);
      SpreadsheetApp.flush();
      throw error;
    }
    reservation.status = balance ? 'COMPLETED' : 'RESERVED';
    return {success:true, receiptId:reservation.receiptId, reservation:reservationForClient_(reservation)};
  } catch (error) { return {success:false, message:error.message || String(error)}; }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
