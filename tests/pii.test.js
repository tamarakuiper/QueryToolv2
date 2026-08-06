const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/browser-loader');

test('PII detects pattern-based categories', () => {
  const { window } = loadScripts(['js/pii.js']);
  const PII = window.PII;

  const res = PII.detect([
    { field: 'ClientName', label: 'Client Name' },
    { field: 'Email', label: 'Email' },
    { field: 'Balance', label: 'Balance' }
  ]);

  assert.equal(res.isPII, true);
  assert.ok(res.categories.includes('Name'));
  assert.ok(res.categories.includes('Email'));
  assert.equal(res.fields.length, 2);
});

test('PII explicit opt-in overrides detection category', () => {
  const { window } = loadScripts(['js/pii.js']);
  const PII = window.PII;

  const res = PII.detect([
    { field: 'CustomField', label: 'Something', pii: true, piiCategory: 'Sensitive' }
  ]);

  assert.equal(res.isPII, true);
  assert.equal(res.categories.length, 1);
  assert.equal(res.categories[0], 'Sensitive');
  assert.equal(res.fields[0].category, 'Sensitive');
});


test('PII maskValue never exposes the original value', () => {
  const { window } = loadScripts(['js/pii.js']);
  const masked = window.PII.maskValue('tamara@example.com');

  assert.equal(masked, '••••••••');
  assert.equal(masked.includes('tamara'), false);
});
