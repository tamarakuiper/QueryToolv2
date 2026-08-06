/* QueryTool SPA — hash-routed, rendered from JSON. No build step, no framework. */
(function () {
  'use strict';

  const root = document.getElementById('app');
  const App = { currentFirmId: null, lastResult: null };

  /* ---------- tiny helpers ---------- */
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const go = (hash) => { window.location.hash = hash; };

  // Change this value to the secret word or phrase you want to use.
  const QUERY_EASTER_EGG = 'hackathon';
  const isQueryEasterEgg = (value) => String(value || '').trim().toLowerCase() === QUERY_EASTER_EGG.toLowerCase();

  let rickrollMusic = null;

function startRickrollMusic(restart = false) {
  if (!rickrollMusic) {
    rickrollMusic = document.createElement('video');
    rickrollMusic.id = 'rickrollMusic';
    rickrollMusic.src = 'assets/rickroll.mp4';
    rickrollMusic.loop = true;
    rickrollMusic.preload = 'auto';
    rickrollMusic.playsInline = true;
    rickrollMusic.setAttribute('aria-hidden', 'true');

    // Keep the video offscreen while allowing its audio to play.
    Object.assign(rickrollMusic.style, {
      position: 'fixed',
      left: '-9999px',
      top: '-9999px',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none'
    });

    document.body.appendChild(rickrollMusic);
  }

  if (restart) {
    try {
      rickrollMusic.currentTime = 0;
    } catch (error) {
      // Metadata may not be loaded yet. Playback can still begin.
    }
  }

  return rickrollMusic.play();
}

function stopRickrollMusic() {
  if (!rickrollMusic) return;

  rickrollMusic.pause();

  try {
    rickrollMusic.currentTime = 0;
  } catch (error) {
    // Safe to ignore if the media has not loaded yet.
  }
}

  /* ---------- toasts ---------- */
  function ensureToastHost() {
    let host = document.getElementById('toastHost');
    if (!host) { host = h('<div id="toastHost" class="toast-host"></div>'); document.body.appendChild(host); }
    return host;
  }
  function toast(message, opts) {
    opts = opts || {};
    const host = ensureToastHost();
    const t = h(`<div class="toast ${esc(opts.tone || 'info')}">
      ${opts.title ? `<strong>${esc(opts.title)}</strong>` : ''}
      <span>${esc(message)}</span>
      ${opts.actionLabel ? `<button class="toast-action">${esc(opts.actionLabel)}</button>` : ''}
    </div>`);
    host.appendChild(t);
    if (opts.actionLabel && typeof opts.onAction === 'function') {
      $('.toast-action', t).addEventListener('click', () => { opts.onAction(); t.remove(); });
    }
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, opts.duration || 6000);
  }

  /* ---------- boot ---------- */
  async function init() {
    try {
      await QT.loadAll();
      document.title = QT.state.app.branding.logoText + ' — ' + QT.state.app.app.tagline;
    } catch (err) {
      root.innerHTML = '';
      root.appendChild(h(`<div class="fatal">
        <h1>Could not load configuration</h1>
        <p>${esc(err.message)}</p>
        <p class="muted">This app reads JSON files over <code>fetch()</code>, which browsers block on <code>file://</code>.
        Serve the folder with a tiny static server and open it over http, e.g.</p>
        <pre>python -m http.server 8000</pre>
        <p class="muted">then visit <code>http://localhost:8000/index.html</code>. See README.md.</p>
      </div>`));
      return;
    }
    const user = QT.currentUser();
    if (user) App.currentFirmId = restoreFirm(user);
    window.addEventListener('hashchange', route);
    route();
    startScheduler();
  }

  /* ---------- scheduler ticker ---------- */
  function startScheduler() {
    const tick = () => {
      const user = QT.currentUser();
      if (!user) return;
      const produced = QT.tickScheduler();
      produced.forEach(rep => {
        // Only notify the signed-in user about their own reports.
        if (rep.createdBy !== user.email && !user.isAdmin) return;
        const piiNote = rep.pii && rep.pii.isPII ? ' · contains PII' : '';
        toast(`“${rep.name}” saved to ${rep.location} · ${rep.meta.rowCount} rows${piiNote}`, {
          title: 'Report generated', tone: rep.pii && rep.pii.isPII ? 'warn' : 'good',
          actionLabel: 'View', duration: 9000, onAction: () => go('/report/' + rep.id)
        });
      });
      if (produced.length && ['schedules', 'reports'].includes(App.currentView)) route();
    };
    tick();
    setInterval(tick, 12000);
  }

  function restoreFirm(user) {
    const firms = QT.firmsForUser(user);
    const saved = localStorage.getItem('qt.firm');
    if (saved === 'global' && QT.canRunGlobal(user)) return 'global';
    const savedNum = Number(saved);
    if (firms.some(f => f.id === savedNum)) return savedNum;
    return firms.length ? firms[0].id : null;
  }
  function setFirm(id) { App.currentFirmId = id; localStorage.setItem('qt.firm', String(id)); }
  function firmLabel(id) {
    if (id === 'global') return 'Global';
    if (id === 'multi') return 'Multiple firms';
    if (id === 'all' || id == null) return 'All firms';
    const f = QT.firmById(id);
    return f ? f.name : String(id);
  }

  /* ---------- router ---------- */
  function route() {
    const user = QT.currentUser();
    const hash = window.location.hash.replace(/^#\/?/, '');
    const [view, ...rest] = hash.split('/');
    if (view !== 'rickroll') {
       stopRickrollMusic();
    }
    if (!user) return renderLogin();
    if (!App.currentFirmId) App.currentFirmId = restoreFirm(user);
    App.currentView = view || 'queries';

    switch (view) {
      case '': case 'queries': return renderQueries();
      case 'run': return renderRun(rest[0]);
      case 'assistant': return renderAssistant();
      case 'rickroll': return renderRickroll();
      case 'schedules': return renderSchedules();
      case 'reports': return renderReports();
      case 'report': return renderReportDetail(rest[0]);
      case 'logs': return renderLogs();
      case 'access': return renderAccess();
      case 'proposals': return renderProposals();
      case 'enroll': return renderEnroll();
      case 'governance': return renderGovernance();
      case 'editor': return renderEditor(rest[0]);
      default: return renderQueries();
    }
  }

  /* ---------- shell ---------- */
  function shell(activeView, contentEl) {
    const user = QT.currentUser();
    const b = QT.state.app.branding;
    const firms = QT.firmsForUser(user);
    const feats = QT.state.app.features;

    root.innerHTML = '';
    // Everyday tabs stay inline; admin-only tools collapse into an "Admin ▾" menu.
    const mainNav = [
      { id: 'queries', label: 'Queries', href: '#/queries' },
      QT.canUseAssistant(user) && { id: 'assistant', label: 'SQL Assistant', href: '#/assistant' },
      feats.scheduling !== false && { id: 'schedules', label: 'Schedules', href: '#/schedules' },
      feats.scheduling !== false && { id: 'reports', label: 'Reports', href: '#/reports' }
    ].filter(Boolean);
    const adminNav = (user.isAdmin ? [
      feats.analytics && { id: 'logs', label: 'Execution Log', href: '#/logs' },
      { id: 'enroll', label: 'Bulk Enrollment', href: '#/enroll' },
      { id: 'proposals', label: 'Bulk Editor', href: '#/proposals' },
      { id: 'access', label: 'Access & Permissions', href: '#/access' },
      feats.scheduling !== false && { id: 'governance', label: 'Data Governance', href: '#/governance' },
      feats.queryEditor && { id: 'editor', label: 'Query Editor', href: '#/editor' }
    ].filter(Boolean) : []).sort((a, b) => a.label.localeCompare(b.label));
    const adminActive = adminNav.some(n => n.id === activeView);

    const firmOptions = firms.map(f => `<option value="${f.id}" ${f.id === App.currentFirmId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')
      + (QT.canRunGlobal(user) ? `<option value="global" ${App.currentFirmId === 'global' ? 'selected' : ''}>🌐 Global (all firms)</option>` : '');

    const bar = h(`<header class="topbar">
      <div class="brand">
        <span class="mark">${esc(b.logoMark)}</span>
        <span class="logo">${esc(b.logoText)}</span>
      </div>
      <nav class="nav">
        ${mainNav.map(n => `<a href="${n.href}" class="${n.id === activeView ? 'active' : ''}">${esc(n.label)}</a>`).join('')}
        ${adminNav.length ? `<div class="nav-dropdown">
          <button class="nav-admin ${adminActive ? 'active' : ''}" id="adminMenuBtn" aria-haspopup="true" aria-expanded="false">Admin Tools <span class="caret">▾</span></button>
          <div class="nav-menu hidden" id="adminMenu">
            <div class="nav-menu-head">Admin tools</div>
            ${adminNav.map(n => `<a href="${n.href}" class="${n.id === activeView ? 'active' : ''}">${esc(n.label)}</a>`).join('')}
          </div>
        </div>` : ''}
      </nav>
      <div class="topbar-right">
        <label class="firm-picker">
          <span>Firm</span>
          <select id="firmSelect">${firmOptions}</select>
        </label>
        <div class="usermenu">
          <span class="avatar">${esc(initials(user.displayName))}</span>
          <div class="usercol">
            <strong>${esc(user.displayName)}</strong>
            <span class="muted small">${esc(user.isAdmin ? 'Administrator' : (user.groups || []).join(', '))}</span>
          </div>
          <button class="btn ghost" id="logoutBtn">Sign out</button>
        </div>
      </div>
    </header>`);

    const main = h('<main class="content"></main>');
    main.appendChild(contentEl);
    root.appendChild(bar);
    root.appendChild(main);

    $('#firmSelect').addEventListener('change', e => {
      const v = e.target.value;
      setFirm(v === 'global' ? 'global' : Number(v));
      route();
    });
    $('#logoutBtn').addEventListener('click', () => { QT.logout(); go('/login'); route(); });

    const adminBtn = $('#adminMenuBtn');
    if (adminBtn) {
      const menu = $('#adminMenu');
      menu.addEventListener('click', e => e.stopPropagation());
      adminBtn.addEventListener('click', e => {
        e.stopPropagation();
        const willOpen = menu.classList.contains('hidden');
        menu.classList.toggle('hidden', !willOpen);
        adminBtn.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) {
          // close on the next outside click; self-removing so listeners don't pile up
          setTimeout(() => document.addEventListener('click', function away() {
            menu.classList.add('hidden'); adminBtn.setAttribute('aria-expanded', 'false');
            document.removeEventListener('click', away);
          }, { once: true }), 0);
        }
      });
    }
  }

  function initials(name) { return String(name).split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase(); }

  /* ---------- login ---------- */
  function renderLogin() {
    const b = QT.state.app.branding;
    const app = QT.state.app.app;
    root.innerHTML = '';
    const view = h(`<div class="login-wrap">
      <div class="login-card">
        <div class="brand big"><span class="mark">${esc(b.logoMark)}</span><span class="logo">${esc(b.logoText)}</span></div>
        <p class="tagline">${esc(app.tagline)}</p>
        <form id="loginForm" class="stack">
          <label class="field"><span>Email</span>
            <input type="email" id="email" autocomplete="username" placeholder="ops@demo.com" required></label>
          <label class="field"><span>Password</span>
            <input type="password" id="password" autocomplete="current-password" placeholder="••••••••" required></label>
          <div id="loginError" class="error hidden"></div>
          <button class="btn primary" type="submit">Sign in</button>
        </form>
        <div class="demo-accounts">
          <span class="muted small">Demo accounts (click to fill):</span>
          <div class="chips">
            ${QT.state.users.map(u => `<button type="button" class="chip demo-fill" data-email="${esc(u.email)}" data-pass="${esc(u.password)}">${esc(u.email)}</button>`).join('')}
          </div>
        </div>
      </div>
    </div>`);
    root.appendChild(view);

    $$('.demo-fill', view).forEach(btn => btn.addEventListener('click', () => {
      $('#email').value = btn.dataset.email;
      $('#password').value = btn.dataset.pass;
    }));
    $('#loginForm').addEventListener('submit', e => {
      e.preventDefault();
      const res = QT.login($('#email').value, $('#password').value);
      const errBox = $('#loginError');
      if (!res.ok) { errBox.textContent = res.error; errBox.classList.remove('hidden'); return; }
      App.currentFirmId = restoreFirm(res.user);
      go('/queries'); route();
    });
  }

  /* ---------- queries list ---------- */
  function renderQueries() {
    const user = QT.currentUser();
    const queries = QT.queriesForFirm(user, App.currentFirmId);
    const byCat = {};
    queries.forEach(q => { (byCat[q.category] = byCat[q.category] || []).push(q); });

    const content = h(`<div class="stack">
      <div class="page-head">
        <div>
          <h1>Approved Queries</h1>
          <p class="muted">${App.currentFirmId === 'all' ? '🌐 ' : ''}${esc(firmLabel(App.currentFirmId))} · ${queries.length} available to you</p>
        </div>
      </div>


      ${Object.keys(byCat).sort().map(cat => `
        <section class="cat">
          <h2 class="cat-title">${esc(cat)}</h2>
          <div class="card-grid">
            ${byCat[cat].map(q => `
              <a class="query-card" href="#/run/${esc(q.id)}">
                <div class="qc-head"><h3>${esc(q.name)}</h3></div>
                <p class="muted">${esc(q.description)}</p>
                <div class="tags">${(q.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
              </a>`).join('')}
          </div>
        </section>`).join('') || '<p class="muted">No queries are available for your groups in this firm.</p>'}
    </div>`);
    shell('queries', content);

  }

    function renderRickroll() {
    const content = h(`
      <div class="rickroll-page">
        <div class="rickroll-card panel">
          <span class="easter-egg-kicker">
            Secret result unlocked
          </span>

          <h1>Never gonna give your query up.</h1>

          <p class="muted">
            You found the easter egg. Your reward is extremely
            serious data governance training.
          </p>

          <div
            class="rickroll-video"
            style="position:relative; overflow:hidden; background:#111;"
          >
            <img
              id="rickrollPreview"
              src="https://media1.tenor.com/m/x8v1oNUOmg4AAAAd/rickroll-roll.gif"
              alt="Animated Rick Astley preview"
              loading="eager"
              referrerpolicy="no-referrer"
              style="
                display:block;
                width:100%;
                height:100%;
                object-fit:cover;
              "
            >
          </div>

          <p
            id="rickrollMediaError"
            class="error hidden"
            role="alert"
          ></p>

          <div class="form-actions">
            <a
              class="btn primary"
              id="rickrollBack"
              href="#/assistant"
            >
              Back to SQL Assistant
            </a>

            <button
              class="btn ghost"
              id="rickrollMusicToggle"
              type="button"
            >
              Pause music
            </button>
          </div>
        </div>
      </div>
    `);

    shell('assistant', content);

    const musicButton = $('#rickrollMusicToggle');
    const errorBox = $('#rickrollMediaError');

    function updateMusicButton() {
      const isPlaying =
        rickrollMusic &&
        !rickrollMusic.paused;

      musicButton.textContent = isPlaying
        ? 'Pause music'
        : 'Play music';
    }

    // Try again in case the first playback request was blocked.
    if (!rickrollMusic || rickrollMusic.paused) {
      startRickrollMusic().catch(error => {
        console.warn('Automatic music playback was blocked.', error);

        errorBox.textContent =
          'Your browser blocked automatic sound. Select “Play music” to begin.';

        errorBox.classList.remove('hidden');
        updateMusicButton();
      });
    }

    musicButton.addEventListener('click', async () => {
      errorBox.classList.add('hidden');
      errorBox.textContent = '';

      if (rickrollMusic && !rickrollMusic.paused) {
        rickrollMusic.pause();
        updateMusicButton();
        return;
      }

      try {
        await startRickrollMusic();
      } catch (error) {
        errorBox.textContent =
          'The MP4 could not play. Confirm that assets/rickroll.mp4 exists and is valid.';

        errorBox.classList.remove('hidden');
      }

      updateMusicButton();
    });

    $('#rickrollBack').addEventListener('click', stopRickrollMusic);

    updateMusicButton();
  }

  /* ---------- query runner ---------- */
  function renderRun(queryId) {
    const user = QT.currentUser();
    const def = QT.getQuery(queryId);
    if (!def || !QT.canAccessQuery(user, def)) {
      const c = h('<div class="stack"><a class="back" href="#/queries">← Queries</a><p class="error">You do not have access to that query.</p></div>');
      return shell('queries', c);
    }
    const params = (def.parameters || []).filter(p => p.source !== 'firm' && !p.hidden);
    const plannedPii = plannedPiiForColumns(def.result && def.result.columns);

    const content = h(`<div class="stack">
      <a class="back" href="#/queries">← Queries</a>
      <div class="page-head">
        <div><h1>${esc(def.name)}</h1><p class="muted">${esc(def.description)}</p></div>
      </div>
      ${plannedPii.isPII ? `<div class="pii-banner may"><span class="pii-ico">⚠️</span>
        <div><strong>May contain PII</strong>
          <span class="muted small">This report includes fields that look like personal data (${esc(plannedPii.categories.join(', '))}). It will be confirmed when you run it.</span></div></div>` : ''}
      <div class="run-grid">
        <form id="paramForm" class="panel param-panel">
          <h3 class="panel-title">Parameters</h3>
          ${params.map(renderField).join('') || '<p class="muted small">This query takes no parameters.</p>'}
          <div class="form-actions">
            <button class="btn primary" type="submit">Run query</button>
            <button class="btn ghost" type="button" id="scheduleBtn">Schedule…</button>
          </div>
        </form>
        <div class="panel result-panel" id="resultPanel">
          <div class="placeholder">Set parameters and run the query to see results.</div>
        </div>
      </div>
    </div>`);
    shell('queries', content);

    $('#paramForm').addEventListener('submit', e => {
      e.preventDefault();
      const values = collectParams(params);
      const res = QT.runQuery(def, App.currentFirmId, values);
      renderResultPanel($('#resultPanel'), res, def, App.currentFirmId);
    });
    $('#scheduleBtn').addEventListener('click', () => openScheduleModal({
      kind: 'query', queryId: def.id, params: collectParams(params),
      name: def.name, firmId: App.currentFirmId
    }));
  }

  function renderField(p) {
    const label = `<span class="lbl">${esc(p.label || p.name)}${p.required ? ' <em class="req">*</em>' : ''}</span>`;
    const id = 'p_' + p.name;
    const control = p.control || (p.type && p.type.endsWith('[]') ? 'multiSelect' : 'text');
    switch (control) {
      case 'multiSelect':
        return `<div class="field" data-name="${esc(p.name)}" data-control="multiSelect"><label>${label}</label>
          <div class="checks">${(p.options || []).map(o => {
            const checked = (p.default || []).includes(o.value) ? 'checked' : '';
            return `<label class="check"><input type="checkbox" value="${esc(o.value)}" ${checked}><span>${esc(o.label)}</span></label>`;
          }).join('')}</div></div>`;
      case 'select':
        return `<label class="field" data-name="${esc(p.name)}" data-control="select">${label}
          <select id="${id}">${(p.options || []).map(o => `<option value="${esc(o.value)}" ${o.value === p.default ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
      case 'number':
        return `<label class="field" data-name="${esc(p.name)}" data-control="number">${label}
          <input type="number" id="${id}" value="${p.default != null ? esc(p.default) : ''}" ${p.min != null ? `min="${p.min}"` : ''} ${p.max != null ? `max="${p.max}"` : ''}></label>`;
      case 'date':
        return `<label class="field" data-name="${esc(p.name)}" data-control="date">${label}
          <input type="date" id="${id}" value="${p.default != null ? esc(p.default) : ''}"></label>`;
      case 'toggle':
        return `<label class="field inline" data-name="${esc(p.name)}" data-control="toggle">
          <input type="checkbox" id="${id}" ${p.default ? 'checked' : ''}>${label}</label>`;
      case 'textarea':
        return `<label class="field" data-name="${esc(p.name)}" data-control="textarea">${label}
          <textarea id="${id}">${esc(p.default || '')}</textarea></label>`;
      default:
        return `<label class="field" data-name="${esc(p.name)}" data-control="text">${label}
          <input type="text" id="${id}" value="${p.default != null ? esc(p.default) : ''}"></label>`;
    }
  }

  function collectParams(params) {
    const values = {};
    params.forEach(p => {
      const wrap = $(`[data-name="${p.name}"]`);
      const control = wrap.dataset.control;
      if (control === 'multiSelect') {
        values[p.name] = $$('input:checked', wrap).map(i => i.value);
      } else if (control === 'toggle') {
        values[p.name] = $('input', wrap).checked;
      } else {
        const input = $('input, select, textarea', wrap);
        values[p.name] = input ? input.value : '';
      }
    });
    return values;
  }

  /* ---------- result rendering (shared) ---------- */
  function renderResultPanel(panel, res, def) {
    panel.innerHTML = '';
    if (!res.ok) {
      panel.appendChild(h(`<div class="error-box"><strong>Could not run query</strong><ul>${res.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`));
      return;
    }
    App.lastResult = res;
    const title = (def && def.result && def.result.title) || 'Results';
    const csvOn = QT.state.app.features.csvExport;
    const pii = PII.detect(res.columns);
    const scope = arguments.length > 3 ? arguments[3] : App.currentFirmId;
    const scopeChip = (scope === 'global')
      ? `<span class="scope-chip">🌐 Global</span>`
      : (scope === 'all')
        ? `<span class="scope-chip">🌐 all firms</span>`
        : `<span class="scope-chip firm">${esc(firmLabel(scope))}</span>`;
    const revealControl = pii.isPII ? immutaRevealButton() : '';
    const exportControl = csvOn
      ? `<button class="btn ghost" id="csvBtn"${pii.isPII ? ' disabled title="Reveal PII before exporting"' : ''}>Export CSV</button>`
      : '';
    const head = h(`<div class="result-head">
      <div><h3 class="panel-title">${esc(title)}</h3>
        <span class="muted small">${res.meta.rowCount} rows · ${res.meta.durationMs} ms${res.meta.truncated ? ' · truncated' : ''}</span></div>
      <div class="result-head-right">${scopeChip}${revealControl}${exportControl}</div>
    </div>`);
    panel.appendChild(head);
    // Final-run PII indication: explicitly confirm whether it contains PII or not.
    panel.appendChild(pii.isPII ? piiBanner(pii) : noPiiNote());

    const csvButton = csvOn ? $('#csvBtn', panel) : null;
    mountProtectedTable(panel, res.columns, res.rows, pii, $('[data-pii-reveal]', panel), csvButton);

    if (csvButton) csvButton.addEventListener('click', () => {
      const name = (def ? def.id : 'query') + '-' + Date.now() + '.csv';
      Fmt.downloadCSV(name, res.columns, res.rows);
    });
  }

  function piiBanner(pii) {
    return h(`<div class="pii-banner">
      <span class="pii-ico">🔒</span>
      <div><strong>Contains PII</strong>
        <span class="muted small">This result set includes personally identifiable information: ${esc(pii.categories.join(', '))}. PII columns are masked until revealed through Immuta.</span></div>
    </div>`);
  }
  function immutaRevealButton() {
    return `<button class="btn immuta-reveal" type="button" data-pii-reveal aria-pressed="false" title="Reveal masked PII columns">
      <img src="assets/immuta-logo.svg" alt="Immuta"><span>Reveal PII</span>
    </button>`;
  }
  function mountProtectedTable(panel, columns, rows, pii, revealButton, exportButton) {
    const host = h('<div class="pii-table-host"></div>');
    panel.appendChild(host);
    const render = masked => host.replaceChildren(buildTable(columns, rows, { maskPii: masked }));

    if (!pii || !pii.isPII) {
      render(false);
      return;
    }

    render(true);
    if (exportButton) {
      exportButton.disabled = true;
      exportButton.title = 'Reveal PII before exporting';
    }
    if (!revealButton) return;

    revealButton.addEventListener('click', () => {
      render(false);
      revealButton.classList.add('revealed');
      revealButton.disabled = true;
      revealButton.setAttribute('aria-pressed', 'true');
      const label = $('span', revealButton);
      if (label) label.textContent = 'PII revealed';
      revealButton.title = 'PII columns are visible';
      if (exportButton) {
        exportButton.disabled = false;
        exportButton.removeAttribute('title');
      }
    }, { once: true });
  }
  function noPiiNote() {
    return h(`<div class="pii-clear"><span class="pii-ok">✓</span> No PII detected in this result set.</div>`);
  }
  // Pre-run heads-up shown before executing, based on the fields the query will select.
  function piiMayBanner(pii) {
    return h(`<div class="pii-banner may">
      <span class="pii-ico">⚠️</span>
      <div><strong>May contain PII</strong>
        <span class="muted small">This query selects fields that look like personal data (${esc(pii.categories.join(', '))}). It will be confirmed when you run it.</span></div>
    </div>`);
  }
  // Detect PII from the columns a query WILL return, before running it.
  function plannedPiiForColumns(columns) { return PII.detect(columns || []); }
  function plannedPiiForSql(sql, datasetKey) {
    const m = /^SELECT\s+([\s\S]+?)\s+FROM\b/i.exec(sql || '');
    const seg = m ? m[1] : '';
    const tableDef = Object.values(QT.state.schema.tables).find(t => t.dataset === datasetKey);
    const cols = tableDef ? tableDef.columns : {};
    const tokens = seg.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    const fields = [...new Set(tokens)].filter(t => cols[t]);
    return PII.detect(fields.map(f => ({ field: f, label: f, pii: cols[f].pii, piiCategory: cols[f].piiCategory })));
  }

  function buildTable(columns, rows, options) {
    if (!rows.length) return h('<div class="placeholder">No rows matched.</div>');
    const opts = options || {};
    const numeric = t => ['currency', 'number', 'integer'].includes(t);
    const thead = `<tr>${columns.map(c => {
      const isPii = !!PII.classify(c);
      return `<th class="${numeric(c.type) ? 'right' : ''}">${esc(c.label)}${isPii ? ' <span class="pii-tag" title="Personally identifiable information">PII</span>' : ''}</th>`;
    }).join('')}</tr>`;
    const tbody = rows.map(r => `<tr>${columns.map(c => {
      const v = r[c.field];
      const isPii = !!PII.classify(c);
      const align = numeric(c.type) ? 'right' : '';
      if (opts.maskPii && isPii) {
        return `<td class="${align} pii-cell-masked"><span class="pii-mask" aria-label="Masked personally identifiable information">${PII.maskValue(v)}</span></td>`;
      }
      if (c.type === 'badge') return `<td><span class="badge ${Fmt.badgeTone(v)}">${esc(v)}</span></td>`;
      return `<td class="${align}">${esc(Fmt.formatValue(v, c.type))}</td>`;
    }).join('')}</tr>`).join('');
    return h(`<div class="table-wrap"><table class="data"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`);
  }

  /* ---------- SQL Assistant ---------- */
  function renderAssistant() {
    const user = QT.currentUser();
    if (!QT.canUseAssistant(user)) {
      const c = h(`<div class="stack">
        <div class="page-head"><div><h1>SQL Assistant</h1></div></div>
        <div class="panel">
          <div class="gov-banner blocked">
            <span class="gov-ico">🔒</span>
            <div><strong>Not available for your role</strong>
              <span class="muted small">Your role can run <strong>pre-approved reports</strong> only. Open <a href="#/queries">Queries</a> to run an approved report, or ask an administrator for access.</span></div>
          </div>
        </div>
      </div>`);
      return shell('queries', c);
    }
    const firm = QT.firmById(App.currentFirmId);
    const examples = [
      'top 5 accounts by balance',
      'how many accounts per status',
      'active and pending accounts opened after 2021',
      'total market value by asset class',
      'platinum and gold clients',
      'transactions over 100k',
      'total account balance across all firms',
      'count accounts by status for all firms',
      'accounts joined with their holdings'
    ];
    const content = h(`<div class="stack">
      <div class="page-head">
        <div><h1>SQL Assistant</h1>
          <p class="muted">Describe what you want in plain English. The assistant explains what it will do — you review and confirm before anything runs against ${esc(firmLabel(App.currentFirmId))}.</p></div>
      </div>
      <div class="panel">
        <form id="askForm" class="ask">
          <input type="text" id="ask" placeholder="e.g. top 5 accounts by balance" autocomplete="off">
          <button class="btn primary" type="submit">Describe query</button>
        </form>
        <div class="examples">${examples.map(e => `<button class="chip ex" data-q="${esc(e)}">${esc(e)}</button>`).join('')}</div>
      </div>
      <div id="asstOut"></div>
    </div>`);
    shell('assistant', content);

    const run = (question) => {
      const out = $('#asstOut');
      const gen = SQLLLM.generate(question, QT.state.schema);
      out.innerHTML = '';
      if (!gen.ok) { out.appendChild(h(`<div class="error-box">${esc(gen.error)}</div>`)); return; }
      const conf = Math.round(gen.confidence * 100);
      // The request itself can ask for a global / all-firms run; otherwise use the picker.
      const ql = question.toLowerCase();
      const admin = QT.currentUser().isAdmin;
      const wantsGlobal = QT.canRunGlobal(QT.currentUser()) && /\b(global|globally|no firm filter|company[- ]?wide|firm[- ]?agnostic|entire book|all data)\b/.test(ql);
      const wantsAll = /\b(all firms|across (all )?firms|every firm|firm[- ]?wide|all accounts)\b/.test(ql);
      const scope = wantsGlobal ? 'global' : (wantsAll ? 'all' : App.currentFirmId);
      if (wantsGlobal) gen.steps.push('Scope → Global');
      else if (wantsAll && App.currentFirmId !== 'all') gen.steps.push('Scope → all firms (' + QT.firmsForUser(QT.currentUser()).length + ' accessible)');
      const firmName = firmLabel(scope);
      const decision = Policy.decide(gen.estimate);

      // Pre-run PII heads-up based on the fields this query will select.
      const plannedPii = plannedPiiForSql(gen.sql, gen.dataset);
      const piiMayBlock = plannedPii.isPII
        ? `<div class="pii-banner may"><span class="pii-ico">⚠️</span>
            <div><strong>May contain PII</strong>
              <span class="muted small">This query selects fields that look like personal data (${esc(plannedPii.categories.join(', '))}). It will be confirmed when you run it.</span></div></div>`
        : '';

      // Governance notice for heavy queries.
      let govBlock = '';
      if (decision.heavy) {
        const suggested = decision.suggestedTime;
        govBlock = `<div class="gov-banner ${decision.blocked ? 'blocked' : 'heavy'}">
          <span class="gov-ico">${decision.blocked ? '⛔' : '🕒'}</span>
          <div>
            <strong>${decision.blocked ? 'Not allowed during business hours' : 'Heavy query'}</strong>
            <span class="muted small">${esc(gen.estimate.note)} · est. cost ${SqlCostLabel(gen.estimate.cost)}.
            ${decision.critical && decision.critical.length ? ' Touches mission-critical table' + (decision.critical.length > 1 ? 's' : '') + ': ' + esc(decision.critical.map(k => QT.state.schema.tables[k].label).join(', ')) + '.' : ''}
            ${decision.blocked
              ? 'Large joins are restricted ' + esc(decision.windowLabel) + '. Schedule it for after hours (suggested ' + suggested.toLocaleString() + ').'
              : 'Outside business hours, so you can run it now — or schedule it.'}</span>
          </div>
        </div>`;
      }

      const confirmBar = decision.blocked
        ? `<div class="confirm-bar blocked" id="confirmBar">
            <span class="confirm-q"><strong>Not allowed during business hours.</strong> Schedule this query to run after hours.</span>
            <div class="confirm-actions">
              <button class="btn primary" id="scheduleGen">Schedule after hours</button>
              <button class="btn ghost" id="toggleSql">View SQL</button>
            </div>
          </div>`
        : `<div class="confirm-bar" id="confirmBar">
            <span class="confirm-q">Run this against <strong>${esc(firmName)}</strong>?</span>
            <div class="confirm-actions">
              <button class="btn primary" id="confirmYes">Yes, run it</button>
              <button class="btn ghost" id="scheduleGen">Schedule…</button>
              <button class="btn ghost" id="toggleSql">View SQL</button>
            </div>
          </div>`;

      const card = h(`<div class="panel asst-result">
        <div class="asst-top">
          <div><h3 class="panel-title">Here's what I'll do</h3><p class="asst-desc">${esc(gen.explanation)}</p></div>
          <span class="conf ${conf >= 65 ? 'good' : conf >= 45 ? 'warn' : 'bad'}">${conf}% confident</span>
        </div>
        <ol class="steps">${gen.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        ${piiMayBlock}
        ${govBlock}
        ${confirmBar}
        <div class="sql-box hidden" id="sqlBox">
          <label class="lbl">Generated SQL <span class="muted small">(read-only · approved, firm-scoped SQL — cannot be edited)</span></label>
          <pre class="sql readonly" id="genSql">${esc(gen.sql)}</pre>
          <div class="asst-actions">
            <span class="muted small">dataset: <code>${esc(gen.dataset)}</code></span>
          </div>
        </div>
        <div id="genResult"></div>
      </div>`);
      out.appendChild(card);

      // Execution always uses the generator's SQL (gen.sql) — never anything the
      // user could type. Normal users cannot supply or edit SQL.
      const exec = () => {
        if (Policy.decide(gen.estimate).blocked) {
          toast('This large join must be scheduled to run after hours.', { tone: 'bad', title: 'Not allowed during business hours' });
          return;
        }
        const res = QT.runRawSql(gen.sql, gen.dataset, scope);
        const bar = $('#confirmBar');
        if (bar) bar.classList.add('confirmed');
        renderResultPanel($('#genResult'), res, { id: 'sql-assistant', result: { title: 'Results' } }, scope);
      };
      const scheduleGen = () => openScheduleModal({
        kind: 'sql', sql: gen.sql, dataset: gen.dataset,
        name: 'SQL Assistant: ' + question, firmId: scope,
        defaultWhen: decision.heavy ? decision.suggestedTime : null,
        governed: decision.heavy
      });
      if ($('#confirmYes')) $('#confirmYes').addEventListener('click', exec);
      $('#toggleSql').addEventListener('click', () => $('#sqlBox').classList.toggle('hidden'));
      $('#scheduleGen').addEventListener('click', scheduleGen);
    };

    $('#askForm').addEventListener('submit', e => {
      e.preventDefault();
      const question = $('#ask').value.trim();
      if (!question) return;
      if (isQueryEasterEgg(question)) {
        // Start during the form submission so the browser recognizes
        // this as playback initiated by the user.
        startRickrollMusic(true).catch(error => {
          console.warn('Automatic music playback was blocked.', error);
        });

        go('/rickroll');
        return;
      }
      run(question);
    });
    $$('.ex', content).forEach(b => b.addEventListener('click', () => { $('#ask').value = b.dataset.q; run(b.dataset.q); }));
  }

  /* ---------- cost label ---------- */
  function SqlCostLabel(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  /* ---------- schedule modal ---------- */
  function localDatetimeValue(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function recurrenceLabel(item) {
    const recur = item && item.recurrence ? item.recurrence : 'once';
    if (recur === 'once') return 'once';
    if (recur === 'daily') return 'daily';
    if (recur === 'weekly') {
      const days = (item.recurrenceRule && Array.isArray(item.recurrenceRule.weekdays) ? item.recurrenceRule.weekdays : [])
        .map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
        .sort((a, b) => a - b);
      if (!days.length) return 'weekly';
      return 'weekly (' + days.map(d => WEEKDAY_LABELS[d]).join(', ') + ')';
    }
    if (recur === 'monthly') {
      const rule = item.recurrenceRule || {};
      if (rule.useLastDay) return 'monthly (last day)';
      return 'monthly (day ' + (Number(rule.dayOfMonth) || new Date(item.runAt).getDate()) + ')';
    }
    if (recur === 'quarterly') {
      const rule = item.recurrenceRule || {};
      if (rule.useLastDay) return 'quarterly (last day, Jan/Apr/Jul/Oct)';
      return 'quarterly (day ' + (Number(rule.dayOfMonth) || new Date(item.runAt).getDate()) + ', Jan/Apr/Jul/Oct)';
    }
    return recur;
  }
  function openScheduleModal(spec) {
    const user = QT.currentUser();
    const firm = QT.firmById(spec.firmId);
    const whenDate = spec.defaultWhen ? new Date(spec.defaultWhen) : new Date(Date.now() + 60000);
    const defaultWhen = localDatetimeValue(whenDate);
    const loc = QT.reportLocationFor(user);
    const overlay = h(`<div class="modal-overlay">
      <div class="modal">
        <div class="modal-head"><h3>Schedule query</h3><button class="modal-x" id="mClose">✕</button></div>
        <p class="muted small">“${esc(spec.name)}” · ${esc(firmLabel(spec.firmId))}</p>
        ${spec.governed ? `<div class="gov-inline">🕒 Heavy query — scheduled to run after business hours (${esc(Policy.workStatus().windowLabel)}).</div>` : ''}
        <label class="field"><span class="lbl">Run at</span>
          <input type="datetime-local" id="mWhen" value="${esc(defaultWhen)}"></label>
        <label class="field"><span class="lbl">Repeat</span>
          <select id="mRecur">
            <option value="once">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select></label>
        <div class="field hidden" id="mWeeklyWrap"><span class="lbl">Weekly days</span>
          <div class="checks">
            ${WEEKDAY_LABELS.map((d, i) => `<label class="chk"><input type="checkbox" class="mWeekday" value="${i}" ${i === whenDate.getDay() ? 'checked' : ''}> ${d}</label>`).join('')}
          </div>
          <span class="muted small">Pick one or more weekdays.</span>
        </div>
        <div class="field hidden" id="mMonthlyWrap">
          <label class="chk"><input type="checkbox" id="mMonthlyLast"> Run on last day of month</label>
          <label class="field" style="margin-top:8px;"><span class="lbl">Day of month</span>
            <input type="number" id="mMonthlyDay" min="1" max="31" value="${whenDate.getDate()}"></label>
          <span class="muted small">Days 29-31 automatically run on the last valid calendar day.</span>
        </div>
        <div class="field hidden" id="mQuarterlyWrap">
          <label class="chk"><input type="checkbox" id="mQuarterlyLast"> Run on last day of quarter month</label>
          <label class="field" style="margin-top:8px;"><span class="lbl">Day of quarter month</span>
            <input type="number" id="mQuarterlyDay" min="1" max="31" value="${whenDate.getDate()}"></label>
          <span class="muted small">Quarterly cadence uses calendar quarters only: Jan/Apr/Jul/Oct.</span>
        </div>
        <label class="field"><span class="lbl">Save report to</span>
          <input type="text" id="mLoc" value="${esc(loc)}"></label>
        <label class="field"><span class="lbl">Report name</span>
          <input type="text" id="mName" value="${esc(spec.name)}"></label>
        <div class="modal-actions">
          <button class="btn ghost" id="mCancel">Cancel</button>
          <button class="btn primary" id="mSave">Schedule it</button>
        </div>
      </div>
    </div>`);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    $('#mClose', overlay).addEventListener('click', close);
    $('#mCancel', overlay).addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const recurSel = $('#mRecur', overlay);
    const weeklyWrap = $('#mWeeklyWrap', overlay);
    const monthlyWrap = $('#mMonthlyWrap', overlay);
    const quarterlyWrap = $('#mQuarterlyWrap', overlay);
    const monthlyLast = $('#mMonthlyLast', overlay);
    const monthlyDay = $('#mMonthlyDay', overlay);
    const quarterlyLast = $('#mQuarterlyLast', overlay);
    const quarterlyDay = $('#mQuarterlyDay', overlay);
    function syncRecurUi() {
      const recur = recurSel.value;
      weeklyWrap.classList.toggle('hidden', recur !== 'weekly');
      monthlyWrap.classList.toggle('hidden', recur !== 'monthly');
      quarterlyWrap.classList.toggle('hidden', recur !== 'quarterly');
      monthlyDay.disabled = !!monthlyLast.checked;
      quarterlyDay.disabled = !!quarterlyLast.checked;
    }
    recurSel.addEventListener('change', syncRecurUi);
    monthlyLast.addEventListener('change', syncRecurUi);
    quarterlyLast.addEventListener('change', syncRecurUi);
    syncRecurUi();

    $('#mSave', overlay).addEventListener('click', () => {
      const whenVal = $('#mWhen', overlay).value;
      if (!whenVal) { toast('Pick a date and time.', { tone: 'bad' }); return; }
      // A heavy/governed query may not be scheduled into business hours.
      if (spec.governed && Policy.workStatus(new Date(whenVal)).within) {
        toast('Pick a time outside business hours (' + Policy.workStatus().windowLabel + ').', { tone: 'bad', title: 'Not allowed during business hours' });
        return;
      }
      const recurrence = recurSel.value;
      let recurrenceRule = null;
      if (recurrence === 'weekly') {
        const weekdays = $$('.mWeekday:checked', overlay).map(cb => Number(cb.value));
        if (!weekdays.length) { toast('Pick at least one weekday for weekly recurrence.', { tone: 'bad' }); return; }
        recurrenceRule = { weekdays };
      }
      if (recurrence === 'monthly') {
        const useLastDay = !!monthlyLast.checked;
        const dayOfMonth = Math.max(1, Math.min(31, Number(monthlyDay.value) || new Date(whenVal).getDate()));
        recurrenceRule = { useLastDay, dayOfMonth };
      }
      if (recurrence === 'quarterly') {
        const useLastDay = !!quarterlyLast.checked;
        const dayOfMonth = Math.max(1, Math.min(31, Number(quarterlyDay.value) || new Date(whenVal).getDate()));
        recurrenceRule = { useLastDay, dayOfMonth, quarterMode: 'calendar' };
      }
      const sched = QT.createSchedule(Object.assign({}, spec, {
        runAt: new Date(whenVal).toISOString(),
        recurrence,
        recurrenceRule,
        reportLocation: $('#mLoc', overlay).value.trim() || loc,
        name: $('#mName', overlay).value.trim() || spec.name
      }));
      close();
      toast(`Scheduled for ${new Date(sched.runAt).toLocaleString()} → ${sched.reportLocation}`, {
        title: 'Query scheduled', tone: 'good', actionLabel: 'View schedules', onAction: () => go('/schedules')
      });
    });
  }

  /* ---------- schedules view ---------- */
  function renderSchedules() {
    const user = QT.currentUser();
    const list = QT.schedulesFor(user).slice().sort((a, b) => Date.parse(a.runAt) - Date.parse(b.runAt));
    const rows = list.map(s => {
      const firm = QT.firmById(s.firmId);
      const due = Date.parse(s.runAt) <= Date.now();
      const statusBadge = s.status === 'completed' ? 'good' : s.status === 'error' ? 'bad' : due ? 'warn' : 'info';
      const statusText = s.status === 'scheduled' && due ? 'running…' : s.status;
      return `<tr>
        <td>${esc(s.name)}</td>
        <td>${esc(firmLabel(s.firmId))}</td>
        <td>${esc(new Date(s.runAt).toLocaleString())}</td>
        <td>${esc(recurrenceLabel(s))}</td>
        <td><code>${esc(s.reportLocation)}</code></td>
        <td><span class="badge ${statusBadge}">${esc(statusText)}</span></td>
        <td class="row-actions">
          <button class="btn ghost small-btn" data-run="${esc(s.id)}">Run now</button>
          ${s.lastReportId ? `<a class="btn ghost small-btn" href="#/report/${esc(s.lastReportId)}">Report</a>` : ''}
          <button class="btn ghost small-btn danger" data-del="${esc(s.id)}">Delete</button>
        </td>
      </tr>`;
    }).join('');

    const content = h(`<div class="stack">
      <div class="page-head"><div><h1>Schedules</h1>
        <p class="muted">Queries scheduled to run automatically. Results are saved to your report location.</p></div></div>
      <div class="panel">
        ${list.length ? `<div class="table-wrap"><table class="data"><thead><tr>
          <th>Name</th><th>Firm</th><th>Run at</th><th>Repeat</th><th>Report location</th><th>Status</th><th>Actions</th>
        </tr></thead><tbody>${rows}</tbody></table></div>`
        : '<div class="placeholder">No schedules yet. Open a query or the SQL Assistant and choose “Schedule…”.</div>'}
      </div>
    </div>`);
    shell('schedules', content);

    $$('[data-run]', content).forEach(b => b.addEventListener('click', () => {
      const rep = QT.runScheduleById(b.dataset.run);
      if (rep) toast(`“${rep.name}” saved to ${rep.location} · ${rep.meta.rowCount} rows${rep.pii.isPII ? ' · contains PII' : ''}`,
        { title: 'Report generated', tone: rep.pii.isPII ? 'warn' : 'good', actionLabel: 'View', onAction: () => go('/report/' + rep.id) });
      else toast('Query failed to run — check access and parameters.', { tone: 'bad' });
      renderSchedules();
    }));
    $$('[data-del]', content).forEach(b => b.addEventListener('click', () => { QT.deleteSchedule(b.dataset.del); renderSchedules(); }));
  }

  /* ---------- reports view ---------- */
  function renderReports() {
    const user = QT.currentUser();
    const fullList = QT.reportsFor(user);
    const filter = App.reportRecurrenceFilter || 'all';
    const list = filter === 'all' ? fullList : fullList.filter(r => (r.recurrence || 'once') === filter);
    const rows = list.map(r => {
      const firm = QT.firmById(r.firmId);
      return `<tr>
        <td><a href="#/report/${esc(r.id)}">${esc(r.name)}</a></td>
        <td>${esc(recurrenceLabel(r))}</td>
        <td><code>${esc(r.location)}</code></td>
        <td>${esc(firmLabel(r.firmId))}</td>
        <td>${esc(new Date(r.at).toLocaleString())}</td>
        <td class="right">${esc(r.meta.rowCount)}</td>
        <td>${r.pii && r.pii.isPII ? '<span class="badge warn">PII</span>' : '<span class="muted small">—</span>'}</td>
        <td class="row-actions">
          <a class="btn ghost small-btn" href="#/report/${esc(r.id)}">Open</a>
          <button class="btn ghost small-btn" data-csv="${esc(r.id)}">CSV</button>
          <button class="btn ghost small-btn danger" data-del="${esc(r.id)}">Delete</button>
        </td>
      </tr>`;
    }).join('');

    const content = h(`<div class="stack">
      <div class="page-head"><div><h1>Reports</h1>
        <p class="muted">Saved output from scheduled runs. Reports flagged <span class="badge warn">PII</span> contain personal data.</p></div>
        <label class="field" style="min-width:220px;"><span class="lbl">Cadence</span>
          <select id="reportRecurFilter">
            <option value="all" ${filter === 'all' ? 'selected' : ''}>All cadences</option>
            <option value="once" ${filter === 'once' ? 'selected' : ''}>Once</option>
            <option value="daily" ${filter === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="weekly" ${filter === 'weekly' ? 'selected' : ''}>Weekly</option>
            <option value="monthly" ${filter === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="quarterly" ${filter === 'quarterly' ? 'selected' : ''}>Quarterly</option>
          </select>
        </label>
      </div>
      <div class="panel">
        ${list.length ? `<div class="table-wrap"><table class="data"><thead><tr>
          <th>Report</th><th>Cadence</th><th>Location</th><th>Firm</th><th>Generated</th><th class="right">Rows</th><th>PII</th><th>Actions</th>
        </tr></thead><tbody>${rows}</tbody></table></div>`
        : '<div class="placeholder">No reports yet. Schedule a query (or use “Run now” on a schedule) to generate one.</div>'}
      </div>
    </div>`);
    shell('reports', content);

    $('#reportRecurFilter', content).addEventListener('change', (e) => {
      App.reportRecurrenceFilter = e.target.value;
      renderReports();
    });

    $$('[data-csv]', content).forEach(b => b.addEventListener('click', () => {
      const r = QT.getReport(b.dataset.csv);
      if (r) Fmt.downloadCSV((r.name || 'report').replace(/[^\w.-]+/g, '_') + '.csv', r.columns, r.rows);
    }));
    $$('[data-del]', content).forEach(b => b.addEventListener('click', () => { QT.deleteReport(b.dataset.del); renderReports(); }));
  }

  /* ---------- report detail ---------- */
  function renderReportDetail(id) {
    const r = QT.getReport(id);
    if (!r) { const c = h('<div class="stack"><a class="back" href="#/reports">← Reports</a><p class="error">Report not found.</p></div>'); return shell('reports', c); }
    const firm = QT.firmById(r.firmId);
    const pii = (r.pii && r.pii.isPII) ? r.pii : PII.detect(r.columns);
    const content = h(`<div class="stack">
      <a class="back" href="#/reports">← Reports</a>
      <div class="page-head">
        <div><h1>${esc(r.name)}</h1>
          <p class="muted">${esc(firmLabel(r.firmId))} · saved to <code>${esc(r.location)}</code> · ${esc(new Date(r.at).toLocaleString())} · ${esc(r.meta.rowCount)} rows</p></div>
        <div class="page-head-actions">${pii.isPII ? immutaRevealButton() : ''}<button class="btn ghost" id="dlCsv"${pii.isPII ? ' disabled title="Reveal PII before exporting"' : ''}>Export CSV</button></div>
      </div>
      <div class="panel" id="reportPanel"></div>
    </div>`);
    shell('reports', content);
    const panel = $('#reportPanel', content);
    if (pii.isPII) panel.appendChild(piiBanner(pii));
    const exportButton = $('#dlCsv', content);
    mountProtectedTable(panel, r.columns, r.rows, pii, $('[data-pii-reveal]', content), exportButton);
    exportButton.addEventListener('click', () => Fmt.downloadCSV((r.name || 'report').replace(/[^\w.-]+/g, '_') + '.csv', r.columns, r.rows));
  }

  /* ---------- execution log / analytics ---------- */
  function renderLogs() {
    if (!QT.currentUser().isAdmin) {
      const c = h(`<div class="stack">
        <div class="page-head"><div><h1>Execution Log</h1></div></div>
        <div class="panel"><div class="gov-banner blocked">
          <span class="gov-ico">🔒</span>
          <div><strong>Administrators only</strong>
            <span class="muted small">The execution log is restricted to administrators. Open <a href="#/queries">Queries</a> to run a report.</span></div>
        </div></div>
      </div>`);
      return shell('queries', c);
    }
    const log = QT.readLog();
    const total = log.length;
    const ok = log.filter(l => l.success).length;
    const piiCount = log.filter(l => l.pii).length;
    const avg = total ? Math.round(log.reduce((a, l) => a + (l.durationMs || 0), 0) / total) : 0;
    const byQuery = {};
    log.forEach(l => { byQuery[l.name] = (byQuery[l.name] || 0) + 1; });
    const top = Object.entries(byQuery).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxCount = top.length ? top[0][1] : 1;

    const content = h(`<div class="stack">
      <div class="page-head"><div><h1>Execution Log</h1><p class="muted">Local demo analytics from this browser</p></div>
        <button class="btn ghost" id="clearLog">Clear log</button></div>
      <div class="stat-row">
        <div class="stat"><span class="stat-num">${total}</span><span class="muted">executions</span></div>
        <div class="stat"><span class="stat-num">${total ? Math.round(ok / total * 100) : 0}%</span><span class="muted">success rate</span></div>
        <div class="stat"><span class="stat-num">${avg} ms</span><span class="muted">avg duration</span></div>
        <div class="stat"><span class="stat-num">${piiCount}</span><span class="muted">PII result sets</span></div>
      </div>
      ${top.length ? `<div class="panel"><h3 class="panel-title">Most-run queries</h3>
        <div class="bars">${top.map(([name, c]) => `
          <div class="bar-row"><span class="bar-label">${esc(name)}</span>
            <span class="bar"><span class="bar-fill" style="width:${Math.round(c / maxCount * 100)}%"></span></span>
            <span class="bar-val">${c}</span></div>`).join('')}</div></div>` : ''}
      <div class="panel"><h3 class="panel-title">Recent activity</h3>
        ${total ? `<div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>User</th><th>Query</th><th>Firm</th><th class="right">Rows</th><th class="right">ms</th><th>PII</th><th>Status</th></tr></thead>
          <tbody>${log.slice(0, 100).map(l => `<tr>
            <td>${esc(new Date(l.at).toLocaleString())}</td>
            <td>${esc(l.user)}</td>
            <td>${esc(l.name)}${l.kind === 'bulk' ? ' <span class="badge accent">bulk</span>' : ''}</td>
            <td>${esc(firmLabel(l.firmId))}</td>
            <td class="right">${esc(l.rowCount)}</td>
            <td class="right">${esc(l.durationMs)}</td>
            <td>${l.pii ? `<span class="badge warn" title="${esc((l.piiCategories || []).join(', '))}">PII</span>` : '<span class="muted small">—</span>'}</td>
            <td><span class="badge ${l.success ? 'good' : 'bad'}">${l.success ? 'OK' : 'Error'}</span></td>
          </tr>`).join('')}</tbody></table></div>` : '<div class="placeholder">No queries run yet.</div>'}
      </div>
    </div>`);
    shell('logs', content);
    $('#clearLog').addEventListener('click', () => { QT.clearLog(); renderLogs(); });
  }

  /* ---------- bulk enrollment (admin) ---------- */
  function renderEnroll() {
    const user = QT.currentUser();
    if (!user.isAdmin) return renderQueries();
    App.enroll = App.enroll || { numbers: [], targets: null };
    const schema = QT.enrollmentSchema();
    const lookups = schema.lookups || {};

    const sectionsHtml = (schema.sections || []).map(sec => `
      <section class="cat"><h2 class="cat-title">${esc(sec.title)}</h2>
        ${sec.note ? `<p class="muted small">${esc(sec.note)}</p>` : ''}
        <div class="enroll-grid">${(sec.fields || []).map(f => enrollField(f, lookups)).join('')}</div>
      </section>`).join('');

    const content = h(`<div class="stack">
      <div class="page-head"><div><h1>Bulk Enrollment</h1>
        <p class="muted">Enroll accounts into a model with cash triggers, DCA and withdrawal settings — structured intake with the same conditional-required validation as the template. Creates proposal accounts and writes version + history. (Excludes Vestmark P1 export.)</p></div></div>

      <div class="panel">
        <form id="enTargetsForm" class="stack" style="gap:10px">
          <label class="lbl">Account numbers to enroll</label>
          <textarea id="enNumbers" class="sql" placeholder="e.g. 1101, 1102, 2101, 3101, 4101, 4601">${esc((App.enroll.numbers || []).join(', '))}</textarea>
          <div class="form-actions">
            <button class="btn primary" type="submit">Find accounts</button>
            <button class="btn ghost" type="button" id="enExample">Load un-enrolled accounts</button>
            <button class="btn ghost" type="button" id="enReset">Reset enrollments</button>
          </div>
        </form>
        <div id="enTargets"></div>
      </div>

      <form id="enForm">
        ${sectionsHtml}

        <section class="cat"><h2 class="cat-title">Carve-Outs <span class="muted small">— required if Has Carve Outs = Yes</span></h2>
          <div class="panel">
            <div class="table-wrap"><table class="data"><thead><tr><th>Account #</th><th>Ticker</th><th>Acquisition Date</th><th class="right">Quantity</th><th></th></tr></thead>
              <tbody id="coBody"></tbody></table></div>
            <div class="form-actions" style="margin-top:10px"><button class="btn ghost" type="button" id="coAdd">+ Add carve-out</button></div>
          </div>
        </section>

        <section class="cat"><h2 class="cat-title">Pre-Trade Restrictions <span class="muted small">— required if Has Pretrade Restrictions = Yes</span></h2>
          <div class="panel">
            <div class="table-wrap"><table class="data"><thead><tr><th>Account #</th><th>Ticker</th><th>Restriction</th><th></th></tr></thead>
              <tbody id="resBody"></tbody></table></div>
            <div class="form-actions" style="margin-top:10px"><button class="btn ghost" type="button" id="resAdd">+ Add restriction</button></div>
          </div>
        </section>

        <div class="panel enroll-submit">
          <div id="enErrors"></div>
          <div class="form-actions">
            <button class="btn primary" type="submit" id="enSubmit">Enroll selected accounts</button>
            <span class="muted small">Required fields adjust automatically based on Trigger Type, DCA and Periodic Withdrawal.</span>
          </div>
        </div>
      </form>
      <div id="enSql"></div>
      <div id="enHistory"></div>
    </div>`);
    shell('enroll', content);

    const form = $('#enForm', content);
    // conditional required + enable/disable
    const refresh = () => {
      const values = collectEnrollValues(form);
      const reqNow = QT.enrollmentRequiredNow(values);
      QT.enrollmentFields().forEach(f => {
        const wrap = form.querySelector(`[data-fieldkey="${f.key}"]`);
        if (!wrap) return;
        const mark = wrap.querySelector('.req-mark');
        const input = wrap.querySelector('[data-key]');
        const req = !!reqNow[f.key];
        if (mark) mark.classList.toggle('hidden', !req);
        if (f.requiredIf) { // conditional field: enabled only when its condition is active
          input.disabled = !req;
          wrap.classList.toggle('disabled', !req);
          if (!req) input.value = '';
        }
      });
    };
    $$('[data-key]', form).forEach(i => i.addEventListener('change', refresh));
    refresh();

    // carve-out / restriction sub-rows
    const restrictionOpts = ((QT.enrollmentSchema().lookups || {}).restriction) || ['Do Not Buy', 'Do Not Sell', 'Do Not Hold'];
    const addCoRow = () => {
      const tr = h(`<tr>
        <td><input type="number" class="co-acct" style="width:110px"></td>
        <td><input type="text" class="co-ticker" style="width:90px"></td>
        <td><input type="date" class="co-date"></td>
        <td class="right"><input type="number" class="co-qty" style="width:110px"></td>
        <td><button class="btn ghost small-btn danger co-del" type="button">✕</button></td></tr>`);
      $('.co-del', tr).addEventListener('click', () => tr.remove());
      $('#coBody', form).appendChild(tr);
    };
    const addResRow = () => {
      const tr = h(`<tr>
        <td><input type="number" class="res-acct" style="width:110px"></td>
        <td><input type="text" class="res-ticker" style="width:90px"></td>
        <td><select class="res-type"><option value="">—</option>${['Do Not Buy', 'Do Not Sell', 'Do Not Hold'].map(o => `<option>${o}</option>`).join('')}</select></td>
        <td><button class="btn ghost small-btn danger res-del" type="button">✕</button></td></tr>`);
      $('.res-del', tr).addEventListener('click', () => tr.remove());
      $('#resBody', form).appendChild(tr);
    };
    $('#coAdd', form).addEventListener('click', addCoRow);
    $('#resAdd', form).addEventListener('click', addResRow);
    const collectSubrows = () => ({
      carveOuts: $$('#coBody tr', form).map(tr => ({ account: $('.co-acct', tr).value, ticker: $('.co-ticker', tr).value, acqDate: $('.co-date', tr).value, quantity: $('.co-qty', tr).value })),
      restrictions: $$('#resBody tr', form).map(tr => ({ account: $('.res-acct', tr).value, ticker: $('.res-ticker', tr).value, restriction: $('.res-type', tr).value }))
    });

    // targets search
    const doFind = raw => {
      const numbers = String(raw).split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
      App.enroll = { numbers, targets: QT.resolveEnrollTargets(numbers) };
      renderEnTargets();
    };
    $('#enTargetsForm', content).addEventListener('submit', e => { e.preventDefault(); doFind($('#enNumbers').value); });
    $('#enExample', content).addEventListener('click', () => {
      const nums = QT.unenrolledAccounts().slice(0, 8).map(a => a.AccountId);
      $('#enNumbers').value = nums.join(', '); doFind(nums.join(', '));
    });
    $('#enReset', content).addEventListener('click', () => { QT.resetProposals(); toast('Enrollments and proposal changes reset.', { title: 'Reset' }); App.enroll = { numbers: [], targets: null }; renderEnroll(); });
    if (App.enroll.targets) renderEnTargets();
    renderEnHistory();

    $('#enForm', content).addEventListener('submit', e => {
      e.preventDefault();
      const t = App.enroll.targets;
      const enrollableNums = t ? $$('#enTargets .en-row-check:checked').map(c => Number(c.value)) : [];
      const values = collectEnrollValues(form);
      const errBox = $('#enErrors');
      if (!enrollableNums.length) { errBox.innerHTML = `<div class="error-box">Find accounts and select at least one enrollable account first.</div>`; return; }
      const res = QT.bulkEnroll(enrollableNums, values, collectSubrows());
      if (!res.ok) {
        // mark invalid fields
        $$('.enroll-field.invalid', form).forEach(w => w.classList.remove('invalid'));
        (res.errors || []).forEach(er => { const w = er.field && form.querySelector(`[data-fieldkey="${er.field}"]`); if (w) w.classList.add('invalid'); });
        errBox.innerHTML = `<div class="error-box"><strong>Fix ${res.errors.length} field${res.errors.length === 1 ? '' : 's'}:</strong><ul>${res.errors.map(er => `<li>${esc(er.message)}</li>`).join('')}</ul></div>`;
        errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      errBox.innerHTML = '';
      $$('.enroll-field.invalid', form).forEach(w => w.classList.remove('invalid'));
      App.enroll.targets = QT.resolveEnrollTargets(App.enroll.numbers); // refresh (now enrolled)
      renderEnTargets(); renderEnHistory(); renderEnSql(res);
      const sk = res.skipped;
      const extra = (sk.alreadyEnrolled.length || sk.notFound.length) ? ` (${sk.alreadyEnrolled.length} already enrolled, ${sk.notFound.length} skipped)` : '';
      toast(`Enrolled ${res.count} account${res.count === 1 ? '' : 's'} into ${values.model} by ${res.actor}${extra}. Version + history written (batch ${res.batchId}).`,
        { tone: 'good', title: 'Bulk enrollment complete', duration: 9000 });
    });

    function renderEnTargets() {
      const panel = $('#enTargets');
      const t = App.enroll.targets;
      panel.innerHTML = '';
      if (!t) return;
      const rows = t.enrollable.map(a => `<tr>
        <td><input type="checkbox" class="en-row-check" value="${a.AccountId}" checked></td>
        <td><strong>${esc(a.AccountId)}</strong></td><td>${esc(a.AccountName)}</td><td>${esc(firmLabel(a.FirmId))}</td>
      </tr>`).join('');
      panel.appendChild(h(`<div class="stack" style="gap:10px;margin-top:12px">
        ${t.enrollable.length ? `<div><span class="muted small">${t.enrollable.length} account${t.enrollable.length === 1 ? '' : 's'} ready to enroll (all selected)</span>
          <div class="table-wrap"><table class="data"><thead><tr><th></th><th>Account #</th><th>Account</th><th>Firm</th></tr></thead><tbody>${rows}</tbody></table></div></div>`
          : `<div class="error-box">No enrollable accounts in the list.</div>`}
        ${t.alreadyEnrolled.length ? `<div class="pii-banner may"><span class="pii-ico">ℹ️</span><div><strong>${t.alreadyEnrolled.length} already enrolled</strong> <span class="muted small">${esc(t.alreadyEnrolled.join(', '))} — use the Bulk Editor to change existing accounts.</span></div></div>` : ''}
        ${t.notFound.length ? `<div class="pii-banner may"><span class="pii-ico">⚠️</span><div><strong>${t.notFound.length} not found / not permitted</strong> <span class="muted small">${esc(t.notFound.join(', '))}</span></div></div>` : ''}
      </div>`));
    }

    function renderEnSql(res) {
      const panel = $('#enSql');
      panel.innerHTML = '';
      if (!res || !res.sql) return;
      const el = h(`<div class="panel">
        <div class="result-head">
          <div><h3 class="panel-title">Systems-ready SQL — <code>insert into proposalaccount</code></h3>
            <span class="muted small">${res.inserts.length} statement${res.inserts.length === 1 ? '' : 's'} · replaces the manual 09-ProposalAccountShells step · review before running</span></div>
          <div class="result-head-right">
            <button class="btn ghost" id="enCopy">Copy</button>
            <button class="btn ghost" id="enDownload">Download .sql</button>
          </div>
        </div>
        <pre class="sql readonly" id="enSqlText">${esc(res.sql)}</pre>
      </div>`);
      panel.appendChild(el);
      $('#enCopy', el).addEventListener('click', () => {
        navigator.clipboard && navigator.clipboard.writeText(res.sql);
        toast('SQL copied to clipboard.', { title: 'Copied' });
      });
      $('#enDownload', el).addEventListener('click', () => {
        const blob = new Blob([res.sql], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'proposalaccount-inserts-' + res.batchId + '.sql';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    }

    function renderEnHistory() {
      const panel = $('#enHistory');
      const hist = QT.proposalHistory(0).filter(hh => hh.Field === 'Enrollment').slice(0, 50);
      panel.innerHTML = '';
      if (!hist.length) return;
      panel.appendChild(h(`<div class="panel">
        <h3 class="panel-title">Recent enrollments</h3>
        <div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>By</th><th>Account #</th><th>Proposal Acct</th><th>Model</th><th>Batch</th></tr></thead>
        <tbody>${hist.map(hh => `<tr><td>${esc(new Date(hh.ChangedAt).toLocaleString())}</td><td>${esc(hh.ChangedBy)}</td><td>${esc(hh.AccountId)}</td><td>${esc(hh.ProposalAccountId)}</td><td>${esc(hh.NewValue)}</td><td><span class="muted small">${esc(hh.BatchId)}</span></td></tr>`).join('')}</tbody></table></div>
      </div>`));
    }
  }

  function enrollField(f, lookups) {
    const id = 'en_' + f.key;
    const opts = f.lookup ? (lookups[f.lookup] || []) : (f.options || []);
    let ctl;
    if (f.type === 'select') {
      ctl = `<select id="${id}" data-key="${esc(f.key)}"><option value=""></option>${opts.map(o => `<option value="${esc(o)}" ${f.default === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else if (f.type === 'date') {
      ctl = `<input type="date" id="${id}" data-key="${esc(f.key)}">`;
    } else if (f.type === 'number' || f.type === 'currency') {
      ctl = `<input type="number" id="${id}" data-key="${esc(f.key)}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.default != null ? `value="${esc(f.default)}"` : ''}>`;
    } else {
      ctl = `<input type="text" id="${id}" data-key="${esc(f.key)}" ${f.default != null ? `value="${esc(f.default)}"` : ''}>`;
    }
    return `<label class="field enroll-field" data-fieldkey="${esc(f.key)}">
      <span class="lbl">${esc(f.label)} <em class="req-mark hidden">*</em></span>
      ${ctl}
      ${f.help ? `<span class="muted small">${esc(f.help)}</span>` : ''}
    </label>`;
  }
  function collectEnrollValues(form) {
    const v = {};
    $$('[data-key]', form).forEach(i => { v[i.dataset.key] = i.value; });
    return v;
  }

  /* ---------- proposal accounts: bulk editor (admin) ---------- */
  function renderProposals() {
    const user = QT.currentUser();
    if (!user.isAdmin) return renderQueries();
    App.pa = App.pa || { numbers: [], found: [], notFound: [] };

    const content = h(`<div class="stack">
      <div class="page-head"><div><h1>Proposal Account — Bulk Editor</h1>
        <p class="muted">Paste account numbers (comma or space separated), pick a field, and update all selected proposal accounts at once. Every change is written to <code>proposalaccounthistory</code> and <code>proposalaccountversion</code>. No more Excel.</p></div></div>

      <div class="panel">
        <form id="paSearchForm" class="stack" style="gap:10px">
          <label class="lbl">Account numbers</label>
          <textarea id="paNumbers" class="sql" placeholder="e.g. 1001, 1002, 1004, 1005, 2001, 2002, 2003, 3001, 3004, 4001, 4004, 4501, 4504">${esc((App.pa.numbers || []).join(', '))}</textarea>
          <div class="form-actions">
            <button class="btn primary" type="submit">Find accounts</button>
            <button class="btn ghost" type="button" id="paExample">Load 16 example accounts</button>
            <button class="btn ghost" type="button" id="paReset">Reset all changes</button>
          </div>
        </form>
      </div>

      <div id="paResults"></div>
      <div id="paHistory"></div>
    </div>`);
    shell('proposals', content);

    const exampleNums = [1001, 1002, 1004, 1005, 1006, 2001, 2002, 2003, 2005, 3001, 3002, 4001, 4004, 4501, 4504, 4506];

    $('#paSearchForm').addEventListener('submit', e => { e.preventDefault(); doFind($('#paNumbers').value); });
    $('#paExample').addEventListener('click', () => { $('#paNumbers').value = exampleNums.join(', '); doFind(exampleNums.join(', ')); });
    $('#paReset').addEventListener('click', () => { QT.resetProposals(); toast('All proposal-account changes reset to defaults.', { title: 'Reset' }); App.pa = { numbers: [], found: [], notFound: [] }; renderProposals(); });

    function doFind(raw) {
      const numbers = String(raw).split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
      const res = QT.resolveProposalAccounts(numbers);
      App.pa = { numbers, found: res.found, notFound: res.notFound };
      renderPAResults();
      renderPAHistory();
    }

    // If we already had a selection (returning to the page), render it.
    if (App.pa.found.length || App.pa.notFound.length) { renderPAResults(); renderPAHistory(); }

    function renderPAResults() {
      const panel = $('#paResults');
      panel.innerHTML = '';
      const rows = App.pa.found;
      if (!rows.length && !App.pa.notFound.length) return;

      const fields = QT.proposalFields();
      const fieldOptions = fields.map(f => `<option value="${f.field}">${esc(f.group)} — ${esc(f.label)}</option>`).join('');

      const notFoundNote = App.pa.notFound.length
        ? `<div class="pii-banner may"><span class="pii-ico">⚠️</span><div><strong>${App.pa.notFound.length} not found / not permitted</strong><span class="muted small">${esc(App.pa.notFound.join(', '))}</span></div></div>` : '';

      const el = h(`<div class="panel">
        <div class="result-head">
          <div><h3 class="panel-title">${rows.length} proposal account${rows.length === 1 ? '' : 's'} matched</h3>
            <span class="muted small"><span id="paSelCount">${rows.length}</span> selected</span></div>
          <button class="btn ghost" id="paCsv">Export CSV</button>
        </div>
        ${notFoundNote}
        <div class="pa-update">
          <label class="check"><input type="checkbox" id="paSelAll" checked><span>Select all</span></label>
          <div class="pa-update-controls">
            <label class="field"><span class="lbl">Field to update</span><select id="paField">${fieldOptions}</select></label>
            <div id="paValueWrap" class="field"></div>
            <button class="btn primary" id="paApply">Apply to selected</button>
          </div>
        </div>
        <div class="table-wrap"><table class="data"><thead><tr>
          <th></th><th>Account</th><th>Firm</th><th>Model</th>
          <th class="right">Cash Low %</th><th class="right">Cash High %</th>
          <th class="right">Floor</th><th class="right">Ceiling</th>
          <th class="right">Rebal %</th><th>Trading</th><th class="right">Ver</th>
        </tr></thead><tbody>${rows.map(paRow).join('')}</tbody></table></div>
      </div>`);
      panel.appendChild(el);

      buildValueControl();
      $('#paField', el).addEventListener('change', buildValueControl);
      $('#paSelAll', el).addEventListener('change', e => { $$('.pa-row-check', el).forEach(c => { c.checked = e.target.checked; }); updateCount(); });
      $$('.pa-row-check', el).forEach(c => c.addEventListener('change', updateCount));
      $('#paApply', el).addEventListener('click', applyUpdate);
      $('#paCsv', el).addEventListener('click', () => {
        const cols = [
          { field: 'AccountId', label: 'Account' }, { field: 'ProposalAccountId', label: 'Proposal Account Id' }, { field: 'FirmId', label: 'Firm' },
          { field: 'Model', label: 'Model' }, { field: 'CashTriggerLowPct', label: 'Cash Low %' }, { field: 'CashTriggerHighPct', label: 'Cash High %' },
          { field: 'FloorAmount', label: 'Floor' }, { field: 'CeilingAmount', label: 'Ceiling' }, { field: 'RebalanceThresholdPct', label: 'Rebalance %' },
          { field: 'TradingEnabled', label: 'Trading' }, { field: 'Version', label: 'Version' }
        ];
        Fmt.downloadCSV('proposal-accounts-' + Date.now() + '.csv', cols, rows);
      });

      function updateCount() {
        const n = $$('.pa-row-check:checked', el).length;
        $('#paSelCount').textContent = n;
      }
      function buildValueControl() {
        const meta = QT.proposalFields().find(f => f.field === $('#paField').value);
        const wrap = $('#paValueWrap', el);
        let ctl = '';
        if (meta.type === 'toggle') ctl = `<select id="paValue"><option value="true">Enabled</option><option value="false">Disabled</option></select>`;
        else if (meta.type === 'select') ctl = `<select id="paValue">${meta.options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
        else ctl = `<input type="number" id="paValue" ${meta.min != null ? `min="${meta.min}"` : ''} ${meta.max != null ? `max="${meta.max}"` : ''} ${meta.step ? `step="${meta.step}"` : ''} value="${meta.type === 'currency' ? 0 : (meta.min || 0)}">`;
        wrap.innerHTML = `<span class="lbl">New value — ${esc(meta.label)}</span>${ctl}`;
      }
      function applyUpdate() {
        const ids = $$('.pa-row-check:checked', el).map(c => Number(c.value));
        if (!ids.length) { toast('Select at least one account.', { tone: 'bad' }); return; }
        const field = $('#paField').value;
        const value = $('#paValue').value;
        const res = QT.bulkUpdateProposals(ids, field, value);
        if (!res.ok) { toast(res.error, { tone: 'bad' }); return; }
        // refresh the shown rows with new values (keep same numbers)
        App.pa.found = QT.resolveProposalAccounts(App.pa.numbers).found;
        renderPAResults(); renderPAHistory();
        const meta = QT.proposalFields().find(f => f.field === field);
        toast(`Updated ${meta.label} → ${res.value} on ${res.count} account${res.count === 1 ? '' : 's'} by ${res.actor}. Logged to history, versions and the execution log (batch ${res.batchId}).`,
          { tone: 'good', title: 'Bulk update applied', duration: 9000 });
      }
    }

    function paRow(p) {
      const badge = v => `<span class="badge ${Fmt.badgeTone(v)}">${esc(v)}</span>`;
      return `<tr>
        <td><input type="checkbox" class="pa-row-check" value="${p.ProposalAccountId}" checked></td>
        <td><strong>${esc(p.AccountId)}</strong><br><span class="muted small">${esc(p.AccountName)}</span></td>
        <td>${esc(firmLabel(p.FirmId))}</td>
        <td>${badge(p.Model)}</td>
        <td class="right">${esc(p.CashTriggerLowPct)}</td>
        <td class="right">${esc(p.CashTriggerHighPct)}</td>
        <td class="right">${esc(Fmt.formatValue(p.FloorAmount, 'currency'))}</td>
        <td class="right">${esc(Fmt.formatValue(p.CeilingAmount, 'currency'))}</td>
        <td class="right">${esc(p.RebalanceThresholdPct)}</td>
        <td>${badge(p.TradingEnabled ? 'true' : 'false')}</td>
        <td class="right">${esc(p.Version)}</td>
      </tr>`;
    }

    function renderPAHistory() {
      const panel = $('#paHistory');
      const hist = QT.proposalHistory(50);
      const vers = QT.proposalVersions(0).length;
      panel.innerHTML = '';
      if (!hist.length) return;
      panel.appendChild(h(`<div class="panel">
        <div class="result-head"><div><h3 class="panel-title">Change history</h3>
          <span class="muted small"><code>proposalaccounthistory</code>: ${hist.length ? QT.proposalHistory(0).length : 0} rows · <code>proposalaccountversion</code>: ${vers} rows</span></div></div>
        <div class="table-wrap"><table class="data"><thead><tr>
          <th>When</th><th>By</th><th>Account</th><th>Field</th><th>Old → New</th><th class="right">Ver</th><th>Batch</th>
        </tr></thead><tbody>${hist.map(hRow).join('')}</tbody></table></div>
      </div>`));
    }
    function hRow(hst) {
      const fmt = v => (typeof v === 'boolean') ? String(v) : esc(v);
      return `<tr>
        <td>${esc(new Date(hst.ChangedAt).toLocaleString())}</td>
        <td>${esc(hst.ChangedBy)}</td>
        <td>${esc(hst.AccountId)}</td>
        <td>${esc(hst.Field)}</td>
        <td><span class="muted">${fmt(hst.OldValue)}</span> → <strong>${fmt(hst.NewValue)}</strong></td>
        <td class="right">${esc(hst.Version)}</td>
        <td><span class="muted small">${esc(hst.BatchId)}</span></td>
      </tr>`;
    }
  }

  /* ---------- access & permissions (admin) ---------- */
  function renderAccess() {
    const me = QT.currentUser();
    if (!me.isAdmin) return renderQueries();
    const groups = QT.state.groups;
    const firms = QT.state.firms;
    const users = QT.state.users;
    const queries = QT.state.queries;

    const groupChips = (owned, kind, id) => groups.map(g => {
      const on = owned.includes(g.id);
      return `<label class="perm-chip ${on ? 'on' : ''}"><input type="checkbox" data-${kind}="${esc(id)}" data-group="${esc(g.id)}" ${on ? 'checked' : ''}><span>${esc(g.name)}</span></label>`;
    }).join('');
    const firmChips = (owned, id) => {
      const allOn = firms.length && firms.every(f => owned.includes(f.id));
      const allPill = `<label class="perm-chip allfirms ${allOn ? 'on' : ''}"><input type="checkbox" data-userallfirms="${esc(id)}" ${allOn ? 'checked' : ''}><span>🌐 All firms</span></label>`;
      return allPill + firms.map(f => {
        const on = owned.includes(f.id);
        return `<label class="perm-chip ${on ? 'on' : ''}"><input type="checkbox" data-userfirm="${esc(id)}" data-firm="${f.id}" ${on ? 'checked' : ''}><span>${esc(f.name)}</span></label>`;
      }).join('');
    };

    const userRows = users.map(u => `<tr>
      <td><strong>${esc(u.displayName)}</strong>${u._created ? ' <span class="badge info">new</span>' : ''}<br><span class="muted small">${esc(u.email)}</span></td>
      <td><label class="switch"><input type="checkbox" data-admin="${esc(u.id)}" ${u.isAdmin ? 'checked' : ''} ${u.id === me.id ? 'disabled title="Cannot change your own admin flag"' : ''}><span class="slider"></span></label></td>
      <td><label class="switch" title="${u.isAdmin ? 'Admins can always run Global' : 'Allow this user to run a query against all firms (Global)'}"><input type="checkbox" data-global="${esc(u.id)}" ${(u.isAdmin || u.canGlobal) ? 'checked' : ''} ${u.isAdmin ? 'disabled' : ''}><span class="slider"></span></label></td>
      <td><div class="perm-chips">${groupChips(u.groups || [], 'usergroup', u.id)}</div></td>
      <td><div class="perm-chips">${firmChips(u.firms || [], u.id)}</div></td>
      <td>${u._created ? `<button class="btn ghost small-btn danger" data-deluser="${esc(u.id)}">Remove</button>` : '<span class="muted small">—</span>'}</td>
    </tr>`).join('');

    const queryRows = queries.map(q => {
      const a = q.access || {};
      return `<tr>
        <td><strong>${esc(q.name)}</strong><br><span class="muted small">${esc(q.category)} · ${esc(q.id)}</span></td>
        <td><label class="switch"><input type="checkbox" data-queryadmin="${esc(q.id)}" ${a.adminOnly ? 'checked' : ''}><span class="slider"></span></label></td>
        <td><div class="perm-chips">${a.adminOnly ? '<span class="muted small">Admins only — group access ignored</span>' : groupChips(a.groups || [], 'querygroup', q.id)}</div></td>
      </tr>`;
    }).join('');

    const content = h(`<div class="stack">
      <div class="page-head"><div><h1>Access &amp; Permissions</h1>
        <p class="muted">Assign users to groups and firms, and control which groups can run each query. Changes apply immediately${QT.accessModified() ? ' · <span class="badge warn">overrides active</span>' : ''}.</p></div>
        <div class="form-actions"><button class="btn primary" id="createUser">+ Create user</button><button class="btn ghost" id="resetAccess">Reset to file defaults</button></div></div>

      <section class="cat"><h2 class="cat-title">Users → groups, firms, admin &amp; global</h2>
        <div class="panel"><div class="table-wrap"><table class="data perm-table"><thead><tr>
          <th>User</th><th>Admin</th><th title="Run a query against all firms">Global</th><th>Groups</th><th>Firms</th><th></th></tr></thead><tbody>${userRows}</tbody></table></div></div>
      </section>

      <section class="cat"><h2 class="cat-title">Queries → who can run them</h2>
        <div class="panel"><div class="table-wrap"><table class="data perm-table"><thead><tr>
          <th>Query</th><th>Admin&nbsp;only</th><th>Groups allowed</th></tr></thead><tbody>${queryRows}</tbody></table></div></div>
      </section>
      <p class="muted small">Stored as overrides in this browser (<code>qt.access</code>) layered over the JSON config — like Data Governance. In production this would write to the server. Groups and firms themselves are defined in <code>config/groups.json</code> and <code>config/firms.json</code>.</p>
    </div>`);
    shell('access', content);

    const collectChecked = (attr, val, groupAttr) =>
      $$(`[data-${attr}="${val}"]:checked`, content).map(i => i.dataset[groupAttr]);

    // group toggles on a user
    $$('[data-usergroup]', content).forEach(cb => cb.addEventListener('change', () => {
      const id = cb.dataset.usergroup;
      QT.setUserAccess(id, { groups: collectChecked('usergroup', id, 'group') });
      renderAccess();
    }));
    // firm toggles on a user
    $$('[data-userfirm]', content).forEach(cb => cb.addEventListener('change', () => {
      const id = cb.dataset.userfirm;
      QT.setUserAccess(id, { firms: collectChecked('userfirm', id, 'firm').map(Number) });
      renderAccess();
    }));
    // "All firms" toggle on a user
    $$('[data-userallfirms]', content).forEach(cb => cb.addEventListener('change', () => {
      const id = cb.dataset.userallfirms;
      QT.setUserAccess(id, { firms: cb.checked ? firms.map(f => f.id) : [] });
      renderAccess();
    }));
    // admin toggle on a user
    $$('[data-admin]', content).forEach(cb => cb.addEventListener('change', () => {
      QT.setUserAccess(cb.dataset.admin, { isAdmin: cb.checked });
      toast((cb.checked ? 'Granted' : 'Revoked') + ' admin for this user.', { tone: cb.checked ? 'warn' : 'info', title: 'Access updated' });
      renderAccess();
    }));
    // global (run against all firms) toggle on a user
    $$('[data-global]', content).forEach(cb => cb.addEventListener('change', () => {
      QT.setUserAccess(cb.dataset.global, { canGlobal: cb.checked });
      toast((cb.checked ? 'Granted' : 'Revoked') + ' Global (all-firms) access.', { tone: cb.checked ? 'warn' : 'info', title: 'Access updated' });
      renderAccess();
    }));
    // group toggles on a query
    $$('[data-querygroup]', content).forEach(cb => cb.addEventListener('change', () => {
      const id = cb.dataset.querygroup;
      QT.setQueryAccess(id, { groups: collectChecked('querygroup', id, 'group') });
      renderAccess();
    }));
    // admin-only toggle on a query
    $$('[data-queryadmin]', content).forEach(cb => cb.addEventListener('change', () => {
      QT.setQueryAccess(cb.dataset.queryadmin, { adminOnly: cb.checked });
      renderAccess();
    }));
    // delete a created user
    $$('[data-deluser]', content).forEach(b => b.addEventListener('click', () => {
      QT.deleteCreatedUser(b.dataset.deluser); toast('User removed.', { title: 'Access updated' }); renderAccess();
    }));
    $('#createUser').addEventListener('click', () => openCreateUserModal());
    $('#resetAccess').addEventListener('click', () => { QT.resetAccess(); toast('Access reset to file defaults.', { title: 'Reset' }); renderAccess(); });
  }

  function openCreateUserModal() {
    const groups = QT.state.groups;
    const overlay = h(`<div class="modal-overlay">
      <div class="modal">
        <div class="modal-head"><h3>Create user</h3><button class="modal-x" id="cuClose">✕</button></div>
        <label class="field"><span class="lbl">Display name</span><input type="text" id="cuName" placeholder="Jordan Lee"></label>
        <label class="field"><span class="lbl">Email <em class="req">*</em></span><input type="email" id="cuEmail" placeholder="jordan@demo.com"></label>
        <label class="field"><span class="lbl">Password</span><input type="text" id="cuPass" value="demo123"></label>
        <label class="field"><span class="lbl">Groups</span>
          <div class="perm-chips">${groups.map(g => `<label class="perm-chip"><input type="checkbox" class="cuGroup" value="${esc(g.id)}"><span>${esc(g.name)}</span></label>`).join('')}</div></label>
        <label class="field inline"><input type="checkbox" id="cuAllFirms" checked><span class="lbl">Access all firms</span></label>
        <label class="field inline"><input type="checkbox" id="cuGlobal"><span class="lbl">Can run Global (all firms, no filter)</span></label>
        <label class="field inline"><input type="checkbox" id="cuAdmin"><span class="lbl">Administrator</span></label>
        <div id="cuError" class="error hidden"></div>
        <div class="modal-actions">
          <button class="btn ghost" id="cuCancel">Cancel</button>
          <button class="btn primary" id="cuSave">Create user</button>
        </div>
      </div>
    </div>`);
    document.body.appendChild(overlay);
    // live "on" styling for group chips
    $$('.cuGroup', overlay).forEach(cb => cb.addEventListener('change', () => cb.closest('.perm-chip').classList.toggle('on', cb.checked)));
    const close = () => overlay.remove();
    $('#cuClose', overlay).addEventListener('click', close);
    $('#cuCancel', overlay).addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    $('#cuSave', overlay).addEventListener('click', () => {
      const res = QT.createUser({
        displayName: $('#cuName', overlay).value,
        email: $('#cuEmail', overlay).value,
        password: $('#cuPass', overlay).value,
        isAdmin: $('#cuAdmin', overlay).checked,
        canGlobal: $('#cuGlobal', overlay).checked,
        groups: $$('.cuGroup:checked', overlay).map(i => i.value),
        firms: $('#cuAllFirms', overlay).checked ? QT.state.firms.map(f => f.id) : []
      });
      if (!res.ok) { const e = $('#cuError', overlay); e.textContent = res.error; e.classList.remove('hidden'); return; }
      close();
      toast('Created ' + res.user.email + (res.user.isAdmin ? ' (admin)' : '') + '.', { tone: 'good', title: 'User created' });
      renderAccess();
    });
  }

  /* ---------- data governance (admin) ---------- */
  function renderGovernance() {
    const user = QT.currentUser();
    if (!user.isAdmin) return renderQueries();
    const tables = QT.state.schema.tables;
    const keys = Object.keys(tables).sort((a, b) => (tables[b].estimatedRows || 0) - (tables[a].estimatedRows || 0));
    const biggest = Math.max(...keys.map(k => tables[k].estimatedRows || 0));

    const rows = keys.map(k => {
      const t = tables[k];
      const sample = QT.datasetCount(t.dataset);
      const prod = t.estimatedRows || 0;
      const checked = QT.isMissionCritical(k);
      // Guiding principle: tables in the top tier of production volume are candidates.
      const suggest = prod >= biggest * 0.2;
      return `<tr>
        <td><strong>${esc(t.label)}</strong> <span class="muted small">${esc(k)}</span></td>
        <td class="right">${Fmt.number.format(sample)}</td>
        <td class="right">${esc(SqlCostLabel(prod))}</td>
        <td><span class="bar"><span class="bar-fill" style="width:${Math.max(3, Math.round(prod / biggest * 100))}%"></span></span></td>
        <td>${suggest ? '<span class="badge warn">high volume</span>' : '<span class="muted small">—</span>'}</td>
        <td><label class="switch"><input type="checkbox" data-mc="${esc(k)}" ${checked ? 'checked' : ''}><span class="slider"></span></label></td>
      </tr>`;
    }).join('');

    const content = h(`<div class="stack">
      <div class="page-head"><div><h1>Data Governance</h1>
        <p class="muted">Row counts per dataset guide which tables are <strong>mission-critical</strong>. A multi-table join that touches a checked table is treated as a <strong>heavy query</strong> and blocked during business hours (${esc(Policy.workStatus().windowLabel)}).</p></div></div>
      <div class="panel">
        <div class="table-wrap"><table class="data"><thead><tr>
          <th>Table</th><th class="right">Rows (sample)</th><th class="right">Est. prod rows</th><th>Relative volume</th><th>Signal</th><th>Mission&nbsp;critical</th>
        </tr></thead><tbody>${rows}</tbody></table></div>
        <p class="muted small" style="margin-top:14px">“Rows (sample)” is a live <code>COUNT(*)</code> over the demo data. “Est. prod rows” is the notional production size from <code>data/schema.json</code> and is what the cost estimator uses. Toggling a table takes effect immediately for new SQL-Assistant queries.</p>
      </div>
    </div>`);
    shell('governance', content);

    $$('[data-mc]', content).forEach(cb => cb.addEventListener('click', () => {
      QT.setMissionCritical(cb.dataset.mc, cb.checked);
      const t = QT.state.schema.tables[cb.dataset.mc];
      toast(`${t.label} ${cb.checked ? 'marked mission-critical' : 'cleared'} — joins on it ${cb.checked ? 'now force' : 'no longer force'} a heavy query.`,
        { tone: cb.checked ? 'warn' : 'info', title: 'Governance updated' });
    }));
  }

  /* ---------- query editor (admin, read-only viewer) ---------- */
  function renderEditor(selectedId) {
    const user = QT.currentUser();
    if (!user.isAdmin) return renderQueries();
    const queries = QT.state.queries;
    const current = queries.find(q => q.id === selectedId) || queries[0];
    const content = h(`<div class="stack">
      <div class="page-head"><div><h1>Query Editor</h1>
        <p class="muted">Query definitions are plain JSON in <code>config/queries/</code>. Edit a file, add it to <code>index.json</code>, refresh — the UI re-renders itself.</p></div></div>
      <div class="editor-grid">
        <div class="panel"><h3 class="panel-title">Definitions</h3>
          <ul class="qlist">${queries.map(q => `<li><a href="#/editor/${esc(q.id)}" class="${current && q.id === current.id ? 'active' : ''}">${esc(q.name)}<span class="muted small">${esc(q.id)}.json</span></a></li>`).join('')}</ul></div>
        <div class="panel">
          <div class="result-head"><h3 class="panel-title">${esc(current ? current.id : '')}.json</h3>
            <a class="btn ghost" href="#/run/${esc(current ? current.id : '')}">Open runner →</a></div>
          <pre class="json">${esc(JSON.stringify(current, null, 2))}</pre>
        </div>
      </div>
    </div>`);
    shell('editor', content);
  }

  init();
})();
