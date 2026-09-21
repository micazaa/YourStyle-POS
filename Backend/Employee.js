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

  for (let i = 1; i < data.length; i++) {

    const employeeId = data[i][0];
    const firstName = data[i][1];
    const lastName = data[i][2];
    const storedPin = String(data[i][3]).trim();
    const role = data[i][4];
    const accessLevel = Number(data[i][5]);
    const active = String(data[i][6]).toUpperCase() === "TRUE";

    const fullName = firstName + " " + lastName;

    if (fullName === employeeName) {

      if (!active) {
        return {
          success: false,
          message: "Employee account is inactive."
        };
      }

      if (storedPin !== String(pin).trim()) {
        return {
          success: false,
          message: "Incorrect PIN."
        };
      }

      return {
        success: true,
        employeeId: employeeId,
        fullName: fullName,
        role: role,
        accessLevel: accessLevel,
        inventoryManagerToken: Number.isFinite(accessLevel) && accessLevel <= 1
          ? createInventoryManagerSession_(employeeId, fullName) : ""
      };
    }
  }

  return {
    success: false,
    message: "Employee not found."
  };
}

function verifyManagerPin(pin) {
  if (pin && typeof pin === "object") {
    try { return verifyInventoryManagerSession_(pin.managerToken); }
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

  let employees = [];

  for (let i = 1; i < data.length; i++) {

    const active = String(data[i][6]).toUpperCase() === "TRUE";

    if (!active) continue;

    employees.push({
      id: data[i][0],
      firstName: data[i][1],
      lastName: data[i][2],
      fullName: data[i][1] + " " + data[i][2],
      role: data[i][4],
      accessLevel: Number(data[i][5])
    });

  }

  return employees;
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
