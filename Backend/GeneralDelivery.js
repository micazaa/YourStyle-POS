/* ==========================================================
   GENERAL DELIVERY — SHEET HELPERS
========================================================== */

function getGeneralDeliveryLogSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DELIVERY_LOG);
  if (!sheet) throw new Error("Delivery Log sheet not found.");
  return sheet;
}

function getDeliveryItemsSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DELIVERY_ITEMS);
  if (!sheet) throw new Error("Delivery Items sheet not found.");
  return sheet;
}

function getDeliveryDistributionSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DELIVERY_DISTRIBUTION);
  if (!sheet) throw new Error("Delivery Distribution sheet not found.");
  return sheet;
}

/* ==========================================================
   GENERAL DELIVERY — DATABASE VALIDATION
========================================================== */

function validateGeneralDeliveryDatabase() {
  const checks = [
    {
      sheet: getGeneralDeliveryLogSheet(),
      headers: [
        "Delivery ID",
        "Delivery No.",
        "Delivery Date",
        "Timestamp",
        "Driver Name",
        "Plate No.",
        "Accepted By",
        "Delivery Type",
        "YourStyle Type",
        "Line Count",
        "Received Units",
        "Distribution Status",
        "Status",
        "Remarks"
      ]
    },
    {
      sheet: getDeliveryItemsSheet(),
      headers: ["Delivery ID", "Line ID", "Type", "Category", "Product Code", "Description", "Receive Mode", "Qty Received", "Est Pcs/Unit", "Estimated Pieces", "Actual Pieces", "Variance", "Distribution Status", "Status", "Remarks"]
    },
    {
      sheet: getDeliveryDistributionSheet(),
      headers: ["Delivery ID", "Line ID", "Distribution ID", "Product Code", "Description", "Qty", "Distributed By", "Timestamp", "Remarks"]
    }
  ];

  checks.forEach(function(check) {
    const actual = check.sheet.getRange(1, 1, 1, check.headers.length).getDisplayValues()[0];

    check.headers.forEach(function(expected, index) {
      if (String(actual[index] || "").trim() !== expected) {
        throw new Error(
          check.sheet.getName() +
          " column " +
          (index + 1) +
          ' should be "' +
          expected +
          '" but found "' +
          String(actual[index] || "") +
          '".'
        );
      }
    });
  });

  return {
    success: true,
    deliveryLog: "OK",
    deliveryItems: "OK",
    deliveryDistribution: "OK"
  };
}

/* ==========================================================
   GENERAL DELIVERY — NORMALIZE DATE
========================================================== */

function normalizeGeneralDeliveryDate(deliveryDate) {
  const value = String(deliveryDate || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Delivery Date must use YYYY-MM-DD format.");
  }

  const date = new Date(value + "T00:00:00");

  if (isNaN(date.getTime())) {
    throw new Error("Invalid Delivery Date.");
  }

  return value;
}


/* ==========================================================
   GENERAL DELIVERY — NEXT IDENTIFIERS

   YOURFINDS:
   YFD-20260821-001
   YF-260821-01

   YOURSTYLE:
   YSD-20260821-001
   YS-260821-01
========================================================== */

function generateDeliveryIdentifiers(deliveryType, deliveryDate) {
  deliveryType = String(deliveryType || "").trim().toUpperCase();
  deliveryDate = normalizeGeneralDeliveryDate(deliveryDate);

  let idPrefix = "";
  let noPrefix = "";

  if (deliveryType === DELIVERY_TYPE.YOURFINDS) {
    idPrefix = "YFD";
    noPrefix = "YF";
  } else if (deliveryType === DELIVERY_TYPE.YOURSTYLE) {
    idPrefix = "YSD";
    noPrefix = "YS";
  } else {
    throw new Error("Invalid Delivery Type.");
  }

  const sheet = getGeneralDeliveryLogSheet();
  const dateCode = deliveryDate.replace(/-/g, "");
  const fullPrefix = idPrefix + "-" + dateCode + "-";

  let highestSequence = 0;

  if (sheet.getLastRow() >= 2) {
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();

    ids.forEach(function(row) {
      const id = String(row[0] || "").trim().toUpperCase();

      if (!id.startsWith(fullPrefix)) return;

      const sequence = parseInt(id.substring(fullPrefix.length), 10);

      if (Number.isInteger(sequence) && sequence > highestSequence) {
        highestSequence = sequence;
      }
    });
  }

  const sequence = highestSequence + 1;
  const deliveryId = fullPrefix + String(sequence).padStart(3, "0");
  const shortDate = dateCode.substring(2);
  const deliveryNo = noPrefix + "-" + shortDate + "-" + String(sequence).padStart(2, "0");

  return {
    deliveryType: deliveryType,
    deliveryId: deliveryId,
    deliveryNo: deliveryNo,
    sequence: sequence,
    deliveryDate: deliveryDate
  };
}

/* ==========================================================
   APPEND GENERAL DELIVERY LOG
========================================================== */

function appendGeneralDeliveryLog(delivery) {
  const sheet = getGeneralDeliveryLogSheet();

  const row = [
    delivery.deliveryId || "",
    delivery.deliveryNo || "",
    delivery.deliveryDate || "",
    delivery.timestamp || new Date(),
    delivery.driverName || "",
    delivery.plateNo || "",
    delivery.acceptedBy || "",
    delivery.deliveryType || "",
    delivery.yourStyleType || "",
    Number(delivery.lineCount) || 0,
    Number(delivery.receivedUnits) || 0,
    delivery.distributionStatus || "",
    delivery.status || DELIVERY_STATUS.ACCEPTED,
    delivery.remarks || ""
  ];

  sheet.appendRow(row);

  return sheet.getLastRow();
}

/* ==========================================================
   APPEND DELIVERY ITEM
========================================================== */

function appendDeliveryItem(item) {
  const sheet = getDeliveryItemsSheet();

  const row = [
    item.deliveryId || "",
    item.lineId || "",
    item.type || "",
    item.category || "",
    item.productCode || "",
    item.description || "",
    item.receiveMode || "",
    Number(item.qtyReceived) || 0,
    item.estPcsPerUnit === "" || item.estPcsPerUnit == null ? "" : Number(item.estPcsPerUnit),
    item.estimatedPieces === "" || item.estimatedPieces == null ? "" : Number(item.estimatedPieces),
    item.actualPieces === "" || item.actualPieces == null ? "" : Number(item.actualPieces),
    item.variance === "" || item.variance == null ? "" : Number(item.variance),
    item.distributionStatus || "",
    item.status || DELIVERY_STATUS.ACCEPTED,
    item.remarks || ""
  ];

  sheet.appendRow(row);

  return sheet.getLastRow();
}

/* ==========================================================
   GET GENERAL DELIVERY BY ID
========================================================== */

function getGeneralDeliveryById(deliveryId) {
  deliveryId = String(deliveryId || "").trim().toUpperCase();

  if (!deliveryId) return null;

  const sheet = getGeneralDeliveryLogSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return null;

  const data = sheet.getRange(2, 1, lastRow - 1, GENERAL_DELIVERY_LOG_COLUMN_COUNT).getValues();
  const display = sheet.getRange(2, 1, lastRow - 1, GENERAL_DELIVERY_LOG_COLUMN_COUNT).getDisplayValues();

  for (let i = 0; i < data.length; i++) {
    if (String(display[i][GENERAL_DELIVERY_IDX.DELIVERY_ID] || "").trim().toUpperCase() !== deliveryId) continue;

    return {
      rowNumber: i + 2,
      deliveryId: String(display[i][GENERAL_DELIVERY_IDX.DELIVERY_ID] || "").trim(),
      deliveryNo: String(display[i][GENERAL_DELIVERY_IDX.DELIVERY_NO] || "").trim(),
      deliveryDate: String(display[i][GENERAL_DELIVERY_IDX.DELIVERY_DATE] || "").trim(),
      timestamp: data[i][GENERAL_DELIVERY_IDX.TIMESTAMP],
      driverName: String(display[i][GENERAL_DELIVERY_IDX.DRIVER_NAME] || "").trim(),
      plateNo: String(display[i][GENERAL_DELIVERY_IDX.PLATE_NO] || "").trim(),
      acceptedBy: String(display[i][GENERAL_DELIVERY_IDX.ACCEPTED_BY] || "").trim(),
      deliveryType: String(display[i][GENERAL_DELIVERY_IDX.DELIVERY_TYPE] || "").trim(),
      yourStyleType: String(display[i][GENERAL_DELIVERY_IDX.YOURSTYLE_TYPE] || "").trim(),
      lineCount: Number(data[i][GENERAL_DELIVERY_IDX.LINE_COUNT]) || 0,
      receivedUnits: Number(data[i][GENERAL_DELIVERY_IDX.RECEIVED_UNITS]) || 0,
      distributionStatus: String(display[i][GENERAL_DELIVERY_IDX.DISTRIBUTION_STATUS] || "").trim(),
      status: String(display[i][GENERAL_DELIVERY_IDX.STATUS] || "").trim(),
      remarks: String(display[i][GENERAL_DELIVERY_IDX.REMARKS] || "").trim()
    };
  }

  return null;
}

/* ==========================================================
   GET DELIVERY ITEMS BY DELIVERY ID
========================================================== */

function getDeliveryItemsByDeliveryId(deliveryId) {
  deliveryId = String(deliveryId || "").trim().toUpperCase();

  if (!deliveryId) return [];

  const sheet = getDeliveryItemsSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, DELIVERY_ITEMS_COLUMN_COUNT).getValues();
  const display = sheet.getRange(2, 1, lastRow - 1, DELIVERY_ITEMS_COLUMN_COUNT).getDisplayValues();
  const items = [];

  for (let i = 0; i < data.length; i++) {
    if (String(display[i][DELIVERY_ITEM_IDX.DELIVERY_ID] || "").trim().toUpperCase() !== deliveryId) continue;

    items.push({
      rowNumber: i + 2,
      deliveryId: String(display[i][DELIVERY_ITEM_IDX.DELIVERY_ID] || "").trim(),
      lineId: String(display[i][DELIVERY_ITEM_IDX.LINE_ID] || "").trim(),
      type: String(display[i][DELIVERY_ITEM_IDX.TYPE] || "").trim(),
      category: String(display[i][DELIVERY_ITEM_IDX.CATEGORY] || "").trim(),
      productCode: String(display[i][DELIVERY_ITEM_IDX.PRODUCT_CODE] || "").trim(),
      description: String(display[i][DELIVERY_ITEM_IDX.DESCRIPTION] || "").trim(),
      receiveMode: String(display[i][DELIVERY_ITEM_IDX.RECEIVE_MODE] || "").trim(),
      qtyReceived: Number(data[i][DELIVERY_ITEM_IDX.QTY_RECEIVED]) || 0,
      estPcsPerUnit: data[i][DELIVERY_ITEM_IDX.EST_PCS_PER_UNIT],
      estimatedPieces: data[i][DELIVERY_ITEM_IDX.ESTIMATED_PIECES],
      actualPieces: data[i][DELIVERY_ITEM_IDX.ACTUAL_PIECES],
      variance: data[i][DELIVERY_ITEM_IDX.VARIANCE],
      distributionStatus: String(display[i][DELIVERY_ITEM_IDX.DISTRIBUTION_STATUS] || "").trim(),
      status: String(display[i][DELIVERY_ITEM_IDX.STATUS] || "").trim(),
      remarks: String(display[i][DELIVERY_ITEM_IDX.REMARKS] || "").trim()
    });
  }

  return items;
}

/* ==========================================================
   YOURSTYLE — ACTIVE PRODUCT OPTIONS
========================================================== */

function getYourStyleDeliveryProducts() {
  const products = getProductMaster();

  const result = products
    .filter(function(item) {
      const category = String(item.category || "").trim().toUpperCase();
      const active = item.active === true || String(item.active || "").trim().toUpperCase() === "TRUE";

      return active && (
        category === "PINS" ||
        category === "OTHERS"
      );
    })
    .map(function(item) {
      return {
        productCode: String(item.productCode || item.code || "").trim(),
        description: String(item.description || item.name || "").trim(),
        category: String(item.category || "").trim().toUpperCase(),
        defaultPrice: Number(item.defaultPrice || item.price) || 0,
        inventoryType: String(item.inventoryType || "").trim().toUpperCase()
      };
    })
    .filter(function(item) {
      return item.productCode && item.description;
    });

  result.sort(function(a, b) {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.description !== b.description) return a.description.localeCompare(b.description);
    return a.defaultPrice - b.defaultPrice;
  });

  return {
    success: true,
    products: result
  };
}

/* ==========================================================
   ACCEPT YOURSTYLE DIRECT DELIVERY
   DATABASE ONLY — NO INVENTORY MOVEMENT YET
========================================================== */

function acceptYourStyleDirectDelivery(payload) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

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

    if (!productResult || !productResult.success) {
      throw new Error(
        productResult && productResult.message
          ? productResult.message
          : "Unable to load Product Master."
      );
    }

    const products = Array.isArray(productResult.products) ? productResult.products : [];
    const productMap = {};

    products.forEach(function(product) {
      const code = String(product.productCode || "").trim();
      if (code) productMap[code] = product;
    });

    const lines = [];
    let pinsUnits = 0;
    let othersUnits = 0;

    submittedLines.forEach(function(line, index) {
      const productCode = String(line.productCode || "").trim();
      const submittedType = String(line.type || "").trim().toUpperCase();
      const quantity = Number(line.quantity);
      const product = productMap[productCode];

      if (!product) {
        throw new Error("Item " + (index + 1) + ": Product Code " + productCode + " is invalid or inactive.");
      }

      const actualType = String(product.category || "").trim().toUpperCase();
      const inventoryType = String(product.inventoryType || "").trim().toUpperCase();

      if (actualType !== "PINS" && actualType !== "OTHERS") {
        throw new Error("Item " + (index + 1) + ": Product is not a YourStyle product.");
      }

      if (submittedType !== actualType) {
        throw new Error("Item " + (index + 1) + ": Product Type does not match Product Master.");
      }

      if (inventoryType !== "STOCK") {
        throw new Error("Item " + (index + 1) + ": Product must use STOCK inventory.");
      }

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99999) {
        throw new Error("Item " + (index + 1) + ": Quantity must be a whole number between 1 and 99999.");
      }

      if (actualType === "PINS") pinsUnits += quantity;
      if (actualType === "OTHERS") othersUnits += quantity;

      lines.push({
        lineId: String(index + 1).padStart(3, "0"),
        type: actualType,
        category: actualType,
        productCode: productCode,
        description: String(product.description || "").trim(),
        receiveMode: DELIVERY_RECEIVE_MODE.DIRECT,
        qtyReceived: quantity,
        estPcsPerUnit: "",
        estimatedPieces: quantity,
        actualPieces: quantity,
        variance: 0,
        distributionStatus: DELIVERY_DISTRIBUTION_STATUS.NOT_REQUIRED,
        status: DELIVERY_STATUS.ACCEPTED,
        remarks: ""
      });
    });

    const identifiers = generateDeliveryIdentifiers(
      DELIVERY_TYPE.YOURSTYLE,
      deliveryDate
    );

    let yourStyleType = "";

    if (pinsUnits > 0 && othersUnits === 0) yourStyleType = YOURSTYLE_DELIVERY_TYPE.PINS;
    if (othersUnits > 0 && pinsUnits === 0) yourStyleType = YOURSTYLE_DELIVERY_TYPE.OTHERS;

    const totalUnits = pinsUnits + othersUnits;

    appendGeneralDeliveryLog({
      deliveryId: identifiers.deliveryId,
      deliveryNo: identifiers.deliveryNo,
      deliveryDate: deliveryDate,
      timestamp: new Date(),
      driverName: driverName,
      plateNo: plateNo,
      acceptedBy: acceptedBy,
      deliveryType: DELIVERY_TYPE.YOURSTYLE,
      yourStyleType: yourStyleType,
      lineCount: lines.length,
      receivedUnits: totalUnits,
      distributionStatus: DELIVERY_DISTRIBUTION_STATUS.NOT_REQUIRED,
      status: DELIVERY_STATUS.ACCEPTED,
      remarks: remarks
    });

    lines.forEach(function(line) {
      line.deliveryId = identifiers.deliveryId;
      appendDeliveryItem(line);
    });

    return {
      success: true,
      deliveryId: identifiers.deliveryId,
      deliveryNo: identifiers.deliveryNo,
      lineCount: lines.length,
      totalUnits: totalUnits,
      pinsUnits: pinsUnits,
      othersUnits: othersUnits
    };

  } catch (err) {
    return {
      success: false,
      message: err && err.message ? err.message : String(err)
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}