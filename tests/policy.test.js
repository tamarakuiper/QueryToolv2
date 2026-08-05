const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/browser-loader');

function setupPolicy(policyConfig, missionCritical = []) {
  const { window } = loadScripts(['js/policy.js']);
  window.QT = {
    state: { app: { queryPolicy: policyConfig } },
    missionCriticalSet: () => new Set(missionCritical)
  };
  return window.Policy;
}

test('Policy blocks heavy joins during business hours', () => {
  const Policy = setupPolicy({
    enabled: true,
    heavyCostThreshold: 1000,
    workHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
    afterHoursTime: '19:00'
  });

  const decision = Policy.decide(
    { isJoin: true, cost: 5000, tables: ['accounts', 'holdings'], note: 'join' },
    new Date('2026-08-05T10:00:00')
  );

  assert.equal(decision.heavy, true);
  assert.equal(decision.blocked, true);
  assert.equal(decision.withinWorkHours, true);
});

test('Policy allows heavy joins outside business hours', () => {
  const Policy = setupPolicy({
    enabled: true,
    heavyCostThreshold: 1000,
    workHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
    afterHoursTime: '19:00'
  });

  const decision = Policy.decide(
    { isJoin: true, cost: 5000, tables: ['accounts', 'holdings'], note: 'join' },
    new Date('2026-08-05T20:00:00')
  );

  assert.equal(decision.heavy, true);
  assert.equal(decision.blocked, false);
  assert.equal(decision.withinWorkHours, false);
});

test('Policy marks mission-critical joins heavy regardless of cost', () => {
  const Policy = setupPolicy(
    {
      enabled: true,
      heavyCostThreshold: 999999999,
      workHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
      afterHoursTime: '19:00'
    },
    ['holdings']
  );

  const decision = Policy.decide(
    { isJoin: true, cost: 10, tables: ['accounts', 'holdings'], note: 'small join' },
    new Date('2026-08-05T11:00:00')
  );

  assert.equal(decision.heavy, true);
  assert.deepEqual(decision.critical, ['holdings']);
  assert.equal(decision.blocked, true);
});

test('Policy nextAfterHours returns a future time', () => {
  const Policy = setupPolicy({
    enabled: true,
    heavyCostThreshold: 1000,
    workHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
    afterHoursTime: '19:30'
  });

  const now = new Date('2026-08-05T19:45:00');
  const next = Policy.nextAfterHours(now);
  assert.ok(next.getTime() > now.getTime());
  assert.equal(next.getHours(), 19);
  assert.equal(next.getMinutes(), 30);
});
