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
function collectSalesMetrics(
  salesData,
  reportDate,
  cashierName,
  shiftStart,
  shiftEnd,
  options
) {
  const tz = Session.getScriptTimeZone();
  options = options || {};

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

  const receiptIds = new Set();
  const replacementAnchors = new Map();

  function reasonOf(row) {
    return String(row[19] || '').trim().toUpperCase();
  }

  function completed(row) {
    return String(row[15] || '').trim().toUpperCase() === 'COMPLETED';
  }

  /*
   * Find the replacement date and cashier for each exchange.
   * Both sides of that exchange belong to this reporting date.
   */
  for (let i = 1; i < salesData.length; i++) {
    const row = salesData[i];

    if (!completed(row)) continue;
    if (reasonOf(row) !== 'EXCHANGE REPLACEMENT') continue;

    const receiptId = String(row[1] || '').trim();
    const timestamp = new Date(row[0]);

    if (!receiptId || isNaN(timestamp.getTime())) continue;

    const existing = replacementAnchors.get(receiptId);

    if (!existing || timestamp < existing.timestamp) {
      replacementAnchors.set(receiptId, {
        timestamp: timestamp,
        cashier: String(row[2] || 'Unknown').trim()
      });
    }
  }

  for (let i = 1; i < salesData.length; i++) {
    const row = salesData[i];

    if (!completed(row)) continue;

    const actualTimestamp = new Date(row[0]);
    if (isNaN(actualTimestamp.getTime())) continue;

    const receiptId = String(row[1] || '').trim();
    const reason = reasonOf(row);

    const exchange =
      reason === 'EXCHANGE RETURN' ||
      reason === 'EXCHANGE REPLACEMENT';

    const anchor = exchange
      ? replacementAnchors.get(receiptId)
      : null;

    const reportingTimestamp = anchor
      ? anchor.timestamp
      : actualTimestamp;

    const reportingCashier = anchor
      ? anchor.cashier
      : String(row[2] || 'Unknown').trim();

    const reportingDate = Utilities.formatDate(
      reportingTimestamp,
      tz,
      'yyyy-MM-dd'
    );

    if (options.endDate ? (reportingDate < reportDate || reportingDate > options.endDate) : reportingDate !== reportDate) continue;
    if (cashierName && reportingCashier !== cashierName) continue;

    if (
      shiftStart &&
      reportingTimestamp < new Date(shiftStart)
    ) continue;

    if (
      shiftEnd &&
      reportingTimestamp > new Date(shiftEnd)
    ) continue;

    if (
      !metrics.firstLogTimestamp ||
      reportingTimestamp < metrics.firstLogTimestamp
    ) {
      metrics.firstLogTimestamp = reportingTimestamp;
    }

    if (
      !metrics.lastLogTimestamp ||
      reportingTimestamp > metrics.lastLogTimestamp
    ) {
      metrics.lastLogTimestamp = reportingTimestamp;
    }

    if (receiptId) receiptIds.add(receiptId);

    const code = row[SALES_IDX.CODE];
    const name = toProperCase(row[4] || '');
    const size = String(row[5] || '').toUpperCase();
    const category = String(row[6] || 'YourFinds');

    const qty = parseInt(row[7], 10) || 0;
    const price = Number(row[8]) || 0;
    const discount = Number(row[9]) || 0;
    const netTotal = Number(row[12]) || 0;

    const paymentMethod = String(row[13] || 'Cash');
    const reference = String(row[14] || 'N/A');

    const actualDate = Utilities.formatDate(
      actualTimestamp,
      tz,
      'yyyy-MM-dd'
    );

    const itemKey = exchange
      ? JSON.stringify([
          'EX', receiptId, reason, code, size, price, actualDate
        ])
      : JSON.stringify([
          'SALE', category, code, size, price
        ]);

    if (!metrics.items[itemKey]) {
      metrics.items[itemKey] = {
        category: category,
        name: name,
        code: code,
        size: size,
        price: price,
        qty: 0,
        discount: 0,
        total: 0,
        isExchange: exchange,
        receiptId: receiptId,
        reason: reason,
        exchangeReason: exchange ? reason : '',
        reportDateDisplay: Utilities.formatDate(
          actualTimestamp,
          tz,
          'MM/dd/yyyy'
        )
      };
    }

    const item = metrics.items[itemKey];
    item.qty += qty;
    item.discount += discount;
    item.total += netTotal;

    metrics.totalSales += netTotal;
    metrics.totalDiscount += discount;
    metrics.totalCashReceived += Number(row[16]) || 0;
    metrics.totalChangeGiven += Number(row[17]) || 0;

    const countedQty =
      reason !== 'EXCHANGE RETURN' && qty > 0 ? qty : 0;

    metrics.itemsCount += countedQty;
    if (options.onIncludedRow) options.onIncludedRow({
      timestamp: reportingTimestamp, date: reportingDate, category: category,
      name: name, size: size, units: countedQty, sales: netTotal, exchange: exchange
    });

    if (!metrics.payments[paymentMethod]) {
      metrics.payments[paymentMethod] = { gross: 0, count: 0 };
    }

    metrics.payments[paymentMethod].gross += netTotal;
    metrics.payments[paymentMethod].count++;

    if (!metrics.paymentDetail[paymentMethod]) {
      metrics.paymentDetail[paymentMethod] = {};
    }

    metrics.paymentDetail[paymentMethod][reference] =
      (metrics.paymentDetail[paymentMethod][reference] || 0) + netTotal;

    if (!metrics.byCashier[reportingCashier]) {
      metrics.byCashier[reportingCashier] = {
        sales: 0,
        transactions: 0,
        items: 0,
        receiptIds: {}
      };
    }

    const cashier = metrics.byCashier[reportingCashier];
    cashier.sales += netTotal;
    cashier.items += countedQty;

    if (receiptId) cashier.receiptIds[receiptId] = true;
  }

  metrics.transactionCount = receiptIds.size;

  Object.keys(metrics.byCashier).forEach(function(name) {
    const cashier = metrics.byCashier[name];
    cashier.transactions = Object.keys(cashier.receiptIds).length;
    cashier.sales = roundToTwo(cashier.sales);
    delete cashier.receiptIds;
  });

  Object.values(metrics.items).forEach(function(item) {
    const category = item.category || 'YourFinds';

    if (!metrics.categoryGroups[category]) {
      metrics.categoryGroups[category] = {
        items: [],
        qty: 0,
        discount: 0,
        total: 0
      };
    }

    const group = metrics.categoryGroups[category];
    group.items.push(item);

    if (item.exchangeReason !== 'EXCHANGE RETURN' && item.qty > 0) {
      group.qty += item.qty;
    }

    group.discount += item.discount;
    group.total += item.total;
  });

  [
    'totalSales',
    'totalDiscount',
    'totalCashReceived',
    'totalChangeGiven'
  ].forEach(function(field) {
    metrics[field] = roundToTwo(metrics[field]);
  });

  Object.keys(metrics.payments).forEach(function(method) {
    metrics.payments[method].gross =
      roundToTwo(metrics.payments[method].gross);
  });

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
    .report-card { flex:1; border:1px solid #d7b8bf ; border-radius:8px; overflow:hidden; page-break-inside:avoid; }
    .report-card-header { background:#f3dde1; color:#b76e79; font-weight:bold; font-size:11px; padding:6px 8px; border-bottom:1px solid #e3c6c6; }
    .report-card-body { padding:8px; }
    .report-summary-table,.report-denom-table { width:100%; border-collapse:collapse; margin-bottom:8px; }
    .report-summary-table th,.report-summary-table td,.report-denom-table th,.report-denom-table td { border:1px solid #d7b8bf ; padding:4px 6px; font-size:10px; }
    .report-summary-table th,.report-denom-table th { background:#f2dede; color:#b76e79; }
    .report-remark { font-size:10px; color:#b45f06; font-weight:bold; margin-top:6px; }
    .report-col-right { flex:1; display:flex; flex-direction:column; gap:10px; }
    .report-col-right .report-card { flex:none; }
    .report-text-summary { font-size:10.5px; line-height:1.6; margin:0 0 8px; }
    .petty-denom-table { width:100%; border-collapse:collapse; margin:6px 0; }
    .petty-denom-table th,.petty-denom-table td { border:1px solid #d7b8bf ; padding:3px 6px; font-size:10px; text-align:right; }
    .ps-total-label { text-align:right !important; color:#8f1d3a; font-weight:bold; }
    .ps-total-value { color:#8f1d3a; font-weight:bold; }
    .ps-words { font-size:10px; font-style:italic; color:#8a6a6e; margin:4px 0; }
    ${getSalesSummaryReportStyles()}
  `;
}

function buildSalesSummaryFooter(metrics) {
  return `
    <tr>
     <td
      colspan="5"
      class="right"
      style="
        background-color:#f4e3e7 !important;
        color:#76243d !important;
        font-size:11px;
        font-weight:800;
        padding:7px 6px;
        border:2px solid #b97989 !important;
      "
    >NET SALES</td>

    <td
      class="center"
      style="
        background-color:#f4e3e7 !important;
        color:#76243d !important;
        font-size:11px;
        font-weight:800;
        padding:7px 6px;
        border:2px solid #b97989 !important;
      "
    >${quantity(regularItems)}</td>

    <td
      class="money"
      style="
        background-color:#f4e3e7 !important;
        color:#76243d !important;
        font-size:12px;
        font-weight:800;
        padding:7px 6px;
        border:2px solid #b97989 !important;
      "
    >${fmtMoney(regularTotal)}</td>
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

function buildCashierReportHTML(data) {
  return buildClassicDailyReportHTML_(data, false);
}

function buildManagerReportHTML(data) {
  return buildClassicDailyReportHTML_(data, true);
}

function buildClassicDailyReportHTML_(data, isManager) {
  const metrics = data.metrics || {};
  const items = Object.values(metrics.items || {});

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function reason(item) {
    return String(item.exchangeReason || item.reason || '')
      .trim().toUpperCase();
  }

  function isExchange(item) {
    return Boolean(item.isExchange) ||
      reason(item) === 'EXCHANGE RETURN' ||
      reason(item) === 'EXCHANGE REPLACEMENT';
  }

  function sum(list, field) {
    return list.reduce(function(total, item) {
      return total + (Number(item[field]) || 0);
    }, 0);
  }

  function quantity(list) {
    return list.reduce(function(total, item) {
      return total + Math.max(0, Number(item.qty) || 0);
    }, 0);
  }

  const regularItems = items.filter(function(item) {
    return !isExchange(item);
  });

  const exchangeItems = items.filter(isExchange);
  const regularTotal = sum(regularItems, 'total');
  const exchangeTotal = sum(exchangeItems, 'total');

  const reportStripeIndex = { sales: 0, exchange: 0 };

  function itemRow(item, exchange) {
    const section = exchange ? 'exchange' : 'sales';
    const index = reportStripeIndex[section]++;
    const background = index % 2 === 0 ? '#e8edf2' : '#ffffff';

    function cell(content, className) {
      return `
        <td
          class="${className || ''}"
          bgcolor="${background}"
          style="background-color:${background} !important;"
        >${content}</td>
      `;
    }

    const type = reason(item) === 'EXCHANGE RETURN'
      ? 'Return'
      : 'Replacement';

    return `
      <tr>
        ${cell(esc(item.name), exchange ? '' : 'item-name')}
        ${cell(esc(item.code))}
        ${exchange ? cell(type, 'exchange-type') : ''}
        ${exchange ? cell(esc(item.receiptId || '—'), 'receipt') : ''}
        ${exchange ? cell(
          esc(item.reportDateDisplay || data.todayDisplay),
          'exchange-date'
        ) : ''}
        ${cell(esc(item.size), 'center')}
        ${cell(fmtMoney(item.price), 'money')}
        ${cell(
          Number(item.discount) ? fmtMoney(item.discount) : '',
          'money'
        )}
        ${cell(
          Number(item.qty) || 0,
          'center ' + (Number(item.qty) < 0 ? 'negative' : '')
        )}
        ${cell(
          fmtMoney(item.total),
          'money ' + (Number(item.total) < 0 ? 'negative' : '')
        )}
      </tr>
    `;
  }

  function salesHeader(exchange) {
    if (exchange) {
      return `
        <colgroup>
          <col style="width:20%">
          <col style="width:9%">
          <col style="width:10%">
          <col style="width:17%">
          <col style="width:10%">
          <col style="width:5%">
          <col style="width:8%">
          <col style="width:7%">
          <col style="width:4%">
          <col style="width:10%">
        </colgroup>
        <thead>
          <tr>
            <th>Item Name</th>
            <th>Barcode</th>
            <th>Type</th>
            <th>Receipt</th>
            <th>Date</th>
            <th>Size</th>
            <th>Price</th>
            <th>Discount</th>
            <th>Qty</th>
            <th>Net Total</th>
          </tr>
        </thead>
      `;
    }

    return `
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
    `;
  }

  const groups = new Map();

  regularItems.forEach(function(item) {
    const category = String(item.category || 'YourFinds');

    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  });

  let salesRows = '';

  Array.from(groups.keys()).sort(function(a, b) {
    return a.localeCompare(b);
  }).forEach(function(category) {
    const group = groups.get(category).slice().sort(function(a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    salesRows += `
      <tr class="category">
        <td colspan="5">${esc(category)}</td>
        <td class="center">${quantity(group)}</td>
        <td class="money">${fmtMoney(sum(group, 'total'))}</td>
      </tr>
      ${group.map(function(item) {
        return itemRow(item, false);
      }).join('')}
    `;
  });

  if (!salesRows) {
    salesRows = `
      <tr>
        <td colspan="7" class="empty">No regular sales recorded.</td>
      </tr>
    `;
  }

  let exchangeSection = '';

  if (exchangeItems.length) {
    const exchangeGroups = new Map();

    exchangeItems.forEach(function(item, index) {
      const receipt = String(item.receiptId || '').trim();

      // Do not merge unrelated rows with missing receipt IDs.
      const key = receipt || '__missing_receipt_' + index;

      if (!exchangeGroups.has(key)) {
        exchangeGroups.set(key, {
          receipt: receipt,
          items: []
        });
      }

      exchangeGroups.get(key).items.push(item);
    });

    let exchangeRows = '';
    let stripeIndex = 0;

    const groups = Array.from(exchangeGroups.values()).sort(function(a, b) {
      return a.receipt.localeCompare(b.receipt);
    });

    groups.forEach(function(group) {
      const sorted = group.items.slice().sort(function(a, b) {
        const aReturn = reason(a) === 'EXCHANGE RETURN';
        const bReturn = reason(b) === 'EXCHANGE RETURN';

        if (aReturn !== bReturn) return aReturn ? -1 : 1;

        return String(a.name || '').localeCompare(String(b.name || ''));
      });

      sorted.forEach(function(item, index) {
        const background = stripeIndex++ % 2 === 0
          ? '#e8edf2'
          : '#ffffff';

        function exchangeCell(content, className) {
          return `
            <td
              class="${className || ''}"
              bgcolor="${background}"
              style="
                background-color:${background} !important;
                border:1px solid #d7b8bf !important;
                padding:4px 3px;
                vertical-align:middle;
              "
            >${content}</td>
          `;
        }

        const receiptCell = index === 0
          ? `
            <td
              rowspan="${sorted.length}"
              style="
                background-color:#f4e3e7 !important;
                border:1px solid #d7b8bf !important;
                padding:4px;
                vertical-align:middle;
                font-size:7px;
                font-weight:bold;
                overflow-wrap:anywhere;
              "
            >${esc(group.receipt || '—')}</td>
          `
          : '';

        exchangeRows += `
          <tr>
            ${receiptCell}
            ${exchangeCell(esc(item.name))}
            ${exchangeCell(esc(item.code))}
            ${exchangeCell(
              reason(item) === 'EXCHANGE RETURN'
                ? 'Return'
                : 'Replacement'
            )}
            ${exchangeCell(
              esc(item.reportDateDisplay || data.todayDisplay),
              'exchange-date'
            )}
            ${exchangeCell(esc(item.size), 'center')}
            ${exchangeCell(fmtMoney(item.price), 'money')}
            ${exchangeCell(
              Number(item.discount) ? fmtMoney(item.discount) : '',
              'money'
            )}
            ${exchangeCell(
              Number(item.qty) || 0,
              'center ' + (Number(item.qty) < 0 ? 'negative' : '')
            )}
            ${exchangeCell(
              fmtMoney(item.total),
              'money ' + (Number(item.total) < 0 ? 'negative' : '')
            )}
          </tr>
        `;
      });
    });

    exchangeSection = `
      <h2>Exchange</h2>

      <table
        class="exchange-table"
        style="
          table-layout:fixed;
          border-collapse:collapse;
          border:1px solid #d7b8bf !important;
          margin-bottom:0;
        "
      >
        <colgroup>
          <col style="width:17%">
          <col style="width:20%">
          <col style="width:9%">
          <col style="width:10%">
          <col style="width:10%">
          <col style="width:5%">
          <col style="width:8%">
          <col style="width:7%">
          <col style="width:4%">
          <col style="width:10%">
        </colgroup>

        <thead>
          <tr>
            <th>Receipt</th>
            <th>Item Name</th>
            <th>Barcode</th>
            <th>Type</th>
            <th>Date</th>
            <th>Size</th>
            <th>Price</th>
            <th>Discount</th>
            <th>Qty</th>
            <th>Net Total</th>
          </tr>
        </thead>

        <tbody>
          ${exchangeRows}

          <tr class="total">
            <td
              colspan="9"
              class="right"
              style="
                border:1px solid #d7b8bf !important;
                background-color:#f4e3e7 !important;
              "
            >Exchange Adjustment</td>

            <td
              class="money"
              style="
                border:1px solid #d7b8bf !important;
                background-color:#f4e3e7 !important;
              "
            >${fmtMoney(exchangeTotal)}</td>
          </tr>
        </tbody>
      </table>

    <div
      class="combined-total"
      style="
        border:0 !important;
        box-shadow:none !important;
        background:transparent !important;
        padding:12px 0 4px;
        margin:0 0 10px;
        text-align:right;
        color:#76243d;
        page-break-inside:avoid;
      "
    >
      <span style="font-size:12px;font-weight:800;">
        FINAL NET SALES
      </span>

      <strong
        style="
          display:inline-block;
          min-width:110px;
          margin-left:18px;
          font-size:17px;
          font-weight:800;
          color:#76243d;
        "
      >${fmtMoney(metrics.totalSales)}</strong>
    </div>
    `;
  }

  let cashierSection = '';

  if (isManager) {
    const byCashier = metrics.byCashier || {};
    const names = Object.keys(byCashier).sort();

    const rows = names.map(function(name) {
      const cashier = byCashier[name];

      return `
        <tr>
          <td>${esc(name)}</td>
          <td class="money">${fmtMoney(cashier.sales)}</td>
          <td class="center">${Number(cashier.transactions) || 0}</td>
          <td class="center">${Number(cashier.items) || 0}</td>
        </tr>
      `;
    }).join('');

    cashierSection = `
      <h2>Sales by Cashier</h2>
      <table>
        <thead>
          <tr>
            <th>Cashier</th>
            <th>Net Sales Including Exchanges</th>
            <th>Transactions</th>
            <th>Items</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `
            <tr>
              <td colspan="4" class="empty">
                No cashier activity recorded.
              </td>
            </tr>
          `}
          <tr class="total">
            <td>Total</td>
            <td class="money">${fmtMoney(metrics.totalSales)}</td>
            <td class="center">${Number(metrics.transactionCount) || 0}</td>
            <td class="center">${Number(metrics.itemsCount) || 0}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function denominationTable(breakdown, label, total) {
    return `
      <table class="denominations">
        <thead>
          <tr>
            <th>Denom</th>
            <th>Qty</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${denomRowsHtml(breakdown)}
          <tr class="total">
            <td colspan="2" class="right">${esc(label)}</td>
            <td class="money">${fmtMoney(total)}</td>
          </tr>
        </tbody>
      </table>
      <p class="words">
        Amount in Words: ${esc(numberToWordsPeso(Number(total) || 0))}
      </p>
    `;
  }

  function card(title, content) {
    return `
      <div class="card">
        <div class="card-title">${esc(title)}</div>
        <div class="card-body">${content}</div>
      </div>
    `;
  }

  const paymentCard = card('PAYMENT METHODS', `
    <table>
      <thead>
        <tr>
          <th>Payment Method</th>
          <th>Reference Number</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${data.paymentDetailHtml || ''}
        <tr class="total">
          <td colspan="2">Grand Total</td>
          <td class="money">${fmtMoney(data.totalAllPayments)}</td>
        </tr>
      </tbody>
    </table>
  `);

  const pettyCard = isManager ? '' : card('PETTY CASH', `
    <p class="summary">
      Received: <b>${fmtMoney(data.pettyReceived)}</b><br>
      Returned: <b>${fmtMoney(data.pettyReturnedTotal)}</b>
      ${Math.abs(Number(data.pettyVariance) || 0) > 0.001
        ? `<br>
          <span class="report-variance" style="color:#a96519;">
            Variance: <b>${fmtMoney(data.pettyVariance)}</b>
          </span>`
        : ''}
    </p>

    ${denominationTable(
      data.pettyReturnBreakdown,
      'Returned Total',
      data.pettyReturnedTotal
    )}

    ${data.pettyRemarkHtml || ''}
  `);

  const expectedSalesCash = Number(data.expectedCashDrawer) || 0;
  const remittedSalesCash = Number(data.cashOnHand) || 0;
  const salesCashVariance = roundToTwo(
    remittedSalesCash - expectedSalesCash
  );

  const cashCard = card('SALES CASH', `
    <p class="summary">
      Expected: <b>${fmtMoney(expectedSalesCash)}</b><br>
      Remitted: <b>${fmtMoney(remittedSalesCash)}</b>
      ${Math.abs(salesCashVariance) > 0.001
        ? `<br>
          <span class="report-variance" style="color:#a96519;">
            Variance: <b>${fmtMoney(salesCashVariance)}</b>
          </span>`
        : ''}
    </p>

    ${denominationTable(
      data.cashBreakdown,
      'Counted Total',
      remittedSalesCash
    )}

    ${data.cashRemarkHtml || ''}
  `);

  function logTime(value) {
    if (!value) return '—';

    const date = new Date(value);
    if (isNaN(date.getTime())) return '—';

    return Utilities.formatDate(
      date,
      Session.getScriptTimeZone(),
      'h:mm a'
    );
  }

  const firstLog = isManager
    ? logTime(metrics.firstLogTimestamp)
    : data.shiftStartDisplay || '—';

  const lastLog = isManager
    ? logTime(metrics.lastLogTimestamp)
    : data.shiftEndDisplay || '—';

  const title = isManager
    ? "MANAGER'S DAILY SALES REPORT"
    : "CASHIER'S DAILY SALES REPORT";

  const preparedBy = isManager ? data.managerName : data.cashierName;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: A4; margin: 10mm; }
        * { box-sizing: border-box; }

        body {
          margin: 0;
          color: #333;
          font: 9px/1.25 Arial, sans-serif;
        }

        .header {
          display: table;
          width: 100%;
          padding-bottom: 6px;
          margin-bottom: 8px;
          border-bottom: 2px solid #d49b9f;
        }

        .header-left, .header-right {
          display: table-cell;
          vertical-align: bottom;
        }

        .header-right { text-align: right; white-space: nowrap; }

        .title {
          margin-bottom: 4px;
          color: #70464d;
          font-size: 15px;
          font-weight: bold;
        }

        .meta { font-size: 8px; }

        h2 {
          margin: 8px 0 5px;
          padding-bottom: 3px;
          border-bottom: 1px solid #dca9ae;
          color: #70464d;
          font-size: 12px;
          page-break-after: avoid;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 6px;
        }

        thead { display: table-header-group; }
        tr { page-break-inside: avoid; break-inside: avoid; }

        th, td {
          border: 1px solid #d7b8bf;
          padding: 3px 5px;
          vertical-align: top;
          font-size: 8.5px;
          overflow-wrap: anywhere;
        }

        th {
          background: #fff;
          color: #70464d;
          text-align: left;
          font-weight: bold;
        }

        .category td {
          color: #70464d;
          font-weight: bold;
          background: #fcf8f9;
        }

        .item-name { padding-left: 18px; }
        .center { text-align: center; }
        .right, .money { text-align: right; }
        .money { white-space: nowrap; }
        .total td { color: #941c3b; font-weight: bold; }
        .negative { color: #b12b45; font-weight: bold; }
        .empty { padding: 10px; text-align: center; color: #777; }

        .exchange-table td {
          border-top-style: dashed;
          border-bottom-style: dashed;
          font-size: 8px;
        }

        .movement { display: block; color: #777; font-size: 7px; }
        .receipt { font-size: 7.5px; }
        .muted { color: #777; }

        .combined-total {
          padding: 6px 0;
          margin-bottom: 10px;
          border-top: 1px solid #d7b8bf;
          border-bottom: 2px solid #d7b8bf;
          text-align: right;
          color: #941c3b;
          font-size: 11px;
          page-break-inside: avoid;
        }

        .combined-total strong {
          display: inline-block;
          min-width: 90px;
          margin-left: 15px;
        }

        .lower-grid {
          display: table;
          width: 100%;
          margin-top: 12px;
          table-layout: fixed;
        }

        .lower-column {
          display: table-cell;
          width: 50%;
          vertical-align: top;
        }

        .lower-column:first-child { padding-right: 5px; }
        .lower-column:last-child { padding-left: 5px; }

        .card {
          border: 1px solid #d7b8bf ;
          border-radius: 6px;
          margin-bottom: 9px;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .card-title {
          padding: 5px 7px;
          border-bottom: 1px solid #d7b8bf;
          color: #70464d;
          font-size: 9px;
          font-weight: bold;
        }

        .card-body { padding: 7px; }

        .card th, .card td {
          border-color: #d7b8bf;
          font-size: 8px;
          padding: 3px 5px;
        }

        .card td:last-child { text-align: right; }
        .summary { margin: 0 0 7px; font-size: 8.5px; line-height: 1.5; }
        .denominations th, .denominations td { text-align: right; }
        .words { margin: 5px 0 0; font-size: 8px; font-style: italic; }

        .report-remark {
          margin: 6px 0 0;
          color: #a96519;
          font-size: 8px;
          overflow-wrap: anywhere;
        }

        .signatures {
          display: table;
          width: 100%;
          margin-top: 24px;
          page-break-inside: avoid;
        }

        .signature-cell { display: table-cell; width: 50%; }
        .signature-cell:last-child { text-align: right; }

        .signature-line {
          display: inline-block;
          width: 180px;
          padding-top: 5px;
          border-top: 1px solid #333;
          text-align: center;
          font-size: 8px;
        }
      </style>
    </head>

    <body>
      <div class="header">
        <div class="header-left">
          <div class="title">${title}</div>
          <div class="meta">
            Manager: ${esc(data.managerName)}
            ${isManager
              ? ''
              : `&nbsp;&nbsp; Cashier: ${esc(data.cashierName)}`}
          </div>
        </div>
        <div class="header-right meta">
          Date: ${esc(data.todayDisplay)}<br>
          First Log: ${esc(firstLog)}
          &nbsp;|&nbsp;
          Last Log: ${esc(lastLog)}
        </div>
      </div>

      ${cashierSection}

      <h2>Sales Summary</h2>
      <table>
        ${salesHeader(false)}
        <tbody>
          ${salesRows}
          <tr class="total">
            <td colspan="5" class="right">Net Sales</td>
            <td class="center">${quantity(regularItems)}</td>
            <td class="money">${fmtMoney(regularTotal)}</td>
          </tr>
        </tbody>
      </table>

      ${exchangeSection}

      <div class="lower-grid">
        <div class="lower-column">${paymentCard}</div>
        <div class="lower-column">${pettyCard}${cashCard}</div>
      </div>

      <div class="signatures">
        <div class="signature-cell">
          <div class="signature-line">
            Prepared by: ${esc(preparedBy)}
          </div>
        </div>
        <div class="signature-cell">
          <div class="signature-line">
            ${isManager
              ? 'Reviewed by:'
              : 'Checked by: ' + esc(data.managerName)}
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}
