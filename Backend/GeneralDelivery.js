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

    const lines = submittedLines.map(function(line, index) {
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
