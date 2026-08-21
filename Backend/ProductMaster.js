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
   D  Default Price
   E  Original Price
   F  Inventory Type
   G  Low Stock At
   H  Active
   I  Created At
   J  Updated At
========================================================== */

function getProductMaster() {
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

    const active =
      rawActive === true || String(rawActive).trim().toUpperCase() === "TRUE";

    /* ================= PRODUCT OBJECT ================= */

    products.push({
      rowNumber: i + 2,

      productCode: productCode,

      description: description,

      category: String(displayRow[PRODUCT_IDX.CATEGORY] || "").trim(),

      defaultPrice: Number(row[PRODUCT_IDX.DEFAULT_PRICE]) || 0,

      originalPrice: Number(row[PRODUCT_IDX.ORIGINAL_PRICE]) || 0,

      inventoryType: String(displayRow[PRODUCT_IDX.INVENTORY_TYPE] || "")
        .trim()
        .toUpperCase(),

      lowStockAt: Number(row[PRODUCT_IDX.LOW_STOCK_AT]) || 0,

      active: active,

      createdAt: formatProductMasterDateForClient(row[PRODUCT_IDX.CREATED_AT]),

      updatedAt: formatProductMasterDateForClient(row[PRODUCT_IDX.UPDATED_AT]),
    });
  }

  return products;
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
  const products = getProductMaster();

  return products.filter(function (product) {
    return product.active === true;
  });
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

    /*
      Ignore completely empty rows.
    */

    if (!productCode && !description && !category) {
      continue;
    }

    recordCount++;

    /* ================= PRODUCT CODE ================= */

    if (!productCode) {
      errors.push("Row " + sheetRow + ": Product Code is missing.");
    } else {
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

    if (defaultPriceRaw === "" || defaultPriceRaw === null) {
      errors.push("Row " + sheetRow + ": Default Price is missing.");
    } else if (!Number.isFinite(defaultPrice) || defaultPrice < 0) {
      errors.push("Row " + sheetRow + ": Default Price is invalid.");
    }

    /* ================= ORIGINAL PRICE ================= */

    const originalPriceRaw = row[PRODUCT_IDX.ORIGINAL_PRICE];

    /*
      Blank Original Price is allowed.

      Existing migrated products may not have one.
    */

    if (originalPriceRaw !== "" && originalPriceRaw !== null) {
      const originalPrice = Number(originalPriceRaw);

      if (!Number.isFinite(originalPrice) || originalPrice < 0) {
        errors.push("Row " + sheetRow + ": Original Price is invalid.");
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

    /* ================= LOW STOCK ================= */

    const lowStockRaw = row[PRODUCT_IDX.LOW_STOCK_AT];

    const lowStockAt = Number(lowStockRaw);

    if (lowStockRaw === "" || lowStockRaw === null) {
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

  const products = getProductMaster();

  for (let i = 0; i < products.length; i++) {
    const product = products[i];

    if (String(product.productCode || "").trim() === productCode) {
      return {
        success: true,

        product: product,
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

        originalPrice:
          product.originalPrice,

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
       BUILD A:O INVENTORY ROW
    ====================================================== */

    const row = [

      "",                         // A Image

      product.description,        // B Description

      "",                         // C Size

      product.originalPrice || 0, // D OrigPrice

      product.defaultPrice || 0,  // E YS Price

      INVENTORY_STATUS.ACTIVE,    // F Status

      product.productCode,        // G Code

      0,                          // H Stock

      product.category,           // I Category

      product.inventoryType,      // J Inventory Type

      product.lowStockAt || 0,    // K Low Stock At

      "",                         // L Date Delivered

      "",                         // M Delivery ID

      now,                        // N Created At

      now                         // O Updated At

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