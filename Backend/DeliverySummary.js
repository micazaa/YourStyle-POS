// Read each source once; never request delivery details separately for every row.
function getDeliverySummaryData() {
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
  const products = new Map(inventory.map(row => [text(row[INV_IDX.CODE]), row]));
  const dates = new Map();
  const deliveryTypes = new Map();
  deliveries.forEach(row => {
    const id = text(row[DELIVERY_IDX.DELIVERY_ID]);
    dates.set(id, formatInventoryDateForClient(row[DELIVERY_IDX.DELIVERY_DATE]));
    deliveryTypes.set(id, upper(row[DELIVERY_IDX.DELIVERY_TYPE]));
  });
  const receipts = new Map(), activity = new Set();
  movements.forEach(row => {
    const id = text(row[MOVE_IDX.REFERENCE_ID]);
    const source = upper(row[MOVE_IDX.SOURCE]);
    const quantity = Number(row[MOVE_IDX.QTY_CHANGE]) || 0;
    const type = upper(row[MOVE_IDX.TYPE]);
    if (!dates.has(id) || quantity <= 0 || !['DELIVERY', 'DISTRIBUTION'].includes(source)) return;
    // Holder receipts are estimates, not received product pieces.
    if (type.startsWith('BULK')) return;
    const code = text(row[MOVE_IDX.CODE]), product = products.get(code);
    const category = deliveryTypes.get(id) === 'YOURFINDS' ? 'YOURFINDS' : upper(product && product[INV_IDX.CATEGORY]) || type;
    const name = category === 'YOURFINDS' ? text(product && product[INV_IDX.SIZE]) || 'Unknown size' : text(row[MOVE_IDX.ITEM]) || text(product && product[INV_IDX.DESCRIPTION]) || code;
    const productKey = JSON.stringify([category, category === 'YOURFINDS' ? name.toUpperCase() : code]);
    const key = JSON.stringify([id, productKey]);
    if (!receipts.has(key)) receipts.set(key, {deliveryId:id, date:dates.get(id), category:category, name:name, productKey:productKey, quantity:0});
    receipts.get(key).quantity += quantity;
    if (source === 'DISTRIBUTION') activity.add(JSON.stringify([id, type, Number(row[MOVE_IDX.BUNDLE_NO])]));
  });
  const bundles = [];
  deliveries.forEach((row, index) => {
    if (upper(row[DELIVERY_IDX.RECEIVE_MODE]) !== 'BULK' || !['PENDING', 'PARTIAL'].includes(upper(row[DELIVERY_IDX.STATUS]))) return;
    const id = text(row[DELIVERY_IDX.DELIVERY_ID]), type = upper(row[DELIVERY_IDX.TYPE]);
    const quantity = Math.max(0, Math.floor(Number(row[DELIVERY_IDX.BUNDLE_QTY]) || 0));
    for (let number = 1; number <= quantity; number++) {
      bundles.push({deliveryId:id, date:dates.get(id), sheetRow:index+2, category:type, code:text(row[DELIVERY_IDX.DESCRIPTION]), bundleNo:number,
        status:activity.has(JSON.stringify([id,type,number])) ? 'In progress' : 'Unopened'});
    }
  });
  return {success:true, receipts:Array.from(receipts.values()), bundles:bundles};
}
