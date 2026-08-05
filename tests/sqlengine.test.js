const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/browser-loader');

function sampleRows() {
  return [
    { FirmId: 101, AccountId: 10001001, Status: 'Active', Balance: 100, AccountName: 'Alpha One' },
    { FirmId: 101, AccountId: 10001002, Status: 'Pending', Balance: 300, AccountName: 'Beta Two' },
    { FirmId: 205, AccountId: 10002001, Status: 'Active', Balance: 200, AccountName: 'Alpha Three' }
  ];
}

test('SQLEngine executes filters, ordering, and limits', () => {
  const { window } = loadScripts(['js/sqlengine.js']);
  const { SQLEngine } = window;

  const result = SQLEngine.execute(
    'SELECT AccountId, Balance FROM accounts WHERE Status = \'Active\' ORDER BY Balance DESC LIMIT 1',
    sampleRows(),
    {}
  );

  assert.equal(result.columns.join(','), 'AccountId,Balance');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].AccountId, 10002001);
});

test('SQLEngine supports IN and LIKE operators', () => {
  const { window } = loadScripts(['js/sqlengine.js']);
  const { SQLEngine } = window;

  const result = SQLEngine.execute(
    'SELECT AccountName FROM accounts WHERE FirmId IN (101, 205) AND AccountName LIKE \'Alpha%\' ORDER BY AccountName ASC',
    sampleRows(),
    {}
  );

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].AccountName, 'Alpha One');
  assert.equal(result.rows[1].AccountName, 'Alpha Three');
});

test('SQLEngine supports aggregates and GROUP BY', () => {
  const { window } = loadScripts(['js/sqlengine.js']);
  const { SQLEngine } = window;

  const result = SQLEngine.execute(
    'SELECT Status, COUNT(*) AS Count, SUM(Balance) AS Total FROM accounts GROUP BY Status ORDER BY Status ASC',
    sampleRows(),
    {}
  );

  assert.equal(result.rows.length, 2);
  const active = result.rows.find((r) => r.Status === 'Active');
  const pending = result.rows.find((r) => r.Status === 'Pending');

  assert.equal(active.Count, 2);
  assert.equal(active.Total, 300);
  assert.equal(pending.Count, 1);
  assert.equal(pending.Total, 300);
});

test('SQLEngine wildcard ANY drops firm predicate', () => {
  const { window } = loadScripts(['js/sqlengine.js']);
  const { SQLEngine } = window;

  const result = SQLEngine.execute(
    'SELECT AccountId FROM accounts WHERE FirmId = @firmId ORDER BY AccountId ASC',
    sampleRows(),
    { firmId: SQLEngine.ANY }
  );

  assert.equal(result.rows.length, 3);
});

test('SQLEngine array parameter with equals behaves as membership', () => {
  const { window } = loadScripts(['js/sqlengine.js']);
  const { SQLEngine } = window;

  const result = SQLEngine.execute(
    'SELECT AccountId FROM accounts WHERE FirmId = @firmId ORDER BY AccountId ASC',
    sampleRows(),
    { firmId: [101] }
  );

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.map((r) => r.AccountId).join(','), '10001001,10001002');
});
