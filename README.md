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

You need Node.js 22.5 or later. The prototype uses the built-in `node:sqlite`, so there is no native build step.

```powershell
cd fraud-framework
npm install
npm run seed     # reset the database with synthetic bank-style data
npm run dev      # API on http://localhost:4000, UI on http://localhost:5173
npm test         # 23 workflow unit tests + 9 end-to-end API tests + 68 scenario-pack tests
npm run test-guide   # rebuild docs/Agentic-Fraud-Test-Scenarios.xlsx from the scenario catalogue
```

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
    index.ts                Entry point (default-exports the Express app for Vercel; auto-seeds an empty DB)
    routes.ts               Express routes;  db.ts: node:sqlite schema + helpers;  seed.ts: replays real workflows
  server/test/              workflow.test.ts (rules), e2e.test.ts (whole lifecycle over HTTP)
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
| Outlook | `outbox` table |
| Maktaba | Link by reference |

## Next phase: the agent layer

The Excel notes ask for "Agent: tool call" and "Gen AI: Q&A". The hooks are in place:

- `GET /api/agents` returns the registry and the planned tool calls for each agent.
- `POST /api/agents/:id/run` and `POST /api/assistant/ask` return **501** today. They are where the Claude tool-use loop plugs in.
- The agents will use read-only tools scoped by the user's Chinese-wall access. Runs will be logged to `agent_runs`.
- Every agent recommends or drafts only. A person decides, and maker-checker is unchanged.

## Known limitations

- Data is synthetic.
- The BRD appendix files ("New Drop-down values.xlsx", "Fraud Tracker categories update.xlsx", "BRD for Fraud Management Reports") were not supplied. The risk categories and drop-downs in `shared/src/index.ts` are representative placeholders and can be configured.
- FX rates are a static table, applied and stored per transaction.
- Authentication is a demo header.
- Files are stored on local disk at `server/data/uploads`.
