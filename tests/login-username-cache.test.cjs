const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('successful username cache stores five valid recent usernames and renders picker options', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'Frontend/Modals/LoginModal.html'), 'utf8');
  const saved = new Map();
  const list = { children: [], appendChild(option) { this.children.push(option); } };
  Object.defineProperty(list, 'innerHTML', { set() { this.children = []; } });
  const context = vm.createContext({
    localStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
    document: { getElementById: id => id === 'loginUsernameSuggestions' ? list : null, createElement: () => ({}) },
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);

  context.rememberLoginUsername(' Mica1@ys.sys ');
  context.rememberLoginUsername('mica2@ys.sys');
  context.rememberLoginUsername('not a username');

  assert.deepEqual(JSON.parse(saved.get('ys_pos_recent_usernames')), ['mica2@ys.sys', 'mica1@ys.sys']);
  assert.deepEqual(list.children.map(option => option.value), ['mica2@ys.sys', 'mica1@ys.sys']);
});
