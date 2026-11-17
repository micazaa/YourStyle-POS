// All public dashboard endpoints authenticate against the current employee record.
const DASHBOARD_TASK_HEADERS = [
  'ID',
  'Title',
  'Instructions',
  'Assigned Employee ID',
  'Priority',
  'Due Date',
  'Status',
  'Created By',
  'Created At',
  'Updated At',
  'Completed By',
  'Completed At',
  'Version',
];
const ACCOUNT_SESSION_SECONDS = 21600;
const ACCOUNT_SESSION_EXPIRED_MESSAGE = 'Dashboard session expired or account changed. Please sign out and sign in again.';
function createDashboardSession_(employeeId, fullName, fingerprint) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(
    'dashboard:' + token,
    JSON.stringify({ id: String(employeeId), name: fullName, fingerprint:fingerprint, expiresAt: new Date().getTime() + ACCOUNT_SESSION_SECONDS * 1000 }),
    ACCOUNT_SESSION_SECONDS
  );
  return token;
}
function revokeDashboardSession(token) {
  if (/^[a-f0-9-]{72}$/i.test(String(token || '')))
    CacheService.getScriptCache().remove('dashboard:' + token);
  return { success: true };
}
function dashboardEmployee_(token) {
  // The gateway has already checked this account against the sheet in this execution.
  if (ACCESS_REQUEST_CONTEXT_ && ACCESS_REQUEST_CONTEXT_.sessionToken === token && ACCESS_REQUEST_CONTEXT_.actor)
    return ACCESS_REQUEST_CONTEXT_.actor;
  const error = ACCOUNT_SESSION_EXPIRED_MESSAGE;
  if (!/^[a-f0-9-]{72}$/i.test(String(token || ''))) throw new Error(error);
  const cache = CacheService.getScriptCache(),
    raw = cache.get('dashboard:' + token);
  if (!raw) throw new Error(error);
  const saved = JSON.parse(raw);
  if (saved.expiresAt && new Date().getTime() >= Number(saved.expiresAt)) {
    cache.remove('dashboard:' + token);
    throw new Error(error);
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EMPLOYEES);
  const row =
    sheet &&
    sheet
      .getDataRange()
      .getValues()
      .slice(1)
      .find((r) => String(r[0]) === saved.id);
  if (
    !row ||
    String(row[6]).trim().toUpperCase() !== 'TRUE' ||
    row[1] + ' ' + row[2] !== saved.name ||
    saved.fingerprint !== employeeAuthFingerprint_(row)
  ) {
    cache.remove('dashboard:' + token);
    throw new Error(error);
  }
  return {
    id: saved.id,
    name: saved.name,
    firstName: String(row[1]),
    cashierReportId: String(saved.cashierReportId || ''),
    role: employeeRoleKey_({role:row[4]}),
    accessLevel: row[5],
    expiresAt: Number(saved.expiresAt) || 0,
    manager: employeeHasManagerView_({role:row[4], accessLevel:row[5]}),
    requiresManagerPin: employeeIsOic_({role:row[4]}),
  };
}
function getAccountSessionStatus(token) {
  try {
    const employee = dashboardEmployee_(token);
    return {success: true, active: true, expiresAt: employee.expiresAt, inventoryVersion:inventoryReadVersion_()};
  } catch (error) {
    if (error.message === ACCOUNT_SESSION_EXPIRED_MESSAGE) return {success: true, active: false};
    throw error;
  }
}
function dashboardDate_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01')
    throw new Error('Use a valid date (YYYY-MM-DD).');
  const date = new Date(value + 'T00:00:00Z');
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('Use a valid calendar date.');
  return value;
}
function dashboardDayOffset_(date, days) {
  return new Date(new Date(date + 'T00:00:00Z').getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
function dashboardPeriod_(request, employee, today) {
  const start = dashboardDate_(request.start || today),
    end = dashboardDate_(request.end || today);
  const days = (new Date(end) - new Date(start)) / 86400000 + 1;
  if (days < 1 || days > 366 || end > today)
    throw new Error('Choose an ordered period of up to 366 days, ending no later than today.');
  if (!employee.manager && (start !== today || end !== today || request.compare))
    throw new Error(
      'Cashiers can view today only. Your permissions may have changed; refresh or sign in again.'
    );
  return { start: start, end: end, days: days };
}
function dashboardAnalytics_(rows, period, employee) {
  const products = new Map(),
    sizes = new Map(),
    activity = new Map();
  const hourly = period.start === period.end;
  if (hourly) for (let h = 0; h < 24; h++) activity.set(String(h).padStart(2, '0') + ':00', 0);
  else
    for (let d = period.start; d <= period.end; d = dashboardDayOffset_(d, 1)) activity.set(d, 0);
  const categories = ['PINS', 'OTHERS', 'WHOLESALE', 'YOURFINDS'].map((name) => ({
    name: name,
    sales: 0,
    units: 0,
  }));
  let exchangeAdjustment = 0;
  const metrics = collectSalesMetrics(rows, period.start, null, null, null, {
    endDate: period.end,
    onIncludedRow: function (row) {
      const category = String(normalizeInventoryCategoryValue_(row.category)).trim().toUpperCase();
      const cat = categories.find((c) => c.name === category) || categories[1];
      cat.sales += row.sales;
      cat.units += row.units;
      const name = String(row.name).trim().replace(/\s+/g, ' ') || 'Unnamed item';
      const key = JSON.stringify([cat.name, name.toUpperCase()]);
      if (!products.has(key))
        products.set(key, { name: name, category: cat.name, sales: 0, units: 0 });
      const product = products.get(key);
      product.sales += row.sales;
      product.units += row.units;
      if (cat.name === 'YOURFINDS') {
        const size = row.size || 'Unspecified size';
        if (!sizes.has(size)) sizes.set(size, { name: size, sales: 0, units: 0 });
        sizes.get(size).sales += row.sales;
        sizes.get(size).units += row.units;
      }
      const bucket = hourly
        ? Utilities.formatDate(row.timestamp, Session.getScriptTimeZone(), 'HH') + ':00'
        : row.date;
      activity.set(bucket, (activity.get(bucket) || 0) + row.sales);
      if (row.exchange) exchangeAdjustment += row.sales;
    },
  });
  const positiveTotal = categories.reduce((sum, c) => sum + Math.max(0, c.sales), 0);
  categories.forEach((c) => {
    c.sales = roundToTwo(c.sales);
    c.share = positiveTotal > 0 ? (Math.max(0, c.sales) / positiveTotal) * 100 : 0;
  });
  const ranking = Object.keys(metrics.byCashier)
    .filter((name) => metrics.byCashier[name].transactions > 0)
    .map((name) => ({ name: name, ...metrics.byCashier[name] }))
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
  let rank = 0;
  const leaderboard = ranking.map((row, index) => {
    if (!index || row.sales !== ranking[index - 1].sales) rank = index + 1;
    const own = row.name === employee.name;
    return employee.manager || own
      ? {
          name: row.name,
          rank: rank,
          own: own,
          sales: row.sales,
          units: row.items,
          transactions: row.transactions,
        }
      : { name: row.name, rank: rank, own: false };
  });
  return {
    netSales: metrics.totalSales,
    units: metrics.itemsCount,
    transactions: metrics.transactionCount,
    average: metrics.transactionCount
      ? roundToTwo(metrics.totalSales / metrics.transactionCount)
      : 0,
    exchangeAdjustment: roundToTwo(exchangeAdjustment),
    categories: categories,
    products: Array.from(products.values()),
    sizes: Array.from(sizes.values()),
    activity: Array.from(activity, ([label, sales]) => ({
      label: label,
      sales: roundToTwo(sales),
    })),
    leaderboard: leaderboard,
  };
}
function dashboardInventory_() {
  const summary = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(POS_SUMMARY_SHEET);
  if (summary && summary.getRange('H1').getDisplayValue() === 'Category') {
    const rows = summary.getLastRow()>1 ? summary.getRange(2,8,summary.getLastRow()-1,5).getValues().filter(row=>row[0]) : [];
    return {stock:rows.reduce((total,row)=>total+(Number(row[2])||0),0),incomplete:rows.reduce((total,row)=>total+(Number(row[4])||0),0),low:rows.filter(row=>row[0]!=='YOURFINDS'&&Number(row[2])>0&&Number(row[3])>0&&Number(row[2])<=Number(row[3])).length,sold:rows.filter(row=>Number(row[2])===0).length};
  }
  const groups = new Map();
  let incomplete = 0;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.INVENTORY);
  const thresholds = new Map();
  const master = ss.getSheetByName(SHEETS.PRODUCT_MASTER);
  if (master && master.getLastRow() > 1) master.getRange(2,1,master.getLastRow()-1,7).getValues().forEach(row=>thresholds.set(String(row[0]),Number(row[6])||0));
  const rows = sheet && sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,INVENTORY_COLUMN_COUNT).getValues() : [];
  rows.filter(row=>row[INV_IDX.CODE] || row[INV_IDX.DESCRIPTION]).map(row=>({category:row[INV_IDX.CATEGORY],size:row[INV_IDX.SIZE],name:row[INV_IDX.DESCRIPTION],status:row[INV_IDX.STATUS],stock:row[INV_IDX.STOCK],lowStockAt:thresholds.get(String(row[INV_IDX.CODE]))||0})).forEach((item) => {
    const category = String(item.category || 'OTHERS')
      .trim()
      .toUpperCase();
    const name = String(
      category === 'YOURFINDS' ? item.size || 'Unspecified size' : item.name || 'Unnamed item'
    )
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
    const status = String(item.status || '')
      .trim()
      .toUpperCase();
    if (category === 'YOURFINDS' && status === 'INCOMPLETE') incomplete++;
    const key = JSON.stringify([category, name]);
    if (!groups.has(key)) groups.set(key, { category: category, stock: 0, threshold: 0 });
    const group = groups.get(key);
    if (status !== 'RETURNED') group.stock += Math.max(0, Number(item.stock) || 0);
    group.threshold = Math.max(group.threshold, Number(item.lowStockAt) || 0);
  });
  const list = Array.from(groups.values());
  return {
    stock: list.reduce((total, group) => total + group.stock, 0),
    incomplete: incomplete,
    low: list.filter(
      (g) =>
        g.stock > 0 &&
        g.category !== 'YOURFINDS' && g.threshold > 0 && g.stock <= g.threshold
    ).length,
    sold: list.filter((g) => g.stock === 0).length,
  };
}

function readDashboardCache_(cache, key) {
  try {
    const raw = cache.get(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry.dashboardChunks) return entry;
    const chunks = cache.getAll(entry.dashboardChunks);
    return entry.dashboardChunks.every(name => chunks[name] != null)
      ? JSON.parse(entry.dashboardChunks.map(name => chunks[name]).join('')) : null;
  } catch (error) { return null; }
}

const DASHBOARD_CACHE_SECONDS_ = 120;

function cacheDashboardResponse_(cache, key, data, version, seconds = DASHBOARD_CACHE_SECONDS_) {
  try {
    if (inventoryReadVersion_() !== version) return;
    const raw = JSON.stringify(data);
    if (raw.length <= 20000) {
      cache.put(key, raw, seconds);
      return;
    }
    const prefix = key + ':' + Utilities.getUuid() + ':';
    const chunks = raw.match(/[\s\S]{1,20000}/gu);
    if (chunks.length > 100) return;
    const keys = chunks.map((_, index) => prefix + index);
    cache.putAll(Object.fromEntries(keys.map((name, index) => [name,chunks[index]])), seconds);
    cache.put(key, JSON.stringify({dashboardChunks:keys}), seconds);
  } catch (error) { console.warn('Dashboard cache write unavailable.'); }
}

function getDashboardPage(request) {
  assertAppRequest_();
  const overview = getDashboardOverview(request);
  try {
    return {overview,sales:getDashboardSales(request)};
  } catch (error) {
    console.warn('Dashboard sales read unavailable.');
    return {overview,sales:{unavailable:'Couldn’t load sales.',retryable:true}};
  }
}

function getDashboardOverview(request) {
  assertAppRequest_();
  const employee = ACCESS_REQUEST_CONTEXT_.actor;
  if (!employee || !isDashboardEnabled_()) throw new Error('Dashboard overview is unavailable.');
  const start = dashboardDate_(request.start);
  const end = dashboardDate_(request.end);
  if (start > end) throw new Error('Choose a start date before or equal to the end date.');
  const version = inventoryReadVersion_();
  const cache = CacheService.getScriptCache();
  const digest = Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, JSON.stringify([version, start, end])
  ));
  const key = 'dashboard-overview:v13:' + digest;
  const cached = readDashboardCache_(cache,key);
  if (cached) return cached;
  const shared = dashboardOverviewShared_(version, cache);
  const received = new Set(), incomplete = new Set();
  const inPeriod = date => date >= start && date <= end;
  shared.deliveries.forEach(({id,date,status}) => {
    if (inPeriod(date)) received.add(id);
    if (status === DELIVERY_STATUS.PENDING || status === DELIVERY_STATUS.PARTIAL) incomplete.add(id);
  });
  const inventory = shared.inventory;
  const undistributed = shared.deliveryItems.filter(row => row.awaitingDistribution);
  const reminders = {
    incomplete:inventory.items.filter(item => item.status === 'Incomplete').length,
    sold:inventory.items.filter(item => item.status === 'Sold out').length,
    low:inventory.low,
    undistributed:undistributed.reduce((count, row) => count + row.quantity, 0),
  };
  const overview = {
    inventory,
    reminders,
    delivery: {...dashboardReturnSummary_(shared.deliveryItems.filter(record => received.has(record.id)), true), count: received.size, incomplete: incomplete.size},
    returns: dashboardReturnSummary_(shared.returns.filter(record => record.date >= start && record.date <= end)),
  };
  cacheDashboardResponse_(cache,key,overview,version);
  return overview;
}

function dashboardOverviewShared_(version, cache) {
  const key = 'dashboard-overview-shared:v11:' + version;
  const cached = readDashboardCache_(cache,key);
  if (cached) return cached;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const deliveryRows = readDeliveryPageRows_(ss, SHEETS.DELIVERY_LOG, DELIVERY_LOG_COLUMN_COUNT, false);
  const deliveries = deliveryRows.flatMap(row => {
    const id = String(row[DELIVERY_IDX.DELIVERY_ID] || '').trim();
    const type = String(row[DELIVERY_IDX.DELIVERY_TYPE] || '').trim().toUpperCase();
    if (!id || (type !== DELIVERY_TYPE.YOURSTYLE && type !== DELIVERY_TYPE.YOURFINDS && (type || !/^YFD-/i.test(id)))) return [];
    return [{id,date:dashboardOverviewDate_(formatInventoryDateForClient(row[DELIVERY_IDX.DELIVERY_DATE])),
      status:String(row[DELIVERY_IDX.STATUS] || '').trim().toUpperCase()}];
  });
  const returns = getSupplierReturns(false).map(record => ({id:String(record.id || '').trim(),
    date:dashboardOverviewDate_(record.returnDate || record.date),quantity:record.quantity,
    category:record.category,size:record.size,name:record.name,code:record.code})).filter(record => record.id);
  const result = {deliveries,returns,deliveryItems:dashboardDeliveryItemRows_(ss, deliveryRows),inventory:dashboardInventorySummary_(buildDashboardInventoryReport_(version))};
  cacheDashboardResponse_(cache,key,result,version);
  return result;
}

function getDashboardSales(request) {
  assertAppRequest_();
  const employee = ACCESS_REQUEST_CONTEXT_.actor;
  if (!employee || !isDashboardEnabled_()) throw new Error('Dashboard sales are unavailable.');
  const now = new Date(), timezone = Session.getScriptTimeZone();
  const today = Utilities.formatDate(now, timezone, 'yyyy-MM-dd');
  const hour = Number(Utilities.formatDate(now, timezone, 'HH'));
  const start = dashboardDate_(request.start), end = dashboardDate_(request.end);
  if (start > end) throw new Error('Choose a start date before or equal to the end date.');
  if (!employee.manager && (start !== today || end !== today)) return { unavailable: 'Sales history is available to managers and OICs.' };
  if (start > today) return { unavailable: 'Sales will appear when this period begins.' };
  const effectiveEnd = end > today ? today : end;
  if (Date.parse(effectiveEnd) - Date.parse(start) >= 366 * 86400000)
    return {unavailable:'Choose a range of up to 366 days to view sales.'};
  const period = dashboardPeriod_({start, end:effectiveEnd}, employee, today);
  const version = inventoryReadVersion_();
  const key = inventoryResponseCacheKey_(version, 'dashboard-sales-v2', [
    period.start, period.end, period.days === 1 && period.end === today ? hour : null
  ]);
  const cache = CacheService.getScriptCache();
  const cached = readDashboardCache_(cache,key);
  if (cached) return cached;

  const {rows, readAt} = dashboardSalesRows_(version, cache);
  const result = dashboardSalesBreakdown_(rows, period, timezone, period.end === today ? hour + 1 : 24);
  try {
    if (result.items.length) {
      const images = new Map(inventoryListIndex_(version).filter(item => item.code && item.imageUrl)
        .map(item => [item.code.toUpperCase(), item.imageUrl]));
      result.items.forEach(item => {
        const url = images.get(item.code.toUpperCase());
        if (url) item.imageUrl = url;
      });
    }
  } catch (error) { console.warn('Dashboard item photos unavailable.'); }
  if (employee.manager) {
    const priorEnd = dashboardDayOffset_(period.start, -1);
    const priorStart = dashboardDayOffset_(period.start, -period.days);
    const prior = collectSalesMetrics(rows, priorStart, null, null, null, {
      totalsWindow:dashboardSalesWindow_(priorStart, priorEnd, timezone),
    });
    result.previous = {
      start:priorStart, end:priorEnd,
      netSales:prior.totalSales, units:prior.itemsCount, transactions:prior.transactionCount,
    };
  }
  const remaining = DASHBOARD_CACHE_SECONDS_ - Math.floor((Date.now() - readAt) / 1000);
  if (remaining > 0) cacheDashboardResponse_(cache,key,result,version,remaining);
  return result;
}

function dashboardSalesRows_(version, cache) {
  const key = 'dashboard-sales-rows:v1:' + version;
  const saved = readDashboardCache_(cache,key);
  if (saved?.rows) {
    configureSalesLogColumnsFromHeaders_(saved.rows[0]);
    return saved;
  }

  const sheet = getSalesLogSheet_();
  if (!sheet) throw new Error('Sales Log sheet not found.');
  const readAt = Date.now();
  const [header,...source] = sheet.getDataRange().getValues();
  // Keep the live column layout and only the cells used by dashboard reports.
  const fields = [
    'TIMESTAMP','RECEIPT_ID','CODE','ITEM_NAME','SIZE','CATEGORY','QUANTITY',
    'PRICE','DISCOUNT','FEE_ABSORBED','NET_TOTAL','PAYMENT_METHOD','STATUS','REASON',
    'PRICE_SOURCE','PAYMENT_1_METHOD','PAYMENT_1_AMOUNT','PAYMENT_2_METHOD','PAYMENT_2_AMOUNT',
  ].map(field => SALES_IDX[field]);
  const end = Math.max(...fields) + 1;
  const rows = [header];
  for (const row of source) {
    if (String(row[SALES_IDX.STATUS] || '').trim().toUpperCase() !== 'COMPLETED') continue;
    const timestamp = new Date(row[SALES_IDX.TIMESTAMP]).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const compact = Array(end).fill('');
    for (const index of fields) compact[index] = row[index] ?? '';
    compact[SALES_IDX.TIMESTAMP] = timestamp;
    rows.push(compact);
  }
  const snapshot = {rows,readAt};
  cacheDashboardResponse_(cache,key,snapshot,version);
  return snapshot;
}

function dashboardSalesWindow_(start, end, timezone) {
  return [start, dashboardDayOffset_(end, 1)].map(date => Utilities.parseDate(date, timezone, 'yyyy-MM-dd'));
}

function dashboardSalesBreakdown_(rows, period, timezone, hours) {
  const categories = ['YOURFINDS', 'PINS', 'OTHERS', 'WHOLESALE'];
  const hourly = period.days === 1;
  const count = hourly ? hours : period.days;
  const activity = Array.from({length:count}, (_, index) => ({
    start: hourly ? String(index).padStart(2, '0') + ':00' : dashboardDayOffset_(period.start, index),
    end: hourly ? '' : dashboardDayOffset_(period.start, index),
    sales: [0,0,0,0],
    units: [0,0,0,0],
  }));
  const items = new Map();
  const startMs = Date.parse(period.start);
  let absorbedCardFees = 0;
  const metrics = collectSalesMetrics(rows, period.start, null, null, null, {
    endDate: period.end,
    reportingWindow: dashboardSalesWindow_(period.start, period.end, timezone),
    onIncludedRow(row) {
      const category = String(normalizeInventoryCategoryValue_(row.category)).toUpperCase();
      const categoryIndex = categories.indexOf(category);
      const index = categoryIndex < 0 ? 2 : categoryIndex;
      const bucketIndex = hourly
        ? Number(Utilities.formatDate(row.timestamp, timezone, 'HH'))
        : Math.floor((Date.parse(row.date) - startMs) / 86400000);
      const bucket = activity[bucketIndex];
      if (bucket) {
        bucket.sales[index] += row.sales;
        bucket.units[index] += row.units;
      }
      absorbedCardFees += row.feeAbsorbed;
      const code = String(row.code ?? '').trim();
      const label = row.name.replace(/ · SALE$/i, '').trim();
      const itemCategory = categories[index];
      const name = (itemCategory === 'PINS' ? dashboardPinName_(label, row.size) : label) || code || 'Unnamed item';
      const group = itemCategory === 'YOURFINDS' ? dashboardYourFindsReturnSize_(row.size)
        : itemCategory === 'PINS' ? name.match(/\b(NEW|GS|PT)\b/i)?.[0].toUpperCase() || 'Standard' : '';
      const key = JSON.stringify([itemCategory, code.toUpperCase() || name.toUpperCase(), group]);
      if (!items.has(key)) items.set(key, {category:itemCategory, code, name, group, units:0, sales:0});
      const item = items.get(key);
      item.units += row.units;
      item.sales += row.sales;
    },
  });
  activity.forEach(bucket => { bucket.sales = bucket.sales.map(roundToTwo); });
  const payments = Object.entries(metrics.payments).map(([method, value]) => ({method, amount:roundToTwo(value.gross)}));
  return {
    period, hourly, activity, payments, absorbedCardFees:roundToTwo(absorbedCardFees),
    items: Array.from(items.values()).filter(item => item.units > 0).map(item => ({...item,sales:roundToTwo(item.sales)})),
    netSales: metrics.totalSales, units: metrics.itemsCount, transactions: metrics.transactionCount,
  };
}

function dashboardReturnRows_(start, end) {
  return getSupplierReturns(false).filter(record => {
    const date = dashboardOverviewDate_(record.returnDate || record.date);
    return String(record.id || '').trim() && date >= start && date <= end;
  });
}

function dashboardReturnSummary_(records, separateWholesale = false) {
  const groups = [
    {title:'YourFinds · Size', rows:new Map()},
    {title:'YourStyle · Pins', rows:new Map()},
    {title:'YourStyle · Other', rows:new Map()},
    {title:'Wholesale', rows:new Map()},
  ];
  const ids = new Set();
  let items = 0;
  records.forEach(record => {
    ids.add(String(record.id).trim());
    const quantity = Number(record.quantity) || 0;
    items += quantity;
    if (quantity <= 0) return;
    const category = String(record.category || '').trim().toUpperCase();
    const size = String(record.size || '').trim().replace(/\s+/g, ' ').toUpperCase();
    const name = String(record.name || record.code || '').trim().replace(/\s+/g, ' ');
    let group, description;
    if (category === 'YOURFINDS') {
      group = groups[0];
      description = dashboardYourFindsReturnSize_(size);
    } else if (category === 'PINS') {
      group = groups[1];
      description = dashboardPinName_(name, size);
    } else if (separateWholesale && category === 'WHOLESALE') {
      group = groups[3];
      description = name || 'Wholesale';
    } else {
      group = groups[2];
      description = dashboardOtherItemName_(name);
    }
    const key = JSON.stringify([description.toUpperCase(), record.unit || '']);
    if (!group.rows.has(key)) group.rows.set(key, {description:description, quantity:0, ...(record.unit ? {unit:record.unit} : {})});
    group.rows.get(key).quantity += quantity;
  });
  const comparators = [compareDashboardYourFindsSizes_, compareDashboardPins_, compareDashboardOtherItems_];
  const sections = groups.map(({title, rows}, index) => {
    const compare = comparators[index] || ((a,b) => a.localeCompare(b, undefined, {numeric:true,sensitivity:'base'}));
    const sorted = Array.from(rows.values()).sort((a,b) => compare(a.description, b.description));
    return {title:title, rows:sorted};
  }).filter(group => group.rows.length);
  return {count:ids.size, items:items, groups:sections};
}

function dashboardPinName_(name, size) {
  const label = String(name || '').trim().toUpperCase().replace(/\((GS|NEW|PT)\)/g, '$1').replace(/\s+/g, ' ');
  const variant = String(size || '').trim().toUpperCase();
  return ['GS', 'NEW', 'PT'].includes(variant) && !/\b(GS|NEW|PT)\b/.test(label) ? label + ' ' + variant : label;
}

function compareDashboardPins_(a, b) {
  const order = ['GREEN', 'YELLOW', 'BLACK', 'BLUE', 'RED', 'GRAY', 'WHITE', 'GREEN SPECIAL'];
  const rank = name => {
    const label = dashboardPinName_(name);
    const first = /^GREEN SPECIAL\b/.test(label) ? 'GREEN SPECIAL' : label.split(/[^A-Z]+/)[0];
    if (first === 'TAG' || first === 'TAGS') return order.length + 1;
    const index = order.indexOf(first);
    return index < 0 ? order.length : index;
  };
  return rank(a) - rank(b) || a.localeCompare(b, undefined, {numeric:true,sensitivity:'base'});
}

const DASHBOARD_OTHER_ITEM_ORDER = [
  'FLOWERS', 'FREEBIES', 'SUNGLASSES', 'SUNGLASSES 2 FOR 100',
  'ACCESSORIES', 'ACCESSORIES 1 SET', 'ACCESSORIES 3 FOR 100',
  'BAG', 'MYSTERY BAG (A)', 'MYSTERY BAG (B)', 'MYSTERY BAG (C)', 'PAPERBAG',
  'SHOES KIDS', 'BLACK SHOES', 'FLAT SHOES', 'MEN SHOES', 'RUBBER', 'BOOTS', 'HEELS', 'SLIPPERS',
  'WHITE TIES', 'WHITE TIES (NEW)', 'WHITE TIES (GS)',
  'BLACK TIES', 'BLACK TIES (NEW)', 'BLACK TIES (GS)',
  'GREEN TIES', 'GREEN TIES (NEW)', 'GREEN TIES (GS)',
];

function dashboardOtherItemName_(name) {
  const label = String(name || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const ties = /^((?:WHITE|BLACK|GREEN) TIES)\s+\(?(NEW|GS|PT)\)?$/.exec(label);
  if (ties) return ties[1] + ' (' + ties[2] + ')';
  if (DASHBOARD_OTHER_ITEM_ORDER.includes(label)) return label;
  if (/\bBAGS?\b/.test(label)) return 'BAG';
  if (/\bSHOES?\b/.test(label)) return 'SHOES';
  if (/\bACCESSOR(?:Y|IES)\b/.test(label)) return 'ACCESSORIES';
  return label || 'Unspecified item';
}

function compareDashboardOtherItems_(a, b) {
  const rank = name => {
    const label = dashboardOtherItemName_(name);
    const index = DASHBOARD_OTHER_ITEM_ORDER.indexOf(label);
    if (index >= 0) return index;
    const tie = /^(.* TIES) \(.*\)$/.exec(label);
    const base = tie ? DASHBOARD_OTHER_ITEM_ORDER.indexOf(tie[1]) : -1;
    return base < 0 ? DASHBOARD_OTHER_ITEM_ORDER.length : base + 2.5;
  };
  return rank(a) - rank(b) || a.localeCompare(b, undefined, {numeric:true,sensitivity:'base'});
}

function compareDashboardYourFindsSizes_(a, b) {
  const order = ['SE', 'ME', 'LE', 'XLE', 'SNE', 'MNE', 'LNE', 'XLNE', 'BNE', 'NO SIZE'];
  const rank = size => {
    const index = order.indexOf(size === 'NS' ? 'NO SIZE' : size);
    return index < 0 ? order.length : index;
  };
  return rank(a) - rank(b) || a.localeCompare(b, undefined, {numeric:true,sensitivity:'base'});
}

function dashboardYourFindsReturnSize_(size) {
  const label = String(size || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const normalized = normalizeYourFindsSaleSize_(label);
  if (label === 'NO SIZE') return 'NS';
  return normalized === 'CUSTOM' ? label || 'Unspecified size' : normalized;
}

function dashboardOverviewDate_(value) {
  const date = String(value || '').trim();
  const iso = /^(\d{4}-\d{2}-\d{2})(?:$|[ T])/.exec(date);
  if (iso) return iso[1];
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/.exec(date);
  return local ? local[3] + '-' + local[1].padStart(2, '0') + '-' + local[2].padStart(2, '0') : '';
}

function getDashboard(request) {
  assertAppRequest_();
  request = request || {};
  const employee = dashboardEmployee_(request.token),
    now = new Date(),
    tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    period = dashboardPeriod_(request, employee, today);
  const sheet = getSalesLogSheet_();
  if (!sheet) throw new Error('Sales Log sheet not found.');
  const rows = sheet.getDataRange().getValues();
  const analytics = dashboardAnalytics_(rows, period, employee);
  const prior =
    request.compare && employee.manager
      ? {
          start: dashboardDayOffset_(period.start, -period.days),
          end: dashboardDayOffset_(period.start, -1),
        }
      : null;
  const previous = prior ? dashboardAnalytics_(rows, prior, employee) : null;
  return {
    employee: employee,
    today: today,
    hour: Number(Utilities.formatDate(now, tz, 'HH')),
    timezone: tz,
    refreshed: Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss'),
    period: period,
    analytics: analytics,
    comparison: previous
      ? {
          period: prior,
          netSales: previous.netSales,
          change: roundToTwo(analytics.netSales - previous.netSales),
          percent:
            previous.netSales > 0
              ? roundToTwo(((analytics.netSales - previous.netSales) / previous.netSales) * 100)
              : null,
        }
      : null,
    inventory: dashboardInventory_(),
    tasks: dashboardReadTasks_(employee),
    employees: employee.manager
      ? getEmployees().map((e) => ({ id: String(e.id), name: e.fullName }))
      : [],
  };
}
function dashboardTaskSheet_(create) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Dashboard Tasks');
  if (!sheet && create) {
    sheet = ss.insertSheet('Dashboard Tasks');
    sheet.getRange(1, 1, 1, DASHBOARD_TASK_HEADERS.length).setValues([DASHBOARD_TASK_HEADERS]);
  }
  if (sheet) {
    const headers = sheet.getRange(1, 1, 1, DASHBOARD_TASK_HEADERS.length).getValues()[0];
    if (
      headers.some((v, i) => v !== DASHBOARD_TASK_HEADERS[i]) ||
      sheet.getLastColumn() !== DASHBOARD_TASK_HEADERS.length
    )
      throw new Error('Dashboard Tasks headers do not match. Ask a manager to repair the sheet.');
  }
  return sheet;
}
function dashboardTaskFromRow_(r) {
  function text(v) {
    return String(v == null ? '' : v);
  }
  function date(v) {
    return v instanceof Date
      ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : text(v);
  }
  return {
    id: text(r[0]),
    title: text(r[1]),
    instructions: text(r[2]),
    assignee: text(r[3]),
    priority: text(r[4]),
    due: date(r[5]),
    status: text(r[6]),
    createdBy: text(r[7]),
    createdAt: text(r[8]),
    updatedAt: text(r[9]),
    completedBy: text(r[10]),
    completedAt: text(r[11]),
    version: Number(r[12]),
  };
}
function dashboardCanReadTask_(task, employee) {
  return employee.manager || !task.assignee || task.assignee === employee.id;
}
function dashboardReadTasks_(employee) {
  const sheet = dashboardTaskSheet_(false);
  return sheet
    ? sheet
        .getDataRange()
        .getValues()
        .slice(1)
        .filter((r) => r[0])
        .map(dashboardTaskFromRow_)
        .filter((t) => dashboardCanReadTask_(t, employee))
    : [];
}
function dashboardTaskText_(value, max, required) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw new Error('Task text is missing or too long.');
  return value.trim();
}
function dashboardStatusOnlyChange_(request) {
  const task = request && request.task;
  return !!task && !!task.id && !request.remove && typeof task.status === 'string' &&
    Object.keys(task).every(key => ['id','version','status'].includes(key));
}
function saveDashboardTask(request) {
  assertAppRequest_();
  request = request || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const employee = dashboardEmployee_(request.token),
      input = request.task || {},
      id = String(input.id || '');
    const statusOnly = dashboardStatusOnlyChange_(request);
    if (employee.requiresManagerPin && !statusOnly) requireManager_(request.managerPin, request.managerToken);
    if (!id && !employee.manager) throw new Error('Only managers can create tasks.');
    let sheet = dashboardTaskSheet_(false);
    const rows = sheet ? sheet.getDataRange().getValues() : [];
    const index = id ? rows.findIndex((r, i) => i > 0 && String(r[0]) === id) : -1;
    if (id && index < 0) throw new Error('Task no longer exists. Refresh the board.');
    const old = index >= 0 ? dashboardTaskFromRow_(rows[index]) : null;
    if (old && !dashboardCanReadTask_(old, employee))
      throw new Error('You cannot access this task.');
    if (old && input.version !== old.version)
      throw new Error('Task changed by another employee. Refresh the board before editing.');
    if (request.remove) {
      if (!employee.manager || !old) throw new Error('Only managers can delete existing tasks.');
      sheet.deleteRow(index + 1);
      return { success: true };
    }
    if (!['Open', 'In Progress', 'Done'].includes(input.status))
      throw new Error('Invalid task status.');
    if (
      !employee.manager &&
      ['title', 'instructions', 'assignee', 'priority', 'due'].some(
        (k) => Object.prototype.hasOwnProperty.call(input, k) && input[k] !== old[k]
      )
    )
      throw new Error('Cashiers may only change task status.');
    const task = employee.manager && !statusOnly
      ? {
          title: dashboardTaskText_(input.title, 120, true),
          instructions: dashboardTaskText_(input.instructions, 2000, false),
          assignee: dashboardTaskText_(input.assignee, 100, false),
          priority: input.priority,
          due: input.due,
        }
      : old;
    if (!['Normal', 'High'].includes(task.priority)) throw new Error('Invalid task priority.');
    if (typeof task.due !== 'string') throw new Error('Invalid due date.');
    if (task.due) dashboardDate_(task.due);
    if (
      employee.manager && !statusOnly &&
      task.assignee &&
      !getEmployees().some((e) => String(e.id) === task.assignee)
    )
      throw new Error('Choose an active employee or Everyone.');
    const now = new Date().toISOString(),
      completing = input.status === 'Done';
    const completedBy = completing
      ? old && old.status === 'Done'
        ? old.completedBy
        : employee.name
      : '';
    const completedAt = completing ? (old && old.status === 'Done' ? old.completedAt : now) : '';
    const record = [
      id || Utilities.getUuid(),
      task.title,
      task.instructions,
      task.assignee,
      task.priority,
      task.due,
      input.status,
      old ? old.createdBy : employee.name,
      old ? old.createdAt : now,
      now,
      completedBy,
      completedAt,
      old ? old.version + 1 : 1,
    ];
    // Sheets strips the leading apostrophe and stores literal text, never a formula.
    const safe = record.map((v) => (typeof v === 'string' && /^['=+\-@\s]/.test(v) ? "'" + v : v));
    if (!sheet) sheet = dashboardTaskSheet_(true);
    sheet.getRange(old ? index + 1 : sheet.getLastRow() + 1, 1, 1, record.length).setValues([safe]);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function getDashboardInventoryReport(download) {
  assertAppRequest_();
  const actor = ACCESS_REQUEST_CONTEXT_.actor;
  if (!actor || !isDashboardEnabled_()) throw new Error('Dashboard inventory reports are unavailable.');
  const report = buildDashboardInventoryReport_(inventoryReadVersion_());
  if (download === true) return createDashboardInventoryPdf_({...report, preparedBy:actor.name},
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  return dashboardInventorySummary_(report);
}

function dashboardInventorySummary_(report) {
  return {
    snapshot:report.snapshot,
    totals:report.totals,
    stock:Object.values(report.totals).reduce((total, stock) => total + stock, 0),
    low:report.items.filter(item => item.status === 'Low stock').length,
    items:report.items,
  };
}

function buildDashboardInventoryReport_(version) {
  const snapshot = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy h:mm a');
  const totals = {YOURFINDS:0, PINS:0, OTHERS:0, WHOLESALE:0};
  const rows = new Map();
  inventoryListIndex_(version).forEach(item => {
    if (['RETURNED','CONVERTED','INACTIVE','DISABLED','DEACTIVATED'].includes(item.status) ||
        ['INACTIVE','DISABLED','DEACTIVATED'].includes(item.productStatus)) return;
    const category = Object.prototype.hasOwnProperty.call(totals, item.category) ? item.category : 'OTHERS';
    const size = category === 'YOURFINDS' ? dashboardYourFindsReturnSize_(item.size) : '';
    const name = String(item.name || item.code || 'Unspecified item').trim().replace(/\s+/g, ' ').toUpperCase();
    const description = size || (category === 'OTHERS' ? dashboardOtherItemName_(name)
      : category === 'PINS' ? dashboardPinName_(name, item.size) : name);
    const key = JSON.stringify([category, description]);
    if (!rows.has(key)) rows.set(key, {category, codes:new Set(), description, stock:0, threshold:0, incomplete:false});
    const row = rows.get(key);
    if (size || item.code) row.codes.add(size || item.code);
    row.stock += item.stock;
    row.threshold = Math.max(row.threshold, item.lowStockAt);
    row.incomplete = row.incomplete || item.status === 'INCOMPLETE';
  });
  const items = Array.from(rows.values()).map(row => {
    totals[row.category] += row.stock;
    const status = row.stock < 0 ? 'Negative stock' : row.stock === 0 ? 'Sold out'
      : row.threshold > 0 && row.stock <= row.threshold ? 'Low stock' : row.incomplete ? 'Incomplete' : '';
    return {category:row.category, code:Array.from(row.codes).join(', ') || '—', description:row.description, stock:row.stock, status};
  }).sort((a,b) => Object.keys(totals).indexOf(a.category) - Object.keys(totals).indexOf(b.category) ||
    (a.category === 'YOURFINDS' ? compareDashboardYourFindsSizes_(a.description, b.description)
      : a.category === 'PINS' ? compareDashboardPins_(a.description, b.description)
      : a.category === 'OTHERS' ? compareDashboardOtherItems_(a.description, b.description)
      : a.description.localeCompare(b.description, undefined, {numeric:true})));
  return {snapshot, totals, items};
}
