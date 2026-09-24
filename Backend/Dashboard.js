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
function createDashboardSession_(employeeId, fullName) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(
    'dashboard:' + token,
    JSON.stringify({ id: String(employeeId), name: fullName }),
    21600
  );
  return token;
}
function revokeDashboardSession(token) {
  if (/^[a-f0-9-]{72}$/i.test(String(token || '')))
    CacheService.getScriptCache().remove('dashboard:' + token);
  return { success: true };
}
function dashboardEmployee_(token) {
  const error = 'Dashboard session expired or account changed. Please sign out and sign in again.';
  if (!/^[a-f0-9-]{72}$/i.test(String(token || ''))) throw new Error(error);
  const cache = CacheService.getScriptCache(),
    raw = cache.get('dashboard:' + token);
  if (!raw) throw new Error(error);
  const saved = JSON.parse(raw);
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
    row[1] + ' ' + row[2] !== saved.name
  ) {
    cache.remove('dashboard:' + token);
    throw new Error(error);
  }
  return {
    id: saved.id,
    name: saved.name,
    firstName: String(row[1]),
    manager: String(row[5]).trim() !== '' && Number.isFinite(Number(row[5])) && Number(row[5]) <= 1,
  };
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
  const categories = ['PINS', 'OTHERS', 'YOURFINDS'].map((name) => ({
    name: name,
    sales: 0,
    units: 0,
  }));
  let exchangeAdjustment = 0;
  const metrics = collectSalesMetrics(rows, period.start, null, null, null, {
    endDate: period.end,
    onIncludedRow: function (row) {
      const category = String(row.category).trim().toUpperCase();
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
  const groups = new Map();
  let incomplete = 0;
  getFullInventory().forEach((item) => {
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
    incomplete: incomplete,
    low: list.filter(
      (g) =>
        g.stock > 0 &&
        (g.category === 'YOURFINDS' ? g.stock < 5 : g.threshold > 0 && g.stock <= g.threshold)
    ).length,
    sold: list.filter((g) => g.stock === 0).length,
  };
}
function getDashboard(request) {
  request = request || {};
  const employee = dashboardEmployee_(request.token),
    now = new Date(),
    tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    period = dashboardPeriod_(request, employee, today);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SALES_LOG);
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
function saveDashboardTask(request) {
  request = request || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const employee = dashboardEmployee_(request.token),
      input = request.task || {},
      id = String(input.id || '');
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
    const task = employee.manager
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
      employee.manager &&
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
