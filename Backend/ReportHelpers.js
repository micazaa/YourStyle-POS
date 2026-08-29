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

  const categories =
    Object.keys(categoryGroups || {})
      .sort(function(a, b) {
        return a.localeCompare(b);
      });


  if (!categories.length) {

    return `
      <tr>
        <td colspan="7" class="sales-empty">
          No completed sales recorded.
        </td>
      </tr>
    `;

  }


  categories.forEach(function(category) {

    const group =
      categoryGroups[category];


    const normalItems =
      (group.items || [])
        .filter(function(item) {
          return !item.isExchangeAdjustment &&
                 !item.isExchangeReturn;
        })
        .sort(function(a, b) {
          return a.name.localeCompare(b.name);
        });


    const exchangeItems =
      (group.items || [])
        .filter(function(item) {
          return item.isExchangeAdjustment;
        });


    const displayQty =
      Number(
        group.displayQty !== undefined
          ? group.displayQty
          : group.qty
      ) || 0;


    /* ================= CATEGORY ================= */

    html += `
      <tr class="sales-category-row">

        <td colspan="5">
          ${category}
        </td>

        <td class="sales-center">
          ${displayQty}
        </td>

        <td class="sales-money">
          ${fmtMoney(group.total)}
        </td>

      </tr>
    `;


    /* ================= NORMAL ITEMS ================= */

    normalItems.forEach(function(item) {

      html += `
        <tr class="sales-item-row">

          <td class="sales-item-name">
            ${item.name}
          </td>

          <td class="sales-code">
            ${item.code}
          </td>

          <td class="sales-center sales-size">
            ${item.size || ""}
          </td>

          <td class="sales-money">
            ${fmtMoney(item.price)}
          </td>

          <td class="sales-money sales-discount">
            ${fmtDiscount(item.discount)}
          </td>

          <td class="sales-center">
            ${item.qty}
          </td>

          <td class="sales-money sales-item-total">
            ${fmtMoney(item.total)}
          </td>

        </tr>
      `;


      /* ============== EXCHANGE CHILD ============== */

      exchangeItems
        .filter(function(exchange) {

          return String(exchange.code) ===
                 String(item.code);

        })
        .forEach(function(exchange) {

          html += `
            <tr class="sales-exchange-row">

              <td class="sales-exchange-name">
                ${exchange.name}
              </td>

              <td class="sales-code">
                ${exchange.code}
              </td>

              <td class="sales-center">
                ${exchange.size || ""}
              </td>

              <td class="sales-money">
                ${fmtMoney(exchange.total)}
              </td>

              <td></td>

              <td class="sales-center">
                1
              </td>

              <td class="sales-money sales-exchange-total">
                ${fmtMoney(exchange.total)}
              </td>

            </tr>
          `;

        });

    });


    /* Exchange replacement without another normal sale */

    exchangeItems
      .filter(function(exchange) {

        return !normalItems.some(function(item) {

          return String(item.code) ===
                 String(exchange.code);

        });

      })
      .forEach(function(exchange) {

        html += `
          <tr class="sales-exchange-row">

            <td class="sales-exchange-name">
              ${exchange.name}
            </td>

            <td class="sales-code">
              ${exchange.code}
            </td>

            <td class="sales-center">
              ${exchange.size || ""}
            </td>

            <td class="sales-money">
              ${fmtMoney(exchange.total)}
            </td>

            <td></td>

            <td class="sales-center">
              1
            </td>

            <td class="sales-money sales-exchange-total">
              ${fmtMoney(exchange.total)}
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

function collectSalesMetrics(
  salesData,
  reportDate,
  cashierName,
  shiftStart,
  shiftEnd
) {

  const tz =
    Session.getScriptTimeZone();


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
    lastLogTimestamp: null

  };


  const receiptIds =
    new Set();


  for (
    let i = 1;
    i < salesData.length;
    i++
  ) {

    const row =
      salesData[i];


    const rowDate =
      new Date(
        row[0]
      );


    if (
      isNaN(
        rowDate.getTime()
      )
    ) {

      continue;

    }


    const rowDateStr =
      Utilities.formatDate(
        rowDate,
        tz,
        "yyyy-MM-dd"
      );


    if (
      shiftStart &&
      rowDate <
        new Date(
          shiftStart
        )
    ) {

      continue;

    }


    if (
      shiftEnd &&
      rowDate >
        new Date(
          shiftEnd
        )
    ) {

      continue;

    }


    const receiptId =
      String(
        row[1] || ""
      ).trim();


    const rowCashier =
      String(
        row[2] || "Unknown"
      ).trim();


    const rowStatus =
      String(
        row[15] || ""
      )
        .trim()
        .toUpperCase();


    if (
      rowDateStr !==
      reportDate
    ) {

      continue;

    }


    if (
      cashierName &&
      rowCashier !==
        cashierName
    ) {

      continue;

    }


    if (
      rowStatus !==
      "COMPLETED"
    ) {

      continue;

    }


    if (
      !metrics.firstLogTimestamp ||
      rowDate <
        metrics.firstLogTimestamp
    ) {

      metrics.firstLogTimestamp =
        rowDate;

    }


    if (
      !metrics.lastLogTimestamp ||
      rowDate >
        metrics.lastLogTimestamp
    ) {

      metrics.lastLogTimestamp =
        rowDate;

    }


    if (receiptId) {

      receiptIds.add(
        receiptId
      );

    }


    const code =
      row[SALES_IDX.CODE];


    const name =
      toProperCase(
        row[4] || ""
      );


    const size =
      String(
        row[5] || ""
      ).toUpperCase();


    const category =
      row[6] ||
      "YourFinds";


    const qty =
      parseInt(
        row[7]
      ) || 0;


    const price =
      parseFloat(
        row[8]
      ) || 0;


    const discount =
      parseFloat(
        row[9]
      ) || 0;


    const netPayout =
      parseFloat(
        row[12]
      ) || 0;


    const paymentMethod =
      row[13] ||
      "Cash";


    const reference =
      row[14] ||
      "N/A";


    const cashReceived =
      parseFloat(
        row[16]
      ) || 0;


    const changeGiven =
      parseFloat(
        row[17]
      ) || 0;


    /*
      Column T = Reason

      Exchange rows must remain separate
      from the normal product summary.
    */

    const reason =
      String(
        row[19] || ""
      )
        .trim()
        .toUpperCase();


    const isExchange =
      reason ===
        "EXCHANGE RETURN" ||
      reason ===
        "EXCHANGE REPLACEMENT";


    /* ================= TOTALS ================= */

    metrics.totalSales +=
      netPayout;


    metrics.totalDiscount +=
      discount;


    metrics.itemsCount +=
      qty;


    metrics.totalCashReceived +=
      cashReceived;


    metrics.totalChangeGiven +=
      changeGiven;


    /* ================= ITEMS ================= */

    let itemKey;


    if (isExchange) {

      /*
        Every exchange line gets its own row.

        Receipt ID + reason prevents it from
        merging with normal sales or another
        exchange.
      */

      itemKey =
        category + "|" +
        code + "|" +
        size + "|" +
        price + "|" +
        receiptId + "|" +
        reason;

    } else {

      /*
        Normal sales continue to aggregate.
      */

      itemKey =
        category + "|" +
        code + "|" +
        size + "|" +
        price;

    }


    if (
      !metrics.items[
        itemKey
      ]
    ) {

      metrics.items[
        itemKey
      ] = {

        category:
          category,

        name:
          name,

        code:
          code,

        size:
          size,

        price:
          price,

        qty:
          0,

        discount:
          0,

        total:
          0,

        isExchange:
          isExchange

      };

    }


    metrics.items[
      itemKey
    ].qty +=
      qty;


    metrics.items[
      itemKey
    ].discount +=
      discount;


    metrics.items[
      itemKey
    ].total +=
      netPayout;


    /* ================= PAYMENTS ================= */

    if (
      !metrics.payments[
        paymentMethod
      ]
    ) {

      metrics.payments[
        paymentMethod
      ] = {

        gross: 0,
        count: 0

      };

    }


    metrics.payments[
      paymentMethod
    ].gross +=
      netPayout;


    metrics.payments[
      paymentMethod
    ].count++;


    if (
      !metrics.paymentDetail[
        paymentMethod
      ]
    ) {

      metrics.paymentDetail[
        paymentMethod
      ] = {};

    }


    if (
      !metrics.paymentDetail[
        paymentMethod
      ][reference]
    ) {

      metrics.paymentDetail[
        paymentMethod
      ][reference] =
        0;

    }


    metrics.paymentDetail[
      paymentMethod
    ][reference] +=
      netPayout;


    /* ================= CASHIER ================= */

    if (
      !metrics.byCashier[
        rowCashier
      ]
    ) {

      metrics.byCashier[
        rowCashier
      ] = {

        sales: 0,
        transactions: 0,
        items: 0,
        receiptIds: {}

      };

    }


    const cashierMetrics =
      metrics.byCashier[
        rowCashier
      ];


    cashierMetrics.sales +=
      netPayout;


    cashierMetrics.items +=
      qty;


    if (receiptId) {

      cashierMetrics
        .receiptIds[
          receiptId
        ] =
        true;

    }

  }


  /* ================= TRANSACTION COUNTS ================= */

  metrics.transactionCount =
    receiptIds.size;


  Object.keys(
    metrics.byCashier
  ).forEach(
    function(name) {

      const cashier =
        metrics.byCashier[
          name
        ];


      cashier.transactions =
        Object.keys(
          cashier.receiptIds
        ).length;


      delete cashier.receiptIds;

    }
  );


  /* ================= CATEGORY GROUPS ================= */

  Object.values(
    metrics.items
  ).forEach(
    function(item) {

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


      group.qty +=
        item.qty;


      group.discount +=
        item.discount;


      group.total +=
        item.total;

    }
  );


  metrics.totalSales =
    roundToTwo(
      metrics.totalSales
    );


  metrics.totalDiscount =
    roundToTwo(
      metrics.totalDiscount
    );


  metrics.totalCashReceived =
    roundToTwo(
      metrics.totalCashReceived
    );


  metrics.totalChangeGiven =
    roundToTwo(
      metrics.totalChangeGiven
    );


  Object.keys(
    metrics.payments
  ).forEach(
    function(method) {

      metrics.payments[
        method
      ].gross =
        roundToTwo(
          metrics.payments[
            method
          ].gross
        );

    }
  );


  return metrics;

}

/* ==========================================================
   PDF CREATOR

   Converts report HTML to PDF, saves it to Drive,
   enables link viewing, and returns the download URL.
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

/* ==========================================================
   SHARED SALES REPORT THEME

   PDF reports are rendered from standalone HTML, so their styles must
   live inside the generated document rather than Frontend/Styles/CSS.html.
========================================================== */

function buildSalesReportTheme_() {
  return `
    <style>
      @page {
        size: A4;
        margin: 8mm 7mm 10mm;
      }

      body {
        zoom: 1 !important;
        color: #2f3038;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 9px;
        line-height: 1.35;
      }

      .header {
        align-items: flex-start;
        border-bottom: 2px solid #d97a8d;
        margin-bottom: 8px;
        padding-bottom: 8px;
      }

      .brand-kicker {
        color: #a64f62;
        font-size: 8px;
        font-weight: 800;
        letter-spacing: 1.4px;
        margin-bottom: 2px;
        text-transform: uppercase;
      }

      .title {
        color: #2f3038;
        font-size: 17px;
        letter-spacing: -0.25px;
        line-height: 1.15;
      }

      .meta,
      .meta-right {
        color: #6f717c;
        font-size: 8.5px;
        line-height: 1.55;
      }

      .report-type-badge,
      .variance-badge {
        border-radius: 999px;
        display: inline-block;
        font-size: 7.5px;
        font-weight: 800;
        letter-spacing: .7px;
        padding: 3px 7px;
        text-transform: uppercase;
      }

      .report-type-badge {
        background: #f8e9ec;
        color: #a64f62;
        margin-bottom: 4px;
      }

      .kpi-table {
        border-collapse: separate;
        border-spacing: 5px 0;
        margin: 0 -5px 10px;
        table-layout: fixed;
        width: calc(100% + 10px);
      }

      .kpi-table td {
        background: #fff;
        border: 1px solid #eadde0;
        border-radius: 7px;
        padding: 7px 9px;
        vertical-align: top;
      }

      .kpi-label {
        color: #7b7074;
        display: block;
        font-size: 7.5px;
        font-weight: 700;
        letter-spacing: .55px;
        margin-bottom: 2px;
        text-transform: uppercase;
      }

      .kpi-value {
        color: #33333d;
        display: block;
        font-size: 13px;
        font-weight: 800;
        line-height: 1.2;
      }

      .kpi-primary {
        background: #fbf1f3 !important;
        border-color: #e2b8c0 !important;
      }

      .kpi-primary .kpi-value {
        color: #9c4055;
      }

      h2 {
        border: 0;
        color: #3a3b44;
        font-size: 10.5px;
        letter-spacing: .4px;
        margin: 10px 0 5px;
        padding: 0;
        text-transform: uppercase;
      }

      table {
        page-break-inside: auto;
      }

      thead {
        display: table-header-group;
      }

      tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }

      .sales-summary-table {
        border-collapse: separate;
        border-spacing: 0;
        margin-top: 0;
        width: 100%;
      }

      .sales-summary-table th {
        background: #f6f1f2;
        border: 0;
        border-bottom: 1px solid #dcc8cc;
        border-top: 1px solid #dcc8cc;
        color: #66575b;
        font-size: 7.5px;
        font-weight: 800;
        letter-spacing: .25px;
        padding: 5px 6px;
        text-transform: uppercase;
      }

      .sales-summary-table td {
        border: 0;
        border-bottom: 1px solid #eee7e8;
        padding: 5px 6px;
        vertical-align: middle;
      }

      .sales-category-row td {
        background: #f8e9ec;
        border-bottom: 1px solid #e2c9ce;
        color: #74434b;
        font-weight: 800;
        padding-bottom: 5px;
        padding-top: 5px;
      }

      .sales-item-name {
        color: #34343b;
        font-weight: 600;
        padding-left: 16px !important;
      }

      .sales-code {
        color: #7d7f88;
        font-family: Consolas, monospace;
        font-size: 8px;
      }

      .sales-money {
        text-align: right;
        white-space: nowrap;
      }

      .sales-center {
        text-align: center;
      }

      .sales-discount,
      .sales-size {
        color: #7d7f88;
      }

      .sales-item-total {
        color: #3a3b44;
        font-weight: 700;
      }

      .sales-exchange-row td {
        background: #fcfafb;
        border-bottom: 1px dashed #e6dadd;
        color: #806f74;
        font-size: 8px;
        padding-bottom: 4px;
        padding-top: 4px;
      }

      .sales-exchange-name {
        font-style: italic;
        padding-left: 30px !important;
      }

      .sales-net-row td {
        background: #fff !important;
      }

      .report-grid {
        gap: 8px;
        margin-top: 9px;
      }

      .report-card {
        border: 1px solid #e2d6d8;
        border-radius: 7px;
      }

      .report-card-header {
        background: #f7f1f2;
        border-bottom: 1px solid #e2d6d8;
        color: #5f4d52;
        font-size: 8px;
        letter-spacing: .55px;
        padding: 6px 8px;
        text-transform: uppercase;
      }

      .report-card-body {
        padding: 7px;
      }

      .report-summary-table th,
      .report-denom-table th,
      .petty-denom-table th {
        background: #f8f5f5;
        color: #66575b;
        font-size: 7.5px;
        text-transform: uppercase;
      }

      .report-summary-table th,
      .report-summary-table td,
      .report-denom-table th,
      .report-denom-table td,
      .petty-denom-table th,
      .petty-denom-table td {
        border-color: #e4dcde;
        padding: 4px 5px;
      }

      .report-summary-table td:last-child,
      .report-denom-table td:last-child,
      .petty-denom-table td:last-child {
        text-align: right;
        white-space: nowrap;
      }

      .reconciliation-table {
        border-collapse: separate;
        border-spacing: 0;
        margin-bottom: 7px;
        table-layout: fixed;
      }

      .reconciliation-table td {
        border: 1px solid #e4dcde;
        padding: 6px;
        text-align: center;
      }

      .reconciliation-table td + td {
        border-left: 0;
      }

      .recon-label {
        color: #7b7074;
        display: block;
        font-size: 7px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .recon-value {
        color: #33333d;
        display: block;
        font-size: 10px;
        font-weight: 800;
        margin-top: 2px;
      }

      .variance-badge.is-balanced {
        background: #e8f4ec;
        color: #34734a;
      }

      .variance-badge.is-short {
        background: #fbe7e7;
        color: #a13d3d;
      }

      .variance-badge.is-over {
        background: #fff1dc;
        color: #95601b;
      }

      .report-remark {
        background: #fff8e8;
        border-left: 3px solid #d69b43;
        color: #80571c;
        font-size: 8px;
        font-weight: 600;
        margin: 6px 0 0;
        padding: 5px 7px;
      }

      .signature {
        margin-top: 22px;
      }

      .sig-line {
        color: #5f6069;
        font-size: 8.5px;
        width: 42%;
      }

      .report-footer {
        border-top: 1px solid #eee7e8;
        color: #9798a0;
        font-size: 7px;
        margin-top: 12px;
        padding-top: 5px;
        text-align: center;
      }
    </style>
  `;
}

function getReportVarianceStatus_(variance) {
  const amount = Number(variance) || 0;

  if (Math.abs(amount) <= 0.001) {
    return { label: "Balanced", className: "is-balanced" };
  }

  return amount < 0
    ? { label: "Short", className: "is-short" }
    : { label: "Over", className: "is-over" };
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

    cashOnHand,
    cashBreakdown,
    cashRemarkHtml,
  } = data;

  const pettyStatus = getReportVarianceStatus_(pettyVariance);

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

      ${buildSalesReportTheme_()}

    </head>


    <body>

      <!-- ================= HEADER ================= -->

      <div class="header">

        <div>

          <div class="brand-kicker">
            YourStyle POS
          </div>

          <div class="title">
            Cashier Daily Sales Report
          </div>

          <div class="meta">
            Prepared by ${cashierName}
            &nbsp;&nbsp;•&nbsp;&nbsp;
            Manager ${managerName}
          </div>

        </div>


        <div class="meta meta-right">

          <span class="report-type-badge">Cashier Report</span><br>

          <b>${todayDisplay}</b><br>

          ${shiftStartDisplay} – ${shiftEndDisplay}

        </div>

      </div>


      <!-- ================= KEY METRICS ================= -->

      <table class="kpi-table">
        <tr>
          <td class="kpi-primary">
            <span class="kpi-label">Net Sales</span>
            <span class="kpi-value">${fmtMoney(metrics.totalSales)}</span>
          </td>
          <td>
            <span class="kpi-label">Transactions</span>
            <span class="kpi-value">${metrics.transactionCount}</span>
          </td>
          <td>
            <span class="kpi-label">Items Sold</span>
            <span class="kpi-value">${metrics.itemsCount}</span>
          </td>
          <td>
            <span class="kpi-label">Discounts</span>
            <span class="kpi-value">${fmtMoney(metrics.totalDiscount)}</span>
          </td>
        </tr>
      </table>


      <!-- ================= SALES SUMMARY ================= -->

      <h2>Sales Summary</h2>

      <table class="sales-summary-table">

        <thead>
          <tr>
            <th>Item Name</th>
            <th>Barcode</th>
            <th>Size</th>
            <th>Price</th>
            <th>Discount</th>
            <th>Qty</th>
            <th>Net Total</th>
          </tr>
        </thead>

        <tbody>

        ${salesRowsHtml}

        <tr class="sales-net-row">

          <td
            colspan="5"
            style="
              text-align:right;
              border-top:2px solid #d7b1b8;
              border-bottom:0;
              padding:7px 8px;
              font-weight:700;
              color:#70464d;
            "
          >
            NET SALES
          </td>

          <td
            style="
              text-align:center;
              border-top:2px solid #d7b1b8;
              border-bottom:0;
              font-weight:700;
            "
          >
            ${metrics.itemsCount}
          </td>

          <td
            style="
              text-align:right;
              border-top:2px solid #d7b1b8;
              border-bottom:0;
              font-weight:800;
              color:#8f1d3a;
              font-size:11px;
            "
          >
            ${fmtMoney(metrics.totalSales)}
          </td>

        </tr>

        </tbody>

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

                <br><br>
                <span class="variance-badge ${pettyStatus.className}">
                  ${pettyStatus.label}
                </span>

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
                Cash remitted:
                <b>${fmtMoney(cashOnHand)}</b><br>
                <span style="color:#878892; font-size:8px;">
                  Blind count — reconciliation is manager-only.
                </span>
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

      <div class="report-footer">
        YourStyle POS • System-generated cashier report • Internal use only
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
  } = data;

  const varianceStatus = getReportVarianceStatus_(cashVariance);


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

      ${buildSalesReportTheme_()}

    </head>


    <body>


      <!-- ================= HEADER ================= -->

      <div class="header">

        <div>

          <div class="brand-kicker">
            YourStyle POS
          </div>

          <div class="title">
            Manager Daily Sales Report
          </div>

          <div class="meta">
            Generated by ${managerName}
          </div>

        </div>

        <div class="meta meta-right">
          <span class="report-type-badge">Manager Report</span><br>
          <b>${todayDisplay}</b><br>
          All cashier activity
        </div>

      </div>


      <!-- ================= KEY METRICS ================= -->

      <table class="kpi-table">
        <tr>
          <td class="kpi-primary">
            <span class="kpi-label">Net Sales</span>
            <span class="kpi-value">${fmtMoney(metrics.totalSales)}</span>
          </td>
          <td>
            <span class="kpi-label">Transactions</span>
            <span class="kpi-value">${metrics.transactionCount}</span>
          </td>
          <td>
            <span class="kpi-label">Items Sold</span>
            <span class="kpi-value">${metrics.itemsCount}</span>
          </td>
          <td>
            <span class="kpi-label">Discounts</span>
            <span class="kpi-value">${fmtMoney(metrics.totalDiscount)}</span>
          </td>
        </tr>
      </table>


      <!-- ================= SALES BY CASHIER ================= -->

      <h2>Sales by Cashier</h2>

      <table class="report-summary-table">

        <thead>
          <tr>
            <th>Cashier</th>
            <th>Sales</th>
            <th>Transactions</th>
            <th>Items</th>
          </tr>
        </thead>

        <tbody>

        ${cashierRows}

        </tbody>

      </table>


      <!-- ================= SALES SUMMARY ================= -->

      <h2>Sales Summary</h2>

      <table class="sales-summary-table">

        <thead>
          <tr>
            <th>Item Name</th>
            <th>Barcode</th>
            <th>Size</th>
            <th>Price</th>
            <th>Discount</th>
            <th>Qty</th>
            <th>Net Total</th>
          </tr>
        </thead>

        <tbody>

        ${salesRowsHtml}


        <tr class="sales-net-row">

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

        </tbody>

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

              <table class="reconciliation-table">
                <tr>
                  <td>
                    <span class="recon-label">Expected</span>
                    <span class="recon-value">${fmtMoney(expectedCashDrawer)}</span>
                  </td>
                  <td>
                    <span class="recon-label">Remitted</span>
                    <span class="recon-value">${fmtMoney(cashOnHand)}</span>
                  </td>
                  <td>
                    <span class="recon-label">Variance</span>
                    <span class="recon-value">${fmtMoney(cashVariance)}</span>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 7px; text-align:right;">
                <span class="variance-badge ${varianceStatus.className}">
                  ${varianceStatus.label}
                </span>
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
          Reviewed by:
        </div>

      </div>

      <div class="report-footer">
        YourStyle POS • System-generated manager report • Internal use only
      </div>


    </body>

    </html>
  `;
}
