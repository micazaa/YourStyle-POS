function employeeUsernamePart_(value) {
  return String(value === null || value === undefined ? '' : value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function employeeLoginAccounts_(data) {
  const headers = (data[0] || []).map(value => String(value).trim().toLowerCase());
  const middleColumn = headers.findIndex(value => value === 'middle name' || value === 'middle initial');
  const accounts = data.slice(1).map(row => {
    const first = employeeUsernamePart_(row[1]), last = employeeUsernamePart_(row[2]);
    const level = String(row[5] === null || row[5] === undefined ? '' : row[5]).trim();
    const validLevel = level !== '' && Number.isSafeInteger(Number(level)) && Number(level) >= 0;
    return {
      row: row, id: row[0], firstName: row[1], lastName: row[2],
      fullName: row[1] + ' ' + row[2], role: row[4],
      accessLevel: validLevel ? Number(level) : null,
      active: String(row[6]).trim().toUpperCase() === 'TRUE',
      username: first && last && validLevel ? first + last + Number(level) + '@ys.sys' : '',
    };
  });
  const counts = new Map();
  accounts.forEach(account => { if (account.username) counts.set(account.username, (counts.get(account.username) || 0) + 1); });
  accounts.forEach(account => {
    if (!account.username || counts.get(account.username) < 2) return;
    const first = employeeUsernamePart_(account.firstName), last = employeeUsernamePart_(account.lastName);
    const middle = middleColumn >= 7 ? employeeUsernamePart_(account.row[middleColumn]).slice(0, 1) : '';
    const employeeId = employeeUsernamePart_(account.id);
    account.username = middle ? first + middle + last + account.accessLevel + '@ys.sys'
      : employeeId ? first + last + '.' + employeeId + account.accessLevel + '@ys.sys' : '';
  });
  // Never select an arbitrary account if identifiers still collide.
  const finalCounts = new Map();
  accounts.forEach(account => { if (account.username) finalCounts.set(account.username, (finalCounts.get(account.username) || 0) + 1); });
  accounts.forEach(account => {
    if (finalCounts.get(account.username) < 2 || !account.username) return;
    const employeeId = employeeUsernamePart_(account.id);
    account.username = employeeId ? employeeUsernamePart_(account.firstName) + employeeUsernamePart_(account.lastName) + '.' + employeeId + account.accessLevel + '@ys.sys' : '';
  });
  const unique = new Map();
  accounts.forEach(account => { if (account.username) unique.set(account.username, (unique.get(account.username) || 0) + 1); });
  accounts.forEach(account => { if (unique.get(account.username) > 1) account.username = ''; });
  return accounts;
}

function verifyEmployee(employeeName, pin) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Employees");

  if (!sheet) {
    return {
      success: false,
      message: "Employees sheet not found."
    };
  }

  const data = sheet.getDataRange().getValues();

  const identifier = String(employeeName || '').trim();
  const accounts = employeeLoginAccounts_(data);
  // Full-name authentication remains for existing tabs and session reauthentication.
  const matches = accounts.filter(account => identifier.includes('@')
    ? account.username && account.username === identifier.toLowerCase()
    : account.fullName === identifier);
  if (matches.length === 1) {
      const account = matches[0];
      const {id: employeeId, fullName, role, accessLevel, active} = account;
      const storedPin = String(account.row[3] === undefined ? '' : account.row[3]).trim();

      if (!active) {
        return {
          success: false,
          message: "Employee account is inactive."
        };
      }

      if (accessLevel === null || !String(pin === undefined || pin === null ? '' : pin).trim() || storedPin !== String(pin).trim()) {
        return {
          success: false,
          message: "Incorrect username or password."
        };
      }

      return {
        success: true,
        dashboardToken: createDashboardSession_(employeeId, fullName),
        employeeId: employeeId,
        fullName: fullName,
        username: account.username,
        role: role,
        accessLevel: accessLevel,
        inventoryManagerToken: Number.isFinite(accessLevel) && accessLevel <= 1
          ? createInventoryManagerSession_(employeeId, fullName) : ""
      };
  }

  return {
    success: false,
    message: "Incorrect username or password."
  };
}

function verifyManagerPin(pin, expectedManagerName) {
  if (pin && typeof pin === "object") {
    try {
      const auth = verifyInventoryManagerSession_(pin.managerToken);
      if (expectedManagerName && auth.managerName !== expectedManagerName)
        return {success: false, message: 'Authorization must match the selected manager.'};
      return auth;
    }
    catch (error) { return { success: false, message: error.message || String(error) }; }
  }


  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      SHEETS.EMPLOYEES
    );


  if (!sheet) {

    return {
      success: false,
      message:
        "Employees sheet not found."
    };

  }


  const enteredPin =
    String(pin || "")
      .trim();


  if (!enteredPin) {

    return {
      success: false,
      message:
        "Manager PIN is required."
    };

  }


  const data =
    sheet
      .getDataRange()
      .getValues();


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    const firstName =
      String(
        data[i][1] || ""
      ).trim();


    const lastName =
      String(
        data[i][2] || ""
      ).trim();


    const storedPin =
      String(
        data[i][3] || ""
      ).trim();


    const role =
      String(
        data[i][4] || ""
      )
        .trim()
        .toUpperCase();


    const accessLevel =
      Number(
        data[i][5]
      );


    const active =
      String(
        data[i][6] || ""
      )
        .trim()
        .toUpperCase() ===
      "TRUE";


    /* ================= ACTIVE ================= */

    if (!active) {
      continue;
    }


    /* ================= MANAGER AUTHORITY =================

       Current POS rule:

       Access Level 0 / 1 = manager-authorized

       This is better than requiring the Role text
       to be exactly "Manager".
    ====================================================== */

    const hasManagerAccess =
      Number.isFinite(accessLevel) &&
      accessLevel <= 1;


    if (!hasManagerAccess) {
      continue;
    }


    /* ================= PIN ================= */

    if (expectedManagerName && (firstName + ' ' + lastName).trim() !== expectedManagerName) continue;

    if (
      storedPin !==
      enteredPin
    ) {

      continue;

    }


    /* ================= SUCCESS ================= */

    return {

      success: true,

      managerName:
        (
          firstName +
          " " +
          lastName
        ).trim(),

      role:
        role,

      accessLevel:
        accessLevel

    };

  }


  return {

    success: false,

    message:
      "Invalid Manager PIN."

  };

}

function getEmployees() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Employees");

  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();

  return employeeLoginAccounts_(data).filter(account => account.active).map(account => ({
    id: account.id, firstName: account.firstName, lastName: account.lastName,
    fullName: account.fullName, role: account.role, accessLevel: account.accessLevel,
    username: account.username,
  }));
}

// Sheet-editor menu action only; private to prevent unauthenticated web RPC writes.
// The sheet column is a readable projection. Authentication always recomputes it.
function refreshEmployeeUsernames_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Employees');
    if (!sheet) throw new Error('Employees sheet not found.');
    const data = sheet.getDataRange().getValues();
    const headers = (data[0] || []).map(value => String(value).trim().toLowerCase());
    let column = headers.indexOf('username');
    if (column >= 0 && column < 7) throw new Error('Username must be a separate column after Active.');
    if (column < 0) {
      column = 7;
      if (data.some(row => String(row[column] === undefined ? '' : row[column]).trim() !== ''))
        throw new Error('Employees column H contains other data. Add a separate Username header after column G, then retry.');
    }
    const accounts = employeeLoginAccounts_(data);
    if (accounts.some(account => account.active && !account.username))
      throw new Error('Check employee names, unique Employee IDs and non-negative whole Access Levels before generating usernames.');
    if (sheet.getMaxColumns() <= column) sheet.insertColumnsAfter(sheet.getMaxColumns(), column + 1 - sheet.getMaxColumns());
    sheet.getRange(1, column + 1, 1, 1).setValues([['Username']]);
    if (accounts.length) sheet.getRange(2, column + 1, accounts.length, 1).setValues(accounts.map(account => [account.username]));
    SpreadsheetApp.flush();
    return {success: true, count: accounts.length};
  } finally { lock.releaseLock(); }
}
// Inventory authorization is issued only after a successful employee login.
// Cache expiry requires signing in again; client role flags are never trusted.
function createInventoryManagerSession_(employeeId, fullName) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put("inventory-manager:" + token, JSON.stringify({
    employeeId: String(employeeId), fullName: fullName
  }), 21600);
  return token;
}

function verifyInventoryManagerSession_(token) {
  token = String(token || "");
  if (!/^[a-f0-9-]{72}$/i.test(token)) throw new Error("Please sign out and sign in again to authorize inventory changes.");
  const key = "inventory-manager:" + token;
  const cache = CacheService.getScriptCache();
  const raw = cache.get(key);
  if (!raw) throw new Error("Your manager session expired. Please sign out and sign in again.");
  const session = JSON.parse(raw);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EMPLOYEES);
  if (!sheet) throw new Error("Employees sheet not found.");
  const employee = sheet.getDataRange().getValues().slice(1).find(function(row) {
    return String(row[0]) === session.employeeId && (row[1] + " " + row[2]) === session.fullName;
  });
  if (!employee || String(employee[6]).toUpperCase() !== "TRUE" ||
      String(employee[5]).trim() === "" || !Number.isFinite(Number(employee[5])) || Number(employee[5]) > 1) {
    cache.remove(key);
    throw new Error("An active manager account is required for this change.");
  }
  return { success: true, managerName: session.fullName };
}

function revokeInventoryManagerSession(token) {
  token = String(token || "");
  if (/^[a-f0-9-]{72}$/i.test(token)) CacheService.getScriptCache().remove("inventory-manager:" + token);
  return { success: true };
}

function loginAndStartShift(name, pin, petty, handoverVersion) {
  const employee = verifyEmployee(name, pin);
  if (!employee || !employee.success) return employee;
  let shift;
  try { shift = startManagedCashierShift_(employee.fullName, petty, handoverVersion); }
  catch (error) { shift = {success: false, message: error.message || String(error)}; }
  if (!shift || !shift.success) {
    revokeDashboardSession(employee.dashboardToken);
    if (employee.inventoryManagerToken) revokeInventoryManagerSession(employee.inventoryManagerToken);
    return {success:false,message:shift && shift.message || 'Unable to start shift.'};
  }
  return {success:true,employee:employee,shift:shift};
}

function getLoginSetup() {
  const employees = getEmployees();
  let petty;
  try { petty = getLatestPettyHandover(); }
  catch (error) { petty = {success:false,message:error.message || String(error)}; }
  return {employees:employees, petty:petty};
}
