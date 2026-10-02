/* ==========================================================
   SALES LOG MANUAL-ENTRY AUTOMATION

   - Installable on-edit trigger handles pasted/manual rows.
   - One-minute batch trigger retries pending rows.
   - Source Line ID makes stock movements idempotent.
========================================================== */

const SALES_AUTOMATION_EDIT_HANDLER = "salesAutomationOnEdit";
const SALES_AUTOMATION_BATCH_HANDLER = "processPendingSalesLogRows";
const SALES_SYNC_BUTTON_TITLE = "YourStyle Sales Sync Button";
const SALES_SYNC_BUTTON_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLxVQAAAABJRU5ErkJggg==";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("POS Automation")
    .addItem("Install / Repair Sales Automation", "installSalesAutomationFromMenu")
    .addItem("Create / Repair SYNC Button", "createSalesSyncButtonFromMenu")
    .addItem("Process Pending Sales Now", "processPendingSalesLogRowsFromMenu")
    .addItem("Check Automation Status", "showSalesAutomationStatus")
    .addToUi();
}

function installSalesAutomationFromMenu() {
  const result = installSalesAutomation();
  SpreadsheetApp.getUi().alert(
    result.editTriggerInstalled && result.batchTriggerInstalled
      ? "Sales automation is installed. You can now paste a row into Sales Log."
      : "The automation could not be fully installed."
  );
}

function processPendingSalesLogRowsFromMenu() {
  const result = processPendingSalesLogRows();
  SpreadsheetApp.getUi().alert(
    "Sales automation finished. Processed: " + result.processed + "; Errors: " + result.errors + "."
  );
}

function processPendingSalesLogRowsFromButton() {
  const result = processPendingSalesLogRows();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Processed: " + result.processed + "; Errors: " + result.errors + ".",
    "Sales Sync",
    5
  );
}

function createSalesSyncButtonFromMenu() {
  createOrRepairSalesSyncButton_();
  SpreadsheetApp.getUi().alert("The SYNC button is ready on Sales Log at AA2:AC3.");
}

function createOrRepairSalesSyncButton_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SALES_LOG);
  if (!sheet) throw new Error("Sales Log sheet not found.");

  const buttonRange = sheet.getRange("AA2:AC3");
  const alreadyMerged = buttonRange.getMergedRanges().some(function(range) {
    return range.getA1Notation() === "AA2:AC3";
  });
  if (!alreadyMerged) {
    buttonRange.breakApart();
    buttonRange.merge();
  }
  buttonRange
    .setValue("SYNC")
    .setBackground("#1F6F54")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setFontSize(14)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setNote("Click to process all pending manual Sales Log rows.");

  sheet.setColumnWidths(27, 3, 60);
  sheet.setRowHeights(2, 2, 28);

  let buttonImage = null;
  sheet.getImages().forEach(function(image) {
    if (image.getAltTextTitle() === SALES_SYNC_BUTTON_TITLE) buttonImage = image;
  });

  if (!buttonImage) {
    const blob = Utilities.newBlob(
      Utilities.base64Decode(SALES_SYNC_BUTTON_IMAGE_BASE64),
      "image/png",
      "sales-sync-button.png"
    );
    buttonImage = sheet.insertImage(blob, 27, 2, 0, 0);
  }

  buttonImage
    .setAnchorCell(sheet.getRange("AA2"))
    .setWidth(180)
    .setHeight(56)
    .setAltTextTitle(SALES_SYNC_BUTTON_TITLE)
    .setAltTextDescription("Click to sync pending Sales Log rows.")
    .assignScript("processPendingSalesLogRowsFromButton");

  SpreadsheetApp.flush();
  return { success: true, range: "AA2:AC3" };
}

function showSalesAutomationStatus() {
  const status = getSalesAutomationStatus();
  SpreadsheetApp.getUi().alert(
    "Edit trigger: " + (status.editTriggerInstalled ? "INSTALLED" : "NOT INSTALLED") +
    "\nBatch trigger: " + (status.batchTriggerInstalled ? "INSTALLED" : "NOT INSTALLED")
  );
}

function installSalesAutomation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const handler = trigger.getHandlerFunction();
    if (handler === SALES_AUTOMATION_EDIT_HANDLER || handler === SALES_AUTOMATION_BATCH_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(SALES_AUTOMATION_EDIT_HANDLER)
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  ScriptApp.newTrigger(SALES_AUTOMATION_BATCH_HANDLER)
    .timeBased()
    .everyMinutes(1)
    .create();

  return getSalesAutomationStatus();
}

function getSalesAutomationStatus() {
  const handlers = ScriptApp.getProjectTriggers().map(function(trigger) {
    return trigger.getHandlerFunction();
  });
  return {
    success: true,
    editTriggerInstalled: handlers.indexOf(SALES_AUTOMATION_EDIT_HANDLER) !== -1,
    batchTriggerInstalled: handlers.indexOf(SALES_AUTOMATION_BATCH_HANDLER) !== -1,
    editHandler: SALES_AUTOMATION_EDIT_HANDLER,
    batchHandler: SALES_AUTOMATION_BATCH_HANDLER
  };
}

function salesAutomationOnEdit(event) {
  if (!event || !event.range) return;
  const sheet = event.range.getSheet();
  if (sheet.getName() !== SHEETS.SALES_LOG || event.range.getRow() < 2) return;

  const firstEditedColumn = event.range.getColumn();
  const lastEditedColumn = firstEditedColumn + event.range.getNumColumns() - 1;
  if (firstEditedColumn > SALES_COL.ORIGINAL_RECEIPT_ID || lastEditedColumn < SALES_COL.TIMESTAMP) return;

  const startRow = Math.max(2, event.range.getRow());
  const endRow = event.range.getRow() + event.range.getNumRows() - 1;
  const rows = [];
  for (let row = startRow; row <= endRow; row++) rows.push(row);

  markManualSalesRowsPending_(sheet, rows);
  processSalesRows_(sheet, rows);
}

function markManualSalesRowsPending_(sheet, rowNumbers) {
  rowNumbers.forEach(function(rowNumber) {
    const row = sheet.getRange(rowNumber, 1, 1, SALES_LOG_COLUMN_COUNT).getValues()[0];
    const hasInput = row.slice(0, SALES_IDX.ORIGINAL_RECEIPT_ID + 1).some(function(value) {
      return value !== "" && value !== null;
    });
    if (!hasInput) return;

    const source = String(row[SALES_IDX.ENTRY_SOURCE] || "").trim().toUpperCase();
    const syncStatus = String(row[SALES_IDX.SYNC_STATUS] || "").trim().toUpperCase();
    if (source === "POS" || syncStatus === "PROCESSED") return;

    if (!String(row[SALES_IDX.SALES_LINE_ID] || "").trim()) {
      sheet.getRange(rowNumber, SALES_COL.SALES_LINE_ID).setValue(generateSalesLineId());
    }
    sheet.getRange(rowNumber, SALES_COL.ENTRY_SOURCE).setValue("MANUAL");
    sheet.getRange(rowNumber, SALES_COL.SYNC_STATUS).setValue("PENDING");
    sheet.getRange(rowNumber, SALES_COL.PROCESSED_AT).clearContent();
    sheet.getRange(rowNumber, SALES_COL.SYNC_ERROR).clearContent();
  });
}

function salesMovementLineIds_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  const found = {};
  if (!sheet || sheet.getLastRow() < 2) return found;
  sheet.getRange(2, MOVE_COL.SOURCE_LINE_ID, sheet.getLastRow() - 1, 1)
    .getDisplayValues()
    .forEach(function(row) {
      const value = String(row[0] || "").trim();
      if (value) found[value] = true;
    });
  return found;
}

/*
 * A manually imported sale may refer to an active Product Master item that has
 * not reached Inventory yet. Seed its Inventory row at zero so the SALE
 * movement below can make the calculated stock negative. Unknown/inactive
 * codes still fail instead of creating an incomplete inventory record.
 */
function ensureManualSaleInventoryItem_(item) {
  item = item || {};
  const code = String(item.code || "").trim();
  const category = String(item.category || "").trim().toUpperCase();

  if (category === "YOURFINDS") {
    // Shared resolver normalizes S/M/L/XL and preserves nonstandard size labels.
    // Sync never sets a supplier cost from a selling price or CUSTOM template.
    return ensureCustomYourFindsInventoryItem_(item);
  }

  if (code.toUpperCase().startsWith("CUSTOM-")) {
    return { created: false, skipMovement: true };
  }

  const status = getProductInventoryStatus(code);
  if (!status || !status.success) {
    throw new Error(status && status.message ? status.message : "Unable to check Inventory.");
  }
  if (status.existsInInventory) {
    const repair = repairIncompleteInventoryFromProductMaster_(
      status.product,
      status.inventoryItem.rowNumber
    );
    return {
      created: false,
      repaired: repair.repaired,
      rowNumber: repair.rowNumber
    };
  }

  const created = createInventoryFromProductMaster(code);
  if (!created || !created.success) {
    throw new Error(
      created && created.message
        ? created.message
        : "Inventory Code " + code + " could not be created from Product Master."
    );
  }

  return {
    created: true,
    rowNumber: created.inventoryRowNumber
  };
}

function processPendingSalesLogRows() {
  createOrRepairSalesSyncButton_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SALES_LOG);
  if (!sheet || sheet.getLastRow() < 2) return { success: true, processed: 0, errors: 0 };

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, SALES_LOG_COLUMN_COUNT).getValues();
  const pending = [];
  for (let i = 0; i < rows.length && pending.length < 200; i++) {
    const source = String(rows[i][SALES_IDX.ENTRY_SOURCE] || "").trim().toUpperCase();
    const status = String(rows[i][SALES_IDX.SYNC_STATUS] || "").trim().toUpperCase();
    if (source === "MANUAL" && (status === "PENDING" || status === "RETRY")) pending.push(i + 2);
  }
  return processSalesRows_(sheet, pending);
}

function readSalesRowGroups_(sheet, rowNumbers) {
  const numbers = Array.from(new Set(rowNumbers)).sort((a, b) => a - b);
  const rows = new Map();
  for (let start = 0; start < numbers.length;) {
    let end = start + 1;
    // Bound each read and avoid scanning gaps between sparse pending rows.
    while (end < numbers.length && end - start < 200 && numbers[end] === numbers[end - 1] + 1) end++;
    const values = sheet.getRange(numbers[start], 1, end - start, SALES_LOG_COLUMN_COUNT).getValues();
    values.forEach((row, index) => rows.set(numbers[start] + index, row));
    start = end;
  }
  return rows;
}

function processSalesRows_(sheet, rowNumbers) {
  if (!rowNumbers.length) return { success: true, processed: 0, errors: 0 };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let processed = 0;
  let errors = 0;

  try {
    const movementIds = salesMovementLineIds_();
    const rows = readSalesRowGroups_(sheet, rowNumbers);
    Array.from(new Set(rowNumbers)).forEach(function(rowNumber) {
      const row = rows.get(rowNumber);
      const source = String(row[SALES_IDX.ENTRY_SOURCE] || "").trim().toUpperCase();
      const syncStatus = String(row[SALES_IDX.SYNC_STATUS] || "").trim().toUpperCase();
      if (source !== "MANUAL" || (syncStatus !== "PENDING" && syncStatus !== "RETRY")) return;

      const salesLineId = String(row[SALES_IDX.SALES_LINE_ID] || "").trim();
      try {
        if (!salesLineId) throw new Error("Sales Line ID is missing.");
        const receiptId = String(row[SALES_IDX.RECEIPT_ID] || "").trim();
        const cashier = String(row[SALES_IDX.CASHIER] || "").trim();
        const code = String(row[SALES_IDX.CODE] || "").trim();
        const itemName = String(row[SALES_IDX.ITEM_NAME] || "").trim();
        const size = String(row[SALES_IDX.SIZE] || "").trim();
        const category = String(row[SALES_IDX.CATEGORY] || "").trim();
        const quantity = Number(row[SALES_IDX.QUANTITY]);
        const price = Number(row[SALES_IDX.PRICE]);
        const saleStatus = String(row[SALES_IDX.STATUS] || "").trim().toUpperCase();

        // A missing sale date must not block stock sync or invent a historical date.
        if (!receiptId) throw new Error("Receipt ID is required.");
        if (!cashier) throw new Error("Cashier is required.");
        if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity must be a positive whole number.");
        if (!saleStatus) throw new Error("Status is required.");

        if (saleStatus === "COMPLETED" && code && !movementIds[salesLineId]) {
          const inventoryResolution = ensureManualSaleInventoryItem_({
            code: code,
            name: itemName,
            size: size,
            category: category,
            price: price
          });
          if (!inventoryResolution.skipMovement) {
            changeInventoryStock({
              code: code,
              qtyChange: -quantity,
              referenceId: receiptId,
              sourceLineId: salesLineId,
              employee: cashier,
              item: itemName,
              reason: "",
              source: INVENTORY_MOVEMENT_SOURCE.SALE,
              notes: "Manual Sales Log entry"
            });
          }
          movementIds[salesLineId] = true;
        }

        sheet.getRange(rowNumber, SALES_COL.SYNC_STATUS).setValue("PROCESSED");
        sheet.getRange(rowNumber, SALES_COL.PROCESSED_AT).setValue(new Date());
        sheet.getRange(rowNumber, SALES_COL.SYNC_ERROR).clearContent();
        processed++;
      } catch (error) {
        sheet.getRange(rowNumber, SALES_COL.SYNC_STATUS).setValue("ERROR");
        sheet.getRange(rowNumber, SALES_COL.SYNC_ERROR).setValue(error && error.message ? error.message : String(error));
        errors++;
      }
    });
  } finally {
    lock.releaseLock();
  }

  SpreadsheetApp.flush();
  return { success: errors === 0, processed: processed, errors: errors };
}
