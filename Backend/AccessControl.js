// Permissions are separate from access numbers, which remain part of legacy usernames.
let ACCESS_REQUEST_CONTEXT_ = null;
const ACCESS_PERMISSION_MODES_ = {
  'inventory.view': ['allow','allow','allow','allow'],
  'inventory.create': ['allow','allow','approval','deny'],
  'inventory.complete': ['allow','allow','approval','allow'],
  'inventory.edit': ['allow','allow','approval','deny'],
  'inventory.delete': ['allow','allow','approval','deny'],
  'supplierReturns.create': ['allow','allow','approval','approval'],
  'deliveries.create': ['allow','allow','approval','allow'],
  'sales.create': ['allow','allow','allow','allow'],
  'sales.exchange': ['allow','allow','approval','approval'],
  'sales.void': ['allow','allow','approval','approval'],
  'transactions.view': ['allow','allow','allow','allow'],
  'dashboard.view': ['allow','allow','allow','allow'],
  'dashboard.create': ['allow','allow','approval','deny'],
  'dashboard.delete': ['allow','allow','approval','deny'],
  'dashboard.edit': ['allow','allow','approval','allow'],
  'reports.view': ['allow','allow','allow','deny'],
  'reports.own': ['allow','allow','allow','allow'],
  'reports.create': ['allow','allow','approval','allow'],
  'reports.createManager': ['allow','allow','approval','deny'],
  'reports.correct': ['allow','allow','approval','approval'],
  'shift.manage': ['allow','allow','allow','allow'],
  'shift.end': ['allow','allow','approval','approval'],
  'actions.approve': ['allow','allow','deny','deny'],
  'approvals.verify': ['allow','allow','allow','allow'],
  'approvals.view': ['allow','allow','deny','deny'],
  'accounts.manage': ['allow','deny','deny','deny']
};
const ACCESS_ROLE_ORDER_ = ['OWNER','MANAGER','OIC','CASHIER'];
function employeeRoleKey_(employee) {
  const role = String(employee && employee.role || '').trim().toUpperCase();
  return role === 'OFFICER IN CHARGE' ? 'OIC' : role;
}
function accountPermissions_(employee) {
  const result = {};
  Object.keys(ACCESS_PERMISSION_MODES_).forEach(key => {result[key] = permissionMode_(employee, key);});
  return result;
}
function permissionMode_(employee, permission) {
  const index = ACCESS_ROLE_ORDER_.indexOf(employeeRoleKey_(employee));
  return index >= 0 && ACCESS_PERMISSION_MODES_[permission] ? ACCESS_PERMISSION_MODES_[permission][index] : 'deny';
}
function assertAppRequest_() {
  if (!ACCESS_REQUEST_CONTEXT_) throw new Error('Authenticated app request required. Reload the POS and sign in again.');
}
function withSheetAccess_(callback) {
  SpreadsheetApp.getUi();
  const previous = ACCESS_REQUEST_CONTEXT_;
  ACCESS_REQUEST_CONTEXT_ = {trustedSheet:true};
  try { return callback(); } finally { ACCESS_REQUEST_CONTEXT_ = previous; }
}
function withAutomationAccess_(event, handler, callback) {
  const valid = event && event.triggerUid && ScriptApp.getProjectTriggers().some(trigger =>
    trigger.getHandlerFunction() === handler && String(trigger.getUniqueId()) === String(event.triggerUid));
  if (!valid) throw new Error('Installed spreadsheet trigger required.');
  const previous = ACCESS_REQUEST_CONTEXT_;
  ACCESS_REQUEST_CONTEXT_ = {trustedSheet:true};
  try { return callback(); } finally { ACCESS_REQUEST_CONTEXT_ = previous; }
}
function employeeAuthFingerprint_(row) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify([row[0],row[1],row[2],row[3],row[4],row[5],row[6],
      PropertiesService.getScriptProperties().getProperty('account-revision:' + String(row[0])) || ''])));
}
function accessRegistry_() {
  return {
  "getInventorySnapshotBatch": {permission:"inventory.view", handler:getInventorySnapshotBatch},
  "getInventoryPage": {permission:"inventory.view", handler:getInventoryPage},
  "getInventorySummaryPage": {permission:"inventory.view", handler:getInventorySummaryPage},
  "getInventoryItemDetails": {permission:"inventory.view", handler:getInventoryItemDetails},
  "getInventoryItemDetailsBatch": {permission:"inventory.view", handler:getInventoryItemDetailsBatch},
  "getInventoryChangeChoices": {permission:"inventory.view", handler:getInventoryChangeChoices},
  "getDeliveryHistoryFast": {permission:"inventory.view", handler:getDeliveryHistoryFast},
  "getInventoryMovementHistoryByCode": {permission:"inventory.view", handler:getInventoryMovementHistoryByCode},
  "adjustInventoryStock": {permission:"inventory.edit", handler:adjustInventoryStock},
  "changeInventoryItem": {permission:"inventory.edit", handler:changeInventoryItem},
  "convertYourFindsDeliveryItem": {permission:"inventory.edit", handler:convertYourFindsDeliveryItem},
  "generateProductMasterCode": {permission:"inventory.view", handler:generateProductMasterCode},
  "getInventoryForManagement": {permission:"inventory.view", handler:getInventoryForManagement},
  "getProductMasterForManagement": {permission:"inventory.view", handler:getProductMasterForManagement},
  "saveProductMaster": {permission:"inventory.edit", handler:saveProductMaster},
  "setInventoryAdministrativeStatus": {permission:"inventory.edit", handler:setInventoryAdministrativeStatus},
  "deleteUnusedInventoryItem": {permission:"inventory.delete", handler:deleteUnusedInventoryItem},
  "saveYourFindsItemDetails": {permission:"inventory.edit", handler:saveYourFindsItemDetails},
  "executeCheckoutBackend": {permission:"sales.create", handler:executeCheckoutBackend},
  "getExpectedCashForManager": {permission:"reports.view", handler:getExpectedCashForManager},
  "voidAndRefundTransactionBackend": {permission:"sales.void", handler:voidAndRefundTransactionBackend},
  "getTransactionHistory": {permission:"transactions.view", handler:getTransactionHistory},
  "getTransactionDetails": {permission:"transactions.view", handler:getTransactionDetails},
  "createDeliveryReceiptPdf": {permission:"inventory.view", handler:createDeliveryReceiptPdf},
  "getCustomerExchangeData": {permission:"transactions.view", handler:getCustomerExchangeData},
  "completeCustomerExchange": {permission:"sales.exchange", handler:completeCustomerExchange},
  "generateDeliveryIdentifiers": {permission:"inventory.view", handler:generateDeliveryIdentifiers},
  "getYourStyleDeliveryProducts": {permission:"inventory.view", handler:getYourStyleDeliveryProducts},
  "acceptYourStyleDelivery": {permission:"deliveries.create", handler:acceptYourStyleDelivery},
  "getBulkDistributionData": {permission:"inventory.view", handler:getBulkDistributionData},
  "distributeBulkBundle": {permission:"deliveries.create", handler:distributeBulkBundle},
  "completeBulkHolder": {permission:"deliveries.create", handler:completeBulkHolder},
  "getCompletableBulkHoldersForDelivery": {permission:"inventory.view", handler:getCompletableBulkHoldersForDelivery},
  "getDeliveryDetails": {permission:"inventory.view", handler:getDeliveryDetails},
  "getDeliverySummaryData": {permission:"inventory.view", handler:getDeliverySummaryData},
  "prepareYourFindsCustomSizes": {permission:"inventory.view", handler:prepareYourFindsCustomSizes},
  "getSupplierReturns": {permission:"inventory.view", handler:getSupplierReturns},
  "saveSupplierReturn": {permission:"supplierReturns.create", handler:saveSupplierReturn},
  "getInventoryDeliveryMetadataByCode": {permission:"inventory.view", handler:getInventoryDeliveryMetadataByCode},
  "acceptYourFindsDelivery": {permission:"deliveries.create", handler:acceptYourFindsDelivery},
  "getSellableInventory": {permission:"inventory.view", handler:getSellableInventory},
  "getNextYourFindsDeliveryNumber": {permission:"inventory.view", handler:getNextYourFindsDeliveryNumber},
  "getReservationForCheckout": {permission:"transactions.view", handler:getReservationForCheckout},
  "processReservationPayment": {permission:"sales.create", handler:processReservationPayment},
  "getCashierShiftContext": {permission:"reports.own", handler:getCashierShiftContext},
  "saveCashierShiftExit": {permission:"shift.manage", handler:saveCashierShiftExit},
  "printEndedCashierShiftReport": {permission:"reports.own", handler:printEndedCashierShiftReport},
  "generateCashierShiftReportPDF": {permission:"reports.create", handler:generateCashierShiftReportPDF},
  "regenerateCashierReport": {permission:"reports.correct", handler:regenerateCashierReport},
  "correctClosedCashReport": {permission:"reports.correct", handler:correctClosedCashReport},
  "generateManagerDailyReportPDF": {permission:"reports.createManager", handler:generateManagerDailyReportPDF},
  "getCashReportByDate": {permission:"reports.own", handler:getCashReportByDate},
  "getDashboard": {permission:"dashboard.view", handler:getDashboard},
  "saveDashboardTask": {permission:"dashboard.edit", handler:saveDashboardTask},
  "verifyManagerPin": {permission:"approvals.verify", handler:verifyManagerPin},
  "createYourFindsLabelPDFByCodes": {permission:"inventory.view", handler:createYourFindsLabelPDFByCodes},
  "getYourFindsItemsForLabelReprint": {permission:"inventory.view", handler:getYourFindsItemsForLabelReprint},
  "createCompletedYourFindsLabelPDF": {permission:"inventory.view", handler:createCompletedYourFindsLabelPDF},
  "createYourFindsReprintPDFByGroups": {permission:"inventory.view", handler:createYourFindsReprintPDFByGroups},
  "getYourFindsLabelItemsByDeliveryId": {permission:"inventory.view", handler:getYourFindsLabelItemsByDeliveryId},
  "getYourFindsDeliveryById": {permission:"inventory.view", handler:getYourFindsDeliveryById},
  "getManagedAccounts": {permission:"accounts.manage", handler:getManagedAccounts},
  "saveManagedAccount": {permission:"accounts.manage", handler:saveManagedAccount},
  "getApprovalHistory": {permission:"approvals.view", handler:getApprovalHistory},
  };
}
function accessOperationPermissions_() {
  const registry=accessRegistry_(), permissions={};
  Object.keys(registry).forEach(operation=>{permissions[operation]=registry[operation].permission;});
  return permissions;
}
function accessSafeValue_(value, key) {
  if (/pin|password|token|credential|dataurl|imagedata|fingerprint/i.test(key || '')) return undefined;
  if (Array.isArray(value)) return value.slice(0, 200).map(item => accessSafeValue_(item));
  if (value && typeof value === 'object') {
    const result = {};
    Object.keys(value).sort().forEach(name => {
      const safe = accessSafeValue_(value[name], name);
      if (safe !== undefined) result[name] = safe;
    });
    return result;
  }
  return typeof value === 'string' ? value.slice(0, 400) : value;
}
function actionBinding_(operation, args) {
  // Keep full values for approval binding. Display truncation must never weaken approval matching.
  const bound = JSON.parse(JSON.stringify(args, function(key, value) {
    if (/^(managerPin|managerToken|actorToken|sessionToken|token|password)$/i.test(key)) return undefined;
    // Separate Apps Script requests can deserialize object fields in different orders.
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted = Object.create(null);
      Object.keys(value).sort().forEach(name => { sorted[name] = value[name]; });
      return sorted;
    }
    return value;
  }));
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify([operation, bound])));
}
function actionCodes_(operation, args) {
  const first = args[0], result = [];
  const add = code => { if (code !== undefined && code !== null && String(code).trim()) result.push(String(code).trim()); };
  if (operation === 'executeCheckoutBackend') (first || []).forEach(item => add(item.code));
  else if (first && typeof first === 'object') {
    ['code','productCode','sourceCode','fromCode','toCode'].forEach(key => add(first[key]));
    if (first.item) add(first.item.code);
    (first.items || []).forEach(item => { add(item.returnCode); add(item.replacementCode); });
  } else if (operation === 'getInventoryMovementHistoryByCode') add(first);
  return Array.from(new Set(result)).slice(0, 100);
}
function actionSnapshot_(operation, args, result) {
  const first = args[0] || {};
  if (operation === 'saveManagedAccount') {
    const account = employeeLoginAccounts_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EMPLOYEES).getDataRange().getValues())
      .find(item => String(item.id) === String(first.employeeId));
    return account ? {employeeId:String(account.id), username:account.username, role:account.role, active:account.active} : null;
  }
  if (operation === 'saveProductMaster') {
    const sheet = getProductMasterSheet_();
    const code = result && result.productCode || first.productCode;
    const match = sheet && sheet.getLastRow() > 1 && code
      ? sheet.getRange(2,1,sheet.getLastRow()-1,1).createTextFinder(String(code)).matchEntireCell(true).findNext() : null;
    if (!match) return {exists:false, code:String(first.productCode || '')};
    const row = sheet.getRange(match.getRow(),1,1,PRODUCT_MASTER_COLUMN_COUNT).getValues()[0];
    return {code:String(row[0]), name:String(row[1]), category:String(row[2]), price:Number(row[4])||0,
      cost:row[5] === '' ? null : Number(row[5]), active:row[7], sale:accessSafeValue_(row.slice(11))};
  }
  if (['correctClosedCashReport','regenerateCashierReport','saveCashierShiftExit'].includes(operation)) {
    const id = typeof first === 'object' ? first.reportId : first;
    const report = findReportById_(String(id || ''));
    return report ? {reportId:String(id), employee:report.values[CASH_REPORT_IDX.EMPLOYEE],
      status:report.values[CASH_REPORT_IDX.STATUS], cash:report.values[CASH_REPORT_IDX.CASH_COUNTED],
      pettyReturned:report.values[CASH_REPORT_IDX.PETTY_RETURNED]} : null;
  }
  if (operation === 'saveDashboardTask') {
    const sheet = dashboardTaskSheet_(false);
    return sheet ? sheet.getDataRange().getValues().slice(1).filter(row=>String(row[0])===String(first.task && first.task.id)).map(dashboardTaskFromRow_) : [];
  }
  if (['acceptYourFindsDelivery','acceptYourStyleDelivery','distributeBulkBundle','completeBulkHolder'].includes(operation)) {
    if (result) return accessSafeValue_(result);
    if (operation === 'acceptYourFindsDelivery') return {state:'Not accepted',date:args[0],quantities:accessSafeValue_(args[4])};
    if (operation === 'acceptYourStyleDelivery') return {state:'Not accepted',items:accessSafeValue_(first.lines)};
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DELIVERY_LOG);
    const rowNumber = Number(first.sheetRow);
    return sheet && rowNumber>=2 && rowNumber<=sheet.getLastRow()
      ? {deliveryId:first.deliveryId, row:accessSafeValue_(sheet.getRange(rowNumber,1,1,DELIVERY_LOG_COLUMN_COUNT).getDisplayValues()[0])} : null;
  }
  const codes = actionCodes_(operation, args);
  if (!codes.length) return null;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const codeRange = sheet.getRange(2, INV_COL.CODE, sheet.getLastRow() - 1, 1);
  const costColumn = customCostColumn_(sheet,false);
  return codes.map(code => {
    const match = codeRange.createTextFinder(code).matchEntireCell(true).findNext();
    if (!match) return {code:code, exists:false};
    const row = sheet.getRange(match.getRow(), 1, 1, Math.max(INVENTORY_COLUMN_COUNT,costColumn || 0)).getValues()[0];
    return {code:code, name:String(row[1]), size:String(row[2]), status:String(row[5]),
      stock:Number(row[10]) || 0, price:Number(row[12]) || 0,
      originalPrice:Number(row[13])||0, imageUrl:String(row[14] || ''), updatedAt:String(row[16] || ''), customCost:costColumn && row[costColumn-1] !== '' ? row[costColumn-1] : null};
  });
}
function actionDescription_(operation, args, before) {
  const titles = {adjustInventoryStock:'Adjust Stock',changeInventoryItem:'Change Inventory Item',
    convertYourFindsDeliveryItem:'Convert YourFinds Item',saveProductMaster:'Save Product',
    setInventoryAdministrativeStatus:'Change Item Status',deleteUnusedInventoryItem:'Delete Item',
    saveYourFindsItemDetails:'Save YourFinds Details',voidAndRefundTransactionBackend:'Void Transaction',
    completeCustomerExchange:'Customer Exchange',acceptYourStyleDelivery:'Accept YourStyle Delivery',
    acceptYourFindsDelivery:'Accept YourFinds Delivery',distributeBulkBundle:'Save Bundle Distribution',
    completeBulkHolder:'Finish Bundle Distribution',saveSupplierReturn:'Return to Supplier',
    saveCashierShiftExit:'Save Cashier Shift',generateCashierShiftReportPDF:'Generate Cashier Report',
    regenerateCashierReport:'Regenerate Cashier Report',correctClosedCashReport:'Correct Cashier Report',
    generateManagerDailyReportPDF:'Generate Manager Report',saveDashboardTask:'Update Dashboard Task',saveManagedAccount:'Update Account'};
  const data = args[0] || {}, lines = [titles[operation] || 'Approve Change'];
  if (operation === 'saveManagedAccount') {
    lines.push('Account: ' + (before && before.username || data.employeeId));
    if (data.role !== undefined) lines.push('Role: ' + (before && before.role || '') + ' → ' + data.role);
    if (data.active !== undefined) lines.push('Active: ' + (before && before.active) + ' → ' + data.active);
    if (data.password) lines.push('Reset password');
  } else {
    (Array.isArray(before) ? before : []).forEach(item => lines.push(item.code + ' · ' + (item.name || '') + ' · Stock: ' + (item.stock === undefined ? 'new' : item.stock)));
    ['description','quantity','direction','sellingPrice','defaultPrice','costPrice','status','reason','action','reportId'].forEach(key => {
      if (data[key] !== undefined) lines.push(key + ': ' + String(data[key]));
    });
    if (before && !Array.isArray(before)) lines.push('Current values: ' + JSON.stringify(before));
    if (operation === 'adjustInventoryStock' && before && before[0]) lines.push('Stock after: ' + (before[0].stock + (data.direction === 'ADD' ? 1 : -1) * Number(data.quantity)));
    if (operation === 'acceptYourFindsDelivery') lines.push('Date: ' + args[0] + ' · Quantities: ' + JSON.stringify(args[4]));
    if (operation === 'generateCashierShiftReportPDF') lines.push('Cashier: ' + args[1] + ' · Date: ' + args[2] + ' · Manager: ' + args[0]);
    if (data.fromCode || data.toCode) lines.push('From: ' + data.fromCode + ' · To: ' + data.toCode);
    if (data.task) lines.push('Task: ' + data.task.title + ' · Status: ' + data.task.status + (data.remove ? ' · Delete' : ''));
    if (data.items || data.lines) lines.push('Items: ' + JSON.stringify(accessSafeValue_(data.items || data.lines)));
    if (data.results) lines.push('Resulting items: ' + JSON.stringify(accessSafeValue_(data.results)));
    if (operation === 'voidAndRefundTransactionBackend') lines.push('Receipt: ' + args[0] + (args[3] ? ' · Item: ' + args[3] : ' · Entire transaction') + ' · Quantity: ' + (args[5] || 'all') + ' · Reason: ' + (args[2] || ''));
    if (operation === 'completeCustomerExchange') lines.push('Receipt: ' + data.originalReceiptId + ' · Additional payment: ₱' + Number(data.expectedAmountDue || 0).toFixed(2));
    if (operation === 'generateManagerDailyReportPDF') lines.push('Report date: ' + args[1]);
  }
  return lines.join('\n').slice(0, 12000);
}
function operationPermission_(operation, args, definition) {
  if (operation === 'saveProductMaster') {
    const sheet = getProductMasterSheet_(), code=String(args[0] && args[0].productCode || '');
    const exists=code && sheet && sheet.getLastRow()>1 && sheet.getRange(2,1,sheet.getLastRow()-1,1)
      .createTextFinder(code).matchEntireCell(true).findNext();
    return exists ? 'inventory.edit' : 'inventory.create';
  }
  if (operation === 'saveDashboardTask') {
    if (args[0] && args[0].remove) return 'dashboard.delete';
    if (!(args[0] && args[0].task && args[0].task.id)) return 'dashboard.create';
  }
  if (operation === 'saveCashierShiftExit' && args[0] && args[0].action === 'END') return 'shift.end';
  if (operation === 'saveYourFindsItemDetails') {
    const item = reservationInventoryItem_(args[0] && args[0].code);
    if (item.status === INVENTORY_STATUS.INCOMPLETE && args[0].costPrice === undefined) return 'inventory.complete';
  }
  return definition.permission;
}
function accessRequest_(request) {
  request = request || {};
  const definition = accessRegistry_()[request.operation];
  if (!definition) throw new Error('This app operation is not available.');
  const actor = dashboardEmployee_(request.sessionToken);
  const args = Array.isArray(request.args) ? request.args : [];
  const permission = operationPermission_(request.operation, args, definition);
  const mode = permissionMode_(actor, permission);
  if (mode === 'deny') throw new Error('Your role cannot perform this action.');
  return {actor:actor, args:args, operation:request.operation, definition:definition,
    permission:permission, mode:mode, sessionToken:request.sessionToken};
}
function previewPosAction(request) {
  const access = accessRequest_(request), before = actionSnapshot_(access.operation, access.args);
  const id = Utilities.getUuid();
  CacheService.getScriptCache().put('pos-approval:' + id, JSON.stringify({actorId:access.actor.id,
    sessionToken:access.sessionToken, binding:actionBinding_(access.operation, access.args), before:before}), 120);
  return {success:true, requestId:id, description:actionDescription_(access.operation, access.args, before),
    approvalRequired:access.mode === 'approval'};
}
function accessCredential_(request, args) {
  const data = args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) ? args[0] : {};
  const authContext = request.operation === 'generateManagerDailyReportPDF' ? args[4] || {} : {};
  let credential = request.credential || data.managerCredential ||
    (['voidAndRefundTransactionBackend','generateCashierShiftReportPDF'].includes(request.operation) ? args[6] : null) || {};
  if (typeof credential === 'string') credential={managerPin:credential};
  if (data.managerPin && typeof data.managerPin === 'object' && !credential.managerPin && !credential.managerToken) credential = data.managerPin;
  return {managerPin:credential.managerPin || data.managerPin || authContext.managerPin || (request.operation === 'regenerateCashierReport' && typeof args[1] === 'string' ? args[1] : ''),
    managerToken:credential.managerToken || data.managerToken || authContext.managerToken};
}
function requireCashierAccess_(access, request) {
  if (!['sales.create','sales.exchange','sales.void'].includes(access.permission)) return;
  if (!access.actor.cashierReportId || String(request.shiftReportId || '') !== access.actor.cashierReportId)
    throw new Error('Start or resume a cashier shift before processing a transaction.');
  const target = cashierShiftTarget_(access.actor.name, access.actor.cashierReportId, cashierReportRows_(), pettyHandoverRows_());
  if (cashierShiftStatus_(target) !== 'OPEN') throw new Error('Start or resume a cashier shift before processing a transaction.');
}
function receiptVisibleToActor_(receiptId, actor) {
  if (actor.manager) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SALES_LOG);
  if (!sheet) throw new Error('Sales Log sheet not found.');
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const minimum = dashboardDayOffset_(today, -6), shared = dashboardDayOffset_(today, -1);
  const eligible = readExchangeReceiptRows_(sheet, SALES_COL.RECEIPT_ID, String(receiptId || '').trim().toUpperCase()).some(entry => {
    const date = Utilities.formatDate(new Date(entry.row[SALES_IDX.TIMESTAMP]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return date <= today && date >= minimum && (date >= shared || String(entry.row[SALES_IDX.CASHIER]) === actor.name);
  });
  if (!eligible) throw new Error('This transaction is outside your account’s viewing dates.');
}
function bindAccessArguments_(access) {
  const args = access.args, actor = access.actor, token = access.sessionToken, op = access.operation;
  if (op === 'executeCheckoutBackend') args[6] = actor.name;
  if (op === 'voidAndRefundTransactionBackend') args[1] = access.approver.managerName;
  if (op === 'completeCustomerExchange') receiptVisibleToActor_(args[0].originalReceiptId, actor);
  if (op === 'generateManagerDailyReportPDF') {
    args[0] = actor.name;
    args[4] = Object.assign({}, args[4] || {}, {sessionToken:token});
  }
  if (['regenerateCashierReport','correctClosedCashReport'].includes(op) && !actor.manager) {
    const id = op === 'regenerateCashierReport' ? args[0] : args[0].reportId;
    const report = findReportById_(String(id || ''));
    if (!report || report.values[CASH_REPORT_IDX.EMPLOYEE] !== actor.name) throw new Error('You can only change your own cashier report.');
  }
  if (op === 'getTransactionHistory') {args[0] = actor.name; args[3] = actor.manager;}
  if (['getTransactionDetails','getCustomerExchangeData','getReservationForCheckout','voidAndRefundTransactionBackend'].includes(op)) receiptVisibleToActor_(args[0], actor);
  if (['getInventoryForManagement','getProductMasterForManagement'].includes(op)) args[0] = actor.manager ? token : '';
  if (op === 'acceptYourFindsDelivery') args[3] = actor.name;
  if (op === 'getReservationForCheckout') args[1] = token;
  if (op === 'getCashierShiftContext' || op === 'printEndedCashierShiftReport') args[0] = token;
  if (op === 'getCashReportByDate' || op === 'generateCashierShiftReportPDF') {
    const index = op === 'getCashReportByDate' ? 0 : 1;
    if (!actor.manager) args[index] = actor.name;
  }
  if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const data = args[0];
    data.actorToken = token;
    data.employee = actor.name;
    if(op==='acceptYourStyleDelivery')data.acceptedBy=actor.name;
    if (['getDashboard','saveDashboardTask','saveCashierShiftExit'].includes(op)) data.token = token;
    if (['processReservationPayment','completeCustomerExchange'].includes(op)) data.sessionToken = token;
  }
}
const ACCESS_AUDIT_HEADERS_ = ['Audit ID','Timestamp','Employee','Approved By','Action','Status','Before','After','Summary','Error'];
function validateAccessAuditHeaders_(sheet) {
  const headers=sheet.getRange(1,1,1,ACCESS_AUDIT_HEADERS_.length).getDisplayValues()[0];
  if (headers.some((value,index)=>value!==ACCESS_AUDIT_HEADERS_[index]))
    throw new Error('Approval Log headers do not match. Ask an Owner to repair the sheet before making changes.');
}
function accessAuditSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Approval Log');
  if (!sheet) {
    sheet=ss.insertSheet('Approval Log');
    sheet.getRange(1,1,1,ACCESS_AUDIT_HEADERS_.length).setValues([ACCESS_AUDIT_HEADERS_]);
    sheet.getRange('B:B').setNumberFormat('yyyy-MM-dd HH:mm:ss');
    sheet.setFrozenRows(1);
  }
  validateAccessAuditHeaders_(sheet);
  return sheet;
}
function auditLiteral_(value) {
  const text = String(value == null ? '' : value);
  return /^[=+\-@\s']/.test(text) ? "'" + text : text;
}
function beginAccessAudit_(access, before) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = accessAuditSheet_(), id = Utilities.getUuid();
    const summary = actionDescription_(access.operation, access.args, before);
    const row = sheet.getLastRow() + 1;
    if(row>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),Math.max(200,row-sheet.getMaxRows()));
    sheet.getRange(row,1,1,10).setValues([[id,new Date(),auditLiteral_(access.actor.name+' ('+access.actor.id+')'),
      auditLiteral_(access.approver ? access.approver.managerName+(access.approver.employeeId ? ' ('+access.approver.employeeId+')' : '') : ''), access.operation,'STARTED',
      JSON.stringify(before).slice(0,45000),'',auditLiteral_(summary),'']]);
    return {sheet:sheet, id:id, row:row, before:before, summary:summary};
  } finally {lock.releaseLock();}
}
function finishAccessAudit_(record, access, result, error) {
  let parsed = result;
  if (typeof result === 'string') {try {parsed=JSON.parse(result);} catch (ignored) {parsed={};}}
  const failed = !!error || parsed && parsed.success === false;
  const after = actionSnapshot_(access.operation, access.args, parsed);
  record.sheet.getRange(record.row, 6, 1, 5).setValues([[failed ? 'FAILED' : 'COMPLETED',
    JSON.stringify(record.before).slice(0,45000),JSON.stringify(after).slice(0,45000),
    auditLiteral_(record.summary),failed ? auditLiteral_(String(error && error.message || parsed && parsed.message || 'Action failed.').slice(0,500)) : '']]);
}
function callPosApi(request) {
  const access = accessRequest_(request), previous = ACCESS_REQUEST_CONTEXT_;
  ACCESS_REQUEST_CONTEXT_ = access;
  let audit, inventoryChanged=false;
  try {
    requireCashierAccess_(access, request);
    if (access.mode === 'approval') {
      const lock = LockService.getScriptLock(); lock.waitLock(10000);
      let approved;
      try {
        const key = 'pos-approval:' + String(request.approvalRequestId || '');
        const raw = CacheService.getScriptCache().get(key);
        if (!raw) throw new Error('Approval expired. Review this change again.');
        approved = JSON.parse(raw);
        if (approved.actorId !== access.actor.id || approved.sessionToken !== access.sessionToken ||
            approved.binding !== actionBinding_(access.operation, access.args)) throw new Error('Approval does not match this action.');
        const before = actionSnapshot_(access.operation, access.args);
        if (JSON.stringify(before) !== JSON.stringify(approved.before)) throw new Error('The item changed. Review this change again.');
        const credential = accessCredential_(request, access.args);
        access.approver = requireManager_(credential.managerPin, credential.managerToken);
        CacheService.getScriptCache().remove(key);
      } finally {lock.releaseLock();}
    } else if (employeeCanAuthorizeManager_(access.actor) && access.operation !== 'verifyManagerPin') {
      const ending = access.operation === 'saveCashierShiftExit' && access.args[0] && access.args[0].action === 'END';
      const credential = accessCredential_(request, access.args);
      access.approver = ending && access.args[0].managerName !== access.actor.name
        ? requireManager_(credential.managerPin, credential.managerToken)
        : {success:true, managerName:access.actor.name, employeeId:access.actor.id};
    }
    if (access.mode === 'approval' && access.operation === 'generateCashierShiftReportPDF' && access.approver.managerName !== access.args[0])
      throw new Error('Authorization must match the selected manager.');
    bindAccessArguments_(access);
    const mutation = ['adjustInventoryStock','changeInventoryItem','convertYourFindsDeliveryItem','saveProductMaster',
      'setInventoryAdministrativeStatus','deleteUnusedInventoryItem','saveYourFindsItemDetails','voidAndRefundTransactionBackend',
      'completeCustomerExchange','acceptYourStyleDelivery','distributeBulkBundle','completeBulkHolder','saveSupplierReturn',
      'acceptYourFindsDelivery','saveCashierShiftExit','generateCashierShiftReportPDF','regenerateCashierReport',
      'correctClosedCashReport','generateManagerDailyReportPDF','saveDashboardTask','saveManagedAccount'].includes(access.operation);
    if (mutation) audit = beginAccessAudit_(access, actionSnapshot_(access.operation, access.args));
    inventoryChanged=['adjustInventoryStock','changeInventoryItem','convertYourFindsDeliveryItem','saveProductMaster',
      'setInventoryAdministrativeStatus','deleteUnusedInventoryItem','saveYourFindsItemDetails','executeCheckoutBackend',
      'voidAndRefundTransactionBackend','completeCustomerExchange','acceptYourStyleDelivery','distributeBulkBundle',
      'completeBulkHolder','saveSupplierReturn','acceptYourFindsDelivery','processReservationPayment'].includes(access.operation);
    if(inventoryChanged)invalidateInventoryRead_();
    const result = access.definition.handler.apply(null, access.args);
    if (audit) {
      // Once the action succeeds, a log-write outage must not invite a duplicate retry.
      try {finishAccessAudit_(audit, access, result);}
      catch (auditError) {console.error(JSON.stringify({event:'approval_log_pending', auditId:audit.id}));}
    }
    return result;
  } catch (error) {
    if (audit) {try {finishAccessAudit_(audit, access, null, error);} catch (auditError) {console.error('Approval log update failed: ' + audit.id);}}
    throw error;
  } finally {
    try {if(inventoryChanged)invalidateInventoryRead_();}
    catch(error){console.error(JSON.stringify({event:'inventory_cache_invalidation_failed',operation:access.operation}));}
    finally {ACCESS_REQUEST_CONTEXT_ = previous;}
  }
}
