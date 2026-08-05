const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts, createLocalStorage, createFetchFromDisk, APP_ROOT } = require('./helpers/browser-loader');

async function loadStore() {
  const localStorage = createLocalStorage();
  const fetch = createFetchFromDisk(APP_ROOT);
  const { window } = loadScripts(['js/sqlengine.js', 'js/pii.js', 'js/store.js'], {
    localStorage,
    fetch
  });
  await window.QT.loadAll();
  return window;
}

function loginAsAdmin(QT) {
  const admin = (QT.state.users || []).find((u) => u.isAdmin && u.enabled);
  assert.ok(admin, 'Expected at least one enabled admin user in config/users.json');
  const res = QT.login(admin.email, admin.password);
  assert.equal(res.ok, true);
}

test('QT weekly schedule advances to allowed weekday and remains scheduled', async () => {
  const window = await loadStore();
  const QT = window.QT;
  loginAsAdmin(QT);

  const weekly = QT.createSchedule({
    kind: 'sql',
    sql: 'SELECT AccountId, FirmId FROM accounts WHERE FirmId = @firmId LIMIT 1',
    dataset: 'accounts',
    name: 'Weekly test',
    firmId: 101,
    runAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    recurrence: 'weekly',
    recurrenceRule: { weekdays: [1, 3, 5] },
    reportLocation: '/reports/admin'
  });

  const rep = QT.runScheduleById(weekly.id);
  assert.ok(rep);
  assert.equal(rep.recurrence, 'weekly');

  const updated = QT.schedulesFor(QT.currentUser()).find((s) => s.id === weekly.id);
  assert.equal(updated.status, 'scheduled');
  const day = new Date(updated.runAt).getDay();
  assert.ok([1, 3, 5].includes(day));
  assert.ok(Date.parse(updated.runAt) > Date.now());
});

test('QT monthly schedule supports last day rule', async () => {
  const window = await loadStore();
  const QT = window.QT;
  loginAsAdmin(QT);

  const monthly = QT.createSchedule({
    kind: 'sql',
    sql: 'SELECT AccountId FROM accounts WHERE FirmId = @firmId LIMIT 1',
    dataset: 'accounts',
    name: 'Monthly last day test',
    firmId: 101,
    runAt: '2026-01-31T10:00:00.000Z',
    recurrence: 'monthly',
    recurrenceRule: { useLastDay: true, dayOfMonth: 31 },
    reportLocation: '/reports/admin'
  });

  const rep = QT.runScheduleById(monthly.id);
  assert.ok(rep);
  assert.equal(rep.recurrence, 'monthly');

  const updated = QT.schedulesFor(QT.currentUser()).find((s) => s.id === monthly.id);
  assert.equal(updated.status, 'scheduled');
  const d = new Date(updated.runAt);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  assert.equal(d.getDate(), lastDay);
});

test('QT quarterly schedule advances to quarter month and stores recurrence metadata', async () => {
  const window = await loadStore();
  const QT = window.QT;
  loginAsAdmin(QT);

  const quarterly = QT.createSchedule({
    kind: 'sql',
    sql: 'SELECT AccountId FROM accounts WHERE FirmId = @firmId LIMIT 1',
    dataset: 'accounts',
    name: 'Quarterly test',
    firmId: 101,
    runAt: '2026-01-15T09:00:00.000Z',
    recurrence: 'quarterly',
    recurrenceRule: { useLastDay: false, dayOfMonth: 5, quarterMode: 'calendar' },
    reportLocation: '/reports/admin'
  });

  const rep = QT.runScheduleById(quarterly.id);
  assert.ok(rep);
  assert.equal(rep.recurrence, 'quarterly');
  assert.equal(rep.recurrenceRule.dayOfMonth, 5);

  const updated = QT.schedulesFor(QT.currentUser()).find((s) => s.id === quarterly.id);
  assert.equal(updated.status, 'scheduled');
  const nextMonth = new Date(updated.runAt).getMonth();
  assert.ok([0, 3, 6, 9].includes(nextMonth));
});
