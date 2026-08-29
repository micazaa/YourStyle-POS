/* ==========================================================
   PHASE 10 — CASH SHIFT / PETTY CASH CONTROL
========================================================== */

function phase10CashReportSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.CASH_REPORT_LOG);
  if (!sheet) sheet = ss.insertSheet(SHEETS.CASH_REPORT_LOG);
  const headers = ["Report ID","Timestamp","Report Type","Report Date","Employee","Manager","Shift Start","Shift End","Expected Cash","Cash 1000","Cash 500","Cash 200","Cash 100","Cash 50","Cash 20","Cash 10","Cash 5","Cash 1","Cash Counted","Cash Variance","Cash Remark","Petty Received","Petty 1000","Petty 500","Petty 200","Petty 100","Petty 50","Petty 20","Petty 10","Petty 5","Petty 1","Petty Returned","Petty Variance","Petty Voucher No.","Petty Remark","Status","Updated At"];
  if (sheet.getLastRow() === 0) sheet.getRange(1,1,1,headers.length).setValues([headers]);
  return sheet;
}

function phase10NextReportId_() {
  const sheet = phase10CashReportSheet_();
  const tz = Session.getScriptTimeZone();
  const day = Utilities.formatDate(new Date(), tz, "yyyyMMdd");
  const prefix = "CR-" + day + "-";
  let max = 0;
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, CASH_REPORT_COL.REPORT_ID, sheet.getLastRow()-1, 1).getDisplayValues().forEach(r => {
      const id=String(r[0]||""); if(id.indexOf(prefix)!==0)return; const n=Number(id.slice(prefix.length)); if(Number.isInteger(n)&&n>max)max=n;
    });
  }
  return prefix + String(max+1).padStart(3,"0");
}

function phase10FindOpenShift_(employee) {
  const sheet = phase10CashReportSheet_();
  if (sheet.getLastRow() < 2) return null;
  const values=sheet.getRange(2,1,sheet.getLastRow()-1,CASH_REPORT_COLUMN_COUNT).getValues();
  for(let i=values.length-1;i>=0;i--){
    if(String(values[i][CASH_REPORT_IDX.EMPLOYEE]||"").trim()===String(employee||"").trim() && String(values[i][CASH_REPORT_IDX.STATUS]||"").toUpperCase()==="OPEN") return {row:i+2, values:values[i]};
  }
  return null;
}

function getLatestPettyHandoverPhase10() {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      "Cash Report Log"
    );


  if (!sheet) {

    throw new Error(
      "Cash Report Log sheet not found."
    );

  }


  const lastRow =
    sheet.getLastRow();


  /*
    No previous reports yet.
  */

  if (lastRow < 2) {

    return {
      success: true,
      received: 0,
      previousReportId: ""
    };

  }


  /*
    Cash Report Log:

    A  Report ID
    ...
    AF Petty Returned
    ...
    AJ Status
  */

  const data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        37
      )
      .getValues();


  /*
    Search from newest → oldest.

    We want the latest CLOSED report
    that has a valid Petty Returned value.

    INITIAL-PETTY is intentionally allowed.
  */

  for (
    let i = data.length - 1;
    i >= 0;
    i--
  ) {

    const row =
      data[i];


    const reportId =
      String(
        row[0] || ""
      ).trim();


    const pettyReturned =
      Number(
        row[31]
      ) || 0;


    const status =
      String(
        row[35] || ""
      )
        .trim()
        .toUpperCase();


    if (
      status !== "CLOSED"
    ) {

      continue;

    }


    /*
      A CLOSED report with Petty Returned = 0
      is still valid.

      This means the next shift starts with ₱0.
    */

    return {

      success: true,

      received:
        pettyReturned,

      previousReportId:
        reportId

    };

  }


  /*
    No previous CLOSED report.
  */

  return {

    success: true,

    received: 0,

    previousReportId: ""

  };

}

function startCashierShiftPhase10(employee, firstShiftPetty) {

  try {

    employee =
      String(employee || "").trim();


    if (!employee) {

      return {
        success: false,
        message: "Employee is required."
      };

    }


    const sheet =
      phase10CashReportSheet_();


    const tz =
      Session.getScriptTimeZone();


    /* ======================================================
       READ CASH REPORT LOG ONCE
    ====================================================== */

    let rows = [];


    if (
      sheet.getLastRow() >= 2
    ) {

      rows =
        sheet
          .getRange(
            2,
            1,
            sheet.getLastRow() - 1,
            CASH_REPORT_COLUMN_COUNT
          )
          .getValues();

    }


    /* ======================================================
       RESUME EXISTING OPEN SHIFT
    ====================================================== */

    for (
      let i = rows.length - 1;
      i >= 0;
      i--
    ) {

      const row =
        rows[i];


      const rowEmployee =
        String(
          row[
            CASH_REPORT_IDX.EMPLOYEE
          ] || ""
        ).trim();


      const status =
        String(
          row[
            CASH_REPORT_IDX.STATUS
          ] || ""
        )
          .trim()
          .toUpperCase();


      if (
        rowEmployee === employee &&
        status === "OPEN"
      ) {

        const shiftStart =
          row[
            CASH_REPORT_IDX.SHIFT_START
          ];


        return {

          success: true,

          reportId:
            String(
              row[
                CASH_REPORT_IDX.REPORT_ID
              ] || ""
            ),

          /*
            IMPORTANT:
            Never return Date objects through google.script.run.
          */

          shiftStart:
            shiftStart instanceof Date
              ? Utilities.formatDate(
                  shiftStart,
                  tz,
                  "yyyy-MM-dd'T'HH:mm:ss"
                )
              : String(
                  shiftStart || ""
                ),

          pettyReceived:
            Number(
              row[
                CASH_REPORT_IDX.PETTY_RECEIVED
              ]
            ) || 0,

          resumed: true

        };

      }

    }


    /* ======================================================
       GET LATEST PETTY HANDOVER
    ====================================================== */

    let petty =
      Math.max(
        0,
        Number(
          firstShiftPetty
        ) || 0
      );


    let previousReportId =
      "";


    for (
      let i = rows.length - 1;
      i >= 0;
      i--
    ) {

      const row =
        rows[i];


      const status =
        String(
          row[
            CASH_REPORT_IDX.STATUS
          ] || ""
        )
          .trim()
          .toUpperCase();


      if (
        status !== "CLOSED"
      ) {

        continue;

      }


      previousReportId =
        String(
          row[
            CASH_REPORT_IDX.REPORT_ID
          ] || ""
        ).trim();


      petty =
        Math.max(
          0,
          Number(
            row[
              CASH_REPORT_IDX.PETTY_RETURNED
            ]
          ) || 0
        );


      break;

    }


    /* ======================================================
       GENERATE REPORT ID
    ====================================================== */

    const now =
      new Date();


    const datePart =
      Utilities.formatDate(
        now,
        tz,
        "yyyyMMdd"
      );


    const prefix =
      "CR-" +
      datePart +
      "-";


    let highest =
      0;


    rows.forEach(
      function(row) {

        const reportId =
          String(
            row[
              CASH_REPORT_IDX.REPORT_ID
            ] || ""
          ).trim();


        if (
          !reportId.startsWith(
            prefix
          )
        ) {

          return;

        }


        const sequence =
          Number(
            reportId.substring(
              prefix.length
            )
          );


        if (
          Number.isInteger(
            sequence
          ) &&
          sequence > highest
        ) {

          highest =
            sequence;

        }

      }
    );


    const id =
      prefix +
      String(
        highest + 1
      ).padStart(
        3,
        "0"
      );


    /* ======================================================
       CREATE OPEN SHIFT
    ====================================================== */

    const row =
      new Array(
        CASH_REPORT_COLUMN_COUNT
      ).fill("");


    row[
      CASH_REPORT_IDX.REPORT_ID
    ] =
      id;


    row[
      CASH_REPORT_IDX.TIMESTAMP
    ] =
      now;


    row[
      CASH_REPORT_IDX.REPORT_TYPE
    ] =
      "CASHIER SHIFT";


    row[
      CASH_REPORT_IDX.REPORT_DATE
    ] =
      Utilities.formatDate(
        now,
        tz,
        "yyyy-MM-dd"
      );


    row[
      CASH_REPORT_IDX.EMPLOYEE
    ] =
      employee;


    row[
      CASH_REPORT_IDX.SHIFT_START
    ] =
      now;


    row[
      CASH_REPORT_IDX.PETTY_RECEIVED
    ] =
      petty;


    row[
      CASH_REPORT_IDX.STATUS
    ] =
      "OPEN";


    row[
      CASH_REPORT_IDX.UPDATED_AT
    ] =
      now;


    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        1,
        CASH_REPORT_COLUMN_COUNT
      )
      .setValues(
        [row]
      );


    SpreadsheetApp.flush();


    /* ======================================================
       RETURN ONLY RPC-SAFE VALUES

       NO DATE OBJECTS
    ====================================================== */

    return {

      success: true,

      reportId:
        id,

      shiftStart:
        Utilities.formatDate(
          now,
          tz,
          "yyyy-MM-dd'T'HH:mm:ss"
        ),

      pettyReceived:
        petty,

      previousReportId:
        previousReportId,

      resumed:
        false

    };


  } catch (err) {

    console.error(
      "startCashierShiftPhase10 failed:",
      err
    );


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

function phase10ExpectedCash_(cashierName, start, end) {
  const ss=SpreadsheetApp.getActiveSpreadsheet(), sheet=ss.getSheetByName(SHEETS.SALES_LOG); if(!sheet)return 0;
  const data=sheet.getDataRange().getValues(); let total=0;
  for(let i=1;i<data.length;i++){
    const row=data[i], ts=row[SALES_IDX.TIMESTAMP]; if(!ts)continue; const d=new Date(ts);
    if(start && d<new Date(start))continue; if(end && d>new Date(end))continue;
    if(String(row[SALES_IDX.CASHIER]||"").trim()!==String(cashierName||"").trim())continue;
    if(String(row[SALES_IDX.STATUS]||"").trim().toUpperCase()!=="COMPLETED")continue;
    if(String(row[SALES_IDX.PAYMENT_METHOD]||"").trim().toUpperCase()!=="CASH")continue;
    total += Number(row[SALES_IDX.NET_TOTAL])||0;
  }
  return roundToTwo(total);
}

function closeCashierShiftPhase10(managerName,cashierName,reportDate,pettyCashObj,cashOnHandObj,cashDrawerRemark){
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try{
    const open=phase10FindOpenShift_(cashierName); if(!open)throw new Error("No open cashier shift found.");
    const sheet=phase10CashReportSheet_(), now=new Date(), v=open.values;
    const pettyBreak=(pettyCashObj&&pettyCashObj.returnBreakdown)||{}, cashBreak=(cashOnHandObj&&cashOnHandObj.breakdown)||{};
    const pettyReceived=Number(v[CASH_REPORT_IDX.PETTY_RECEIVED])||0, pettyReturned=sumBreakdown(pettyBreak), cashCounted=sumBreakdown(cashBreak);
    const expected=phase10ExpectedCash_(cashierName,v[CASH_REPORT_IDX.SHIFT_START],now), cashVariance=roundToTwo(cashCounted-expected), pettyVariance=roundToTwo(pettyReturned-pettyReceived);
    const row=v.slice(); row[CASH_REPORT_IDX.MANAGER]=managerName||""; row[CASH_REPORT_IDX.SHIFT_END]=now; row[CASH_REPORT_IDX.EXPECTED_CASH]=expected;
    const den=[1000,500,200,100,50,20,10,5,1], cashIdx=[CASH_REPORT_IDX.CASH_1000,CASH_REPORT_IDX.CASH_500,CASH_REPORT_IDX.CASH_200,CASH_REPORT_IDX.CASH_100,CASH_REPORT_IDX.CASH_50,CASH_REPORT_IDX.CASH_20,CASH_REPORT_IDX.CASH_10,CASH_REPORT_IDX.CASH_5,CASH_REPORT_IDX.CASH_1], pettyIdx=[CASH_REPORT_IDX.PETTY_1000,CASH_REPORT_IDX.PETTY_500,CASH_REPORT_IDX.PETTY_200,CASH_REPORT_IDX.PETTY_100,CASH_REPORT_IDX.PETTY_50,CASH_REPORT_IDX.PETTY_20,CASH_REPORT_IDX.PETTY_10,CASH_REPORT_IDX.PETTY_5,CASH_REPORT_IDX.PETTY_1];
    den.forEach((d,i)=>{row[cashIdx[i]]=Number(cashBreak[d])||0; row[pettyIdx[i]]=Number(pettyBreak[d])||0;});
    row[CASH_REPORT_IDX.CASH_COUNTED]=cashCounted; row[CASH_REPORT_IDX.CASH_VARIANCE]=cashVariance; row[CASH_REPORT_IDX.CASH_REMARK]=String(cashDrawerRemark||"").trim(); row[CASH_REPORT_IDX.PETTY_RETURNED]=pettyReturned; row[CASH_REPORT_IDX.PETTY_VARIANCE]=pettyVariance; row[CASH_REPORT_IDX.PETTY_VOUCHER_NO]=String((pettyCashObj&&pettyCashObj.voucherNo)||"").trim(); row[CASH_REPORT_IDX.PETTY_REMARK]=String((pettyCashObj&&pettyCashObj.reason)||"").trim(); row[CASH_REPORT_IDX.STATUS]="CLOSED"; row[CASH_REPORT_IDX.UPDATED_AT]=now;
    sheet.getRange(open.row,1,1,CASH_REPORT_COLUMN_COUNT).setValues([row]);
    return {success:true,reportId:row[CASH_REPORT_IDX.REPORT_ID],expectedCash:expected,cashCounted:cashCounted,cashVariance:cashVariance,pettyReturned:pettyReturned,pettyVariance:pettyVariance,shiftStart:v[CASH_REPORT_IDX.SHIFT_START],shiftEnd:now};
  } finally {try{lock.releaseLock();}catch(e){}}
}

function getCashReportHistoryPhase10(limit){
  const sheet=phase10CashReportSheet_(); if(sheet.getLastRow()<2)return [];
  const v=sheet.getRange(2,1,sheet.getLastRow()-1,CASH_REPORT_COLUMN_COUNT).getDisplayValues();
  return v.slice().reverse().slice(0,Math.max(1,Number(limit)||100)).map(r=>({reportId:r[CASH_REPORT_IDX.REPORT_ID],reportDate:r[CASH_REPORT_IDX.REPORT_DATE],employee:r[CASH_REPORT_IDX.EMPLOYEE],manager:r[CASH_REPORT_IDX.MANAGER],shiftStart:r[CASH_REPORT_IDX.SHIFT_START],shiftEnd:r[CASH_REPORT_IDX.SHIFT_END],expectedCash:r[CASH_REPORT_IDX.EXPECTED_CASH],cashCounted:r[CASH_REPORT_IDX.CASH_COUNTED],cashVariance:r[CASH_REPORT_IDX.CASH_VARIANCE],pettyReceived:r[CASH_REPORT_IDX.PETTY_RECEIVED],pettyReturned:r[CASH_REPORT_IDX.PETTY_RETURNED],pettyVariance:r[CASH_REPORT_IDX.PETTY_VARIANCE],status:r[CASH_REPORT_IDX.STATUS]}));
}

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

    const openShift = phase10FindOpenShift_(cashierName);
    const shiftStart = openShift ? openShift.values[CASH_REPORT_IDX.SHIFT_START] : null;
    const reportEnd = new Date();
    const metrics = collectSalesMetrics(salesData, reportDate, cashierName, shiftStart, reportEnd);

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

    // Persist the blind cashier count and server-side reconciliation.
    // Expected Cash / Cash Variance are stored for manager reporting but not shown to cashier.
    const closeResult = closeCashierShiftPhase10(managerName, cashierName, reportDate, pettyCashObj, cashOnHandObj, cashDrawerRemark);
    if (!closeResult || !closeResult.success) throw new Error("Unable to close cashier shift.");

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
