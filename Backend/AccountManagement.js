function requireAccountOwner_() {
  assertAppRequest_();
  if (!ACCESS_REQUEST_CONTEXT_.actor || employeeRoleKey_(ACCESS_REQUEST_CONTEXT_.actor) !== 'OWNER')
    throw new Error('Only an Owner can manage accounts.');
}
function getManagedAccounts() {
  assertAppRequest_();
  requireAccountOwner_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EMPLOYEES);
  if (!sheet) throw new Error('Employees sheet not found.');
  const accounts = employeeLoginAccounts_(sheet.getDataRange().getValues()).filter(account=>String(account.id || '').trim());
  return {success:true, accounts:accounts.map(account=>({employeeId:String(account.id),
    name:account.fullName, username:account.username, role:employeeRoleKey_(account), active:account.active,
    version:accountRecordVersion_(account.row)})), roles:ACCESS_ROLE_ORDER_, permissions:ACCESS_PERMISSION_MODES_};
}
function accountRecordVersion_(row) {
  // Opaque version binds the form to its read, without exposing a password-derived value.
  const key = 'account-version:' + String(row[0]);
  const cache = CacheService.getScriptCache(), raw = cache.get(key), fingerprint = employeeAuthFingerprint_(row);
  const saved = raw ? JSON.parse(raw) : null;
  if (saved && saved.fingerprint === fingerprint) return saved.version;
  const version = Utilities.getUuid();
  cache.put(key,JSON.stringify({version:version, fingerprint:fingerprint}),21600);
  return version;
}
function saveManagedAccount(payload) {
  assertAppRequest_();
  requireAccountOwner_();
  payload = payload || {};
  const role = employeeRoleKey_({role:payload.role});
  if (!ACCESS_ROLE_ORDER_.includes(role) || typeof payload.active !== 'boolean') throw new Error('Choose a valid role and account status.');
  const password = payload.password == null ? '' : String(payload.password);
  if (password && (password.trim() !== password || password.length < 4 || password.length > 128))
    throw new Error('Use a password of 4–128 characters without leading or trailing spaces.');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EMPLOYEES);
    if (!sheet) throw new Error('Employees sheet not found.');
    const rows = sheet.getDataRange().getValues();
    const matches = rows.map((row,index)=>({row:row,index:index})).filter(item=>item.index>0 && String(item.row[0])===String(payload.employeeId));
    if (matches.length !== 1) throw new Error('Choose an existing, unique employee account.');
    const target = matches[0];
    if (payload.version !== accountRecordVersion_(target.row)) throw new Error('Account changed. Reload accounts before saving.');
    const activeOwners = employeeLoginAccounts_(rows).filter(account=>employeeRoleKey_(account)==='OWNER' && account.active && account.username);
    if (employeeRoleKey_({role:target.row[4]})==='OWNER' && String(target.row[6]).toUpperCase()==='TRUE' &&
        (role !== 'OWNER' || !payload.active) && activeOwners.length <= 1) throw new Error('Keep at least one active Owner account.');
    const roleCell = sheet.getRange(target.index+1,5);
    roleCell.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ACCESS_ROLE_ORDER_,true).setAllowInvalid(false).build());
    // Leave identity, username access number, and all historical data untouched.
    roleCell.setValue(role);
    sheet.getRange(target.index+1,7).setValue(payload.active);
    if (password) sheet.getRange(target.index+1,4).setNumberFormat('@').setValue(auditLiteral_(password));
    PropertiesService.getScriptProperties().setProperty('account-revision:'+String(payload.employeeId),Utilities.getUuid());
    SpreadsheetApp.flush();
    return {success:true, sessionChanged:String(payload.employeeId)===ACCESS_REQUEST_CONTEXT_.actor.id,
      message:'Account saved. Existing sessions must sign in again.'};
  } finally {lock.releaseLock();}
}
function getApprovalHistory() {
  assertAppRequest_();
  if (permissionMode_(ACCESS_REQUEST_CONTEXT_.actor,'approvals.view') === 'deny') throw new Error('Manager view required.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Approval Log');
  if (!sheet || sheet.getLastRow()<2) return {success:true, entries:[]};
  validateAccessAuditHeaders_(sheet);
  const start = Math.max(2,sheet.getLastRow()-99);
  const rows = sheet.getRange(start,1,sheet.getLastRow()-start+1,10).getDisplayValues();
  return {success:true, entries:rows.reverse().map(row=>({id:row[0],timestamp:row[1],employee:row[2],
    approver:row[3],action:row[4],status:row[5],before:row[6],after:row[7],summary:row[8],error:row[9]}))};
}
