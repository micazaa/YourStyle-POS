const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function client() {
  const clock = {now: 1000000}, calls = [], timers = new Map(), storage = new Map(), listeners = {}, elements = {};
  let nextTimer = 0, logouts = 0;
  class ClientDate extends Date { static now() { return clock.now; } }
  function timer(callback, delay, type) { const id = ++nextTimer; timers.set(id, {callback, delay, type}); return id; }
  const c = vm.createContext({Date: ClientDate, console,
    currentEmployee: {dashboardToken: 'token-a', sessionExpiresAt: clock.now + 21600000},
    currentCashier: 'Ana', currentSessionIsCashier: true, currentShiftPettyCash: 1000, currentShiftReportId: 'CR-A', cart: [],
    setTimeout: (fn, delay) => timer(fn, delay, 'timeout'), clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => timer(fn, delay, 'interval'), clearInterval: id => timers.delete(id),
    localStorage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)},
    document: {hidden: false, addEventListener: (name, fn) => { listeners[name] = fn; },
      getElementById: id => elements[id] ||= {style: {}, value: ''}},
    window: {addEventListener: (name, fn) => { listeners[name] = fn; }},
    initializeLogin() {}, clearDashboardState() {}, showNotificationToast() {},
    completeCleanLogout() { logouts++; c.clearSession(); c.currentEmployee = null; },
    google: {script: {get run() {
      const call = {}; calls.push(call);
      const runner = new Proxy({}, {get(_target, key) {
        if (key === 'withSuccessHandler') return fn => {call.success = fn; return runner;};
        if (key === 'withFailureHandler') return fn => {call.failure = fn; return runner;};
        return (...args) => {call.method = key; call.args = args;};
      }});
      return runner;
    }}}
  });
  const source = fs.readFileSync('Frontend/Scripts/AppJS.html', 'utf8');
  vm.runInContext(source.slice(source.indexOf('  var accountSessionWatch'), source.indexOf('  /* ==========================================================\n     FORM PERSISTENCE')), c);
  vm.runInContext(source.slice(source.indexOf('  window.onload'), source.indexOf('  /* ==========================================================\n     FORM AUTO-SAVE')), c);
  return {c, clock, calls, timers, storage, listeners, logouts: () => logouts};
}

test('account expiry signs out automatically, cancels monitoring, and cannot persist a signed-out account', () => {
  const h = client(), {c, clock, timers, storage, calls} = h;
  c.saveSession();
  assert.ok(storage.has('ys_pos_session'));
  assert.equal([...timers.values()].filter(t => t.delay === 60000).length, 1);
  c.saveSession(); assert.equal(timers.size, 2);
  const deadline = [...timers.values()].find(t => t.type === 'timeout');
  clock.now += deadline.delay; deadline.callback();
  assert.equal(h.logouts(), 1); assert.equal(c.currentEmployee, null); assert.equal(storage.has('ys_pos_session'), false);
  assert.equal(timers.size, 0); c.saveSession(); assert.equal(storage.has('ys_pos_session'), false);
  assert.equal(calls.filter(call => call.method === 'saveCashierShiftExit').length, 0);
});

test('revoked sessions auto logout; temporary connection errors keep a valid sign-in and allow retry', () => {
  const h = client(), {c, calls} = h;
  c.startAccountSessionMonitor(); c.checkAccountSession(); c.checkAccountSession();
  assert.equal(calls.length, 1); calls[0].failure(new Error('Offline'));
  assert.equal(h.logouts(), 0);
  c.checkAccountSession(); calls.at(-1).success({success: true, active: false});
  assert.equal(h.logouts(), 1);
});

test('old session responses cannot sign out a newly signed-in account', () => {
  const h = client(), {c, clock, calls, timers} = h;
  c.startAccountSessionMonitor(true); const old = calls.at(-1);
  c.currentEmployee = {dashboardToken: 'token-b', sessionExpiresAt: clock.now + 100000};
  c.startAccountSessionMonitor(); old.success({success: true, active: false});
  assert.equal(h.logouts(), 0); assert.equal(c.currentEmployee.dashboardToken, 'token-b');
  assert.equal(timers.size, 2);
});

test('an already expired restored account returns to login before restoring protected views', () => {
  const h = client(), {c, storage, clock} = h;
  storage.set('ys_pos_session', JSON.stringify({currentEmployee: {dashboardToken: 'old', sessionExpiresAt: clock.now - 1}}));
  c.restoreSession();
  assert.equal(h.logouts(), 1); assert.equal(c.currentEmployee, null); assert.equal(storage.has('ys_pos_session'), false);
});

test('focus and visibility recheck sessions; signing out in another tab signs out this tab too', () => {
  const h = client(), {c, calls, storage, listeners} = h;
  c.window.onload(); c.startAccountSessionMonitor();
  listeners.focus(); calls.at(-1).success({success: true, active: true});
  listeners.visibilitychange(); assert.equal(calls.filter(call => call.method === 'getAccountSessionStatus').length, 2);
  storage.set('ys_pos_session', 'new account');
  listeners.storage({key: 'ys_pos_session', newValue: null}); assert.equal(h.logouts(), 0);
  storage.delete('ys_pos_session');
  listeners.storage({key: 'ys_pos_session', newValue: null}); assert.equal(h.logouts(), 1);
});
