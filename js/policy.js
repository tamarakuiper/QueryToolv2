/*
 * Query governance policy. Reads config/app.json → queryPolicy and decides
 * whether a query is "heavy" (large joins / huge scans) and whether it may run
 * right now. Heavy queries are blocked during business hours and must be
 * scheduled for after hours.
 */
(function (global) {
  'use strict';

  function cfg() { return (global.QT && QT.state.app && QT.state.app.queryPolicy) || { enabled: false }; }

  function parseHM(hm) { const [h, m] = String(hm || '0:0').split(':').map(Number); return { h: h || 0, m: m || 0 }; }
  function minutesOfDay(d) { return d.getHours() * 60 + d.getMinutes(); }

  function workStatus(now) {
    now = now || new Date();
    const c = cfg();
    const wh = c.workHours || { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' };
    const start = parseHM(wh.start), end = parseHM(wh.end);
    const dayOk = (wh.days || [1, 2, 3, 4, 5]).includes(now.getDay());
    const mins = minutesOfDay(now);
    const within = dayOk && mins >= (start.h * 60 + start.m) && mins < (end.h * 60 + end.m);
    return { within, dayOk, windowLabel: wh.start + '–' + wh.end + ' Mon–Fri', start: wh.start, end: wh.end };
  }

  // Next occurrence of the configured after-hours time (always outside work hours).
  function nextAfterHours(now) {
    now = now || new Date();
    const c = cfg();
    const t = parseHM(c.afterHoursTime || '19:00');
    const cand = new Date(now);
    cand.setHours(t.h, t.m, 0, 0);
    if (cand.getTime() <= now.getTime()) cand.setDate(cand.getDate() + 1);
    return cand;
  }

  // Which mission-critical tables a join touches (drives gating).
  function criticalTablesHit(estimate) {
    if (!estimate || !estimate.isJoin) return [];
    const mc = (global.QT && QT.missionCriticalSet) ? QT.missionCriticalSet() : new Set();
    return (estimate.tables || []).filter(t => mc.has(t));
  }
  function isHeavy(estimate) {
    const c = cfg();
    if (!estimate || !estimate.isJoin) return false;
    // Heavy = a multi-table join that either touches a mission-critical table
    // (set by an admin on the Data Governance page) OR exceeds the cost threshold.
    return criticalTablesHit(estimate).length > 0 || (estimate.cost || 0) >= (c.heavyCostThreshold || Infinity);
  }

  // Full decision for an estimate at a given time.
  function decide(estimate, now) {
    now = now || new Date();
    const c = cfg();
    const heavy = isHeavy(estimate);
    const critical = criticalTablesHit(estimate);
    const ws = workStatus(now);
    const enabled = c.enabled !== false;
    const blocked = enabled && heavy && ws.within;
    return {
      enabled, heavy, blocked, critical,
      withinWorkHours: ws.within,
      windowLabel: ws.windowLabel,
      threshold: c.heavyCostThreshold,
      suggestedTime: nextAfterHours(now),
      reason: blocked
        ? 'This query is estimated to be very large (' + (estimate.note || '') + '). Heavy queries are blocked during business hours (' + ws.windowLabel + ') and must run after hours.'
        : (heavy ? 'Heavy query — running now is allowed because it is outside business hours.' : '')
    };
  }

  global.Policy = { cfg, workStatus, nextAfterHours, isHeavy, decide };
})(window);
