/* ==========================================================
   YOURSTYLE POS
   INVENTORY MOVEMENT / STOCK ENGINE
========================================================== */

/* ==========================================================
   CHANGE INVENTORY STOCK

   Central function for ALL future stock changes:

   SALE
   VOID
   DELIVERY
   SUPPLIER_RETURN
   ADJUSTMENT

   Example:

   changeInventoryStock({
     code: "100001",
     qtyChange: -1,
     type: INVENTORY_MOVEMENT_TYPE.SALE,
     referenceId: "YS-123456",
     employee: "Mica",
     item: "YELLOW",
     reason: "",
     source: INVENTORY_MOVEMENT_SOURCE.CASHIER,
     notes: ""
   });

========================================================== */

function changeInventoryStock(options) {
  /* ========================================================
     VALIDATE REQUEST
  ======================================================== */

  if (!options) {
    throw new Error("Stock movement options are required.");
  }

  const code = String(options.code || "").trim();

  const qtyChange = Number(options.qtyChange);

  const type = String(options.type || "")
    .trim()
    .toUpperCase();

  const referenceId = String(options.referenceId || "").trim();

  const employee = String(options.employee || "").trim();

  const item = String(options.item || "").trim();

  const reason = String(options.reason || "").trim();

  const source = String(options.source || "")
    .trim()
    .toUpperCase();

  const notes = String(options.notes || "").trim();

  /* ================= CODE ================= */

  if (!code) {
    throw new Error("Inventory Code is required.");
  }

  /* ================= QUANTITY ================= */

  if (!Number.isFinite(qtyChange) || qtyChange === 0) {
    throw new Error("Stock quantity change must be a non-zero number.");
  }

  /* ================= TYPE ================= */

  if (!type) {
    throw new Error("Inventory movement Type is required.");
  }

  /* ================= SOURCE ================= */

  if (!source) {
    throw new Error("Inventory movement Source is required.");
  }

  /* ========================================================
     INVENTORY SHEET
  ======================================================== */

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);

  if (!inventorySheet) {
    throw new Error("Inventory sheet not found.");
  }

  const lastRow = inventorySheet.getLastRow();

  if (lastRow < 2) {
    throw new Error("Inventory is empty.");
  }

  /* ========================================================
     FIND CODE

     Use display values for Code so formatting is preserved.
  ======================================================== */

  const codeValues = inventorySheet
    .getRange(2, INV_COL.CODE, lastRow - 1, 1)
    .getDisplayValues();

  let inventoryRow = -1;

  for (let i = 0; i < codeValues.length; i++) {
    const inventoryCode = String(codeValues[i][0] || "").trim();

    if (inventoryCode === code) {
      inventoryRow = i + 2;

      break;
    }
  }

  if (inventoryRow === -1) {
    throw new Error("Inventory Code " + code + " was not found.");
  }

  /* ========================================================
     CURRENT STOCK
  ======================================================== */

  const stockCell = inventorySheet.getRange(inventoryRow, INV_COL.STOCK);

  const stockBefore = Number(stockCell.getValue()) || 0;

  const stockAfter = stockBefore + qtyChange;

  /* ========================================================
     PREVENT NEGATIVE STOCK
  ======================================================== */

  if (stockAfter < 0) {
    throw new Error(
      "Insufficient stock for " +
        code +
        ". Available: " +
        stockBefore +
        ", change requested: " +
        qtyChange
    );
  }

  /* ========================================================
     UPDATE STOCK
  ======================================================== */

  stockCell.setValue(stockAfter);

  /* ========================================================
     MOVEMENT LOG

     IMPORTANT:
     If logging fails, restore the previous stock immediately.
  ======================================================== */

  try {
    logInventoryMovement({
      code: code,

      type: type,

      qtyChange: qtyChange,

      stockBefore: stockBefore,

      stockAfter: stockAfter,

      referenceId: referenceId,

      employee: employee,

      item: item,

      reason: reason,

      source: source,

      notes: notes,
    });
  } catch (movementError) {
    /*
      Roll stock back so we don't leave Inventory changed
      without a corresponding audit movement.
    */

    stockCell.setValue(stockBefore);

    SpreadsheetApp.flush();

    throw new Error(
      "Inventory movement failed. Stock was restored. " +
        (movementError && movementError.message
          ? movementError.message
          : String(movementError))
    );
  }

  SpreadsheetApp.flush();

  /* ========================================================
     RESULT
  ======================================================== */

  return {
    success: true,

    code: code,

    rowNumber: inventoryRow,

    qtyChange: qtyChange,

    stockBefore: stockBefore,

    stockAfter: stockAfter,
  };
}

/* ==========================================================
   INVENTORY MOVEMENT LOGGER
========================================================== */

function logInventoryMovement(movement) {
  if (!movement) {
    throw new Error("Inventory movement data is required.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);

  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.INVENTORY_MOVEMENT_LOG);

    sheet
      .getRange(1, 1, 1, MOVEMENT_LOG_COLUMN_COUNT)
      .setValues([
        [
          "Timestamp",
          "Code",
          "Type",
          "Qty Change",
          "Stock Before",
          "Stock After",
          "Reference ID",
          "Employee",
          "Item",
          "Reason",
          "Source",
          "Notes",
        ],
      ]);
  }

  const code = String(movement.code || "").trim();

  const type = String(movement.type || "")
    .trim()
    .toUpperCase();

  const qtyChange = Number(movement.qtyChange);

  const stockBefore = Number(movement.stockBefore) || 0;

  const stockAfter = Number(movement.stockAfter) || 0;

  const referenceId = String(movement.referenceId || "").trim();

  const employee = String(movement.employee || "").trim();

  const item = String(movement.item || "").trim();

  const reason = String(movement.reason || "").trim();

  const source = String(movement.source || "")
    .trim()
    .toUpperCase();

  const notes = String(movement.notes || "").trim();

  /* ========================================================
     VALIDATION
  ======================================================== */

  if (!code) {
    throw new Error("Inventory movement Code is required.");
  }

  if (!type) {
    throw new Error("Inventory movement Type is required.");
  }

  if (!Number.isFinite(qtyChange) || qtyChange === 0) {
    throw new Error("Inventory movement quantity must be non-zero.");
  }

  if (!source) {
    throw new Error("Inventory movement Source is required.");
  }

  /* ========================================================
     WRITE
  ======================================================== */

  sheet.appendRow([
    new Date(), // A Timestamp

    code, // B Code

    type, // C Type

    qtyChange, // D Qty Change

    stockBefore, // E Stock Before

    stockAfter, // F Stock After

    referenceId, // G Reference ID

    employee, // H Employee

    item, // I Item

    reason, // J Reason

    source, // K Source

    notes, // L Notes
  ]);

  return true;
}

