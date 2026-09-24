const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.join(__dirname, '..');
function harness() {
  const employees = [
    ['id', 'first', 'last', 'pin', 'role', 'access', 'active'],
    ['m', 'Mia', 'Manager', '1234', 'Manager', 1, true],
    ['a', 'Ana', 'Cashier', '2222', 'Cashier', 2, true],
    ['b', 'Bea', 'Cashier', '3333', 'Cashier', 2, true],
  ];
  const sales = [Array(21).fill('')],
    cache = new Map(),
    sheets = new Map();
  let locked = false,
    releases = 0,
    inventory = [];
  function sheet(rows) {
    return {
      rows,
      getLastRow: () => rows.length,
      getLastColumn: () => Math.max(...rows.map((r) => r.length)),
      getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
      getRange: (r, c, h = 1, w = 1) => ({
        getValues: () =>
          Array.from({ length: h }, (_, i) =>
            Array.from({ length: w }, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? '')
          ),
        setValues(values) {
          for (let i = 0; i < h; i++) {
            rows[r - 1 + i] ??= [];
            for (let j = 0; j < w; j++) {
              let v = values[i][j];
              if (typeof v === 'string' && v.startsWith("'")) v = v.slice(1);
              rows[r - 1 + i][c - 1 + j] = v;
            }
          }
        },
      }),
      deleteRow: (r) => rows.splice(r - 1, 1),
    };
  }
  sheets.set('Employees', sheet(employees));
  sheets.set('Sales Log', sheet(sales));
  const c = vm.createContext({
    console,
    Date,
    Set,
    Map,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n) => sheets.get(n),
        insertSheet: (n) => {
          assert.equal(locked, true);
          const s = sheet([]);
          sheets.set(n, s);
          return s;
        },
      }),
    },
    Session: { getScriptTimeZone: () => 'Asia/Manila' },
    Utilities: {
      getUuid: randomUUID,
      formatDate(d, tz, fmt) {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          hourCycle: 'h23',
          minute: '2-digit',
          second: '2-digit',
        }).formatToParts(new Date(d));
        const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
        const day = `${p.year}-${p.month}-${p.day}`;
        return fmt === 'yyyy-MM-dd'
          ? day
          : fmt === 'HH'
            ? p.hour
            : fmt === 'MM/dd/yyyy'
              ? `${p.month}/${p.day}/${p.year}`
              : `${day} ${p.hour}:${p.minute}:${p.second}`;
      },
    },
    CacheService: {
      getScriptCache: () => ({
        put: (k, v) => cache.set(k, v),
        get: (k) => cache.get(k),
        remove: (k) => cache.delete(k),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() {
          assert.equal(locked, false);
          locked = true;
        },
        releaseLock() {
          locked = false;
          releases++;
        },
      }),
    },
    getFullInventory: () => inventory,
    roundToTwo: (n) => Math.round((n + Number.EPSILON) * 100) / 100,
    toProperCase: (s) => String(s),
  });
  for (const file of ['Constants.js', 'ReportHelpers.js', 'Employee.js', 'Dashboard.js'])
    vm.runInContext(fs.readFileSync(path.join(root, 'Backend', file), 'utf8'), c);
  const manager = c.verifyEmployee('Mia Manager', '1234').dashboardToken,
    ana = c.verifyEmployee('Ana Cashier', '2222').dashboardToken,
    bea = c.verifyEmployee('Bea Cashier', '3333').dashboardToken;
  return {
    c,
    employees,
    sales,
    cache,
    sheets,
    manager,
    ana,
    bea,
    state: () => ({ locked, releases }),
    setInventory: (x) => (inventory = x),
  };
}
function sale({
  date = '2026-09-24T02:00:00Z',
  receipt = 'R1',
  cashier = 'Ana Cashier',
  code = 'P1',
  name = 'Pin',
  size = '',
  category = 'PINS',
  qty = 1,
  net = 100,
  status = 'COMPLETED',
  reason = '',
} = {}) {
  const r = Array(21).fill('');
  Object.assign(r, {
    0: date,
    1: receipt,
    2: cashier,
    3: code,
    4: name,
    5: size,
    6: category,
    7: qty,
    8: 100,
    12: net,
    13: 'Cash',
    15: status,
    19: reason,
  });
  return r;
}
const period = { start: '2026-09-24', end: '2026-09-24' };
function task(fields = {}) {
  return {
    title: 'Restock display',
    instructions: 'Check sizes',
    assignee: '',
    priority: 'Normal',
    due: '',
    status: 'Open',
    ...fields,
  };
}
test('successful login issues distinct dashboard sessions; forged, revoked, expired and inactive sessions fail', () => {
  const h = harness(),
    { c } = h;
  assert.notEqual(h.ana, h.bea);
  assert.equal(c.dashboardEmployee_(h.ana).id, 'a');
  assert.throws(() => c.dashboardEmployee_('forged'), /sign out/);
  c.revokeDashboardSession(h.ana);
  assert.throws(() => c.dashboardEmployee_(h.ana), /expired/);
  h.cache.delete('dashboard:' + h.bea);
  assert.throws(() => c.dashboardEmployee_(h.bea), /expired/);
  h.employees[1][6] = false;
  assert.throws(() => c.dashboardEmployee_(h.manager), /expired/);
});
test('demotion is reread and cannot authorize dates or task creation', () => {
  const h = harness();
  h.employees[1][5] = 2;
  const e = h.c.dashboardEmployee_(h.manager);
  assert.equal(e.manager, false);
  assert.throws(
    () => h.c.dashboardPeriod_({ start: '2026-09-23', end: '2026-09-23' }, e, '2026-09-24'),
    /today only/
  );
  assert.throws(() => h.c.saveDashboardTask({ token: h.manager, task: task() }), /Only managers/);
  assert.equal(h.sheets.has('Dashboard Tasks'), false);
});
test('dates reject rollover, reverse, future and 367 days; cashier uses server today including midnight', () => {
  const { c } = harness();
  for (const d of ['2026-02-29', '2026-13-01', 'bad', '2026-9-01'])
    assert.throws(() => c.dashboardDate_(d), /date/);
  for (const p of [
    { start: '2026-09-24', end: '2026-09-23' },
    { start: '2026-09-24', end: '2026-09-25' },
    { start: '2025-09-23', end: '2026-09-24' },
  ])
    assert.throws(() => c.dashboardPeriod_(p, { manager: true }, '2026-09-24'), /period/);
  assert.equal(
    c.dashboardPeriod_({ start: '2025-09-24', end: '2026-09-24' }, { manager: true }, '2026-09-24')
      .days,
    366
  );
  assert.throws(
    () => c.dashboardPeriod_({ ...period, compare: true }, { manager: false }, '2026-09-24'),
    /today only/
  );
  const today = c.Utilities.formatDate(
    new Date('2026-09-24T16:00:00Z'),
    'Asia/Manila',
    'yyyy-MM-dd'
  );
  assert.equal(today, '2026-09-25');
  assert.throws(() => c.dashboardPeriod_(period, { manager: false }, today), /today only/);
  assert.equal(c.dashboardPeriod_({}, { manager: false }, today).start, today);
});
test('dashboard equals daily report for distinct receipts, voids and cross-date exchanges; shift behavior preserved', () => {
  const { c, sales } = harness();
  sales.push(
    sale(),
    sale({ code: 'P2', net: 50 }),
    sale({ status: 'VOIDED', net: 999 }),
    sale({
      date: '2026-09-23T01:00:00Z',
      receipt: 'EX1',
      reason: 'EXCHANGE RETURN',
      qty: -1,
      net: -200,
    }),
    sale({ receipt: 'EX1', reason: 'EXCHANGE REPLACEMENT', net: 120 })
  );
  const report = c.collectSalesMetrics(sales, period.start),
    a = c.dashboardAnalytics_(sales, period, { manager: true });
  assert.equal(a.netSales, 70);
  assert.equal(a.netSales, report.totalSales);
  assert.equal(a.units, report.itemsCount);
  assert.equal(a.units, 3);
  assert.equal(a.transactions, 2);
  assert.equal(a.average, 35);
  assert.equal(a.exchangeAdjustment, -80);
  assert.equal(a.activity.find((x) => x.label === '10:00').sales, 70);
  assert.equal(c.collectSalesMetrics(sales, '2026-09-23').totalSales, 0);
  assert.equal(
    c.collectSalesMetrics(sales, period.start, 'Ana Cashier', '2026-09-24T03:00:00Z').totalSales,
    0
  );
});
test('range keeps globally distinct receipts and daily activity, groups YF names within category', () => {
  const { c, sales } = harness();
  sales.push(
    sale({ category: 'YourFinds', name: ' Shirt ', code: 'YF1', size: 'M' }),
    sale({
      category: 'YOURFINDS',
      name: 'shirt',
      code: 'YF2',
      size: 'M',
      date: '2026-09-23T02:00:00Z',
    }),
    sale({ category: 'OTHERS', name: 'shirt', receipt: 'R2' })
  );
  const a = c.dashboardAnalytics_(
    sales,
    { start: '2026-09-23', end: '2026-09-24' },
    { manager: true }
  );
  assert.equal(a.products.length, 2);
  assert.equal(a.products.find((p) => p.category === 'YOURFINDS').units, 2);
  assert.equal(a.sizes[0].units, 2);
  assert.equal(a.transactions, 2);
  assert.equal(a.activity.length, 2);
});
test('leaderboard shared ranks exclude empty receipts and redact other cashier amounts', () => {
  const { c, sales } = harness();
  sales.push(
    sale(),
    sale({ receipt: 'R2', cashier: 'Bea Cashier' }),
    sale({ receipt: '', cashier: 'Nobody', net: 1 })
  );
  const a = c.dashboardAnalytics_(sales, period, { name: 'Ana Cashier', manager: false });
  assert.equal(a.leaderboard.length, 2);
  assert.deepEqual(
    Array.from(a.leaderboard, (x) => x.rank),
    [1, 1]
  );
  assert.equal(a.leaderboard[0].sales, 100);
  assert.deepEqual(Object.keys(a.leaderboard[1]).sort(), ['name', 'own', 'rank']);
});
test('empty metrics have zero averages and negative totals never become positive shares', () => {
  const { c, sales } = harness();
  assert.equal(c.dashboardAnalytics_(sales, period, {}).average, 0);
  sales.push(sale({ net: -50 }), sale({ category: 'OTHERS', net: 100 }));
  const a = c.dashboardAnalytics_(sales, period, {});
  assert.equal(a.categories[0].share, 0);
  assert.equal(a.categories[1].share, 100);
  assert.equal(a.netSales, 50);
});
test('inventory reminders match frontend grouping and YF threshold, preserve unfinished stock and exclude returns', () => {
  const h = harness(),
    items = [
      { category: 'YOURFINDS', size: 'M', stock: 3, status: 'INCOMPLETE' },
      { category: 'YOURFINDS', size: 'm', stock: 1, status: 'ACTIVE' },
      { category: 'YOURFINDS', size: 'L', stock: 5 },
      { category: 'PINS', name: 'Red', stock: 1, lowStockAt: 2 },
      { category: 'PINS', name: ' red ', stock: 1, status: 'INACTIVE', lowStockAt: 2 },
      { category: 'OTHERS', name: 'Bag', stock: 3, status: 'RETURNED' },
    ];
  h.setInventory(items);
  const counts = h.c.dashboardInventory_();
  assert.equal(counts.incomplete, 1);
  assert.equal(counts.low, 2);
  assert.equal(counts.sold, 1);
  const front = vm.createContext({});
  vm.runInContext(
    fs
      .readFileSync(path.join(root, 'Frontend/Pages/InventoryPage.html'), 'utf8')
      .match(/<script>([\s\S]*?)<\/script>/)[1],
    front
  );
  const groups = front.buildInventorySummaryGroups(items);
  assert.equal(counts.low, groups.filter((g) => g.status === 'LOW STOCK').length);
  assert.equal(counts.sold, groups.filter((g) => g.status === 'SOLD OUT').length);
});
test('task sheet is created only after authorized valid input; validates existing headers', () => {
  const h = harness();
  assert.deepEqual(Array.from(h.c.dashboardReadTasks_({ id: 'a' })), []);
  assert.throws(
    () => h.c.saveDashboardTask({ token: h.manager, task: task({ title: '' }) }),
    /text/
  );
  assert.equal(h.sheets.has('Dashboard Tasks'), false);
  h.c.saveDashboardTask({ token: h.manager, task: task() });
  const s = h.sheets.get('Dashboard Tasks');
  assert.equal(s.rows.length, 2);
  s.rows[0][1] = 'Wrong';
  assert.throws(() => h.c.dashboardReadTasks_({ manager: true }), /headers/);
  assert.equal(h.state().locked, false);
});
test('private tasks cannot be read or changed by another cashier, including direct calls', () => {
  const h = harness(),
    c = h.c;
  c.saveDashboardTask({ token: h.manager, task: task({ assignee: 'a' }) });
  const t = c.dashboardReadTasks_({ id: 'a' })[0];
  assert.equal(c.dashboardReadTasks_({ id: 'b' }).length, 0);
  assert.throws(
    () =>
      c.saveDashboardTask({ token: h.bea, task: { id: t.id, version: t.version, status: 'Done' } }),
    /cannot access/
  );
  assert.throws(
    () => c.saveDashboardTask({ token: h.ana, task: { ...t, title: 'Forged', status: 'Done' } }),
    /only change task status/
  );
  assert.throws(
    () => c.saveDashboardTask({ token: h.ana, task: t, remove: true }),
    /Only managers/
  );
  assert.equal(h.state().locked, false);
});
test('shared task completes once, records actor/time, rejects stale edits and clears completion on reopen', () => {
  const h = harness(),
    c = h.c;
  c.saveDashboardTask({ token: h.manager, task: task() });
  let t = c.dashboardReadTasks_({ id: 'a' })[0];
  c.saveDashboardTask({ token: h.ana, task: { id: t.id, version: 1, status: 'Done' } });
  assert.throws(
    () => c.saveDashboardTask({ token: h.bea, task: { id: t.id, version: 1, status: 'Done' } }),
    /changed by another/
  );
  t = c.dashboardReadTasks_({ id: 'b' })[0];
  assert.equal(t.version, 2);
  assert.equal(t.completedBy, 'Ana Cashier');
  assert.match(t.completedAt, /Z$/);
  c.saveDashboardTask({ token: h.bea, task: { id: t.id, version: 2, status: 'Done' } });
  assert.equal(c.dashboardReadTasks_({ id: 'b' })[0].completedBy, 'Ana Cashier');
  c.saveDashboardTask({ token: h.bea, task: { id: t.id, version: 3, status: 'Open' } });
  t = c.dashboardReadTasks_({ id: 'b' })[0];
  assert.equal(t.completedBy, '');
  assert.equal(t.completedAt, '');
  c.saveDashboardTask({ token: h.manager, task: t, remove: true });
  assert.equal(c.dashboardReadTasks_({ manager: true }).length, 0);
  assert.equal(h.state().locked, false);
});
test('task fields validate lengths, priority, status, due date, active assignee and store formula-looking text literally', () => {
  const h = harness();
  for (const fields of [
    { title: 'x'.repeat(121) },
    { instructions: 'x'.repeat(2001) },
    { priority: 'Urgent' },
    { status: 'Deleted' },
    { due: '2026-02-30' },
    { assignee: 'unknown' },
  ])
    assert.throws(() => h.c.saveDashboardTask({ token: h.manager, task: task(fields) }));
  h.c.saveDashboardTask({
    token: h.manager,
    task: task({ title: '=IMPORTXML("example")', instructions: '<script>alert(1)</script>' }),
  });
  const t = h.c.dashboardReadTasks_({ manager: true })[0];
  assert.equal(t.title, '=IMPORTXML("example")');
  assert.equal(t.instructions, '<script>alert(1)</script>');
  assert.equal(h.state().locked, false);
});
test('public analytics uses store today, zero comparison baseline is null, cashier response has no employees', () => {
  const h = harness();
  const d = h.c.getDashboard({ token: h.manager, compare: true });
  assert.equal(d.comparison.percent, null);
  assert.equal(d.analytics.netSales, 0);
  assert.equal(d.employees.length, 3);
  const cashier = h.c.getDashboard({ token: h.ana, manager: true, employeeName: 'Mia Manager' });
  assert.equal(cashier.employee.manager, false);
  assert.equal(cashier.employees.length, 0);
  assert.equal(cashier.period.start, cashier.today);
});
function frontend() {
  const elements = new Map(),
    calls = [];
  const el = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: '',
        innerHTML: '',
        textContent: '',
        hidden: false,
        checked: false,
        close() {
          this.open = false;
        },
        reset() {},
        showModal() {
          this.open = true;
        },
      });
    return elements.get(id);
  };
  const c = vm.createContext({
    currentEmployee: { dashboardToken: 'token-a' },
    document: { getElementById: el },
    google: {
      script: {
        get run() {
          let success, failure;
          return {
            withSuccessHandler(fn) {
              success = fn;
              return this;
            },
            withFailureHandler(fn) {
              failure = fn;
              return this;
            },
            getDashboard(request) {
              calls.push({ success, failure, request });
            },
            saveDashboardTask(request) {
              calls.push({ success, failure, request });
            },
          };
        },
      },
    },
  });
  vm.runInContext(
    fs
      .readFileSync(path.join(root, 'Frontend/Pages/DashboardPage.html'), 'utf8')
      .match(/<script>([\s\S]*?)<\/script>/)[1],
    c
  );
  return { c, el, calls };
}
test('late dashboard response from logout/account switch is ignored and private editor state cleared', () => {
  const { c, el, calls } = frontend();
  c.loadDashboardPage();
  el('dashboardContent').innerHTML = 'private';
  el('dashboardTaskTitle').value = 'private';
  c.clearDashboardState();
  c.currentEmployee = { dashboardToken: 'token-b' };
  calls[0].success({ employee: { manager: true } });
  assert.equal(c.dashboardData, null);
  assert.equal(el('dashboardContent').innerHTML, '');
  assert.equal(el('dashboardDates').hidden, true);
  assert.equal(el('dashboardTaskAssignee').innerHTML, '');
});
test('latest dashboard request wins, missing token prompts login, task text is escaped', () => {
  const { c, el, calls } = frontend();
  c.loadDashboardPage();
  c.loadDashboardPage();
  calls[0].failure({ message: 'old error' });
  assert.equal(el('dashboardStatus').textContent, 'Loading your store…');
  calls[1].failure({ message: 'Session expired' });
  assert.equal(el('dashboardStatus').textContent, 'Session expired');
  c.currentEmployee = {};
  c.loadDashboardPage();
  assert.match(el('dashboardStatus').textContent, /sign out/);
  assert.equal(c.dashboardEscape('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
});
