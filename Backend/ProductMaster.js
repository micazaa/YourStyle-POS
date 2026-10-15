/* ==========================================================
   YOURSTYLE POS
   PRODUCT MASTER
========================================================== */

/* ==========================================================
   GET FULL PRODUCT MASTER

   Read-only for now.

   Product Master:
   A  Product Code
   B  Description
   C  Category
   D  Inventory Type
   E  Selling Price
   F  Cost Price
   G  Low Stock At
   H  Active
   I  Image
   J  Created At
   K  Updated At
========================================================== */

function getProductMaster_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName(SHEETS.PRODUCT_MASTER);

  if (!sheet) {
    throw new Error("Product Master sheet not found.");
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const data = sheet
    .getRange(2, 1, lastRow - 1, PRODUCT_MASTER_COLUMN_COUNT)
    .getValues();

  const displayData = sheet
    .getRange(2, 1, lastRow - 1, PRODUCT_MASTER_COLUMN_COUNT)
    .getDisplayValues();
  const hasSalePrices = hasProductSalePricesColumn_(sheet);
  const salePriceRows = hasSalePrices
    ? sheet.getRange(2, PRODUCT_COL.SALE_PRICES, lastRow - 1, 1).getValues()
    : [];

  const products = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    const displayRow = displayData[i];

    /* ================= PRODUCT CODE ================= */

    const productCode = String(
      displayRow[PRODUCT_IDX.PRODUCT_CODE] || ""
    ).trim();

    /* ================= DESCRIPTION ================= */

    const description = String(
      displayRow[PRODUCT_IDX.DESCRIPTION] || ""
    ).trim();

    /*
      Ignore completely empty rows.

      A valid Product Master record will eventually
      require both Code and Description, but the
      read-only function shouldn't crash because
      somebody left a partially-filled row.
    */

    if (!productCode && !description) {
      continue;
    }

    /* ================= ACTIVE ================= */

    const rawActive = row[PRODUCT_IDX.ACTIVE];
    const legacyActive =
      rawActive === true || String(rawActive).trim().toUpperCase() === "TRUE";
    const storedStatus = String(displayRow[PRODUCT_IDX.STATUS] || "").trim().toUpperCase();
    const status = storedStatus === PRODUCT_STATUS.ON_SALE || storedStatus === PRODUCT_STATUS.DEACTIVATED
      ? storedStatus
      : (legacyActive ? PRODUCT_STATUS.ACTIVE : PRODUCT_STATUS.DEACTIVATED);
    const active = status !== PRODUCT_STATUS.DEACTIVATED;
    const saleQuantityRaw = row[PRODUCT_IDX.SALE_QUANTITY];
    const saleRemainingRaw = row[PRODUCT_IDX.SALE_REMAINING];
    const saleQuantity = saleQuantityRaw === "" || saleQuantityRaw === null
      ? null
      : Number(saleQuantityRaw) || 0;
    const saleRemaining = saleRemainingRaw === "" || saleRemainingRaw === null
      ? saleQuantity
      : Number(saleRemainingRaw) || 0;
    const legacySalePrice = row[PRODUCT_IDX.SALE_PRICE] === "" || row[PRODUCT_IDX.SALE_PRICE] === null
      ? null : Number(row[PRODUCT_IDX.SALE_PRICE]) || 0;
    const legacySaleReferenceId = String(displayRow[PRODUCT_IDX.SALE_REFERENCE_ID] || "").trim() ||
      (status === PRODUCT_STATUS.ON_SALE ? "SALE-MANUAL-" + productCode : "");
    const legacySale = status === PRODUCT_STATUS.ON_SALE && legacySalePrice !== null
      ? [{price: legacySalePrice, quantity: saleQuantity, remaining: saleRemaining,
          end: formatProductMasterDateForClient(row[PRODUCT_IDX.SALE_END]), referenceId: legacySaleReferenceId}]
      : [];
    let salePrices = legacySale;
    if (status === PRODUCT_STATUS.ON_SALE && hasSalePrices && salePriceRows[i][0]) {
      try {
        const parsed = JSON.parse(String(salePriceRows[i][0]));
        if (!Array.isArray(parsed) || !parsed.length) throw new Error("Expected sale price rows.");
        salePrices = parsed.map(function(tier) {
          const price = Number(tier.price);
          const quantity = tier.quantity == null ? null : Number(tier.quantity);
          const remaining = tier.remaining == null ? quantity : Number(tier.remaining);
          const referenceId = String(tier.referenceId || "").trim();
          if (!Number.isFinite(price) || price < 0 || !referenceId ||
              (quantity !== null && (!Number.isInteger(quantity) || quantity < 1)) ||
              (remaining !== null && (!Number.isInteger(remaining) || remaining < 0 ||
                quantity !== null && remaining > quantity))) {
            throw new Error("Invalid allocation.");
          }
          return {price: price, quantity: quantity, remaining: remaining,
            end: String(tier.end || "").slice(0, 10), referenceId: referenceId};
        });
        if (new Set(salePrices.map(function(tier) { return tier.referenceId; })).size !== salePrices.length ||
            (salePrices.length > 1 && salePrices.some(function(tier) { return tier.quantity === null; }))) {
          throw new Error("Duplicate references or an unallocated price row.");
        }
      } catch (error) {
        throw new Error("Invalid Sale Prices for Product Master row " + (i + 2) + ": " + error.message);
      }
    }
    const primarySale = salePrices[0] || null;

    /* ================= PRODUCT OBJECT ================= */

    products.push({
      rowNumber: i + 2,

      productCode: productCode,

      description: description,

      category: String(displayRow[PRODUCT_IDX.CATEGORY] || "").trim(),

      sellingPrice: Number(row[PRODUCT_IDX.SELLING_PRICE]) || 0,

      defaultPrice: Number(row[PRODUCT_IDX.SELLING_PRICE]) || 0,

      costPrice: row[PRODUCT_IDX.COST_PRICE] === "" || row[PRODUCT_IDX.COST_PRICE] === null
        ? null
        : Number(row[PRODUCT_IDX.COST_PRICE]) || 0,

      inventoryType: String(displayRow[PRODUCT_IDX.INVENTORY_TYPE] || "")
        .trim()
        .toUpperCase(),

      lowStockAt: Number(row[PRODUCT_IDX.LOW_STOCK_AT]) || 0,

      active: active,

      status: status,

      salePrice: primarySale ? primarySale.price : null,

      saleQuantity: primarySale ? primarySale.quantity : null,

      saleRemaining: primarySale ? primarySale.remaining : null,

      saleEnd: primarySale ? primarySale.end : "",

      saleReferenceId: primarySale ? primarySale.referenceId : "",

      salePrices: salePrices,

      salePricesStored: Boolean(hasSalePrices && salePriceRows[i][0]),

      imageUrl: String(displayRow[PRODUCT_IDX.IMAGE] || "").trim(),

      createdAt: formatProductMasterDateForClient(row[PRODUCT_IDX.CREATED_AT]),

      updatedAt: formatProductMasterDateForClient(row[PRODUCT_IDX.UPDATED_AT]),
    });
  }

  return products;
}

function hasProductSalePricesColumn_(sheet) {
  return typeof sheet.getMaxColumns === "function" && sheet.getMaxColumns() >= PRODUCT_COL.SALE_PRICES &&
    String(sheet.getRange(1, PRODUCT_COL.SALE_PRICES).getDisplayValues()[0][0] || "").trim() === "Sale Prices";
}

function ensureProductSalePricesColumn_(sheet) {
  if (sheet.getMaxColumns() < PRODUCT_COL.SALE_PRICES) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), PRODUCT_COL.SALE_PRICES - sheet.getMaxColumns());
  }
  const header = String(sheet.getRange(1, PRODUCT_COL.SALE_PRICES).getDisplayValues()[0][0] || "").trim();
  if (header && header !== "Sale Prices") throw new Error("Product Master column R is already in use.");
  if (!header) sheet.getRange(1, PRODUCT_COL.SALE_PRICES).setValue("Sale Prices");
}

function writeProductSalePrices_(sheet, rowNumber, prices) {
  const activePrices = (prices || []).filter(function(tier) {
    return tier.remaining === null || Number(tier.remaining) > 0;
  });
  const useSalePricesColumn = activePrices.length > 0 || hasProductSalePricesColumn_(sheet);
  if (useSalePricesColumn) ensureProductSalePricesColumn_(sheet);
  const first = activePrices[0] || null;
  sheet.getRange(rowNumber, PRODUCT_COL.STATUS, 1, 6).setValues([[
    first ? PRODUCT_STATUS.ON_SALE : PRODUCT_STATUS.ACTIVE,
    first ? first.price : "", first && first.quantity !== null ? first.quantity : "",
    first && first.remaining !== null ? first.remaining : "",
    first ? first.end : "", first ? first.referenceId : ""
  ]]);
  if (useSalePricesColumn) sheet.getRange(rowNumber, PRODUCT_COL.SALE_PRICES).setValue(activePrices.length ? JSON.stringify(activePrices) : "");
  return activePrices;
}

function applyProductSalePrices_(product, prices) {
  product.salePrices = prices;
  product.status = prices.length ? PRODUCT_STATUS.ON_SALE : PRODUCT_STATUS.ACTIVE;
  product.active = true;
  const first = prices[0] || null;
  product.salePrice = first ? first.price : null;
  product.saleQuantity = first ? first.quantity : null;
  product.saleRemaining = first ? first.remaining : null;
  product.saleEnd = first ? first.end : "";
  product.saleReferenceId = first ? first.referenceId : "";
}

/* ==========================================================
   GET ACTIVE PRODUCTS

   Used later by:
   - Regular Delivery
   - Inventory Add
   - Product selectors

   Inactive Product Master records remain available
   historically but aren't offered for new operations.
========================================================== */

function getActiveProducts() {
  const products = getProductMaster_();

  return products.filter(function (product) {
    return product.active === true;
  }).map(publicProduct_);
}

function normalizeYourFindsCustomSizeLabel_(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function isStandardYourFindsSizeLabel_(value) {
  const label = normalizeYourFindsCustomSizeLabel_(value);
  return ["S", "M", "L", "XL", "SNE", "MNE", "LNE", "XLNE", "SE", "ME", "LE", "XLE", "CUSTOM"].indexOf(label) !== -1;
}

function getYourFindsCustomSizes() {
  const found = {};
  getProductMaster_().forEach(function(product) {
    if (String(product.category || "").trim().toUpperCase() !== "YOURFINDS") return;
    const label = normalizeYourFindsCustomSizeLabel_(product.description);
    if (!label || isStandardYourFindsSizeLabel_(label)) return;
    found[label] = true;
  });
  return Object.keys(found).sort();
}

function generateYourFindsSizeProductCode_() {
  const used = {};
  getProductMaster_().forEach(function(product) {
    const code = String(product.productCode || "").trim();
    if (code) used[code] = true;
  });
  if (typeof getFullInventory === "function") {
    getFullInventory().forEach(function(item) {
      const code = String(item.code || "").trim();
      if (code) used[code] = true;
    });
  }
  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!used[code]) return code;
  }
  throw new Error("Unable to generate a unique Product Code.");
}

function prepareYourFindsCustomSizes() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PRODUCT_MASTER);
  if (!sheet) throw new Error("Product Master sheet not found.");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    getProductMaster_().forEach(function(product) {
      const label = normalizeYourFindsCustomSizeLabel_(product.description);
      if (String(product.category || "").trim().toUpperCase() !== "YOURFINDS" ||
          !label || isStandardYourFindsSizeLabel_(label)) return;
      let changed = false;
      if (String(product.category || "").trim() !== "YOURFINDS") {
        sheet.getRange(product.rowNumber, PRODUCT_COL.CATEGORY).setValue("YOURFINDS");
        changed = true;
      }
      if (!product.productCode) {
        sheet.getRange(product.rowNumber, PRODUCT_COL.PRODUCT_CODE).setValue(generateYourFindsSizeProductCode_());
        changed = true;
      }
      if (changed) sheet.getRange(product.rowNumber, PRODUCT_COL.UPDATED_AT).setValue(new Date());
    });
    return getYourFindsCustomSizes();
  } finally {
    lock.releaseLock();
  }
}

function ensureYourFindsCustomSizeDefinition_(sheet, sizeLabel, now) {
  const label = normalizeYourFindsCustomSizeLabel_(sizeLabel);
  if (!label || isStandardYourFindsSizeLabel_(label)) {
    throw new Error("Enter a valid custom YourFinds size.");
  }

  const existing = getProductMaster_().find(function(product) {
    return String(product.category || "").trim().toUpperCase() === "YOURFINDS" &&
      normalizeYourFindsCustomSizeLabel_(product.description) === label;
  });
  if (existing) {
    let productCode = String(existing.productCode || "").trim();
    if (String(existing.category || "").trim() !== "YOURFINDS") {
      sheet.getRange(existing.rowNumber, PRODUCT_COL.CATEGORY).setValue("YOURFINDS");
    }
    if (!productCode) {
      productCode = generateYourFindsSizeProductCode_();
      sheet.getRange(existing.rowNumber, PRODUCT_COL.PRODUCT_CODE).setValue(productCode);
      sheet.getRange(existing.rowNumber, PRODUCT_COL.UPDATED_AT).setValue(now);
    }
    return { created: false, rowNumber: existing.rowNumber, size: label, productCode: productCode };
  }

  const rowNumber = sheet.getLastRow() + 1;
  const productCode = generateYourFindsSizeProductCode_();
  sheet.appendRow([productCode, label, "YOURFINDS", INVENTORY_TYPE.UNIQUE, 0, "", 0, true, "", now, now,
    PRODUCT_STATUS.ACTIVE, "", "", "", "", ""]);
  return { created: true, rowNumber: rowNumber, size: label, productCode: productCode };
}

/* ==========================================================
   PRODUCT MASTER DATE → CLIENT SAFE STRING
========================================================== */

function formatProductMasterDateForClient(value) {
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
      "yyyy-MM-dd HH:mm:ss"
    );
  }

  return String(value).trim();
}
/* ==========================================================
   VALIDATE PRODUCT MASTER

   READ-ONLY.

   Checks:
   - Missing Product Code
   - Duplicate Product Code
   - Missing Description
   - Missing Category
   - Invalid Default Price
   - Invalid Original Price
   - Invalid Inventory Type
   - Invalid Low Stock threshold
   - Invalid Active value
   - Duplicate product definitions
========================================================== */

function validateProductMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName(SHEETS.PRODUCT_MASTER);

  if (!sheet) {
    return {
      valid: false,
      recordCount: 0,
      errorCount: 1,
      warningCount: 0,
      errors: ["Product Master sheet not found."],
      warnings: [],
    };
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {
      valid: true,
      recordCount: 0,
      errorCount: 0,
      warningCount: 1,
      errors: [],
      warnings: ["Product Master is empty."],
    };
  }

  const data = sheet
    .getRange(2, 1, lastRow - 1, PRODUCT_MASTER_COLUMN_COUNT)
    .getValues();

  const displayData = sheet
    .getRange(2, 1, lastRow - 1, PRODUCT_MASTER_COLUMN_COUNT)
    .getDisplayValues();

  const errors = [];
  const warnings = [];

  const codeMap = {};
  const definitionMap = {};

  let recordCount = 0;

  /* ========================================================
     VALIDATE EACH ROW
  ======================================================== */

  for (let i = 0; i < data.length; i++) {
    const sheetRow = i + 2;

    const row = data[i];

    const displayRow = displayData[i];

    const productCode = String(
      displayRow[PRODUCT_IDX.PRODUCT_CODE] || ""
    ).trim();

    const description = String(
      displayRow[PRODUCT_IDX.DESCRIPTION] || ""
    ).trim();

    const category = String(displayRow[PRODUCT_IDX.CATEGORY] || "").trim();
    const normalizedCategory = category.toUpperCase();
    const isYourFinds = normalizedCategory === "YOURFINDS";

    /*
      Ignore completely empty rows.
    */

    if (!productCode && !description && !category) {
      continue;
    }

    recordCount++;

    /* ================= PRODUCT CODE ================= */

    if (!productCode && !isYourFinds) {
      errors.push("Row " + sheetRow + ": Product Code is missing.");
    } else if (productCode) {
      /*
        Our regular Product Master uses
        6-digit numeric codes.
      */

      if (!/^\d{6}$/.test(productCode)) {
        errors.push(
          "Row " +
            sheetRow +
            ": Product Code '" +
            productCode +
            "' must be exactly 6 digits."
        );
      }

      if (codeMap[productCode]) {
        errors.push(
          "Row " +
            sheetRow +
            ": Duplicate Product Code '" +
            productCode +
            "'. First used on Row " +
            codeMap[productCode] +
            "."
        );
      } else {
        codeMap[productCode] = sheetRow;
      }
    }

    /* ================= DESCRIPTION ================= */

    if (!description) {
      errors.push("Row " + sheetRow + ": Description is missing.");
    }

    /* ================= CATEGORY ================= */

    if (!category) {
      errors.push("Row " + sheetRow + ": Category is missing.");
    }

    /* ================= DEFAULT PRICE ================= */

    const defaultPriceRaw = row[PRODUCT_IDX.DEFAULT_PRICE];

    const defaultPrice = Number(defaultPriceRaw);

    if ((defaultPriceRaw === "" || defaultPriceRaw === null) && !isYourFinds) {
      errors.push("Row " + sheetRow + ": Default Price is missing.");
    } else if (!Number.isFinite(defaultPrice) || defaultPrice < 0) {
      errors.push("Row " + sheetRow + ": Default Price is invalid.");
    }

    /* ================= ORIGINAL PRICE ================= */

    const costPriceRaw = row[PRODUCT_IDX.COST_PRICE];

    /*
      Blank Original Price is allowed.

      Existing migrated products may not have one.
    */

    if (costPriceRaw !== "" && costPriceRaw !== null) {
      const costPrice = Number(costPriceRaw);

      if (!Number.isFinite(costPrice) || costPrice < 0) {
        errors.push("Row " + sheetRow + ": Cost Price is invalid.");
      }
    }

    /* ================= INVENTORY TYPE ================= */

    const inventoryType = String(displayRow[PRODUCT_IDX.INVENTORY_TYPE] || "")
      .trim()
      .toUpperCase();

    if (
      inventoryType !== INVENTORY_TYPE.STOCK &&
      inventoryType !== INVENTORY_TYPE.UNIQUE
    ) {
      errors.push(
        "Row " + sheetRow + ": Invalid Inventory Type '" + inventoryType + "'."
      );
    }
    if (isYourFinds && inventoryType !== INVENTORY_TYPE.UNIQUE) {
      errors.push("Row " + sheetRow + ": YourFinds size definitions must use UNIQUE inventory.");
    }

    /* ================= LOW STOCK ================= */

    const lowStockRaw = row[PRODUCT_IDX.LOW_STOCK_AT];

    const lowStockAt = Number(lowStockRaw);

    if ((lowStockRaw === "" || lowStockRaw === null) && !isYourFinds) {
      warnings.push("Row " + sheetRow + ": Low Stock At is blank.");
    } else if (!Number.isFinite(lowStockAt) || lowStockAt < 0) {
      errors.push("Row " + sheetRow + ": Low Stock At is invalid.");
    }

    /* ================= ACTIVE ================= */

    const activeRaw = row[PRODUCT_IDX.ACTIVE];

    const activeText = String(activeRaw).trim().toUpperCase();

    const activeValid =
      activeRaw === true ||
      activeRaw === false ||
      activeText === "TRUE" ||
      activeText === "FALSE";

    if (!activeValid) {
      errors.push("Row " + sheetRow + ": Active must be TRUE or FALSE.");
    }

    /* ======================================================
       DUPLICATE PRODUCT DEFINITION

       Same:
       Description + Category + Default Price

       Example duplicate:
       BAG | BAGS | 500
       BAG | BAGS | 500

       Different prices are NOT duplicates.
    ====================================================== */

    if (description && category && Number.isFinite(defaultPrice)) {
      const definitionKey =
        description.toUpperCase() +
        "|" +
        category.toUpperCase() +
        "|" +
        defaultPrice.toFixed(2);

      if (definitionMap[definitionKey]) {
        warnings.push(
          "Row " +
            sheetRow +
            ": Possible duplicate product definition. " +
            "First found on Row " +
            definitionMap[definitionKey] +
            "."
        );
      } else {
        definitionMap[definitionKey] = sheetRow;
      }
    }
  }

  /* ========================================================
     RESULT
  ======================================================== */

  return {
    valid: errors.length === 0,

    recordCount: recordCount,

    errorCount: errors.length,

    warningCount: warnings.length,

    errors: errors,

    warnings: warnings,
  };
}

function testValidateProductMaster() {
  const result = validateProductMaster();

  Logger.log("===== PRODUCT MASTER VALIDATION =====");

  Logger.log("Records: " + result.recordCount);

  Logger.log("Errors: " + result.errorCount);

  Logger.log("Warnings: " + result.warningCount);

  Logger.log("Valid: " + result.valid);

  if (result.errors.length > 0) {
    Logger.log("===== ERRORS =====");

    result.errors.forEach(function (message) {
      Logger.log(message);
    });
  }

  if (result.warnings.length > 0) {
    Logger.log("===== WARNINGS =====");

    result.warnings.forEach(function (message) {
      Logger.log(message);
    });
  }
}

/* ==========================================================
   GET PRODUCT MASTER BY CODE

   Read-only lookup.

   Example:
   300005
   ->
   BAG / BAGS / 350 / STOCK
========================================================== */

function getProductMasterByCode(productCode) {
  productCode = String(productCode || "").trim();

  if (!productCode) {
    return {
      success: false,
      message: "Product Code is required.",
    };
  }

  const products = getProductMaster_();

  for (let i = 0; i < products.length; i++) {
    const product = products[i];

    if (String(product.productCode || "").trim() === productCode) {
      return {
        success: true,

        product: publicProduct_(product),
      };
    }
  }

  return {
    success: false,

    message: "Product Code " + productCode + " was not found.",
  };
}

/* ==========================================================
   GET ACTIVE PRODUCT MASTER BY CODE

   Same as getProductMasterByCode(),
   but rejects inactive products.
========================================================== */

function getActiveProductByCode(productCode) {
  const result = getProductMasterByCode(productCode);

  if (!result.success) {
    return result;
  }

  if (result.product.active !== true) {
    return {
      success: false,

      message: "Product Code " + productCode + " is inactive.",
    };
  }

  return result;
}
function testInactiveProductLookup() {

  const result =
    getActiveProductByCode(
      "100001"
    );


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

}

/* ==========================================================
   CHECK PRODUCT MASTER AGAINST INVENTORY

   READ-ONLY.

   Returns:
   - Product Master definition
   - Whether it already exists in Inventory
   - Existing Inventory record if found
========================================================== */

function getProductInventoryStatus(productCode) {

  productCode =
    String(
      productCode || ""
    ).trim();


  /* ========================================================
     PRODUCT MASTER
  ======================================================== */

  const productResult =
    getActiveProductByCode(
      productCode
    );


  if (!productResult.success) {

    return {
      success: false,
      message:
        productResult.message
    };

  }


  const product =
    productResult.product;


  /* ========================================================
     INVENTORY
  ======================================================== */

  const inventory =
    getFullInventory();


  let inventoryItem =
    null;


  for (
    let i = 0;
    i < inventory.length;
    i++
  ) {

    const item =
      inventory[i];


    if (
      String(
        item.code || ""
      ).trim() ===
      productCode
    ) {

      inventoryItem =
        item;

      break;

    }

  }


  /* ========================================================
     RESULT
  ======================================================== */

  return {

    success:
      true,

    existsInInventory:
      inventoryItem !== null,

    product:
      product,

    inventoryItem:
      inventoryItem

  };

}

/* ==========================================================
   GET ACTIVE PRODUCT MASTER WITH INVENTORY STATUS

   READ-ONLY.

   Useful later for showing:

   YELLOW       Stock 69
   BAG ₱350     Not yet in Inventory
   MEN SHOES    Not yet in Inventory
========================================================== */

function getProductMasterInventoryOverview() {

  const products =
    getActiveProducts();


  const inventory =
    getFullInventory();


  const inventoryMap =
    {};


  inventory.forEach(
    function(item) {

      const code =
        String(
          item.code || ""
        ).trim();


      if (code) {

        inventoryMap[code] =
          item;

      }

    }
  );


  return products.map(
    function(product) {

      const code =
        String(
          product.productCode || ""
        ).trim();


      const inventoryItem =
        inventoryMap[code] ||
        null;


      return {

        productCode:
          code,

        description:
          product.description,

        category:
          product.category,

        defaultPrice:
          product.defaultPrice,

        costPrice:
          product.costPrice,

        inventoryType:
          product.inventoryType,

        lowStockAt:
          product.lowStockAt,

        existsInInventory:
          inventoryItem !== null,

        currentStock:
          inventoryItem
            ? Number(
                inventoryItem.stock
              ) || 0
            : 0,

        inventoryStatus:
          inventoryItem
            ? inventoryItem.status
            : "",

        inventoryRowNumber:
          inventoryItem
            ? inventoryItem.rowNumber
            : null

      };

    }
  );

}

/* ==========================================================
   CREATE INVENTORY ITEM FROM PRODUCT MASTER

   Creates the Inventory record only.

   IMPORTANT:
   - Stock starts at 0
   - No delivery movement is created
   - Existing Inventory Codes cannot be duplicated
========================================================== */

function createInventoryFromProductMaster(
  productCode
) {

  try {

    productCode =
      String(
        productCode || ""
      ).trim();


    /* ======================================================
       PRODUCT MASTER
    ====================================================== */

    const productResult =
      getActiveProductByCode(
        productCode
      );


    if (!productResult.success) {

      return {
        success: false,
        message:
          productResult.message
      };

    }


    const product =
      productResult.product;


    /* ======================================================
       CHECK EXISTING INVENTORY
    ====================================================== */

    const statusResult =
      getProductInventoryStatus(
        productCode
      );


    if (!statusResult.success) {

      return {
        success: false,
        message:
          statusResult.message
      };

    }


    if (
      statusResult.existsInInventory
    ) {

      return {

        success: false,

        message:
          "Product Code " +
          productCode +
          " already exists in Inventory."

      };

    }


    /* ======================================================
       INVENTORY SHEET
    ====================================================== */

    const ss =
      SpreadsheetApp.getActiveSpreadsheet();


    const inventorySheet =
      ss.getSheetByName(
        SHEETS.INVENTORY
      );


    if (!inventorySheet) {

      return {
        success: false,
        message:
          "Inventory sheet not found."
      };

    }


    const now =
      new Date();


    /* ======================================================
       BUILD A:Q INVENTORY ROW
    ====================================================== */

    const row = [
      product.productCode,        // A Product Code
      product.description,        // B Description
      "",                         // C Size
      normalizeInventoryCategoryValue_(product.category), // D Category
      product.inventoryType,      // E Inventory Type
      INVENTORY_STATUS.ACTIVE,    // F Status
      "",                         // G Total Delivered formula
      "",                         // H Total Sold formula
      "",                         // I Total Returned formula
      "",                         // J Total Adjustment formula
      "",                         // K Current Stock formula
      "",                         // L Stock Status formula
      product.defaultPrice || 0,  // M Selling Price
      0,                          // N Original Price
      product.imageUrl || "",     // O Image
      now,                        // P Created At
      now                         // Q Updated At

    ];


    /* ======================================================
       SAFETY CHECK
    ====================================================== */

    if (
      row.length !==
      INVENTORY_COLUMN_COUNT
    ) {

      throw new Error(
        "Inventory row structure does not match Inventory mapping."
      );

    }


    /* ======================================================
       WRITE
    ====================================================== */

    const newRowNumber =
      inventorySheet.getLastRow() + 1;


    inventorySheet
      .getRange(
        newRowNumber,
        1,
        1,
        INVENTORY_COLUMN_COUNT
      )
      .setValues([
        row
      ]);

    setInventoryCalculatedFields_(inventorySheet, newRowNumber, 1);


    SpreadsheetApp.flush();


    /* ======================================================
       RESULT
    ====================================================== */

    return {

      success:
        true,

      message:
        product.description +
        " added to Inventory.",

      productCode:
        product.productCode,

      inventoryRowNumber:
        newRowNumber,

      stock:
        0

    };


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

function repairIncompleteInventoryFromProductMaster_(product, inventoryRowNumber) {
  if (!product || !Number.isInteger(inventoryRowNumber) || inventoryRowNumber < 2) {
    throw new Error("A valid Product Master item and Inventory row are required.");
  }

  const inventorySheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY);
  if (!inventorySheet) throw new Error("Inventory sheet not found.");

  const existing = inventorySheet
    .getRange(inventoryRowNumber, 1, 1, INVENTORY_COLUMN_COUNT)
    .getDisplayValues()[0];
  const hasRequiredFields =
    String(existing[INV_IDX.CATEGORY] || "").trim() &&
    String(existing[INV_IDX.INVENTORY_TYPE] || "").trim() &&
    String(existing[INV_IDX.STATUS] || "").trim();

  if (hasRequiredFields) {
    return { repaired: false, rowNumber: inventoryRowNumber };
  }

  const now = new Date();
  const row = [
    String(product.productCode || "").trim(),
    String(product.description || "").trim(),
    "",
    normalizeInventoryCategoryValue_(product.category),
    String(product.inventoryType || INVENTORY_TYPE.STOCK).trim().toUpperCase(),
    INVENTORY_STATUS.ACTIVE,
    "",
    "",
    "",
    "",
    "",
    "",
    Number(product.defaultPrice) || 0,
    0,
    String(product.imageUrl || "").trim(),
    now,
    now
  ];

  inventorySheet
    .getRange(inventoryRowNumber, 1, 1, INVENTORY_COLUMN_COUNT)
    .setValues([row]);
  setInventoryCalculatedFields_(inventorySheet, inventoryRowNumber, 1);
  SpreadsheetApp.flush();

  return { repaired: true, rowNumber: inventoryRowNumber };
}

function publicProduct_(product) {
  const result = Object.assign({}, product);
  delete result.costPrice;
  return result;
}
function getProductMaster() {
  return getProductMaster_().map(publicProduct_);
}
