function executeCheckoutBackend(
  cart,
  paymentMethod,
  referenceNumber,
  receiptId,
  globalDiscountType,
  globalDiscountValue,
  cashierName,
  cashReceived,
  changeGiven,
  applyCardFee
) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const salesLogSheet = ss.getSheetByName(SHEETS.SALES_LOG);
 
    if (!salesLogSheet) {
      return JSON.stringify({
        success: false,
        message: "Sales Log sheet not found.",
      });
    }

    if (!cart || cart.length === 0) {
      return JSON.stringify({
        success: false,
        message: "Cart is empty.",
      });
    }

    // 1) Per-line raw total and item-level discount
    let lines = cart.map((item) => {
      const lineRaw = item.price * item.quantity;
      let lineDiscount = 0;
      if (item.discountValue > 0) {
        lineDiscount =
          item.discountType === "percentage"
            ? lineRaw * (item.discountValue / 100)
            : item.discountValue;
      }
      lineDiscount = Math.min(lineDiscount, lineRaw);
      return Object.assign({}, item, {
        lineRaw: lineRaw,
        lineDiscount: lineDiscount,
        lineAfterItemDiscount: roundToTwo(lineRaw - lineDiscount),
      });
    });

    const subtotalAfterItemDiscounts = lines.reduce(
      (s, l) => s + l.lineAfterItemDiscount,
      0
    );

    // 2) Apportion the global (cart-level) discount across lines
    let globalReduction = 0;
    if (globalDiscountValue > 0) {
      globalReduction =
        globalDiscountType === "percentage"
          ? subtotalAfterItemDiscounts * (globalDiscountValue / 100)
          : globalDiscountValue;
    }
    globalReduction = Math.min(globalReduction, subtotalAfterItemDiscounts);

    const baseTotalDue = roundToTwo(
      Math.max(0, subtotalAfterItemDiscounts - globalReduction)
    );

    lines.forEach((l) => {
      const share =
        subtotalAfterItemDiscounts > 0
          ? l.lineAfterItemDiscount / subtotalAfterItemDiscounts
          : 0;
      l.apportionedGlobalDiscount = globalReduction * share;
      l.totalDiscount = roundToTwo(
        l.lineDiscount + l.apportionedGlobalDiscount
      );
      l.lineNet = roundToTwo(l.lineRaw - l.totalDiscount); // net of all discounts, before fee split
    });

    // 3) Fee split — mirrors the checkout modal's own logic:
    //    QR: always 1% charged to the customer (no toggle in the UI).
    //    Credit Card: 3.2% charged to customer if applyCardFee is true,
    //                 otherwise merchant absorbs the 3.2% instead.
    //    Cash / GCash: no fee.
    let feeRateCharged = 0;
    let feeRateAbsorbed = 0;
    if (paymentMethod === "QR Code") {
      feeRateCharged = 0.01;
    } else if (paymentMethod === "Credit Card") {
      if (applyCardFee) feeRateCharged = 0.032;
      else feeRateAbsorbed = 0.032;
    }

    const totalFeeCharged = roundToTwo(baseTotalDue * feeRateCharged);
    const totalFeeAbsorbed = roundToTwo(baseTotalDue * feeRateAbsorbed);

    const sumLineNet = lines.reduce((s, l) => s + l.lineNet, 0) || 1;
    lines.forEach((l) => {
      const share = l.lineNet / sumLineNet;
      l.feeCharged = roundToTwo(totalFeeCharged * share);
      l.feeAbsorbed = roundToTwo(totalFeeAbsorbed * share);
      l.netTotal = roundToTwo(l.lineNet - l.feeAbsorbed); // true revenue for this line
    });

    // 4) Write Sales Log rows (A–R), repeating Cash Received/Change on every line
    const timestamp = new Date();
    const rows = lines.map((l) => [
      timestamp, // A Timestamp
      receiptId, // B Receipt ID
      cashierName, // C Cashier
      l.code, // D Code
      l.name, // E Item Name
      l.size, // F Size
      l.category || "Others", // G Category
      l.quantity, // H Quantity
      l.price, // I Price
      l.totalDiscount, // J Discount
      l.feeCharged, // K Fee Charged
      l.feeAbsorbed, // L Fee Absorbed
      l.netTotal, // M Net Total
      paymentMethod, // N Payment Method

      paymentMethod === "Cash" ? "N/A" : referenceNumber, // O Reference

      "COMPLETED", // P Status
      cashReceived, // Q Cash Received
      changeGiven, // R Change

      "", // S Authorized By
      "", // T Void Reason
    ]);
    salesLogSheet
      .getRange(
        salesLogSheet.getLastRow() + 1,
        1,
        rows.length,
        SALES_LOG_COLUMN_COUNT
      )
      .setValues(rows);

    // 5) Decrement inventory stock for non-custom items
    deductInventoryStock(cart, receiptId, cashierName);

    return JSON.stringify({
      success: true,
      message: "Transaction completed.",
      updatedInventory: getFullInventory(),
    });
  } catch (err) {
    return JSON.stringify({ success: false, message: err.toString() });
  }
}

function getExpectedCashForCurrentCashier(cashierName, pettyReceived) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName(SHEETS.SALES_LOG);

  if (!sheet) {
    return 0;
  }

  const data = sheet.getDataRange().getValues();

  const tz = Session.getScriptTimeZone();

  const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  let cashSales = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    if (!row[SALES_IDX.TIMESTAMP]) {
      continue;
    }

    const rowDate = Utilities.formatDate(
      new Date(row[SALES_IDX.TIMESTAMP]),
      tz,
      "yyyy-MM-dd"
    );

    const rowCashier = String(row[SALES_IDX.CASHIER] || "").trim();

    const paymentMethod = String(row[SALES_IDX.PAYMENT_METHOD] || "").trim();

    const status = String(row[SALES_IDX.STATUS] || "")
      .trim()
      .toUpperCase();

    if (
      rowDate === today &&
      rowCashier === cashierName &&
      paymentMethod === "Cash" &&
      status === "COMPLETED"
    ) {
      cashSales += Number(row[SALES_IDX.NET_TOTAL]) || 0;
    }
  }

  return roundToTwo((Number(pettyReceived) || 0) + cashSales);
}

function getExpectedCashForManager(reportDate) {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      SHEETS.SALES_LOG
    );


  if (!sheet) {

    return {
      expectedCashDrawer: 0
    };

  }


  const data =
    sheet
      .getDataRange()
      .getValues();


  const tz =
    Session.getScriptTimeZone();

  let cashSales = 0;


  Logger.log(
    "===== MANAGER EXPECTED CASH ====="
  );

  Logger.log(
    "Requested Date: " +
    reportDate
  );


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    const row =
      data[i];

    const timestamp =
      row[
        SALES_IDX.TIMESTAMP
      ];


    if (!timestamp) {
      continue;
    }


    const rowDate =
      Utilities.formatDate(
        new Date(timestamp),
        tz,
        "yyyy-MM-dd"
      );


    /*
      Ignore every other date BEFORE logging.
    */

    if (
      rowDate !== reportDate
    ) {
      continue;
    }


    const paymentMethod =
      String(
        row[
          SALES_IDX.PAYMENT_METHOD
        ] || ""
      )
        .trim()
        .toUpperCase();


    const status =
      String(
        row[
          SALES_IDX.STATUS
        ] || ""
      )
        .trim()
        .toUpperCase();


    const amount =
      Number(
        row[
          SALES_IDX.NET_TOTAL
        ]
      ) || 0;


    Logger.log(
      "MATCH: " +
      rowDate +
      " | " +
      paymentMethod +
      " | " +
      status +
      " | " +
      amount
    );


    if (
      status !== "COMPLETED"
    ) {
      continue;
    }


    if (
      paymentMethod !== "CASH"
    ) {
      continue;
    }


    cashSales +=
      amount;

  }


  cashSales =
    roundToTwo(
      cashSales
    );


  Logger.log(
    "FINAL EXPECTED CASH = " +
    cashSales
  );


  return {

    expectedCashDrawer:
      cashSales

  };

}

function testManagerExpectedCash() {

  const result =
    getExpectedCashForManager(
      "2026-08-15"
    );


  Logger.log(
    JSON.stringify(result)
  );

}

function voidAndRefundTransactionBackend(
  receiptId,
  authorizedBy,
  voidReason
) {

  try {

    /* ========================================================
       NORMALIZE
    ======================================================== */

    receiptId =
      String(
        receiptId || ""
      )
        .trim()
        .toUpperCase();


    authorizedBy =
      String(
        authorizedBy || ""
      ).trim();


    voidReason =
      String(
        voidReason || ""
      ).trim();


    /* ========================================================
       VALIDATE
    ======================================================== */

    if (!receiptId) {

      return {
        success: false,
        message:
          "Receipt ID is required."
      };

    }


    if (!authorizedBy) {

      return {
        success: false,
        message:
          "Manager authorization is required."
      };

    }


    if (!voidReason) {

      return {
        success: false,
        message:
          "Void reason is required."
      };

    }


    /* ========================================================
       SALES LOG
    ======================================================== */

    const ss =
      SpreadsheetApp.getActiveSpreadsheet();


    const salesLogSheet =
      ss.getSheetByName(
        SHEETS.SALES_LOG
      );


    if (!salesLogSheet) {

      return {
        success: false,
        message:
          "Sales Log sheet not found."
      };

    }


    const data =
      salesLogSheet
        .getDataRange()
        .getValues();


    const matchedRows =
      [];


    /* ========================================================
       FIND RECEIPT
    ======================================================== */

    for (
      let i = 1;
      i < data.length;
      i++
    ) {

      const rowReceiptId =
        String(
          data[i][
            SALES_IDX.RECEIPT_ID
          ] || ""
        )
          .trim()
          .toUpperCase();


      if (
        rowReceiptId !==
        receiptId
      ) {

        continue;

      }


      const status =
        String(
          data[i][
            SALES_IDX.STATUS
          ] || ""
        )
          .trim()
          .toUpperCase();


      if (
        status === "VOIDED"
      ) {

        return {
          success: false,
          message:
            "This receipt has already been voided."
        };

      }


      matchedRows.push(i);

    }


    if (
      matchedRows.length === 0
    ) {

      return {
        success: false,
        message:
          "No transaction found with Receipt ID: " +
          receiptId
      };

    }


    /* ========================================================
       RESTORE EACH SALES LINE
    ======================================================== */

    matchedRows.forEach(
      function(rowIndex) {

        const row =
          data[rowIndex];


        const code =
          String(
            row[
              SALES_IDX.CODE
            ] || ""
          ).trim();


        const itemName =
          String(
            row[
              SALES_IDX.ITEM_NAME
            ] || ""
          ).trim();


        const qty =
          parseInt(
            row[
              SALES_IDX.QUANTITY
            ],
            10
          ) || 0;


        /* ====================================================
           INVENTORY RESTORE

           Custom items don't exist in Inventory.
        ==================================================== */

        if (
          code &&
          !code.startsWith(
            "CUSTOM-"
          ) &&
          qty > 0
        ) {

          changeInventoryStock({

            code:
              code,

            qtyChange:
              qty,

            type:
              INVENTORY_MOVEMENT_TYPE.VOID,

            referenceId:
              receiptId,

            employee:
              authorizedBy,

            item:
              itemName,

            reason:
              voidReason,

            source:
              INVENTORY_MOVEMENT_SOURCE.VOID,

            notes:
              ""

          });

        }


        /* ====================================================
           MARK SALES LINE VOIDED

           IMPORTANT:
           We do this AFTER stock restoration succeeds.

           If changeInventoryStock() throws an error,
           this Sales Log row won't be marked VOIDED.
        ==================================================== */

        salesLogSheet
          .getRange(
            rowIndex + 1,
            SALES_COL.STATUS
          )
          .setValue(
            "VOIDED"
          );


        salesLogSheet
          .getRange(
            rowIndex + 1,
            SALES_COL.AUTHORIZED_BY
          )
          .setValue(
            authorizedBy
          );


        salesLogSheet
          .getRange(
            rowIndex + 1,
            SALES_COL.VOID_REASON
          )
          .setValue(
            voidReason
          );

      }
    );


    SpreadsheetApp.flush();


    /* ========================================================
       SUCCESS
    ======================================================== */

    return {

      success:
        true,

      message:
        "Receipt " +
        receiptId +
        " voided successfully (" +
        matchedRows.length +
        " line item(s)).",

      updatedInventory:
        getFullInventory()

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

/* ==========================================================
   TRANSACTION HISTORY
========================================================== */

function getTransactionHistory(cashierName, reportDate, isManager) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const sheet = ss.getSheetByName(SHEETS.SALES_LOG);

    if (!sheet) {
      return {
        success: false,
        message: "Sales Log sheet not found.",
      };
    }

    const data = sheet.getDataRange().getValues();

    const tz = Session.getScriptTimeZone();

    /* ======================================================
       CASHIER DATE SECURITY

       Cashier is ALWAYS today.

       Even if somebody manipulates the frontend and sends
       another date, backend ignores it.
    ====================================================== */

    const now =
      new Date();

    const today =
      new Date(
        now.getTime() -
        now.getTimezoneOffset() * 60000
      )
        .toISOString()
        .split("T")[0];

    const selectedDate = isManager ? reportDate : today;

    /* ======================================================
       GROUP SALES LOG LINES BY RECEIPT
    ====================================================== */

    const receiptMap = {};

    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      if (!row[SALES_IDX.TIMESTAMP]) {
        continue;
      }

      const timestamp = new Date(row[SALES_IDX.TIMESTAMP]);

      const rowDate = Utilities.formatDate(timestamp, tz, "yyyy-MM-dd");

      if (rowDate !== selectedDate) {
        continue;
      }

      const rowCashier = String(row[SALES_IDX.CASHIER] || "").trim();

      /*
        Cashier only sees themselves.
      */

      if (!isManager && rowCashier !== cashierName) {
        continue;
      }

      const receiptId = String(row[SALES_IDX.RECEIPT_ID] || "").trim();

      if (!receiptId) {
        continue;
      }

      if (!receiptMap[receiptId]) {
        receiptMap[receiptId] = {
          receiptId: receiptId,

          timestamp: timestamp,

          time: Utilities.formatDate(timestamp, tz, "h:mm a"),

          cashier: rowCashier,

          items: 0,

          total: 0,

          paymentMethod: String(row[SALES_IDX.PAYMENT_METHOD] || "").trim(),

          status: String(row[SALES_IDX.STATUS] || "").trim(),

          itemNames: [],
        };
      }

      const tx = receiptMap[receiptId];

      tx.items += Number(row[SALES_IDX.QUANTITY]) || 0;

      tx.total += Number(row[SALES_IDX.NET_TOTAL]) || 0;

      const itemName = String(row[SALES_IDX.ITEM_NAME] || "").trim();

      if (itemName) {
        tx.itemNames.push(itemName);
      }

      /*
        If ANY row is VOIDED,
        receipt should display VOIDED.
      */

      if (
        String(row[SALES_IDX.STATUS] || "")
          .trim()
          .toUpperCase() === "VOIDED"
      ) {
        tx.status = "VOIDED";
      }
    }

    /* ======================================================
       ARRAY
    ====================================================== */

    const transactions = Object.values(receiptMap);

    transactions.forEach(function (tx) {
      tx.total = roundToTwo(tx.total);

      tx.itemNames = tx.itemNames.join(", ");
    });

    /*
      Newest first.
    */

    transactions.sort(function (a, b) {
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    /*
      Date objects don't need to go to browser.
    */

    transactions.forEach(function (tx) {
      delete tx.timestamp;
    });

    return {
      success: true,

      date: selectedDate,

      transactions: transactions,
    };
  } catch (err) {
    return {
      success: false,

      message: err.message || err.toString(),
    };
  }
}

/* ==========================================================
   GET TRANSACTION DETAILS
========================================================== */

function getTransactionDetails(receiptId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const sheet = ss.getSheetByName(SHEETS.SALES_LOG);

    if (!sheet) {
      return {
        success: false,
        message: "Sales Log sheet not found.",
      };
    }

    receiptId = String(receiptId || "")
      .trim()
      .toUpperCase();

    if (!receiptId) {
      return {
        success: false,
        message: "Receipt ID is required.",
      };
    }

    const data = sheet.getDataRange().getValues();

    const tz = Session.getScriptTimeZone();

    let transaction = null;

    /* ======================================================
       FIND ALL LINES BELONGING TO RECEIPT
    ====================================================== */

    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      const rowReceipt = String(row[SALES_IDX.RECEIPT_ID] || "")
        .trim()
        .toUpperCase();

      if (rowReceipt !== receiptId) {
        continue;
      }

      /* ================= FIRST MATCH ================= */

      if (!transaction) {
        const timestamp = new Date(row[SALES_IDX.TIMESTAMP]);

        transaction = {
          receiptId: String(row[SALES_IDX.RECEIPT_ID] || ""),

          dateTime: Utilities.formatDate(timestamp, tz, "MM/dd/yyyy h:mm a"),

          cashier: String(row[SALES_IDX.CASHIER] || ""),

          paymentMethod: String(row[SALES_IDX.PAYMENT_METHOD] || ""),

          referenceNumber: String(row[SALES_IDX.REFERENCE] || ""),

          status: String(row[SALES_IDX.STATUS] || ""),

          cashReceived: Number(row[SALES_IDX.CASH_RECEIVED]) || 0,

          changeGiven: Number(row[SALES_IDX.CHANGE]) || 0,

          authorizedBy: String(row[SALES_IDX.AUTHORIZED_BY] || ""),

          voidReason: String(row[SALES_IDX.VOID_REASON] || ""),

          total: 0,

          items: [],
        };
      }

      /* ================= ITEM ================= */

      transaction.items.push({
        code: String(row[SALES_IDX.CODE] || ""),

        name: String(row[SALES_IDX.ITEM_NAME] || ""),

        size: String(row[SALES_IDX.SIZE] || ""),

        category: String(row[SALES_IDX.CATEGORY] || ""),

        quantity: Number(row[SALES_IDX.QUANTITY]) || 0,

        price: Number(row[SALES_IDX.PRICE]) || 0,

        discount: Number(row[SALES_IDX.DISCOUNT]) || 0,

        feeCharged: Number(row[SALES_IDX.FEE_CHARGED]) || 0,

        feeAbsorbed: Number(row[SALES_IDX.FEE_ABSORBED]) || 0,

        netTotal: Number(row[SALES_IDX.NET_TOTAL]) || 0,
      });

      /* ================= TOTAL ================= */

      transaction.total += Number(row[SALES_IDX.NET_TOTAL]) || 0;

      /* ================= VOID STATUS ================= */

      if (
        String(row[SALES_IDX.STATUS] || "")
          .trim()
          .toUpperCase() === "VOIDED"
      ) {
        transaction.status = "VOIDED";
      }

      /* ================= AUTHORIZED BY ================= */

      if (row[SALES_IDX.AUTHORIZED_BY]) {
        transaction.authorizedBy = String(row[SALES_IDX.AUTHORIZED_BY]);
      }

      /* ================= VOID REASON ================= */

      if (row[SALES_IDX.VOID_REASON]) {
        transaction.voidReason = String(row[SALES_IDX.VOID_REASON]);
      }
    }

    /* ======================================================
       NOT FOUND
    ====================================================== */

    if (!transaction) {
      return {
        success: false,

        message: "Transaction " + receiptId + " was not found.",
      };
    }

    /* ======================================================
       FINALIZE
    ====================================================== */

    transaction.total = roundToTwo(transaction.total);

    return {
      success: true,

      transaction: transaction,
    };
  } catch (err) {
    return {
      success: false,

      message: err.message || err.toString(),
    };
  }
}
