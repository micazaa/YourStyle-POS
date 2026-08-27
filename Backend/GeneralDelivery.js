/* ==========================================================
   YOURSTYLE POS
   UNIVERSAL DELIVERY / YOURSTYLE RECEIVING
========================================================== */

function getGeneralDeliveryLogSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DELIVERY_LOG);
  if (!sheet) throw new Error("Delivery Log sheet not found.");
  return sheet;
}

function normalizeGeneralDeliveryDate(deliveryDate) {
  const value = String(deliveryDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Delivery Date must use YYYY-MM-DD format.");
  const date = new Date(value + "T00:00:00");
  if (isNaN(date.getTime())) throw new Error("Invalid Delivery Date.");
  return value;
}

function validateSheetHeaders(sheet, expectedHeaders) {
  const actual = sheet.getRange(1, 1, 1, expectedHeaders.length).getDisplayValues()[0];
  expectedHeaders.forEach(function(expected, index) {
    const found = String(actual[index] || "").trim();
    if (found !== expected) throw new Error(sheet.getName() + " column " + (index + 1) + ' should be "' + expected + '" but found "' + found + '".');
  });
}

function validateUniversalDeliveryDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const deliverySheet = ss.getSheetByName(SHEETS.DELIVERY_LOG);
  const movementSheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  if (!deliverySheet) throw new Error("Delivery Log sheet not found.");
  if (!movementSheet) throw new Error("Inventory Movement Log sheet not found.");

  validateSheetHeaders(deliverySheet, [
    "Delivery ID", "Delivery No.", "Delivery Date", "Timestamp", "Driver Name", "Plate No.", "Accepted By",
    "Delivery Type", "Type", "Category", "Receive Mode", "Description", "Bundle Qty", "Estimated Quantity",
    "Actual Quantity", "Remaining Quantity", "Remaining Bundle Qty", "Variance", "Status", "Remarks"
  ]);

  validateSheetHeaders(movementSheet, [
    "Timestamp", "Code", "Type", "Qty Change", "Stock Before", "Stock After", "Reference ID", "Employee",
    "Item", "Reason", "Source", "Bundle No.", "Remaining Bundle Qty", "Notes"
  ]);

  return { success: true, deliveryLog: "OK", movementLog: "OK" };
}

function generateDeliveryIdentifiers(deliveryType, deliveryDate) {
  deliveryType = String(deliveryType || "").trim().toUpperCase();
  deliveryDate = normalizeGeneralDeliveryDate(deliveryDate);

  let idPrefix = "";
  let noPrefix = "";
  if (deliveryType === DELIVERY_TYPE.YOURFINDS) { idPrefix = "YFD"; noPrefix = "YF"; }
  else if (deliveryType === DELIVERY_TYPE.YOURSTYLE) { idPrefix = "YSD"; noPrefix = "YS"; }
  else throw new Error("Invalid Delivery Type.");

  const sheet = getGeneralDeliveryLogSheet();
  const dateCode = deliveryDate.replace(/-/g, "");
  const fullPrefix = idPrefix + "-" + dateCode + "-";
  let highestSequence = 0;

  if (sheet.getLastRow() >= 2) {
    const ids = sheet.getRange(2, DELIVERY_COL.DELIVERY_ID, sheet.getLastRow() - 1, 1).getDisplayValues();
    ids.forEach(function(row) {
      const id = String(row[0] || "").trim().toUpperCase();
      if (!id.startsWith(fullPrefix)) return;
      const sequence = parseInt(id.substring(fullPrefix.length), 10);
      if (Number.isInteger(sequence) && sequence > highestSequence) highestSequence = sequence;
    });
  }

  const sequence = highestSequence + 1;
  return {
    deliveryType: deliveryType,
    deliveryId: fullPrefix + String(sequence).padStart(3, "0"),
    deliveryNo: noPrefix + "-" + dateCode.substring(2) + "-" + String(sequence).padStart(2, "0"),
    sequence: sequence,
    deliveryDate: deliveryDate
  };
}

function getYourStyleDeliveryProducts() {
  const products = getProductMaster();
  const result = products.filter(function(item) {
    const category = String(item.category || "").trim().toUpperCase();
    const active = item.active === true || String(item.active || "").trim().toUpperCase() === "TRUE";
    return active && (category === "PINS" || category === "OTHERS");
  }).map(function(item) {
    return {
      productCode: String(item.productCode || item.code || "").trim(),
      description: String(item.description || item.name || "").trim(),
      category: String(item.category || "").trim().toUpperCase(),
      defaultPrice: Number(item.defaultPrice || item.price) || 0,
      inventoryType: String(item.inventoryType || "").trim().toUpperCase()
    };
  }).filter(function(item) {
    return item.productCode && item.description && item.inventoryType === INVENTORY_TYPE.STOCK;
  });

  result.sort(function(a, b) {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.description !== b.description) return a.description.localeCompare(b.description);
    return a.defaultPrice - b.defaultPrice;
  });

  return { success: true, products: result };
}

/* ==========================================================
   ENSURE YOURSTYLE STOCK PRODUCT EXISTS IN INVENTORY

   Existing product:
   → do nothing

   Missing product:
   → create STOCK inventory row at stock 0
   → changeInventoryStock() will perform the actual increase
========================================================== */

function ensureYourStyleInventoryProduct(productCode, deliveryDate, deliveryId) {
  productCode = String(productCode || "").trim();

  if (!productCode) {
    throw new Error("Product Code is required.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);

  if (!inventorySheet) {
    throw new Error("Inventory sheet not found.");
  }

  const lastRow = inventorySheet.getLastRow();

  /* ========================================================
     CHECK IF INVENTORY ROW ALREADY EXISTS
  ======================================================== */

  if (lastRow >= 2) {
    const codes = inventorySheet
      .getRange(
        2,
        INV_COL.CODE,
        lastRow - 1,
        1
      )
      .getDisplayValues();

    for (let i = 0; i < codes.length; i++) {
      if (
        String(codes[i][0] || "").trim() ===
        productCode
      ) {
        return {
          success: true,
          created: false,
          rowNumber: i + 2
        };
      }
    }
  }

  /* ========================================================
     LOAD PRODUCT MASTER
  ======================================================== */

  const products = getProductMaster();

  const product = products.find(function(item) {
    return (
      String(
        item.productCode ||
        item.code ||
        ""
      ).trim() === productCode
    );
  });

  if (!product) {
    throw new Error(
      "Product Code " +
      productCode +
      " was not found in Product Master."
    );
  }

  const category = String(
    product.category || ""
  ).trim().toUpperCase();

  if (
    category !== "PINS" &&
    category !== "OTHERS"
  ) {
    throw new Error(
      "Product Code " +
      productCode +
      " is not a valid YourStyle product."
    );
  }

  const inventoryType = String(
    product.inventoryType || ""
  ).trim().toUpperCase();

  if (
    inventoryType !==
    INVENTORY_TYPE.STOCK
  ) {
    throw new Error(
      "Product Code " +
      productCode +
      " must use STOCK inventory."
    );
  }

  /* ========================================================
     CREATE INVENTORY STOCK ROW

     IMPORTANT:
     Stock starts at ZERO.

     changeInventoryStock() performs the actual delivery
     increase and creates the Movement Log entry.
  ======================================================== */

  const now = new Date();

  const row = [
    "",                                                   // A Image
    String(product.description || "").trim(),             // B Description
    "",                                                   // C Size
    Number(product.originalPrice) || 0,                   // D Original Price
    Number(product.defaultPrice) || 0,                    // E YS Price
    INVENTORY_STATUS.ACTIVE,                              // F Status
    productCode,                                          // G Code
    0,                                                    // H Stock
    category,                                             // I Category
    INVENTORY_TYPE.STOCK,                                 // J Inventory Type
    Number(product.lowStockAt) || 0,                      // K Low Stock At
    deliveryDate || "",                                   // L Date Delivered
    deliveryId || "",                                     // M Delivery ID
    now,                                                  // N Created At
    now                                                   // O Updated At
  ];

  if (
    row.length !==
    INVENTORY_COLUMN_COUNT
  ) {
    throw new Error(
      "Inventory row does not match A:O mapping."
    );
  }

  inventorySheet.appendRow(row);

  return {
    success: true,
    created: true,
    rowNumber: inventorySheet.getLastRow()
  };
}

function acceptYourStyleDelivery(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const deliverySheet = ss.getSheetByName(SHEETS.DELIVERY_LOG);
  const movementSheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);
  const deliveryStartRow = deliverySheet ? deliverySheet.getLastRow() : 0;
  const movementStartRow = movementSheet ? movementSheet.getLastRow() : 0;
  const stockRollbacks = [];
  const createdInventoryRows = [];

  try {
    validateUniversalDeliveryDatabase();
    if (!inventorySheet) throw new Error("Inventory sheet not found.");

    payload = payload || {};
    const deliveryDate = normalizeGeneralDeliveryDate(payload.deliveryDate);
    const driverName = String(payload.driverName || "").trim();
    const plateNo = String(payload.plateNo || "").trim().toUpperCase();
    const acceptedBy = String(payload.acceptedBy || "").trim();
    const remarks = String(payload.remarks || "").trim();
    const submittedLines = Array.isArray(payload.lines) ? payload.lines : [];

    if (!driverName) throw new Error("Driver Name is required.");
    if (!plateNo) throw new Error("Plate No. is required.");
    if (!acceptedBy) throw new Error("Accepted By is required.");
    if (!submittedLines.length) throw new Error("Add at least one delivery item.");

    const productResult = getYourStyleDeliveryProducts();
    const productMap = {};
    (productResult.products || []).forEach(function(product) { productMap[product.productCode] = product; });

    let lines = submittedLines.map(function(line, index) {
      const type = String(line.type || "").trim().toUpperCase();
      const mode = String(line.receiveMode || "").trim().toUpperCase();
      if (type !== "PINS" && type !== "OTHERS") throw new Error("Item " + (index + 1) + ": invalid Type.");
      if (mode !== DELIVERY_RECEIVE_MODE.DIRECT && mode !== DELIVERY_RECEIVE_MODE.BULK) throw new Error("Item " + (index + 1) + ": invalid Receive Mode.");

      if (mode === DELIVERY_RECEIVE_MODE.DIRECT) {
        const productCode = String(line.productCode || "").trim();
        const quantity = Number(line.quantity);
        const product = productMap[productCode];
        if (!product) throw new Error("Item " + (index + 1) + ": select a valid active Product Master item.");
        if (product.category !== type) throw new Error("Item " + (index + 1) + ": Product Type does not match Product Master.");
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99999) throw new Error("Item " + (index + 1) + ": Direct quantity must be a whole number from 1 to 99999.");
        return { type: type, receiveMode: mode, productCode: productCode, description: product.description, quantity: quantity };
      }

      const bundleQty = Number(line.bundleQty);
      const estimatedQuantity = Number(line.estimatedQuantity);
      const description = String(line.description || (type === "PINS" ? "PINS BUNDLE" : "OTHERS BUNDLE")).trim();
      if (!Number.isInteger(bundleQty) || bundleQty < 1 || bundleQty > 9999) throw new Error("Item " + (index + 1) + ": Bundle Qty must be a whole number from 1 to 9999.");
      if (!Number.isInteger(estimatedQuantity) || estimatedQuantity < 1 || estimatedQuantity > 999999) throw new Error("Item " + (index + 1) + ": Estimated Quantity must be a whole number.");
      if (estimatedQuantity < bundleQty) throw new Error("Item " + (index + 1) + ": Estimated Quantity cannot be less than Bundle Qty.");
      return { type: type, receiveMode: mode, description: description, bundleQty: bundleQty, estimatedQuantity: estimatedQuantity };
    });

    /* ========================================================
       NORMALIZE BULK HOLDERS

       Multiple BULK rows of the same Type in one acceptance
       represent physical bundles of the SAME bulk holder.

       Example:
       PINS BULK 1 bundle / est 80
       PINS BULK 1 bundle / est 80

       becomes ONE holder:
       PINS BULK 2 bundles / est 160

       This keeps the modal bundle tabs and delivery estimate
       aligned with what the employee accepted.
    ======================================================== */

    const normalizedLines = [];
    const bulkByType = {};

    lines.forEach(function(line) {
      if (line.receiveMode !== DELIVERY_RECEIVE_MODE.BULK) {
        normalizedLines.push(line);
        return;
      }

      const key = String(line.type || "").trim().toUpperCase();

      if (!bulkByType[key]) {
        bulkByType[key] = {
          type: key,
          receiveMode: DELIVERY_RECEIVE_MODE.BULK,
          description: line.description,
          bundleQty: 0,
          estimatedQuantity: 0
        };
        normalizedLines.push(bulkByType[key]);
      }

      bulkByType[key].bundleQty += Number(line.bundleQty) || 0;
      bulkByType[key].estimatedQuantity += Number(line.estimatedQuantity) || 0;
    });

    lines = normalizedLines;

    const identifiers = generateDeliveryIdentifiers(DELIVERY_TYPE.YOURSTYLE, deliveryDate);
    const now = new Date();
    const deliveryRows = [];
    let directUnits = 0;
    let bulkEstimated = 0;
    let bulkBundles = 0;
    let bulkIndex = 0;

    lines.forEach(function(line) {
      if (line.receiveMode === DELIVERY_RECEIVE_MODE.DIRECT) {
        directUnits += line.quantity;
        deliveryRows.push([
          identifiers.deliveryId, identifiers.deliveryNo, deliveryDate, now, driverName, plateNo, acceptedBy,
          DELIVERY_TYPE.YOURSTYLE, line.type, line.type, DELIVERY_RECEIVE_MODE.DIRECT, line.description,
          "", "", line.quantity, "", "", "", DELIVERY_STATUS.ACCEPTED, remarks
        ]);
        return;
      }

      bulkIndex++;
      bulkEstimated += line.estimatedQuantity;
      bulkBundles += line.bundleQty;
      line.holderCode = identifiers.deliveryId + "-B" + String(bulkIndex).padStart(2, "0");
      deliveryRows.push([
        identifiers.deliveryId, identifiers.deliveryNo, deliveryDate, now, driverName, plateNo, acceptedBy,
        DELIVERY_TYPE.YOURSTYLE, line.type, "UNSORTED", DELIVERY_RECEIVE_MODE.BULK, line.description,
        line.bundleQty, line.estimatedQuantity, 0, line.estimatedQuantity, line.bundleQty, "", DELIVERY_STATUS.PENDING, remarks
      ]);
    });

    if (deliveryRows.some(function(row) { return row.length !== DELIVERY_LOG_COLUMN_COUNT; })) throw new Error("YourStyle Delivery row does not match universal A:T mapping.");

    deliverySheet.getRange(deliverySheet.getLastRow() + 1, 1, deliveryRows.length, DELIVERY_LOG_COLUMN_COUNT).setValues(deliveryRows);

    lines.forEach(function(line) {
      if (line.receiveMode === DELIVERY_RECEIVE_MODE.DIRECT) {
        /* Create the STOCK Inventory row first when Product Master exists but Inventory does not. */
        const ensured = ensureYourStyleInventoryProduct(line.productCode, deliveryDate, identifiers.deliveryId);
        if (ensured.created) createdInventoryRows.push(ensured.rowNumber);

        /* Capture the current stock so a later failure in this delivery can restore it. */
        const stockCell = inventorySheet.getRange(ensured.rowNumber, INV_COL.STOCK);
        const before = Number(stockCell.getValue()) || 0;
        stockRollbacks.push({ cell: stockCell, value: before });

        changeInventoryStock({
          code: line.productCode,
          qtyChange: line.quantity,
          referenceId: identifiers.deliveryId,
          employee: acceptedBy,
          item: line.description,
          reason: "",
          source: INVENTORY_MOVEMENT_SOURCE.DELIVERY,
          notes: "Delivery No: " + identifiers.deliveryNo
        });
        return;
      }

      const bulkType = line.type === "PINS" ? INVENTORY_MOVEMENT_TYPE.BULK_PINS : INVENTORY_MOVEMENT_TYPE.BULK_OTHERS;
      logInventoryMovement({
        code: line.holderCode,
        type: bulkType,
        qtyChange: line.estimatedQuantity,
        stockBefore: 0,
        stockAfter: line.estimatedQuantity,
        referenceId: identifiers.deliveryId,
        employee: acceptedBy,
        item: line.description,
        reason: "",
        source: INVENTORY_MOVEMENT_SOURCE.DELIVERY,
        bundleNo: "",
        remainingBundleQty: line.bundleQty,
        notes: "Delivery No: " + identifiers.deliveryNo
      });
    });

    SpreadsheetApp.flush();
    return {
      success: true,
      deliveryId: identifiers.deliveryId,
      deliveryNo: identifiers.deliveryNo,
      directUnits: directUnits,
      bulkEstimated: bulkEstimated,
      bulkBundles: bulkBundles,
      lineCount: lines.length
    };
  } catch (err) {
    /* Restore pre-existing/newly-created stock values first. */
    stockRollbacks.reverse().forEach(function(entry) {
      try { entry.cell.setValue(entry.value); } catch (e) {}
    });

    /* Remove movement and delivery rows created by this attempt. */
    if (movementSheet && movementSheet.getLastRow() > movementStartRow) {
      movementSheet.deleteRows(movementStartRow + 1, movementSheet.getLastRow() - movementStartRow);
    }
    if (deliverySheet && deliverySheet.getLastRow() > deliveryStartRow) {
      deliverySheet.deleteRows(deliveryStartRow + 1, deliverySheet.getLastRow() - deliveryStartRow);
    }

    /* Remove Inventory rows that this failed delivery created at stock 0. Delete bottom-up. */
    createdInventoryRows.sort(function(a, b) { return b - a; }).forEach(function(rowNumber) {
      try {
        if (rowNumber >= 2 && rowNumber <= inventorySheet.getLastRow()) inventorySheet.deleteRow(rowNumber);
      } catch (e) {}
    });

    SpreadsheetApp.flush();
    return { success: false, message: err && err.message ? err.message : String(err) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/* ==========================================================
   7.9H-A
   GET PENDING / PARTIAL BULK HOLDERS
========================================================== */

function getPendingBulkHolders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.DELIVERY_LOG);

  if (!sheet) {
    throw new Error("Delivery Log sheet not found.");
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {
      success: true,
      holders: []
    };
  }

  const data = sheet
    .getRange(
      2,
      1,
      lastRow - 1,
      DELIVERY_LOG_COLUMN_COUNT
    )
    .getDisplayValues();

  const holders = [];

  data.forEach(function(row, index) {
    const deliveryType = String(
      row[DELIVERY_IDX.DELIVERY_TYPE] || ""
    ).trim().toUpperCase();

    const receiveMode = String(
      row[DELIVERY_IDX.RECEIVE_MODE] || ""
    ).trim().toUpperCase();

    const type = String(
      row[DELIVERY_IDX.TYPE] || ""
    ).trim().toUpperCase();

    const status = String(
      row[DELIVERY_IDX.STATUS] || ""
    ).trim().toUpperCase();

    if (deliveryType !== DELIVERY_TYPE.YOURSTYLE) return;
    if (receiveMode !== DELIVERY_RECEIVE_MODE.BULK) return;
    if (type !== "PINS" && type !== "OTHERS") return;

    if (
      status !== DELIVERY_STATUS.PENDING &&
      status !== DELIVERY_STATUS.PARTIAL
    ) {
      return;
    }

    const bundleQty =
      Number(row[DELIVERY_IDX.BUNDLE_QTY]) || 0;

    const estimatedQty =
      Number(row[DELIVERY_IDX.ESTIMATED_QTY]) || 0;

    const actualQty =
      Number(row[DELIVERY_IDX.ACTUAL_QTY]) || 0;

    const remainingQty =
      Math.max(0, estimatedQty - actualQty);

    const remainingBundleQty =
      Number(
        row[DELIVERY_IDX.REMAINING_BUNDLE_QTY]
      ) || 0;

    const distributedBundleQty =
      Math.max(
        0,
        bundleQty - remainingBundleQty
      );

    /*
      Bundle count is tracking only. Once all declared bundles
      have been opened, additional distributions remain attached
      to the last physical bundle until explicit completion.
    */
    const nextBundleNo =
      Math.max(
        1,
        Math.min(
          bundleQty || 1,
          distributedBundleQty + 1
        )
      );

    holders.push({
      sheetRow: index + 2,

      deliveryId: String(
        row[DELIVERY_IDX.DELIVERY_ID] || ""
      ).trim(),

      deliveryNo: String(
        row[DELIVERY_IDX.DELIVERY_NO] || ""
      ).trim(),

      deliveryDate: String(
        row[DELIVERY_IDX.DELIVERY_DATE] || ""
      ).trim(),

      type: type,

      category: String(
        row[DELIVERY_IDX.CATEGORY] || ""
      ).trim(),

      description: String(
        row[DELIVERY_IDX.DESCRIPTION] || ""
      ).trim(),

      bundleQty: bundleQty,
      estimatedQuantity: estimatedQty,
      actualQuantity: actualQty,
      remainingQuantity: remainingQty,
      remainingBundleQty: remainingBundleQty,
      completedBundleQty: Math.max(0, bundleQty - remainingBundleQty),
      nextBundleNo: nextBundleNo,
      currentBundleStatus: remainingBundleQty > 0 ? "IN PROGRESS" : "ALL BUNDLES FINISHED",
      status: status
    });
  });

  holders.sort(function(a, b) {
    return String(b.deliveryId)
      .localeCompare(String(a.deliveryId));
  });

  return {
    success: true,
    holders: holders
  };
}


/* ==========================================================
   GET ONE BULK HOLDER

   Used immediately before opening / distributing a bundle.
========================================================== */

function getBulkHolderDetails(deliveryId, sheetRow) {
  deliveryId = String(deliveryId || "").trim();
  sheetRow = Number(sheetRow);
  if (!deliveryId) throw new Error("Delivery ID is required.");
  if (!Number.isInteger(sheetRow) || sheetRow < 2) throw new Error("Valid Delivery Log row is required.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.DELIVERY_LOG);
  if (!sheet) throw new Error("Delivery Log sheet not found.");
  if (sheetRow > sheet.getLastRow()) throw new Error("Bulk holder row no longer exists.");

  const raw = sheet.getRange(sheetRow, 1, 1, DELIVERY_LOG_COLUMN_COUNT).getValues()[0];
  const row = sheet.getRange(sheetRow, 1, 1, DELIVERY_LOG_COLUMN_COUNT).getDisplayValues()[0];
  const storedDeliveryId = String(row[DELIVERY_IDX.DELIVERY_ID] || "").trim();
  const deliveryType = String(row[DELIVERY_IDX.DELIVERY_TYPE] || "").trim().toUpperCase();
  const receiveMode = String(row[DELIVERY_IDX.RECEIVE_MODE] || "").trim().toUpperCase();
  const type = String(row[DELIVERY_IDX.TYPE] || "").trim().toUpperCase();
  const status = String(row[DELIVERY_IDX.STATUS] || "").trim().toUpperCase();

  if (storedDeliveryId !== deliveryId) throw new Error("Bulk holder Delivery ID no longer matches.");
  if (deliveryType !== DELIVERY_TYPE.YOURSTYLE) throw new Error("This is not a YourStyle delivery.");
  if (receiveMode !== DELIVERY_RECEIVE_MODE.BULK) throw new Error("This delivery row is not BULK.");
  if (type !== "PINS" && type !== "OTHERS") throw new Error("Invalid bulk holder Type.");
  if (status !== DELIVERY_STATUS.PENDING && status !== DELIVERY_STATUS.PARTIAL) {
    throw new Error("This bulk holder is no longer available for distribution.");
  }

  const bundleQty = Math.max(1, Number(raw[DELIVERY_IDX.BUNDLE_QTY]) || 1);
  const estimated = Number(raw[DELIVERY_IDX.ESTIMATED_QTY]) || 0;
  const actual = Number(raw[DELIVERY_IDX.ACTUAL_QTY]) || 0;
  const progress = getBulkBundleProgress_(deliveryId, sheetRow, type, bundleQty);

  return {success:true, holder:{
    sheetRow:sheetRow, deliveryId:storedDeliveryId,
    deliveryNo:String(row[DELIVERY_IDX.DELIVERY_NO]||"").trim(),
    deliveryDate:String(row[DELIVERY_IDX.DELIVERY_DATE]||"").trim(),
    type:type, category:String(row[DELIVERY_IDX.CATEGORY]||"").trim(),
    description:String(row[DELIVERY_IDX.DESCRIPTION]||"").trim(),
    bundleQty:bundleQty, estimatedQuantity:estimated, actualQuantity:actual,
    remainingQuantity:Math.max(0, estimated-actual),
    currentVariance:actual-estimated,
    bundles:progress.bundles,
    bundlesWithActivity:progress.bundlesWithActivity,
    status:status
  }};
}

/* ==========================================================
   BUNDLE PROGRESS
   Physical bundles are identifiers only. No per-bundle estimate.
========================================================== */
function getBulkBundleProgress_(deliveryId, sheetRow, holderType, bundleQty) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  const totals = {};
  for (let n = 1; n <= bundleQty; n++) totals[n] = 0;

  if (sheet && sheet.getLastRow() >= 2) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow()-1, MOVEMENT_LOG_COLUMN_COUNT).getValues();
    rows.forEach(function(row) {
      const ref = String(row[MOVE_IDX.REFERENCE_ID] || "").trim();
      const source = String(row[MOVE_IDX.SOURCE] || "").trim().toUpperCase();
      const type = String(row[MOVE_IDX.TYPE] || "").trim().toUpperCase();
      const bundleNo = Number(row[MOVE_IDX.BUNDLE_NO]);
      const qty = Number(row[MOVE_IDX.QTY_CHANGE]) || 0;
      if (ref !== deliveryId || source !== INVENTORY_MOVEMENT_SOURCE.DISTRIBUTION) return;
      if (type !== holderType || qty <= 0) return;
      if (!Number.isInteger(bundleNo) || bundleNo < 1 || bundleNo > bundleQty) return;
      totals[bundleNo] = (totals[bundleNo] || 0) + qty;
    });
  }

  const bundles = [];
  let bundlesWithActivity = 0;
  for (let n = 1; n <= bundleQty; n++) {
    const actual = Number(totals[n]) || 0;
    if (actual > 0) bundlesWithActivity++;
    bundles.push({bundleNo:n, actualQuantity:actual, hasActivity:actual>0});
  }
  return {bundles:bundles, bundlesWithActivity:bundlesWithActivity};
}

/* ==========================================================
   7.9H-C
   DISTRIBUTE ONE BULK BUNDLE
========================================================== */

function distributeBulkBundle(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const deliverySheet = ss.getSheetByName(SHEETS.DELIVERY_LOG);
  const movementSheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);
  const movementStartRow = movementSheet ? movementSheet.getLastRow() : 0;
  const stockRollbacks = [];
  const createdInventoryRows = [];
  let holderRollback = null;

  try {
    if (!deliverySheet || !movementSheet || !inventorySheet) throw new Error("Required inventory/delivery sheets are missing.");
    payload = payload || {};
    const deliveryId = String(payload.deliveryId || "").trim();
    const sheetRow = Number(payload.sheetRow);
    const bundleNo = Number(payload.bundleNo);
    const employee = String(payload.employee || "").trim();
    const remarks = String(payload.remarks || "").trim();
    const submittedLines = Array.isArray(payload.lines) ? payload.lines : [];
    if (!deliveryId) throw new Error("Delivery ID is required.");
    if (!Number.isInteger(sheetRow) || sheetRow < 2) throw new Error("Valid Delivery Log row is required.");
    if (!employee) throw new Error("Employee is required.");
    if (!submittedLines.length) throw new Error("Add at least one distributed product.");

    const holder = getBulkHolderDetails(deliveryId, sheetRow).holder;
    const holderType = String(holder.type || "").trim().toUpperCase();
    if (!Number.isInteger(bundleNo) || bundleNo < 1 || bundleNo > Number(holder.bundleQty)) {
      throw new Error("Select a valid physical bundle from 1 to " + holder.bundleQty + ".");
    }

    const productResult = getYourStyleDeliveryProducts();
    const productMap = {};
    (productResult.products || []).forEach(function(product){ productMap[String(product.productCode||"").trim()] = product; });
    const combined = {};
    submittedLines.forEach(function(line,index){
      const code=String(line.productCode||"").trim(); const qty=Number(line.quantity); const product=productMap[code];
      if (!product) throw new Error("Item " + (index+1) + ": select a valid active Product Master item.");
      if (String(product.category||"").trim().toUpperCase() !== holderType) throw new Error("Item " + (index+1) + ": product does not match bulk holder Type.");
      if (!Number.isInteger(qty) || qty < 1 || qty > 99999) throw new Error("Item " + (index+1) + ": quantity must be a whole number from 1 to 99999.");
      if (!combined[code]) combined[code]={productCode:code,description:String(product.description||"").trim(),quantity:0};
      combined[code].quantity += qty;
    });
    const lines=Object.keys(combined).map(function(code){return combined[code];});
    const distributionActual=lines.reduce(function(sum,line){return sum+line.quantity;},0);
    if (distributionActual <= 0) throw new Error("Distributed quantity must be greater than zero.");

    const oldActual=Number(holder.actualQuantity)||0;
    const estimated=Number(holder.estimatedQuantity)||0;
    const oldRemaining=Math.max(0,estimated-oldActual);
    const newActual=oldActual+distributionActual;
    const newRemaining=Math.max(0,estimated-newActual);
    const currentVariance=newActual-estimated;

    holderRollback=deliverySheet.getRange(sheetRow,DELIVERY_COL.ACTUAL_QTY,1,5).getValues()[0];
    lines.forEach(function(line){
      const ensured=ensureYourStyleInventoryProduct(line.productCode,holder.deliveryDate,deliveryId);
      if (ensured.created) createdInventoryRows.push(ensured.rowNumber);
      const stockCell=inventorySheet.getRange(ensured.rowNumber,INV_COL.STOCK);
      stockRollbacks.push({cell:stockCell,value:Number(stockCell.getValue())||0});
    });

    const bulkMovementType=holderType === "PINS" ? INVENTORY_MOVEMENT_TYPE.BULK_PINS : INVENTORY_MOVEMENT_TYPE.BULK_OTHERS;
    const holderCode=deliveryId+"-B"+String(getBulkHolderSequenceForRow(deliverySheet,sheetRow,deliveryId)).padStart(2,"0");
    const estimatedConsumption=Math.min(distributionActual,oldRemaining);
    if (estimatedConsumption > 0) {
      logInventoryMovement({code:holderCode,type:bulkMovementType,qtyChange:-estimatedConsumption,stockBefore:oldRemaining,stockAfter:newRemaining,referenceId:deliveryId,employee:employee,item:holder.description,reason:"",source:INVENTORY_MOVEMENT_SOURCE.DISTRIBUTION,bundleNo:bundleNo,remainingBundleQty:"",notes:remarks});
    }
    lines.forEach(function(line){
      changeInventoryStock({code:line.productCode,qtyChange:line.quantity,referenceId:deliveryId,employee:employee,item:line.description,reason:"",source:INVENTORY_MOVEMENT_SOURCE.DISTRIBUTION,bundleNo:bundleNo,remainingBundleQty:"",notes:remarks});
    });

    deliverySheet.getRange(sheetRow,DELIVERY_COL.ACTUAL_QTY,1,5).setValues([[newActual,newRemaining,"","",DELIVERY_STATUS.PARTIAL]]);
    SpreadsheetApp.flush();
    const progress=getBulkBundleProgress_(deliveryId,sheetRow,holderType,Number(holder.bundleQty));
    return {success:true,deliveryId:deliveryId,deliveryNo:holder.deliveryNo,bundleNo:bundleNo,distributionActual:distributionActual,bundleActual:(progress.bundles[bundleNo-1]||{}).actualQuantity||0,actualQuantity:newActual,remainingQuantity:newRemaining,currentVariance:currentVariance,status:DELIVERY_STATUS.PARTIAL,bundles:progress.bundles};
  } catch(err) {
    stockRollbacks.reverse().forEach(function(entry){try{entry.cell.setValue(entry.value);}catch(e){}});
    if (holderRollback && deliverySheet && Number(payload.sheetRow)>=2) {try{deliverySheet.getRange(Number(payload.sheetRow),DELIVERY_COL.ACTUAL_QTY,1,5).setValues([holderRollback]);}catch(e){}}
    if (movementSheet && movementSheet.getLastRow()>movementStartRow) movementSheet.deleteRows(movementStartRow+1,movementSheet.getLastRow()-movementStartRow);
    createdInventoryRows.sort(function(a,b){return b-a;}).forEach(function(r){try{if(r>=2&&r<=inventorySheet.getLastRow())inventorySheet.deleteRow(r);}catch(e){}});
    SpreadsheetApp.flush();
    return {success:false,message:err&&err.message?err.message:String(err)};
  } finally { try{lock.releaseLock();}catch(e){} }
}


/* ==========================================================
   7.9H-C3
   COMPLETE BULK HOLDER

   IMPORTANT:
   Distribution NEVER completes a holder.

   Completion is a separate explicit employee action.

   Requirements:
   - YOURSTYLE
   - BULK
   - Status = PARTIAL

   Completion is always an explicit employee decision.
   It is allowed for shortage, exact count, or excess.

   Completion:
   - calculates final variance
   - reconciles estimated holder balance
   - does NOT change sellable Inventory
   - sets Remaining Qty = 0
   - sets Status = COMPLETED
========================================================== */

function completeBulkHolder(payload) {
  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    payload =
      payload || {};

    const deliveryId =
      String(
        payload.deliveryId || ""
      ).trim();

    const sheetRow =
      Number(
        payload.sheetRow
      );

    const employee =
      String(
        payload.employee || ""
      ).trim();

    const remarks =
      String(
        payload.remarks || ""
      ).trim();


    /* ========================================================
       VALIDATE REQUEST
    ======================================================== */

    if (!deliveryId) {
      throw new Error(
        "Delivery ID is required."
      );
    }


    if (
      !Number.isInteger(sheetRow) ||
      sheetRow < 2
    ) {
      throw new Error(
        "Valid Delivery Log row is required."
      );
    }


    if (!employee) {
      throw new Error(
        "Employee is required."
      );
    }


    /* ========================================================
       SHEETS
    ======================================================== */

    const ss =
      SpreadsheetApp
        .getActiveSpreadsheet();


    const deliverySheet =
      ss.getSheetByName(
        SHEETS.DELIVERY_LOG
      );


    const movementSheet =
      ss.getSheetByName(
        SHEETS.INVENTORY_MOVEMENT_LOG
      );


    if (!deliverySheet) {
      throw new Error(
        "Delivery Log sheet not found."
      );
    }


    if (!movementSheet) {
      throw new Error(
        "Inventory Movement Log sheet not found."
      );
    }


    if (
      sheetRow >
      deliverySheet.getLastRow()
    ) {
      throw new Error(
        "Bulk holder row no longer exists."
      );
    }


    /* ========================================================
       READ HOLDER
    ======================================================== */

    const row =
      deliverySheet
        .getRange(
          sheetRow,
          1,
          1,
          DELIVERY_LOG_COLUMN_COUNT
        )
        .getValues()[0];


    const display =
      deliverySheet
        .getRange(
          sheetRow,
          1,
          1,
          DELIVERY_LOG_COLUMN_COUNT
        )
        .getDisplayValues()[0];


    const storedDeliveryId =
      String(
        display[
          DELIVERY_IDX.DELIVERY_ID
        ] || ""
      ).trim();


    const deliveryType =
      String(
        display[
          DELIVERY_IDX.DELIVERY_TYPE
        ] || ""
      )
        .trim()
        .toUpperCase();


    const receiveMode =
      String(
        display[
          DELIVERY_IDX.RECEIVE_MODE
        ] || ""
      )
        .trim()
        .toUpperCase();


    const holderType =
      String(
        display[
          DELIVERY_IDX.TYPE
        ] || ""
      )
        .trim()
        .toUpperCase();


    const status =
      String(
        display[
          DELIVERY_IDX.STATUS
        ] || ""
      )
        .trim()
        .toUpperCase();


    const description =
      String(
        display[
          DELIVERY_IDX.DESCRIPTION
        ] || ""
      ).trim();


    const estimatedQuantity =
      Number(
        row[
          DELIVERY_IDX.ESTIMATED_QTY
        ]
      ) || 0;


    const actualQuantity =
      Number(
        row[
          DELIVERY_IDX.ACTUAL_QTY
        ]
      ) || 0;


    const remainingQuantity =
      Math.max(0, estimatedQuantity - actualQuantity);


    const remainingBundleQty =
      Number(
        row[
          DELIVERY_IDX.REMAINING_BUNDLE_QTY
        ]
      ) || 0;


    /* ========================================================
       REVALIDATE HOLDER
    ======================================================== */

    if (
      storedDeliveryId !==
      deliveryId
    ) {
      throw new Error(
        "Bulk holder Delivery ID no longer matches."
      );
    }


    if (
      deliveryType !==
      DELIVERY_TYPE.YOURSTYLE
    ) {
      throw new Error(
        "This is not a YourStyle delivery."
      );
    }


    if (
      receiveMode !==
      DELIVERY_RECEIVE_MODE.BULK
    ) {
      throw new Error(
        "This delivery row is not BULK."
      );
    }


    if (
      holderType !== "PINS" &&
      holderType !== "OTHERS"
    ) {
      throw new Error(
        "Invalid bulk holder Type."
      );
    }


    if (
      status !==
      DELIVERY_STATUS.PARTIAL
    ) {
      throw new Error(
        "Only a PARTIAL bulk holder can be completed."
      );
    }



    /* ========================================================
       VARIANCE
    ======================================================== */

    const variance =
      actualQuantity -
      estimatedQuantity;


    /*
      Holder balance is the unresolved estimated quantity.

      Example:

      Estimated = 80
      Actual    = 6
      Remaining = 74

      Completion:
      BULK_PINS -74 ADJUSTMENT
    */

    const unresolvedBalance =
      estimatedQuantity - actualQuantity;


    /* ========================================================
       RESOLVE HOLDER CODE
    ======================================================== */

    const holderSequence =
      getBulkHolderSequenceForRow(
        deliverySheet,
        sheetRow,
        deliveryId
      );


    const holderCode =
      deliveryId +
      "-B" +
      String(
        holderSequence
      ).padStart(
        2,
        "0"
      );


    const bulkMovementType =
      holderType === "PINS"
        ? INVENTORY_MOVEMENT_TYPE.BULK_PINS
        : INVENTORY_MOVEMENT_TYPE.BULK_OTHERS;


    /* ========================================================
       ROLLBACK SNAPSHOT
    ======================================================== */

    const holderRollback =
      deliverySheet
        .getRange(
          sheetRow,
          DELIVERY_COL.ACTUAL_QTY,
          1,
          5
        )
        .getValues()[0];


    const movementStartRow =
      movementSheet.getLastRow();


    try {

      /* ======================================================
         RECONCILE HOLDER

         Only write an adjustment when unresolved estimated
         quantity remains.
      ====================================================== */

      if (
        unresolvedBalance !== 0
      ) {

        logInventoryMovement({
          code:
            holderCode,

          type:
            bulkMovementType,

          qtyChange:
            -unresolvedBalance,

          stockBefore:
            unresolvedBalance,

          stockAfter:
            0,

          referenceId:
            deliveryId,

          employee:
            employee,

          item:
            description,

          reason:
            variance < 0
              ? "BULK SHORTAGE VARIANCE"
              : (
                  variance > 0
                    ? "BULK EXCESS VARIANCE"
                    : "BULK COMPLETION"
                ),

          source:
            INVENTORY_MOVEMENT_SOURCE.ADJUSTMENT,

          bundleNo:
            "",

          remainingBundleQty:
            0,

          notes:
            remarks
        });

      }


      /* ======================================================
         CLOSE DELIVERY HOLDER

         O Actual Qty       unchanged
         P Remaining Qty    0
         Q Remaining Bundle 0
         R Variance         final actual - estimate
         S Status           COMPLETED
      ====================================================== */

      deliverySheet
        .getRange(
          sheetRow,
          DELIVERY_COL.ACTUAL_QTY,
          1,
          5
        )
        .setValues([[
          actualQuantity,
          0,
          0,
          variance,
          DELIVERY_STATUS.COMPLETED
        ]]);


      SpreadsheetApp.flush();


      return {
        success:
          true,

        deliveryId:
          deliveryId,

        actualQuantity:
          actualQuantity,

        estimatedQuantity:
          estimatedQuantity,

        variance:
          variance,

        status:
          DELIVERY_STATUS.COMPLETED
      };


    } catch (writeError) {

      /* ======================================================
         ROLLBACK DELIVERY LOG
      ====================================================== */

      deliverySheet
        .getRange(
          sheetRow,
          DELIVERY_COL.ACTUAL_QTY,
          1,
          5
        )
        .setValues([
          holderRollback
        ]);


      /* ======================================================
         ROLLBACK MOVEMENTS
      ====================================================== */

      const movementEndRow =
        movementSheet.getLastRow();


      if (
        movementEndRow >
        movementStartRow
      ) {

        movementSheet.deleteRows(
          movementStartRow + 1,
          movementEndRow -
            movementStartRow
        );

      }


      SpreadsheetApp.flush();


      throw writeError;
    }


  } catch (err) {

    return {
      success:
        false,

      message:
        err &&
        err.message
          ? err.message
          : String(err)
    };


  } finally {

    try {
      lock.releaseLock();
    } catch (e) {}

  }
}

/* ==========================================================
   GET BULK HOLDERS READY FOR COMPLETION
========================================================== */

function getCompletableBulkHoldersForDelivery(deliveryId) {
  deliveryId=String(deliveryId||"").trim();
  if(!deliveryId) throw new Error("Delivery ID is required.");
  const ss=SpreadsheetApp.getActiveSpreadsheet(); const sheet=ss.getSheetByName(SHEETS.DELIVERY_LOG);
  if(!sheet) throw new Error("Delivery Log sheet not found.");
  if(sheet.getLastRow()<2) return {success:true,holders:[]};
  const data=sheet.getRange(2,1,sheet.getLastRow()-1,DELIVERY_LOG_COLUMN_COUNT).getValues();
  const display=sheet.getRange(2,1,sheet.getLastRow()-1,DELIVERY_LOG_COLUMN_COUNT).getDisplayValues();
  const holders=[];
  data.forEach(function(row,index){
    const d=display[index]; const id=String(d[DELIVERY_IDX.DELIVERY_ID]||"").trim(); if(id!==deliveryId)return;
    const dt=String(d[DELIVERY_IDX.DELIVERY_TYPE]||"").trim().toUpperCase();
    const mode=String(d[DELIVERY_IDX.RECEIVE_MODE]||"").trim().toUpperCase();
    const status=String(d[DELIVERY_IDX.STATUS]||"").trim().toUpperCase();
    if(dt!==DELIVERY_TYPE.YOURSTYLE||mode!==DELIVERY_RECEIVE_MODE.BULK||status!==DELIVERY_STATUS.PARTIAL)return;
    const est=Number(row[DELIVERY_IDX.ESTIMATED_QTY])||0; const actual=Number(row[DELIVERY_IDX.ACTUAL_QTY])||0;
    holders.push({sheetRow:index+2,deliveryId:id,deliveryNo:String(d[DELIVERY_IDX.DELIVERY_NO]||"").trim(),type:String(d[DELIVERY_IDX.TYPE]||"").trim().toUpperCase(),description:String(d[DELIVERY_IDX.DESCRIPTION]||"").trim(),bundleQty:Number(row[DELIVERY_IDX.BUNDLE_QTY])||0,estimatedQuantity:est,actualQuantity:actual,remainingQuantity:Math.max(0,est-actual),variance:actual-est,status:status});
  });
  return {success:true,holders:holders};
}

/* ==========================================================
   RESOLVE HOLDER SEQUENCE

   Needed because one YSD can contain multiple BULK rows.
========================================================== */

function getBulkHolderSequenceForRow(
  deliverySheet,
  sheetRow,
  deliveryId
) {
  const data = deliverySheet
    .getRange(
      2,
      1,
      sheetRow - 1,
      DELIVERY_LOG_COLUMN_COUNT
    )
    .getDisplayValues();

  let sequence = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    const rowDeliveryId = String(
      row[DELIVERY_IDX.DELIVERY_ID] || ""
    ).trim();

    const mode = String(
      row[DELIVERY_IDX.RECEIVE_MODE] || ""
    ).trim().toUpperCase();

    if (
      rowDeliveryId === deliveryId &&
      mode === DELIVERY_RECEIVE_MODE.BULK
    ) {
      sequence++;
    }
  }

  if (sequence < 1) {
    throw new Error(
      "Unable to resolve bulk holder sequence."
    );
  }

  return sequence;
}

/* ==========================================================
   7.9H-D
   GET BULK HOLDERS FOR ONE DELIVERY
========================================================== */

function getBulkHoldersForDelivery(deliveryId) {
  deliveryId = String(deliveryId || "").trim();

  if (!deliveryId) {
    throw new Error("Delivery ID is required.");
  }

  const result = getPendingBulkHolders();

  if (!result || !result.success) {
    return {
      success: false,
      holders: []
    };
  }

  return {
    success: true,

    holders: (result.holders || [])
      .filter(function(holder) {
        return (
          String(holder.deliveryId || "").trim() ===
          deliveryId
        );
      })
  };
}