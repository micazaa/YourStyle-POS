function generateCashierShiftReportPDF(
  managerName,
  cashierName,
  reportDate,
  pettyCashObj,
  cashOnHandObj,
  cashDrawerRemark
) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const salesLogSheet = ss.getSheetByName("Sales Log");
    if (!salesLogSheet)
      return { success: false, message: "Sales log sheet not found." };

    const salesData = salesLogSheet.getDataRange().getValues();
    const tz = Session.getScriptTimeZone();
    const todayStr = reportDate;

    const todayDisplay = Utilities.formatDate(
      new Date(reportDate),
      tz,
      "MM/dd/yyyy"
    );

    const metrics = collectSalesMetrics(salesData, reportDate, cashierName);

    const categoryGroups = metrics.categoryGroups;

    const firstLogTimestamp = metrics.firstLogTimestamp;

    const lastLogTimestamp = metrics.lastLogTimestamp;

    const pettyReceived = (pettyCashObj && pettyCashObj.received) || 0;
    const pettyReturnBreakdown =
      (pettyCashObj && pettyCashObj.returnBreakdown) || {};
    const pettyReturnedTotal = sumBreakdown(pettyReturnBreakdown);
    const pettyVoucherNo = (pettyCashObj && pettyCashObj.voucherNo) || "";
    const pettyReason = (pettyCashObj && pettyCashObj.reason) || "";
    const pettyVariance = roundToTwo(pettyReturnedTotal - pettyReceived);

    const cashBreakdown = (cashOnHandObj && cashOnHandObj.breakdown) || {};
    const cashOnHand = sumBreakdown(cashBreakdown);

    const shiftStartDisplay = firstLogTimestamp
      ? Utilities.formatDate(firstLogTimestamp, tz, "h:mm a")
      : "—";
    const shiftEndDisplay = lastLogTimestamp
      ? Utilities.formatDate(lastLogTimestamp, tz, "h:mm a")
      : "—";

    const salesRowsHtml = buildSalesSummary(categoryGroups);

    const payment = buildPaymentSummary(metrics);

    const paymentDetailHtml = payment.html;

    const totalAllPayments = payment.totalPayments;

    const cashSalesAmt = payment.cashSales;

    const expectedCashDrawer = roundToTwo(cashSalesAmt);

    const cashVariance = roundToTwo(cashOnHand - expectedCashDrawer);

    const pettyRemarkText = pettyReason
      ? pettyReason +
        (pettyVoucherNo ? " (Voucher: " + pettyVoucherNo + ")" : "")
      : "";
    const pettyRemarkHtml = pettyRemarkText
      ? `<p class="report-remark">REMARKS: ${pettyRemarkText}</p>`
      : "";
    const cashRemarkHtml = cashDrawerRemark
      ? `<p class="report-remark">REMARKS: ${cashDrawerRemark}</p>`
      : "";

    let rowCount = Object.keys(metrics.items).length;
    let zoom = 1.0;
    if (rowCount > 15) zoom = 0.9;
    if (rowCount > 25) zoom = 0.85;
    if (rowCount > 35) zoom = 0.8;
    if (rowCount > 45) zoom = 0.75;
    if (rowCount > 60) zoom = 0.7;

    const htmlContent = buildCashierReportHTML({
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
    });

    return createPdfFromHtml(
      htmlContent,
      `Cashier_Report_${cashierName}_${todayStr}`
    );
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function generateManagerDailyReportPDF(
  managerName,
  reportDate,
  cashOnHandObj,
  cashDrawerRemark
) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const salesLogSheet = ss.getSheetByName("Sales Log");

    if (!salesLogSheet) {
      return {
        success: false,
        message: "Sales Log sheet not found.",
      };
    }

    /* ================= DATE ================= */

    const salesData = salesLogSheet.getDataRange().getValues();

    const tz = Session.getScriptTimeZone();

    const todayStr = reportDate;

    const todayDisplay = Utilities.formatDate(
      new Date(reportDate),
      tz,
      "MM/dd/yyyy"
    );

    /* ================= SALES METRICS ================= */

    const metrics = collectSalesMetrics(salesData, reportDate, null);

    const categoryGroups = metrics.categoryGroups;

    /* ================= CASH COUNT ================= */

    const cashBreakdown = (cashOnHandObj && cashOnHandObj.breakdown) || {};

    const cashOnHand = sumBreakdown(cashBreakdown);

    /* ================= PAYMENTS ================= */

    const payment = buildPaymentSummary(metrics);

    const paymentDetailHtml = payment.html;

    const totalAllPayments = payment.totalPayments;

    const cashSalesAmt = payment.cashSales;

    /* ================= CASH RECONCILIATION ================= */

    const expectedCashDrawer = roundToTwo(cashSalesAmt);

    const cashVariance = roundToTwo(cashOnHand - expectedCashDrawer);

    /* ================= REPORT TABLES ================= */

    const cashierRows = buildCashierSummary(metrics.byCashier);

    const salesRowsHtml = buildSalesSummary(categoryGroups);

    /* ================= REMARK ================= */

    const cashRemarkHtml = cashDrawerRemark
      ? `<p class="report-remark">
             REMARKS: ${cashDrawerRemark}
           </p>`
      : "";

    /* ================= DYNAMIC SCALE ================= */

    const rowCount = Object.keys(metrics.items).length;

    let zoom = 1.0;

    if (rowCount > 15) zoom = 0.9;
    if (rowCount > 25) zoom = 0.85;
    if (rowCount > 35) zoom = 0.8;
    if (rowCount > 45) zoom = 0.75;
    if (rowCount > 60) zoom = 0.7;

    /* ================= BUILD REPORT ================= */

    const html = buildManagerReportHTML({
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

      zoom,
    });

    /* ================= CREATE PDF ================= */

    return createPdfFromHtml(html, `Manager_Report_${todayStr}`);
  } catch (err) {
    return {
      success: false,
      message: err.toString(),
    };
  }
}
