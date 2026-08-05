/*
 * Store / data-access layer. Loads every editable JSON file, holds session
 * state, enforces firm + group authorization, and runs queries through the
 * mini SQL engine against the mock datasets. Execution history lives in
 * localStorage so the demo analytics survive a refresh.
 */
(function (global) {
  'use strict';

  const LOG_KEY = 'qt.execlog';
  const state = {
    app: null, firms: [], groups: [], users: [], schema: null,
    queries: [], datasets: {}, user: null
  };

  async function getJSON(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load ' + path + ' (' + res.status + ')');
    return res.json();
  }

  async function loadAll() {
    const [app, firms, groups, usersDoc, schema, qIndex, enrollment, paLookups] = await Promise.all([
      getJSON('config/app.json'),
      getJSON('config/firms.json'),
      getJSON('config/groups.json'),
      getJSON('config/users.json'),
      getJSON('data/schema.json'),
      getJSON('config/queries/index.json'),
      getJSON('config/enrollment.json'),
      getJSON('config/pa-lookups.json')
    ]);
    state.app = app;
    state.firms = firms;
    state.groups = groups;
    state.users = usersDoc.users || usersDoc;
    state.schema = schema;
    state.enrollment = enrollment;
    state.paLookups = paLookups;

    state.queries = await Promise.all(
      (qIndex.queries || []).map(f => getJSON('config/queries/' + f))
    );

    // Load every dataset referenced by the schema.
    const dsNames = Object.values(schema.tables).map(t => t.dataset);
    await Promise.all([...new Set(dsNames)].map(async name => {
      state.datasets[name] = await getJSON('data/mock/' + name + '.json');
    }));

    // Proposal-account audit tables (seeded empty; runtime edits live in localStorage).
    state.datasets.proposalaccounthistory = await getJSON('data/mock/proposalaccounthistory.json');
    state.datasets.proposalaccountversion = await getJSON('data/mock/proposalaccountversion.json');

    appendStoredUsers();
    snapshotBaseAccess();
    applyAccess();
    snapshotBaseProposals();
    loadProposalAudit();
    applyProposalEdits();
    restoreSession();
    return state;
  }

  /* ---- Admin-created users (demo: persisted in localStorage) ---- */
  const NEWUSERS_KEY = 'qt.newusers';
  function storedUsers() { try { return JSON.parse(localStorage.getItem(NEWUSERS_KEY)) || []; } catch (_) { return []; } }
  function appendStoredUsers() {
    storedUsers().forEach(u => { if (!state.users.some(x => x.id === u.id)) state.users.push(u); });
  }
  // Create a user (demo). Persisted in this browser's localStorage — no server
  // required. Base demo users still come from config/users.json.
  function createUser(spec) {
    const email = (spec.email || '').trim().toLowerCase();
    if (!email) return { ok: false, error: 'Email is required.' };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' };
    if (state.users.some(u => u.email.toLowerCase() === email)) return { ok: false, error: 'A user with that email already exists.' };
    const u = {
      id: 'u-' + Date.now().toString(36), email,
      password: spec.password || 'demo123',
      displayName: (spec.displayName || '').trim() || email,
      enabled: true, isAdmin: !!spec.isAdmin, canGlobal: !!spec.canGlobal,
      groups: spec.groups || [], firms: spec.firms || [],
      reportLocation: spec.reportLocation || '/reports/shared', _created: true
    };
    state.users.push(u);
    state.baseAccess.users[u.id] = { groups: [...u.groups], firms: [...u.firms], isAdmin: u.isAdmin, canGlobal: u.canGlobal };
    const list = storedUsers(); list.push(u); localStorage.setItem(NEWUSERS_KEY, JSON.stringify(list));
    return { ok: true, user: u };
  }
  function deleteCreatedUser(id) {
    const u = state.users.find(x => x.id === id);
    if (!u || !u._created) return false;
    state.users = state.users.filter(x => x.id !== id);
    delete state.baseAccess.users[id];
    localStorage.setItem(NEWUSERS_KEY, JSON.stringify(storedUsers().filter(x => x.id !== id)));
    const ov = readAccess(); if (ov.users && ov.users[id]) { delete ov.users[id]; writeAccess(ov); }
    return true;
  }

  /* ---- Access overrides (admin-editable, persisted in localStorage) ---- */
  const ACCESS_KEY = 'qt.access';
  function snapshotBaseAccess() {
    state.baseAccess = { users: {}, queries: {} };
    state.users.forEach(u => {
      state.baseAccess.users[u.id] = { groups: [...(u.groups || [])], firms: [...(u.firms || [])], isAdmin: !!u.isAdmin, canGlobal: !!u.canGlobal };
    });
    state.queries.forEach(q => {
      const a = q.access || {};
      state.baseAccess.queries[q.id] = { groups: [...(a.groups || [])], adminOnly: !!a.adminOnly };
    });
  }
  function readAccess() { try { return JSON.parse(localStorage.getItem(ACCESS_KEY)) || {}; } catch (_) { return {}; } }
  function writeAccess(ov) { localStorage.setItem(ACCESS_KEY, JSON.stringify(ov)); }
  // Re-derive each live user/query from base + overrides so existing permission
  // checks (which read the live objects) reflect the admin's changes.
  function applyAccess() {
    const ov = readAccess();
    state.users.forEach(u => {
      const b = state.baseAccess.users[u.id] || { groups: [], firms: [], isAdmin: false, canGlobal: false };
      const o = (ov.users && ov.users[u.id]) || {};
      u.groups = o.groups ? [...o.groups] : [...b.groups];
      u.firms = o.firms ? [...o.firms] : [...b.firms];
      u.isAdmin = ('isAdmin' in o) ? !!o.isAdmin : b.isAdmin;
      u.canGlobal = ('canGlobal' in o) ? !!o.canGlobal : b.canGlobal;
    });
    state.queries.forEach(q => {
      const b = state.baseAccess.queries[q.id] || { groups: [], adminOnly: false };
      const o = (ov.queries && ov.queries[q.id]) || {};
      q.access = q.access || {};
      q.access.groups = o.groups ? [...o.groups] : [...b.groups];
      q.access.adminOnly = ('adminOnly' in o) ? !!o.adminOnly : b.adminOnly;
    });
  }
  function setUserAccess(userId, patch) {
    const ov = readAccess();
    ov.users = ov.users || {};
    ov.users[userId] = Object.assign({}, ov.users[userId], patch);
    writeAccess(ov); applyAccess();
  }
  function setQueryAccess(queryId, patch) {
    const ov = readAccess();
    ov.queries = ov.queries || {};
    ov.queries[queryId] = Object.assign({}, ov.queries[queryId], patch);
    writeAccess(ov); applyAccess();
  }
  function accessModified() { const ov = readAccess(); return !!(ov.users || ov.queries); }
  function resetAccess() { localStorage.removeItem(ACCESS_KEY); applyAccess(); }

  /* ---- Session / auth ---- */
  function sessionKey() { return (state.app && state.app.authentication.sessionKey) || 'qt.session'; }
  function restoreSession() {
    try {
      const raw = localStorage.getItem(sessionKey());
      if (!raw) return;
      const id = JSON.parse(raw).userId;
      state.user = state.users.find(u => u.id === id) || null;
    } catch (_) { state.user = null; }
  }
  function login(email, password) {
    const user = state.users.find(u => u.email.toLowerCase() === String(email).toLowerCase().trim());
    if (!user) return { ok: false, error: 'No account found for that email.' };
    if (!user.enabled) return { ok: false, error: 'This account is disabled. Ask an administrator to enable it.' };
    if (user.password !== password) return { ok: false, error: 'Incorrect password.' };
    state.user = user;
    localStorage.setItem(sessionKey(), JSON.stringify({ userId: user.id, at: Date.now() }));
    return { ok: true, user };
  }
  function logout() { state.user = null; localStorage.removeItem(sessionKey()); }
  function currentUser() { return state.user; }

  /* ---- Authorization ---- */
  function firmsForUser(user) {
    if (!user) return [];
    return state.firms.filter(f => f.enabled && (user.isAdmin || (user.firms || []).includes(f.id)));
  }
  function canAccessQuery(user, def) {
    if (!def.enabled) return false;
    if (user.isAdmin) return true;
    if (def.access && def.access.adminOnly) return false;
    const groups = def.access ? (def.access.groups || []) : [];
    return groups.some(g => (user.groups || []).includes(g));
  }
  // May this user use the ad-hoc SQL Assistant? (Otherwise they can only run
  // pre-approved reports from the Queries page.)
  function canUseAssistant(user) {
    if (!user) return false;
    const app = state.app || {};
    if (app.features && app.features.sqlAssistant === false) return false;
    const acc = app.sqlAssistantAccess || {};
    if (user.isAdmin) return true;
    if (acc.adminOnly) return false;
    if (!acc.allowGroups) return true; // no restriction configured → allow
    return acc.allowGroups.some(g => (user.groups || []).includes(g));
  }
  function queriesForFirm(user, firmId) {
    const accessible = firmsForUser(user).map(f => f.id);
    return state.queries.filter(def => {
      if (!canAccessQuery(user, def)) return false;
      const scope = def.scope || { type: 'global' };
      if (scope.type === 'firm') {
        if (firmId === 'all' || firmId === 'global' || firmId == null) return (scope.firmIds || []).some(id => accessible.includes(id));
        return (scope.firmIds || []).includes(firmId);
      }
      return true;
    });
  }
  function getQuery(id) { return state.queries.find(q => q.id === id); }

  /* ---- Execution ---- */
  function applyDefaults(def, values) {
    const params = {};
    (def.parameters || []).forEach(p => {
      if (p.source === 'firm') return; // filled by caller
      let v = values[p.name];
      if ((v === undefined || v === '' || (Array.isArray(v) && !v.length)) && p.default !== undefined) v = p.default;
      params[p.name] = v;
    });
    return params;
  }
  function validate(def, params) {
    const errors = [];
    (def.parameters || []).forEach(p => {
      if (p.source === 'firm' || p.hidden) return;
      const v = params[p.name];
      const empty = v === undefined || v === '' || (Array.isArray(v) && !v.length);
      if (p.required && empty) errors.push((p.label || p.name) + ' is required.');
      if (!empty && (p.type === 'number' || p.type === 'integer')) {
        const n = Number(v);
        if (Number.isNaN(n)) errors.push((p.label || p.name) + ' must be a number.');
        else {
          if (p.min !== undefined && n < p.min) errors.push((p.label || p.name) + ' must be ≥ ' + p.min + '.');
          if (p.max !== undefined && n > p.max) errors.push((p.label || p.name) + ' must be ≤ ' + p.max + '.');
        }
      }
    });
    return errors;
  }

  const ALL_FIRMS = 'all';
  const GLOBAL = 'global';
  // Resolve the @firmId value for a run:
  //  - a single id                          → that firm
  //  - 'all'  → the list of firms the user is entitled to (engine treats an
  //             array on `=` as membership: WHERE FirmId IN (...))
  //  - 'global' (admins only) → SQLEngine.ANY, which drops the FirmId predicate
  //             entirely — a true unscoped scan across all data.
  // Non-admins can never get the wildcard: 'global' falls back to their entitled
  // list so entitlement is always enforced.
  // May this user run the Global scope (a query against ALL firms, no filter)?
  // Admins always may; other users may if granted the canGlobal capability.
  function canRunGlobal(user) { return !!(user && (user.isAdmin || user.canGlobal)); }
  function resolveFirmParam(firmId) {
    const u = state.user;
    const entitled = firmsForUser(u).map(f => f.id);
    // Global: admins and canGlobal users get the wildcard (no filter); everyone
    // else is capped to their entitled firms — never the wildcard.
    if (firmId === GLOBAL) return canRunGlobal(u) ? SQLEngine.ANY : entitled;
    // "All firms" (internal / legacy) and unset → the user's entitled union.
    if (firmId === ALL_FIRMS || firmId == null) return entitled;
    // A specific firm: admins may query any; everyone else only a firm they are
    // entitled to. A non-entitled firm resolves to [] → zero rows (no leakage).
    if (u && u.isAdmin) return firmId;
    return entitled.includes(firmId) ? firmId : [];
  }
  function isGlobal(firmId) { return firmId === ALL_FIRMS || firmId === GLOBAL || firmId == null; }

  function runQuery(def, firmId, values) {
    const params = applyDefaults(def, values || {});
    params.firmId = resolveFirmParam(firmId);
    const errors = validate(def, params);
    if (errors.length) return { ok: false, errors };

    const dataset = state.datasets[def.execution.dataset] || [];
    const started = performance.now();
    try {
      const result = SQLEngine.execute(def.execution.sql, dataset, params);
      let rows = result.rows;
      const maxRows = def.execution.maxRows || 5000;
      const truncated = rows.length > maxRows;
      if (truncated) rows = rows.slice(0, maxRows);
      const durationMs = Math.round(performance.now() - started);
      const columns = def.result.columns || inferColumns(def.execution.dataset, result.columns);
      const pii = global.PII ? global.PII.detect(columns) : { isPII: false, categories: [] };
      logExecution({ queryId: def.id, name: def.name, firmId, rowCount: rows.length, durationMs, success: true, pii: pii.isPII, piiCategories: pii.categories });
      return { ok: true, columns, rows, meta: { rowCount: rows.length, durationMs, truncated }, sql: def.execution.sql };
    } catch (err) {
      logExecution({ queryId: def.id, name: def.name, firmId, rowCount: 0, durationMs: 0, success: false, error: err.message });
      return { ok: false, errors: [err.message] };
    }
  }

  // Used by the SQL Assistant: run generated SQL directly against a dataset.
  function runRawSql(sql, datasetKey, firmId, extraParams) {
    const dataset = state.datasets[datasetKey] || [];
    const params = Object.assign({ firmId: resolveFirmParam(firmId) }, extraParams || {});
    const started = performance.now();
    try {
      const result = SQLEngine.execute(sql, dataset, params);
      const durationMs = Math.round(performance.now() - started);
      const columns = inferColumns(datasetKey, result.columns);
      const pii = global.PII ? global.PII.detect(columns) : { isPII: false, categories: [] };
      logExecution({ queryId: 'sql-assistant', name: 'SQL Assistant', firmId, rowCount: result.rows.length, durationMs, success: true, pii: pii.isPII, piiCategories: pii.categories });
      return { ok: true, columns, rows: result.rows, meta: { rowCount: result.rows.length, durationMs, truncated: false }, sql };
    } catch (err) {
      logExecution({ queryId: 'sql-assistant', name: 'SQL Assistant', firmId, rowCount: 0, durationMs: 0, success: false, error: err.message });
      return { ok: false, errors: [err.message] };
    }
  }

  function inferColumns(datasetKey, fieldNames) {
    const tableDef = Object.values(state.schema.tables).find(t => t.dataset === datasetKey);
    return fieldNames.map(f => {
      const meta = tableDef && tableDef.columns[f];
      let type = meta ? meta.type : 'string';
      if (!meta) { // aggregate aliases like Total / Count / Average
        if (/count/i.test(f)) type = 'integer';
        else if (/total|sum|average|avg/i.test(f)) type = 'currency';
      }
      const col = { field: f, label: f.replace(/([a-z])([A-Z])/g, '$1 $2'), type };
      if (meta && meta.pii) { col.pii = true; if (meta.piiCategory) col.piiCategory = meta.piiCategory; }
      return col;
    });
  }

  /* ---- Execution log ---- */
  // When a scheduled run executes, attribute the log entry to the schedule's
  // creator rather than whoever's browser fired the ticker.
  let logActor = null;
  function readLog() { try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch (_) { return []; } }
  function logExecution(entry) {
    const log = readLog();
    const user = logActor || (state.user ? state.user.email : 'anonymous');
    log.unshift(Object.assign({ at: new Date().toISOString(), user }, entry));
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 500)));
  }
  function clearLog() { localStorage.removeItem(LOG_KEY); }

  /* ---- Scheduling + Reports (client-side demo, persisted in localStorage) ---- */
  const SCHED_KEY = 'qt.schedules';
  const REPORT_KEY = 'qt.reports';
  const uid = (p) => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

  function readSchedules() { try { return JSON.parse(localStorage.getItem(SCHED_KEY)) || []; } catch (_) { return []; } }
  function writeSchedules(list) { localStorage.setItem(SCHED_KEY, JSON.stringify(list)); }
  function readReports() { try { return JSON.parse(localStorage.getItem(REPORT_KEY)) || []; } catch (_) { return []; } }
  function writeReports(list) { localStorage.setItem(REPORT_KEY, JSON.stringify(list.slice(0, 300))); }

  function reportLocationFor(user) { return (user && user.reportLocation) || '/reports/shared'; }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }
  function normalizeWeekdays(days, fallbackDay) {
    const arr = Array.isArray(days) ? days.map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 0 && n <= 6) : [];
    const uniq = [...new Set(arr)].sort((a, b) => a - b);
    return uniq.length ? uniq : [fallbackDay];
  }
  function nextMonthlyRun(prevRunAt, dayOfMonth, useLastDay, nowMs) {
    const prev = new Date(prevRunAt);
    const h = prev.getHours(), m = prev.getMinutes(), s = prev.getSeconds(), ms = prev.getMilliseconds();
    let y = prev.getFullYear();
    let mo = prev.getMonth() + 1;
    if (mo > 11) { mo = 0; y += 1; }
    let next;
    do {
      const dim = daysInMonth(y, mo);
      const d = useLastDay ? dim : Math.min(Math.max(1, dayOfMonth || prev.getDate()), dim);
      next = new Date(y, mo, d, h, m, s, ms);
      if (next.getTime() > nowMs) break;
      mo += 1;
      if (mo > 11) { mo = 0; y += 1; }
    } while (true);
    return next.toISOString();
  }
  function nextQuarterlyRun(prevRunAt, dayOfMonth, useLastDay, nowMs) {
    const prev = new Date(prevRunAt);
    const h = prev.getHours(), m = prev.getMinutes(), s = prev.getSeconds(), ms = prev.getMilliseconds();
    const quarterMonths = [0, 3, 6, 9]; // Jan/Apr/Jul/Oct
    let y = prev.getFullYear();
    const mo = prev.getMonth();
    let nextQ = quarterMonths.find(qm => qm > mo);
    if (nextQ == null) { nextQ = 0; y += 1; }

    let next;
    do {
      const dim = daysInMonth(y, nextQ);
      const d = useLastDay ? dim : Math.min(Math.max(1, dayOfMonth || prev.getDate()), dim);
      next = new Date(y, nextQ, d, h, m, s, ms);
      if (next.getTime() > nowMs) break;
      nextQ += 3;
      if (nextQ > 11) { nextQ = 0; y += 1; }
    } while (true);
    return next.toISOString();
  }
  function advanceRecurringSchedule(s) {
    const nowMs = Date.now();
    if (s.recurrence === 'daily') {
      let next = Date.parse(s.runAt) + 86400000;
      while (next <= nowMs) next += 86400000;
      s.runAt = new Date(next).toISOString();
      s.status = 'scheduled';
      return;
    }
    if (s.recurrence === 'weekly') {
      const prev = new Date(s.runAt);
      const allowedDays = normalizeWeekdays(s.recurrenceRule && s.recurrenceRule.weekdays, prev.getDay());
      const next = new Date(prev);
      do {
        next.setDate(next.getDate() + 1);
      } while (next.getTime() <= nowMs || !allowedDays.includes(next.getDay()));
      s.runAt = next.toISOString();
      s.status = 'scheduled';
      return;
    }
    if (s.recurrence === 'monthly') {
      const rule = s.recurrenceRule || {};
      s.runAt = nextMonthlyRun(
        s.runAt,
        Number(rule.dayOfMonth) || new Date(s.runAt).getDate(),
        !!rule.useLastDay,
        nowMs
      );
      s.status = 'scheduled';
      return;
    }
    if (s.recurrence === 'quarterly') {
      const rule = s.recurrenceRule || {};
      s.runAt = nextQuarterlyRun(
        s.runAt,
        Number(rule.dayOfMonth) || new Date(s.runAt).getDate(),
        !!rule.useLastDay,
        nowMs
      );
      s.status = 'scheduled';
      return;
    }
    s.status = 'completed';
  }

  // spec: { kind:'query'|'sql', queryId, params, sql, dataset, name, firmId, runAt(ISO),
  //         recurrence:'once'|'daily'|'weekly'|'monthly'|'quarterly', recurrenceRule, reportLocation }
  function createSchedule(spec) {
    const list = readSchedules();
    const sched = Object.assign({
      id: uid('sch'), status: 'scheduled', createdBy: state.user ? state.user.email : 'anonymous',
      createdAt: new Date().toISOString(), lastRunAt: null, lastReportId: null, recurrence: 'once', recurrenceRule: null
    }, spec);
    if (!['once', 'daily', 'weekly', 'monthly', 'quarterly'].includes(sched.recurrence)) sched.recurrence = 'once';
    list.push(sched);
    writeSchedules(list);
    return sched;
  }
  function deleteSchedule(id) { writeSchedules(readSchedules().filter(s => s.id !== id)); }
  function schedulesFor(user) {
    const all = readSchedules();
    return user && user.isAdmin ? all : all.filter(s => s.createdBy === (user && user.email));
  }

  function saveReport(rep) {
    const list = readReports();
    const report = Object.assign({ id: uid('rpt'), at: new Date().toISOString() }, rep);
    list.unshift(report);
    writeReports(list);
    return report;
  }
  function reportsFor(user) {
    const all = readReports();
    return user && user.isAdmin ? all : all.filter(r => r.createdBy === (user && user.email));
  }
  function getReport(id) { return readReports().find(r => r.id === id); }
  function deleteReport(id) { writeReports(readReports().filter(r => r.id !== id)); }

  // Runs one schedule by id, saves a report, advances/marks the schedule.
  // Returns the saved report (or null on failure).
  function runScheduleById(id) {
    const list = readSchedules();
    const s = list.find(x => x.id === id);
    if (!s) return null;

    let res;
    logActor = s.createdBy; // attribute this run to the schedule's owner
    try {
      if (s.kind === 'sql') res = runRawSql(s.sql, s.dataset, s.firmId);
      else { const def = getQuery(s.queryId); res = def ? runQuery(def, s.firmId, s.params || {}) : { ok: false, errors: ['Query not found'] }; }
    } finally {
      logActor = null;
    }

    const now = new Date().toISOString();
    if (!res.ok) {
      s.status = 'error'; s.lastRunAt = now; s.lastError = (res.errors || []).join('; ');
      writeSchedules(list);
      return null;
    }

    const pii = (global.PII ? global.PII.detect(res.columns) : { isPII: false, fields: [], categories: [] });
    const report = saveReport({
      scheduleId: s.id, name: s.name, firmId: s.firmId, location: s.reportLocation,
      columns: res.columns, rows: res.rows, meta: res.meta, pii, createdBy: s.createdBy,
      queryId: s.queryId || 'sql-assistant', recurrence: s.recurrence, recurrenceRule: s.recurrenceRule || null
    });

    s.lastRunAt = now; s.lastReportId = report.id;
    advanceRecurringSchedule(s);
    writeSchedules(list);
    return report;
  }

  // Runs every schedule whose time has arrived. Returns the reports produced.
  function tickScheduler() {
    const now = Date.now();
    const due = readSchedules().filter(s => s.status === 'scheduled' && Date.parse(s.runAt) <= now);
    const produced = [];
    due.forEach(s => { const r = runScheduleById(s.id); if (r) produced.push(r); });
    return produced;
  }

  /* ---- Data governance: counts + mission-critical tables ---- */
  const GOV_KEY = 'qt.governance';
  // Actual row count of a dataset, computed with the SQL engine (COUNT(*)).
  function datasetCount(name) {
    const ds = state.datasets[name] || [];
    try { return SQLEngine.execute('SELECT COUNT(*) AS Count FROM ' + name, ds, {}).rows[0].Count; }
    catch (_) { return ds.length; }
  }
  function readGovernance() { try { return JSON.parse(localStorage.getItem(GOV_KEY)) || {}; } catch (_) { return {}; } }
  function writeGovernance(g) { localStorage.setItem(GOV_KEY, JSON.stringify(g)); }
  // Effective mission-critical = admin override (localStorage) else schema default.
  function isMissionCritical(tableKey) {
    const gov = readGovernance();
    if (gov.missionCritical && tableKey in gov.missionCritical) return !!gov.missionCritical[tableKey];
    const t = state.schema.tables[tableKey];
    return !!(t && t.missionCritical);
  }
  function setMissionCritical(tableKey, value) {
    const gov = readGovernance();
    gov.missionCritical = gov.missionCritical || {};
    gov.missionCritical[tableKey] = !!value;
    writeGovernance(gov);
  }
  function missionCriticalSet() {
    return new Set(Object.keys(state.schema.tables).filter(isMissionCritical));
  }

  /* ---- Proposal accounts: bulk edit + history/version audit ---- */
  const PA_EDITS_KEY = 'qt.pa.edits';
  const PA_HISTORY_KEY = 'qt.pa.history';
  const PA_VERSION_KEY = 'qt.pa.versions';
  const PA_ENROLLED_KEY = 'qt.pa.enrolled';
  function readEnrolled() { try { return JSON.parse(localStorage.getItem(PA_ENROLLED_KEY)) || []; } catch (_) { return []; } }
  function writeEnrolled(list) { localStorage.setItem(PA_ENROLLED_KEY, JSON.stringify(list)); }

  // Fields an admin may bulk-update (the things that used to live in the Excel sheet).
  const PROPOSAL_FIELDS = [
    { field: 'CashTriggerLowPct', label: 'Cash Trigger Low %', type: 'number', min: 0, max: 100, step: 0.5, group: 'Cash triggers' },
    { field: 'CashTriggerHighPct', label: 'Cash Trigger High %', type: 'number', min: 0, max: 100, step: 0.5, group: 'Cash triggers' },
    { field: 'CashTargetPct', label: 'Cash Target %', type: 'number', min: 0, max: 100, step: 0.5, group: 'Cash triggers' },
    { field: 'FloorAmount', label: 'Floor ($)', type: 'currency', min: 0, group: 'Floor / ceiling' },
    { field: 'CeilingAmount', label: 'Ceiling ($)', type: 'currency', min: 0, group: 'Floor / ceiling' },
    { field: 'RebalanceThresholdPct', label: 'Rebalance Threshold %', type: 'number', min: 0, max: 50, step: 0.5, group: 'Trading' },
    { field: 'TradingEnabled', label: 'Trading Enabled', type: 'toggle', group: 'Trading' },
    { field: 'Model', label: 'Model', type: 'select', options: ['Aggressive', 'Growth', 'Balanced', 'Conservative', 'Income'], group: 'Trading' }
  ];
  function proposalFields() { return PROPOSAL_FIELDS; }
  function proposalFieldMeta(field) { return PROPOSAL_FIELDS.find(f => f.field === field); }
  function coerceFieldValue(field, value) {
    const m = proposalFieldMeta(field);
    if (!m) return value;
    if (m.type === 'number' || m.type === 'currency') return Number(value);
    if (m.type === 'toggle') return value === true || value === 'true';
    return value;
  }

  function snapshotBaseProposals() {
    state._baseProposals = (state.datasets.proposalaccounts || []).map(r => Object.assign({}, r));
  }
  function readProposalEdits() { try { return JSON.parse(localStorage.getItem(PA_EDITS_KEY)) || {}; } catch (_) { return {}; } }
  function writeProposalEdits(o) { localStorage.setItem(PA_EDITS_KEY, JSON.stringify(o)); }
  function loadProposalAudit() {
    const h = (() => { try { return JSON.parse(localStorage.getItem(PA_HISTORY_KEY)) || []; } catch (_) { return []; } })();
    const v = (() => { try { return JSON.parse(localStorage.getItem(PA_VERSION_KEY)) || []; } catch (_) { return []; } })();
    // seed (empty) + persisted runtime rows
    state.datasets.proposalaccounthistory = (state.datasets.proposalaccounthistory || []).concat(h);
    state.datasets.proposalaccountversion = (state.datasets.proposalaccountversion || []).concat(v);
  }
  function applyProposalEdits() {
    const edits = readProposalEdits();
    // working set = seeded proposal accounts + admin-enrolled ones, then per-id edits
    const all = (state._baseProposals || []).concat(readEnrolled());
    state.datasets.proposalaccounts = all.map(r => Object.assign({}, r, edits[r.ProposalAccountId] || {}));
  }

  // Resolve a list of account numbers (AccountIds) to their proposal accounts,
  // scoped to the user's firm entitlements. Returns matched rows + any not found.
  function resolveProposalAccounts(numbers) {
    const entitled = firmsForUser(state.user).map(f => f.id);
    const isAdmin = state.user && state.user.isAdmin;
    const found = [], notFound = [];
    numbers.forEach(n => {
      const acct = Number(n);
      const p = (state.datasets.proposalaccounts || []).find(x => x.AccountId === acct);
      const a = (state.datasets.accounts || []).find(x => x.AccountId === acct);
      if (!p) { notFound.push(n); return; }
      if (!isAdmin && !entitled.includes(p.FirmId)) { notFound.push(n); return; } // not entitled → treat as not found
      found.push(Object.assign({}, p, { AccountName: a ? a.AccountName : '(unknown)' }));
    });
    return { found, notFound };
  }

  // Bulk-update one field across many proposal accounts. Writes a row to
  // proposalaccounthistory and proposalaccountversion for each account.
  function bulkUpdateProposals(proposalAccountIds, field, rawValue) {
    if (!proposalFieldMeta(field)) return { ok: false, error: 'Unknown field: ' + field };
    const value = coerceFieldValue(field, rawValue);
    const actor = state.user ? state.user.email : 'anonymous';
    const now = new Date().toISOString();
    const batchId = 'batch-' + Date.now().toString(36);
    const edits = readProposalEdits();
    const hist = (() => { try { return JSON.parse(localStorage.getItem(PA_HISTORY_KEY)) || []; } catch (_) { return []; } })();
    const vers = (() => { try { return JSON.parse(localStorage.getItem(PA_VERSION_KEY)) || []; } catch (_) { return []; } })();
    const changed = [];

    proposalAccountIds.forEach(id => {
      const cur = (state.datasets.proposalaccounts || []).find(p => p.ProposalAccountId === id);
      if (!cur) return;
      const oldValue = cur[field];
      const newVersion = (cur.Version || 1) + 1;
      edits[id] = Object.assign({}, edits[id], { [field]: value, Version: newVersion, UpdatedBy: actor, UpdatedAt: now });
      const histRow = {
        HistoryId: uid('pah'), BatchId: batchId, ProposalAccountId: id, AccountId: cur.AccountId, FirmId: cur.FirmId,
        Field: field, OldValue: oldValue, NewValue: value, ChangedBy: actor, ChangedAt: now, Version: newVersion
      };
      const verRow = {
        VersionId: uid('pav'), BatchId: batchId, ProposalAccountId: id, AccountId: cur.AccountId, Version: newVersion,
        Field: field, Value: value, Snapshot: Object.assign({}, cur, { [field]: value, Version: newVersion, UpdatedBy: actor, UpdatedAt: now }),
        CreatedBy: actor, CreatedAt: now
      };
      hist.unshift(histRow); vers.unshift(verRow); changed.push(histRow);
    });

    writeProposalEdits(edits);
    localStorage.setItem(PA_HISTORY_KEY, JSON.stringify(hist.slice(0, 2000)));
    localStorage.setItem(PA_VERSION_KEY, JSON.stringify(vers.slice(0, 2000)));
    // rebuild working datasets from base + edits, and refresh audit datasets
    applyProposalEdits();
    state.datasets.proposalaccounthistory = state._baseProposalHistory ? state._baseProposalHistory.concat(hist) : hist.slice();
    state.datasets.proposalaccountversion = state._baseProposalVersion ? state._baseProposalVersion.concat(vers) : vers.slice();

    // Record the bulk change in the central Execution Log, attributed to the
    // admin who made it (logExecution stamps the current user).
    const meta = proposalFieldMeta(field);
    const firmsHit = [...new Set(changed.map(c => c.FirmId))];
    logExecution({
      queryId: 'bulk-edit', kind: 'bulk',
      name: 'Bulk edit — ' + (meta ? meta.label : field) + ' → ' + value,
      firmId: firmsHit.length === 1 ? firmsHit[0] : 'multi',
      rowCount: changed.length, durationMs: 0, success: true,
      batchId, field, newValue: value, accountIds: changed.map(c => c.AccountId)
    });
    return { ok: true, batchId, count: changed.length, field, value, changed, actor };
  }

  function proposalHistory(limit) { const h = state.datasets.proposalaccounthistory || []; return limit ? h.slice(0, limit) : h; }
  function proposalVersions(limit) { const v = state.datasets.proposalaccountversion || []; return limit ? v.slice(0, limit) : v; }
  function proposalHistoryFor(proposalAccountId) { return (state.datasets.proposalaccounthistory || []).filter(h => h.ProposalAccountId === proposalAccountId); }
  function resetProposals() {
    [PA_EDITS_KEY, PA_HISTORY_KEY, PA_VERSION_KEY, PA_ENROLLED_KEY].forEach(k => localStorage.removeItem(k));
    applyProposalEdits();
    state.datasets.proposalaccounthistory = [];
    state.datasets.proposalaccountversion = [];
  }

  /* ---- Bulk enrollment (intake → create proposal accounts + PAV/PASH audit) ---- */
  function enrollmentSchema() { return state.enrollment || { sections: [], lookups: {} }; }
  function enrollmentFields() {
    return (enrollmentSchema().sections || []).reduce((acc, s) => acc.concat(s.fields || []), []);
  }
  // Apply the always-required and conditional-required (requiredIf) rules.
  function validateEnrollment(values) {
    const errors = [];
    enrollmentFields().forEach(f => {
      const v = values[f.key];
      const empty = v === undefined || v === null || String(v).trim() === '';
      let required = !!f.required;
      if (f.requiredIf) {
        const pv = values[f.requiredIf.field];
        if ('equals' in f.requiredIf) required = pv === f.requiredIf.equals;
        else if ('notEquals' in f.requiredIf) required = pv != null && pv !== '' && pv !== f.requiredIf.notEquals;
      }
      if (required && empty) errors.push({ field: f.key, label: f.label, message: f.label + ' is required.' });
    });
    return errors;
  }
  // Which of a fields is currently required given the entered values (for the UI).
  function enrollmentRequiredNow(values) {
    const map = {};
    enrollmentFields().forEach(f => {
      let req = !!f.required;
      if (f.requiredIf) {
        const pv = values[f.requiredIf.field];
        if ('equals' in f.requiredIf) req = pv === f.requiredIf.equals;
        else if ('notEquals' in f.requiredIf) req = pv != null && pv !== '' && pv !== f.requiredIf.notEquals;
      }
      map[f.key] = req;
    });
    return map;
  }

  function resolveEnrollTargets(numbers) {
    const entitled = firmsForUser(state.user).map(f => f.id);
    const isAdmin = state.user && state.user.isAdmin;
    const enrollable = [], alreadyEnrolled = [], notFound = [];
    numbers.forEach(n => {
      const acct = Number(n);
      const a = (state.datasets.accounts || []).find(x => x.AccountId === acct);
      if (!a || (!isAdmin && !entitled.includes(a.FirmId))) { notFound.push(n); return; }
      if ((state.datasets.proposalaccounts || []).some(x => x.AccountId === acct)) { alreadyEnrolled.push(n); return; }
      enrollable.push({ AccountId: acct, FirmId: a.FirmId, AccountName: a.AccountName });
    });
    return { enrollable, alreadyEnrolled, notFound };
  }
  function unenrolledAccounts() {
    const entitled = firmsForUser(state.user).map(f => f.id);
    const isAdmin = state.user && state.user.isAdmin;
    const enrolled = new Set((state.datasets.proposalaccounts || []).map(p => p.AccountId));
    return (state.datasets.accounts || []).filter(a => !enrolled.has(a.AccountId) && (isAdmin || entitled.includes(a.FirmId)));
  }
  function nextProposalAccountId() {
    const ids = (state.datasets.proposalaccounts || []).map(p => p.ProposalAccountId);
    return (ids.length ? Math.max.apply(null, ids) : 700000) + 1;
  }
  const capKey = k => k.charAt(0).toUpperCase() + k.slice(1);
  // Fields captured on the intake form that do NOT belong on the proposal account
  // record. Drift Setting is a composite tolerance band (ProposalCompositeToleranceBand),
  // applied at the composite level — it is not a proposalaccount insert column.
  const NON_PA_ENROLL_FIELDS = new Set(['driftSetting']);
  function enrollRowFromValues(accountId, firmId, values, id, actor, now) {
    const row = { ProposalAccountId: id, AccountId: accountId, FirmId: firmId, Version: 1, Status: 'Enrolled', CreatedBy: actor, CreatedOn: now, UpdatedBy: actor, UpdatedAt: now };
    enrollmentFields().forEach(f => { if (NON_PA_ENROLL_FIELDS.has(f.key)) return; row[capKey(f.key)] = values[f.key] != null ? values[f.key] : ''; });
    row.Model = values.model;
    // Compatibility columns so enrolled accounts still render in the Bulk Editor.
    const tt = values.triggerType;
    row.CashTriggerLowPct = tt === 'percent' ? Number(values.triggerFloor) || 0 : 0;
    row.CashTriggerHighPct = tt === 'percent' ? Number(values.triggerCeiling) || 0 : 0;
    row.FloorAmount = tt === 'dollar' ? Number(values.triggerFloor) || 0 : 0;
    row.CeilingAmount = tt === 'dollar' ? Number(values.triggerCeiling) || 0 : 0;
    row.RebalanceThresholdPct = 5;
    row.TradingEnabled = true;
    return row;
  }

  // ---- Systems-ready `insert into ...` generation (PA shell → PAV → PASH) ----
  function resolveAdvisorId(firmId, advisorName) {
    const a = (state.datasets.advisors || []).find(x => x.FirmId === firmId && x.AdvisorName === advisorName);
    return a ? a.AdvisorId : null;
  }
  // Serialize one INSERT for `table` with the given ordered `cols` and `row`
  // values, honoring the string/date/raw formatting rules in pa-lookups.
  function sqlSerialize(table, cols, row) {
    const L = state.paLookups || {};
    const strCols = new Set(L.stringColumns || []);
    const dateCols = new Set(L.dateColumns || []);
    const raw = L.rawColumns || {};
    const fmt = col => {
      if (col in raw) return raw[col];
      const v = row[col];
      if (v === null || v === undefined) return 'NULL';
      if (dateCols.has(col)) return "'" + v + "'";
      if (strCols.has(col)) return "'" + String(v).replace(/'/g, "''") + "'";
      return String(v);
    };
    return 'insert into ' + table + ' (\n  ' + cols.join(', ') + '\n) values (\n  ' + cols.map(fmt).join(', ') + '\n);';
  }
  function buildProposalInsert(acct, values, proposalAccountId, actor, advisorId, statusId) {
    const L = state.paLookups || {};
    const bit = v => (v === 'Yes' ? 1 : 0);
    const num = v => (v === '' || v == null ? null : Number(v));
    const tt = values.triggerType, triggered = tt && tt !== 'none';
    const w = values.periodicWithdrawal === 'Yes', sec = values.secondaryPeriodicWithdrawal === 'Yes';
    const comp = (L.composite || {})[values.model] || {};
    if (advisorId === undefined) advisorId = resolveAdvisorId(acct.FirmId, values.advisor);
    if (statusId === undefined) statusId = L.newProposalAccountStatusId != null ? L.newProposalAccountStatusId : 1;
    const wf = (L.withdrawalFrequencyId || {});

    const row = {
      Revision_in: 1, SourceAccountID_in: acct.AccountId,
      Description_vc: acct.AccountName, AccountNumber_vc: String(acct.AccountId),
      Address1_vc: '', City_vc: '', State_vc: '', Zip_vc: '',
      ProposalAccountTypeID_in: (L.accountTypeId || {})[values.accountType] != null ? L.accountTypeId[values.accountType] : null,
      FirmID_in: acct.FirmId, Investment_fl: num(values.accountAllocations) || 1,
      CustodianID_in: (L.custodianId || {})[values.custodian] != null ? L.custodianId[values.custodian] : null,
      Trigger_bt: triggered ? 1 : 0, TriggerType_vc: tt || 'none',
      TriggerFloor_fl: triggered ? num(values.triggerFloor) : null,
      TriggerCeiling_fl: triggered ? num(values.triggerCeiling) : null,
      MinimumTrade_fl: L.defaultMinimumTrade != null ? L.defaultMinimumTrade : 0,
      TaxOverlay_bt: bit(values.enableTaxOverlay),
      ProposalAccountStatusID_in: statusId,
      TriggerTarget_fl: triggered ? num(values.triggerTarget) : null,
      Withdrawal_bt: w ? 1 : 0, WithdrawalStart_dt: w ? (values.pwStartDate || null) : null,
      ProposalAccountWithdrawalFrequencyID_in: w ? (wf[values.pwFrequency] != null ? wf[values.pwFrequency] : null) : null,
      WithdrawalAmount_fl: w ? num(values.pwAmount) : null,
      ProposalStrategyID_in: comp.ProposalStrategyID_in != null ? comp.ProposalStrategyID_in : null,
      ProposalStrategyVersionID_in: comp.ProposalStrategyVersionID_in != null ? comp.ProposalStrategyVersionID_in : null,
      ProposalCompositeID_in: comp.ProposalCompositeID_in != null ? comp.ProposalCompositeID_in : null,
      ProposalCompositeVersionID_in: comp.ProposalCompositeVersionID_in != null ? comp.ProposalCompositeVersionID_in : null,
      CreatedBy_in: advisorId, CreatedOn_dt: null, AdvisorID_in: advisorId, AIMAccountID_in: null, IsProspectPhantom: 0,
      WithdrawalAmountInitial_fl: num(values.initialWithdrawalAmount) != null ? num(values.initialWithdrawalAmount) : 0,
      WithdrawalStart2_dt: sec ? (values.secondaryPwStartDate || null) : null,
      ProposalAccountWithdrawalFrequencyID2_in: sec ? (wf[values.secondaryPwFrequency] != null ? wf[values.secondaryPwFrequency] : null) : null,
      WithdrawalAmount2_fl: sec ? num(values.secondaryPwAmount) : null,
      AnniversaryRebalance_bt: bit(values.anniversaryRebalance), EnableAllIncomeWithdrawals_bt: bit(values.allIncomeWithdrawal),
      AdvisorFeeScheduleID_in: null, PlatformFeeScheduleID_in: null,
      Name_vc: acct.AccountName, TaxHarvest_bt: bit(values.enableTaxHarvestOnly), ProgramNameID_in: null,
      StepoutAllowed_bt: bit(values.allowStepOuts)
    };

    return sqlSerialize('proposalaccount', L.columns || Object.keys(row), row) + '  -- ProposalAccountID ' + proposalAccountId;
  }

  // ProposalAccountVersion (PAV) — first revision of the enrolled account.
  function buildPavInsert(acct, values, proposalAccountId, advisorId) {
    const L = state.paLookups || {};
    const cfg = L.pav || { columns: [] };
    const row = {
      ProposalAccountID_in: proposalAccountId, Revision_in: 1, Description_vc: acct.AccountName,
      CreatedBy_in: advisorId, CreatedOn_dt: null, ImpersonatingUserID_in: null,
      IsRelevantToTrading_bt: cfg.isRelevantToTrading != null ? cfg.isRelevantToTrading : 1
    };
    return sqlSerialize('ProposalAccountVersion', cfg.columns, row);
  }
  // ProposalAccountStatusHistory (PASH) — opening status row.
  function buildPashInsert(proposalAccountId, advisorId, statusId) {
    const L = state.paLookups || {};
    const cfg = L.pash || { columns: [] };
    const row = {
      ProposalAccountID_in: proposalAccountId, ProposalAccountStatusID_in: statusId,
      ProposalStatusID_in: cfg.proposalStatusId != null ? cfg.proposalStatusId : 1,
      CreatedOn_dt: null, CreatedBy_in: advisorId, ImpersonatingUserID_in: null
    };
    return sqlSerialize('ProposalAccountStatusHistory', cfg.columns, row);
  }
  const sqlStr = v => (v == null || v === '' ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'");
  // Submission chain: Schedule → Signature → Activity → PAActivity → SubmitActivity.
  // Uses scope_identity() to thread the generated identity IDs, per-account variables.
  function buildSubmissionChain(paId, advisorId, advisorName) {
    const sub = (state.paLookups || {}).submission || {};
    const by = advisorId == null ? 'NULL' : advisorId;
    const v = k => '@' + k + '_' + paId;
    return [
      'insert into ProposalAccountSchedule (ProposalAccountID_in, Revision_in, SchedulePath_vc, SubmittedOn_dt, SubmittedBy_in)',
      '  values (' + paId + ', 1, ' + sqlStr(sub.schedulePath || '/proposal/bulk-enroll') + ', getdate(), ' + by + ');',
      'declare ' + v('scheduleID') + ' int = scope_identity();',
      'insert into Signature (UserAccountID_in, Name_vc, Title_vc, SignedOn_dt, ImpersonatingUserID_in)',
      '  values (' + by + ', ' + sqlStr(advisorName || sub.signatureTitle || 'Bulk Enrollment') + ', ' + sqlStr(String(paId)) + ', getdate(), NULL);',
      'declare ' + v('signatureID') + ' int = scope_identity();',
      'insert into Activity.Activity (ActivityTypeID_in, Text_vc, CreatedBy_in, CreatedOn_dt, ImpersonatingUserID_in, RegisteredUserID_in, ActivitySourceID_in)',
      '  values (' + (sub.activityTypeId != null ? sub.activityTypeId : 1) + ', ' + sqlStr(String(paId)) + ', ' + by + ', getdate(), NULL, ' + by + ', ' + (sub.activitySourceId != null ? sub.activitySourceId : 1) + ');',
      'declare ' + v('activityID') + ' int = scope_identity();',
      'insert into Activity.ProposalAccountActivity (ProposalAccountID_in, ActivityID_in)',
      '  values (' + paId + ', ' + v('activityID') + ');',
      'declare ' + v('paActivityID') + ' int = scope_identity();',
      'insert into Activity.ProposalAccountSubmitActivity (ProposalAccountActivityID_in, ProposalAccountScheduleID_in, SignatureID_in)',
      '  values (' + v('paActivityID') + ', ' + v('scheduleID') + ', ' + v('signatureID') + ');'
    ].join('\n');
  }
  function buildCarveOutInsert(paId, row) {
    const cols = (state.paLookups || {}).carveOutColumns || ['ProposalAccountID_in', 'Symbol_vc', 'CUSIP_vc', 'Description_vc', 'AcquisitionDate_dt', 'Quantity_fl'];
    const r = {
      ProposalAccountID_in: paId, Symbol_vc: (row.ticker || '').toUpperCase(), CUSIP_vc: null, Description_vc: null,
      AcquisitionDate_dt: row.acqDate || '1900-01-01', Quantity_fl: (row.quantity === '' || row.quantity == null) ? null : Number(row.quantity)
    };
    return sqlSerialize('ProposalAccountCarveOut', cols, r);
  }
  function buildRestrictionInsert(paId, row) {
    const L = state.paLookups || {};
    const cols = L.restrictionColumns || ['ProposalAccountID_in', 'Symbol_vc', 'Name_vc', 'ProposalAccountRestrictionTypeID_in'];
    const typeId = (L.restrictionTypeId || {})[row.restriction];
    const r = { ProposalAccountID_in: paId, Symbol_vc: (row.ticker || '').toUpperCase(), Name_vc: (row.ticker || '').toUpperCase(), ProposalAccountRestrictionTypeID_in: typeId != null ? typeId : null };
    return sqlSerialize('ProposalAccountRestriction', cols, r);
  }

  // Full shell → version → status-history → submission chain for one account.
  function buildEnrollmentBlock(acct, values, proposalAccountId, actor) {
    const L = state.paLookups || {};
    const advisorId = resolveAdvisorId(acct.FirmId, values.advisor);
    const statusId = L.newProposalAccountStatusId != null ? L.newProposalAccountStatusId : 1;
    const pa = buildProposalInsert(acct, values, proposalAccountId, actor, advisorId, statusId);
    const pav = buildPavInsert(acct, values, proposalAccountId, advisorId);
    const pash = buildPashInsert(proposalAccountId, advisorId, statusId);
    const submit = buildSubmissionChain(proposalAccountId, advisorId, values.advisor);
    return { pa, pav, pash, submit, block: [pa, pav, pash, submit].join('\n') };
  }

  // Validate carve-out / restriction sub-rows against the accounts being enrolled.
  function validateSubrows(values, enrollSet, subrows) {
    subrows = subrows || {};
    const errs = [];
    const nonEmpty = r => Object.keys(r).some(k => String(r[k] || '').trim() !== '');
    const cos = (subrows.carveOuts || []).filter(nonEmpty);
    const res = (subrows.restrictions || []).filter(nonEmpty);
    if (values.hasCarveOuts === 'Yes' && !cos.length) errs.push({ message: 'Has Carve Outs is Yes — add at least one carve-out row.' });
    if (values.hasCarveOuts !== 'Yes' && cos.length) errs.push({ message: 'Set Has Carve Outs to Yes to include carve-outs.' });
    cos.forEach((r, i) => {
      if (!enrollSet.has(Number(r.account))) errs.push({ message: 'Carve-out row ' + (i + 1) + ': account ' + (r.account || '(blank)') + ' is not in the accounts being enrolled.' });
      if (!String(r.ticker || '').trim()) errs.push({ message: 'Carve-out row ' + (i + 1) + ': ticker is required.' });
      if (String(r.quantity || '').trim() === '' || isNaN(Number(r.quantity))) errs.push({ message: 'Carve-out row ' + (i + 1) + ': quantity must be a number.' });
    });
    if (values.hasPretradeRestrictions === 'Yes' && !res.length) errs.push({ message: 'Has Pretrade Restrictions is Yes — add at least one restriction row.' });
    if (values.hasPretradeRestrictions !== 'Yes' && res.length) errs.push({ message: 'Set Has Pretrade Restrictions to Yes to include restrictions.' });
    res.forEach((r, i) => {
      if (!enrollSet.has(Number(r.account))) errs.push({ message: 'Restriction row ' + (i + 1) + ': account ' + (r.account || '(blank)') + ' is not in the accounts being enrolled.' });
      if (!String(r.ticker || '').trim()) errs.push({ message: 'Restriction row ' + (i + 1) + ': ticker is required.' });
      if (!String(r.restriction || '').trim()) errs.push({ message: 'Restriction row ' + (i + 1) + ': restriction is required.' });
    });
    return errs;
  }

  // Create proposal accounts for a list of account numbers using shared settings.
  // Writes proposalaccountversion (v1 snapshot) + proposalaccounthistory (enroll
  // event) per account and one Execution Log entry, attributed to the admin.
  function bulkEnroll(accountNumbers, values, subrows) {
    subrows = subrows || { carveOuts: [], restrictions: [] };
    const targets = resolveEnrollTargets(accountNumbers);
    const enrollSet = new Set(targets.enrollable.map(t => t.AccountId));
    const errors = validateEnrollment(values).concat(validateSubrows(values, enrollSet, subrows));
    if (errors.length) return { ok: false, errors };
    if (!targets.enrollable.length) return { ok: false, errors: [{ message: 'No enrollable accounts in the list (all unknown, not permitted, or already enrolled).' }], targets };

    const actor = state.user ? state.user.email : 'anonymous';
    const now = new Date().toISOString();
    const batchId = 'enroll-' + Date.now().toString(36);
    const enrolledList = readEnrolled();
    const hist = (() => { try { return JSON.parse(localStorage.getItem(PA_HISTORY_KEY)) || []; } catch (_) { return []; } })();
    const vers = (() => { try { return JSON.parse(localStorage.getItem(PA_VERSION_KEY)) || []; } catch (_) { return []; } })();
    let nextId = nextProposalAccountId();
    const created = [];

    targets.enrollable.forEach(t => {
      const id = nextId++;
      const row = enrollRowFromValues(t.AccountId, t.FirmId, values, id, actor, now);
      enrolledList.push(row);
      hist.unshift({ HistoryId: uid('pah'), BatchId: batchId, ProposalAccountId: id, AccountId: t.AccountId, FirmId: t.FirmId, Field: 'Enrollment', OldValue: '(not enrolled)', NewValue: values.model, ChangedBy: actor, ChangedAt: now, Version: 1 });
      vers.unshift({ VersionId: uid('pav'), BatchId: batchId, ProposalAccountId: id, AccountId: t.AccountId, Version: 1, Field: 'Enrollment', Value: values.model, Snapshot: Object.assign({}, row), CreatedBy: actor, CreatedAt: now });
      created.push({ AccountId: t.AccountId, ProposalAccountId: id, FirmId: t.FirmId });
    });

    writeEnrolled(enrolledList);
    localStorage.setItem(PA_HISTORY_KEY, JSON.stringify(hist.slice(0, 2000)));
    localStorage.setItem(PA_VERSION_KEY, JSON.stringify(vers.slice(0, 2000)));
    applyProposalEdits();
    state.datasets.proposalaccounthistory = hist.slice();
    state.datasets.proposalaccountversion = vers.slice();

    const firmsHit = [...new Set(created.map(c => c.FirmId))];
    logExecution({
      queryId: 'bulk-enroll', kind: 'enroll',
      name: 'Bulk enroll — ' + values.model + ' (' + created.length + ' accounts)',
      firmId: firmsHit.length === 1 ? firmsHit[0] : 'multi',
      rowCount: created.length, durationMs: 0, success: true,
      batchId, model: values.model, accountIds: created.map(c => c.AccountId)
    });

    // Group carve-out / restriction rows by account number.
    const nonEmpty = r => Object.keys(r).some(k => String(r[k] || '').trim() !== '');
    const coByAcct = {}, resByAcct = {};
    (subrows.carveOuts || []).filter(nonEmpty).forEach(r => { (coByAcct[Number(r.account)] = coByAcct[Number(r.account)] || []).push(r); });
    (subrows.restrictions || []).filter(nonEmpty).forEach(r => { (resByAcct[Number(r.account)] = resByAcct[Number(r.account)] || []).push(r); });

    // Systems-ready SQL: full chain per account (+ carve-outs / restrictions).
    const inserts = created.map(c => {
      const acct = (state.datasets.accounts || []).find(a => a.AccountId === c.AccountId) || { AccountId: c.AccountId, FirmId: c.FirmId, AccountName: String(c.AccountId) };
      const b = buildEnrollmentBlock(acct, values, c.ProposalAccountId, actor);
      let block = b.block;
      const cos = (coByAcct[c.AccountId] || []).map(r => buildCarveOutInsert(c.ProposalAccountId, r));
      const res = (resByAcct[c.AccountId] || []).map(r => buildRestrictionInsert(c.ProposalAccountId, r));
      if (cos.length) block += '\n-- carve-outs\n' + cos.join('\n');
      if (res.length) block += '\n-- pre-trade restrictions\n' + res.join('\n');
      return { AccountId: c.AccountId, ProposalAccountId: c.ProposalAccountId, sql: block, pa: b.pa, pav: b.pav, pash: b.pash, submit: b.submit, carveOuts: cos.length, restrictions: res.length };
    });
    const sql = '-- Bulk enrollment ' + batchId + ' — ' + inserts.length + ' account(s) — by ' + actor
      + '\n-- proposalaccount -> ProposalAccountVersion -> ProposalAccountStatusHistory -> Schedule/Signature/Activity/SubmitActivity'
      + ((subrows.carveOuts || []).filter(nonEmpty).length ? ' -> CarveOut' : '')
      + ((subrows.restrictions || []).filter(nonEmpty).length ? ' -> Restriction' : '') + '\n\n'
      + inserts.map(i => '-- Account ' + i.AccountId + ' / ProposalAccountID ' + i.ProposalAccountId + '\n' + i.sql).join('\n\n');

    return { ok: true, batchId, count: created.length, created, inserts, sql, skipped: { alreadyEnrolled: targets.alreadyEnrolled, notFound: targets.notFound }, actor };
  }

  global.QT = {
    state, loadAll,
    proposalFields, resolveProposalAccounts, bulkUpdateProposals, proposalHistory, proposalVersions, proposalHistoryFor, resetProposals,
    enrollmentSchema, enrollmentFields, validateEnrollment, enrollmentRequiredNow, resolveEnrollTargets, unenrolledAccounts, bulkEnroll,
    login, logout, currentUser,
    firmsForUser, queriesForFirm, getQuery, canAccessQuery, canUseAssistant, canRunGlobal,
    runQuery, runRawSql, inferColumns,
    readLog, clearLog,
    createSchedule, deleteSchedule, schedulesFor, runScheduleById, tickScheduler,
    saveReport, reportsFor, getReport, deleteReport, reportLocationFor,
    datasetCount, isMissionCritical, setMissionCritical, missionCriticalSet,
    setUserAccess, setQueryAccess, resetAccess, accessModified,
    createUser, deleteCreatedUser,
    ALL_FIRMS, GLOBAL, isGlobal, resolveFirmParam,
    firmById: id => state.firms.find(f => f.id === id),
    groupById: id => state.groups.find(g => g.id === id)
  };
})(window);
