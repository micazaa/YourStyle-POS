// Read each source once; never request delivery details separately for every row.
function getDeliverySummaryData() {
  assertAppRequest_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  function read(name, width, display) {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, width);
    return display ? range.getDisplayValues() : range.getValues();
  }
  return buildDeliverySummaryData_(
    read(SHEETS.DELIVERY_LOG, DELIVERY_LOG_COLUMN_COUNT),
    read(SHEETS.INVENTORY, INVENTORY_COLUMN_COUNT, true),
    read(SHEETS.INVENTORY_MOVEMENT_LOG, MOVEMENT_LOG_COLUMN_COUNT)
  );
}

function buildDeliverySummaryData_(deliveries, inventory, movements) {
  const text = value => String(value || '').trim();
  const upper = value => text(value).toUpperCase();
  const dates = new Map();
  deliveries.forEach(row => {
    const id = text(row[DELIVERY_IDX.DELIVERY_ID]);
    dates.set(id, formatInventoryDateForClient(row[DELIVERY_IDX.DELIVERY_DATE]));
  });
  const splitRows = [];
  const receipts = new Map(), activity = new Set(), physicalProducts = new Map(), sold = new Map(), bundleProducts = new Set();
  movements.forEach(row => {
    const source = upper(row[MOVE_IDX.SOURCE]);
    if (source === 'DELIVERY' && text(row[MOVE_IDX.NOTES]) === 'PHYSICAL_BUNDLE_RECEIPT') {
      const code = text(row[MOVE_IDX.CODE]), holder = text(row[MOVE_IDX.SOURCE_LINE_ID]);
      if (code && holder) { physicalProducts.set(holder, code); bundleProducts.add(code); }
    }
    const split = parseBundleSplitNote_(row[MOVE_IDX.NOTES]);
    if (split && source === 'ADJUSTMENT' && Number(row[MOVE_IDX.QTY_CHANGE]) === -1) {
      bundleProducts.add(String(split.productCode));splitRows.push(row);
    }
    if (!(source === 'SALE' || isSupplierReturnSource_(source)) || Number(row[MOVE_IDX.QTY_CHANGE]) >= 0) return;
    const allocation = parsePhysicalBundleAllocationNote_(inventoryMovementInternalNotes_(row));
    if (!allocation) return;
    const key = JSON.stringify([allocation.deliveryId, Number(allocation.sheetRow) || 0, Number(row[MOVE_IDX.BUNDLE_NO])]);
    if (!sold.has(key)) sold.set(key, {full:false});
    const state = sold.get(key);
    if (allocation.kind === 'FULL') state.full = true;
  });
  deliveryReceivedLines_(deliveries, inventory, movements).forEach(line => {
    const {id, category, name, code, quantity, source, row, type} = line;
    const productKey = JSON.stringify([category, category === 'YOURFINDS' ? name.toUpperCase() : code]);
    const key = JSON.stringify([id, productKey]);
    if (!receipts.has(key)) receipts.set(key, {deliveryId:id, date:dates.get(id), category, name, productKey, quantity:0});
    receipts.get(key).quantity += quantity;
    if (source === 'DISTRIBUTION') activity.add(JSON.stringify([id, String(row[MOVE_IDX.SOURCE_LINE_ID] || '').startsWith('BUNDLE_ROW:') ? String(row[MOVE_IDX.SOURCE_LINE_ID]).slice(11) : type, Number(row[MOVE_IDX.BUNDLE_NO])]));
  });
  const bundles = [];
  const sequences = new Map();
  deliveries.forEach((row, index) => {
    if (upper(row[DELIVERY_IDX.RECEIVE_MODE]) !== 'BULK') return;
    const id = text(row[DELIVERY_IDX.DELIVERY_ID]), type = upper(row[DELIVERY_IDX.TYPE]);
    const sequence = (sequences.get(id) || 0) + 1;sequences.set(id, sequence);
    const productCode = physicalProducts.get(id + '-B' + String(sequence).padStart(2, '0')) || '';
    if (!['PENDING', 'PARTIAL'].includes(upper(row[DELIVERY_IDX.STATUS]))) return;
    const quantity = Math.max(0, Math.floor(Number(row[DELIVERY_IDX.BUNDLE_QTY]) || 0));
    physicalBundleDefinitions_(id,index+2,quantity,splitRows).forEach(bundle => {
      const number = bundle.bundleNo;
      const sale = sold.get(JSON.stringify([id,index+2,number])) || sold.get(JSON.stringify([id,0,number]));
      const distributed = activity.has(JSON.stringify([id,String(index+2),number])) || activity.has(JSON.stringify([id,type,number]));
      bundles.push({deliveryId:id,date:dates.get(id),sheetRow:index+2,category:type,code:text(row[DELIVERY_IDX.DESCRIPTION]),bundleNo:number,
        label:bundle.label,productCode:bundle.productCode || productCode,available:!bundle.split && !distributed && !(sale && sale.full),
        status:bundle.split?'Split':distributed?'In progress':'Unopened'});
    });
  });
  return {success:true, receipts:Array.from(receipts.values()), bundles:bundles, bundleProducts:Array.from(bundleProducts)};
}


function deliveryReceivedLines_(deliveries, inventory, movements) {
  const text = value => String(value || '').trim();
  const upper = value => text(value).toUpperCase();
  const products = new Map(inventory.map(row => [text(row[INV_IDX.CODE]), row]));
  const types = new Map(deliveries.map(row => [text(row[DELIVERY_IDX.DELIVERY_ID]), upper(row[DELIVERY_IDX.DELIVERY_TYPE])]));
  const lines = [];
  movements.forEach(row => {
    const id = text(row[MOVE_IDX.REFERENCE_ID]);
    const source = upper(row[MOVE_IDX.SOURCE]);
    const quantity = Number(row[MOVE_IDX.QTY_CHANGE]) || 0;
    const type = upper(row[MOVE_IDX.TYPE]);
    if (!types.has(id) || quantity <= 0 || !['DELIVERY', 'DISTRIBUTION'].includes(source)) return;
    // Bundle holders represent estimates. Count the product pieces when distributed.
    if (type.startsWith('BULK') || (source === 'DELIVERY' && text(row[MOVE_IDX.NOTES]) === 'PHYSICAL_BUNDLE_RECEIPT')) return;
    const code = text(row[MOVE_IDX.CODE]), product = products.get(code);
    const category = types.get(id) === 'YOURFINDS' || (!types.get(id) && /^YFD-/i.test(id))
      ? 'YOURFINDS' : upper(product && product[INV_IDX.CATEGORY]) || type;
    const size = text(product && product[INV_IDX.SIZE]);
    const name = category === 'YOURFINDS' ? size || 'Unknown size' : text(row[MOVE_IDX.ITEM]) || text(product && product[INV_IDX.DESCRIPTION]) || code;
    lines.push({id, category, name, code, size, quantity, source, row, type});
  });
  return lines;
}

function dashboardDeliveryRows_(start, end) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const deliveries = readDeliveryPageRows_(ss, SHEETS.DELIVERY_LOG, DELIVERY_LOG_COLUMN_COUNT, false).filter(row => {
    const date = dashboardOverviewDate_(formatInventoryDateForClient(row[DELIVERY_IDX.DELIVERY_DATE]));
    return date >= start && date <= end && String(row[DELIVERY_IDX.DELIVERY_ID] || '').trim();
  });
  if (!deliveries.length) return {count:0, rows:[]};
  const rows = deliveryReceivedLines_(deliveries,
    readDeliveryPageRows_(ss, SHEETS.INVENTORY, INV_COL.CATEGORY, true),
    readDeliveryPageRows_(ss, SHEETS.INVENTORY_MOVEMENT_LOG, MOVEMENT_LOG_COLUMN_COUNT, false));
  return {count:new Set(deliveries.map(row => String(row[DELIVERY_IDX.DELIVERY_ID]).trim())).size, rows};
}

function dashboardDeliveryRange_(request) {
  assertAppRequest_();
  if (!ACCESS_REQUEST_CONTEXT_.actor || !isDevelopmentSpreadsheet_()) throw new Error('Dashboard delivery reports are unavailable.');
  const start = dashboardDate_(request.start), end = dashboardDate_(request.end);
  if (start > end) throw new Error('Choose a start date before or equal to the end date.');
  return {start, end};
}

function getDashboardDeliverySummary(request) {
  const {start, end} = dashboardDeliveryRange_(request);
  const {count, rows} = dashboardDeliveryRows_(start, end);
  const summary = dashboardReturnSummary_(rows);
  return {count, items:summary.items, groups:summary.groups};
}
