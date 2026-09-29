/* Supplier returns use the existing movement ledger and stock formulas. */
function getSupplierReturns() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, MOVEMENT_LOG_COLUMN_COUNT).getValues()
    .filter(row => String(row[MOVE_IDX.SOURCE]) === INVENTORY_MOVEMENT_SOURCE.SUPPLIER_RETURN)
    .map(function(row) {
      let details = {};
      try { details = JSON.parse(String(row[MOVE_IDX.NOTES] || '{}')); } catch (e) {}
      return {requestId:String(row[MOVE_IDX.SOURCE_LINE_ID] || ''),id:String(row[MOVE_IDX.REFERENCE_ID]), date:row[MOVE_IDX.TIMESTAMP] instanceof Date ? Utilities.formatDate(row[MOVE_IDX.TIMESTAMP], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : String(row[MOVE_IDX.TIMESTAMP]), code:String(row[MOVE_IDX.CODE]), name:String(row[MOVE_IDX.ITEM]), category:String(row[MOVE_IDX.TYPE]), quantity:Math.abs(Number(row[MOVE_IDX.QTY_CHANGE]) || 0), employee:String(row[MOVE_IDX.EMPLOYEE]), reason:String(row[MOVE_IDX.REASON]), supplier:String(details.supplier || ''), driver:String(details.driver || ''), plate:String(details.plate || ''), remarks:String(details.remarks || '')};
    }).reverse();
}

function saveSupplierReturn(payload) {
  payload = payload || {};
  const auth = requireManager_(payload.managerPin, payload.managerToken);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const code = String(payload.code || '').trim();
    const quantity = Number(payload.quantity);
    const reason = String(payload.reason || '').trim();
    const supplier = String(payload.supplier || '').trim();
    const requestId = String(payload.requestId || '');
    if (!/^[a-zA-Z0-9-]{10,80}$/.test(requestId)) throw new Error('Invalid return request. Reopen the form.');
    if (!code || !Number.isInteger(quantity) || quantity < 1 || !reason || !supplier) throw new Error('Product, supplier, reason and positive whole quantity are required.');
    // A retried request must never remove stock a second time.
    const previous = getSupplierReturns().find(row => row.requestId === requestId);
    if (previous) return {success:true,id:previous.id};
    const id = 'YSR-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + requestId.slice(0,8).toUpperCase();
    const result = getInventoryItemByCode(code);
    if (!result || !result.success || !result.item) throw new Error('Inventory item not found.');
    const item = result.item;
    if (quantity > Number(item.stock) || String(item.status).toUpperCase() === 'RETURNED') throw new Error('Return quantity exceeds available stock.');
    if (String(item.inventoryType).toUpperCase() === 'UNIQUE' && quantity !== 1) throw new Error('Unique items must be returned one at a time.');
    changeInventoryStock({code:code, qtyChange:-quantity, referenceId:id, sourceLineId:requestId, employee:String(payload.employee || auth.managerName), item:item.name, reason:reason, source:INVENTORY_MOVEMENT_SOURCE.SUPPLIER_RETURN, notes:JSON.stringify({supplier:supplier,driver:String(payload.driver || ''),plate:String(payload.plate || ''),remarks:String(payload.remarks || ''),authorizedBy:auth.managerName})});
    return {success:true,id:id};
  } finally { lock.releaseLock(); }
}
