const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/browser-loader');

test('Fmt formats numbers, currency, and dates', () => {
  const { window } = loadScripts(['js/format.js']);
  const Fmt = window.Fmt;

  assert.equal(Fmt.formatValue(1200, 'currency'), '$1,200');
  assert.equal(Fmt.formatValue(12345, 'number'), '12,345');
  assert.equal(Fmt.formatValue(1200, 'integer'), '1200');
  assert.equal(Fmt.formatValue('', 'number'), '—');
  assert.match(Fmt.formatDate('2026-08-05'), /2026/);
});

test('Fmt badge tone maps known values and handles unknown values', () => {
  const { window } = loadScripts(['js/format.js']);
  const Fmt = window.Fmt;

  assert.equal(Fmt.badgeTone('Active'), 'good');
  assert.equal(Fmt.badgeTone('Frozen'), 'bad');

  const unknown = Fmt.badgeTone('custom-status');
  assert.ok(['info', 'accent', 'warn', 'good', 'muted'].includes(unknown));
});

test('Fmt CSV escapes commas, quotes, and newlines', () => {
  const { window } = loadScripts(['js/format.js']);
  const Fmt = window.Fmt;

  const columns = [
    { field: 'a', label: 'A' },
    { field: 'b', label: 'B' }
  ];
  const rows = [
    { a: 'hello,world', b: '"quoted"' },
    { a: 'line1\nline2', b: 42 }
  ];

  const csv = Fmt.toCSV(columns, rows);
  assert.match(csv, /^A,B\n/);
  assert.match(csv, /"hello,world"/);
  assert.match(csv, /"""quoted"""/);
  assert.match(csv, /"line1\nline2"/);
});
