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
  const sourceLineId = String(options.sourceLineId || "").trim();
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

  try {
    logInventoryMovement({
      code: code,
      type: movementType,
      qtyChange: qtyChange,
      stockBefore: stockBefore,
      stockAfter: stockAfter,
      referenceId: referenceId,
      sourceLineId: sourceLineId,
      employee: employee,
      item: item,
      reason: reason,
      source: source,
      bundleNo: bundleNo,
      remainingBundleQty: remainingBundleQty,
      notes: notes
    });
    inventorySheet.getRange(inventoryRow, INV_COL.UPDATED_AT).setValue(new Date());
  } catch (movementError) {
    throw new Error("Inventory movement failed. " + (movementError && movementError.message ? movementError.message : String(movementError)));
  }

  SpreadsheetApp.flush();
  return { success: true, code: code, rowNumber: inventoryRow, qtyChange: qtyChange, stockBefore: stockBefore, stockAfter: stockAfter };
}

function changeInventoryStockBatch_(movements) {
  if (!Array.isArray(movements) || !movements.length) return [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);
  if (!inventorySheet || inventorySheet.getLastRow() < 2) throw new Error("Inventory is empty.");
  const inventoryRows = inventorySheet.getRange(2, 1, inventorySheet.getLastRow() - 1, INVENTORY_COLUMN_COUNT).getValues();
  const byCode = {};
  inventoryRows.forEach(function(row, index) {
    const code = String(row[INV_IDX.CODE] || "").trim();
    if (code && !byCode[code]) byCode[code] = {row:row, rowNumber:index + 2, stock:Number(row[INV_IDX.STOCK]) || 0};
  });

  let movementSheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  if (!movementSheet) {
    movementSheet = ss.insertSheet(SHEETS.INVENTORY_MOVEMENT_LOG);
    movementSheet.getRange(1, 1, 1, MOVEMENT_LOG_COLUMN_COUNT).setValues([[
      "Movement ID", "Timestamp", "Movement Source", "Reference ID", "Source Line ID",
      "Product Code", "Item Name", "Category", "Quantity Change", "Stock Before",
      "Stock After", "Employee", "Reason", "Bundle No.", "Remaining Bundle Qty", "Notes"
    ]]);
  }

  const now = new Date();
  const rows = [];
  const results = [];
  const touchedRows = {};
  movements.forEach(function(options) {
    options = options || {};
    const code = String(options.code || "").trim();
    const qtyChange = Number(options.qtyChange);
    const source = String(options.source || "").trim().toUpperCase();
    if (!code) throw new Error("Inventory Code is required.");
    if (!Number.isFinite(qtyChange) || qtyChange === 0) throw new Error("Stock quantity change must be a non-zero number.");
    if (!source) throw new Error("Inventory movement Source is required.");
    const target = byCode[code];
    if (!target) throw new Error("Inventory Code " + code + " was not found.");
    const stockBefore = target.stock;
    const stockAfter = stockBefore + qtyChange;
    target.stock = stockAfter;
    const type = getInventoryMovementType(target.row[INV_IDX.CATEGORY], target.row[INV_IDX.INVENTORY_TYPE]);
    rows.push([
      generateInventoryMovementId(), now, source, String(options.referenceId || "").trim(),
      String(options.sourceLineId || "").trim(), code, String(options.item || "").trim(), type,
      qtyChange, stockBefore, stockAfter, String(options.employee || "").trim(),
      String(options.reason || "").trim(), options.bundleNo === "" || options.bundleNo == null ? "" : options.bundleNo,
      options.remainingBundleQty === "" || options.remainingBundleQty == null ? "" : Number(options.remainingBundleQty),
      String(options.notes || "").trim()
    ]);
    touchedRows[target.rowNumber] = true;
    results.push({success:true, code:code, rowNumber:target.rowNumber, qtyChange:qtyChange, stockBefore:stockBefore, stockAfter:stockAfter});
  });
  movementSheet.getRange(movementSheet.getLastRow() + 1, 1, rows.length, MOVEMENT_LOG_COLUMN_COUNT).setValues(rows);
  const addresses = Object.keys(touchedRows).map(function(rowNumber) { return "Q" + rowNumber; });
  if (addresses.length && inventorySheet.getRangeList) inventorySheet.getRangeList(addresses).setValue(now);
  else Object.keys(touchedRows).forEach(function(rowNumber) { inventorySheet.getRange(Number(rowNumber), INV_COL.UPDATED_AT).setValue(now); });
  SpreadsheetApp.flush();
  return results;
}

function logInventoryMovement(movement) {
  if (!movement) throw new Error("Inventory movement data is required.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.INVENTORY_MOVEMENT_LOG);
    sheet.getRange(1, 1, 1, MOVEMENT_LOG_COLUMN_COUNT).setValues([[
      "Movement ID", "Timestamp", "Movement Source", "Reference ID", "Source Line ID",
      "Product Code", "Item Name", "Category", "Quantity Change",
      "Stock Before", "Stock After", "Employee", "Reason", "Bundle No.",
      "Remaining Bundle Qty", "Notes"
    ]]);
  }

  const movementId = String(movement.movementId || generateInventoryMovementId()).trim();
  const code = String(movement.code || "").trim();
  const type = String(movement.type || "").trim().toUpperCase();
  const qtyChange = Number(movement.qtyChange);
  const stockBefore = Number(movement.stockBefore) || 0;
  const stockAfter = Number(movement.stockAfter) || 0;
  const referenceId = String(movement.referenceId || "").trim();
  const sourceLineId = String(movement.sourceLineId || "").trim();
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

  const row = [movementId, new Date(), source, referenceId, sourceLineId, code, item, type, qtyChange, stockBefore, stockAfter, employee, reason, bundleNo, remainingBundleQty, notes];
  if (row.length !== MOVEMENT_LOG_COLUMN_COUNT) throw new Error("Inventory Movement row does not match A:P mapping.");
  sheet.appendRow(row);
  return true;
}

function getInventoryMovementType(category, inventoryType) {
  const normalizedCategory = String(category || "").trim().toUpperCase();
  const normalizedInventoryType = String(inventoryType || "").trim().toUpperCase();

  if (normalizedCategory === "YOURFINDS" || normalizedInventoryType === INVENTORY_TYPE.UNIQUE) return INVENTORY_MOVEMENT_TYPE.YOURFINDS;
  if (normalizedCategory === "PINS") return INVENTORY_MOVEMENT_TYPE.PINS;
  if (normalizedCategory === "OTHERS" || normalizedCategory === "WHOLE SALE") return INVENTORY_MOVEMENT_TYPE.OTHERS;
  throw new Error("Unable to determine Inventory Movement Type for category: " + normalizedCategory);
}

/* ==========================================================
   PHASE 8 - INVENTORY MANAGEMENT & STOCK OPERATIONS
========================================================== */

function requireManager_(pin, token) {
  if (token) return verifyInventoryManagerSession_(token);
  const auth = verifyManagerPin(pin);
  if (!auth || !auth.success) throw new Error(auth && auth.message ? auth.message : "Manager authorization failed.");
  return auth;
}

function adjustmentId_() {
  return "ADJ-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss") + "-" + Math.floor(100 + Math.random() * 900);
}

function getInventoryMovementHistoryByCode(code) {
  code = String(code || "").trim();
  if (!code) throw new Error("Inventory Code is required.");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  if (!sheet || sheet.getLastRow() < 2) return { success: true, movements: [] };
  const display = sheet.getRange(2, 1, sheet.getLastRow() - 1, MOVEMENT_LOG_COLUMN_COUNT).getDisplayValues();
  const movements = [];
  display.forEach(function(d) {
    if (String(d[MOVE_IDX.CODE] || "").trim() !== code) return;
    movements.push({
      movementId: String(d[MOVE_IDX.MOVEMENT_ID] || ""), timestamp: String(d[MOVE_IDX.TIMESTAMP] || ""), code: code,
      type: String(d[MOVE_IDX.TYPE] || ""), qtyChange: Number(String(d[MOVE_IDX.QTY_CHANGE] || "").replace(/,/g, "")) || 0,
      stockBefore: Number(String(d[MOVE_IDX.STOCK_BEFORE] || "").replace(/,/g, "")) || 0, stockAfter: Number(String(d[MOVE_IDX.STOCK_AFTER] || "").replace(/,/g, "")) || 0,
      referenceId: String(d[MOVE_IDX.REFERENCE_ID] || ""), sourceLineId: String(d[MOVE_IDX.SOURCE_LINE_ID] || ""), employee: String(d[MOVE_IDX.EMPLOYEE] || ""),
      item: String(d[MOVE_IDX.ITEM] || ""), reason: String(d[MOVE_IDX.REASON] || ""),
      source: String(d[MOVE_IDX.SOURCE] || ""), bundleNo: String(d[MOVE_IDX.BUNDLE_NO] || ""),
      remainingBundleQty: String(d[MOVE_IDX.REMAINING_BUNDLE_QTY] || ""), notes: String(d[MOVE_IDX.NOTES] || "")
    });
  });
  movements.reverse();
  return { success: true, movements: movements };
}

function adjustInventoryStock(payload) {
  payload = payload || {};
  const auth = requireManager_(payload.managerPin, payload.managerToken);
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
  const referenceId = adjustmentId_();
  const result = changeInventoryStock({
    code: code, qtyChange: direction === "ADD" ? qty : -qty,
    referenceId: referenceId, employee: employee || auth.managerName,
    item: item.name, reason: reason, source: INVENTORY_MOVEMENT_SOURCE.ADJUSTMENT,
    notes: "Authorized by: " + auth.managerName + (notes ? " | " + notes : "")
  });
  return { success: true, referenceId: referenceId, manager: auth.managerName, stockAfter: result.stockAfter };
}

function changeInventoryItem(payload) {
  payload = payload || {};

  const auth = requireManager_(payload.managerPin, payload.managerToken);
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

    fromBefore = Number(inv.getRange(fromItem.rowNumber, INV_COL.STOCK).getValue()) || 0;
    toBefore = Number(inv.getRange(toItem.rowNumber, INV_COL.STOCK).getValue()) || 0;

    if (fromBefore < qty) {
      throw new Error(
        "Insufficient source stock. Available: " + fromBefore + "."
      );
    }

    const fromAfter = fromBefore - qty;
    const toAfter = toBefore + qty;
    const referenceId = adjustmentId_();

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

function yourFindsDeliveryDateFromId_(deliveryId) {
  const match = /^YFD-(\d{4})(\d{2})(\d{2})-\d{3}$/i.exec(String(deliveryId || "").trim());
  if (!match) throw new Error("Source item has an invalid YourFinds Delivery ID.");
  return match[1] + "-" + match[2] + "-" + match[3];
}

function setConvertedInventoryStatus_(cell) {
  const validation = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      INVENTORY_STATUS.ACTIVE,
      INVENTORY_STATUS.INACTIVE,
      INVENTORY_STATUS.INCOMPLETE,
      INVENTORY_STATUS.CONVERTED,
      INVENTORY_STATUS.RETURNED
    ], true)
    .setAllowInvalid(false)
    .build();
  cell.setDataValidation(validation);
  cell.setValue(INVENTORY_STATUS.CONVERTED);
}

function convertYourFindsDeliveryItem(payload) {
  payload = payload || {};

  const sourceCode = String(payload.sourceCode || "").trim();
  const requestedDeliveryId = String(payload.deliveryId || "").trim().toUpperCase();
  const employee = String(payload.employee || "").trim();
  const notes = String(payload.notes || "").trim();

  if (!sourceCode) throw new Error("Source Product Code is required.");
  if (!employee) throw new Error("Employee is required.");
  const auth = requireManager_(payload.managerPin, payload.managerToken);

  const standardSizes = YOURFINDS_SIZE_ORDER.filter(function(size) { return size !== "CUSTOM"; });
  const rawTargets = Array.isArray(payload.targets) && payload.targets.length
    ? payload.targets
    : [{
        targetSize: payload.targetSize,
        customSize: payload.customSize,
        quantity: payload.resultQuantity
      }];
  const usedTargetSizes = {};
  let totalResultQuantity = 0;
  const targets = rawTargets.map(function(rawTarget, index) {
    rawTarget = rawTarget || {};
    const requestedTarget = normalizeYourFindsCustomSizeLabel_(rawTarget.targetSize);
    const customSize = normalizeYourFindsCustomSizeLabel_(rawTarget.customSize);
    const resultQuantity = Number(
      rawTarget.quantity === undefined ? rawTarget.resultQuantity : rawTarget.quantity
    );
    if (standardSizes.indexOf(requestedTarget) === -1 && requestedTarget !== "CUSTOM") {
      throw new Error("Select a valid YourFinds result size for item " + (index + 1) + ".");
    }
    const targetSize = requestedTarget === "CUSTOM" ? customSize : requestedTarget;
    if (!targetSize || (requestedTarget === "CUSTOM" && isStandardYourFindsSizeLabel_(targetSize))) {
      throw new Error("Enter a valid custom YourFinds size for item " + (index + 1) + ".");
    }
    if (!Number.isInteger(resultQuantity) || resultQuantity < 1 || resultQuantity > 999) {
      throw new Error("Each result quantity must be a whole number from 1 to 999.");
    }
    if (usedTargetSizes[targetSize]) {
      throw new Error("Combine duplicate result size " + targetSize + " into one item.");
    }
    usedTargetSizes[targetSize] = true;
    totalResultQuantity += resultQuantity;
    return {
      requestedTarget: requestedTarget,
      targetSize: targetSize,
      resultQuantity: resultQuantity,
      codes: []
    };
  });
  if (!targets.length) throw new Error("Add at least one result item.");
  if (totalResultQuantity > 999) {
    throw new Error("Total result quantity must not exceed 999.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);
  const movementSheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  const productMasterSheet = ss.getSheetByName(SHEETS.PRODUCT_MASTER);
  let sourceItem = null;
  let sourceStatus = "";
  let sourceUpdatedAt = "";
  let inventoryStartRow = 0;
  let movementStartRow = movementSheet ? movementSheet.getLastRow() : 0;
  const createdCustomProductRows = [];

  try {
    if (!inventorySheet) throw new Error("Inventory sheet not found.");
    if (!movementSheet) throw new Error("Inventory Movement Log sheet not found.");
    if (targets.some(function(target) { return target.requestedTarget === "CUSTOM"; }) && !productMasterSheet) {
      throw new Error("Product Master sheet not found.");
    }

    const sourceResult = getInventoryItemByCode(sourceCode);
    if (!sourceResult || !sourceResult.success || !sourceResult.item) {
      throw new Error("Source YourFinds item was not found.");
    }
    sourceItem = sourceResult.item;

    if (String(sourceItem.category || "").trim().toUpperCase() !== "YOURFINDS" ||
        String(sourceItem.inventoryType || "").trim().toUpperCase() !== INVENTORY_TYPE.UNIQUE) {
      throw new Error("Only unique YourFinds items can be converted.");
    }
    if (String(sourceItem.status || "").trim().toUpperCase() !== INVENTORY_STATUS.INCOMPLETE) {
      throw new Error("Only incomplete YourFinds items can be converted.");
    }
    if (Number(sourceItem.stock) !== 1) {
      throw new Error("Source YourFinds item must have stock 1.");
    }
    const sourceValues = inventorySheet.getRange(sourceItem.rowNumber, 1, 1, INVENTORY_COLUMN_COUNT).getValues()[0];
    sourceStatus = sourceValues[INV_IDX.STATUS];
    sourceUpdatedAt = sourceValues[INV_IDX.UPDATED_AT];

    const deliveryId = String(sourceItem.deliveryId || requestedDeliveryId).trim().toUpperCase();
    if (!deliveryId || (requestedDeliveryId && deliveryId !== requestedDeliveryId)) {
      throw new Error("Source Product Code does not belong to this delivery.");
    }
    const deliveryDate = yourFindsDeliveryDateFromId_(deliveryId);
    const sourceSize = String(sourceItem.size || "").trim().toUpperCase();
    if (!sourceSize) throw new Error("Source YourFinds item has no size.");

    const now = new Date();
    targets.forEach(function(target) {
      if (target.requestedTarget !== "CUSTOM") return;
      const customDefinition = ensureYourFindsCustomSizeDefinition_(productMasterSheet, target.targetSize, now);
      if (customDefinition.created) createdCustomProductRows.push(customDefinition.rowNumber);
    });

    const codeQuantities = {};
    targets.forEach(function(target) {
      codeQuantities[target.requestedTarget] =
        (codeQuantities[target.requestedTarget] || 0) + target.resultQuantity;
    });
    const codesBySize = {};
    Object.keys(codeQuantities).forEach(function(size) {
      codesBySize[size] = generateYourFindsDeliveryCodes(
        inventorySheet,
        deliveryDate,
        size,
        codeQuantities[size]
      );
      if (codesBySize[size].length !== codeQuantities[size]) {
        throw new Error("Unable to generate all result Product Codes.");
      }
    });
    const codeOffsets = {};
    targets.forEach(function(target) {
      const offset = codeOffsets[target.requestedTarget] || 0;
      target.codes = codesBySize[target.requestedTarget].slice(
        offset,
        offset + target.resultQuantity
      );
      codeOffsets[target.requestedTarget] = offset + target.resultQuantity;
    });
    const targetCodes = targets.reduce(function(codes, target) {
      return codes.concat(target.codes);
    }, []);

    inventoryStartRow = inventorySheet.getLastRow() + 1;
    const inventoryRows = [];
    targets.forEach(function(target) {
      target.codes.forEach(function(code) {
        inventoryRows.push([
          code, "", target.targetSize, "YourFinds", INVENTORY_TYPE.UNIQUE, INVENTORY_STATUS.INCOMPLETE,
          "", "", "", "", "", "", 0, 0, "", now, now
        ]);
      });
    });
    inventorySheet.getRange(inventoryStartRow, 1, inventoryRows.length, INVENTORY_COLUMN_COUNT).setValues(inventoryRows);
    setInventoryCalculatedFields_(inventorySheet, inventoryStartRow, inventoryRows.length);
    SpreadsheetApp.flush();

    const adjustmentId = adjustmentId_();
    const detail = {
      kind: "YOURFINDS_CONVERSION",
      deliveryId: deliveryId,
      sourceCode: sourceCode,
      fromSize: sourceSize,
      toSize: targets.length === 1 ? targets[0].targetSize : "",
      sourceQuantity: 1,
      resultQuantity: totalResultQuantity,
      authorizedBy: auth.managerName,
      targets: targets.map(function(target) {
        return {
          toSize: target.targetSize,
          resultQuantity: target.resultQuantity,
          targetCodes: target.codes.slice()
        };
      }),
      notes: notes
    };
    const movements = [{
      code: sourceCode,
      qtyChange: -1,
      referenceId: adjustmentId,
      sourceLineId: deliveryId,
      employee: employee,
      item: sourceItem.name || sourceSize,
      reason: "ITEM CONVERSION",
      source: INVENTORY_MOVEMENT_SOURCE.ADJUSTMENT,
      notes: JSON.stringify(Object.assign({}, detail, {targetCodes:targetCodes}))
    }];
    targets.forEach(function(target, targetGroupIndex) {
      target.codes.forEach(function(code, targetIndex) {
        movements.push({
          code: code,
          qtyChange: 1,
          referenceId: adjustmentId,
          sourceLineId: deliveryId,
          employee: employee,
          item: target.targetSize,
          reason: "ITEM CONVERSION",
          source: INVENTORY_MOVEMENT_SOURCE.ADJUSTMENT,
          notes: JSON.stringify(Object.assign({}, detail, {
            targetGroupIndex: targetGroupIndex + 1,
            targetIndex: targetIndex + 1
          }))
        });
      });
    });
    changeInventoryStockBatch_(movements);

    setConvertedInventoryStatus_(inventorySheet.getRange(sourceItem.rowNumber, INV_COL.STATUS));
    inventorySheet.getRange(sourceItem.rowNumber, INV_COL.UPDATED_AT).setValue(now);
    setInventoryCalculatedFields_(inventorySheet, sourceItem.rowNumber, 1);
    SpreadsheetApp.flush();

    return {
      success: true,
      adjustmentId: adjustmentId,
      deliveryId: deliveryId,
      sourceCode: sourceCode,
      sourceStatus: INVENTORY_STATUS.CONVERTED,
      fromSize: sourceSize,
      toSize: targets.length === 1 ? targets[0].targetSize : "",
      resultQuantity: totalResultQuantity,
      authorizedBy: auth.managerName,
      codes: targetCodes,
      targets: targets.map(function(target) {
        return {
          targetSize: target.targetSize,
          resultQuantity: target.resultQuantity,
          codes: target.codes.slice()
        };
      })
    };
  } catch (error) {
    try {
      if (movementSheet && movementSheet.getLastRow() > movementStartRow) {
        movementSheet.deleteRows(movementStartRow + 1, movementSheet.getLastRow() - movementStartRow);
      }
    } catch (movementRollbackError) {}
    try {
      if (inventoryStartRow && inventorySheet.getLastRow() >= inventoryStartRow) {
        inventorySheet.deleteRows(inventoryStartRow, inventorySheet.getLastRow() - inventoryStartRow + 1);
      }
    } catch (inventoryRollbackError) {}
    try {
      if (sourceItem && sourceStatus !== "") {
        inventorySheet.getRange(sourceItem.rowNumber, INV_COL.STATUS).setValue(sourceStatus);
        inventorySheet.getRange(sourceItem.rowNumber, INV_COL.UPDATED_AT).setValue(sourceUpdatedAt);
        setInventoryCalculatedFields_(inventorySheet, sourceItem.rowNumber, 1);
      }
    } catch (sourceRollbackError) {}
    try {
      createdCustomProductRows.sort(function(a, b) { return b - a; }).forEach(function(rowNumber) {
        productMasterSheet.deleteRow(rowNumber);
      });
    } catch (productRollbackError) {}
    SpreadsheetApp.flush();
    throw error;
  } finally {
    try { lock.releaseLock(); } catch (releaseError) {}
  }
}

function generateProductMasterCode_() {
  const usedCodes = {};
  getProductMaster_().forEach(function(product) {
    const code = String(product.productCode || "").trim();
    if (code) usedCodes[code] = true;
  });

  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!usedCodes[code]) return code;
  }

  throw new Error("Unable to generate a unique Product Code.");
}

function generateProductMasterCode() {
  return generateProductMasterCode_();
}

function costColumn_(sheet) {
  if (!sheet || sheet.getName() !== SHEETS.PRODUCT_MASTER) {
    throw new Error('Cost Price is stored only in Product Master.');
  }
  return PRODUCT_COL.COST_PRICE;
}
function prepareCostColumn_(sheet) {
  const column = costColumn_(sheet);
  if (sheet.getMaxColumns() < column) sheet.insertColumnsAfter(sheet.getMaxColumns(), column - sheet.getMaxColumns());
  const header = String(sheet.getRange(1, column).getValue() || '').trim();
  if (header && header.toLowerCase() !== 'cost price') throw new Error('The Cost Price column is already used by another field.');
  if (!header) sheet.getRange(1, column).setValue('Cost Price');
  return column;
}
function costPayload_(payload) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'costPrice')) return undefined;
  const auth = verifyInventoryManagerSession_(payload.managerToken);
  if (!auth || !auth.success) throw new Error('Sign in as a manager to change Cost Price.');
  if (payload.costPrice === '' || payload.costPrice === null) return '';
  const value = Number(payload.costPrice);
  if (!Number.isFinite(value) || value < 0) throw new Error('Cost Price must be a valid non-negative amount.');
  return value;
}
function readCostMap_(sheet, codeColumn) {
  const map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  const column = costColumn_(sheet);
  if (sheet.getMaxColumns() < column || String(sheet.getRange(1, column).getValue() || '').trim().toLowerCase() !== 'cost price') return map;
  const codes = sheet.getRange(2, codeColumn, sheet.getLastRow()-1, 1).getDisplayValues();
  const values = sheet.getRange(2, column, sheet.getLastRow()-1, 1).getValues();
  codes.forEach(function(row, i) {
    const raw = values[i][0], value = Number(raw);
    map[String(row[0]).trim()] = raw === '' || raw === null || !Number.isFinite(value) || value < 0 ? null : value;
  });
  return map;
}
function readYourFindsCostBySize_() {
  const map = {};
  getProductMaster_().forEach(function(product) {
    if (String(product.category || '').trim().toUpperCase() !== 'YOURFINDS') return;
    const size = normalizeYourFindsSaleSize_(product.description);
    const raw = product.costPrice;
    const value = Number(raw);
    // Nonstandard sizes have individual costs, never the CUSTOM template cost.
    if (size !== 'CUSTOM') map[size] = raw === '' || raw === null || !Number.isFinite(value) || value < 0 ? null : value;
  });
  return map;
}
// Optional R column; leave the existing A:Q inventory schema unchanged.
function customCostColumn_(sheet, create) {
  const column = 18;
  if (sheet.getMaxColumns() < column) {
    if (!create) return null;
    sheet.insertColumnsAfter(sheet.getMaxColumns(), column - sheet.getMaxColumns());
  }
  const header = String(sheet.getRange(1, column).getValue() || '').trim();
  if (header && header !== 'Custom Cost Price') throw new Error('Inventory column R is already used. Custom Cost Price requires a free column R.');
  if (!header) {
    if (!create) return null;
    if (sheet.getLastRow() > 1 && sheet.getRange(2, column, sheet.getLastRow()-1, 1).getValues().some(row => row[0] !== '' && row[0] !== null)) {
      throw new Error('Inventory column R contains data. Move it before adding Custom Cost Price.');
    }
    sheet.getRange(1, column).setValue('Custom Cost Price');
  }
  return column;
}
function readCustomCosts_(sheet) {
  const map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  const column = customCostColumn_(sheet, false);
  if (!column) return map;
  const rowCount = sheet.getLastRow()-1;
  const codes = sheet.getRange(2, INV_COL.CODE, rowCount, 1).getDisplayValues();
  const values = sheet.getRange(2, column, rowCount, 1).getValues();
  codes.forEach(function(row, index) {
    const raw = values[index][0], value = Number(raw);
    map[String(row[0]).trim()] = raw === '' || raw === null || !Number.isFinite(value) || value < 0 ? null : value;
  });
  return map;
}

function ensureProductMasterInventoryRows_(products) {
  const stockProducts = (products || []).filter(function(product) {
    const category = String(product.category || '').trim().toUpperCase();
    return (category === 'PINS' || category === 'OTHERS') && String(product.productCode || '').trim();
  });
  if (!stockProducts.length) return 0;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.INVENTORY);
  if (!sheet) throw new Error('Inventory sheet not found.');

  function missingProducts() {
    const existing = new Set();
    if (sheet.getLastRow() >= 2) {
      sheet.getRange(2, INV_COL.CODE, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(function(row) {
        const code = String(row[0] || '').trim();
        if (code) existing.add(code);
      });
    }
    return stockProducts.filter(function(product) {
      const code = String(product.productCode || '').trim();
      if (existing.has(code)) return false;
      existing.add(code);
      return true;
    });
  }

  if (!missingProducts().length) return 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const missing = missingProducts();
    if (!missing.length) return 0;
    const startRow = sheet.getLastRow() + 1;
    const requiredLastRow = startRow + missing.length - 1;
    if (typeof sheet.getMaxRows === 'function' && typeof sheet.insertRowsAfter === 'function' && sheet.getMaxRows() < requiredLastRow) {
      sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
    }
    const now = new Date();
    const rows = missing.map(function(product) {
      const status = String(product.status || '').trim().toUpperCase();
      const active = status !== PRODUCT_STATUS.DEACTIVATED && product.active !== false;
      return [
        String(product.productCode || '').trim(), String(product.description || '').trim(), '',
        normalizeInventoryCategoryValue_(product.category), INVENTORY_TYPE.STOCK,
        active ? INVENTORY_STATUS.ACTIVE : INVENTORY_STATUS.INACTIVE,
        '', '', '', '', '', '', Number(product.defaultPrice) || 0, '',
        String(product.imageUrl || '').trim(), now, now
      ];
    });
    sheet.getRange(startRow, 1, rows.length, INVENTORY_COLUMN_COUNT).setValues(rows);
    setInventoryCalculatedFields_(sheet, startRow, rows.length);
    SpreadsheetApp.flush();
    return rows.length;
  } finally {
    lock.releaseLock();
  }
}
function saveYourFindsCustomCost(payload) {
  payload = payload || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const cost = costPayload_(payload);
    if (cost === undefined) throw new Error('Custom Cost Price is required; use blank for unknown.');
    const code = String(payload.code || '').trim();
    const item = getFullInventory().find(row => String(row.code) === code);
    if (!item || String(item.category).toUpperCase() !== 'YOURFINDS' || normalizeYourFindsSaleSize_(item.size) !== 'CUSTOM') {
      throw new Error('Individual costs are only for nonstandard YourFinds sizes.');
    }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY);
    const column = customCostColumn_(sheet, true);
    sheet.getRange(item.rowNumber, column).setValue(cost);
    sheet.getRange(item.rowNumber, INV_COL.UPDATED_AT).setValue(new Date());
    return {success:true};
  } finally { lock.releaseLock(); }
}
function getInventoryForManagement(managerToken) {
  const products = getProductMaster_();
  if (!managerToken) return getFullInventory({products:products, includeDeliveryMetadata:false}).filter(function(item) {
    return String(item.productStatus || PRODUCT_STATUS.ACTIVE).toUpperCase() !== PRODUCT_STATUS.DEACTIVATED;
  });
  const auth = verifyInventoryManagerSession_(managerToken);
  if (!auth || !auth.success) throw new Error('Manager session expired. Sign in again.');
  ensureProductMasterInventoryRows_(products);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stockCosts = {};
  const uniqueCosts = {};
  products.forEach(function(product) {
    const raw = product.costPrice;
    const value = raw === null || raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0 ? null : Number(raw);
    stockCosts[String(product.productCode || '').trim()] = value;
    if (String(product.category || '').trim().toUpperCase() !== 'YOURFINDS') return;
    const size = normalizeYourFindsSaleSize_(product.description);
    if (size !== 'CUSTOM') uniqueCosts[size] = value;
  });
  const customCosts = readCustomCosts_(ss.getSheetByName(SHEETS.INVENTORY));
  return getFullInventory({products:products, includeDeliveryMetadata:false}).map(function(item) {
    const yourFinds = String(item.category).toUpperCase() === 'YOURFINDS';
    const size = yourFinds ? normalizeYourFindsSaleSize_(item.size) : '';
    const key = yourFinds && size !== 'CUSTOM' ? size : item.code;
    const map = yourFinds ? (size === 'CUSTOM' ? customCosts : uniqueCosts) : stockCosts;
    item.costPrice = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
    if (yourFinds) item.costSource = size === 'CUSTOM' ? 'CUSTOM' : 'SIZE';
    return item;
  });
}
function getProductMasterForManagement(managerToken) {
  if (!managerToken) return getProductMaster_().map(publicProduct_);
  const auth = verifyInventoryManagerSession_(managerToken);
  if (!auth || !auth.success) throw new Error('Manager session expired. Sign in again.');
  return getProductMaster_();
}

function saveProductMaster(payload) {
  payload = payload || {};
  requireManager_(payload.managerPin, payload.managerToken);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return saveProductMasterLocked_(payload); }
  finally { lock.releaseLock(); }
}

function saveProductMasterLocked_(payload) {
  payload = payload || {};
  let code = String(payload.productCode || "").trim();
  const description = String(payload.description || "").trim();
  const category = String(payload.category || "").trim().toUpperCase();
  const defaultPrice = Number(payload.defaultPrice), lowStockAt = Number(payload.lowStockAt);
  const costPrice = costPayload_(payload);
  const requestedStatus = String(payload.status || "").trim().toUpperCase();
  if (!description) throw new Error("Description is required.");
  if (category !== "PINS" && category !== "OTHERS") throw new Error("Category must be PINS or OTHERS.");
  if (!Number.isFinite(defaultPrice) || defaultPrice < 0) throw new Error("Prices must be valid non-negative numbers.");
  if (!Number.isInteger(lowStockAt) || lowStockAt < 0) throw new Error("Low Stock At must be a non-negative whole number.");
  const ss = SpreadsheetApp.getActiveSpreadsheet(); const sheet = ss.getSheetByName(SHEETS.PRODUCT_MASTER);
  if (!sheet) throw new Error("Product Master sheet not found.");
  const products = getProductMaster_();
  const existing = code
    ? products.find(function(p){ return String(p.productCode) === code; })
    : null;
  const storedCostPrice = existing && existing.costPrice !== null ? Number(existing.costPrice) || 0 : "";
  if (costPrice !== undefined) prepareCostColumn_(sheet);

  if (!existing && !code) {
    code = generateProductMasterCode_();
  }
  if (payload.isNew === true && existing) throw new Error("This barcode is already in use. Reopen Add Product to generate another.");
  if (payload.isNew === false && !existing) throw new Error("Product Master entry no longer exists. Reload inventory.");
  if (!existing && getFullInventory().some(function(item) { return String(item.code) === code; })) {
    throw new Error("This barcode already exists in Inventory. Reopen Add Product.");
  }
  const active = existing
    ? existing.active !== false
    : true;
  const status = requestedStatus || (existing ? existing.status : PRODUCT_STATUS.ACTIVE);
  if ([PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.DEACTIVATED, PRODUCT_STATUS.ON_SALE].indexOf(status) === -1) {
    throw new Error("Status must be ACTIVE, DEACTIVATED, or ON SALE.");
  }
  const submittedPrices = Array.isArray(payload.salePrices) ? payload.salePrices : [{
    price: payload.salePrice, quantity: payload.saleQuantity, end: payload.saleEnd
  }];
  if (status === PRODUCT_STATUS.ON_SALE && !submittedPrices.length) throw new Error("Add at least one sale price.");
  const oldPrices = existing && Array.isArray(existing.salePrices) ? existing.salePrices : [];
  const salePrices = status === PRODUCT_STATUS.ON_SALE ? submittedPrices.map(function(input, index) {
    const price = input.price === "" || input.price == null ? NaN : Number(input.price);
    const quantity = input.quantity === "" || input.quantity == null ? null : Number(input.quantity);
    const end = String(input.end || "").slice(0, 10);
    if (!Number.isFinite(price) || price < 0) throw new Error("Sale price " + (index + 1) + " is invalid.");
    if (quantity !== null && (!Number.isInteger(quantity) || quantity < 1)) {
      throw new Error("Sale quantity " + (index + 1) + " must be a positive whole number.");
    }
    if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error("Sale end date is invalid.");
    const prior = oldPrices.find(function(tier) { return tier.referenceId === String(input.referenceId || ""); }) || oldPrices[index];
    const unchanged = prior && prior.price === price && prior.quantity === quantity && prior.end === end;
    let referenceId = unchanged ? prior.referenceId : generateProductSaleReferenceId_() + "-" + (index + 1);
    while (!unchanged && oldPrices.some(function(tier) { return tier.referenceId === referenceId; })) {
      referenceId = generateProductSaleReferenceId_() + "-" + (index + 1);
    }
    return {price: price, quantity: quantity,
      remaining: quantity === null ? null : (unchanged ? Math.min(prior.remaining, quantity) : quantity),
      end: end, referenceId: referenceId};
  }) : [];
  if (salePrices.length > 1 && salePrices.some(function(tier) { return tier.quantity === null; })) {
    throw new Error("Enter a quantity for every sale price when using multiple prices.");
  }
  if (new Set(salePrices.map(function(tier) { return tier.price; })).size !== salePrices.length) {
    throw new Error("Each sale row needs a different price.");
  }
  const saleSettingsChanged = !existing || existing.status !== status ||
    JSON.stringify(oldPrices) !== JSON.stringify(salePrices);
  const firstSale = salePrices[0] || null;
  const salePrice = firstSale ? firstSale.price : null;
  const saleQuantity = firstSale ? firstSale.quantity : null;
  const saleRemaining = firstSale ? firstSale.remaining : null;
  const saleEnd = firstSale ? firstSale.end : "";
  const saleReferenceId = firstSale ? firstSale.referenceId : "";
  const compatibilityActive = status !== PRODUCT_STATUS.DEACTIVATED;
  const inv = ss.getSheetByName(SHEETS.INVENTORY);
  let inventoryRow = 0;
  let inventoryStock = 0;
  let inventoryCreated = false;
  if (inv && inv.getLastRow() >= 2) {
    const codes = inv.getRange(2, INV_COL.CODE, inv.getLastRow() - 1, 1).getDisplayValues();
    for (let i = 0; i < codes.length; i++) if (String(codes[i][0]).trim() === code) {
      inventoryRow = i + 2;
      inventoryStock = Number(inv.getRange(inventoryRow, INV_COL.STOCK).getValue()) || 0;
      break;
    }
  }
  if (!existing && !inv) throw new Error("Inventory sheet not found.");
  const totalAllocated = salePrices.reduce(function(total, tier) { return total + (tier.remaining || 0); }, 0);
  if (status === PRODUCT_STATUS.ON_SALE && totalAllocated > Math.max(0, inventoryStock)) {
    throw new Error("Sale quantities cannot exceed current stock of " + Math.max(0, inventoryStock) + ".");
  }
  if (status === PRODUCT_STATUS.ON_SALE) ensureProductSalePricesColumn_(sheet);
  const imageDataUrl = String(payload.imageDataUrl || "").trim();
  const imageFileName = String(payload.imageFileName || "product-photo").trim();
  const createdImage = imageDataUrl
    ? createInventoryImage_(code, imageFileName, decodeInventoryImage_(imageDataUrl))
    : null;
  const imageUrl = createdImage ? createdImage.imageUrl : (existing ? String(existing.imageUrl || "") : "");
  const now = new Date();
  if (existing) {
    sheet.getRange(existing.rowNumber, PRODUCT_COL.DESCRIPTION, 1, 7).setValues([[
      description, category, INVENTORY_TYPE.STOCK, defaultPrice,
      costPrice !== undefined ? costPrice : storedCostPrice, lowStockAt, compatibilityActive
    ]]);
    sheet.getRange(existing.rowNumber, PRODUCT_COL.UPDATED_AT).setValue(now);
    sheet.getRange(existing.rowNumber, PRODUCT_COL.IMAGE).setValue(imageUrl);
    if (status === PRODUCT_STATUS.DEACTIVATED) {
      sheet.getRange(existing.rowNumber, PRODUCT_COL.STATUS).setValue(status);
      sheet.getRange(existing.rowNumber, PRODUCT_COL.SALE_PRICE, 1, 5).clearContent();
      if (hasProductSalePricesColumn_(sheet)) sheet.getRange(existing.rowNumber, PRODUCT_COL.SALE_PRICES).clearContent();
    } else writeProductSalePrices_(sheet, existing.rowNumber, salePrices);
  } else {
    sheet.appendRow([code, description, category, INVENTORY_TYPE.STOCK, defaultPrice,
      costPrice !== undefined ? costPrice : "", lowStockAt, compatibilityActive, imageUrl, now, now,
      status,
      status === PRODUCT_STATUS.ON_SALE ? salePrice : "",
      status === PRODUCT_STATUS.ON_SALE && saleQuantity !== null ? saleQuantity : "",
      status === PRODUCT_STATUS.ON_SALE && saleRemaining !== null ? saleRemaining : "",
      status === PRODUCT_STATUS.ON_SALE ? saleEnd : "",
      saleReferenceId
    ]);
    if (status === PRODUCT_STATUS.ON_SALE) writeProductSalePrices_(sheet, sheet.getLastRow(), salePrices);
  }
  if (inv && !inventoryRow) {
    inventoryRow = inv.getLastRow() + 1;
    inv.getRange(inventoryRow, 1, 1, INVENTORY_COLUMN_COUNT).setValues([[
      code, description, "", normalizeInventoryCategoryValue_(category), INVENTORY_TYPE.STOCK,
      compatibilityActive ? INVENTORY_STATUS.ACTIVE : INVENTORY_STATUS.INACTIVE,
      "", "", "", "", "", "", defaultPrice, "", imageUrl, now, now
    ]]);
    setInventoryCalculatedFields_(inv, inventoryRow, 1);
    inventoryCreated = true;
  }
  // Sync safe metadata into existing STOCK Inventory row if present.
  if (inv && inventoryRow && !inventoryCreated) {
      const r = inventoryRow;
      if (imageUrl) inv.getRange(r, INV_COL.IMAGE).setValue(imageUrl);
      inv.getRange(r, INV_COL.DESCRIPTION).setValue(description);
      inv.getRange(r, INV_COL.YS_PRICE).setValue(defaultPrice);
      inv.getRange(r, INV_COL.CATEGORY).setValue(normalizeInventoryCategoryValue_(category));
      inv.getRange(r, INV_COL.STATUS).setValue(compatibilityActive ? INVENTORY_STATUS.ACTIVE : INVENTORY_STATUS.INACTIVE);
      inv.getRange(r, INV_COL.UPDATED_AT).setValue(now);
      if (saleSettingsChanged) {
        logProductStatusChange_({
          code: code,
          item: description,
          category: category,
          inventoryType: INVENTORY_TYPE.STOCK,
          stock: inventoryStock,
          employee: authNameFromPayload_(payload),
          referenceId: saleReferenceId || String(existing && existing.saleReferenceId || ""),
          previousStatus: existing ? existing.status : "",
          status: status,
          salePrice: salePrice,
          saleQuantity: saleQuantity,
          saleRemaining: saleRemaining,
          saleEnd: saleEnd
        });
      }
  }
  return {
    success: true, productCode: code, description: description, category: category,
    defaultPrice: defaultPrice, lowStockAt: lowStockAt, status: status,
    inventoryStatus: compatibilityActive ? INVENTORY_STATUS.ACTIVE : INVENTORY_STATUS.INACTIVE,
    salePrice: status === PRODUCT_STATUS.ON_SALE ? salePrice : null,
    saleQuantity: status === PRODUCT_STATUS.ON_SALE ? saleQuantity : null,
    saleRemaining: status === PRODUCT_STATUS.ON_SALE ? saleRemaining : null,
    saleEnd: status === PRODUCT_STATUS.ON_SALE ? saleEnd : "",
    saleReferenceId: saleReferenceId, salePrices: salePrices, imageUrl: imageUrl,
    rowNumber: inventoryRow, inventoryCreated: inventoryCreated,
    inventoryType: INVENTORY_TYPE.STOCK, size: "", stock: inventoryStock,
    stockStatus: inventoryStock < 0 ? "NEGATIVE STOCK" : (inventoryStock === 0 ? "SOLD OUT" : "IN STOCK")
  };
}

function generateProductSaleReferenceId_() {
  return "SALECFG-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss") + "-" + Math.floor(100 + Math.random() * 900);
}

function authNameFromPayload_(payload) {
  payload = payload || {};
  const token = String(payload.managerToken || "").trim();
  if (token) {
    const auth = verifyInventoryManagerSession_(token);
    return auth && auth.success ? String(auth.managerName || "Manager") : "Manager";
  }
  return String(payload.employee || "Manager").trim() || "Manager";
}

function logProductStatusChange_(event) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const movementSheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  if (!movementSheet) return;
  const notes = [
    "Status: " + (event.previousStatus || "NEW") + " → " + event.status,
    event.status === PRODUCT_STATUS.ON_SALE ? "Sale price: " + event.salePrice : "",
    event.status === PRODUCT_STATUS.ON_SALE ? "Sale quantity: " + (event.saleQuantity === null ? "ALL" : event.saleQuantity) : "",
    event.status === PRODUCT_STATUS.ON_SALE && event.saleEnd ? "Sale end: " + event.saleEnd : ""
  ].filter(Boolean).join(" | ");
  movementSheet.appendRow([
    generateInventoryMovementId(), new Date(), INVENTORY_MOVEMENT_SOURCE.PRODUCT_STATUS,
    String(event.referenceId || ""), "", String(event.code || ""), String(event.item || ""),
    getInventoryMovementType(event.category, event.inventoryType), 0, Number(event.stock) || 0,
    Number(event.stock) || 0, String(event.employee || "Manager"), "PRODUCT STATUS CHANGE", "", "", notes
  ]);
}

function setInventoryAdministrativeStatus(payload) {
  payload = payload || {};
  const auth = requireManager_(payload.managerPin, payload.managerToken);
  const code = String(payload.code || "").trim();
  const requested = String(payload.status || "").trim().toUpperCase();
  const status = requested === "INACTIVE" ? "DEACTIVATED" : requested;
  if (["ACTIVE", "DEACTIVATED"].indexOf(status) === -1) throw new Error("Status must be ACTIVE or DEACTIVATED.");
  const inventoryStatus = status === "ACTIVE" ? INVENTORY_STATUS.ACTIVE : INVENTORY_STATUS.INACTIVE;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.INVENTORY);
    let inventoryRow = Number(payload.rowNumber) || 0;
    let item;
    if (!inventoryRow) {
      const result = getInventoryItemByCode(code);
      if (!result.success) throw new Error(result.message || "Inventory item not found.");
      item = result.item;
      inventoryRow = item.rowNumber;
    } else {
      let values = inventoryRow >= 2 && inventoryRow <= sheet.getLastRow()
        ? sheet.getRange(inventoryRow, 1, 1, INVENTORY_COLUMN_COUNT).getValues()[0]
        : null;
      if (!values || String(values[INV_IDX.CODE] || "").trim() !== code) {
        const codes = sheet.getRange(2, INV_COL.CODE, sheet.getLastRow() - 1, 1).getDisplayValues();
        inventoryRow = codes.findIndex(function(row) { return String(row[0] || "").trim() === code; }) + 2;
        if (inventoryRow < 2) throw new Error("Inventory item not found.");
        values = sheet.getRange(inventoryRow, 1, 1, INVENTORY_COLUMN_COUNT).getValues()[0];
      }
      item = {
        rowNumber: inventoryRow, code: code, name: String(values[INV_IDX.DESCRIPTION] || "").trim(),
        size: String(values[INV_IDX.SIZE] || "").trim(), category: String(values[INV_IDX.CATEGORY] || "").trim(),
        inventoryType: String(values[INV_IDX.INVENTORY_TYPE] || "").trim().toUpperCase(),
        status: String(values[INV_IDX.STATUS] || "").trim().toUpperCase(), stock: Number(values[INV_IDX.STOCK]) || 0
      };
    }
    if (![INVENTORY_STATUS.ACTIVE, INVENTORY_STATUS.INACTIVE].includes(String(item.status).toUpperCase())) {
      throw new Error("Only active or inactive items can be changed here. Complete unfinished items first.");
    }
    if (String(item.category).toUpperCase() === "YOURFINDS" && String(item.inventoryType).toUpperCase() === INVENTORY_TYPE.UNIQUE && inventoryStatus === INVENTORY_STATUS.ACTIVE) {
      assertCompletedYourFinds_(item);
    }
    const masterSheet = ss.getSheetByName(SHEETS.PRODUCT_MASTER);
    let master = null;
    let masterRange = null;
    let masterRollback = null;
    const productRowNumber = Number(payload.productRowNumber) || 0;
    if (masterSheet && productRowNumber >= 2 && productRowNumber <= masterSheet.getLastRow()) {
      const masterValues = masterSheet.getRange(productRowNumber, 1, 1, PRODUCT_MASTER_COLUMN_COUNT).getValues()[0];
      if (String(masterValues[PRODUCT_IDX.PRODUCT_CODE] || "").trim() === code) master = {
        rowNumber:productRowNumber,
        active:masterValues[PRODUCT_IDX.ACTIVE] === true || String(masterValues[PRODUCT_IDX.ACTIVE]).toUpperCase() === "TRUE",
        status:String(masterValues[PRODUCT_IDX.STATUS] || "ACTIVE").trim().toUpperCase(),
        saleReferenceId:String(masterValues[PRODUCT_IDX.SALE_REFERENCE_ID] || "").trim()
      };
    }
    if (!master && masterSheet) master = getProductMaster_().find(function(product) { return String(product.productCode) === code; });
    if (master) {
      const lastMasterColumn = hasProductSalePricesColumn_(masterSheet)
        ? PRODUCT_COL.SALE_PRICES : PRODUCT_COL.SALE_REFERENCE_ID;
      masterRange = masterSheet.getRange(master.rowNumber, PRODUCT_COL.ACTIVE, 1, lastMasterColumn - PRODUCT_COL.ACTIVE + 1);
      masterRollback = masterRange.getValues()[0];
      const masterUpdate = masterRollback.slice();
      masterUpdate[PRODUCT_COL.ACTIVE - PRODUCT_COL.ACTIVE] = status === "ACTIVE";
      masterUpdate[PRODUCT_COL.UPDATED_AT - PRODUCT_COL.ACTIVE] = new Date();
      masterUpdate[PRODUCT_COL.STATUS - PRODUCT_COL.ACTIVE] = status;
      for (let column = PRODUCT_COL.SALE_PRICE; column <= PRODUCT_COL.SALE_REFERENCE_ID; column++) {
        masterUpdate[column - PRODUCT_COL.ACTIVE] = "";
      }
      if (lastMasterColumn === PRODUCT_COL.SALE_PRICES) masterUpdate[PRODUCT_COL.SALE_PRICES - PRODUCT_COL.ACTIVE] = "";
      masterRange.setValues([masterUpdate]);
    }
    try {
      sheet.getRange(inventoryRow, INV_COL.STATUS).setValue(inventoryStatus);
      sheet.getRange(inventoryRow, INV_COL.UPDATED_AT).setValue(new Date());
      if (master) logProductStatusChange_({
        code: code, item: item.name, category: item.category, inventoryType: item.inventoryType,
        stock: item.stock, employee: auth.managerName, referenceId: master && master.saleReferenceId,
        previousStatus: master ? master.status : String(item.status || ""), status: status,
        salePrice: null, saleQuantity: null, saleRemaining: null, saleEnd: ""
      });
    }
    catch (error) {
      if (masterRange && masterRollback) masterRange.setValues([masterRollback]);
      throw error;
    }
    return { success: true, status: requested === "INACTIVE" ? "INACTIVE" : status, productStatus: status, inventoryStatus: inventoryStatus, manager: auth.managerName };
  } finally { lock.releaseLock(); }
}

// Delete only unused records. Historical rows remain available to receipts,
// exchanges, delivery reports and stock movement reconciliation.
function deleteUnusedInventoryItem(payload) {
  payload = payload || {};
  requireManager_(payload.managerPin, payload.managerToken);
  const code = String(payload.code || "").trim();
  if (!code) throw new Error("Inventory Code is required.");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const matches = getFullInventory().filter(function(item) { return String(item.code) === code; });
    if (matches.length !== 1) throw new Error("Item is missing or its barcode is duplicated. Reload inventory.");
    const item = matches[0];
    if (Number(item.stock) !== 0) throw new Error("Only zero-stock items can be deleted. Use a stock adjustment first.");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const excluded = [SHEETS.INVENTORY, SHEETS.PRODUCT_MASTER, SHEETS.EMPLOYEES];
    ss.getSheets().forEach(function(sheet) {
      if (excluded.includes(sheet.getName()) || sheet.getLastRow() < 2) return;
      const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getDisplayValues();
      if (rows.some(function(row) { return row.some(function(value) { return String(value).includes(code); }); })) {
        throw new Error("This item has existing records and cannot be deleted. Set it to Inactive instead.");
      }
    });
    const master = getProductMaster_().find(function(product) { return String(product.productCode) === code; });
    const masterSheet = ss.getSheetByName(SHEETS.PRODUCT_MASTER);
    ss.getSheetByName(SHEETS.INVENTORY).deleteRow(item.rowNumber);
    if (master && masterSheet) masterSheet.deleteRow(master.rowNumber);
    return { success: true, code: code };
  } finally { lock.releaseLock(); }
}

/* ==========================================================
   PHASE 8 - INVENTORY PHOTO MANAGEMENT
   Inventory Column A is the image source of truth.
========================================================== */

const PHASE8_PRODUCT_IMAGES_FOLDER_ID = "1Jm-OdXcmg17KgHW5Ed_NRwwTKvrbpWC3";

function decodeInventoryImage_(dataUrl) {
  dataUrl = String(dataUrl || "").trim();
  if (!dataUrl) return null;

  const match = dataUrl.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data.");
  const mimeType = match[1];
  if (["image/jpeg", "image/png", "image/webp"].indexOf(mimeType) === -1) {
    throw new Error("Use JPG, PNG, or WEBP images only.");
  }

  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller.");
  return { bytes: bytes, mimeType: mimeType };
}

function createInventoryImage_(code, originalName, decodedImage) {
  const folder = DriveApp.getFolderById(PHASE8_PRODUCT_IMAGES_FOLDER_ID);
  const safeName = String(originalName || "photo").replace(/[^A-Za-z0-9._-]+/g, "_");
  const blob = Utilities.newBlob(
    decodedImage.bytes,
    decodedImage.mimeType,
    code + "_" + Date.now() + "_" + safeName
  );
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    file: file,
    imageUrl: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1200"
  };
}

function isYourFindsUnique_(item) {
  return String(item && item.category || "").trim().toUpperCase() === "YOURFINDS" &&
    String(item && item.inventoryType || "").trim().toUpperCase() === INVENTORY_TYPE.UNIQUE;
}

function assertCompletedYourFinds_(item) {
  if (!String(item && item.imageUrl || "").trim()) {
    throw new Error("A product picture is required before this YourFinds item can be active.");
  }
  if (!String(item && item.name || "").trim()) {
    throw new Error("Description is required before this YourFinds item can be active.");
  }
  if (!(Number(item && item.price) > 0)) {
    throw new Error("Selling Price must be greater than zero before this YourFinds item can be active.");
  }
  if (!String(item && item.size || "").trim()) {
    throw new Error("Size is required before this YourFinds item can be active.");
  }
}

/*
 * Completes a newly received YourFinds item, or edits a completed one.
 * Code, size, stock, category, type, and delivery metadata stay immutable.
 */
function saveYourFindsItemDetails(payload) {
  payload = payload || {};
  const costPrice = costPayload_(payload);
  const code = String(payload.code || "").trim();
  const description = String(payload.description || "").trim();
  const hasOriginalPrice = Object.prototype.hasOwnProperty.call(payload, "originalPrice");
  const requestedOriginalPrice = Number(payload.originalPrice);
  const sellingPrice = Number(payload.sellingPrice);
  const decodedImage = decodeInventoryImage_(payload.dataUrl);
  const originalName = String(payload.fileName || "photo").trim();

  if (!code) throw new Error("Inventory Code is required.");
  if (!description) throw new Error("Description is required.");
  if (description.length > 120) throw new Error("Description must be 120 characters or fewer.");
  if (hasOriginalPrice && (!Number.isFinite(requestedOriginalPrice) || requestedOriginalPrice < 0)) {
    throw new Error("Original Price must be a valid non-negative amount.");
  }
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    throw new Error("Selling Price must be greater than zero.");
  }

  let createdImage = null;
  let oldImageUrl = "";
  let inventorySaved = false;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const itemResult = getYourFindsItemForCompletion(code);
    if (!itemResult || !itemResult.success || !itemResult.item) {
      throw new Error(itemResult && itemResult.message ? itemResult.message : "YourFinds item not found.");
    }

    const item = itemResult.item;
    if (costPrice !== undefined && normalizeYourFindsSaleSize_(item.size) !== 'CUSTOM') {
      throw new Error('Standard YourFinds sizes use Product Master cost. Edit the shared size cost there.');
    }
    // Omitted original prices retain their stored value.
    const originalPrice = hasOriginalPrice ? requestedOriginalPrice : (Number(item.origPrice) || 0);
    const currentStatus = String(item.status || "").trim().toUpperCase();
    if ([INVENTORY_STATUS.INCOMPLETE, INVENTORY_STATUS.ACTIVE, INVENTORY_STATUS.INACTIVE].indexOf(currentStatus) === -1) {
      throw new Error("This YourFinds item cannot be edited here.");
    }

    /*
     * Receiving staff may complete a new item without manager approval.
     * Corrections to an already completed item remain manager-controlled.
     */
    const auth = currentStatus === INVENTORY_STATUS.INCOMPLETE
      ? null
      : requireManager_(payload.managerPin, payload.managerToken);

    oldImageUrl = String(item.imageUrl || "").trim();
    const inventorySheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY);
    if (!inventorySheet) throw new Error('Inventory sheet not found.');
    const customCostColumn = costPrice !== undefined ? customCostColumn_(inventorySheet, true) : null;
    if (decodedImage) {
      createdImage = createInventoryImage_(code, originalName, decodedImage);
    }
    const finalImageUrl = createdImage ? createdImage.imageUrl : oldImageUrl;
    if (!finalImageUrl) throw new Error("A product picture is required to complete this YourFinds item.");

    const completedItem = {
      imageUrl: finalImageUrl,
      name: description,
      price: sellingPrice,
      size: item.size
    };
    assertCompletedYourFinds_(completedItem);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.INVENTORY);
    if (!sheet) throw new Error("Inventory sheet not found.");

    const finalStatus = currentStatus === INVENTORY_STATUS.INCOMPLETE
      ? INVENTORY_STATUS.ACTIVE
      : currentStatus;
    sheet.getRange(item.rowNumber, INV_COL.IMAGE).setValue(finalImageUrl);
    sheet.getRange(item.rowNumber, INV_COL.DESCRIPTION).setValue(description);
    sheet.getRange(item.rowNumber, INV_COL.ORIG_PRICE).setValue(originalPrice);
    sheet.getRange(item.rowNumber, INV_COL.YS_PRICE).setValue(sellingPrice);
    sheet.getRange(item.rowNumber, INV_COL.STATUS).setValue(finalStatus);
    sheet.getRange(item.rowNumber, INV_COL.UPDATED_AT).setValue(new Date());
    if (customCostColumn) sheet.getRange(item.rowNumber, customCostColumn).setValue(costPrice);
    inventorySaved = true;
    SpreadsheetApp.flush();

    if (createdImage && oldImageUrl) {
      const oldId = driveImageId_(oldImageUrl);
      if (oldId) {
        try { DriveApp.getFileById(oldId).setTrashed(true); } catch (cleanupError) {}
      }
    }

    return {
      success: true,
      code: code,
      status: finalStatus,
      wasCompleted: currentStatus === INVENTORY_STATUS.INCOMPLETE,
      imageUrl: finalImageUrl,
      description: description,
      originalPrice: originalPrice,
      sellingPrice: sellingPrice,
      manager: auth ? auth.managerName : ""
    };
  } catch (err) {
    if (!inventorySaved && createdImage && createdImage.file) {
      try { createdImage.file.setTrashed(true); } catch (cleanupError) {}
    }
    throw err;
  } finally {
    try { lock.releaseLock(); } catch (releaseError) {}
  }
}

function saveInventoryPhoto(payload) {
  payload = payload || {};
  const auth = requireManager_(payload.managerPin, payload.managerToken);
  const code = String(payload.code || "").trim();
  const dataUrl = String(payload.dataUrl || "").trim();
  const originalName = String(payload.fileName || "photo").trim();
  if (!code) throw new Error("Inventory Code is required.");
  if (!dataUrl) throw new Error("Choose an image first.");

  const decodedImage = decodeInventoryImage_(dataUrl);

  const itemResult = getInventoryItemByCode(code);
  if (!itemResult || !itemResult.success || !itemResult.item) throw new Error("Inventory item not found.");

  const createdImage = createInventoryImage_(code, originalName, decodedImage);
  const file = createdImage.file;
  const imageUrl = createdImage.imageUrl;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.INVENTORY);
  const rowNumber = itemResult.item.rowNumber;
  const oldValue = String(sheet.getRange(rowNumber, INV_COL.IMAGE).getDisplayValue() || "").trim();
  sheet.getRange(rowNumber, INV_COL.IMAGE).setValue(imageUrl);
  sheet.getRange(rowNumber, INV_COL.UPDATED_AT).setValue(new Date());

  // Best-effort cleanup of an older Drive image created by this feature.
  const oldId = driveImageId_(oldValue);
  if (oldId) {
    try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) {}
  }

  return { success: true, imageUrl: imageUrl, fileId: file.getId(), manager: auth.managerName };
}

function removeInventoryPhoto(payload) {
  payload = payload || {};
  const auth = requireManager_(payload.managerPin, payload.managerToken);
  const code = String(payload.code || "").trim();
  const itemResult = getInventoryItemByCode(code);
  if (!itemResult || !itemResult.success || !itemResult.item) throw new Error("Inventory item not found.");
  if (
    isYourFindsUnique_(itemResult.item) &&
    String(itemResult.item.status || "").trim().toUpperCase() !== INVENTORY_STATUS.INCOMPLETE
  ) {
    throw new Error("A completed YourFinds item must keep a picture. Use Change Photo instead.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.INVENTORY);
  const rowNumber = itemResult.item.rowNumber;
  const oldValue = String(sheet.getRange(rowNumber, INV_COL.IMAGE).getDisplayValue() || "").trim();
  sheet.getRange(rowNumber, INV_COL.IMAGE).clearContent();
  sheet.getRange(rowNumber, INV_COL.UPDATED_AT).setValue(new Date());

  const oldId = driveImageId_(oldValue);
  if (oldId) {
    try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) {}
  }
  return { success: true, manager: auth.managerName };
}

function driveImageId_(value) {
  value = String(value || "");
  let m = value.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  m = value.match(/\/d\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : "";
}
