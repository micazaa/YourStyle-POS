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

function getFullInventory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName(SHEETS.INVENTORY);

  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  /* ========================================================
     READ INVENTORY A:O
  ======================================================== */

  const data = sheet
    .getRange(2, 1, lastRow - 1, INVENTORY_COLUMN_COUNT)
    .getValues();

  const displayData = sheet
    .getRange(2, 1, lastRow - 1, INVENTORY_COLUMN_COUNT)
    .getDisplayValues();

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

    const status = String(displayRow[INV_IDX.STATUS] || INVENTORY_STATUS.ACTIVE)
      .trim()
      .toUpperCase();

    /* ================= INVENTORY TYPE ================= */

    const inventoryType = String(
      displayRow[INV_IDX.INVENTORY_TYPE] || INVENTORY_TYPE.STOCK
    )
      .trim()
      .toUpperCase();

    /* ================= OBJECT ================= */

    inventory.push({
      /*
        Actual Google Sheets row number.

        Data starts at Sheet Row 2,
        therefore index 0 = Row 2.
      */

      rowNumber: i + 2,

      /* A — Image */

      imageUrl: String(displayRow[INV_IDX.IMAGE] || "").trim(),

      /* B — Description */

      name: description,

      /* C — Size */

      size: String(displayRow[INV_IDX.SIZE] || "").trim(),

      /* D — Original Price */

      origPrice: Number(row[INV_IDX.ORIG_PRICE]) || 0,

      /* E — YS Price */

      price: Number(row[INV_IDX.YS_PRICE]) || 0,

      /* F — Administrative Status */

      status: status,

      /* G — Code */

      code: code,

      /* H — Stock */

      stock: Number(row[INV_IDX.STOCK]) || 0,

      /* I — Category */

      category: String(displayRow[INV_IDX.CATEGORY] || "Others").trim(),

      /* J — Inventory Type */

      inventoryType: inventoryType,

      /* K — Low Stock At */

      lowStockAt: Number(row[INV_IDX.LOW_STOCK_AT]) || 0,

      /* L — Date Delivered */

      dateDelivered: formatInventoryDateForClient(row[INV_IDX.DATE_DELIVERED]),

      /* M — Delivery ID */

      deliveryId: String(displayRow[INV_IDX.DELIVERY_ID] || "").trim(),

      /* N — Created At */

      createdAt: formatInventoryDateForClient(row[INV_IDX.CREATED_AT]),

      /* O — Updated At */

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
  remarks
) {

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


      const rawValue =
        quantities[size];


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


      const deliveryNo =
        buildYourFindsDeliveryNo(
          deliveryDate,
          deliverySequence
        );

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
         BUILD INVENTORY ROWS A:O
      ====================================================== */

      const now =
        new Date();


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

                "",

                // A Image


                "",

                // B Description
                // Completed later


                size === "CUSTOM" ? customSizeLabel : size,

                // C Size


                0,

                // D OrigPrice


                0,

                // E YS Price


                INVENTORY_STATUS.INCOMPLETE,

                // F Status


                code,

                // G Code


                1,

                // H Stock


                "YourFinds",

                // I Category


                INVENTORY_TYPE.UNIQUE,

                // J Inventory Type


                0,

                // K Low Stock At


                deliveryDate,

                // L Date Delivered


                deliveryId,

                // M Delivery ID


                now,

                // N Created At


                now

                // O Updated At

              ];


              if (
                row.length !==
                INVENTORY_COLUMN_COUNT
              ) {

                throw new Error(
                  "YourFinds Inventory row does not match Inventory A:O mapping."
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
          deliveryNo,
          deliveryDate,
          now,
          driverName,
          plateNo,
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
              notes: deliveryNo ? "Delivery No: " + deliveryNo : ""
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
          1

      };

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
  const inventory = getFullInventory();

  return inventory.filter((item) => {
    const status = String(item.status || "")
      .trim()
      .toUpperCase();

    const stock = Number(item.stock) || 0;

    return status === INVENTORY_STATUS.ACTIVE && stock > 0;
  });
}

function getInventoryDisplayStatus(item) {
  const stock = Number(item.stock) || 0;

  const lowStockAt = Number(item.lowStockAt) || 0;

  const status = String(item.status || INVENTORY_STATUS.ACTIVE)
    .trim()
    .toUpperCase();

  /* ================= RETURNED ================= */

  if (status === INVENTORY_STATUS.RETURNED) {
    return "RETURNED";
  }

  /* ================= INCOMPLETE ================= */

  if (status === INVENTORY_STATUS.INCOMPLETE) {
    return "INCOMPLETE";
  }

  /* ================= INACTIVE ================= */

  if (status === INVENTORY_STATUS.INACTIVE) {
    return "INACTIVE";
  }

  /* ================= SOLD OUT ================= */

  if (stock <= 0) {
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

   Custom items:
   Ignored because they do not exist in Inventory.

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

   CUSTOM:
   Ignored because custom items do not exist in Inventory.
========================================================== */

function deductInventoryStock(soldItems, receiptId, employeeName) {
  /* ========================================================
     VALIDATE
  ======================================================== */

  if (!Array.isArray(soldItems) || soldItems.length === 0) {
    return [];
  }

  const results = [];

  /* ========================================================
     PROCESS SOLD ITEMS
  ======================================================== */

  soldItems.forEach(function (item) {
    /* ================= INVALID ITEM ================= */

    if (!item) {
      return;
    }

    /* ================= CUSTOM ITEM =================

         Custom/unlisted Cashier items don't exist
         in Inventory and therefore don't change stock.
      ================================================= */

    if (item.isCustom) {
      return;
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

  const result = changeInventoryStock({
    code: code,
    qtyChange: -quantitySold,
    referenceId: receiptId,
    employee: employeeName,
    item: String(item.name || "").trim(),
    reason: "",
    source: INVENTORY_MOVEMENT_SOURCE.SALE,
    notes: ""
  });
    results.push(result);
  });

  SpreadsheetApp.flush();

  return results;
}

/* ==========================================================
   GENERATE YOURFINDS DELIVERY ID

   FORMAT:

   YFD-YYYYMMDD-###

   Example:
   YFD-20260815-001
========================================================== */

function generateYourFindsDeliveryId(deliveryDate) {
  deliveryDate = String(deliveryDate || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    throw new Error("Invalid delivery date.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const deliverySheet = ss.getSheetByName(SHEETS.DELIVERY_LOG);

  if (!deliverySheet) {
    throw new Error("Delivery Log sheet not found.");
  }

  const datePart = deliveryDate.replace(/-/g, "");

  const prefix = "YFD-" + datePart + "-";

  let highestSequence = 0;

  const lastRow = deliverySheet.getLastRow();

  if (lastRow >= 2) {
    const existingIds = deliverySheet
      .getRange(2, DELIVERY_COL.DELIVERY_ID, lastRow - 1, 1)
      .getDisplayValues()
      .flat();

    existingIds.forEach(function (value) {
      const deliveryId = String(value || "").trim();

      if (!deliveryId.startsWith(prefix)) {
        return;
      }

      const sequenceText = deliveryId.substring(prefix.length);

      if (!/^\d{3}$/.test(sequenceText)) {
        return;
      }

      const sequence = parseInt(sequenceText, 10);

      if (sequence > highestSequence) {
        highestSequence = sequence;
      }
    });
  }

  const nextSequence = highestSequence + 1;

  if (nextSequence > 999) {
    throw new Error(
      "Maximum of 999 YourFinds deliveries reached for this date."
    );
  }

  return prefix + String(nextSequence).padStart(3, "0");
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
  const sizeOrder = YOURFINDS_SIZE_ORDER.slice();

  const result = {
    allCodes: [],

    bySize: {},
  };

  sizeOrder.forEach(function (size) {
    const quantity = Number(quantities[size]) || 0;

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


    const deliveryNo =
      buildYourFindsDeliveryNo(
        deliveryDate,
        deliverySequence
      );


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

