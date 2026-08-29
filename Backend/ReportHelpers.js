const REPORT_DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

function fmtMoney(n) {
  n = Number(n) || 0;

  return (
    (n < 0 ? "-" : "") +
    "₱" +
    Math.abs(n)
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  );
}

function fmtDiscount(n) {
  n = Number(n) || 0;

  return n > 0 ? fmtMoney(n) : "";
}

function sumBreakdown(breakdown) {
  if (!breakdown) {
    return 0;
  }

  let total = 0;

  REPORT_DENOMS.forEach(function (denom) {
    const qty = parseInt(breakdown[denom]) || 0;

    total += denom * qty;
  });

  return roundToTwo(total);
}

function denomRowsHtml(breakdown) {
  if (!breakdown) {
    return `
      <tr>
        <td colspan="3" style="color:#999;">
          No denominations counted.
        </td>
      </tr>
    `;
  }

  let rows = "";

  REPORT_DENOMS.forEach(function (denom) {
    const qty = parseInt(breakdown[denom]) || 0;

    if (qty <= 0) {
      return;
    }

    rows += `
      <tr>
        <td>${denom.toLocaleString()}</td>
        <td>${qty}</td>
        <td>${fmtMoney(denom * qty)}</td>
      </tr>
    `;
  });

  if (!rows) {
    return `
      <tr>
        <td colspan="3" style="color:#999;">
          No denominations counted.
        </td>
      </tr>
    `;
  }

  return rows;
}

/* ==========================================================
   SALES SUMMARY BUILDER
========================================================== */

function buildSalesSummary(categoryGroups) {
  let html = "";

  const categories = Object.keys(categoryGroups || {}).sort((a, b) =>
    a.localeCompare(b)
  );

  if (categories.length === 0) {
    return `
      <tr>
        <td colspan="7" style="text-align:center; color:#999;">
          No completed sales recorded.
        </td>
      </tr>
    `;
  }

  categories.forEach(function (cat) {
    const group = categoryGroups[cat];

    group.items.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    // Category subtotal row
    html += `
      <tr>
        <td colspan="4" style="background-color:#fbe4e8;">
          <b style="color:#b76e79;">
            ${cat}
          </b>
        </td>

        <td style="background-color:#fbe4e8;"></td>

        <td style="background-color:#fbe4e8;">
          <b style="color:#b76e79;">
            ${group.qty}
          </b>
        </td>

        <td style="background-color:#fbe4e8;">
          <b style="color:#b76e79;">
            ${fmtMoney(group.total)}
          </b>
        </td>
      </tr>
    `;

    // Individual items
    group.items.forEach(function (item) {
      html += `
        <tr>

          <td style="padding-left:20px;">
            ${item.name}
          </td>

          <td>
            ${item.code}
          </td>

          <td>
            ${item.size}
          </td>

          <td>
            ${fmtMoney(item.price)}
          </td>

          <td>
            ${fmtDiscount(item.discount)}
          </td>

          <td>
            ${item.qty}
          </td>

          <td>
            ${fmtMoney(item.total)}
          </td>

        </tr>
      `;
    });
  });

  return html;
}

/* ==========================================================
   PAYMENT SUMMARY BUILDER
========================================================== */

function buildPaymentSummary(metrics) {
  const payments = metrics.payments || {};
  const paymentDetail = metrics.paymentDetail || {};

  const methods = Object.keys(payments).sort((a, b) => a.localeCompare(b));

  let html = "";

  if (methods.length === 0) {
    html = `
      <tr>
        <td colspan="3" style="color:#999; text-align:center;">
          No payments recorded.
        </td>
      </tr>
    `;
  } else {
    methods.forEach(function (method) {
      const payment = payments[method];
      const refs = paymentDetail[method] || {};

      /* ------------------------------------------
         CASH
         Subtotal only — no reference breakdown
      ------------------------------------------ */

      if (method === "Cash") {
        html += `
          <tr style="background:#faf1f2;">

            <td>
              <b style="color:#b76e79;">
                Cash
              </b>
            </td>

            <td></td>

            <td>
              <b style="color:#b76e79;">
                ${fmtMoney(payment.gross)}
              </b>
            </td>

          </tr>
        `;

        return;
      }

      /* ------------------------------------------
         NON-CASH
         Method subtotal
      ------------------------------------------ */

      html += `
        <tr style="background:#faf1f2;">

          <td>
            <b style="color:#b76e79;">
              ${method}
            </b>
          </td>

          <td></td>

          <td>
            <b style="color:#b76e79;">
              ${fmtMoney(payment.gross)}
            </b>
          </td>

        </tr>
      `;

      /* ------------------------------------------
         NON-CASH REFERENCES
      ------------------------------------------ */

      Object.keys(refs)
        .sort((a, b) => a.localeCompare(b))
        .forEach(function (ref) {
          html += `
            <tr>

              <td></td>

              <td>
                ${ref}
              </td>

              <td>
                ${fmtMoney(refs[ref])}
              </td>

            </tr>
          `;
        });
    });
  }

  /* ------------------------------------------
     TOTALS
  ------------------------------------------ */

  const totalPayments = methods.reduce(function (total, method) {
    return total + (Number(payments[method].gross) || 0);
  }, 0);

  const totalNonCash = methods
    .filter(function (method) {
      return method !== "Cash";
    })
    .reduce(function (total, method) {
      return total + (Number(payments[method].gross) || 0);
    }, 0);

  const cashSales = roundToTwo(
    (Number(metrics.totalSales) || 0) - totalNonCash
  );

  return {
    html: html,

    totalPayments: roundToTwo(totalPayments),

    totalNonCash: roundToTwo(totalNonCash),

    cashSales: cashSales,
  };
}

/* ==========================================================
   SALES METRICS COLLECTOR

   Reads Sales Log data and builds shared report metrics.

   cashierName:
   - Pass cashier name = filter to that cashier
   - Pass null / "" = include all cashiers
========================================================== */

function collectSalesMetrics(salesData, reportDate, cashierName, shiftStart, shiftEnd) {
  const tz = Session.getScriptTimeZone();

  const metrics = {
    items: {},
    payments: {},
    paymentDetail: {},
    byCashier: {},

    totalSales: 0,
    totalDiscount: 0,
    itemsCount: 0,
    transactionCount: 0,

    totalCashReceived: 0,
    totalChangeGiven: 0,

    categoryGroups: {},

    firstLogTimestamp: null,
    lastLogTimestamp: null,
  };

  // Used so transactionCount counts RECEIPTS,
  // not individual Sales Log rows.
  const receiptIds = new Set();

  for (let i = 1; i < salesData.length; i++) {
    const row = salesData[i];

    const rowDate = new Date(row[0]);

    if (isNaN(rowDate.getTime())) {
      continue;
    }

    const rowDateStr = Utilities.formatDate(rowDate, tz, "yyyy-MM-dd");

    if (shiftStart && rowDate < new Date(shiftStart)) continue;
    if (shiftEnd && rowDate > new Date(shiftEnd)) continue;

    const receiptId = row[1] || "";

    const rowCashier = row[2] || "Unknown";

    const rowStatus = row[15] || "";

    // -----------------------------
    // FILTER DATE
    // -----------------------------

    if (rowDateStr !== reportDate) {
      continue;
    }

    // -----------------------------
    // FILTER CASHIER
    // -----------------------------

    if (cashierName && rowCashier !== cashierName) {
      continue;
    }

    // -----------------------------
    // COMPLETED SALES ONLY
    // -----------------------------

    if (rowStatus !== "COMPLETED") {
      continue;
    }

    // -----------------------------
    // SHIFT TIME
    // -----------------------------

    if (!metrics.firstLogTimestamp || rowDate < metrics.firstLogTimestamp) {
      metrics.firstLogTimestamp = rowDate;
    }

    if (!metrics.lastLogTimestamp || rowDate > metrics.lastLogTimestamp) {
      metrics.lastLogTimestamp = rowDate;
    }

    // -----------------------------
    // RECEIPT COUNT
    // -----------------------------

    if (receiptId) {
      receiptIds.add(receiptId);
    }

    // -----------------------------
    // SALES DATA
    // -----------------------------

    const code = row[SALES_IDX.CODE];

    const name = toProperCase(row[4] || "");

    const size = (row[5] || "").toString().toUpperCase();

    const category = row[6] || "YourFinds";

    const qty = parseInt(row[7]) || 0;

    const price = parseFloat(row[8]) || 0;

    const discount = parseFloat(row[9]) || 0;

    const netPayout = parseFloat(row[12]) || 0;

    const paymentMethod = row[13] || "Cash";

    const reference = row[14] || "N/A";

    const cashReceived = parseFloat(row[16]) || 0;

    const changeGiven = parseFloat(row[17]) || 0;

    // -----------------------------
    // GRAND TOTALS
    // -----------------------------

    metrics.totalSales += netPayout;
    metrics.totalDiscount += discount;
    metrics.itemsCount += qty;

    metrics.totalCashReceived += cashReceived;

    metrics.totalChangeGiven += changeGiven;

    // -----------------------------
    // ITEMS
    // -----------------------------

    const itemKey =
      category + "|" +
      code + "|" +
      size + "|" +
      price;


    if (!metrics.items[itemKey]) {

      metrics.items[itemKey] = {

        category: category,
        name: name,
        code: code,
        size: size,
        price: price,

        qty: 0,
        discount: 0,
        total: 0

      };

    }

    metrics.items[itemKey].qty += qty;

    metrics.items[itemKey].discount += discount;

    metrics.items[itemKey].total += netPayout;

    // -----------------------------
    // PAYMENT METHODS
    // -----------------------------

    if (!metrics.payments[paymentMethod]) {
      metrics.payments[paymentMethod] = {
        gross: 0,
        count: 0,
      };
    }

    metrics.payments[paymentMethod].gross += netPayout;

    metrics.payments[paymentMethod].count++;

    // -----------------------------
    // PAYMENT REFERENCES
    // -----------------------------

    if (!metrics.paymentDetail[paymentMethod]) {
      metrics.paymentDetail[paymentMethod] = {};
    }

    if (!metrics.paymentDetail[paymentMethod][reference]) {
      metrics.paymentDetail[paymentMethod][reference] = 0;
    }

    metrics.paymentDetail[paymentMethod][reference] += netPayout;

    // -----------------------------
    // SALES BY CASHIER
    // -----------------------------

    if (!metrics.byCashier[rowCashier]) {
      metrics.byCashier[rowCashier] = {
        sales: 0,
        transactions: 0,
        items: 0,
        receiptIds: {},
      };
    }

    const cashierMetrics = metrics.byCashier[rowCashier];

    cashierMetrics.sales += netPayout;

    cashierMetrics.items += qty;

    if (receiptId) {
      cashierMetrics.receiptIds[receiptId] = true;
    }
  }

  /* ========================================================
     TRANSACTION COUNTS
  ======================================================== */

  metrics.transactionCount = receiptIds.size;

  Object.keys(metrics.byCashier).forEach(function (name) {
    const cashier = metrics.byCashier[name];

    cashier.transactions = Object.keys(cashier.receiptIds).length;

    // Internal tracking no longer needed.
    delete cashier.receiptIds;
  });

  /* ========================================================
     CATEGORY GROUPS
  ======================================================== */

  Object.values(metrics.items).forEach(function (item) {
    const category = item.category || "YourFinds";

    if (!metrics.categoryGroups[category]) {
      metrics.categoryGroups[category] = {
        items: [],
        qty: 0,
        discount: 0,
        total: 0,
      };
    }

    const group = metrics.categoryGroups[category];

    group.items.push(item);

    group.qty += item.qty;

    group.discount += item.discount;

    group.total += item.total;
  });

  /* ========================================================
     ROUND MONEY VALUES
  ======================================================== */

  metrics.totalSales = roundToTwo(metrics.totalSales);

  metrics.totalDiscount = roundToTwo(metrics.totalDiscount);

  metrics.totalCashReceived = roundToTwo(metrics.totalCashReceived);

  metrics.totalChangeGiven = roundToTwo(metrics.totalChangeGiven);

  Object.keys(metrics.payments).forEach(function (method) {
    metrics.payments[method].gross = roundToTwo(metrics.payments[method].gross);
  });

  return metrics;
}

/* ==========================================================
   PDF CREATOR

   Converts report HTML to PDF, saves it to Drive,
   enables link viewing, and returns the download URL.
========================================================== */

function createPdfFromHtml(html, fileName) {
  try {
    const safeFileName = String(fileName || "Report").replace(
      /[\\/:*?"<>|]/g,
      "_"
    );

    const htmlBlob = Utilities.newBlob(
      html,
      "text/html",
      safeFileName + ".html"
    );

    const pdfBlob = htmlBlob
      .getAs("application/pdf")
      .setName(safeFileName + ".pdf");

    const file = DriveApp.createFile(pdfBlob);

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      success: true,
      downloadUrl: file.getDownloadUrl(),
      fileName: file.getName(),
    };
  } catch (err) {
    return {
      success: false,
      message: "PDF Engine Error: " + err.toString(),
    };
  }
}

/* ==========================================================
   CASHIER SUMMARY BUILDER

   Used by Manager Daily Report.
========================================================== */

function buildCashierSummary(byCashier) {
  const cashiers = byCashier || {};
  const names = Object.keys(cashiers).sort();

  if (names.length === 0) {
    return `
      <tr>
        <td colspan="4"
            style="text-align:center; color:#999;">
          No cashier sales recorded.
        </td>
      </tr>
    `;
  }

  let html = "";

  names.forEach(function (name) {
    const cashier = cashiers[name];

    html += `
      <tr>
        <td>${name}</td>
        <td>${fmtMoney(cashier.sales)}</td>
        <td>${cashier.transactions}</td>
        <td>${cashier.items}</td>
      </tr>
    `;
  });

  return html;
}

/* ==========================================================
   CASHIER REPORT HTML BUILDER
========================================================== */

function buildCashierReportHTML(data) {
  const {
    managerName,
    cashierName,
    todayDisplay,
    shiftStartDisplay,
    shiftEndDisplay,

    metrics,
    salesRowsHtml,
    paymentDetailHtml,
    totalAllPayments,

    pettyReceived,
    pettyReturnedTotal,
    pettyVariance,
    pettyReturnBreakdown,
    pettyRemarkHtml,

    expectedCashDrawer,
    cashOnHand,
    cashVariance,
    cashBreakdown,
    cashRemarkHtml,

    zoom,
  } = data;

  return `
    <html>

    <head>

      <style>

        @page {
          size: A4;
          margin: 5mm;
        }

        * {
          box-sizing: border-box;
        }

        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          margin: 0;
          color: #333;
          font-size: 9px;
        }

        .header {
          border-bottom: 2px solid #d8a7a7;
          margin-bottom: 10px;
          padding-bottom: 3px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        .title {
          color: #b76e79;
          font-size: 16px;
          font-weight: bold;
        }

        .meta {
          font-size: 10px;
          margin-top: 3px;
          line-height: 1.5;
        }

        .meta-right {
          text-align: right;
        }

        h2 {
          color: #b76e79;
          border-bottom: 1px solid #e3c6c6;
          padding-bottom: 3px;
          margin: 10px 0 6px;
          font-size: 12.5px;
          page-break-after: avoid;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 6px;
          page-break-inside: avoid;
        }

        th,
        td {
          border: 1px solid #e3c6c6;
          padding: 3px 6px;
          font-size: 10px;
        }

        th {
          background-color: #f2dede;
          color: #b76e79;
          text-align: left;
        }

        .signature {
          display: flex;
          justify-content: space-between;
          margin-top: 20px;
          page-break-inside: avoid;
        }

        .sig-line {
          border-top: 1px solid #333;
          width: 180px;
          text-align: center;
          padding-top: 4px;
          font-size: 10.5px;
        }

        .report-grid {
          display: flex;
          gap: 10px;
          margin-top: 10px;
          page-break-inside: avoid;
          align-items: flex-start;
        }

        .report-card {
          flex: 1;
          border: 1px solid #b7b7b7;
          border-radius: 8px;
          overflow: hidden;
          page-break-inside: avoid;
        }

        .report-card-header {
          background: #f3dde1;
          color: #b76e79;
          font-weight: bold;
          font-size: 11px;
          padding: 6px 8px;
          border-bottom: 1px solid #e3c6c6;
        }

        .report-card-body {
          padding: 8px;
        }

        .report-summary-table,
        .report-denom-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 8px;
        }

        .report-summary-table th,
        .report-summary-table td,
        .report-denom-table th,
        .report-denom-table td {
          border: 1px solid #b7b7b7;
          padding: 4px 6px;
          font-size: 10px;
        }

        .report-summary-table th,
        .report-denom-table th {
          background: #f2dede;
          color: #b76e79;
        }

        .report-remark {
          font-size: 10px;
          color: #b45f06;
          font-weight: bold;
          margin-top: 6px;
        }

        .report-col-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .report-col-right .report-card {
          flex: none;
        }

        .report-text-summary {
          font-size: 10.5px;
          line-height: 1.6;
          margin: 0 0 8px;
        }

        .petty-denom-table {
          width: 100%;
          border-collapse: collapse;
          margin: 6px 0;
        }

        .petty-denom-table th,
        .petty-denom-table td {
          border: 1px solid #b7b7b7;
          padding: 3px 6px;
          font-size: 10px;
          text-align: right;
        }

        .ps-total-label {
          text-align: right !important;
          color: #8f1d3a;
          font-weight: bold;
        }

        .ps-total-value {
          color: #8f1d3a;
          font-weight: bold;
        }

        .ps-words {
          font-size: 10px;
          font-style: italic;
          color: #8a6a6e;
          margin: 4px 0;
        }

      </style>

    </head>


    <body style="zoom:${zoom};">

      <!-- ================= HEADER ================= -->

      <div class="header">

        <div>

          <div class="title">
            CASHIER'S DAILY SALES REPORT
          </div>

          <div class="meta">
            Manager: ${managerName}
            &nbsp;&nbsp;
            Cashier: ${cashierName}
          </div>

        </div>


        <div class="meta meta-right">

          Date: ${todayDisplay}<br>

          First Log: ${shiftStartDisplay}
          &nbsp;|&nbsp;
          Last Log: ${shiftEndDisplay}

        </div>

      </div>


      <!-- ================= SALES SUMMARY ================= -->

      <h2>Sales Summary</h2>

      <table>

        <tr>
          <th>Item Name</th>
          <th>Barcode</th>
          <th>Size</th>
          <th>Price</th>
          <th>Discount</th>
          <th>Qty</th>
          <th>Net Total</th>
        </tr>

        ${salesRowsHtml}

        <tr>

          <td
            colspan="5"
            style="
              background-color:#f3b6c2;
              text-align:right;
            "
          >
            <b style="color:#8f1d3a;">
              Net Sales
            </b>
          </td>

          <td style="background-color:#f3b6c2;">
            <b style="color:#8f1d3a;">
              ${metrics.itemsCount}
            </b>
          </td>

          <td style="background-color:#f3b6c2;">
            <b style="color:#8f1d3a;">
              ${fmtMoney(metrics.totalSales)}
            </b>
          </td>

        </tr>

      </table>


      <!-- ================= LOWER REPORT GRID ================= -->

      <div class="report-grid">


        <!-- ================= PAYMENT METHODS ================= -->

        <div class="report-card">

          <div class="report-card-header">
            PAYMENT METHODS
          </div>

          <div class="report-card-body">

            <table class="report-summary-table">

              <tr>
                <th>Payment Method</th>
                <th>Reference Number</th>
                <th>Amount</th>
              </tr>

              ${paymentDetailHtml}

              <tr>

                <td colspan="2">
                  <b style="color:#8f1d3a;">
                    Grand Total
                  </b>
                </td>

                <td>
                  <b style="color:#8f1d3a;">
                    ${fmtMoney(totalAllPayments)}
                  </b>
                </td>

              </tr>

            </table>

          </div>

        </div>


        <!-- ================= RIGHT COLUMN ================= -->

        <div class="report-col-right">


          <!-- ================= PETTY CASH ================= -->

          <div class="report-card">

            <div class="report-card-header">
              PETTY CASH
            </div>

            <div class="report-card-body">

              <p class="report-text-summary">

                Received:
                <b>${fmtMoney(pettyReceived)}</b>

                <br>

                Returned:
                <b>${fmtMoney(pettyReturnedTotal)}</b>

                ${
                  Math.abs(pettyVariance) > 0.001
                    ? `
                      <br>
                      <span style="color:#b45f06;">
                        Short/Over:
                        <b>${fmtMoney(pettyVariance)}</b>
                      </span>
                    `
                    : ""
                }

              </p>


              <table class="petty-denom-table">

                <tr>
                  <th class="ps-denom">Denom</th>
                  <th>Qty</th>
                  <th>Subtotal</th>
                </tr>

                ${denomRowsHtml(pettyReturnBreakdown)}

                <tr>

                  <td
                    colspan="2"
                    class="ps-total-label"
                  >
                    Returned Total
                  </td>

                  <td class="ps-total-value">
                    ${fmtMoney(pettyReturnedTotal)}
                  </td>

                </tr>

              </table>


              <p class="ps-words">
                Amount in Words:
                ${numberToWordsPeso(pettyReturnedTotal)}
              </p>

              ${pettyRemarkHtml}

            </div>

          </div>


          <!-- ================= SALES CASH ================= -->

          <div class="report-card">

            <div class="report-card-header">
              SALES CASH
            </div>

            <div class="report-card-body">

              <p class="report-text-summary">
                Cash Counted / Remitted:
                <b>${fmtMoney(cashOnHand)}</b>
              </p>


              <table class="report-denom-table">

                <tr>
                  <th>Denom</th>
                  <th>Qty</th>
                  <th>Subtotal</th>
                </tr>

                ${denomRowsHtml(cashBreakdown)}

                <tr>

                  <td
                    colspan="2"
                    style="text-align:right;"
                  >
                    <b style="color:#8f1d3a;">
                      Counted Total
                    </b>
                  </td>

                  <td class="ps-total-value">
                    ${fmtMoney(cashOnHand)}
                  </td>

                </tr>

              </table>


              <p class="ps-words">
                Amount in Words:
                ${numberToWordsPeso(cashOnHand)}
              </p>

              ${cashRemarkHtml}

            </div>

          </div>

        </div>

      </div>


      <!-- ================= SIGNATURES ================= -->

      <div class="signature">

        <div class="sig-line">
          Prepared by: ${cashierName}
        </div>

        <div class="sig-line">
          Checked by: ${managerName}
        </div>

      </div>

    </body>

    </html>
  `;
}

/* ==========================================================
   MANAGER REPORT HTML BUILDER
========================================================== */

function buildManagerReportHTML(data) {

  const {
    managerName,
    todayDisplay,

    metrics,
    cashierRows,
    salesRowsHtml,

    paymentDetailHtml,
    totalAllPayments,

    expectedCashDrawer,
    cashOnHand,
    cashVariance,
    cashBreakdown,
    cashRemarkHtml,

    zoom
  } = data;


  return `
    <html>

    <head>

      <style>

        @page {
          size: A4;
          margin: 5mm;
        }

        * {
          box-sizing: border-box;
        }

        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          margin: 0;
          color: #333;
          font-size: 9px;
        }

        .header {
          border-bottom: 2px solid #d8a7a7;
          margin-bottom: 10px;
          padding-bottom: 3px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        .title {
          color: #b76e79;
          font-size: 16px;
          font-weight: bold;
        }

        .meta {
          font-size: 10px;
          margin-top: 3px;
          line-height: 1.5;
        }

        h2 {
          color: #b76e79;
          border-bottom: 1px solid #e3c6c6;
          padding-bottom: 3px;
          margin: 10px 0 6px;
          font-size: 12.5px;
          page-break-after: avoid;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 6px;
          page-break-inside: avoid;
        }

        th,
        td {
          border: 1px solid #e3c6c6;
          padding: 3px 6px;
          font-size: 10px;
        }

        th {
          background-color: #f2dede;
          color: #b76e79;
          text-align: left;
        }

        .signature {
          display: flex;
          justify-content: space-between;
          margin-top: 20px;
          page-break-inside: avoid;
        }

        .sig-line {
          border-top: 1px solid #333;
          width: 180px;
          text-align: center;
          padding-top: 4px;
          font-size: 10.5px;
        }

        .report-grid {
          display: flex;
          gap: 10px;
          margin-top: 10px;
          page-break-inside: avoid;
          align-items: flex-start;
        }

        .report-card {
          flex: 1;
          border: 1px solid #b7b7b7;
          border-radius: 8px;
          overflow: hidden;
          page-break-inside: avoid;
        }

        .report-card-header {
          background: #f3dde1;
          color: #b76e79;
          font-weight: bold;
          font-size: 11px;
          padding: 6px 8px;
          border-bottom: 1px solid #e3c6c6;
        }

        .report-card-body {
          padding: 8px;
        }

        .report-summary-table,
        .report-denom-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 8px;
        }

        .report-summary-table th,
        .report-summary-table td,
        .report-denom-table th,
        .report-denom-table td {
          border: 1px solid #b7b7b7;
          padding: 4px 6px;
          font-size: 10px;
        }

        .report-summary-table th,
        .report-denom-table th {
          background: #f2dede;
          color: #b76e79;
        }

        .report-remark {
          font-size: 10px;
          color: #b45f06;
          font-weight: bold;
          margin-top: 6px;
        }

        .report-col-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .report-col-right .report-card {
          flex: none;
        }

        .report-text-summary {
          font-size: 10.5px;
          line-height: 1.6;
          margin: 0 0 8px;
        }

      </style>

    </head>


    <body style="zoom:${zoom};">


      <!-- ================= HEADER ================= -->

      <div class="header">

        <div>

          <div class="title">
            YOURSTYLE — MANAGER'S DAILY SALES REPORT
          </div>

          <div class="meta">
            Date: ${todayDisplay}
            &nbsp;&nbsp;
            Generated by: ${managerName}
          </div>

        </div>

      </div>


      <!-- ================= SALES BY CASHIER ================= -->

      <h2>Sales by Cashier</h2>

      <table>

        <tr>
          <th>Cashier</th>
          <th>Sales</th>
          <th>Transactions</th>
          <th>Items</th>
        </tr>

        ${cashierRows}

      </table>


      <!-- ================= SALES SUMMARY ================= -->

      <h2>Sales Summary</h2>

      <table>

        <tr>
          <th>Item Name</th>
          <th>Barcode</th>
          <th>Size</th>
          <th>Price</th>
          <th>Discount</th>
          <th>Qty</th>
          <th>Net Total</th>
        </tr>

        ${salesRowsHtml}


        <tr>

          <td
            colspan="5"
            style="
              background-color:#f3b6c2;
              text-align:right;
            "
          >
            <b style="color:#8f1d3a;">
              GRAND TOTAL (NET SALES)
            </b>
          </td>

          <td style="background-color:#f3b6c2;">
            <b style="color:#8f1d3a;">
              ${metrics.itemsCount}
            </b>
          </td>

          <td style="background-color:#f3b6c2;">
            <b style="color:#8f1d3a;">
              ${fmtMoney(metrics.totalSales)}
            </b>
          </td>

        </tr>

      </table>


      <!-- ================= LOWER GRID ================= -->

      <div class="report-grid">


        <!-- ================= PAYMENT METHODS ================= -->

        <div class="report-card">

          <div class="report-card-header">
            PAYMENT METHODS
          </div>

          <div class="report-card-body">

            <table class="report-summary-table">

              <tr>
                <th>Payment Method</th>
                <th>Reference Number</th>
                <th>Amount</th>
              </tr>

              ${paymentDetailHtml}


              <tr>

                <td colspan="2">
                  <b style="color:#b76e79;">
                    Grand Total
                  </b>
                </td>

                <td>
                  <b style="color:#8f1d3a;">
                    ${fmtMoney(totalAllPayments)}
                  </b>
                </td>

              </tr>

            </table>

          </div>

        </div>


        <!-- ================= SALES CASH ================= -->

        <div class="report-col-right">

          <div class="report-card">

            <div class="report-card-header">
              SALES CASH
            </div>

            <div class="report-card-body">

              <p class="report-text-summary">

                Expected:
                <b>
                  ${fmtMoney(expectedCashDrawer)}
                </b>

                <br>

                Remitted:
                <b>
                  ${fmtMoney(cashOnHand)}
                </b>


                ${
                  Math.abs(cashVariance) > 0.001
                    ? `
                      <br>

                      <span style="color:#b45f06;">

                        Variance:

                        <b>
                          ${fmtMoney(cashVariance)}
                        </b>

                      </span>
                    `
                    : ""
                }

              </p>


              <table class="report-denom-table">

                <tr>
                  <th>Denom</th>
                  <th>Qty</th>
                  <th>Subtotal</th>
                </tr>

                ${denomRowsHtml(cashBreakdown)}


                <tr>

                  <td
                    colspan="2"
                    style="text-align:right;"
                  >

                    <b style="color:#b76e79;">
                      Counted Total
                    </b>

                  </td>

                  <td
                    style="
                      color:#8f1d3a;
                      font-weight:bold;
                    "
                  >

                    ${fmtMoney(cashOnHand)}

                  </td>

                </tr>

              </table>


              ${cashRemarkHtml}

            </div>

          </div>

        </div>

      </div>


      <!-- ================= SIGNATURE ================= -->

      <div class="signature">

        <div class="sig-line">
          Prepared by: ${managerName}
        </div>

        <div class="sig-line">
          Checked by: ${managerName}
        </div>

      </div>


    </body>

    </html>
  `;
}
