function setInventoryStatusValidation_(range) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.values(INVENTORY_STATUS), true)
    .setAllowInvalid(false)
    .build();
  // Apply explicit cell rules so filtered inventory rows receive the same statuses.
  range.setDataValidations(Array.from({length:range.getNumRows()}, function() {
    return Array(range.getNumColumns()).fill(rule);
  }));
}

function formatInventoryDateForClient(value) {
  if (!value) {
    return "";
  }

  if (
    Object.prototype.toString.call(value) === "[object Date]" &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );
  }

  return String(value).trim();
}

function inventoryHasStoredDeliveryMetadata_(sheet) {
  if (!sheet || typeof sheet.getMaxColumns !== 'function' || sheet.getMaxColumns() < INVENTORY_DELIVERY_COLUMN_COUNT) return false;
  const headers = sheet.getRange(1, INV_COL.DELIVERY_ID, 1, 2).getDisplayValues()[0];
  return String(headers[0] || '').trim() === 'Delivery ID' && String(headers[1] || '').trim() === 'Date Delivered';
}

function ensureInventoryDeliveryMetadataColumns_(sheet) {
  if (inventoryHasStoredDeliveryMetadata_(sheet)) return;
  if (sheet.getMaxColumns() < INVENTORY_DELIVERY_COLUMN_COUNT) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), INVENTORY_DELIVERY_COLUMN_COUNT - sheet.getMaxColumns());
  }
  const headers = sheet.getRange(1, INV_COL.DELIVERY_ID, 1, 2).getDisplayValues()[0];
  ['Delivery ID', 'Date Delivered'].forEach(function(expected, index) {
    const header = String(headers[index] || '').trim();
    if (header && header !== expected) throw new Error('Inventory column ' + (index ? 'T' : 'S') + ' is already used. Delivery metadata was not changed.');
    if (!header && sheet.getLastRow() > 1 && sheet.getRange(2, INV_COL.DELIVERY_ID + index, sheet.getLastRow() - 1, 1).getValues().some(row => row[0] !== '' && row[0] !== null)) {
      throw new Error('Inventory delivery metadata columns contain unlabelled data. No values were overwritten.');
    }
  });
  sheet.getRange(1, INV_COL.DELIVERY_ID, 1, 2).setValues([['Delivery ID', 'Date Delivered']]);
  sheet.getRange(2, INV_COL.DELIVERY_ID, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('@');
  sheet.getRange(2, INV_COL.DATE_DELIVERED, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('yyyy-mm-dd');
}

function writeInventoryDeliveryMetadata_(sheet, rowNumbers, deliveryId, deliveryDate) {
  deliveryId = String(deliveryId || '').trim();
  if (!deliveryId || !rowNumbers.length) return;
  const date = normalizeGeneralDeliveryDate(formatInventoryDateForClient(deliveryDate));
  ensureInventoryDeliveryMetadataColumns_(sheet);
  const rows = [...new Set(rowNumbers)].sort((a,b) => a-b);
  if (rows.some(row => !Number.isInteger(row) || row < 2)) throw new Error('Delivery metadata requires inventory data rows.');
  const value = new Date(date + 'T00:00:00+08:00');
  const written = [];
  try { for (let i = 0; i < rows.length;) {
    const start = rows[i];
    let end = start;
    while (i + 1 < rows.length && rows[i + 1] === end + 1) end = rows[++i];
    const range = sheet.getRange(start, INV_COL.DELIVERY_ID, end - start + 1, 2);
    written.push({range: range, values: range.getValues()});
    range.setValues(Array.from({length: end - start + 1}, () => [deliveryId, value]));
    i++;
  }} catch (error) {
    written.reverse().forEach(function(snapshot) { try { snapshot.range.setValues(snapshot.values); } catch (rollbackError) {} });
    throw error;
  }
}

function getInventoryDeliveryMetadataByCode_(targetCode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  const metadata = {};
  if (!sheet || sheet.getLastRow() < 2) return metadata;

  const rows = targetCode
    ? readDeliveryDetailRows_(sheet, findDeliveryDetailRows_(sheet, MOVE_COL.CODE, String(targetCode).trim()), MOVE_COL.CODE, false)
        .map(row => row.slice(MOVE_IDX.TIMESTAMP, MOVE_COL.CODE))
    : sheet.getRange(2, MOVE_COL.TIMESTAMP, sheet.getLastRow() - 1, 5).getValues();
  rows.forEach(function(row) {
    const source = String(row[1] || "").trim().toUpperCase();
    const referenceId = String(row[2] || "").trim();
    const code = String(row[4] || "").trim();
    const sourceLineId = String(row[3] || "").trim();
    const deliveryId = [INVENTORY_MOVEMENT_SOURCE.DELIVERY, INVENTORY_MOVEMENT_SOURCE.DISTRIBUTION].includes(source)
      ? referenceId
      : (source === INVENTORY_MOVEMENT_SOURCE.ADJUSTMENT && /^YFD-/i.test(sourceLineId) ? sourceLineId : "");
    if (!deliveryId || !code) return;
    if (source === INVENTORY_MOVEMENT_SOURCE.DELIVERY || !metadata[code]) {
      metadata[code] = { timestamp: row[0], deliveryId: deliveryId };
    }
  });
  return metadata;
}

// Read stored receipt fields directly; older sheets fall back to delivery history.
function getInventoryDeliveryMetadataByCode(code) {
  assertAppRequest_();
  code = String(code || '').trim();
  if (!code) throw new Error('Inventory Code is required.');
  const inventory = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY);
  if (inventoryHasStoredDeliveryMetadata_(inventory)) {
    const rows = findDeliveryDetailRows_(inventory, INV_COL.CODE, code);
    const stored = rows.length ? inventory.getRange(rows[0], INV_COL.DELIVERY_ID, 1, 2).getValues()[0] : [];
    return {success: true, code: code, deliveryId: String(stored[0] || '').trim(), dateDelivered: formatInventoryDateForClient(stored[1])};
  }
  const metadata = getInventoryDeliveryMetadataByCode_(code)[code];
  if (!metadata) return {success: true, code: code, deliveryId: '', dateDelivered: ''};
  const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DELIVERY_LOG);
  const rows = findDeliveryDetailRows_(log, DELIVERY_COL.DELIVERY_ID, metadata.deliveryId);
  const deliveryDate = rows.length
    ? log.getRange(rows[0], DELIVERY_COL.DELIVERY_DATE, 1, 1).getValues()[0][0]
    : '';
  return {success: true, code: code, deliveryId: metadata.deliveryId,
    dateDelivered: formatInventoryDateForClient(deliveryDate || metadata.timestamp)};
}

function setInventoryCalculatedFields_(sheet, startRow, rowCount) {
  if (!sheet || !Number.isInteger(startRow) || startRow < 2 || !Number.isInteger(rowCount) || rowCount < 1) {
    return;
  }

  const deliveredFormulas = [];
  const soldFormulas = [];
  const returnedFormulas = [];
  const adjustmentFormulas = [];
  const stockFormulas = [];
  const statusFormulas = [];
  for (let rowNumber = startRow; rowNumber < startRow + rowCount; rowNumber++) {
    deliveredFormulas.push([
      '=IF(A' + rowNumber + '="","",SUMIFS(\'Inventory Movement Log\'!$I$2:$I,\'Inventory Movement Log\'!$F$2:$F,A' + rowNumber + ',\'Inventory Movement Log\'!$C$2:$C,"DELIVERY")+SUMIFS(\'Inventory Movement Log\'!$I$2:$I,\'Inventory Movement Log\'!$F$2:$F,A' + rowNumber + ',\'Inventory Movement Log\'!$C$2:$C,"DISTRIBUTION",\'Inventory Movement Log\'!$I$2:$I,">0"))'
    ]);
    soldFormulas.push([
      '=IF(A' + rowNumber + '="","",-SUMIFS(\'Inventory Movement Log\'!$I$2:$I,\'Inventory Movement Log\'!$F$2:$F,A' + rowNumber + ',\'Inventory Movement Log\'!$C$2:$C,"SALE"))'
    ]);
    returnedFormulas.push([
      '=IF(A' + rowNumber + '="","",-SUMIFS(\'Inventory Movement Log\'!$I$2:$I,\'Inventory Movement Log\'!$F$2:$F,A' + rowNumber + ',\'Inventory Movement Log\'!$C$2:$C,"SUPPLIER_RETURN")-SUMIFS(\'Inventory Movement Log\'!$I$2:$I,\'Inventory Movement Log\'!$F$2:$F,A' + rowNumber + ',\'Inventory Movement Log\'!$C$2:$C,"RETURN"))'
    ]);
    adjustmentFormulas.push([
      '=IF(A' + rowNumber + '="","",SUMIFS(\'Inventory Movement Log\'!$I$2:$I,\'Inventory Movement Log\'!$F$2:$F,A' + rowNumber + ',\'Inventory Movement Log\'!$C$2:$C,"ADJUSTMENT"))'
    ]);
    stockFormulas.push([
      '=IF(A' + rowNumber + '="","",SUMIF(\'Inventory Movement Log\'!$F$2:$F,A' + rowNumber + ',\'Inventory Movement Log\'!$I$2:$I))'
    ]);
    statusFormulas.push([
      '=IF(A' + rowNumber + '="","",IF(UPPER(F' + rowNumber + ')="CONVERTED","CONVERTED",IF(K' + rowNumber + '<0,"NEGATIVE STOCK",IF(K' + rowNumber + '=0,"SOLD OUT",IF(OR(E' + rowNumber + '="UNIQUE",UPPER(D' + rowNumber + ')="YOURFINDS"),"IN STOCK",IF(K' + rowNumber + '<=IFNA(XLOOKUP(A' + rowNumber + ',\'Product Master\'!$A$2:$A,\'Product Master\'!$G$2:$G),0),"LOW STOCK","IN STOCK"))))))'
    ]);
  }

  const querySheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(POS_SUMMARY_SHEET);
  if (querySheet && querySheet.getRange('A1').getDisplayValue() === 'Code') {
    if(querySheet.getMaxRows()<startRow+rowCount)querySheet.insertRowsAfter(querySheet.getMaxRows(),startRow+rowCount-querySheet.getMaxRows()+1000);
    for (let i=0;i<rowCount;i++) {
      deliveredFormulas[i]=[inventorySummaryLookup_(startRow+i,'B')];
      soldFormulas[i]=[inventorySummaryLookup_(startRow+i,'C')];
      returnedFormulas[i]=[inventorySummaryLookup_(startRow+i,'D')];
      adjustmentFormulas[i]=[inventorySummaryLookup_(startRow+i,'E')];
      stockFormulas[i]=[inventorySummaryLookup_(startRow+i,'F')];
    }
  }
  sheet.getRange(startRow, INV_COL.TOTAL_DELIVERED, rowCount, 1).setFormulas(deliveredFormulas);
  sheet.getRange(startRow, INV_COL.TOTAL_SOLD, rowCount, 1).setFormulas(soldFormulas);
  sheet.getRange(startRow, INV_COL.TOTAL_RETURNED, rowCount, 1).setFormulas(returnedFormulas);
  sheet.getRange(startRow, INV_COL.TOTAL_ADJUSTMENT, rowCount, 1).setFormulas(adjustmentFormulas);
  sheet.getRange(startRow, INV_COL.STOCK, rowCount, 1).setFormulas(stockFormulas);
  sheet.getRange(startRow, INV_COL.STOCK_STATUS, rowCount, 1).setFormulas(statusFormulas);
}

/* ==========================================================
   CUSTOM YOURFINDS SALE -> INVENTORY

   Custom YourFinds items receive a one-off CUSTOM-* code at
   checkout. Product Master is therefore resolved by size:

   S/M/L/XL -> SNE/MNE/LNE/XLNE
   Known elastic sizes remain unchanged
   Every other label uses the CUSTOM size template
========================================================== */

function normalizeYourFindsSaleSize_(size) {
  const normalized = String(size || "").trim().toUpperCase();
  const aliases = {
    S: "SNE",
    M: "MNE",
    L: "LNE",
    XL: "XLNE",
    BULKY: "BNE"
  };

  if (aliases[normalized]) return aliases[normalized];
  if (YOURFINDS_SIZE_ORDER.indexOf(normalized) !== -1) return normalized;
  return "CUSTOM";
}

function getYourFindsSaleTemplate_(size) {
  const lookupSize = normalizeYourFindsSaleSize_(size);
  const product = getActiveProducts().find(function(candidate) {
    return String(candidate.category || "").trim().toUpperCase() === "YOURFINDS" &&
      (String(candidate.description || "").trim().toUpperCase() === lookupSize ||
        (lookupSize === "BNE" && String(candidate.description || "").trim().toUpperCase() === "BULKY"));
  });

  if (!product) {
    throw new Error(
      "Active YourFinds size " + lookupSize + " was not found in Product Master."
    );
  }

  return product;
}

function ensureCustomYourFindsInventoryItem_(item) {
  item = item || {};
  const code = String(item.code || "").trim();
  const name = String(item.name || item.itemName || "").trim();
  const size = String(item.size || "").trim();
  const category = String(item.category || "").trim().toUpperCase();
  const sellingPrice = Number(item.price);
  const inventorySize = normalizeYourFindsSaleSize_(size);

  if (category !== "YOURFINDS") return { created: false, skipped: true };
  if (!code) throw new Error("Custom YourFinds item has no Product Code.");
  if (!name) throw new Error("Custom YourFinds item has no description.");
  if (!size) throw new Error("Custom YourFinds item has no size.");
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    throw new Error("Custom YourFinds item has an invalid selling price.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);
  if (!inventorySheet) throw new Error("Inventory sheet not found.");

  const lastRow = inventorySheet.getLastRow();
  let targetRowNumber = lastRow + 1;
  if (lastRow >= 2) {
    const codes = inventorySheet
      .getRange(2, INV_COL.CODE, lastRow - 1, 1)
      .getDisplayValues();
    for (let i = 0; i < codes.length; i++) {
      if (String(codes[i][0] || "").trim() === code) {
        targetRowNumber = i + 2;
        const existing = inventorySheet
          .getRange(targetRowNumber, 1, 1, INVENTORY_COLUMN_COUNT)
          .getDisplayValues()[0];
        const existingCategory = String(existing[INV_IDX.CATEGORY] || "").trim().toUpperCase();
        const existingType = String(existing[INV_IDX.INVENTORY_TYPE] || "").trim().toUpperCase();
        if (existingCategory === "YOURFINDS" && existingType === INVENTORY_TYPE.UNIQUE) {
          return { created: false, rowNumber: targetRowNumber };
        }
        break;
      }
    }
  }

  const template = getYourFindsSaleTemplate_(size);
  const now = new Date();
  const row = [
    code,
    name,
    inventorySize === "CUSTOM" ? size : inventorySize,
    "YourFinds",
    INVENTORY_TYPE.UNIQUE,
    INVENTORY_STATUS.ACTIVE,
    "",
    "",
    "",
    "",
    "",
    "",
    sellingPrice,
    0,
    template.imageUrl || "",
    now,
    now
  ];

  if (row.length !== INVENTORY_COLUMN_COUNT) {
    throw new Error("Inventory row structure does not match Inventory mapping.");
  }

  inventorySheet
    .getRange(targetRowNumber, 1, 1, INVENTORY_COLUMN_COUNT)
    .setValues([row]);
  setInventoryCalculatedFields_(inventorySheet, targetRowNumber, 1);
  SpreadsheetApp.flush();

  return {
    created: true,
    rowNumber: targetRowNumber,
    templateSize: inventorySize
  };
}

function getFullInventory(options) {
  assertAppRequest_();
  options = options || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName(SHEETS.INVENTORY);

  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const productByCode = {};
  const products = Array.isArray(options.products) ? options.products : getProductMaster_();
  products.forEach(function(product) {
    productByCode[String(product.productCode || "").trim()] = product;
  });
  const storedDeliveryMetadata = !options.cashierOnly && inventoryHasStoredDeliveryMetadata_(sheet);
  const readWidth = options.cashierOnly ? INV_COL.IMAGE : storedDeliveryMetadata ? INVENTORY_DELIVERY_COLUMN_COUNT : INVENTORY_COLUMN_COUNT;
  const deliveryMetadataByCode = options.cashierOnly || storedDeliveryMetadata || options.includeDeliveryMetadata === false ? {} : options.deliveryMetadataByCode || getInventoryDeliveryMetadataByCode_();

  /* ========================================================
     READ INVENTORY, INCLUDING STORED RECEIPT FIELDS WHEN AVAILABLE
  ======================================================== */

  const startRow=Number(options.rowNumber)||2;
  if(startRow<2 || startRow>lastRow)return [];
  const count=options.rowNumber?Math.min(lastRow-startRow+1,Math.max(1,Math.floor(Number(options.rowCount)||1))):lastRow-1;
  const data=sheet.getRange(startRow,1,count,readWidth).getValues();
  const displayData=sheet.getRange(startRow,1,count,readWidth).getDisplayValues();

  const inventory = [];

  /* ========================================================
     BUILD INVENTORY OBJECTS
  ======================================================== */

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    const displayRow = displayData[i];

    /* ================= DESCRIPTION ================= */

    const description = String(displayRow[INV_IDX.DESCRIPTION] || "").trim();

    /* ================= CODE ================= */

    const code = String(displayRow[INV_IDX.CODE] || "").trim();

    /*
      IMPORTANT:

      A newly-delivered YourFinds item may have:

      Description = blank
      Code        = populated

      Therefore only skip when BOTH are blank.
    */

    if (!description && !code) {
      continue;
    }

    /* ================= STATUS ================= */

    let status = String(displayRow[INV_IDX.STATUS] || INVENTORY_STATUS.ACTIVE)
      .trim()
      .toUpperCase();

    /* ================= INVENTORY TYPE ================= */

    const inventoryType = String(
      displayRow[INV_IDX.INVENTORY_TYPE] || INVENTORY_TYPE.STOCK
    )
      .trim()
      .toUpperCase();

    if(inventoryRowIsSoldYourFinds_({category:displayRow[INV_IDX.CATEGORY],inventoryType:inventoryType,status:status,
      stock:Number(row[INV_IDX.STOCK])||0,totalSold:Number(row[INV_IDX.TOTAL_SOLD])||0}))status=INVENTORY_STATUS.INACTIVE;

    // Cashier only needs sale choices. Skip delivery/date metadata for every item.
    if (options.cashierOnly) {
      const product = productByCode[code];
      if (status !== INVENTORY_STATUS.ACTIVE || product && product.status === PRODUCT_STATUS.DEACTIVATED) continue;
      const category = String(displayRow[INV_IDX.CATEGORY] || 'Others').trim().replace(/^WHOLE\s*SALE$/i,'WHOLESALE');
      const price = Number(row[INV_IDX.YS_PRICE]) || 0;
      if (category.toUpperCase() === 'WHOLESALE' && !(Number.isFinite(price) && price > 0)) continue;
      inventory.push({code:code, name:description,
        size:String(displayRow[INV_IDX.CATEGORY] || '').trim().toUpperCase() === 'YOURFINDS'
          ? String(displayRow[INV_IDX.SIZE] || '').trim().replace(/^BULKY$/i, 'BNE') : String(displayRow[INV_IDX.SIZE] || '').trim(),
        category:category, inventoryType:inventoryType,
        status:status, stock:Number(row[INV_IDX.STOCK]) || 0, price:price,
        regularPrice:price, imageUrl:String(row[INV_IDX.IMAGE] || '').trim(),
        bundleKind:physicalBundleSaleKind_(category,description),
        productStatus:product ? product.status : PRODUCT_STATUS.ACTIVE,
        salePrices:product ? product.salePrices : []});
      continue;
    }

    /* ================= OBJECT ================= */

    inventory.push({
      /*
        Actual Google Sheets row number.

        Data starts at Sheet Row 2,
        therefore index 0 = Row 2.
      */

      rowNumber: startRow + i,

      /* L — Image */

      imageUrl: String(displayRow[INV_IDX.IMAGE] || "").trim(),

      /* B — Description */

      name: description,

      /* C — Size */

      size: String(displayRow[INV_IDX.CATEGORY] || "").trim().toUpperCase() === "YOURFINDS"
        ? String(displayRow[INV_IDX.SIZE] || "").trim().replace(/^BULKY$/i, "BNE")
        : String(displayRow[INV_IDX.SIZE] || "").trim(),

      /* K — Original Price */

      origPrice: Number(row[INV_IDX.ORIG_PRICE]) || 0,

      /* J — Selling Price */

      price: Number(row[INV_IDX.YS_PRICE]) || 0,

      /* F — Administrative Status */

      status: status,

      /* A — Product Code */

      code: code,

      /* G — Current Stock */

      stock: Number(row[INV_IDX.STOCK]) || 0,
      totalSold: Number(row[INV_IDX.TOTAL_SOLD]) || 0,

      stockStatus: String(displayRow[INV_IDX.STOCK_STATUS] || "").trim(),

      /* D — Category */

      category: String(displayRow[INV_IDX.CATEGORY] || "Others").trim().replace(/^WHOLE\s*SALE$/i,'WHOLESALE'),

      /* E — Inventory Type */

      inventoryType: inventoryType,

      /* Low-stock threshold lives only in Product Master. */

      lowStockAt: inventoryType === INVENTORY_TYPE.UNIQUE ? 0 : Number(productByCode[code] && productByCode[code].lowStockAt) || 0,

      productStatus: inventoryType===INVENTORY_TYPE.UNIQUE || status===INVENTORY_STATUS.INACTIVE
        ? (status===INVENTORY_STATUS.INACTIVE?PRODUCT_STATUS.DEACTIVATED:PRODUCT_STATUS.ACTIVE)
        : productByCode[code] ? productByCode[code].status : PRODUCT_STATUS.ACTIVE,

      productRowNumber: productByCode[code] ? productByCode[code].rowNumber : 0,

      regularPrice: Number(row[INV_IDX.YS_PRICE]) || 0,

      salePrice: productByCode[code] ? productByCode[code].salePrice : null,

      saleQuantity: productByCode[code] ? productByCode[code].saleQuantity : null,

      saleRemaining: productByCode[code] ? productByCode[code].saleRemaining : null,

      saleEnd: productByCode[code] ? productByCode[code].saleEnd : "",

      saleReferenceId: productByCode[code] ? productByCode[code].saleReferenceId : "",

      salePrices: productByCode[code] ? productByCode[code].salePrices : [],

      /* Stored S:T values travel with the normal inventory payload. */

      deliveryMetadataLoaded: storedDeliveryMetadata,

      dateDelivered: formatInventoryDateForClient(
        storedDeliveryMetadata ? row[INV_IDX.DATE_DELIVERED] : (deliveryMetadataByCode[code] ? deliveryMetadataByCode[code].timestamp : "")
      ),

      deliveryId: storedDeliveryMetadata ? String(displayRow[INV_IDX.DELIVERY_ID] || '').trim()
        : (deliveryMetadataByCode[code] ? deliveryMetadataByCode[code].deliveryId : ""),

      /* L — Created At */

      createdAt: formatInventoryDateForClient(row[INV_IDX.CREATED_AT]),

      /* M — Updated At */

      updatedAt: formatInventoryDateForClient(row[INV_IDX.UPDATED_AT]),
    });
  }

  return inventory;
}

/* ==========================================================
   GET INVENTORY ITEM BY CODE

   READ-ONLY.

   Used by:
   - Complete YourFinds Details
   - Future Inventory Edit
========================================================== */

function getInventoryItemByCode(
  code
) {
  assertAppRequest_();

  try {

    code =
      String(
        code || ""
      ).trim();


    if (!code) {

      return {

        success: false,

        message:
          "Inventory Code is required."

      };

    }


    const inventory =
      getFullInventory();


    const item =
      inventory.find(
        function(record) {

          return String(
            record.code || ""
          ).trim() ===
          code;

        }
      );


    if (!item) {

      return {

        success: false,

        message:
          "Inventory Code " +
          code +
          " was not found."

      };

    }


    return {

      success: true,

      item:
        item

    };


  } catch (err) {

    return {

      success: false,

      message:
        err &&
        err.message
          ? err.message
          : String(err)

    };

  }

}

/* ==========================================================
   GET YOURFINDS ITEM FOR COMPLETION

   READ-ONLY.

   Only UNIQUE YourFinds inventory is allowed through.
========================================================== */

function getYourFindsItemForCompletion(
  code
) {
  assertAppRequest_();

  const result =
    getInventoryItemByCode(
      code
    );


  if (
    !result.success
  ) {

    return result;

  }


  const item =
    result.item;


  const category =
    String(
      item.category || ""
    )
      .trim()
      .toUpperCase();


  const inventoryType =
    String(
      item.inventoryType || ""
    )
      .trim()
      .toUpperCase();


  if (
    category !== "YOURFINDS" ||
    inventoryType !==
      INVENTORY_TYPE.UNIQUE
  ) {

    return {

      success: false,

      message:
        "Inventory Code " +
        code +
        " is not a YourFinds unique item."

    };

  }


  return {

    success: true,

    item:
      item

  };

}

function convertDriveImageUrl(url) {
  if (!url) {
    return "";
  }

  url = String(url).trim();

  // Standard Drive file URL
  const match = url.match(/\/file\/d\/([^/]+)/);

  if (match && match[1]) {
    const fileId = match[1];

    return "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w500";
  }

  // Already a normal/direct image URL
  return url;
}

/* ==========================================================
   YOURFINDS SIZE CODE
========================================================== */

function getYourFindsSizeCode(size) {
  const normalized = String(size || "")
    .trim()
    .toUpperCase();

  return YOURFINDS_SIZE_CODE[normalized] || "";
}

/* ==========================================================
   YOURFINDS DELIVERY DATE CODE

   July 8 2026
   2026-07-08

   becomes:

   70826
========================================================== */

function getYourFindsDateCode(deliveryDate) {
  const parts = String(deliveryDate || "").split("-");

  if (parts.length !== 3) {
    return "";
  }

  const year = parts[0];

  const month = parseInt(parts[1], 10);

  const day = parts[2];

  if (!year || isNaN(month) || !day) {
    return "";
  }

  const shortYear = year.slice(-2);

  return String(month) + day + shortYear;
}

/* ==========================================================
   ACCEPT YOURFINDS DELIVERY
========================================================== */

/* ==========================================================
   ACCEPT YOURFINDS DELIVERY

   Multi-size YourFinds receiving.

   Creates:
   - One YourFinds Delivery Log record
   - One Inventory row per physical item
   - One DELIVERY movement per physical item

   New items:
   Status         = INCOMPLETE
   Inventory Type = UNIQUE
   Stock          = 1

   Labels are NOT generated here.
   Label generation belongs to Phase 6.
========================================================== */

function acceptYourFindsDelivery(
  deliveryDate,
  driverName,
  plateNo,
  acceptedBy,
  quantities,
  remarks,
  preparedBy
) {
  assertAppRequest_();

  try {

    /* ========================================================
       NORMALIZE BASIC FIELDS
    ======================================================== */

    deliveryDate =
      String(
        deliveryDate || ""
      ).trim();

    driverName =
      String(
        driverName || ""
      ).trim();


    plateNo =
      String(
        plateNo || ""
      )
        .trim()
        .toUpperCase();


    acceptedBy =
      String(
        acceptedBy || ""
      ).trim();


    remarks =
      String(
        remarks || ""
      ).trim();


    quantities =
      quantities || {};

    preparedBy = String(preparedBy === undefined ? acceptedBy : preparedBy).trim();
    if (!preparedBy) return { success: false, message: "Prepared By is required." };

    const customSizeLabel = String(quantities.CUSTOM_LABEL || "").trim().toUpperCase();


    /* ========================================================
       VALIDATE DELIVERY DATE
    ======================================================== */

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        deliveryDate
      )
    ) {

      return {
        success: false,
        message:
          "Invalid delivery date."
      };

    }


    /* ========================================================
       NORMALIZE QUANTITIES
    ======================================================== */

    const sizeOrder = YOURFINDS_SIZE_ORDER.slice();
    const normalizedQuantities = {};
    sizeOrder.forEach(function(size) { normalizedQuantities[size] = 0; });


    let totalQty =
      0;


    for (
      let i = 0;
      i < sizeOrder.length;
      i++
    ) {

      const size =
        sizeOrder[i];


      const rawValue = size === "BNE" && quantities.BNE === undefined
        ? quantities.BULKY
        : quantities[size];


      /*
        Blank quantity means zero.
      */

      if (
        rawValue === "" ||
        rawValue === null ||
        typeof rawValue ===
        "undefined"
      ) {

        normalizedQuantities[size] =
          0;

        continue;

      }


      const quantity =
        Number(
          rawValue
        );


      if (
        !Number.isInteger(quantity) ||
        quantity < 0 ||
        quantity > 999
      ) {

        return {

          success: false,

          message:
            size +
            " quantity must be between 0 and 999."

        };

      }


      normalizedQuantities[size] =
        quantity;


      totalQty +=
        quantity;

    }


    if ((normalizedQuantities.CUSTOM || 0) > 0 && !customSizeLabel) {
      return { success: false, message: "Enter the custom YourFinds size/category." };
    }

    if (
      totalQty < 1
    ) {

      return {

        success: false,

        message:
          "Enter at least one YourFinds item."

      };

    }


    /* ========================================================
       OPTIONAL DELIVERY DETAILS

       Delivery No., Driver and Plate are allowed to be blank
       because the POS-generated Delivery ID remains the
       permanent database identifier.
    ======================================================== */

    if (!acceptedBy) {

      return {

        success: false,

        message:
          "Accepted By is required."

      };

    }


    /* ========================================================
       SHEETS
    ======================================================== */

    const ss =
      SpreadsheetApp.getActiveSpreadsheet();


    const inventorySheet =
      ss.getSheetByName(
        SHEETS.INVENTORY
      );


    const deliverySheet =
      ss.getSheetByName(
        SHEETS.DELIVERY_LOG
      );

    const productMasterSheet = ss.getSheetByName(SHEETS.PRODUCT_MASTER);


    if (!inventorySheet) {

      return {

        success: false,

        message:
          "Inventory sheet not found."

      };

    }


    if (!deliverySheet) {

      return {

        success: false,

        message:
          "Delivery Log sheet not found."

      };

    }

    if ((normalizedQuantities.CUSTOM || 0) > 0 && !productMasterSheet) {
      return { success: false, message: "Product Master sheet not found." };
    }


    /* ========================================================
       LOCK

       Prevent two users accepting deliveries simultaneously
       and generating the same Delivery ID / Item Code.
    ======================================================== */

    const lock =
      LockService.getScriptLock();


    lock.waitLock(
      30000
    );


    let createdCustomProductRow = 0;

    try {

      /* ======================================================
         GENERATE DELIVERY ID
      ====================================================== */

      const deliveryId =
        generateYourFindsDeliveryId(
          deliveryDate
        );

      /* ======================================================
        DELIVERY NUMBER

        Delivery ID:
        YFD-20260819-001

        Delivery No:
        YF-260819-01
      ====================================================== */

      const deliverySequenceText =
        String(
          deliveryId
        )
          .split("-")
          .pop();


      const deliverySequence =
        parseInt(
          deliverySequenceText,
          10
        );


      if (
        !Number.isInteger(
          deliverySequence
        ) ||
        deliverySequence < 1
      ) {

        throw new Error(
          "Unable to generate Delivery No."
        );

      }


      const deliveryNo = deliveryId;

      /* ======================================================
         GENERATE ITEM CODES
      ====================================================== */

      const generated =
        generateMultiSizeYourFindsCodes(
          inventorySheet,
          deliveryDate,
          normalizedQuantities
        );


      const allCodes =
        generated.allCodes;


      if (
        allCodes.length !==
        totalQty
      ) {

        throw new Error(
          "Generated YourFinds code count does not match delivery quantity."
        );

      }


      if (
        allCodes.length === 0
      ) {

        throw new Error(
          "No YourFinds item codes were generated."
        );

      }


      /* ======================================================
         FINAL DUPLICATE CODE CHECK

         Generator already considers existing codes, but this
         gives us an additional safety check before writing.
      ====================================================== */

      const existingCodeSet =
        {};


      const inventoryLastRow =
        inventorySheet.getLastRow();


      if (
        inventoryLastRow >= 2
      ) {

        const existingCodes =
          inventorySheet
            .getRange(
              2,
              INV_COL.CODE,
              inventoryLastRow - 1,
              1
            )
            .getDisplayValues()
            .flat();


        existingCodes.forEach(
          function (value) {

            const code =
              String(
                value || ""
              ).trim();


            if (code) {

              existingCodeSet[code] =
                true;

            }

          }
        );

      }


      for (
        let i = 0;
        i < allCodes.length;
        i++
      ) {

        const code =
          String(
            allCodes[i] || ""
          ).trim();


        if (
          existingCodeSet[code]
        ) {

          throw new Error(
            "Duplicate YourFinds Code detected: " +
            code
          );

        }

      }


      /* ======================================================
         BUILD INVENTORY ROWS A:Q
      ====================================================== */

      const now =
        new Date();

      if ((normalizedQuantities.CUSTOM || 0) > 0) {
        const customDefinition = ensureYourFindsCustomSizeDefinition_(productMasterSheet, customSizeLabel, now);
        createdCustomProductRow = customDefinition.created ? customDefinition.rowNumber : 0;
      }


      const inventoryRows =
        [];


      sizeOrder.forEach(
        function (size) {

          const sizeCodes =
            generated.bySize[size] ||
            [];


          sizeCodes.forEach(
            function (code) {

              const row = [
                code,                                            // A Product Code
                "",                                              // B Description (completed later)
                size === "CUSTOM" ? customSizeLabel : size,      // C Size
                "YourFinds",                                     // D Category
                INVENTORY_TYPE.UNIQUE,                            // E Inventory Type
                INVENTORY_STATUS.INCOMPLETE,                      // F Status
                "",                                              // G Total Delivered formula
                "",                                              // H Total Sold formula
                "",                                              // I Total Returned formula
                "",                                              // J Total Adjustment formula
                "",                                              // K Current Stock formula
                "",                                              // L Stock Status formula
                0,                                               // M Selling Price
                0,                                               // N Original Price
                "",                                              // O Image
                now,                                             // P Created At
                now                                              // Q Updated At

              ];


              if (
                row.length !==
                INVENTORY_COLUMN_COUNT
              ) {

                throw new Error(
                  "YourFinds Inventory row does not match Inventory A:Q mapping."
                );

              }


              inventoryRows.push(
                row
              );

            }
          );

        }
      );

/* ======================================================
   BUILD UNIVERSAL YOURFINDS DELIVERY ROWS A:T
   One row per received category.
====================================================== */

      const deliveryRows = [];

      sizeOrder.forEach(function(size) {
        const qty = Number(normalizedQuantities[size]) || 0;
        if (qty <= 0) return;

        const category = size === "CUSTOM" ? customSizeLabel : size;
        const deliveryRow = [
          deliveryId,
          deliveryDate,
          now,
          driverName,
          plateNo,
          preparedBy,
          acceptedBy,
          DELIVERY_TYPE.YOURFINDS,
          "YOURFINDS",
          category,
          DELIVERY_RECEIVE_MODE.DIRECT,
          "YourFinds " + category,
          "",
          "",
          qty,
          "",
          "",
          "",
          DELIVERY_STATUS.ACCEPTED,
          remarks
        ];

        if (deliveryRow.length !== DELIVERY_LOG_COLUMN_COUNT) {
          throw new Error("YourFinds Delivery row does not match universal A:T mapping.");
        }

        deliveryRows.push(deliveryRow);
      });

      if (!deliveryRows.length) {
        throw new Error("No YourFinds delivery rows were generated.");
      }

      /* ======================================================
         WRITE INVENTORY
      ====================================================== */

      const inventoryStartRow =
        inventorySheet.getLastRow() +
        1;

      ensureInventoryDeliveryMetadataColumns_(inventorySheet);


      inventorySheet
        .getRange(
          inventoryStartRow,
          1,
          inventoryRows.length,
          INVENTORY_COLUMN_COUNT
        )
        .setValues(
          inventoryRows
        );

      writeInventoryDeliveryMetadata_(inventorySheet,
        inventoryRows.map((row,index) => inventoryStartRow + index), deliveryId, deliveryDate);

      setInventoryCalculatedFields_(
        inventorySheet,
        inventoryStartRow,
        inventoryRows.length
      );


      /* ======================================================
         WRITE DELIVERY LOG
      ====================================================== */

      const deliveryLogRowNumber = deliverySheet.getLastRow() + 1;

      deliverySheet
        .getRange(
          deliveryLogRowNumber,
          1,
          deliveryRows.length,
          DELIVERY_LOG_COLUMN_COUNT
        )
        .setValues(deliveryRows);


      SpreadsheetApp.flush();


      /* ======================================================
         MOVEMENT LOG

         Each unique item entered Inventory at stock 1.

         We log directly because the Inventory rows were just
         created with Stock 1; calling changeInventoryStock()
         here would incorrectly make them Stock 2.
      ====================================================== */

      try {

        inventoryRows.forEach(
          function (row) {

            const code =
              String(
                row[
                INV_IDX.CODE
                ] || ""
              ).trim();


            const size =
              String(
                row[
                INV_IDX.SIZE
                ] || ""
              ).trim();


            logInventoryMovement({
              code: code,
              type: INVENTORY_MOVEMENT_TYPE.YOURFINDS,
              qtyChange: 1,
              stockBefore: 0,
              stockAfter: 1,
              referenceId: deliveryId,
              employee: acceptedBy,
              item: size,
              reason: "",
              source: INVENTORY_MOVEMENT_SOURCE.DELIVERY,
              bundleNo: "",
              remainingBundleQty: "",
              notes: ""
            });

          }
        );

      } catch (movementError) {

        /*
          We don't silently leave a delivery with incomplete
          movement history.

          Remove the Inventory rows and Delivery Log record
          created by this operation before returning failure.
        */

        inventorySheet.deleteRows(
          inventoryStartRow,
          inventoryRows.length
        );


        deliverySheet.deleteRows(
          deliveryLogRowNumber,
          deliveryRows.length
        );


        SpreadsheetApp.flush();


        throw new Error(
          "Delivery movement logging failed. " +
          "Delivery was rolled back. " +
          (
            movementError &&
              movementError.message
              ? movementError.message
              : String(
                movementError
              )
          )
        );

      }


      /* ======================================================
         SUCCESS
      ====================================================== */

      return {

        success:
          true,

        message:
          totalQty +
          " YourFinds item(s) accepted.",

        deliveryId:
          deliveryId,

        deliveryNo:
          deliveryNo,

        deliveryDate:
          deliveryDate,

        totalQty:
          totalQty,

        quantities:
          Object.assign({}, normalizedQuantities, { CUSTOM_LABEL: customSizeLabel }),

        codes:
          allCodes,

        codesBySize:
          generated.bySize,

        firstCode:
          allCodes[0],

        lastCode:
          allCodes[
          allCodes.length - 1
          ],

        inventoryStartRow:
          inventoryStartRow,

        inventoryEndRow:
          inventoryStartRow +
          inventoryRows.length -
          1,

        customSizeAdded:
          createdCustomProductRow > 0
            ? customSizeLabel
            : ""

      };

    } catch (error) {

      if (createdCustomProductRow > 0) {
        try {
          productMasterSheet.deleteRow(createdCustomProductRow);
        } catch (rollbackError) {}
      }

      throw error;

    } finally {

      lock.releaseLock();

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

  }

}

/* ==========================================================
   GENERATE YOURFINDS CODES

   FORMAT:

   DATE + SIZE CODE + SEQUENCE

   July 8 2026
   Size S

   70826 + 1 + 001

   = 708261001
========================================================== */

function generateYourFindsDeliveryCodes(sheet, deliveryDate, size, quantity) {
  assertAppRequest_();
  const dateCode = getYourFindsDateCode(deliveryDate);

  const sizeCode = getYourFindsSizeCode(size);

  if (!dateCode) {
    throw new Error("Invalid delivery date.");
  }

  if (!sizeCode) {
    throw new Error("Invalid YourFinds size.");
  }

  const prefix = dateCode + sizeCode;

  let highestSequence = 0;

  /* ================= EXISTING CODES ================= */

  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const existingCodes = sheet
      .getRange(2, INV_COL.CODE, lastRow - 1, 1)
      .getDisplayValues()
      .flat();

    existingCodes.forEach(function (value) {
      const code = String(value || "").trim();

      if (!code.startsWith(prefix)) {
        return;
      }

      const sequenceText = code.substring(prefix.length);

      /*
          Only accept the final
          3-digit sequence.
        */

      if (!/^\d{3}$/.test(sequenceText)) {
        return;
      }

      const sequence = parseInt(sequenceText, 10);

      if (sequence > highestSequence) {
        highestSequence = sequence;
      }
    });
  }

  /* ================= CREATE NEW CODES ================= */

  const codes = [];

  for (let i = 1; i <= quantity; i++) {
    const sequence = highestSequence + i;

    if (sequence > 999) {
      throw new Error(
        "Maximum sequence of 999 reached for this date and size."
      );
    }

    const sequenceCode = String(sequence).padStart(3, "0");

    codes.push(prefix + sequenceCode);
  }

  return codes;
}

function getSellableInventory() {
  assertAppRequest_();
  const products = getProductMaster_({cashierOnly:true});
  expireEndedProductSales_(products);
  const inventory = getFullInventory({products: products, includeDeliveryMetadata: false, cashierOnly:true});
  const sellable = inventory.filter((item) => {
    const status = String(item.status || "")
      .trim()
      .toUpperCase();
    return status === INVENTORY_STATUS.ACTIVE &&
      String(item.productStatus || PRODUCT_STATUS.ACTIVE).toUpperCase() !== PRODUCT_STATUS.DEACTIVATED;
  });

  const result = [];
  sellable.forEach(function(item) {
    const tiers = Array.isArray(item.salePrices) && item.salePrices.length
      ? item.salePrices
      : (item.salePrice === null || item.salePrice === undefined ? [] : [{
          price: item.salePrice, quantity: item.saleQuantity, remaining: item.saleRemaining,
          end: item.saleEnd, referenceId: item.saleReferenceId
        }]);
    if (String(item.productStatus || "").toUpperCase() !== PRODUCT_STATUS.ON_SALE || !tiers.length) {
      item.priceSource = "REGULAR";
      result.push(item);
      return;
    }
    let available = Math.max(0, Number(item.stock) || 0);
    const saleRows = tiers.map(function(tier) {
      const allocated = tier.remaining === null ? available : Math.min(available, Math.max(0, Number(tier.remaining) || 0));
      available -= allocated;
      return Object.assign({}, item, {
        variantKey: item.code + "|SALE|" + String(tier.referenceId || ""),
        stock: allocated, price: Number(tier.price) || 0, priceSource: "SALE",
        saleReferenceId: String(tier.referenceId || ""), saleEnd: tier.end || ""
      });
    });
    if (available > 0) result.push(Object.assign({}, item, {
      variantKey: item.code + "|REGULAR", stock: available,
      price: Number(item.regularPrice) || 0, priceSource: "REGULAR", saleReferenceId: ""
    }));
    saleRows.forEach(function(row) { if (row.stock > 0) result.push(row); });
  });
  return result;
}

function expireEndedProductSales_(products) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  products = Array.isArray(products) ? products : getProductMaster_();
  const expired = products.filter(function(product) {
    return product.status === PRODUCT_STATUS.ON_SALE &&
      (product.salePrices || []).some(function(tier) { return tier.end && tier.end < today; });
  });
  if (!expired.length) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(SHEETS.PRODUCT_MASTER);
  const inventorySheet = ss.getSheetByName(SHEETS.INVENTORY);
  expired.forEach(function(product) {
    const remaining = product.salePrices.filter(function(tier) { return !tier.end || tier.end >= today; });
    const ended = product.salePrices.filter(function(tier) { return tier.end && tier.end < today; });
    if (product.salePricesStored === false && product.salePrices.length === 1) {
      masterSheet.getRange(product.rowNumber, PRODUCT_COL.ACTIVE).setValue(true);
      masterSheet.getRange(product.rowNumber, PRODUCT_COL.STATUS).setValue(PRODUCT_STATUS.ACTIVE);
      masterSheet.getRange(product.rowNumber, PRODUCT_COL.SALE_PRICE, 1, 5).clearContent();
    } else writeProductSalePrices_(masterSheet, product.rowNumber, remaining);
    masterSheet.getRange(product.rowNumber, PRODUCT_COL.UPDATED_AT).setValue(new Date());
    const itemResult = getInventoryItemByCode(product.productCode);
    if (itemResult && itemResult.success && itemResult.item) {
      const item = itemResult.item;
      if (String(item.status).toUpperCase() !== INVENTORY_STATUS.RESERVED) inventorySheet.getRange(item.rowNumber, INV_COL.STATUS).setValue(INVENTORY_STATUS.ACTIVE);
      inventorySheet.getRange(item.rowNumber, INV_COL.UPDATED_AT).setValue(new Date());
    }
    ended.forEach(function(tier) {
      logProductStatusChange_({
        code: product.productCode, item: product.description, category: product.category,
        inventoryType: product.inventoryType,
        stock: itemResult && itemResult.success ? itemResult.item.stock : 0,
        employee: "SYSTEM", referenceId: tier.referenceId,
        previousStatus: PRODUCT_STATUS.ON_SALE,
        status: remaining.length ? PRODUCT_STATUS.ON_SALE : PRODUCT_STATUS.ACTIVE,
        salePrice: tier.price, saleQuantity: tier.quantity, saleRemaining: tier.remaining,
        saleEnd: tier.end
      });
    });
    applyProductSalePrices_(product, remaining);
  });
}

function getInventoryDisplayStatus(item) {
  const stock = Number(item.stock) || 0;

  const lowStockAt = Number(item.lowStockAt) || 0;

  const status = String(item.status || INVENTORY_STATUS.ACTIVE)
    .trim()
    .toUpperCase();

  if (status === INVENTORY_STATUS.RESERVED) return "RESERVED";

  /* ================= RETURNED ================= */

  if (status === INVENTORY_STATUS.RETURNED) {
    return "RETURNED";
  }

  /* ================= INCOMPLETE ================= */

  if (status === INVENTORY_STATUS.INCOMPLETE) {
    return "INCOMPLETE";
  }

  if (status === INVENTORY_STATUS.CONVERTED) {
    return "CONVERTED";
  }

  /* ================= INACTIVE ================= */

  if (status === INVENTORY_STATUS.INACTIVE) {
    return "INACTIVE";
  }

  /* ================= NEGATIVE STOCK ================= */

  if (stock < 0) {
    return "NEGATIVE STOCK";
  }

  /* ================= SOLD OUT ================= */

  if (stock === 0) {
    return "SOLD OUT";
  }

  /* ================= LOW STOCK ================= */

  if (lowStockAt > 0 && stock <= lowStockAt) {
    return "LOW STOCK";
  }

  return "IN STOCK";
}

/* ==========================================================
   DEDUCT INVENTORY STOCK AFTER SALE

   STOCK item:
   100 -> sell 3 -> 97

   UNIQUE item:
   1 -> sell 1 -> 0

   Custom YourFinds items:
   Created in Inventory, then deducted so their stock becomes negative.

   Also creates a SALE entry in:
   Inventory Movement Log
========================================================== */

/* ==========================================================
   DEDUCT INVENTORY STOCK AFTER SALE

   SALE wrapper around the centralized stock engine.

   STOCK:
   100 -> sell 3 -> 97

   UNIQUE:
   1 -> sell 1 -> 0

   CUSTOM YOURFINDS:
   Created from the Product Master size template, then deducted.
========================================================== */

function physicalBundleSaleKind_(category, name) {
  category = String(category || '').trim().toUpperCase().replace(/^WHOLE\s+SALE$/, 'WHOLESALE');
  const normalized = String(name || '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/\s*[·-]\s*SALE$/, '');
  if (category === 'WHOLESALE' && / · \([1-9]\d*\) PCS$/.test(normalized)) return 'FULL';
  if (category === 'PINS' || category === 'OTHERS') {
    if (normalized === 'BUNDLE') return 'FULL';
    if (normalized === 'HALF BUNDLE') return 'HALF';
  }
  return '';
}

function physicalBundleDeliveryDate_(value, deliveryId) {
  const text = formatInventoryDateForClient(value);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[ T])/);
  const legacy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/);
  const fromId = String(deliveryId || '').match(/^Y[SF]D-(\d{4})(\d{2})(\d{2})-/);
  const parts = iso ? iso.slice(1) : legacy ? [legacy[3],legacy[1],legacy[2]] : fromId ? fromId.slice(1) : null;
  if (!parts) return '';
  const key = parts[0] + '-' + String(parts[1]).padStart(2,'0') + '-' + String(parts[2]).padStart(2,'0');
  const date = new Date(key + 'T00:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0,10) === key ? key : '';
}

function getCashierBundleChoices(productCode) {
  assertAppRequest_();
  const code = String(productCode || '').trim();
  if (!code) throw new Error('Select a bundle product.');
  const version=inventoryReadVersion_(),key=inventoryResponseCacheKey_(version,'cashier-bundle-choices',[code]);
  const cached=readInventoryResponse_(key);
  if(cached)return cached;
  const {product,kind} = readCashierBundleProduct_(code,getProductMaster_({cashierOnly:true,compactRead:true}));
  const category = String(product.category).toUpperCase().replace(/^WHOLE\s+SALE$/, 'WHOLESALE');
  const queue = buildPhysicalBundleSaleQueue_(category,category === 'WHOLESALE' ? code : undefined);
  const choices = queue.filter(state => !state.distributed && !state.fullSold &&
    (kind === 'HALF' ? state.soldHalves < 2 : state.soldHalves === 0)).map(state => ({
      deliveryId:state.deliveryId,deliveryDate:state.deliveryDate,sheetRow:state.sheetRow,
      bundleNo:state.bundleNo,label:state.label,kind:kind,capacity:kind === 'HALF' ? 2-state.soldHalves : 1
    }));
  // Old standalone Wholesale stock has no physical delivery allocation to choose.
  const result={success:true,managed:category !== 'WHOLESALE' || queue.hasLinkedReceipt || queue.length > 0,choices:choices};
  cacheInventoryResponses_({[key]:result},version);
  return result;
}

function readCashierBundleProduct_(code, products) {
  const product = products.find(item => String(item.productCode) === code);
  if (!product || product.status === PRODUCT_STATUS.DEACTIVATED || product.active === false) throw new Error('This bundle product is inactive or missing. Refresh Cashier.');
  const kind = physicalBundleSaleKind_(product.category,product.description);
  if (!kind) throw new Error('This product is not a bundle.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY);
  const match = sheet && sheet.getLastRow() > 1
    ? sheet.getRange(2,INV_COL.CODE,sheet.getLastRow()-1,1).createTextFinder(code).matchEntireCell(true).findNext() : null;
  const row = match ? sheet.getRange(match.getRow(),1,1,INV_COL.YS_PRICE).getValues()[0] : null;
  if (!row || String(row[INV_IDX.STATUS]).toUpperCase() !== INVENTORY_STATUS.ACTIVE || !(Number(row[INV_IDX.YS_PRICE]) > 0)) {
    throw new Error('A manager must save an active bundle with a Selling Price in Inventory first.');
  }
  return {product:product,kind:kind};
}

function choosePhysicalBundleForSale_(queue, kind, selection, name) {
  const available = state => !state.distributed && !state.fullSold && (kind === 'HALF' ? state.soldHalves < 2 : state.soldHalves === 0);
  if (selection) {
    if (!String(selection.deliveryId || '').trim() || !Number.isInteger(Number(selection.sheetRow)) || Number(selection.sheetRow) < 2 ||
        !Number.isInteger(Number(selection.bundleNo)) || Number(selection.bundleNo) < 1) throw new Error('Invalid bundle selection. Choose the bundle again.');
    const selected = queue.find(state => state.deliveryId === String(selection.deliveryId).trim() &&
      state.sheetRow === Number(selection.sheetRow) && state.bundleNo === Number(selection.bundleNo));
    if (!selected || !available(selected)) throw new Error('Selected bundle is no longer available for ' + name + '. Choose another bundle.');
    return selected;
  }
  const first = kind === 'HALF' ? queue.find(state => available(state) && state.soldHalves === 1) : null;
  const selected = first || queue.find(available);
  if (!selected) throw new Error('No eligible delivered bundle is available for ' + name + '.');
  return selected;
}

function buildPhysicalBundleSaleQueue_(category, productCode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const deliverySheet = ss.getSheetByName(SHEETS.DELIVERY_LOG);
  const movementSheet = ss.getSheetByName(SHEETS.INVENTORY_MOVEMENT_LOG);
  if (!deliverySheet || deliverySheet.getLastRow() < 2) return [];
  const deliveries = deliverySheet.getRange(2, 1, deliverySheet.getLastRow() - 1, DELIVERY_LOG_COLUMN_COUNT).getValues();
  const movements = movementSheet && movementSheet.getLastRow() >= 2
    ? movementSheet.getRange(2, 1, movementSheet.getLastRow() - 1, MOVEMENT_LOG_COLUMN_COUNT).getValues()
    : [];
  const wanted = String(category || "").trim().toUpperCase();
  const receipts = new Map(), splitRows = [];
  movements.forEach(row => {
    if (parseBundleSplitNote_(row[MOVE_IDX.NOTES])) splitRows.push(row);
    if (String(row[MOVE_IDX.SOURCE]) === INVENTORY_MOVEMENT_SOURCE.DELIVERY && String(row[MOVE_IDX.NOTES]).trim() === 'PHYSICAL_BUNDLE_RECEIPT') {
      receipts.set(String(row[MOVE_IDX.SOURCE_LINE_ID] || '').trim(), String(row[MOVE_IDX.CODE] || '').trim());
    }
  });
  const holderSequences = {};
  const states = [];
  states.hasLinkedReceipt = !!productCode && (Array.from(receipts.values()).includes(String(productCode)) ||
    splitRows.some(row => String(parseBundleSplitNote_(row[MOVE_IDX.NOTES]).productCode) === String(productCode)));
  deliveries.forEach(function(row, index) {
    const type = String(row[DELIVERY_IDX.TYPE] || "").trim().toUpperCase();
    const status = String(row[DELIVERY_IDX.STATUS] || "").trim().toUpperCase();
    if (String(row[DELIVERY_IDX.RECEIVE_MODE] || "").trim().toUpperCase() !== DELIVERY_RECEIVE_MODE.BULK) return;
    const id = String(row[DELIVERY_IDX.DELIVERY_ID] || '').trim();
    holderSequences[id] = (holderSequences[id] || 0) + 1;
    const holderCode = id + '-B' + String(holderSequences[id]).padStart(2, '0');
    const receiptCode = receipts.get(holderCode);
    if (!productCode && (type !== wanted || receiptCode)) return;
    if (status !== DELIVERY_STATUS.PENDING && status !== DELIVERY_STATUS.PARTIAL) return;
    const qty = Math.max(0, Number(row[DELIVERY_IDX.BUNDLE_QTY]) || 0);
    physicalBundleDefinitions_(id,index+2,qty,splitRows).forEach(bundle => {
      if (productCode && (bundle.productCode || receiptCode) !== String(productCode)) return;
      const bundleNo = bundle.bundleNo;
      states.push({deliveryId:id,deliveryDate:physicalBundleDeliveryDate_(row[DELIVERY_IDX.DELIVERY_DATE],id),label:bundle.label,
        sheetRow:index+2,bundleNo:bundleNo,type:type,distributed:!!bundle.split,fullSold:false,soldHalves:0});
    });
  });
  movements.forEach(function(row) {
    const source = String(row[MOVE_IDX.SOURCE] || "").trim().toUpperCase();
    const bundleNo = Number(row[MOVE_IDX.BUNDLE_NO]);
    if (!Number.isInteger(bundleNo)) return;
    if (source === INVENTORY_MOVEMENT_SOURCE.DISTRIBUTION && Number(row[MOVE_IDX.QTY_CHANGE]) > 0) {
      const id = String(row[MOVE_IDX.REFERENCE_ID] || "").trim();
      const type = String(row[MOVE_IDX.TYPE] || "").trim().toUpperCase();
      const state = states.find(function(item) { return item.deliveryId === id && item.type === type && item.bundleNo === bundleNo && movementMatchesBundleHolder_(row,item.sheetRow); });
      if (state) state.distributed = true;
      return;
    }
    if (!(source === INVENTORY_MOVEMENT_SOURCE.SALE || isSupplierReturnSource_(source))||Number(row[MOVE_IDX.QTY_CHANGE])>=0) return;
    const allocation = parsePhysicalBundleAllocationNote_(inventoryMovementInternalNotes_(row));
    if (!allocation) return;
    const state = states.find(function(item) {
      return item.deliveryId === allocation.deliveryId && (!allocation.sheetRow || item.sheetRow === allocation.sheetRow) && item.bundleNo === bundleNo;
    });
    if (!state) return;
    if (allocation.kind === "FULL") state.fullSold = true;
    if (allocation.kind === "HALF") state.soldHalves = Math.min(2, state.soldHalves + 1);
  });
  states.sort(function(a, b) {
    return (a.deliveryDate || '9999-12-31').localeCompare(b.deliveryDate || '9999-12-31') || a.sheetRow - b.sheetRow || a.bundleNo - b.bundleNo;
  });
  return states;
}

function deductInventoryStock(soldItems, receiptId, employeeName, productSnapshot, prepareOnly) {
  assertAppRequest_();
  /* ========================================================
     VALIDATE
  ======================================================== */

  if (!Array.isArray(soldItems) || soldItems.length === 0) {
    return [];
  }

  const movements = [];
  productSnapshot = Array.isArray(productSnapshot) ? productSnapshot : getProductMaster_();
  const queues = {};
  const selectedProducts = {};

  /* ========================================================
     PROCESS SOLD ITEMS
  ======================================================== */

  soldItems.forEach(function (item) {
    /* ================= INVALID ITEM ================= */

    if (!item) {
      return;
    }
    if (item.isCustom && item.bundleSelection) throw new Error('Choose the registered bundle product instead of a custom item.');

    /* ================= CUSTOM ITEM ================= */

    if (item.isCustom) {
      const customCategory = String(item.category || "").trim().toUpperCase();
      if (customCategory !== "YOURFINDS") return;
      ensureCustomYourFindsInventoryItem_(item);
    }

    /* ================= CODE ================= */

    const code = String(item.code || "").trim();

    if (!code) {
      throw new Error(
        "Inventory item has no Code: " + (item.name || "Unknown item")
      );
    }

    /* ================= QUANTITY ================= */

    const quantitySold = parseInt(item.quantity, 10);

    if (!Number.isInteger(quantitySold) || quantitySold < 1) {
      throw new Error("Invalid sale quantity for " + (item.name || code));
    }
    if (item.bundleSelection && !Number.isInteger(Number(item.quantity))) throw new Error('Selected bundle quantity must be a whole number.');

    /* ======================================================
         CENTRAL STOCK ENGINE

         Example:

         Stock Before  75
         Qty Change    -2
         Stock After   73

         changeInventoryStock() handles:

         ✓ Find Inventory Code
         ✓ Read current stock
         ✓ Prevent negative stock
         ✓ Update Inventory
         ✓ Write Inventory Movement
         ✓ Roll stock back if movement logging fails
      ====================================================== */

  const category = String(item.category || "").trim().toUpperCase().replace(/^WHOLE\s+SALE$/, 'WHOLESALE');
  const bundleName = normalizePhysicalBundleName_(item.name);
  const namedBundle = category === 'WHOLESALE' && / · \([1-9]\d*\) PCS$/.test(bundleName);
  if (item.bundleSelection) {
    if (!selectedProducts[code]) selectedProducts[code] = readCashierBundleProduct_(code,productSnapshot);
    const product = selectedProducts[code].product;
    if (!product || !physicalBundleSaleKind_(product.category,product.description) ||
        physicalBundleSaleKind_(product.category,product.description) !== physicalBundleSaleKind_(category,item.name) ||
        String(product.category).toUpperCase().replace(/^WHOLE\s+SALE$/, 'WHOLESALE') !== category ||
        product.status === PRODUCT_STATUS.DEACTIVATED || product.active === false) throw new Error('Bundle product changed. Refresh Cashier and choose its bundle again.');
    if (physicalBundleSaleKind_(category,item.name) === 'FULL' && quantitySold !== 1) throw new Error('Each selected full bundle must be a separate cart item.');
  }
  if (namedBundle) {
    const key = 'product:' + code;
    if (!queues[key]) queues[key] = buildPhysicalBundleSaleQueue_(category, code);
    const queue = queues[key];
    // Wholesale stock without a linked bundle receipt remains a regular stock product.
    if (!queue.length && !queue.hasLinkedReceipt && !item.bundleSelection) {
      movements.push({code:code,qtyChange:-quantitySold,referenceId:receiptId,sourceLineId:String(item.salesLineId||''),employee:employeeName,item:String(item.name||''),reason:'',source:INVENTORY_MOVEMENT_SOURCE.SALE,notes:''});
      return;
    }
    for (let unit=0;unit<quantitySold;unit++) {
      const holder = choosePhysicalBundleForSale_(queue,'FULL',item.bundleSelection,item.name);
      movements.push({code:code,qtyChange:-1,referenceId:receiptId,sourceLineId:String(item.salesLineId||''),employee:employeeName,item:String(item.name||''),reason:'',
        source:INVENTORY_MOVEMENT_SOURCE.SALE,bundleNo:holder.bundleNo,notes:physicalBundleAllocationNote_(holder.deliveryId,'FULL',holder.sheetRow),
        expectedStatus:item.bundleSelection ? INVENTORY_STATUS.ACTIVE : undefined});
      holder.fullSold = true;
    }
    return;
  }
  const bundleKind = bundleName === "BUNDLE" ? "FULL" : (bundleName === "HALF BUNDLE" ? "HALF" : "");
  if (!bundleKind || (category !== "PINS" && category !== "OTHERS")) {
    movements.push({code:code,qtyChange:-quantitySold,referenceId:receiptId,sourceLineId:String(item.salesLineId||"").trim(),employee:employeeName,item:String(item.name||"").trim(),reason:"",source:INVENTORY_MOVEMENT_SOURCE.SALE,notes:""});
    return;
  }

  if (!queues[category]) queues[category] = buildPhysicalBundleSaleQueue_(category);
  const queue = queues[category];
  const fullProduct = findPhysicalBundleProduct_(productSnapshot, category, "FULL");
  if (bundleKind === "HALF" && !fullProduct) throw new Error("BUNDLE product is missing from Product Master for " + category + ".");
  for (let unit = 0; unit < quantitySold; unit++) {
    const holder = choosePhysicalBundleForSale_(queue,bundleKind,item.bundleSelection,item.name);
    const note = physicalBundleAllocationNote_(holder.deliveryId, bundleKind, holder.sheetRow);
    if (bundleKind === "HALF" && holder.soldHalves === 0) {
      movements.push({code:fullProduct.productCode,qtyChange:-1,referenceId:receiptId,sourceLineId:String(item.salesLineId||"").trim(),employee:employeeName,item:fullProduct.description,reason:"SPLIT INTO HALVES",source:INVENTORY_MOVEMENT_SOURCE.ADJUSTMENT,bundleNo:holder.bundleNo,notes:"Split for " + holder.deliveryId});
      movements.push({code:code,qtyChange:2,referenceId:receiptId,sourceLineId:String(item.salesLineId||"").trim(),employee:employeeName,item:String(item.name||"").trim(),reason:"SPLIT FROM BUNDLE",source:INVENTORY_MOVEMENT_SOURCE.ADJUSTMENT,bundleNo:holder.bundleNo,notes:"Split from " + holder.deliveryId});
    }
    movements.push({code:code,qtyChange:-1,referenceId:receiptId,sourceLineId:String(item.salesLineId||"").trim(),employee:employeeName,item:String(item.name||"").trim(),reason:"",source:INVENTORY_MOVEMENT_SOURCE.SALE,bundleNo:holder.bundleNo,notes:note,
      expectedStatus:item.bundleSelection ? INVENTORY_STATUS.ACTIVE : undefined});
    if (bundleKind === "FULL") holder.fullSold = true;
    else holder.soldHalves++;
  }
  });
  return prepareOnly ? movements : changeInventoryStockBatch_(movements);
}

/* ==========================================================
   GENERATE YOURFINDS DELIVERY ID

   FORMAT:

   YFD-YYYYMMDD-###

   Example:
   YFD-20260815-001
========================================================== */

function generateYourFindsDeliveryId(deliveryDate) {
  assertAppRequest_();
  return generateDeliveryIdentifiers(DELIVERY_TYPE.YOURFINDS, deliveryDate).deliveryId;
}

/* ==========================================================
   GENERATE MULTI-SIZE YOURFINDS CODES

   Generation order:

   S
   M
   L
   XL
   E
========================================================== */

function generateMultiSizeYourFindsCodes(
  inventorySheet,
  deliveryDate,
  quantities
) {
  assertAppRequest_();
  const sizeOrder = YOURFINDS_SIZE_ORDER.slice();

  const result = {
    allCodes: [],

    bySize: {},
  };

  sizeOrder.forEach(function (size) {
    const quantity = size === "BNE" && quantities.BNE === undefined
      ? Number(quantities.BULKY) || 0
      : Number(quantities[size]) || 0;

    if (quantity <= 0) {
      result.bySize[size] = [];

      return;
    }

    const codes = generateYourFindsDeliveryCodes(
      inventorySheet,
      deliveryDate,
      size,
      quantity
    );

    result.bySize[size] = codes;

    result.allCodes = result.allCodes.concat(codes);
  });

  return result;
}

/* ==========================================================
   GET NEXT YOURFINDS DELIVERY NUMBER

   READ-ONLY PREVIEW.

   Final Delivery ID / Delivery No. will still be generated
   again inside the locked acceptance transaction.
========================================================== */
function getNextYourFindsDeliveryNumber(
  deliveryDate
) {
  assertAppRequest_();

  try {

    deliveryDate =
      String(
        deliveryDate || ""
      ).trim();


    const deliveryId =
      generateYourFindsDeliveryId(
        deliveryDate
      );


    const deliverySequenceText =
      String(
        deliveryId
      )
        .split("-")
        .pop();


    const deliverySequence =
      parseInt(
        deliverySequenceText,
        10
      );


    if (
      !Number.isInteger(deliverySequence) ||
      deliverySequence < 1
    ) {

      throw new Error(
        "Unable to determine next delivery sequence."
      );

    }


    const deliveryNo = deliveryId;


    return {

      success: true,

      deliveryId:
        deliveryId,

      deliveryNo:
        deliveryNo

    };


  } catch (err) {

    return {

      success: false,

      message:
        err &&
        err.message
          ? err.message
          : String(err)

    };

  }

}

/* ==========================================================
   BUILD YOURFINDS DELIVERY NO.

   Delivery ID:
   YFD-20260819-001

   Delivery No:
   YF-260819-01
========================================================== */

function buildYourFindsDeliveryNo(
  deliveryDate,
  sequence
) {
  assertAppRequest_();

  deliveryDate =
    String(
      deliveryDate || ""
    ).trim();


  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      deliveryDate
    )
  ) {

    throw new Error(
      "Invalid delivery date."
    );

  }


  sequence =
    Number(
      sequence
    );


  if (
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence > 999
  ) {

    throw new Error(
      "Invalid delivery sequence."
    );

  }


  const parts =
    deliveryDate.split("-");


  const year =
    parts[0].slice(-2);


  const month =
    parts[1];


  const day =
    parts[2];


  return (
    "YF-" +
    year +
    month +
    day +
    "-" +
    String(sequence).padStart(
      2,
      "0"
    )
  );

}

function testNextDeliveryNumber() {
  assertAppRequest_();

  const result =
    getNextYourFindsDeliveryNumber(
      "2026-08-19"
    );

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

}

function testYourFindsCompletionLookup() {
  assertAppRequest_();

  const result =
    getYourFindsItemForCompletion(
      "819261004"
    );


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

}
