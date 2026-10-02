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
    returnDate: String(display[RETURN_IDX.RETURN_DATE] || ""),
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
        timestamp: row[MOVE_IDX.TIMESTAMP],
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
  payload = payload || {};
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
      if (quantity > Number(item.stock) || String(item.status).toUpperCase() === "RETURNED") {
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
