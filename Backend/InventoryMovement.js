/* ==========================================================
   YOURSTYLE POS
   INVENTORY MOVEMENT / STOCK ENGINE

   Phase 7 stock engine + Phase 8 inventory management.
========================================================== */

function changeInventoryStock(options) {
  if (!options) throw new Error("Stock movement options are required.");

  const code = String(options.code || "").trim();
  const qtyChange = Number(options.qtyChange);
  const referenceId = String(options.referenceId || "").trim();
  const employee = String(options.employee || "").trim();
  const item = String(options.item || "").trim();
  const reason = String(options.reason || "").trim();
  const source = String(options.source || "").trim().toUpperCase();
  const notes = String(options.notes || "").trim();
  const bundleNo = options.bundleNo === "" || options.bundleNo == null ? "" : options.bundleNo;
  const remainingBundleQty = options.remainingBundleQty === "" || options.remainingBundleQty == null ? "" : Number(options.remainingBundleQty);

  if (!code) throw new Error("Inventory Code is required.");
  if (!Number.isFinite(qtyChange) || qtyChange === 0) throw new Error("Stock quantity change must be a non-zero number.");
  if (!source) throw new Error("Inventory movement Source is required.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);
  if (!inventorySheet) throw new Error("Inventory sheet not found.");

  const lastRow = inventorySheet.getLastRow();
  if (lastRow < 2) throw new Error("Inventory is empty.");

  const codeValues = inventorySheet.getRange(2, INV_COL.CODE, lastRow - 1, 1).getDisplayValues();
  let inventoryRow = -1;
  for (let i = 0; i < codeValues.length; i++) {
    if (String(codeValues[i][0] || "").trim() === code) {
      inventoryRow = i + 2;
      break;
    }
  }
  if (inventoryRow === -1) throw new Error("Inventory Code " + code + " was not found.");

  const rowValues = inventorySheet.getRange(inventoryRow, 1, 1, INVENTORY_COLUMN_COUNT).getDisplayValues()[0];
  const inventoryType = String(rowValues[INV_IDX.INVENTORY_TYPE] || "").trim().toUpperCase();
  const category = String(rowValues[INV_IDX.CATEGORY] || "").trim().toUpperCase();
  const movementType = getInventoryMovementType(category, inventoryType);

  const stockCell = inventorySheet.getRange(inventoryRow, INV_COL.STOCK);
  const stockBefore = Number(stockCell.getValue()) || 0;
  const stockAfter = stockBefore + qtyChange;
  if (stockAfter < 0) {
    throw new Error("Insufficient stock for " + code + ". Available: " + stockBefore + ", change requested: " + qtyChange);
  }

  stockCell.setValue(stockAfter);
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
    throw new Error("Inventory movement failed. Stock was restored. " + (movementError && movementError.message ? movementError.message : String(movementError)));
  }

  SpreadsheetApp.flush();
  return { success: true, code: code, rowNumber: inventoryRow, qtyChange: qtyChange, stockBefore: stockBefore, stockAfter: stockAfter };
}

function logInventoryMovement(movement) {
  if (!movement) throw new Error("Inventory movement data is required.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.INVENTORY_MOVEMENT_LOG);
    sheet.getRange(1, 1, 1, MOVEMENT_LOG_COLUMN_COUNT).setValues([[
      "Timestamp", "Code", "Type", "Qty Change", "Stock Before", "Stock After",
      "Reference ID", "Employee", "Item", "Reason", "Source", "Bundle No.",
      "Remaining Bundle Qty", "Notes"
    ]]);
  }

  const code = String(movement.code || "").trim();
  const type = String(movement.type || "").trim().toUpperCase();
  const qtyChange = Number(movement.qtyChange);
  const stockBefore = Number(movement.stockBefore) || 0;
  const stockAfter = Number(movement.stockAfter) || 0;
  const referenceId = String(movement.referenceId || "").trim();
  const employee = String(movement.employee || "").trim();
  const item = String(movement.item || "").trim();
  const reason = String(movement.reason || "").trim();
  const source = String(movement.source || "").trim().toUpperCase();
  const bundleNo = movement.bundleNo === "" || movement.bundleNo == null ? "" : movement.bundleNo;
  const remainingBundleQty = movement.remainingBundleQty === "" || movement.remainingBundleQty == null ? "" : Number(movement.remainingBundleQty);
  const notes = String(movement.notes || "").trim();

  if (!code) throw new Error("Inventory movement Code is required.");
  if (!type) throw new Error("Inventory movement Type is required.");
  if (!Number.isFinite(qtyChange) || qtyChange === 0) throw new Error("Inventory movement quantity must be non-zero.");
  if (!source) throw new Error("Inventory movement Source is required.");

  const row = [new Date(), code, type, qtyChange, stockBefore, stockAfter, referenceId, employee, item, reason, source, bundleNo, remainingBundleQty, notes];
  if (row.length !== MOVEMENT_LOG_COLUMN_COUNT) throw new Error("Inventory Movement row does not match A:N mapping.");
  sheet.appendRow(row);
  return true;
}

function getInventoryMovementType(category, inventoryType) {
  const normalizedCategory = String(category || "").trim().toUpperCase();
  const normalizedInventoryType = String(inventoryType || "").trim().toUpperCase();

  if (normalizedCategory === "YOURFINDS" || normalizedInventoryType === INVENTORY_TYPE.UNIQUE) return INVENTORY_MOVEMENT_TYPE.YOURFINDS;
  if (normalizedCategory === "PINS") return INVENTORY_MOVEMENT_TYPE.PINS;
  if (normalizedCategory === "OTHERS") return INVENTORY_MOVEMENT_TYPE.OTHERS;
  throw new Error("Unable to determine Inventory Movement Type for category: " + normalizedCategory);
}

/* ==========================================================
   PHASE 8 - INVENTORY MANAGEMENT & STOCK OPERATIONS
========================================================== */

function phase8RequireManager_(pin) {
  const auth = verifyManagerPin(pin);
  if (!auth || !auth.success) throw new Error(auth && auth.message ? auth.message : "Manager authorization failed.");
  return auth;
}

function phase8AdjustmentId_() {
  return "ADJ-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss") + "-" + Math.floor(100 + Math.random() * 900);
}

function getInventoryMovementHistoryByCode(code) {
  code = String(code || "").trim();
  if (!code) throw new Error("Inventory Code is required.");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  if (!sheet || sheet.getLastRow() < 2) return { success: true, movements: [] };
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, MOVEMENT_LOG_COLUMN_COUNT).getValues();
  const display = sheet.getRange(2, 1, sheet.getLastRow() - 1, MOVEMENT_LOG_COLUMN_COUNT).getDisplayValues();
  const movements = [];
  values.forEach(function(row, i) {
    const d = display[i];
    if (String(d[MOVE_IDX.CODE] || "").trim() !== code) return;
    movements.push({
      timestamp: String(d[MOVE_IDX.TIMESTAMP] || ""), code: code,
      type: String(d[MOVE_IDX.TYPE] || ""), qtyChange: Number(row[MOVE_IDX.QTY_CHANGE]) || 0,
      stockBefore: Number(row[MOVE_IDX.STOCK_BEFORE]) || 0, stockAfter: Number(row[MOVE_IDX.STOCK_AFTER]) || 0,
      referenceId: String(d[MOVE_IDX.REFERENCE_ID] || ""), employee: String(d[MOVE_IDX.EMPLOYEE] || ""),
      item: String(d[MOVE_IDX.ITEM] || ""), reason: String(d[MOVE_IDX.REASON] || ""),
      source: String(d[MOVE_IDX.SOURCE] || ""), bundleNo: String(d[MOVE_IDX.BUNDLE_NO] || ""),
      remainingBundleQty: String(d[MOVE_IDX.REMAINING_BUNDLE_QTY] || ""), notes: String(d[MOVE_IDX.NOTES] || "")
    });
  });
  movements.reverse();
  return { success: true, movements: movements };
}

function adjustInventoryStockPhase8(payload) {
  payload = payload || {};
  const auth = phase8RequireManager_(payload.managerPin);
  const code = String(payload.code || "").trim();
  const direction = String(payload.direction || "").trim().toUpperCase();
  const qty = Number(payload.quantity);
  const reason = String(payload.reason || "").trim().toUpperCase();
  const notes = String(payload.notes || "").trim();
  const employee = String(payload.employee || "").trim();
  const allowedReasons = ["PHYSICAL COUNT CORRECTION","DAMAGED","LOST / MISSING","FOUND STOCK","DATA CORRECTION","OTHER"];
  if (!code) throw new Error("Inventory Code is required.");
  if (direction !== "ADD" && direction !== "REMOVE") throw new Error("Choose Add Stock or Remove Stock.");
  if (!Number.isInteger(qty) || qty < 1) throw new Error("Quantity must be a positive whole number.");
  if (allowedReasons.indexOf(reason) === -1) throw new Error("Select a valid adjustment reason.");
  if (reason === "OTHER" && !notes) throw new Error("Notes are required when reason is OTHER.");
  const itemResult = getInventoryItemByCode(code);
  if (!itemResult || !itemResult.success || !itemResult.item) throw new Error("Inventory item not found.");
  const item = itemResult.item;
  if (String(item.inventoryType || "").toUpperCase() === INVENTORY_TYPE.UNIQUE) throw new Error("UNIQUE YourFinds items cannot use quantity stock adjustment.");
  const referenceId = phase8AdjustmentId_();
  const result = changeInventoryStock({
    code: code, qtyChange: direction === "ADD" ? qty : -qty,
    referenceId: referenceId, employee: employee || auth.managerName,
    item: item.name, reason: reason, source: INVENTORY_MOVEMENT_SOURCE.ADJUSTMENT,
    notes: "Authorized by: " + auth.managerName + (notes ? " | " + notes : "")
  });
  return { success: true, referenceId: referenceId, manager: auth.managerName, stockAfter: result.stockAfter };
}

function changeInventoryItemPhase8(payload) {
  payload = payload || {};

  const auth = phase8RequireManager_(payload.managerPin);
  const fromCode = String(payload.fromCode || "").trim();
  const toCode = String(payload.toCode || "").trim();
  const qty = Number(payload.quantity);
  const reason = String(payload.reason || "ITEM CHANGE").trim().toUpperCase();
  const notes = String(payload.notes || "").trim();
  const employee = String(payload.employee || "").trim() || auth.managerName;

  if (!fromCode || !toCode || fromCode === toCode) {
    throw new Error("Choose two different inventory products.");
  }

  if (!Number.isInteger(qty) || qty < 1) {
    throw new Error("Quantity must be a positive whole number.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  let fromCell = null;
  let toCell = null;
  let fromBefore = null;
  let toBefore = null;
  let movementStart = 0;
  let mov = null;

  try {
    /*
      Re-read both inventory items only AFTER acquiring the lock.
      This prevents stale row numbers / stock values if another
      stock transaction was running at the same time.
    */
    const fromResult = getInventoryItemByCode(fromCode);
    const toResult = getInventoryItemByCode(toCode);

    if (!fromResult.success || !toResult.success) {
      throw new Error("Source or destination inventory item was not found.");
    }

    const fromItem = fromResult.item;
    const toItem = toResult.item;

    if (
      String(fromItem.inventoryType || "").toUpperCase() !== INVENTORY_TYPE.STOCK ||
      String(toItem.inventoryType || "").toUpperCase() !== INVENTORY_TYPE.STOCK
    ) {
      throw new Error(
        "Change Item is only for STOCK products. UNIQUE items cannot be converted."
      );
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const inv = ss.getSheetByName(SHEETS.INVENTORY);
    mov = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);

    if (!inv) {
      throw new Error("Inventory sheet not found.");
    }

    if (!mov) {
      throw new Error("Inventory Movement Log sheet not found.");
    }

    movementStart = mov.getLastRow();

    fromCell = inv.getRange(fromItem.rowNumber, INV_COL.STOCK);
    toCell = inv.getRange(toItem.rowNumber, INV_COL.STOCK);

    fromBefore = Number(fromCell.getValue()) || 0;
    toBefore = Number(toCell.getValue()) || 0;

    if (fromBefore < qty) {
      throw new Error(
        "Insufficient source stock. Available: " + fromBefore + "."
      );
    }

    const fromAfter = fromBefore - qty;
    const toAfter = toBefore + qty;
    const referenceId = phase8AdjustmentId_();

    fromCell.setValue(fromAfter);
    toCell.setValue(toAfter);

    logInventoryMovement({
      code: fromCode,
      type: getInventoryMovementType(fromItem.category, fromItem.inventoryType),
      qtyChange: -qty,
      stockBefore: fromBefore,
      stockAfter: fromAfter,
      referenceId: referenceId,
      employee: employee,
      item: fromItem.name,
      reason: reason,
      source: INVENTORY_MOVEMENT_SOURCE.ADJUSTMENT,
      notes:
        "Changed to " +
        toCode +
        " | Authorized by: " +
        auth.managerName +
        (notes ? " | " + notes : "")
    });

    logInventoryMovement({
      code: toCode,
      type: getInventoryMovementType(toItem.category, toItem.inventoryType),
      qtyChange: qty,
      stockBefore: toBefore,
      stockAfter: toAfter,
      referenceId: referenceId,
      employee: employee,
      item: toItem.name,
      reason: reason,
      source: INVENTORY_MOVEMENT_SOURCE.ADJUSTMENT,
      notes:
        "Changed from " +
        fromCode +
        " | Authorized by: " +
        auth.managerName +
        (notes ? " | " + notes : "")
    });

    SpreadsheetApp.flush();

    return {
      success: true,
      referenceId: referenceId,
      manager: auth.managerName,
      fromCode: fromCode,
      fromStockAfter: fromAfter,
      toCode: toCode,
      toStockAfter: toAfter
    };

  } catch (err) {
    /* Restore both stock cells if this transaction changed them. */
    try {
      if (fromCell && fromBefore !== null) {
        fromCell.setValue(fromBefore);
      }

      if (toCell && toBefore !== null) {
        toCell.setValue(toBefore);
      }
    } catch (rollbackStockError) {}

    /* Remove only movement rows created by this locked transaction. */
    try {
      if (mov && mov.getLastRow() > movementStart) {
        mov.deleteRows(
          movementStart + 1,
          mov.getLastRow() - movementStart
        );
      }
    } catch (rollbackMovementError) {}

    SpreadsheetApp.flush();
    throw err;

  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

function saveProductMasterPhase8(payload) {
  payload = payload || {};
  const auth = phase8RequireManager_(payload.managerPin);
  const code = String(payload.productCode || "").trim();
  const description = String(payload.description || "").trim();
  const category = String(payload.category || "").trim().toUpperCase();
  const defaultPrice = Number(payload.defaultPrice), originalPrice = Number(payload.originalPrice), lowStockAt = Number(payload.lowStockAt);
  const active = payload.active !== false;
  if (!code || !description) throw new Error("Product Code and Description are required.");
  if (category !== "PINS" && category !== "OTHERS") throw new Error("Category must be PINS or OTHERS.");
  if (!Number.isFinite(defaultPrice) || defaultPrice < 0 || !Number.isFinite(originalPrice) || originalPrice < 0) throw new Error("Prices must be valid non-negative numbers.");
  if (!Number.isInteger(lowStockAt) || lowStockAt < 0) throw new Error("Low Stock At must be a non-negative whole number.");
  const ss = SpreadsheetApp.getActiveSpreadsheet(); const sheet = ss.getSheetByName(SHEETS.PRODUCT_MASTER);
  if (!sheet) throw new Error("Product Master sheet not found.");
  const products = getProductMaster(); const existing = products.find(function(p){ return String(p.productCode) === code; });
  const now = new Date();
  if (existing) {
    sheet.getRange(existing.rowNumber, PRODUCT_COL.DESCRIPTION, 1, 7).setValues([[
      description, category, defaultPrice, originalPrice, INVENTORY_TYPE.STOCK, lowStockAt, active
    ]]);
    sheet.getRange(existing.rowNumber, PRODUCT_COL.UPDATED_AT).setValue(now);
  } else {
    sheet.appendRow([code, description, category, defaultPrice, originalPrice, INVENTORY_TYPE.STOCK, lowStockAt, active, now, now]);
  }
  // Sync safe metadata into existing STOCK Inventory row if present.
  const inv = ss.getSheetByName(SHEETS.INVENTORY);
  if (inv && inv.getLastRow() >= 2) {
    const codes = inv.getRange(2, INV_COL.CODE, inv.getLastRow() - 1, 1).getDisplayValues();
    for (let i = 0; i < codes.length; i++) if (String(codes[i][0]).trim() === code) {
      const r = i + 2;
      inv.getRange(r, INV_COL.DESCRIPTION).setValue(description);
      inv.getRange(r, INV_COL.ORIG_PRICE).setValue(originalPrice);
      inv.getRange(r, INV_COL.YS_PRICE).setValue(defaultPrice);
      inv.getRange(r, INV_COL.CATEGORY).setValue(category);
      inv.getRange(r, INV_COL.LOW_STOCK_AT).setValue(lowStockAt);
      inv.getRange(r, INV_COL.STATUS).setValue(active ? INVENTORY_STATUS.ACTIVE : INVENTORY_STATUS.INACTIVE);
      inv.getRange(r, INV_COL.UPDATED_AT).setValue(now);
      break;
    }
  }
  return { success: true, productCode: code, manager: auth.managerName };
}

function setInventoryAdministrativeStatusPhase8(payload) {
  payload = payload || {};
  const auth = phase8RequireManager_(payload.managerPin);
  const code = String(payload.code || "").trim();
  const status = String(payload.status || "").trim().toUpperCase();
  if (status !== INVENTORY_STATUS.ACTIVE && status !== INVENTORY_STATUS.INACTIVE) throw new Error("Status must be ACTIVE or INACTIVE.");
  const result = getInventoryItemByCode(code); if (!result.success) throw new Error(result.message || "Inventory item not found.");
  const ss = SpreadsheetApp.getActiveSpreadsheet(); const sheet = ss.getSheetByName(SHEETS.INVENTORY);
  sheet.getRange(result.item.rowNumber, INV_COL.STATUS).setValue(status);
  sheet.getRange(result.item.rowNumber, INV_COL.UPDATED_AT).setValue(new Date());
  return { success: true, status: status, manager: auth.managerName };
}

/* ==========================================================
   PHASE 8 - INVENTORY PHOTO MANAGEMENT
   Inventory Column A is the image source of truth.
========================================================== */

const PHASE8_PRODUCT_IMAGES_FOLDER_ID = "1NB2QYbRXJT2yn9AY6l-1hrFtoQKjWEOf";

function saveInventoryPhotoPhase8(payload) {
  payload = payload || {};
  const auth = phase8RequireManager_(payload.managerPin);
  const code = String(payload.code || "").trim();
  const dataUrl = String(payload.dataUrl || "").trim();
  const originalName = String(payload.fileName || "photo").trim();
  if (!code) throw new Error("Inventory Code is required.");
  if (!dataUrl) throw new Error("Choose an image first.");

  const match = dataUrl.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data.");
  const mimeType = match[1];
  if (["image/jpeg","image/png","image/webp"].indexOf(mimeType) === -1) {
    throw new Error("Use JPG, PNG, or WEBP images only.");
  }
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller.");

  const itemResult = getInventoryItemByCode(code);
  if (!itemResult || !itemResult.success || !itemResult.item) throw new Error("Inventory item not found.");

  const folder = DriveApp.getFolderById(PHASE8_PRODUCT_IMAGES_FOLDER_ID);
  const safeName = originalName.replace(/[^A-Za-z0-9._-]+/g, "_");
  const blob = Utilities.newBlob(bytes, mimeType, code + "_" + Date.now() + "_" + safeName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const imageUrl = "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1200";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.INVENTORY);
  const rowNumber = itemResult.item.rowNumber;
  const oldValue = String(sheet.getRange(rowNumber, INV_COL.IMAGE).getDisplayValue() || "").trim();
  sheet.getRange(rowNumber, INV_COL.IMAGE).setValue(imageUrl);
  sheet.getRange(rowNumber, INV_COL.UPDATED_AT).setValue(new Date());

  // Best-effort cleanup of an older Drive image created by this feature.
  const oldId = phase8DriveImageId_(oldValue);
  if (oldId) {
    try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) {}
  }

  return { success: true, imageUrl: imageUrl, fileId: file.getId(), manager: auth.managerName };
}

function removeInventoryPhotoPhase8(payload) {
  payload = payload || {};
  const auth = phase8RequireManager_(payload.managerPin);
  const code = String(payload.code || "").trim();
  const itemResult = getInventoryItemByCode(code);
  if (!itemResult || !itemResult.success || !itemResult.item) throw new Error("Inventory item not found.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.INVENTORY);
  const rowNumber = itemResult.item.rowNumber;
  const oldValue = String(sheet.getRange(rowNumber, INV_COL.IMAGE).getDisplayValue() || "").trim();
  sheet.getRange(rowNumber, INV_COL.IMAGE).clearContent();
  sheet.getRange(rowNumber, INV_COL.UPDATED_AT).setValue(new Date());

  const oldId = phase8DriveImageId_(oldValue);
  if (oldId) {
    try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) {}
  }A
  return { success: true, manager: auth.managerName };
}

function phase8DriveImageId_(value) {
  value = String(value || "");
  let m = value.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  m = value.match(/\/d\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : "";
}
