# Agentic Fraud Risk Framework: FAMS + FCMS prototype

This is an **Auronova Consulting** full-stack prototype of a bank fraud alert and case management system. It is built from the two source documents in the parent folder:

- The FCMS BRD (Word): FR-LP, FR-ALT and FR-CASE requirements.
- The agentic flow workbook (Excel): the process flow, the 12-agent map and the Q&A.

The system has two stages:

| Stage | Module | Question it answers |
|---|---|---|
| A | **FAMS**: alert management | "This rule fired. Is it fraud, and what do we do right now?" |
| B | **FCMS**: fraud case management | "It is fraud. Who checks it, who investigates, who approves, how do we close and report it?" |

The UI follows the Auronova Consulting style (auronova.in):

| Element | Value |
|---|---|
| Surfaces | White cards on a light lavender background (`#f6f8ff` / `#f3f6ff`) |
| Headings | Deep navy `#1c2045` |
| Accent | Amber `#ffb339` → orange `#ff7810` (active nav, primary CTAs, heading underline) |
| Font | Outfit, bundled locally as a free stand-in for Sofia Pro, the font used on auronova.in |
| Logo | The Auronova logo, in the sidebar and on the Word report |

All of these live in `client/src/styles/theme.css`.

Bank entities are generic (**Retail**, **Islamic**, **Digital**), and every demo email address uses `@auronova.example`.

## Run it

You need Node.js 22.5 or later and PostgreSQL (tested with PostgreSQL 18). The app runs on PostgreSQL only, locally and on Vercel.

**1. Database settings.** Copy `.env.example` to `.env` and put in your PostgreSQL password:

```ini
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/fraud_detection
TEST_DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/fraud_detection_test
```

`.env` is git-ignored, so the password never goes to GitHub. Without a `DATABASE_URL` the API answers 503 with a message explaining what to set.

**2. Install, set up the database, start.**

```powershell
cd fraud-framework
npm install
npm run db:setup     # creates fraud_detection + fraud_detection_test (if missing), the tables, and the demo data
npm run dev          # API on http://localhost:4000, UI on http://localhost:5173, Presidio masking service on :5055
```

**3. AI agent (optional).** The AI disposition agent needs Python 3.12 for the Presidio masking service and an OpenRouter key:

```powershell
python -m venv masking-service/.venv
masking-service/.venv/Scripts/pip install -r masking-service/requirements.txt uvicorn
# in .env:  OPENROUTER_API_KEY=sk-or-...   (and MASKING_PYTHON=<path to python> if the venv is elsewhere)
npm run ai:backfill  # one-off: analyse the alerts that already exist (new alerts are analysed on arrival)
```

Without Python, `npm run dev` still starts the app; the AI panel then says the masking service is unavailable and nothing is sent to the LLM.

| Command | What it does |
|---|---|
| `npm run db:setup` | Safe to re-run. Creates the databases and tables if missing; seeds demo data only into an empty database |
| `npm run db:setup -- --reseed` or `npm run seed` | Wipes the application database and re-seeds the demo data |
| `npm run test:all` | **Runs every automated test** and writes a report (see [Automated tests](#automated-tests)) |
| `npm test` | Server tests only (Vitest) |
| `npm run test:ui` | UI tests only (Playwright) |
| `npm run test-guide` | Rebuilds `docs/Agentic-Fraud-Test-Scenarios.xlsx` from the scenario catalogue |
| `npm run typecheck` / `npm run build` | Type check / production build |
| `npm run dev:masking` | Presidio masking service only (port 5055) |
| `npm run ai:backfill` | Analyses every open alert without an AI result (`-- --all` adds closed alerts, `-- --force` re-analyses) |

`GET /api/health` reports the database server and name the API is using (no credentials) and how many users it holds.

## Automated tests

```powershell
npm run test:all
# or: powershell -ExecutionPolicy Bypass -File scripts/run-all-tests.ps1 [-SkipUI] [-SkipUnit] [-Headed] [-Grep "TC-C1"]
```

The script checks the PostgreSQL connection, type-checks, runs both suites below, and writes `test-runs/<date-time>/summary.md` with the raw results and the Playwright HTML report (screenshots and traces of any failure). All tests use `TEST_DATABASE_URL`: your demo data in `DATABASE_URL` is never touched.

| Suite | Tests | Covers |
|---|---|---|
| Server (Vitest, `server/test`) | 108 | 23 workflow-rule tests; 9 API end-to-end tests (alert to closed case, recovery, re-open); 76 scenario-pack tests (every scenario's start state and outcome, plus the UAT issues-log fixes) |
| UI (Playwright + Chromium, `e2e-ui/`) | 73 | Every scenario's **Start** button opens the right record in the right state; TC-A01 and TC-A02 end to end through the screens; one check per issue in the UAT issues log |

The UI tests start their own API and UI on ports 4100 and 5273, so they can run while `npm run dev` is open.
## Test scenarios (UAT pack)

55 scripted scenarios cover every alert and case situation in the flow workbook (Sheets 2 to 7) and the BRD:

| Group | Scenarios |
|---|---|
| A · Detection alerts | End-to-end alert to closed case, each False Positive / Confirmed Fraud sub-classification, EDD round-trip, CRM failure, re-schedule limit, FP&I referral, send back / re-assign, multi-alert decision, data-quality exception, HR and Governance queues, SLA overdue, EDD over 8 days |
| B · Prevention alerts | Grey approve / reject, Red, Green, SLA escalation |
| C · Maker-Checker and routing | Manual case, golden rule and return loop, reject, every routing rule R1 to R4 (including AFS below, equal to and above X), changing X, draft delete, CRM SR and FP&I-initiated cases |
| D · FP&I | Full investigation, financial validations, investigator return, AFS approval, reviewer return, approver approve / return (AFS return to Maker), reviewer-cannot-approve |
| E · Joint and whistleblower | Joint investigation, joint review, whistleblower to HR and to Governance |
| F · Post-closure | Tasks, recovery maker-checker, re-open, disable, archive |
| X · Cross-cutting | Chinese wall, search, MI |

- Each scenario has its own synthetic customer (CIF `88xxxxx`) and a fixed-ID record (`ALT-TC-A01`, `FC-TC-C04`, `WB-TC-E03`…) already placed at the start of the test.
- **In the app:** Overview > **Test scenarios** lists them with a Ready / Already run indicator. **Start** switches to the right user and opens the record. System Administrator can **Reset demo data**.
- **In Excel:** `docs/Agentic-Fraud-Test-Scenarios.xlsx` has the scenario index, step-by-step instructions with Pass / Fail columns, a status flow chart per scenario, a coverage matrix, users and customers.
- The catalogue lives in `shared/src/scenarios.ts`. The seed (`server/src/scenarios.ts`), the page, the tests (`server/test/scenarios.test.ts`) and the Excel generator (`scripts/build-test-guide.ts`) all read it.

To check types or build for production: `npm run typecheck` / `npm run build`.

## Demo users

Use the selector in the top right to switch user. Login is a demo `X-User` header, because SSO is out of scope.

| User | Roles | Try |
|---|---|---|
| Aisha Rahman | Fraud Ops Analyst + Maker | Work an alert, decide Confirmed Fraud, create and prepare a case |
| Omar Haddad | Analyst + Maker + Checker | Open FC-2026-0002: you made it, so you **cannot** check it (golden rule) |
| Layla Nasser | Checker | Pick up FC-2026-0002 and approve it. Routing rules then decide close or investigate |
| Rashid Al Mansoori | FP&I Investigator | Checklist, diary, evidence, financial impact, joint investigation (FC-2026-0011) |
| Priya Menon | FP&I Investigator (no Digital entity access) | Co-investigator on FC-2026-0011. Whistleblower draft WB-2026-0002 |
| Khalid Suleiman | FP&I Reviewer | FC-2026-0012: return, approve and close, or send to Approver |
| Mariam Qasim | FP&I Approver | FC-2026-0013: approve, which generates the final report and closes the case. Approve recoveries |
| Daniel Fernandes | HR | Whistleblower WB-2026-0001 |
| Sana Iqbal | Governance | Governance queue |
| Hassan Tariq | Fraud Ops Manager + Checker | Supervisor assignment, daily SLA breach email |
| System Administrator | Super user | Everything, including re-open or disable a case, configuration and the email outbox |

## What's covered (mapped to the Excel sheets)

| Sheet | Screens | Key rules enforced server-side |
|---|---|---|
| 1 · Big Picture | Home, **Process map** (live counts per station) | Golden rule FR-CASE-030/085 |
| 2 · Detection alerts | Alert queue, Alert workspace | Ingest and normalise with immutable raw payload and data-quality exceptions. L1/L2 triage, department routing, pre-filled precautionary steps, EDD SR via a simulated CRM, re-schedule (+24h, max 3, TAT paused), refer to FP&I, multi-alert decision, mandatory rationale, decision fed back to DSP and CRM |
| 3 · Prevention alerts | Prevention desk | Prioritised and auto-allocated, Green/Red/Grey codes, Grey transactions held, Approve/Reject, SLA breach escalates to the manager |
| 4 · Case + Checker | Case workspace (Fraud Ops sections) | Unique Case ID, alert details inherited, save draft, mandatory validation on submit. Checker must be a different person. Routing table (FR-CASE-035) with a configurable "X" |
| 5 · FP&I | Investigation workspace | Checklist generated from risk category, diary with "Include in Final Report", evidence vault, financial validations (FR-CASE-045), recommendation, Word report on demand, Reviewer and Approver desks, Advance Fee Scam return goes to the Maker |
| 6 · Joint & Whistleblower | Joint investigation panel, Whistleblower list | The lead submits only when every co-investigator has finished. Whistleblower cases skip Fraud Ops and go to HR/Governance |
| 7 · Post-closure | Post-closure board, case post-closure tab | Final report emailed and saved, case frozen. Tasks for Op Risk Event, STR, Generic and Non-Generic issues each need a reference. Recovery is maker-checker. Super user can re-open or disable |
| 8 · AI agent map | **Agent hub**, AI-assist slots on each screen | All 12 agents are registered with their stage, autonomy, phase and planned tool calls. **No agents run yet** (see below) |
| BRD 4.2 / 5.13 / 5.15 | Landing KPIs, Dashboards, Calendar | KPI filters, fuzzy and global search, Excel export, TAT per actor excluding weekends and holidays, rule precision for DSP feedback, reminder emails 10 days ahead |

**Cross-cutting rules:**
- Chinese wall: entity-level access, Fraud Ops cannot see whistleblower cases, FP&I can view all alerts.
- A comment is required on every routing action.
- Full audit trail and **Show Diff** (previous vs new value).
- Every email goes to the **Email outbox**, a simulated Outlook.

## Architecture

```
fraud-framework/
  shared/src/index.ts       Roles, statuses, drop-downs, precaution catalogue, agent registry (used by client + server)
  server/src/
    workflow/               Pure state machines (unit-tested): alert.ts, case.ts, routing.ts, financial.ts
    services/               DB-backed services: alerts, cases, report (docx), dashboard, common (Chinese wall, outbox, fuzzy search)
    index.ts                Entry point (default-exports the Express app for Vercel; creates tables + seeds an empty DB)
    routes.ts               Express routes;  seed.ts: replays real workflows;  db-setup.ts: creates the PostgreSQL databases
    db.ts                   Database layer: PostgreSQL (DATABASE_URL), connection pool, async helpers, transactions, advisory locks
  server/test/              workflow.test.ts (rules), e2e.test.ts (whole lifecycle over HTTP), scenarios.test.ts (UAT pack + issues log)
  e2e-ui/                   Playwright UI tests;  scripts/run-all-tests.ps1: runs everything and writes a report
  client/src/
    pages/                  One page per screen; caseSections.tsx holds every case section
    components/             Layout + role switcher, DataTable, KPI filters, Evidence, AI-assist slot
    styles/theme.css        All colour tokens (Auronova palette)
  client/public/            Auronova logo, favicon, landing illustration
```

The seed drives every case through the **same services the API uses**, so the audit trails, emails, checklists and post-closure tasks in the demo data are real outputs of the workflow.

## Integration stubs

| External system | Stub in the prototype |
|---|---|
| DSP / SAS ingestion | `POST /api/alerts/ingest` (super user) |
| CRM service request → case | `POST /api/integrations/crm-sr` |
| CRM EDD | Simulated. The SR fails for a CIF starting `NEW`, to show FR-ALT-025 |
| Feature Store / Finacle / HRMS | Seeded tables, plus the HRMS list in config |
| OpenPages / FIU | "Push" generates a reference ID |
| Outlook | `outbox` table. Users see mail to them and to their team mailbox (fraud.ops@, fpi.team@, hr.governance@) |
| Maktaba | Link by reference |

## Alert allocation (balanced)

Every new alert (prevention and detection) is assigned when it arrives (`server/src/services/allocation.ts`), to an analyst with the right department and entity access:

1. **Equal totals:** the analyst with the fewest open alerts (existing + new).
2. **Priority mix:** on a tie, the fewest open alerts of the same priority (High / Medium / Low).
3. **Typology mix:** still tied, the fewest of the same fraud typology.

Alerts of one customer stay with one analyst, so they can still be decided together (FR-ALT-011). **Rebalance workload** on the alert queue (Fraud Ops Manager / Super User) previews, then redistributes, every open alert nobody has started (no decision, action, note, edit or evidence yet); a swap pass then evens out the priority and typology mix without changing totals. Switch auto-allocation per category under Configuration.

## AI disposition agent (#4)

For every new alert, the agent recommends **Confirmed Fraud**, **False Positive** or **Inconclusive**, with a confidence and the evidence behind it (`server/src/services/ai.ts`, prompt in `aiPrompt.ts`).

1. It collects the alert, customer KYC (date of birth becomes an age band), 90 days of transactions with baselines, beneficiary history, earlier alerts and cases, alerts sharing the device or beneficiary, and the rule's precision. The alert's own decision is never sent.
2. The **Presidio masking service** (`masking-service/main.py`) replaces every name, CIF, IBAN, Emirates ID, passport, card, device and transaction ID with a consistent placeholder (`<PERSON_1>`, `<IBAN_GB_2>`...). Known PII fields are always masked; free text goes through Presidio (spaCy + bank/UAE recognizers + the names already found). Merchants in `known_counterparties.txt` are kept. The placeholder table never leaves the Node server.
3. **Fails closed:** if masking is unavailable, or any known real value is still in the masked JSON, nothing is sent.
4. The masked JSON goes to **OpenRouter** (default `anthropic/claude-sonnet-5.5`, set under Configuration) with a strict JSON schema. Temporary failures (rate limit, empty or cut-off answer, 5xx) are retried twice. If the main model cannot answer (for example **402: the OpenRouter account has no credits**), the **fallback model** answers instead (default `baidu/ernie-5.5-flash-preview:free`, free tier: 50 requests a day; empty = off) and the result says so. Invalid answers get one repair attempt.
5. **Grounding:** every evidence item must cite record IDs or field paths that exist in the data; a Confirmed Fraud / False Positive without two verified, non-weak supporting items is downgraded to Inconclusive.
6. Placeholders are swapped back to real values for the analyst only. The alert page shows the verdict, evidence with sources, gaps, next steps and a draft rationale, plus **What the model saw** (the masked request and answer, for audit). The queue has an **AI verdict** column.

The agent only recommends: the analyst still decides, and maker-checker is unchanged. Runs are logged to `agent_runs`; results live in `ai_analyses`. Tests never call a real LLM (`AI_AGENT_DISABLED=1`); `server/test/ai.test.ts` uses mock services, and `MASKING_IT=1 npx vitest run test/masking-integration.test.ts` runs every seeded alert through the real Presidio service and checks that no real value reaches the (mock) LLM.

The other eleven agents are still the registry and tool contract (`GET /api/agents`); `POST /api/assistant/ask` returns 501.

## Deploy on Vercel (PostgreSQL)

Vercel cannot reach the PostgreSQL on your laptop, so the hosted app uses a cloud PostgreSQL. One-time setup:

1. In Vercel, open the project, then **Storage** > **Create Database** > **Neon** (serverless PostgreSQL, free plan is enough).
   Pick the region **US East (Washington, D.C. / aws-us-east-1)**, the same region as Vercel's functions (`iad1`), so the first-start seeding takes seconds, not minutes.
2. Connect it to the project for **Production** and **Preview**. Vercel adds `DATABASE_URL` to the project's environment variables (`POSTGRES_URL` is also accepted).
3. **Redeploy** (Deployments > ... > Redeploy). Environment variables only reach new deployments.
4. Open `/api/health`. The first request creates the tables and seeds the demo data into the empty database (about 10 to 20 seconds, once). After that it shows `"users": 11` and `"db": "postgresql://...neon.tech/..."`.

Notes:
- Every serverless instance shares the same database, so changes persist across requests and users.
- Concurrent cold starts are safe: schema creation and seeding run under PostgreSQL advisory locks, so one instance seeds and the others wait.
- SSL is switched on automatically for non-local servers, with certificate checks. Add `?sslmode=no-verify` to the URL only for a provider whose certificate Node.js does not trust.
- To reset the hosted demo data, switch to the System Administrator and use **Scenarios > Reset demo data** (it re-seeds on Vercel, next to the database). Running `npm run seed` from a laptop against a far-away cloud database works but is slow (thousands of round trips).
- Without `DATABASE_URL` the hosted API answers 503 with a message that says what to configure.
- **AI agent on Vercel:** `vercel.json` deploys `masking-service/` as a third, private Python service (FastAPI + Presidio + spaCy `en_core_web_md`, ~360 MB, within Vercel's 500 MB Python limit). It has no public route; the Express service reaches it through a service binding that injects `MASKING_URL`. Add **`OPENROUTER_API_KEY`** under Project > Settings > Environment Variables (Production + Preview) and redeploy. New alerts are analysed in the background of the request that created them (`waitUntil`); for the existing backlog, open **Agent hub > Analyse all open alerts** as the manager and keep the page open (it continues the queue every few seconds, since each Vercel request has a time limit).

## Known limitations

- Data is synthetic.
- The BRD appendix files ("New Drop-down values.xlsx", "Fraud Tracker categories update.xlsx", "BRD for Fraud Management Reports") were not supplied. The risk categories and drop-downs in `shared/src/index.ts` are representative placeholders and can be configured.
- FX rates are a static table, applied and stored per transaction.
- Authentication is a demo header.
- Evidence files and final reports are stored in the database (`evidence_files` table), so every server instance can serve them.
