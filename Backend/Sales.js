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
      l.salesLineId = generateSalesLineId();
    });

    // 4) Write Sales Log rows (A–Z), repeating Cash Received/Change on every line.
    // POS writes are already inventory-synchronized, so mark them PROCESSED.
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
      "", // T Reason / Void Reason
      "", // U Original Receipt ID
      l.salesLineId, // V Sales Line ID
      "POS", // W Entry Source
      "PROCESSED", // X Sync Status
      timestamp, // Y Processed At
      "", // Z Sync Error
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
    deductInventoryStock(lines, receiptId, cashierName);

    return JSON.stringify({
      success: true,
      message: "Transaction completed.",
      updatedInventory: getFullInventory(),
    });
  } catch (err) {
    return JSON.stringify({ success: false, message: err.toString() });
  }
}

function getExpectedCashForCurrentCashier(cashierName, pettyReceived, shiftStart) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SALES_LOG);
  if (!sheet) return 0;

  const data = sheet.getDataRange().getValues();
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const shiftStartDate = shiftStart ? new Date(shiftStart) : null;
  let cashSales = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const ts = row[SALES_IDX.TIMESTAMP];
    if (!ts) continue;
    const rowTs = new Date(ts);
    if (shiftStartDate && rowTs < shiftStartDate) continue;
    const rowDate = Utilities.formatDate(rowTs, tz, "yyyy-MM-dd");
    const rowCashier = String(row[SALES_IDX.CASHIER] || "").trim();
    const paymentMethod = String(row[SALES_IDX.PAYMENT_METHOD] || "").trim().toUpperCase();
    const status = String(row[SALES_IDX.STATUS] || "").trim().toUpperCase();

    if (rowDate === today && rowCashier === cashierName && paymentMethod === "CASH" && status === "COMPLETED") {
      cashSales += Number(row[SALES_IDX.NET_TOTAL]) || 0;
    }
  }

  // PHASE 10: Petty cash is separate from sales cash and is NEVER added here.
  return roundToTwo(cashSales);
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
  voidReason,
  itemCode,
  itemRowIndex,
  qtyToVoid
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

    itemCode =
      String(
        itemCode || ""
      ).trim();

    itemRowIndex =
      itemCode && itemRowIndex !== undefined && itemRowIndex !== null && itemRowIndex !== ""
        ? Number(itemRowIndex)
        : "";

    qtyToVoid = 1;


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

    if (receiptId.startsWith("EX-")) {
      return { success: false, message: "Exchange transactions cannot be voided from Void Receipt." };
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


    const salesRange = salesLogSheet.getDataRange();
    const data = salesRange.getValues();
    const notes = salesRange.getNotes();


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


      const isPartialVoid = status === "VOIDED" &&
        String(notes[i][SALES_IDX.STATUS] || "").trim().toUpperCase() === "PARTIALLY VOIDED";

      if (status === "VOIDED" && !isPartialVoid && !itemCode) {

        return {
          success: false,
          message:
            "This receipt has already been voided."
        };

      }

      if (itemCode) {
        const rowCode = String(data[i][SALES_IDX.CODE] || "").trim();
        const matchesCode = rowCode === itemCode;
        const matchesRowIndex = itemRowIndex === "" || i === Number(itemRowIndex);

        if (!matchesCode || !matchesRowIndex) {
          continue;
        }
      }

      if (status === "VOIDED" && !isPartialVoid) {
        return {
          success: false,
          message: "This item has already been voided."
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

        const lineNetTotal = Number(row[SALES_IDX.NET_TOTAL]) || 0;
        const lineDiscount = Number(row[SALES_IDX.DISCOUNT]) || 0;
        const lineFeeCharged = Number(row[SALES_IDX.FEE_CHARGED]) || 0;
        const lineFeeAbsorbed = Number(row[SALES_IDX.FEE_ABSORBED]) || 0;
        const voidQty = itemCode ? Math.min(qtyToVoid, qty) : qty;

        /* ====================================================
           INVENTORY RESTORE

           Custom items don't exist in Inventory.
        ==================================================== */

        if (
          code &&
          !code.startsWith(
            "CUSTOM-"
          ) &&
          voidQty > 0
        ) {
          changeInventoryStock({
            code: code,
            qtyChange: voidQty,
            referenceId: receiptId,
            sourceLineId: String(row[SALES_IDX.SALES_LINE_ID] || "").trim(),
            employee: authorizedBy,
            item: itemName,
            reason: voidReason,
            source: INVENTORY_MOVEMENT_SOURCE.VOID,
            notes: ""
          });
        }


        if (itemCode && qty > voidQty) {
          const remainingQty = qty - voidQty;
          const ratio = remainingQty / qty;

          salesLogSheet.getRange(rowIndex + 1, SALES_COL.QUANTITY).setValue(remainingQty);
          salesLogSheet.getRange(rowIndex + 1, SALES_COL.STATUS).setValue("VOIDED");
          salesLogSheet.getRange(rowIndex + 1, SALES_COL.STATUS).setNote("PARTIALLY VOIDED");
          salesLogSheet.getRange(rowIndex + 1, SALES_COL.DISCOUNT).setValue(roundToTwo(lineDiscount * ratio));
          salesLogSheet.getRange(rowIndex + 1, SALES_COL.FEE_CHARGED).setValue(roundToTwo(lineFeeCharged * ratio));
          salesLogSheet.getRange(rowIndex + 1, SALES_COL.FEE_ABSORBED).setValue(roundToTwo(lineFeeAbsorbed * ratio));
          salesLogSheet.getRange(rowIndex + 1, SALES_COL.NET_TOTAL).setValue(roundToTwo(lineNetTotal * ratio));

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

          return;
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
            SALES_COL.STATUS
          )
          .clearNote();


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
        (itemCode ? "Item " : "Receipt ") +
        receiptId +
        (itemCode ? " voided successfully." : " voided successfully (") +
        (itemCode
          ? ""
          : matchedRows.length + " line item(s))."),

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

function getTransactionHistory(cashierName, fromDate, toDate, isManager) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const sheet = ss.getSheetByName(SHEETS.SALES_LOG);

    if (!sheet) {
      return {
        success: false,
        message: "Sales Log sheet not found.",
      };
    }

    const salesRange = sheet.getDataRange();
    const data = salesRange.getValues();
    const statusNotes = sheet
      .getRange(1, SALES_COL.STATUS, salesRange.getNumRows(), 1)
      .getNotes();

    const tz = Session.getScriptTimeZone();

    /* ======================================================
       CASHIER DATE SECURITY

       Cashier is ALWAYS today.

       Even if somebody manipulates the frontend and sends
       another date, backend ignores it.
    ====================================================== */

    const now =
      new Date();

    const localToday = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000
    );
    const today = localToday.toISOString().split("T")[0];
    const cashierStartDate = new Date(localToday);
    cashierStartDate.setDate(cashierStartDate.getDate() - 6);
    const cashierFromDate = cashierStartDate.toISOString().split("T")[0];

    const selectedFromDate = String(fromDate || (isManager ? today : cashierFromDate));
    const selectedToDate = String(toDate || (isManager ? selectedFromDate : today));

    if (!isManager &&
      (selectedFromDate < cashierFromDate || selectedToDate > today)) {
      return {
        success: false,
        message: "Cashier history is limited to the latest 7 days.",
      };
    }

    if (selectedFromDate > selectedToDate) {
      return {
        success: false,
        message: "From Date cannot be later than To Date.",
      };
    }

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

      if (rowDate < selectedFromDate || rowDate > selectedToDate) {
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

      const rowStatus = String(row[SALES_IDX.STATUS] || "").trim().toUpperCase();
      const isPartialVoid = rowStatus === "VOIDED" &&
        String(statusNotes[i][0] || "").trim().toUpperCase() === "PARTIALLY VOIDED";
      const effectiveStatus = isPartialVoid ? "PARTIALLY VOIDED" : rowStatus;

      if (effectiveStatus !== "VOIDED") {
        tx.items += Number(row[SALES_IDX.QUANTITY]) || 0;
        tx.total += Number(row[SALES_IDX.NET_TOTAL]) || 0;
      }

      const itemName = String(row[SALES_IDX.ITEM_NAME] || "").trim();

      if (itemName && effectiveStatus !== "VOIDED") {
        tx.itemNames.push(itemName);
      }

      /*
        If ANY row is VOIDED,
        receipt should display VOIDED.
      */

      if (effectiveStatus === "VOIDED" || effectiveStatus === "PARTIALLY VOIDED") tx.hasVoided = true;
      else tx.hasCompleted = true;
    }

    /* ======================================================
       ARRAY
    ====================================================== */

    const transactions = Object.values(receiptMap);

    transactions.forEach(function (tx) {
      tx.total = roundToTwo(tx.total);
      tx.status = tx.hasVoided && tx.hasCompleted
        ? "PARTIALLY VOIDED"
        : tx.hasVoided
          ? "VOIDED"
          : "COMPLETED";
      delete tx.hasVoided;
      delete tx.hasCompleted;

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

      fromDate: selectedFromDate,
      toDate: selectedToDate,

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

    const lastRow = sheet.getLastRow();
    const receiptMatches = lastRow > 1
      ? sheet
        .getRange(2, SALES_COL.RECEIPT_ID, lastRow - 1, 1)
        .createTextFinder(receiptId)
        .matchCase(false)
        .matchEntireCell(true)
        .findAll()
        .map(function(cell) {
          return cell.getRow();
        })
        .sort(function(a, b) {
          return a - b;
        })
      : [];

    if (receiptMatches.length === 0) {
      return {
        success: false,
        message: "Transaction " + receiptId + " was not found.",
      };
    }

    const rowRuns = [];
    receiptMatches.forEach(function(rowNumber) {
      const previousRun = rowRuns[rowRuns.length - 1];
      if (previousRun && rowNumber === previousRun.end + 1) {
        previousRun.end = rowNumber;
      } else {
        rowRuns.push({ start: rowNumber, end: rowNumber });
      }
    });

    const tz = Session.getScriptTimeZone();

    let transaction = null;

    /* ======================================================
       FIND ALL LINES BELONGING TO RECEIPT
    ====================================================== */

    rowRuns.forEach(function(run) {
      const data = sheet
        .getRange(run.start, 1, run.end - run.start + 1, SALES_LOG_COLUMN_COUNT)
        .getValues();
      const statusNotes = sheet
        .getRange(run.start, SALES_COL.STATUS, run.end - run.start + 1, 1)
        .getNotes();

      for (let offset = 0; offset < data.length; offset++) {
        const row = data[offset];
        const i = run.start + offset - 1;

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

          originalReceiptId: SALES_IDX.ORIGINAL_RECEIPT_ID !== undefined ? String(row[SALES_IDX.ORIGINAL_RECEIPT_ID] || "") : "",

          total: 0,

          items: [],
        };
      }

      /* ================= ITEM ================= */

      const itemStatus = String(row[SALES_IDX.STATUS] || "").trim().toUpperCase();
      const isPartialVoid = itemStatus === "VOIDED" &&
        String(statusNotes[offset][0] || "").trim().toUpperCase() === "PARTIALLY VOIDED";
      const effectiveItemStatus = isPartialVoid ? "PARTIALLY VOIDED" : itemStatus;

      transaction.items.push({
        rowIndex: i,

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

        reason: String(row[SALES_IDX.REASON] || ""),
        status: effectiveItemStatus,
      });

      /* ================= TOTAL ================= */

      if (effectiveItemStatus !== "VOIDED") {
        transaction.total += Number(row[SALES_IDX.NET_TOTAL]) || 0;
      }

      /* ================= VOID STATUS ================= */

      if (effectiveItemStatus === "VOIDED" || effectiveItemStatus === "PARTIALLY VOIDED") transaction.hasVoided = true;
      else transaction.hasCompleted = true;

      /* ================= AUTHORIZED BY ================= */

      if (row[SALES_IDX.AUTHORIZED_BY]) {
        transaction.authorizedBy = String(row[SALES_IDX.AUTHORIZED_BY]);
      }

      /* ================= VOID REASON ================= */

      if (row[SALES_IDX.VOID_REASON]) {
        transaction.voidReason = String(row[SALES_IDX.VOID_REASON]);
      }
      }
    });

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
    transaction.status = transaction.hasVoided && transaction.hasCompleted
      ? "PARTIALLY VOIDED"
      : transaction.hasVoided
        ? "VOIDED"
        : "COMPLETED";
    delete transaction.hasVoided;
    delete transaction.hasCompleted;

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
