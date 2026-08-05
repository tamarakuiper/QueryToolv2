# QueryTool — Operator & Admin Guide

A complete guide to running the app on any machine, what every function does,
every clickable control, and every tweak an administrator can make.

The app is **static files only** — HTML, CSS, and vanilla JavaScript. No build
step, no server-side code, no database engine. Everything it shows is driven by
editable JSON files.

---

## 1. Run it on any machine

The app reads its JSON config with `fetch()`, which browsers **block over
`file://`**. So you serve the folder over HTTP with any tiny static server and
open it in a browser. Pick whichever you already have — no installation of the
app itself is required.

### Option A — Python (already on most Macs/Linux; easy on Windows)

From the project folder (the one containing `index.html`):

```bash
python -m http.server 8000
```

On some systems it's `python3`:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/index.html>.

### Option B — Node.js

```bash
npx serve -l 8000
```

(or `npx http-server -p 8000`). Then open the URL it prints.

### Option C — VS Code

Install the **Live Server** extension, right-click `index.html` → **Open with
Live Server**.

### Option D — any other static host

Because it's just static files, you can also drop the folder on any static host
(internal file share that serves HTTP, IIS, nginx, an S3 static site, GitHub
Pages, etc.). No environment variables, no runtime.

### Requirements

- A modern browser (Chrome, Edge, Firefox, Safari). No plugins.
- Nothing else. No Node/Python is needed *by the app* — they're only options for
  serving the folder.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Could not load configuration" screen | Opened via `file://` | Serve over HTTP (Options A–D) and open `http://localhost:...` |
| Port already in use | Another server on 8000 | Use a different port, e.g. `... 8080` |
| Edited a JSON file, no change | Browser cached the page | Hard refresh (Ctrl/Cmd-Shift-R) |
| Blank page | Wrong folder served | Serve the folder that directly contains `index.html` |

### Moving it to another machine

Copy the **entire folder** (keep the structure intact) and serve it the same
way. State like schedules, reports, execution log, and mission-critical toggles
live in that browser's `localStorage`, so they do **not** travel with the files —
each machine/browser starts clean. The JSON config **does** travel with the files.

---

## 2. First login

Open the app and click a **demo-account chip** on the login screen to autofill,
then **Sign in**.

| Email | Password | Role |
|---|---|---|
| `ops@demo.com` | `demo123` | Operations |
| `advisor@demo.com` | `demo123` | Advisor |
| `compliance@demo.com` | `demo123` | Compliance |
| `admin@demo.com` | `admin123` | Administrator (sees Data Governance + Query Editor) |

---

## 3. Function-by-function

### Top bar (every screen)

- **Nav links** — Queries, Schedules, Reports, and (role-gated) SQL Assistant.
  Admin tools — Access & Permissions, Bulk Editor, Bulk Enrollment, Data
  Governance, Execution Log, Query Editor — are grouped alphabetically under an
  **Admin Tools ▾** menu so the header stays tidy.
- **Firm selector** — lists only the firms you're entitled to. Choose one firm;
  admins (and users granted the **Global** capability) also get **🌐 Global** (no
  firm filter — every firm) for cross-firm reporting. Your choice is remembered.
- **Sign out**.

### Queries

Lists the approved queries you can run, grouped by category. Only queries allowed
for your groups (and the selected firm's scope) appear. Click a card to open the
runner.

### Query runner

- The **parameter form is generated from the query's JSON** — multi-selects,
  numbers, dates, etc. Required fields are marked `*`.
- **Run query** executes against the selected firm (or Global, for admins) and
  shows a results table with a scope chip (firm name / 🌐 Global).
- **Export CSV** downloads the current results.
- **Schedule…** opens the scheduler for this query with your current parameters.
- **PII validation:** before you run, if the report selects name/address-type
  fields it shows a **⚠️ May contain PII** heads-up. After running, the result
  states it explicitly — **🔒 Contains PII** (with the categories and `PII`
  column tags) or **✓ No PII detected**.

### SQL Assistant

Plain-English → SQL, safely. **Access is role-gated** (`sqlAssistantAccess` in
`config/app.json`): by default advisors don't get it and can only run
pre-approved reports; the nav link is hidden and the page shows a "Not available
for your role" notice if reached by URL.

1. Type a request (e.g. *"top 5 accounts by balance"*) and click **Describe
   query**.
2. It shows a **description** of what it will do, its reasoning steps, and a
   confidence score — but runs nothing yet.
3. Click **Yes, run it** to execute, **View SQL** to see the generated SQL
   (**read-only** — users cannot edit the SQL), or **Schedule…** to run it later.
4. Ask for a global run in words — *"…across all firms"*, *"…for all firms"* —
   and it switches scope automatically.
5. **Heavy queries** (large joins / mission-critical joins) are **gated during
   business hours**: the run button is replaced with **Schedule after hours**.

### Schedules

Queries set to run automatically at a date/time (once or daily). Results save to
your report location. **Run now** runs it immediately, **Report** opens the last
result, **Delete** removes it. A small ticker runs due schedules in the
background; when one fires you get a **"Report generated"** toast.
**You only see your own schedules; administrators see everyone's.**

### Reports

Saved output from scheduled runs. **Open** views the full table, **CSV**
re-exports it, **Delete** removes it. Reports whose data contains personal data
carry a **PII** badge. **You only see your own reports; administrators see all.**

### Execution Log (admin only)

Restricted to administrators. Shows total executions, success rate, average
duration, and a **PII result sets** count. The activity table lists **which user
did what** — query runs (interactive → signed-in user; scheduled → the schedule's
owner) and **bulk edits** (tagged `bulk`, attributed to the admin, showing the
field → value change and affected account count) — with firm, rows, duration, a
**PII** badge, and status. **Clear log** empties it.

### Bulk Enrollment (admin)

The structured intake that replaces the Excel bulk-enroll template (Adhesion /
PortfolioONE Firm Composites). It **creates** proposal accounts for accounts that
aren't enrolled yet, with the same **conditional-required validation**:

- Paste **account numbers** (or **Load un-enrolled accounts**) and **Find** — the
  enrollable accounts return in a selectable list; already-enrolled and
  not-found/not-permitted numbers are called out separately.
- Fill the enrollment settings once (they apply to every selected account),
  grouped into **Client Account Info, Cash Settings, Withdrawal Settings, Account
  Settings** — rendered from `config/enrollment.json`.
- **Conditional required fields** adjust live: choosing **Trigger Type** =
  percent/dollar requires **Floor/Target/Ceiling**; **Dollar Cost Avg = Yes**
  requires the **DCA** fields; **Periodic Withdrawal = Yes** requires the
  **withdrawal** fields. Not-applicable fields grey out; required ones show `*`.
- **Enroll selected accounts** validates, then creates a proposal account per
  account and writes **`proposalaccountversion`** (v1 snapshot) +
  **`proposalaccounthistory`** (enroll event) + an **Execution Log** entry — all
  attributed to the admin. Re-enrolling an already-enrolled account is skipped.

**Carve-Outs** and **Pre-Trade Restrictions** sub-forms let you add per-account
rows (Account #, Ticker, Acquisition Date, Quantity / Restriction). They're
validated against the accounts being enrolled and are required when Has Carve Outs
/ Has Pretrade Restrictions = Yes.

After enrolling, a **Systems-ready SQL** panel shows the **full chain per account**:
`insert into proposalaccount (…)` (exact 45-column shell, name→ID lookups resolved
from `config/pa-lookups.json`) → `ProposalAccountVersion` (PAV) →
`ProposalAccountStatusHistory` (PASH) → the submission chain
`ProposalAccountSchedule` → `Signature` → `Activity.Activity` →
`ProposalAccountActivity` → `ProposalAccountSubmitActivity` (threaded with
`scope_identity()`), then any `ProposalAccountCarveOut` / `ProposalAccountRestriction`
rows — with `CreatedBy`/`AdvisorID` set and `CreatedOn = getdate()`. **Copy** or
**Download .sql**. This replaces the manual 09/10/11/12/13/14/15 BES steps.
(Drift/tolerance is a composite tolerance band, so it is deliberately not on the
insert.)

This covers the PortfolioONE enrollment → PA / PAV / PASH creation. The **Vestmark
P1** downstream (VAC/TAP file export, IV min/max targets) is intentionally out of
scope.

### Proposal Account — Bulk Editor (admin)

Replaces the old Excel workflow for updating trading settings across many accounts
at once. A **proposal account** row is linked to an account by account number and
holds its **cash triggers**, **floor/ceiling**, **rebalance threshold**, **model**,
and **trading-enabled** flag.

1. Paste **account numbers** (comma/space separated) into the box — or click
   **Load 16 example accounts** — and **Find accounts**.
2. The matched proposal accounts come back in a table, all selected (uncheck any
   you want to skip). Numbers you're not entitled to, or that don't exist, are
   listed as "not found / not permitted".
3. Pick a **field to update** (e.g. *Cash Trigger Low %*), enter the **new value**,
   and **Apply to selected**.
4. Every account is updated, its **Version** bumps, and the change is logged in
   three places, all stamped with the **admin who made it**:
   - **`proposalaccounthistory`** — one row per account (old → new, who, when, batch id),
   - **`proposalaccountversion`** — one full snapshot per account,
   - the central **Execution Log** — one `bulk` entry (field → value, account count,
     batch id, affected account numbers).
   The **Change history** panel shows the per-account log; **Export CSV** exports
   the current selection.
5. **Reset all changes** reverts to the seed values.

The `proposalaccounts` table is also queryable via the normal **Proposal Accounts**
query and the SQL Assistant.

### Access & Permissions (admin)

Assign rights with live toggles instead of hand-editing JSON:

- **Users → groups / firms / admin / global** — toggle each user's group
  memberships, firm access (with a **🌐 All firms** one-click toggle), the
  **Admin** flag (you can't remove your own), and **Global** — the right to run a
  query against **all firms** (admins always have it).
- **Queries → who can run them** — toggle which groups may run each query, or mark
  a query **Admin only**.
- **+ Create user** — add a user (name, email, password, groups, all-firms,
  Global, admin) from the admin view; created users are tagged **new** and can be
  **Removed**.
  Demo-created users persist in this browser (`localStorage: qt.newusers`); the
  base demo accounts come from `config/users.json`.
- **Reset to file defaults** — clears all overrides.

Changes apply immediately and persist as overrides in this browser
(`localStorage: qt.access`, `qt.newusers`), layered over the JSON config — exactly
like Data Governance. In production this would write to the server.

### Data Governance (admin)

Runs a live `COUNT(*)` on every dataset and shows each table's estimated
production size and relative volume, flagging the biggest as **high volume**.
Toggle **Mission critical** on the tables that could slow production; any
multi-table join touching a checked table is then treated as **heavy** and gated
during business hours.

### Query Editor (admin)

A read-only viewer of each query's JSON definition, with a link to open its
runner. To change a query you edit the JSON file (see below) — the UI re-renders
itself.

---

## 4. Clickable-control reference (verified)

Every interactive control was click-tested; all pass.

| Screen | Control | What it does |
|---|---|---|
| Login | Demo chip | Autofills that account's email/password |
| Login | Sign in | Logs in; shows "Incorrect password." on bad password |
| Top bar | Nav links (7) | Navigate between sections |
| Top bar | Firm selector | Switch firm (entitled only); admins also get 🌐 Global |
| Top bar | Sign out | Ends session, returns to login |
| Queries | Query card | Opens the runner |
| Runner | Checkboxes / number / date inputs | JSON-defined parameters |
| Runner | Run query | Executes; empty required-with-default multi-select reverts to its default |
| Runner | Export CSV | Downloads results |
| Runner | Schedule… | Opens scheduler modal |
| Assistant | Describe query / example chips | Generates SQL + description |
| Assistant | Yes, run it | Executes the generated SQL (blocked for heavy joins in business hours) |
| Assistant | View SQL | Reveals the generated SQL, **read-only** (not editable) |
| Assistant | Schedule… / Schedule after hours | Opens scheduler (after-hours prefilled when heavy) |
| Scheduler modal | Run at / Repeat / Location / Name | Schedule fields; rejects business-hours times for heavy queries |
| Schedules | Run now / Report / Delete | Run immediately / open last report / remove |
| Reports | Open / CSV / Delete | View / re-export / remove |
| Report detail | Export CSV / ← Reports | Download / go back |
| Execution Log (admin) | Clear log | Empties the log; the table shows which user ran what |
| Governance | Mission-critical toggle | Marks a table critical (affects heavy gating) |
| Bulk Enrollment (admin) | Find/Load accounts, fill intake form (conditional-required), Enroll, Reset | Create proposal accounts; writes version + history + log |
| Bulk Editor (admin) | Find accounts, Load example, select field + value, Apply, Reset, CSV | Bulk-update proposal accounts; writes history + versions |
| Access (admin) | Group/firm/admin/global toggles, 🌐 All firms, + Create user, Remove, Reset | Assign rights live; create/remove users |
| Editor | Definition list / Open runner | Browse JSON / jump to runner |
| Toasts | View / action | Jumps to the related report/section |

---

## 5. Admin tweaks (edit JSON, refresh)

All of these are plain files. Edit, save, hard-refresh the browser. No code
changes.

### App name, branding, feature flags — `config/app.json`

- `app.name`, `app.tagline`, `branding.logoText`, `branding.logoMark`,
  `branding.accent`, `branding.surface`.
- **Feature flags** (turn features on/off): `registration`, `activation`,
  `analytics`, `csvExport`, `queryEditor`, `sqlAssistant`, `scheduling`.
- **Auth**: `authentication.allowedEmailDomains`, `authentication.sessionKey`.
- **SQL Assistant access** — `sqlAssistantAccess`: `adminOnly` (true = admins
  only) and `allowGroups` (which groups may use the ad-hoc assistant). Admins
  always may. Groups not listed can only run **pre-approved reports** from the
  Queries page. Default: `["operations","compliance"]` — so **advisors are
  restricted to pre-approved reports**. Set `allowGroups: []` to deny all
  non-admins, or add a group to grant it.

### Bulk enrollment form — `config/enrollment.json`

Sections, fields, dropdown lookups, and required + conditional-`requiredIf` rules
for the Bulk Enrollment intake. Add/rename a field, add a dropdown value, or change
a validation rule here and the form updates itself — no code changes.

### proposalaccount insert lookups — `config/pa-lookups.json`

The `insert into proposalaccount (…)` column order and the name→ID maps
(custodian, account type, withdrawal frequency, composite/strategy IDs, status,
minimum trade). Edit these if your firm's IDs differ; composites without an ID
resolve to `NULL`.

### Business-hours governance — `config/app.json → queryPolicy`

- `enabled` — turn heavy-query gating on/off.
- `workHours.days` (1=Mon … 5=Fri), `workHours.start`, `workHours.end`.
- `afterHoursTime` — the suggested/pre-filled after-hours run time.
- `heavyCostThreshold` — cost above which a join is heavy regardless of
  mission-critical flags.

### Users / logins — `config/users.json`

Each user: `email`, `password` (demo plaintext — do **not** use in production),
`displayName`, `enabled`, `isAdmin`, `canGlobal` (may run the all-firms Global
scope), `groups` (array), `firms` (array of firm ids they may access),
`reportLocation` (where their scheduled reports save). Add/remove users by
editing this array.

### Firms — `config/firms.json`

Add firms with `id`, `slug`, `name`, `enabled`, `region`,
`accountsUnderManagement`. A user sees a firm only if its `id` is in their
`firms` list (admins see all).

### Access groups — `config/groups.json`

Define groups (`id`, `name`, `description`, `enabled`). Queries grant access by
group; users belong to groups.

### Queries — `config/queries/*.json` + `index.json`

- Edit a query's `name`, `description`, `category`, `enabled`, `access.groups`,
  `scope`, `execution.sql`, `parameters`, and `result.columns`.
- **Add a query**: copy an existing file, change the `id` and contents, then add
  its filename to `config/queries/index.json`. The UI renders the new form and
  table automatically.
- Mark a result column as PII with `"pii": true` (optional `"piiCategory"`).

### Tables, sizes, PII, mission-critical — `data/schema.json`

- `estimatedRows` per table — the notional production size the cost estimator
  uses.
- `missionCritical: true` — default mission-critical flag (admins can override at
  runtime on the Data Governance page).
- Column `pii` / `piiCategory` — what the PII detector treats as personal data
  and how it's labelled.
- `synonyms` — words the SQL Assistant maps to tables/columns.

### The data queries run against — `data/mock/*.json`

`accounts`, `holdings`, `clients`, `transactions`, `proposalaccounts`, plus the
`advisors` and `branches` reference tables and the empty `proposalaccounthistory`
/ `proposalaccountversion` audit seeds. To match the real managed-accounts domain,
**Advisor / Branch / Custodian / Household** are denormalized onto accounts,
holdings, transactions and proposal accounts (the single-table engine can't join),
and proposal accounts also carry **ProposalAccountStatus / Composite / DriftSetting**.
Add or edit rows freely; keep the `FirmId` column so firm scoping and global runs
work.

### Runtime admin controls (no file edit)

- **Access & Permissions page** — assign users↔groups/firms/admin, query↔groups,
  and **create users** with live toggles (persists in the browser).
- **Data Governance page** — toggle mission-critical tables (persists in the
  browser).
- **Firm selector** — global vs per-firm scope.

> File edits vs runtime toggles: the JSON files are the **defaults**; the Access
> and Governance pages store **overrides** on top of them in this browser. "Reset
> to file defaults" on the Access page clears the access overrides.

---

## 6. Security notes (demo vs production)

This is a client-side demo, so some things are intentionally simplified:

- Passwords are **plaintext** in `users.json` for easy editing. In production,
  store hashes and keep identities out of committed files.
- "Saving to a report location" records the report under that path label in the
  browser's `localStorage`; it does not write to a real filesystem.
- Business-hours gating and authorization run in the browser. In production the
  same rules would be enforced **server-side** so they can't be bypassed.
- What holds up regardless: normal users never type SQL; approved queries run
  fixed parameterized SQL; every run is firm-scoped and group-checked; global
  runs are limited to the firms a user is entitled to; and PII is flagged
  wherever it appears (results, reports, execution log).
