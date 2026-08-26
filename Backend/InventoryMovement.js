/* ==========================================================
   YOURSTYLE POS
   INVENTORY MOVEMENT / STOCK ENGINE

   MOVEMENT RULE:

   TYPE   = WHAT inventory moved
            YOURFINDS / PINS / OTHERS
            BULK_PINS / BULK_OTHERS

   SOURCE = WHY inventory moved
            SALE / VOID / DELIVERY / DISTRIBUTION
            SUPPLIER_RETURN / ADJUSTMENT
========================================================== */


/* ==========================================================
   CHANGE INVENTORY STOCK

   Used for normal Inventory rows.

   The caller DOES NOT provide Type.

   Type is determined automatically from the actual
   Inventory row using Category + Inventory Type.

   Bulk holders do not use this function because bulk
   holder balances live in Delivery Log.
========================================================== */

function changeInventoryStock(options) {
  if (!options) {
    throw new Error("Stock movement options are required.");
  }

  const code = String(options.code || "").trim();
  const qtyChange = Number(options.qtyChange);
  const referenceId = String(options.referenceId || "").trim();
  const employee = String(options.employee || "").trim();
  const item = String(options.item || "").trim();
  const reason = String(options.reason || "").trim();
  const source = String(options.source || "").trim().toUpperCase();
  const bundleNo = options.bundleNo === "" || options.bundleNo == null ? "" : options.bundleNo;
  const remainingBundleQty = options.remainingBundleQty === "" || options.remainingBundleQty == null ? "" : Number(options.remainingBundleQty);
  const notes = String(options.notes || "").trim();

  /* ========================================================
     VALIDATE REQUEST
  ======================================================== */

  if (!code) {
    throw new Error("Inventory Code is required.");
  }

  if (!Number.isFinite(qtyChange) || qtyChange === 0) {
    throw new Error("Stock quantity change must be a non-zero number.");
  }

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
     FIND INVENTORY CODE
  ======================================================== */

  const codeValues = inventorySheet
    .getRange(
      2,
      INV_COL.CODE,
      lastRow - 1,
      1
    )
    .getDisplayValues();

  let inventoryRow = -1;

  for (let i = 0; i < codeValues.length; i++) {
    const inventoryCode = String(
      codeValues[i][0] || ""
    ).trim();

    if (inventoryCode === code) {
      inventoryRow = i + 2;
      break;
    }
  }

  if (inventoryRow === -1) {
    throw new Error(
      "Inventory Code " +
      code +
      " was not found."
    );
  }

  /* ========================================================
     DETERMINE MOVEMENT TYPE FROM INVENTORY

     UNIQUE / YourFinds → YOURFINDS
     PINS               → PINS
     OTHERS             → OTHERS
  ======================================================== */

  const category = String(
    inventorySheet
      .getRange(
        inventoryRow,
        INV_COL.CATEGORY
      )
      .getDisplayValue() || ""
  ).trim();

  const inventoryType = String(
    inventorySheet
      .getRange(
        inventoryRow,
        INV_COL.INVENTORY_TYPE
      )
      .getDisplayValue() || ""
  ).trim();

  const movementType =
    getInventoryMovementType(
      category,
      inventoryType
    );

  /* ========================================================
     CURRENT STOCK
  ======================================================== */

  const stockCell =
    inventorySheet.getRange(
      inventoryRow,
      INV_COL.STOCK
    );

  const stockBefore =
    Number(stockCell.getValue()) || 0;

  const stockAfter =
    stockBefore + qtyChange;

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

     If logging fails, restore stock.
  ======================================================== */

  try {
    logInventoryMovement({
      code: code,
      type: movementType,
      qtyChange: qtyChange,
      stockBefore: stockBefore,
      stockAfter: stockAfter,
      referenceId: referenceId,
      employee: employee,
      item: item,
      reason: reason,
      source: source,
      bundleNo: bundleNo,
      remainingBundleQty: remainingBundleQty,
      notes: notes
    });

  } catch (movementError) {
    stockCell.setValue(stockBefore);

    SpreadsheetApp.flush();

    throw new Error(
      "Inventory movement failed. Stock was restored. " +
      (
        movementError &&
        movementError.message
          ? movementError.message
          : String(movementError)
      )
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
    movementType: movementType,
    qtyChange: qtyChange,
    stockBefore: stockBefore,
    stockAfter: stockAfter
  };
}


/* ==========================================================
   INVENTORY MOVEMENT LOGGER — A:N

   A  Timestamp
   B  Code
   C  Type
   D  Qty Change
   E  Stock Before
   F  Stock After
   G  Reference ID
   H  Employee
   I  Item
   J  Reason
   K  Source
   L  Bundle No.
   M  Remaining Bundle Qty
   N  Notes
========================================================== */

function logInventoryMovement(movement) {
  if (!movement) {
    throw new Error(
      "Inventory movement data is required."
    );
  }

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  let sheet =
    ss.getSheetByName(
      SHEETS.INVENTORY_MOVEMENT_LOG
    );

  if (!sheet) {
    sheet =
      ss.insertSheet(
        SHEETS.INVENTORY_MOVEMENT_LOG
      );

    sheet
      .getRange(
        1,
        1,
        1,
        MOVEMENT_LOG_COLUMN_COUNT
      )
      .setValues([[
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
        "Bundle No.",
        "Remaining Bundle Qty",
        "Notes"
      ]]);
  }

  /* ========================================================
     NORMALIZE
  ======================================================== */

  const code =
    String(
      movement.code || ""
    ).trim();

  const type =
    String(
      movement.type || ""
    )
      .trim()
      .toUpperCase();

  const qtyChange =
    Number(
      movement.qtyChange
    );

  const stockBefore =
    Number(
      movement.stockBefore
    ) || 0;

  const stockAfter =
    Number(
      movement.stockAfter
    ) || 0;

  const referenceId =
    String(
      movement.referenceId || ""
    ).trim();

  const employee =
    String(
      movement.employee || ""
    ).trim();

  const item =
    String(
      movement.item || ""
    ).trim();

  const reason =
    String(
      movement.reason || ""
    ).trim();

  const source =
    String(
      movement.source || ""
    )
      .trim()
      .toUpperCase();

  const bundleNo =
    movement.bundleNo === "" ||
    movement.bundleNo == null
      ? ""
      : movement.bundleNo;

  const remainingBundleQty =
    movement.remainingBundleQty === "" ||
    movement.remainingBundleQty == null
      ? ""
      : Number(
          movement.remainingBundleQty
        );

  const notes =
    String(
      movement.notes || ""
    ).trim();

  /* ========================================================
     VALIDATE
  ======================================================== */

  if (!code) {
    throw new Error(
      "Inventory movement Code is required."
    );
  }

  if (!type) {
    throw new Error(
      "Inventory movement Type is required."
    );
  }

  if (
    !Number.isFinite(qtyChange) ||
    qtyChange === 0
  ) {
    throw new Error(
      "Inventory movement quantity must be non-zero."
    );
  }

  if (!source) {
    throw new Error(
      "Inventory movement Source is required."
    );
  }

  /* ========================================================
     BUILD A:N ROW
  ======================================================== */

  const row = [
    new Date(),               // A Timestamp
    code,                     // B Code
    type,                     // C Type
    qtyChange,                // D Qty Change
    stockBefore,              // E Stock Before
    stockAfter,               // F Stock After
    referenceId,              // G Reference ID
    employee,                 // H Employee
    item,                     // I Item
    reason,                   // J Reason
    source,                   // K Source
    bundleNo,                 // L Bundle No.
    remainingBundleQty,       // M Remaining Bundle Qty
    notes                     // N Notes
  ];

  if (
    row.length !==
    MOVEMENT_LOG_COLUMN_COUNT
  ) {
    throw new Error(
      "Inventory Movement row does not match A:N mapping."
    );
  }

  /* ========================================================
     WRITE
  ======================================================== */

  sheet.appendRow(row);

  return true;
}


/* ==========================================================
   RESOLVE INVENTORY MOVEMENT TYPE

   WHAT inventory moved:

   UNIQUE / YourFinds → YOURFINDS
   Product Master Pins → PINS
   Product Master Others → OTHERS

   BULK_PINS / BULK_OTHERS are handled separately because
   bulk holders do not exist as normal Inventory rows.
========================================================== */

function getInventoryMovementType(
  category,
  inventoryType
) {
  const normalizedCategory =
    String(
      category || ""
    )
      .trim()
      .toUpperCase();

  const normalizedInventoryType =
    String(
      inventoryType || ""
    )
      .trim()
      .toUpperCase();

  if (
    normalizedCategory === "YOURFINDS" ||
    normalizedInventoryType ===
      INVENTORY_TYPE.UNIQUE
  ) {
    return (
      INVENTORY_MOVEMENT_TYPE.YOURFINDS
    );
  }

  if (
    normalizedCategory === "PINS"
  ) {
    return (
      INVENTORY_MOVEMENT_TYPE.PINS
    );
  }

  if (
    normalizedCategory === "OTHERS"
  ) {
    return (
      INVENTORY_MOVEMENT_TYPE.OTHERS
    );
  }

  throw new Error(
    "Unable to determine Inventory Movement Type. " +
    "Category: " +
    normalizedCategory +
    ", Inventory Type: " +
    normalizedInventoryType
  );
}