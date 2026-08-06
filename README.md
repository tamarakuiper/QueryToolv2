# QueryTool — Lightweight Standalone Edition

A JSON-driven, **zero-build** rebuild of the QueryTool portal — an approved,
firm-scoped, parameterized **query catalog** for a managed-accounts platform
(the demo queries echo the real tool: Firm Accounts, Firm Households, Held Assets,
Accounts in Model, Cash Triggers, etc.), plus the write side (Bulk Enrollment /
Bulk Editor for proposal accounts). Plain HTML + CSS + vanilla JavaScript.
Everything — users, firms, groups, queries, mock data — lives in editable JSON
files. No React, no bundler, no backend.

It also ships a **tiny "SQL LLM"**: a rule-based natural-language → SQL generator
that writes safe, read-only SQL on the fly and runs it against the mock data
through a small in-browser SQL engine.

## Run it

Browsers block `fetch()` of local files over `file://`, so serve the folder over
http with any static server:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/index.html>. (Alternatives: `npx serve -l 8000`,
the VS Code "Live Server" extension, or any static host.)

## Unit testing

The project now includes an automated unit test suite using Node's built-in
test runner (no extra framework required).

Run all tests:

```bash
npm test
```

Current unit coverage includes:

- `js/sqlengine.js` (filters, aggregates, ordering/limits, wildcard/global firm scope)
- `js/sqlllm.js` (NL→SQL generation heuristics and heavy-query join detection)
- `js/policy.js` (business-hours gating and mission-critical table logic)
- `js/pii.js` (PII category detection and explicit metadata overrides)
- `js/format.js` (formatting and CSV escaping)
- `js/store.js` scheduling behavior (weekly/monthly/quarterly recurrence advancement)

> **Full operator & admin guide:** see [docs/GUIDE.md](docs/GUIDE.md) — how to run
> on any machine (Windows/macOS/Linux), what every function and clickable control
> does, and every tweak an administrator can make.

## Demo logins

| Email | Password | Role | Sees |
|---|---|---|---|
| `ops@demo.com` | `demo123` | Operations | Accounts, Clients, Transactions |
| `advisor@demo.com` | `demo123` | Advisor | Accounts, Holdings |
| `compliance@demo.com` | `demo123` | Compliance | Clients (incl. **PII Export**), Transactions |
| `admin@demo.com` | `admin123` | Administrator | Everything + Query Editor |

On the login screen you can click a demo-account chip to autofill it. There are
**5 firms** (Demo Firm, Northstar Advisors, Cascade Capital, Meridian Wealth,
Blue Harbor Capital) — switch between them with the picker top-right.

## What to demo

1. Sign in as **ops@demo.com**, pick a firm (top-right), open **Accounts by Status**.
   The form (multi-select + date) is generated entirely from the query JSON.
2. Run it, then **Export CSV**.
3. Open **SQL Assistant**, type *"top 5 accounts by balance"* — it shows a
   plain-English **description** of what it will do; click **"Yes, run it"** to execute.
4. Sign in as **compliance@demo.com**, open **Client PII Export** and run it —
   the result shows a **🔒 Contains PII** banner and `PII` tags on the name,
   address, email, phone, DOB and SSN columns.
5. On any query click **Schedule…**, pick a time a minute out, and confirm. When
   it fires you get a **"Report generated"** toast; the result lands under
   **Reports** (saved to your report location, flagged if it contains PII).
6. In the SQL Assistant ask *"accounts joined with their holdings"* — during
   business hours it's flagged a heavy join and gated with **"Not allowed during
   business hours"**, steering you to **Schedule after hours**.
7. Open **Execution Log** (admin only) — see which user ran what.
8. Sign in as **advisor@demo.com** — the visible query list differs by group, and
   the SQL Assistant is hidden (advisors run pre-approved reports only).
9. As **admin@demo.com**, open **Access** to assign users↔groups/firms, control
   which groups can run each query, and **Create user** (demo users persist in the
   browser).
10. Open **Bulk Editor** → **Load 16 example accounts** → pick *Cash Trigger Low %*
    → set a value → **Apply to selected**. All 16 proposal accounts update at once
    and the change is logged to `proposalaccounthistory` + `proposalaccountversion`
    (shown in the Change history panel). This replaces the Excel workflow.
11. Open **Bulk Enrollment** → **Load un-enrolled accounts** → set **Trigger Type =
    percent** (Floor/Target/Ceiling become required) and **Dollar Cost Avg = Yes**
    (DCA fields become required) → fill them → **Enroll selected accounts**. It
    creates proposal accounts with the same conditional-required validation as the
    Adhesion template, writing version + history + an execution-log entry.

## Editing

Everything is data. No code changes needed for ordinary edits.

| To change… | Edit… |
|---|---|
| Login accounts / groups / firm access / **report location** | `config/users.json` |
| Firms | `config/firms.json` |
| Access groups | `config/groups.json` |
| App name, feature flags, branding | `config/app.json` |
| A query (params, SQL, columns) | `config/queries/<id>.json` |
| Add a new query | create `config/queries/<id>.json`, then add its filename to `config/queries/index.json` |
| The data queries run against | `data/mock/*.json` |
| Tables the SQL Assistant understands / **which columns are PII** / **table size + mission-critical defaults** (`estimatedRows`, `missionCritical`) | `data/schema.json` |
| Business hours, after-hours time, heavy threshold | `config/app.json → queryPolicy` |

After editing, just refresh the browser.

## Global vs per-firm scope

Pick the scope from the firm selector (top-right). It only ever lists firms the
user is **entitled** to:

- **A specific firm** — `WHERE FirmId = <id>`.
- **🌐 Global** — mimics a firm run but with **no `FirmId` filter at all** (the
  predicate is dropped), a true unscoped scan across **every firm**. Available to
  admins and to any user granted the **Global** capability on the Access page;
  everyone else runs one firm at a time.

No query SQL changes: the firm parameter (`@firmId`) becomes a single id or a
wildcard, and the engine adapts `FirmId = @firmId` accordingly.

- **Air-tight entitlement:** firm resolution is enforced server-style — a user
  can only ever resolve to a firm in their `firms` list; any other firm yields
  **zero rows**. "Global" (the all-firms wildcard) is only honored for admins and
  users granted the **Global** capability — for anyone else it's capped to their
  entitled firms.
- The **SQL Assistant** also understands global intent in plain English —
  *"total account balance across all firms"*, *"count accounts by status for all
  firms"* — and switches scope automatically, even if the picker is on one firm.
- Results show a scope chip (firm name / 🌐 Global). Aggregates like
  *"total market value across all firms"* are the natural global use case; add
  `GROUP BY FirmId` for a per-firm breakdown.

Designed for scale: with a million firms you'd run firm-scoped for day-to-day
work and reserve global runs for firm-wide reporting (and schedule the big ones —
see governance above).

## Scheduling & Reports

Any query (or an SQL-Assistant query) can be scheduled to run at a **date + time**,
either once or on a recurring cadence: **daily, weekly, monthly, or quarterly**.
Results are saved to the signed-in user's **report location** (`reportLocation` in
`config/users.json`, e.g. `/reports/compliance`).

Recurrence semantics in this standalone demo:

- **Weekly**: choose one or more weekdays (for example Mon/Wed/Fri).
- **Monthly**: choose a day-of-month (1-31) or "last day of month".
- **Quarterly**: calendar quarters only (**Jan/Apr/Jul/Oct**), with a chosen
  day-of-month or "last day of quarter month".
- For monthly/quarterly day-based schedules, days 29-31 are automatically
  clamped to the last valid calendar day when needed (for example day 31 in
  February runs on Feb 28/29).
- Missed-run behavior is unchanged: when the app is running, due schedules fire;
  this demo does not add a server-side catch-up worker.

- A small in-browser scheduler ticks every ~12s and runs due schedules — so a
  schedule set a minute out actually fires during a demo.
- When a report is generated, the signed-in user sees a **toast notification**
  ("Report generated → &lt;location&gt;") with a **View** shortcut.
- Saved reports live under **Reports** (view, re-export CSV, delete), with a
  **Cadence** column and filter (Once/Daily/Weekly/Monthly/Quarterly).
- Schedules and reports persist in `localStorage` (keys `qt.schedules`, `qt.reports`).

> This is a client-side demo, so "saving to a report location" records the report
> under that path label in the browser. In a real deployment the scheduler and file
> writes would run server-side.

## Heavy-query governance (business-hours gating)

The SQL Assistant estimates the **cost** of each request against notional
production table sizes (`estimatedRows` in `data/schema.json`, e.g. Transactions
~40M, Holdings ~8M). When a request pulls in **multiple large tables** — a join —
the assistant flags it as heavy.

- A heavy query attempted **during business hours** (config `queryPolicy.workHours`,
  default 09:00–17:00 Mon–Fri) is **gated**: the "Yes, run it" button is removed
  and replaced with **"Schedule after hours"**, showing *"Not allowed during
  business hours."* and a suggested after-hours time.
- The schedule modal pre-fills the suggested time and **refuses** any slot that
  falls back inside business hours.
- **Outside** business hours the same heavy query shows a 🕒 notice but can run.
- Light single-table queries are never gated.

Try it: in the SQL Assistant, ask *"accounts joined with their holdings"* or
*"all transactions with client and account details."* Tune or disable it in
`config/app.json → queryPolicy` (`enabled`, `workHours`, `afterHoursTime`,
`heavyCostThreshold`).

### Data Governance (admin) — mission-critical tables

Sign in as **admin@demo.com** and open **Data Governance**. The page runs a live
`COUNT(*)` on each dataset and shows its notional production size, so the biggest
tables ("high volume" signal) stand out as the ones that could slow prod down.

Each table has a **Mission critical** toggle. A multi-table join that **touches a
mission-critical table is forced to be heavy** — and therefore blocked during
business hours — regardless of its raw cost. Defaults (in `data/schema.json` via
`"missionCritical": true`) flag **Transactions** and **Holdings**; admin toggles
override those and persist in `localStorage` (`qt.governance`).

So the flow is: *counts guide the admin → admin checks mission-critical tables →
any multi-join on a checked table forces the heavy-query gate.* For example,
`accounts joined with clients` is **not** heavy by default, but becomes heavy the
moment an admin marks **Clients** mission-critical.

## PII detection

PII is flagged before and after a run:

- **Before running** (validation) — if the query selects name/address-type
  fields, a **⚠️ May contain PII** heads-up appears with the categories.
- **After running** — the result states it explicitly: **🔒 Contains PII**
  (categories + `PII` column tags) or **✓ No PII detected**.
- When PII is present, only those columns render as masked placeholders. An
  **Immuta Reveal PII** button appears for that result set; clicking it reveals
  the values and enables CSV export. Non-PII results never show the button.
- Saved reports carry the same masking/reveal behavior plus a **PII** badge, and
  the Execution Log records PII per run.

Categories detected: Name, Address, Email, Phone, DOB, SSN.

Detection is by column name/label pattern (`js/pii.js`), so it also works on
ad-hoc SQL from the assistant. A column can also opt in explicitly with
`"pii": true` (and optional `"piiCategory"`) in `data/schema.json` or a query's
`result.columns`. The **Client Directory** (name + address) and **Client PII
Export** (name, address, email, phone, DOB, SSN) queries demonstrate this.

### Adding a query

1. Copy an existing file in `config/queries/` and change the `id`, `name`,
   `execution.sql`, `parameters`, and `result.columns`.
2. Add the new filename to `config/queries/index.json`.
3. Refresh. The UI renders the new form and result table automatically —
   no front-end code changes.

## Project layout

```
index.html                 app shell + script order
css/styles.css             all styling
js/
  sqlengine.js             mini SQL engine (SELECT/WHERE/IN/LIKE/GROUP BY/ORDER/LIMIT/aggregates)
  sqlllm.js                rule-based natural-language → SQL generator
  format.js                value formatting + CSV export
  pii.js                   PII detection (name/address/email/phone/DOB/SSN)
  policy.js                heavy-query cost + business-hours gating
  store.js                 JSON loading, auth/session, authz, execution, scheduling, reports, logging
  app.js                   router + all views (login, queries, runner, assistant, schedules, reports, log, editor)
config/
  app.json                 app name, feature flags, branding, auth mode
  firms.json               firms
  groups.json              access groups
  users.json               demo users (plaintext passwords — DEMO ONLY)
  queries/
    index.json             list of query files to load
    *.json                 one self-contained query definition each
data/
  schema.json              table + column metadata for the SQL Assistant
  mock/*.json              the mock database tables
```

## Notes & guardrails

- **Demo only.** Passwords are plaintext in `users.json` for easy editing. In a
  real deployment, keep identities and hashes out of committed files and execute
  queries server-side.
- Normal users never supply SQL. Predefined queries run fixed, parameterized SQL.
  The SQL Assistant generates SQL from a fixed schema and only ever reads the
  in-memory mock arrays — it cannot reach a real database. The generated SQL is
  shown **read-only**; users cannot edit it, and execution always runs the SQL the
  generator produced, never any user-typed text.
- The ad-hoc SQL Assistant is **role-gated** (`config/app.json → sqlAssistantAccess`).
  By default advisors don't get it — they can only run **pre-approved reports**
  from the Queries page; the nav link is hidden and the route is blocked.
- Every query is scoped to the selected firm and filtered by the user's groups.
- Users only see **their own** schedules and reports; administrators see all.
- The **Execution Log is admin-only** and records **which user ran which query**
  (scheduled runs are attributed to the schedule's owner).
- Execution history is stored in the browser's `localStorage` (key `qt.execlog`).
