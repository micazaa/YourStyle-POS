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
  const categories = Object.keys(categoryGroups || {}).sort(function(a,b){ return a.localeCompare(b); });

  if (!categories.length) {
    return `<tr><td colspan="7" class="sales-empty">No completed sales recorded.</td></tr>`;
  }

  categories.forEach(function(category) {
    const group = categoryGroups[category];
    const items = (group.items || []).slice().sort(function(a,b) {
      if (!!a.isExchange !== !!b.isExchange) return a.isExchange ? 1 : -1;
      if (a.isExchange && b.isExchange && a.receiptId !== b.receiptId) return String(a.receiptId).localeCompare(String(b.receiptId));
      return String(a.name).localeCompare(String(b.name));
    });

    html += `
      <tr class="sales-category-row">
        <td colspan="5">${category}</td>
        <td class="sales-center">${Number(group.qty) || 0}</td>
        <td class="sales-money">${fmtMoney(group.total)}</td>
      </tr>`;

    items.forEach(function(item) {
      const exchange = !!item.isExchange;
      html += `
        <tr class="${exchange ? "sales-exchange-row" : "sales-item-row"}">
          <td class="${exchange ? "sales-exchange-name" : "sales-item-name"}">${item.name}</td>
          <td class="sales-code">${item.code}</td>
          <td class="sales-center">${item.size || ""}</td>
          <td class="sales-money">${fmtMoney(item.price)}</td>
          <td class="sales-money">${fmtDiscount(item.discount)}</td>
          <td class="sales-center ${Number(item.qty) < 0 ? "sales-negative" : ""}">${item.qty}</td>
          <td class="sales-money ${Number(item.total) < 0 ? "sales-negative" : ""}">${fmtMoney(item.total)}</td>
        </tr>`;
    });
  });

  return html;
}

/* ==========================================================
   PAYMENT SUMMARY BUILDER
========================================================== */

function buildPaymentSummary(metrics) {

  const payments =
    metrics.payments || {};

  const paymentDetail =
    metrics.paymentDetail || {};


  const methods =
    Object.keys(payments)
      .sort(function(a, b) {
        return a.localeCompare(b);
      });


  let html = "";


  /* ========================================================
     NO PAYMENTS
  ======================================================== */

  if (!methods.length) {

    html = `
      <tr>
        <td
          colspan="3"
          style="
            text-align:center;
            color:#999;
            padding:10px;
          "
        >
          No payments recorded.
        </td>
      </tr>
    `;

  } else {


    /* ======================================================
       PAYMENT METHODS
    ====================================================== */

    methods.forEach(function(method) {

      const payment =
        payments[method] || {};

      const refs =
        paymentDetail[method] || {};


      /* ====================================================
         CASH

         Cash has no reference-number detail.
      ==================================================== */

      if (
        String(method)
          .trim()
          .toUpperCase() ===
        "CASH"
      ) {

        html += `
          <tr
            style="
              background:#faf1f2;
            "
          >

            <td>
              <b style="color:#b76e79;">
                ${method}
              </b>
            </td>

            <td></td>

            <td style="text-align:right;">
              <b style="color:#8f1d3a;">
                ${fmtMoney(
                  Number(payment.gross) || 0
                )}
              </b>
            </td>

          </tr>
        `;


        return;

      }


      /* ====================================================
         NON-CASH METHOD TOTAL
      ==================================================== */

      html += `
        <tr
          style="
            background:#faf1f2;
          "
        >

          <td>
            <b style="color:#b76e79;">
              ${method}
            </b>
          </td>

          <td></td>

          <td style="text-align:right;">
            <b style="color:#8f1d3a;">
              ${fmtMoney(
                Number(payment.gross) || 0
              )}
            </b>
          </td>

        </tr>
      `;


      /* ====================================================
         REFERENCES

         Exchange rows naturally NET here.

         Example:

         EXCHANGE RETURN      -120
         EXCHANGE REPLACEMENT +188

         Same GCash reference:
         test = +68
      ==================================================== */

      Object.keys(refs)
        .sort(function(a, b) {
          return a.localeCompare(b);
        })
        .forEach(function(ref) {

          const amount =
            Number(refs[ref]) || 0;


          html += `
            <tr>

              <td></td>

              <td style="color:#666;">
                ${ref}
              </td>

              <td style="text-align:right;">
                ${fmtMoney(amount)}
              </td>

            </tr>
          `;

        });

    });

  }


  /* ========================================================
     TOTAL PAYMENTS
  ======================================================== */

  const totalPayments =
    methods.reduce(
      function(total, method) {

        return (
          total +
          (
            Number(
              payments[method] &&
              payments[method].gross
            ) || 0
          )
        );

      },
      0
    );


  /* ========================================================
     TOTAL NON-CASH
  ======================================================== */

  const totalNonCash =
    methods

      .filter(function(method) {

        return (
          String(method)
            .trim()
            .toUpperCase() !==
          "CASH"
        );

      })

      .reduce(
        function(total, method) {

          return (
            total +
            (
              Number(
                payments[method] &&
                payments[method].gross
              ) || 0
            )
          );

        },
        0
      );


  /* ========================================================
     CASH SALES

     Uses actual net CASH movement.

     Exchange:
     -120 + 188 = +68

     is therefore naturally handled.
  ======================================================== */

  let cashSales =
    0;


  methods.forEach(function(method) {

    if (
      String(method)
        .trim()
        .toUpperCase() ===
      "CASH"
    ) {

      cashSales +=
        Number(
          payments[method] &&
            payments[method].gross
        ) || 0;

    }

  });


  return {

    html:
      html,

    totalPayments:
      roundToTwo(
        totalPayments
      ),

    totalNonCash:
      roundToTwo(
        totalNonCash
      ),

    cashSales:
      roundToTwo(
        cashSales
      )

  };

}

/* ==========================================================
   SALES METRICS COLLECTOR
========================================================== */
function collectSalesMetrics(salesData, reportDate, cashierName, shiftStart, shiftEnd) {
  const tz = Session.getScriptTimeZone();
  const metrics = {
    items:{}, payments:{}, paymentDetail:{}, byCashier:{},
    totalSales:0, totalDiscount:0, itemsCount:0, transactionCount:0,
    totalCashReceived:0, totalChangeGiven:0, categoryGroups:{},
    firstLogTimestamp:null, lastLogTimestamp:null
  };
  const receiptIds = new Set();

  for (let i=1; i<salesData.length; i++) {
    const row = salesData[i];
    const rowDate = new Date(row[0]);
    if (isNaN(rowDate.getTime())) continue;
    const rowDateStr = Utilities.formatDate(rowDate, tz, "yyyy-MM-dd");
    if (shiftStart && rowDate < new Date(shiftStart)) continue;
    if (shiftEnd && rowDate > new Date(shiftEnd)) continue;

    const receiptId = String(row[1] || "").trim();
    const rowCashier = String(row[2] || "Unknown").trim();
    const rowStatus = String(row[15] || "").trim().toUpperCase();
    if (rowDateStr !== reportDate) continue;
    if (cashierName && rowCashier !== cashierName) continue;
    if (rowStatus !== "COMPLETED") continue;

    if (!metrics.firstLogTimestamp || rowDate < metrics.firstLogTimestamp) metrics.firstLogTimestamp = rowDate;
    if (!metrics.lastLogTimestamp || rowDate > metrics.lastLogTimestamp) metrics.lastLogTimestamp = rowDate;
    if (receiptId) receiptIds.add(receiptId);

    const code = row[SALES_IDX.CODE];
    const name = toProperCase(row[4] || "");
    const size = String(row[5] || "").toUpperCase();
    const category = row[6] || "YourFinds";
    const qty = parseInt(row[7]) || 0;
    const price = parseFloat(row[8]) || 0;
    const discount = parseFloat(row[9]) || 0;
    const netPayout = parseFloat(row[12]) || 0;
    const paymentMethod = row[13] || "Cash";
    const reference = row[14] || "N/A";
    const cashReceived = parseFloat(row[16]) || 0;
    const changeGiven = parseFloat(row[17]) || 0;
    const reason = String(row[19] || "").trim().toUpperCase();
    const isExchange = reason === "EXCHANGE RETURN" || reason === "EXCHANGE REPLACEMENT";

    metrics.totalSales += netPayout;
    metrics.totalDiscount += discount;
    if (
      reason !== "EXCHANGE RETURN" &&
      qty > 0
    ) {

      metrics.itemsCount += qty;

    }
    metrics.totalCashReceived += cashReceived;
    metrics.totalChangeGiven += changeGiven;

    // Normal sales aggregate. Exchange movements stay as their own auditable rows.
    const itemKey = isExchange
      ? ["EX", receiptId, reason, code, size, price].join("|")
      : ["SALE", category, code, size, price].join("|");

    if (!metrics.items[itemKey]) {
      metrics.items[itemKey] = {
        category:category, name:name, code:code, size:size, price:price,
        qty:0, discount:0, total:0, isExchange:isExchange,
        receiptId: receiptId,
        reason: reason,
        exchangeReason: isExchange ? reason : ""
      };
    }
    metrics.items[itemKey].qty += qty;
    metrics.items[itemKey].discount += discount;
    metrics.items[itemKey].total += netPayout;

    // Signed values make an exchange payment net naturally (-120 + 188 = 68).
    if (!metrics.payments[paymentMethod]) metrics.payments[paymentMethod] = {gross:0,count:0};
    metrics.payments[paymentMethod].gross += netPayout;
    metrics.payments[paymentMethod].count++;
    if (!metrics.paymentDetail[paymentMethod]) metrics.paymentDetail[paymentMethod] = {};
    if (!metrics.paymentDetail[paymentMethod][reference]) metrics.paymentDetail[paymentMethod][reference] = 0;
    metrics.paymentDetail[paymentMethod][reference] += netPayout;

    if (!metrics.byCashier[rowCashier]) metrics.byCashier[rowCashier] = {sales:0,transactions:0,items:0,receiptIds:{}};
    metrics.byCashier[rowCashier].sales += netPayout;
    if (reason !== "EXCHANGE RETURN" && qty > 0) metrics.byCashier[rowCashier].items += qty;
    if (receiptId) metrics.byCashier[rowCashier].receiptIds[receiptId] = true;
  }

  metrics.transactionCount = receiptIds.size;
  Object.keys(metrics.byCashier).forEach(function(name){
    const c = metrics.byCashier[name];
    c.transactions = Object.keys(c.receiptIds).length;
    delete c.receiptIds;
  });

Object.values(
  metrics.items
).forEach(function(item) {

  const category =
    item.category ||
    "YourFinds";


  if (
    !metrics.categoryGroups[
      category
    ]
  ) {

    metrics.categoryGroups[
      category
    ] = {

      items: [],
      qty: 0,
      discount: 0,
      total: 0

    };

  }


  const group =
    metrics.categoryGroups[
      category
    ];


  group.items.push(
    item
  );


  /*
    Headline Qty:

    NORMAL SALE            +qty
    EXCHANGE REPLACEMENT   +qty
    EXCHANGE RETURN        visible only

    Therefore:
    2 normal pins
    + 1 replacement
    = 3 headline pins.
  */

  if (
    item.exchangeReason !==
      "EXCHANGE RETURN" &&
    Number(item.qty) > 0
  ) {

    group.qty +=
      Number(item.qty);

  }


  /*
    Money stays SIGNED.

    Return -188
    Replacement +188
    = ₱0 exchange effect.
  */

  group.discount +=
    Number(item.discount) || 0;


  group.total +=
    Number(item.total) || 0;

});

  metrics.totalSales = roundToTwo(metrics.totalSales);
  metrics.totalDiscount = roundToTwo(metrics.totalDiscount);
  metrics.totalCashReceived = roundToTwo(metrics.totalCashReceived);
  metrics.totalChangeGiven = roundToTwo(metrics.totalChangeGiven);
  Object.keys(metrics.payments).forEach(function(method){ metrics.payments[method].gross = roundToTwo(metrics.payments[method].gross); });
  return metrics;
}

/* ==========================================================
   PDF CREATOR
========================================================== */

function createPdfFromHtml(html, fileName, overwriteExisting) {
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

    // For finalized/regenerated reports, keep one active PDF per report identity.
    // Old same-name copies are moved to trash before the replacement is created.
    if (overwriteExisting) {
      const existing = DriveApp.getFilesByName(safeFileName + ".pdf");
      while (existing.hasNext()) {
        try { existing.next().setTrashed(true); } catch (e) {}
      }
    }

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

function getBaseReportStyles() {
  return `
    @page { size:A4; margin:5mm; }
    * { box-sizing:border-box; }
    body { font-family:'Segoe UI',Arial,sans-serif; margin:0; color:#333; font-size:9px; }
    .header { border-bottom:2px solid #d8a7a7; margin-bottom:10px; padding-bottom:3px; display:flex; justify-content:space-between; align-items:flex-end; }
    .title { color:#b76e79; font-size:16px; font-weight:bold; }
    .meta { font-size:10px; margin-top:3px; line-height:1.5; }
    .meta-right { text-align:right; }
    h2 { color:#b76e79; border-bottom:1px solid #e3c6c6; padding-bottom:3px; margin:10px 0 6px; font-size:12.5px; page-break-after:avoid; }
    table { width:100%; border-collapse:collapse; margin-bottom:6px; page-break-inside:avoid; }
    th,td { border:1px solid #e3c6c6; padding:3px 6px; font-size:10px; }
    th { background-color:#f2dede; color:#b76e79; text-align:left; }
    .signature { display:flex; justify-content:space-between; margin-top:20px; page-break-inside:avoid; }
    .sig-line { border-top:1px solid #333; width:180px; text-align:center; padding-top:4px; font-size:10.5px; }
    .report-grid { display:flex; gap:10px; margin-top:10px; page-break-inside:avoid; align-items:flex-start; }
    .report-card { flex:1; border:1px solid #b7b7b7; border-radius:8px; overflow:hidden; page-break-inside:avoid; }
    .report-card-header { background:#f3dde1; color:#b76e79; font-weight:bold; font-size:11px; padding:6px 8px; border-bottom:1px solid #e3c6c6; }
    .report-card-body { padding:8px; }
    .report-summary-table,.report-denom-table { width:100%; border-collapse:collapse; margin-bottom:8px; }
    .report-summary-table th,.report-summary-table td,.report-denom-table th,.report-denom-table td { border:1px solid #b7b7b7; padding:4px 6px; font-size:10px; }
    .report-summary-table th,.report-denom-table th { background:#f2dede; color:#b76e79; }
    .report-remark { font-size:10px; color:#b45f06; font-weight:bold; margin-top:6px; }
    .report-col-right { flex:1; display:flex; flex-direction:column; gap:10px; }
    .report-col-right .report-card { flex:none; }
    .report-text-summary { font-size:10.5px; line-height:1.6; margin:0 0 8px; }
    .petty-denom-table { width:100%; border-collapse:collapse; margin:6px 0; }
    .petty-denom-table th,.petty-denom-table td { border:1px solid #b7b7b7; padding:3px 6px; font-size:10px; text-align:right; }
    .ps-total-label { text-align:right !important; color:#8f1d3a; font-weight:bold; }
    .ps-total-value { color:#8f1d3a; font-weight:bold; }
    .ps-words { font-size:10px; font-style:italic; color:#8a6a6e; margin:4px 0; }
    ${getBaseReportStyles()}
  `;
}

function buildSalesSummaryFooter(metrics) {
  return `
    <tr>
      <td colspan="5" style="background:#f3dde1;color:#70464d;font-weight:800;text-align:left;padding:7px 10px;border-top:2px solid #d2a2aa;border-bottom:2px solid #d2a2aa;border-left:1px solid #d2a2aa;border-right:1px solid #d2a2aa;">NET SALES</td>
      <td style="background:#f3dde1;color:#70464d;font-weight:800;text-align:center;padding:7px 8px;border-top:2px solid #d2a2aa;border-bottom:2px solid #d2a2aa;border-left:1px solid #d2a2aa;border-right:1px solid #d2a2aa;">${metrics.itemsCount}</td>
      <td style="background:#f3dde1;color:#9b1738;font-size:11px;font-weight:800;text-align:right;padding:7px 10px;border-top:2px solid #d2a2aa;border-bottom:2px solid #d2a2aa;border-left:1px solid #d2a2aa;border-right:1px solid #d2a2aa;">${fmtMoney(metrics.totalSales)}</td>
    </tr>`;
}

function getSalesSummaryReportStyles() {

  return `
    .sales-summary-table {
      width:100%;
      border-collapse:collapse;
      margin-top:4px;
      margin-bottom:8px;
    }

    .sales-summary-table th {
      background:#f7f2f3;
      color:#68464b;
      font-size:9px;
      font-weight:700;
      padding:6px 7px;
      border:1px solid #dfc9cd;
      text-align:left;
    }

    .sales-summary-table td {
      padding:5px 7px;
      border:1px solid #eadadd;
      vertical-align:middle;
      font-size:10px;
    }

    .sales-category-row td {
      background:#f6e7ea;
      color:#74434b;
      font-weight:700;
      border:1px solid #d9b8be;
    }

    .sales-item-row td {
      background:#fff;
    }

    .sales-item-name {
      padding-left:18px !important;
      font-weight:600;
      color:#343434;
    }

    .sales-code {
      color:#666;
      font-family:monospace;
      font-size:9px;
    }

    .sales-center {
      text-align:center;
    }

    .sales-money {
      text-align:right;
      white-space:nowrap;
    }

    .sales-exchange-row td {
      background:#fcf8f9;
      color:#75676a;
      font-size:8.7px;
      border-top:1px dashed #dcc9cd;
      border-bottom:1px dashed #dcc9cd;
    }

    .sales-exchange-name {
      padding-left:38px !important;
      font-weight:500;
    }

    .sales-negative {
      color:#a23f4d !important;
      font-weight:700;
    }

    .sales-empty {
      text-align:center;
      color:#999;
      padding:16px !important;
    }
  `;

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

        ${getBaseReportStyles()}

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

      <table class="sales-summary-table">

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

${buildSalesSummaryFooter(metrics)}

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
                    style="text-align:right;"
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
                Expected:
                <b>${fmtMoney(expectedCashDrawer)}</b>

                <br>

                Remitted:
                <b>${fmtMoney(cashOnHand)}</b>
                
                ${
                  Math.abs(cashVariance) > 0.001
                    ? `
                      <br>
                      <span style="color:#b45f06;">
                        Variance:
                        <b>${fmtMoney(cashVariance)}</b>
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

        ${getSalesSummaryReportStyles()}

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

      <table class="sales-summary-table">

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


${buildSalesSummaryFooter(metrics)}

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
