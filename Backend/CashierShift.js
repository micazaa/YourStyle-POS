// One daily report per cashier; custody events and receipt-linked report drafts.
// Existing Cash Report Log columns and historical rows remain unchanged.
const PETTY_HANDOVER_SHEET = 'Petty Cash Handovers';
const PETTY_HANDOVER_HEADERS = [
  'Handover ID', 'Timestamp', 'Report ID', 'Employee', 'Event',
  'Received', 'Returned', 'Variance', 'Breakdown JSON', 'Voucher No.',
  'Explanation', 'Request ID', 'Report Snapshot JSON',
];
const CASHIER_END_ACKNOWLEDGMENT = 'I confirm that all sales and cash counts recorded for this shift are true and complete. I understand that I am responsible for the cash and petty cash I hand over and for explaining any differences.';

function cashierLiteral_(value) {
  const text = String(value || '');
  return /^[=+@-]/.test(text) ? "'" + text : text;
}

function pettyHandoverRows_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PETTY_HANDOVER_SHEET);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (!lastRow) return [];
  const data = sheet.getRange(1, 1, lastRow, PETTY_HANDOVER_HEADERS.length).getValues();
  const headers = data[0];
  if (headers.some((value, i) => value !== PETTY_HANDOVER_HEADERS[i]))
    throw new Error('Petty Cash Handovers headers do not match the expected layout.');
  return data.slice(1);
}

function appendPettyHandover_(reportId, employee, event, received, returned, breakdown, voucher, reason, requestId, snapshot) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PETTY_HANDOVER_SHEET);
  if (!sheet) sheet = ss.insertSheet(PETTY_HANDOVER_SHEET);
  if (!sheet.getLastRow()) sheet.getRange(1, 1, 1, PETTY_HANDOVER_HEADERS.length).setValues([PETTY_HANDOVER_HEADERS]);
  const row = [
    'PH-' + Utilities.getUuid(), new Date(), reportId, employee, event,
    received, returned, event === 'RECEIVE' ? 0 : roundToTwo(returned - received),
    JSON.stringify(breakdown || {}), cashierLiteral_(voucher), cashierLiteral_(reason), requestId,
    snapshot ? JSON.stringify(snapshot) : '',
  ];
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  SpreadsheetApp.flush();
  return row;
}

function lastPettyEvent_(events, reportId) {
  return events.slice().reverse().find(row => row[4] !== 'REPORT_SAVED' && (!reportId || row[2] === reportId)) || null;
}

function cashierReportHasEvents_(reportId) {
  return pettyHandoverRows_().some(row => row[2] === reportId && row[4] !== 'REPORT_SAVED');
}

function latestPettyHandover_() {
  const events = pettyHandoverRows_();
  const managed = new Set(events.map(row => row[2]));
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CASH_REPORT_LOG);
  const rows = sheet && sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, CASH_REPORT_COLUMN_COUNT).getValues() : [];
  let source = null;
  rows.forEach(row => {
    const type = String(row[CASH_REPORT_IDX.REPORT_TYPE] || '').trim().toUpperCase();
    if (managed.has(String(row[0])) || String(row[CASH_REPORT_IDX.STATUS]).trim().toUpperCase() !== 'CLOSED' ||
        !['CASHIER SHIFT', 'INITIAL PETTY', 'INITIAL-PETTY'].includes(type)) return;
    const rawTimestamp = row[CASH_REPORT_IDX.UPDATED_AT] || row[CASH_REPORT_IDX.SHIFT_END] || row[1];
    const timestamp = rawTimestamp && !isNaN(new Date(rawTimestamp).getTime()) ? new Date(rawTimestamp) : '';
    if (!source || (timestamp ? timestamp.getTime() : 0) >= (source.timestamp ? new Date(source.timestamp).getTime() : 0)) source = {
      received: Number(row[CASH_REPORT_IDX.PETTY_RETURNED]) || 0,
      previousReportId: String(row[0]), previousEmployee: String(row[CASH_REPORT_IDX.EMPLOYEE] || ''),
      timestamp: timestamp, version: 'legacy:' + row[0] + ':' + (timestamp ? timestamp.getTime() : 0), holder: '',
    };
  });
  const latest = lastPettyEvent_(events);
  if (latest && (!source || !source.timestamp || new Date(latest[1]) >= new Date(source.timestamp))) {
    const counted = events.slice().reverse().find(row => ['PAUSE', 'END'].includes(row[4])) || latest;
    source = {
      received: Number(latest[latest[4] === 'RECEIVE' ? 5 : 6]) || 0,
      previousReportId: String(counted[2]), previousEmployee: String(counted[3]), timestamp: counted[1],
      version: String(latest[0]), holder: latest[4] === 'RECEIVE' ? String(latest[3]) : '',
    };
  }
  source = source || {received: 0, previousReportId: '', previousEmployee: '', timestamp: '', version: 'initial', holder: ''};
  return {
    success: true, received: source.received, previousReportId: source.previousReportId,
    previousEmployee: source.previousEmployee,
    previousCountedAt: source.timestamp ? Utilities.formatDate(new Date(source.timestamp), Session.getScriptTimeZone(), 'h:mm a') : '',
    version: source.version, holder: source.holder,
  };
}

function cashierReportRows_() {
  const sheet = cashReportSheet_();
  return {sheet: sheet, rows: sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, CASH_REPORT_COLUMN_COUNT).getValues() : []};
}

function cashierSnapshotRow_(event) {
  const snapshot = JSON.parse(event[12]);
  const row = Array.isArray(snapshot) ? snapshot : snapshot.row;
  [CASH_REPORT_IDX.TIMESTAMP, CASH_REPORT_IDX.SHIFT_START, CASH_REPORT_IDX.SHIFT_END, CASH_REPORT_IDX.UPDATED_AT]
    .forEach(i => { if (row[i]) row[i] = new Date(row[i]); });
  return row;
}

function cashierShiftTarget_(employee, reportId, data, events) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  for (let i = data.rows.length - 1; i >= 0; i--) {
    const row = data.rows[i];
    if (String(row[CASH_REPORT_IDX.EMPLOYEE]).trim() !== employee ||
        String(row[CASH_REPORT_IDX.REPORT_TYPE]).trim().toUpperCase() !== 'CASHIER SHIFT' ||
        (reportId && row[0] !== reportId)) continue;
    const event = lastPettyEvent_(events, row[0]);
    if (!reportId && (event && event[4] === 'END' || (!event || !['RECEIVE', 'PAUSE'].includes(event[4])) && String(row[CASH_REPORT_IDX.STATUS]).trim().toUpperCase() !== 'OPEN' ||
        dateString_(row[CASH_REPORT_IDX.REPORT_DATE]) !== today && (!event || !['PAUSE', 'RECEIVE'].includes(event[4])))) continue;
    const lastReturn = events.slice().reverse().find(entry => entry[2] === row[0] && ['PAUSE', 'END'].includes(entry[4]));
    const draftEvent = events.slice().reverse().find(entry => entry[2] === row[0] && entry[4] === 'REPORT_SAVED');
    return {row: i + 2, values: row, event: event, lastReturn: lastReturn,
      draft: draftEvent && draftEvent[12] ? JSON.parse(draftEvent[12]) : null};
  }
  throw new Error('No active cashier shift found. Sign in using Start cashier shift.');
}

function cashierShiftStatus_(target) {
  const event = target.event;
  return event && event[4] === 'END' ? 'CLOSED' : event && event[4] === 'PAUSE' ? 'PAUSED'
    : event && event[4] === 'RECEIVE' ? 'OPEN' : String(target.values[CASH_REPORT_IDX.STATUS]).trim().toUpperCase();
}

// Transaction authorization needs the current status, not every report and saved cash-count draft.
function cashierShiftAccessStatus_(employee, reportId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getSheetByName(SHEETS.CASH_REPORT_LOG);
  let values;
  if (sheet && sheet.getLastRow() > 1) {
    const matches = sheet.getRange(2, CASH_REPORT_COL.REPORT_ID, sheet.getLastRow() - 1, 1)
      .createTextFinder(String(reportId)).matchCase(true).matchEntireCell(true).findAll()
      .map(cell => cell.getRow()).sort((a,b) => b-a);
    for (const row of matches) {
      const candidate = sheet.getRange(row, 1, 1, CASH_REPORT_COLUMN_COUNT).getValues()[0];
      if (String(candidate[CASH_REPORT_IDX.EMPLOYEE]).trim() === employee &&
          String(candidate[CASH_REPORT_IDX.REPORT_TYPE]).trim().toUpperCase() === 'CASHIER SHIFT') {
        values = candidate;break;
      }
    }
  }
  if (!values) throw new Error('No active cashier shift found. Sign in using Start cashier shift.');
  const events = ss.getSheetByName(PETTY_HANDOVER_SHEET);
  let event = null;
  if (events && events.getLastRow() > 1) {
    const headers = events.getRange(1, 1, 1, PETTY_HANDOVER_HEADERS.length).getValues()[0];
    if (headers.some((value,index) => value !== PETTY_HANDOVER_HEADERS[index])) {
      throw new Error('Petty Cash Handovers headers do not match the expected layout.');
    }
    const statuses = events.getRange(2, 3, events.getLastRow() - 1, 3).getValues();
    for (let i = statuses.length - 1; i >= 0; i--) {
      if (statuses[i][0] === reportId && statuses[i][2] !== 'REPORT_SAVED') {
        event = [];event[4] = statuses[i][2];break;
      }
    }
  }
  return cashierShiftStatus_({values:values,event:event});
}

function cashierShiftContext_(target) {
  const row = target.values, event = target.event;
  const savedReport = buildCashReportObject([], row);
  const received = event && event[4] === 'RECEIVE' ? Number(event[5]) : Number(row[CASH_REPORT_IDX.PETTY_RECEIVED]) || 0;
  const hasSavedReport = row[CASH_REPORT_IDX.CASH_COUNTED] !== '' && row[CASH_REPORT_IDX.CASH_COUNTED] !== undefined && row[CASH_REPORT_IDX.CASH_COUNTED] !== null;
  const receiveId = event && event[4] === 'RECEIVE' ? String(event[0]) : '';
  const draft = target.draft && target.draft.receiveId === receiveId
    ? buildCashReportObject([], target.draft.row)
    // Compatibility with snapshots printed before receipt-linked drafts existed.
    : !target.lastReturn && !(event && event[12]) && hasSavedReport ? savedReport : null;
  // A current draft may include a documented difference. Older handover counts
  // can prefill only when they match this receipt, never as a daily total.
  const savedPetty = target.lastReturn ? cashierCount_(JSON.parse(target.lastReturn[8])) : savedReport.pettyBreakdown;
  const pettyBreakdown = draft ? draft.pettyBreakdown : sumBreakdown(savedPetty) === received ? savedPetty : null;
  return {
    success: true, reportId: String(row[0]), reportDate: dateString_(row[CASH_REPORT_IDX.REPORT_DATE]),
    shiftStart: rpcDate_(row[CASH_REPORT_IDX.SHIFT_START]),
    status: cashierShiftStatus_(target),
    pettyReceived: received,
    receiveId: receiveId,
    cashBreakdown: savedReport.cashBreakdown,
    cashRemark: String(row[CASH_REPORT_IDX.CASH_REMARK] || ''),
    managerName: String(row[CASH_REPORT_IDX.MANAGER] || ''),
    pettyBreakdown: pettyBreakdown,
    pettyVoucherNo: draft ? draft.pettyVoucherNo : '',
    pettyRemark: draft ? draft.pettyRemark : '',
    hasSavedReport: hasSavedReport,
    savedReport: hasSavedReport ? savedReport : null,
  };
}

function reopenCashierDailyReport_(target, sheet) {
  if (String(target.values[CASH_REPORT_IDX.STATUS]).trim().toUpperCase() === 'OPEN') return;
  const row = target.values.slice();
  row[CASH_REPORT_IDX.STATUS] = 'OPEN';
  row[CASH_REPORT_IDX.SHIFT_END] = '';
  row[CASH_REPORT_IDX.UPDATED_AT] = new Date();
  sheet.getRange(target.row, 1, 1, CASH_REPORT_COLUMN_COUNT).setValues([row]);
  SpreadsheetApp.flush();
  target.values = row;
}

function getCashierShiftContext(token, reportId) {
  assertAppRequest_();
  const actor = dashboardEmployee_(token);
  let target = cashierShiftTarget_(actor.name, String(reportId || ''), cashierReportRows_(), pettyHandoverRows_());
  if (target.event && (target.event[4] === 'END' && target.values[CASH_REPORT_IDX.STATUS] !== 'CLOSED' ||
      target.event[4] === 'RECEIVE' && target.values[CASH_REPORT_IDX.STATUS] === 'CLOSED')) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const data = cashierReportRows_();
      target = cashierShiftTarget_(actor.name, String(reportId || ''), data, pettyHandoverRows_());
      if (target.event && target.event[4] === 'RECEIVE') {
        reopenCashierDailyReport_(target, data.sheet);
      } else if (target.event && target.event[4] === 'END' && target.values[CASH_REPORT_IDX.STATUS] !== 'CLOSED') {
        target.values = cashierSnapshotRow_(target.event);
        data.sheet.getRange(target.row, 1, 1, CASH_REPORT_COLUMN_COUNT).setValues([target.values]);
        SpreadsheetApp.flush();
      }
    } finally { lock.releaseLock(); }
  }
  const context = cashierShiftContext_(target);
  context.managers = getEmployees()
    .filter(employee => employeeCanAuthorizeManager_(employee))
    .map(employee => (String(employee.firstName).trim() + ' ' + String(employee.lastName).trim()).trim());
  return context;
}

function startManagedCashierShift_(employee, firstPetty, expectedVersion) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const events = pettyHandoverRows_();
    const data = cashierReportRows_();
    // Complete a previously saved END if a sheet write failed after its ledger event.
    events.filter(event => event[3] === employee && event[4] === 'END' && event[12] &&
      lastPettyEvent_(events, event[2])[0] === event[0]).forEach(event => {
      const index = data.rows.findIndex(row => row[0] === event[2]);
      if (index >= 0 && data.rows[index][CASH_REPORT_IDX.STATUS] !== 'CLOSED') {
        data.rows[index] = cashierSnapshotRow_(event);
        data.sheet.getRange(index + 2, 1, 1, CASH_REPORT_COLUMN_COUNT).setValues([data.rows[index]]);
      }
    });
    let target;
    try { target = cashierShiftTarget_(employee, '', data, events); } catch (error) { target = null; }
    if (!target) {
      const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      for (let i = data.rows.length - 1; i >= 0; i--) {
        const row = data.rows[i];
        if (String(row[CASH_REPORT_IDX.EMPLOYEE]).trim() === employee &&
            String(row[CASH_REPORT_IDX.REPORT_TYPE]).trim().toUpperCase() === 'CASHIER SHIFT' &&
            dateString_(row[CASH_REPORT_IDX.REPORT_DATE]) === today &&
            String(row[CASH_REPORT_IDX.STATUS]).trim().toUpperCase() === 'CLOSED') {
          target = {row: i + 2, values: row, event: lastPettyEvent_(events, row[0])};
          break;
        }
      }
    }
    const source = latestPettyHandover_();
    if (source.holder && source.holder !== employee)
      throw new Error('Petty cash is still with ' + source.holder + '. They must hand it over before you start.');
    if (target && target.event && target.event[4] === 'RECEIVE') {
      if (!lastPettyEvent_(events) || lastPettyEvent_(events)[0] !== target.event[0])
        throw new Error('Petty cash custody changed. Ask the current cashier to hand it over.');
      reopenCashierDailyReport_(target, data.sheet);
      const context = cashierShiftContext_(target);
      context.resumed = true;
      return context;
    }
    if (expectedVersion && expectedVersion !== source.version)
      throw new Error('Petty cash handover changed. Reload and confirm the latest amount before starting.');
    const received = source.previousReportId ? source.received : Number(firstPetty);
    if (!Number.isFinite(received) || received < 0) throw new Error('Enter a valid petty cash amount.');
    const resumed = !!target;
    if (!target) {
      const created = startCashierShift(employee, received, true);
      if (!created.success) throw new Error(created.message);
      target = cashierShiftTarget_(employee, created.reportId, cashierReportRows_(), events);
    }
    const reopening = String(target.values[CASH_REPORT_IDX.STATUS]).trim().toUpperCase() === 'CLOSED';
    const amount = target.event || reopening ? received : resumed ? Number(target.values[CASH_REPORT_IDX.PETTY_RECEIVED]) || 0 : received;
    const event = appendPettyHandover_(target.values[0], employee, 'RECEIVE', amount, 0, {}, '', '',
      'receive:' + target.values[0] + ':' + (target.event ? target.event[0] : 'initial'), reopening ? target.values : null);
    if (target.event && ['PAUSE', 'END'].includes(target.event[4])) target.lastReturn = target.event;
    target.event = event;
    reopenCashierDailyReport_(target, data.sheet);
    const context = cashierShiftContext_(target);
    context.resumed = resumed;
    return context;
  } finally { lock.releaseLock(); }
}

function cashierCount_(source) {
  const result = {};
  [1000, 500, 200, 100, 50, 20, 10, 5, 1].forEach(d => {
    const value = source && source[d];
    const count = value === '' || value === undefined || value === null ? 0 : Number(value);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Bill and coin counts must be non-negative whole numbers.');
    result[d] = count;
  });
  if (!Number.isSafeInteger(sumBreakdown(result))) throw new Error('Cash count total is too large.');
  return result;
}

function cashierShiftMetrics_(row) {
  const sales = getSalesLogSheet_();
  if (!sales) throw new Error('Sales Log sheet not found.');
  const end = row[CASH_REPORT_IDX.SHIFT_END] || new Date();
  return collectSalesMetrics(sales.getDataRange().getValues(), dateString_(row[CASH_REPORT_IDX.REPORT_DATE]),
    row[CASH_REPORT_IDX.EMPLOYEE], row[CASH_REPORT_IDX.SHIFT_START], end, {endDate: dateString_(end)});
}

function saveCashierShiftExit(payload) {
  assertAppRequest_();
  payload = payload || {};
  const actor = dashboardEmployee_(payload.token);
  if (!['PAUSE', 'END'].includes(payload.action)) throw new Error('Choose Pause shift or End shift.');
  const requestId = String(payload.requestId || '');
  if (!payload.reportId) throw new Error('Reopen the logout dialog to load your cashier shift.');
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new Error('Invalid handover request. Reopen the logout dialog.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let result;
  try {
    const events = pettyHandoverRows_(), data = cashierReportRows_();
    const target = cashierShiftTarget_(actor.name, String(payload.reportId || ''), data, events);
    const repeated = events.find(event => event[11] === requestId);
    if (repeated) {
      if (repeated[2] !== target.values[0] || repeated[3] !== actor.name || repeated[4] !== payload.action)
        throw new Error('This request belongs to another handover.');
      if (lastPettyEvent_(events, target.values[0])[0] !== repeated[0])
        throw new Error('This report has been reopened or resumed. Reopen the logout dialog.');
      if (repeated[4] === 'END' && target.values[CASH_REPORT_IDX.STATUS] !== 'CLOSED')
        data.sheet.getRange(target.row, 1, 1, CASH_REPORT_COLUMN_COUNT).setValues([cashierSnapshotRow_(repeated)]);
      result = {success: true, reportId: String(target.values[0]), status: repeated[4] === 'PAUSE' ? 'PAUSED' : 'CLOSED'};
    } else {
      const context = cashierShiftContext_(target);
      if (context.status !== 'OPEN') throw new Error('This shift has already been paused or ended.');
      if (context.receiveId !== String(payload.receiveId || '')) throw new Error('Petty cash custody changed. Reopen the logout dialog.');
      const latest = lastPettyEvent_(events);
      if (latest && latest[4] === 'RECEIVE' && latest[2] !== target.values[0])
        throw new Error('Petty cash is currently assigned to another cashier.');
      if (context.receiveId && (!latest || latest[0] !== context.receiveId)) throw new Error('Petty cash is no longer assigned to this cashier session.');
      const breakdown = cashierCount_(payload.pettyBreakdown), returned = sumBreakdown(breakdown);
      const voucher = String(payload.voucherNo || '').trim(), reason = String(payload.reason || '').trim();
      if (voucher.length > 200 || reason.length > 2000 || String(payload.cashRemark || '').length > 2000)
        throw new Error('Shorten the voucher number or explanation before saving.');
      if (Math.abs(returned - context.pettyReceived) > .001 && (!voucher || !reason))
        throw new Error('Voucher number and explanation are required when petty cash differs.');
      if (payload.action === 'PAUSE') {
        appendPettyHandover_(target.values[0], actor.name, 'PAUSE', context.pettyReceived, returned, breakdown, voucher, reason, requestId);
        result = {success: true, reportId: String(target.values[0]), status: 'PAUSED'};
      } else {
        if (payload.acknowledged !== true) throw new Error('Confirm the sales and cash handover acknowledgment before ending your shift.');
        const managerName = String(payload.managerName || '').trim();
        if (!managerName) throw new Error('Select a verifying manager.');
        const manager = getEmployees().find(employee => employeeCanAuthorizeManager_(employee) &&
          (String(employee.firstName).trim() + ' ' + String(employee.lastName).trim()).trim() === managerName);
        if (!manager) throw new Error('Select an active manager or owner.');
        const cash = cashierCount_(payload.cashBreakdown), row = target.values.slice(), now = new Date();
        const history = events.filter(event => event[2] === row[0] && event[4] !== 'REPORT_SAVED');
        const prior = history.filter(event => ['PAUSE', 'END'].includes(event[4]));
        const receipts = events.filter(event => event[2] === row[0] && event[4] === 'RECEIVE');
        // A legacy closed report may predate the handover ledger. Its first
        // reopening snapshot preserves the receipts/returns already reported.
        const first = history[0];
        const baseline = first && first[4] === 'RECEIVE' && first[12] ? cashierSnapshotRow_(first) : null;
        const opening = baseline ? Number(baseline[CASH_REPORT_IDX.PETTY_RECEIVED]) || 0 : first && first[4] !== 'RECEIVE' ? Number(first[5]) || 0 : 0;
        const receivedTotal = receipts.length ? receipts.reduce((sum, event) => sum + Number(event[5]), opening) : opening || context.pettyReceived;
        const returnedTotal = prior.reduce((sum, event) => sum + Number(event[6]), returned + (baseline ? Number(baseline[CASH_REPORT_IDX.PETTY_RETURNED]) || 0 : 0));
        const totalBreakdown = {...breakdown};
        if (baseline) Object.keys(totalBreakdown).forEach(d => { totalBreakdown[d] += Number(baseline[CASH_REPORT_IDX['PETTY_' + d]]) || 0; });
        prior.forEach(event => { const counted = JSON.parse(event[8]); Object.keys(totalBreakdown).forEach(d => totalBreakdown[d] += Number(counted[d]) || 0); });
        row[CASH_REPORT_IDX.MANAGER] = managerName;
        row[CASH_REPORT_IDX.SHIFT_END] = now;
        row[CASH_REPORT_IDX.EXPECTED_CASH] = roundToTwo(buildPaymentSummary(cashierShiftMetrics_(row)).cashSales);
        row[CASH_REPORT_IDX.CASH_COUNTED] = sumBreakdown(cash);
        row[CASH_REPORT_IDX.CASH_VARIANCE] = roundToTwo(row[CASH_REPORT_IDX.CASH_COUNTED] - row[CASH_REPORT_IDX.EXPECTED_CASH]);
        row[CASH_REPORT_IDX.CASH_REMARK] = cashierLiteral_(String(payload.cashRemark || '').trim());
        Object.keys(cash).forEach(d => { row[CASH_REPORT_IDX['CASH_' + d]] = cash[d]; row[CASH_REPORT_IDX['PETTY_' + d]] = totalBreakdown[d]; });
        row[CASH_REPORT_IDX.PETTY_RECEIVED] = receivedTotal;
        row[CASH_REPORT_IDX.PETTY_RETURNED] = returnedTotal;
        row[CASH_REPORT_IDX.PETTY_VARIANCE] = roundToTwo(returnedTotal - receivedTotal);
        row[CASH_REPORT_IDX.PETTY_VOUCHER_NO] = cashierLiteral_((baseline ? [baseline[CASH_REPORT_IDX.PETTY_VOUCHER_NO]] : []).concat(prior.map(event => event[9]), voucher).filter(Boolean).join(', '));
        row[CASH_REPORT_IDX.PETTY_REMARK] = cashierLiteral_((baseline ? [baseline[CASH_REPORT_IDX.PETTY_REMARK]] : []).concat(prior.map(event => event[10]), reason).filter(Boolean).join('; '));
        row[CASH_REPORT_IDX.STATUS] = 'CLOSED';
        row[CASH_REPORT_IDX.UPDATED_AT] = now;
        appendPettyHandover_(row[0], actor.name, 'END', context.pettyReceived, returned, breakdown, voucher, reason, requestId,
          {row: row, acknowledgment: {accepted: true, employee: actor.name, acceptedAt: now, statement: CASHIER_END_ACKNOWLEDGMENT}});
        data.sheet.getRange(target.row, 1, 1, CASH_REPORT_COLUMN_COUNT).setValues([row]);
        SpreadsheetApp.flush();
        result = {success: true, reportId: String(row[0]), status: 'CLOSED'};
      }
    }
  } finally { lock.releaseLock(); }
  return result;
}

function printEndedCashierShiftReport(token, reportId) {
  assertAppRequest_();
  const actor = dashboardEmployee_(token);
  const got = getClosedCashReport(reportId);
  if (!got.success) throw new Error(got.message);
  if (String(got.report.employee || '').trim() !== actor.name) throw new Error('This report belongs to another cashier.');
  return buildClosedCashierPdf_(got.report);
}
