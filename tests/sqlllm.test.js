const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadScripts, APP_ROOT } = require('./helpers/browser-loader');

const schema = JSON.parse(
  fs.readFileSync(path.join(APP_ROOT, 'data/schema.json'), 'utf8')
);

test('SQLLLM generates top-N account query', () => {
  const { window } = loadScripts(['js/sqlllm.js']);
  const out = window.SQLLLM.generate('top 5 accounts by balance', schema);

  assert.equal(out.ok, true);
  assert.match(out.sql, /FROM accounts/i);
  assert.match(out.sql, /ORDER BY Balance DESC/i);
  assert.match(out.sql, /LIMIT 5/i);
  assert.match(out.sql, /FirmId = @firmId/i);
});

test('SQLLLM detects join intent and emits estimate', () => {
  const { window } = loadScripts(['js/sqlllm.js']);
  const out = window.SQLLLM.generate('accounts joined with their holdings', schema);

  assert.equal(out.ok, true);
  assert.equal(out.estimate.isJoin, true);
  assert.ok(Array.isArray(out.estimate.tables));
  assert.ok(out.estimate.tables.length >= 2);
});

test('SQLLLM parses numeric thresholds', () => {
  const { window } = loadScripts(['js/sqlllm.js']);
  const out = window.SQLLLM.generate('accounts over 1m', schema);

  assert.equal(out.ok, true);
  assert.match(out.sql, /Balance\s*>\s*1000000/i);
});
