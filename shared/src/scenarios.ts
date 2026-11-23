// Test-scenario pack: one entry per alert / case situation in the agentic flow workbook (Sheets 2-7) and the FCMS BRD.
// Single source of truth for: the seeded scenario records (server/src/scenarios.ts), the in-app "Test scenarios" page,
// the scenario test (server/test/scenarios.test.ts) and the Excel test guide (scripts/build-test-guide.ts).

export const TEST_USERS: Record<string, { name: string; roles: string }> = {
  'u-aisha': { name: 'Aisha Rahman', roles: 'Fraud Ops Analyst + Maker' },
  'u-omar': { name: 'Omar Haddad', roles: 'Fraud Ops Analyst + Maker + Checker' },
  'u-layla': { name: 'Layla Nasser', roles: 'Fraud Ops Analyst + Checker' },
  'u-hassan': { name: 'Hassan Tariq', roles: 'Fraud Ops Manager + Checker' },
  'u-rashid': { name: 'Rashid Al Mansoori', roles: 'FP&I Investigator' },
  'u-priya': { name: 'Priya Menon', roles: 'FP&I Investigator (no Digital entity)' },
  'u-khalid': { name: 'Khalid Suleiman', roles: 'FP&I Reviewer' },
  'u-mariam': { name: 'Mariam Qasim', roles: 'FP&I Approver + Reviewer' },
  'u-daniel': { name: 'Daniel Fernandes', roles: 'HR Analyst' },
  'u-sana': { name: 'Sana Iqbal', roles: 'Governance Analyst' },
  'u-super': { name: 'System Administrator', roles: 'Super User' },
}

/** Dedicated synthetic customers, one per scenario, so scenarios never interfere with each other. */
export const SCENARIO_CUSTOMERS: Record<string, { name: string; entity: 'Retail' | 'Islamic' | 'Digital'; segment: string; eid: string }> = {
  '8800101': { name: 'Hamdan Al Ketbi', entity: 'Retail', segment: 'Retail - Priority', eid: '784-1984-8800101-3' },
  '8800102': { name: 'Meera Pillai', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1990-8800102-1' },
  '8800103': { name: 'Abdulla Al Shamsi', entity: 'Islamic', segment: 'Retail - Priority', eid: '784-1978-8800103-5' },
  NEW0002: { name: 'Lucas Moreau', entity: 'Retail', segment: 'Retail - Mass', eid: '784-2001-8800104-2' },
  '8800105': { name: 'Reem Khalil', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1993-8800105-4' },
  '8800106': { name: 'Tariq Bakr', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1999-8800106-6' },
  '8800107': { name: 'Sophia Mendes', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1988-8800107-1' },
  '8800108': { name: 'Yusuf Rahimi', entity: 'Retail', segment: 'SME', eid: '784-1981-8800108-9' },
  '8800110': { name: 'Grace Thomas', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1975-8800110-2' },
  '8800111': { name: 'Nadia Saleh', entity: 'Retail', segment: 'Private Banking', eid: '784-1962-8800111-8' },
  '8800112': { name: 'Ibrahim Qureshi', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1986-8800112-3' },
  '8800113': { name: 'Fatima Idrissi', entity: 'Retail', segment: 'Retail - Priority', eid: '784-1980-8800113-7' },
  '8800114': { name: 'Joseph Mathai', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1970-8800114-4' },
  '8800201': { name: 'Kareem Aziz', entity: 'Retail', segment: 'SME', eid: '784-1979-8800201-5' },
  '8800202': { name: 'Elena Rossi', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1992-8800202-1' },
  '8800203': { name: 'Ahmed Siddiqui', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1985-8800203-6' },
  '8800204': { name: 'Linda Park', entity: 'Retail', segment: 'Retail - Priority', eid: '784-1983-8800204-2' },
  '8800205': { name: 'Samir Khoury', entity: 'Retail', segment: 'Corporate', eid: '784-1972-8800205-9' },
  '8800301': { name: 'Noura Al Marzooqi', entity: 'Retail', segment: 'Retail - Priority', eid: '784-1987-8800301-4' },
  '8800302': { name: 'Peter Lobo', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1991-8800302-7' },
  '8800303': { name: 'Aaliyah Brown', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1995-8800303-2' },
  '8800304': { name: 'Majed Al Rumaithi', entity: 'Retail', segment: 'Corporate', eid: '784-1976-8800304-1' },
  '8800305': { name: 'Chen Wei', entity: 'Retail', segment: 'SME', eid: '784-1989-8800305-3' },
  '8800306': { name: 'Anjali Rao', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1994-8800306-8' },
  '8800307': { name: 'Marco Bianchi', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1982-8800307-5' },
  '8800308': { name: 'Huda Al Amiri', entity: 'Retail', segment: 'Retail - Priority', eid: '784-1977-8800308-2' },
  '8800309': { name: 'Victor Okafor', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1968-8800309-9' },
  '8800310': { name: 'Salma Darwish', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1973-8800310-4' },
  '8800311': { name: 'Robert King', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1958-8800311-1' },
  '8800312': { name: 'Waleed Al Habsi', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1990-8800312-6' },
  '8800313': { name: 'Olivia Grant', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1961-8800313-3' },
  '8800314': { name: 'Faris Jaber', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1997-8800314-8' },
  '8800315': { name: 'Amina Yusuf', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1993-8800315-5' },
  '8800316': { name: 'George Mansour', entity: 'Retail', segment: 'SME', eid: '784-1980-8800316-2' },
  '8800401': { name: 'Zayed Al Nuaimi', entity: 'Retail', segment: 'Retail - Mass', eid: '784-2000-8800401-7' },
  '8800402': { name: 'Hana Kobayashi', entity: 'Retail', segment: 'Retail - Priority', eid: '784-1985-8800402-4' },
  '8800403': { name: 'Mustafa Karim', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1998-8800403-1' },
  '8800404': { name: 'Diana Petrova', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1966-8800404-6' },
  '8800405': { name: 'Khalifa Al Dhaheri', entity: 'Retail', segment: 'Private Banking', eid: '784-1971-8800405-3' },
  '8800406': { name: 'Rania Fawzi', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1996-8800406-9' },
  '8800407': { name: 'Arjun Mehta', entity: 'Retail', segment: 'Retail - Priority', eid: '784-1984-8800407-2' },
  '8800408': { name: 'Catherine Doyle', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1955-8800408-8' },
  '8800409': { name: 'Bilal Chaudhry', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1989-8800409-5' },
  '8800501': { name: 'Saeed Al Falasi', entity: 'Retail', segment: 'Retail - Mass', eid: '784-2002-8800501-1' },
  '8800502': { name: 'Mona Zaki', entity: 'Retail', segment: 'Retail - Priority', eid: '784-1979-8800502-7' },
  '8800601': { name: 'Layan Barakat', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1994-8800601-3' },
  '8800602': { name: 'Thomas Weber', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1969-8800602-9' },
  '8800603': { name: 'Sameera Nair', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1991-8800603-6' },
  '8800604': { name: 'Kevin Brennan', entity: 'Retail', segment: 'Retail - Mass', eid: '784-1983-8800604-2' },
  '8800701': { name: 'Adel Al Mazrouei', entity: 'Digital', segment: 'Digital - Neo', eid: '784-1999-8800701-8' },
}

export interface ScenarioStep {
  /** User to select in the top-right user switcher. */
  as: string
  /** Screen / place in the UI. */
  at: string
  do: string
  expect: string
}
export interface Scenario {
  id: string
  group: string
  title: string
  kind: 'End-to-end' | 'Happy path' | 'Alternate path' | 'Edge case' | 'Control check'
  /** Sheet of the agentic flow workbook this scenario exercises. */
  sheet: string
  brd: string
  /** Seeded records to open (first one is the starting point). Empty when the tester creates the record. */
  records: string[]
  /** Status of the first record when freshly seeded (used for the "Ready" indicator). */
  startStatus?: string
  customer?: string
  startAs: string
  setup: string
  /** Status path the record walks through. */
  flow: string
  steps: ScenarioStep[]
  expected: string
}

const S = (as: string, at: string, d: string, expect: string): ScenarioStep => ({ as, at, do: d, expect })

export const SCENARIO_GROUPS = [
  'A · Detection alerts',
  'B · Prevention alerts',
  'C · Case creation, Maker-Checker and routing',
  'D · FP&I investigation, review and approval',
  'E · Joint investigation and whistleblower',
  'F · Post-closure, recovery, re-open',
  'X · Cross-cutting controls and MI',
] as const

const A = SCENARIO_GROUPS[0], B = SCENARIO_GROUPS[1], C = SCENARIO_GROUPS[2], D = SCENARIO_GROUPS[3], E = SCENARIO_GROUPS[4], F = SCENARIO_GROUPS[5], X = SCENARIO_GROUPS[6]

export const SCENARIOS: Scenario[] = [
  // ======================= A · Detection alerts (Sheet 2) =======================
  {
    id: 'TC-A01', group: A, kind: 'End-to-end', sheet: '1, 2, 4, 5, 7', brd: 'FR-ALT-010..043, FR-CASE-03..080',
    title: 'Alert to closed case: Confirmed Fraud, case, Checker, full FP&I investigation, Approver, final report',
    records: ['ALT-TC-A01'], startStatus: 'Yet to start', customer: '8800101', startAs: 'u-aisha',
    setup: 'High-priority alert DSP-R450 "Repeated transfers to overseas investment platform" for Hamdan Al Ketbi: AED 48,500 SWIFT to Global Invest FX (fake crypto platform). Unassigned in the Fraud Ops queue.',
    flow: 'Alert: Yet to start > WIP > Closed (Confirmed Fraud) | Case: Draft > Submitted to FO Checker > Approved for Investigation > Investigation in progress > Review in progress > Pending Approval > Investigation Approved > Final report generated and closed',
    steps: [
      S('u-aisha', 'Alert queue', 'Type ALT-TC-A01 in the fuzzy search box and open the alert. Click "Assign to me".', 'Status changes Yet to start > WIP; Assigned to Aisha Rahman; TAT clock is running against a 48h SLA.'),
      S('u-aisha', 'Alert workspace: left sections', 'Review Alert record (click "Raw DSP payload"), Customer, Last alerts, Transactions (3 months) and Other accounts.', 'The alerted transaction TC-8800101-F1 is highlighted; raw payload is read-only JSON; customer data shows national ID 784-1984-8800101-3.'),
      S('u-aisha', 'Alert workspace: Precautionary steps', 'Pre-filled steps appear (Victim Customer Contacted, SWIFT Cancellation Initiated, Lien Amount, Case Reported to Police by Email). Untick "Case Reported to Police by Email", enter Lien Amount 48500, add "Victim Online Banking Blocked" from the catalogue, then "Save steps".', 'Toast "Precautionary steps saved". Unticked step stays visible but unselected.'),
      S('u-aisha', 'Alert workspace: Notes & references', 'Enter Potential savings 12000, Reference IDs "SIEBEL-55120", a note; click "Save".', 'Toast "Saved".'),
      S('u-aisha', 'Alert workspace: Actions', 'Under "Pre-populated emails" click "✉ FP&I Notified".', 'Activity log shows "Email sent: Fraud alert: FP&I notified"; step FP&I Notified becomes ticked.'),
      S('u-aisha', 'Alert workspace: Actions', 'Final decision: Decision = Confirmed Fraud, Sub-classification = Scam-phishing, Rationale = "Customer confirms transfers were induced by a fake crypto platform." Click "Submit decision".', 'Status Closed; green box "Closed: Confirmed Fraud / Scam-phishing. Decision sent back to DSP and CRM"; activity shows "Decision sent to DSP + CRM".'),
      S('u-aisha', 'Alert workspace: Actions', 'Click "Create a case for investigation".', 'New case FC-2026-00xx opens in Draft, Desk = Fraud Ops Maker, assigned to Aisha; origin "Alert decision"; transaction and precautionary actions inherited. Email "Confirmed fraud: case ... created" in Email outbox. Note the case ID.'),
      S('u-aisha', 'Case workspace', 'Check the Workflow box "Before submitting" list. Open Risk classification: L1 Investment Scam, L2 Fake Investment, Risk title Crypto platform. Open Recommendation: Category Process, Type Generic, Issue "Weak customer authentication", Action "Customer awareness campaign", text. Financial summary: Amount lost 48500. Click "Save draft".', 'Info box on Risk classification: "All other cases: route to the FP&I Investigator pool". "Before submitting" warning disappears.'),
      S('u-aisha', 'Case workspace: Workflow', 'Click "Submit to Fraud Ops Checker", enter a comment, confirm.', 'Status Submitted to FO Checker; Desk Fraud Ops Checker; Aisha now has no actions (golden rule).'),
      S('u-layla', 'Fraud cases > My pool (to pick up)', 'Open the case, click "Pick up from Fraud Ops Checker pool", then "Approve (apply routing rules)" with a comment.', 'Status Approved for Investigation; routing note R4; email "approved for investigation" to FP&I.'),
      S('u-rashid', 'Fraud cases > My pool (to pick up)', 'Open the case and click "Pick up from FP&I Investigator pool".', 'Status Investigation in progress; Investigation sections appear; Checklist generated from Investment Scam (6 items).'),
      S('u-rashid', 'Case: Checklist / Diary / Evidence', 'Mark 2 checklist items "Open" > "✓ Done"; expand a log, add an entry with a Finding and tick "Include in final report"; upload a file in Evidence vault linked to a checklist item.', 'Checklist badge shows 2/6; diary entry listed; evidence listed with checklist ID.'),
      S('u-rashid', 'Case: Financial impact', 'Attempted 60500, Successful 48500, Near miss 12000, Potential 20000, Gross 48500, Recovery 0, Exposure 60500, Memo ref MEMO-2201. Save draft.', 'Green "All financial validations pass"; Net loss AED 48,500.'),
      S('u-rashid', 'Case: Investigator recommendation', 'Category System, Type Generic, Issue "Rule gap in DSP", Action "Tune DSP rule", text; tick "Central Bank STR required". Save draft. In "Fraud investigation report" click "Generate report (.docx)".', 'Word report downloads with the included finding and Auronova logo.'),
      S('u-rashid', 'Case: Workflow', 'Click "Submit to Reviewer" with a comment.', 'Status Review in progress; Desk FP&I Reviewer (pool).'),
      S('u-khalid', 'Fraud cases > My pool', 'Pick up the case, then "Send to Approver" with a comment.', 'Status Pending Approval; Desk FP&I Approver.'),
      S('u-mariam', 'Fraud cases > My pool', 'Pick up the case, then "Approve (final report + close)" with a comment.', 'Status Final report generated and closed; badge Frozen; final report in Evidence vault (Final Report folder); email "Final investigation report" in outbox; Post-closure activity shows Op Risk Event, Central Bank STR and Generic Issue tasks.'),
    ],
    expected: 'One alert walks through every desk with no manual data re-entry; each hand-off is in the Audit trail with its comment; final report emailed; three post-completion tasks created.',
  },
  {
    id: 'TC-A02', group: A, kind: 'Happy path', sheet: '2', brd: 'FR-ALT-038..040, 043',
    title: 'False Positive: Valid alert – non fraud (velocity rule on legitimate bill payments)',
    records: ['ALT-TC-A02'], startStatus: 'Yet to start', customer: '8800102', startAs: 'u-aisha',
    setup: 'Velocity alert DSP-R205 ("> 8 transfers in 1h") for Meera Pillai, who paid rent, DEWA, school fees and family in one session.',
    flow: 'Yet to start > WIP > Closed (False Positive)',
    steps: [
      S('u-aisha', 'Alert queue', 'Search ALT-TC-A02, open it, "Assign to me".', 'Status WIP.'),
      S('u-aisha', 'Alert workspace: Transactions', 'Review today\'s 9 small transfers to known payees (Rent - Al Futtaim, DEWA, Etisalat...).', 'All counterparties are regular payees from earlier months.'),
      S('u-aisha', 'Alert workspace: Actions', 'Select Decision False Positive and Sub-classification Valid alert-non fraud, but leave Rationale empty.', '"Submit decision" stays disabled (rationale is mandatory, FR-ALT-040).'),
      S('u-aisha', 'Alert workspace: Actions', 'Enter rationale "Customer confirmed month-end bill payments by recorded call." and "Submit decision".', 'Status Closed; NO "Create a case" button (only Confirmed Fraud can become a case); event "Decision sent to DSP + CRM".'),
      S('u-aisha', 'Alert queue > History tab', 'Switch to History and search ALT-TC-A02.', 'Alert listed as Closed. In Reports & dashboards > Rule precision, DSP-R205 false positives increase by 1.'),
    ],
    expected: 'False positive closes the alert without a case and feeds rule precision back to DSP.',
  },
  {
    id: 'TC-A03', group: A, kind: 'Alternate path', sheet: '2', brd: 'FR-ALT-023..025, 056..059',
    title: 'EDD SR raised in CRM, outcome fetched, Islamic EDD email, then False Positive (Inconclusive)',
    records: ['ALT-TC-A03'], startStatus: 'Yet to start', customer: '8800103', startAs: 'u-omar',
    setup: 'Islamic-entity customer Abdulla Al Shamsi; AED 22,000 UAEFTS to an unknown beneficiary.',
    flow: 'Yet to start > WIP > EDD raised > EDD responded > Closed (False Positive)',
    steps: [
      S('u-omar', 'Alert workspace', 'Open ALT-TC-A03, "Assign to me", then "Raise EDD SR".', 'Status EDD raised; info box shows SR-xxxxxxxx open in CRM; precautionary step "EDD SR Raised" added with SR reference.'),
      S('u-omar', 'Alert workspace: Actions', 'Click "✉ EDD Email Sent for Islamic Linked Account".', 'Email to islamic.edd@auronova.example in the Activity log and Email outbox; step ticked with today\'s date.'),
      S('u-omar', 'Alert workspace', 'Click "Fetch CRM outcome (simulated)".', 'Status EDD responded; "EDD outcome (CRM)" shown in the Alert record; SR status Closed.'),
      S('u-omar', 'Alert workspace: Actions', 'Decide False Positive / Inconclusive with rationale and submit.', 'Status Closed.'),
    ],
    expected: 'EDD round-trip recorded with SR number, dates and outcome; Islamic EDD email template pre-populated with customer and transaction details.',
  },
  {
    id: 'TC-A04', group: A, kind: 'Edge case', sheet: '2', brd: 'FR-ALT-025, 029..032',
    title: 'EDD cannot be raised for a new-to-bank customer (not in CRM), so the analyst re-schedules',
    records: ['ALT-TC-A04'], startStatus: 'Yet to start', customer: 'NEW0002', startAs: 'u-aisha',
    setup: 'Customer Lucas Moreau (CIF NEW0002) is not yet in Siebel CRM.',
    flow: 'Yet to start > WIP > (EDD refused) > Re-scheduled > Yet to start',
    steps: [
      S('u-aisha', 'Alert workspace', 'Open ALT-TC-A04, "Assign to me", click "Raise EDD SR".', 'Red error toast: "CRM interface: CIF not found in Siebel CRM. EDD SR could not be raised; consider re-scheduling (FR-ALT-025)". Status stays WIP; activity log records "EDD SR refused by CRM" (no browser console error).'),
      S('u-aisha', 'Alert workspace', 'Click "Re-schedule +24h (0/3)".', 'Status Re-scheduled; alert unassigned; "Back in the queue on <tomorrow>. TAT is paused."; re-schedules 1 / 3.'),
      S('u-aisha', 'Calendar', 'Open Calendar and find tomorrow.', 'Entry "Re-scheduled alert: Lucas Moreau" (the alert type shows in the Upcoming list and the tooltip); all seven day columns are equal width.'),
      S('u-aisha', 'Alert workspace', 'Click "Move back to current queue".', 'Status Yet to start; TAT resumes and excludes the paused time.'),
    ],
    expected: 'CRM failure is handled gracefully and re-scheduling pauses TAT.',
  },
  {
    id: 'TC-A05', group: A, kind: 'Edge case', sheet: '2', brd: 'FR-ALT-029..032',
    title: 'Re-schedule limit: 3 re-schedules maximum, the 4th is blocked',
    records: ['ALT-TC-A05'], startStatus: 'Yet to start', customer: '8800105', startAs: 'u-layla',
    setup: 'Alert has already been re-scheduled twice (2/3) because the customer could not be reached; it is back in the queue.',
    flow: 'Yet to start > WIP > Re-scheduled (3/3) > Yet to start > WIP (re-schedule disabled) > Closed',
    steps: [
      S('u-layla', 'Alert workspace', 'Open ALT-TC-A05; Alert record shows Re-schedules 2 / 3. "Assign to me", then "Re-schedule +24h (2/3)".', 'Status Re-scheduled; Re-schedules 3 / 3.'),
      S('u-layla', 'Alert workspace', '"Move back to current queue", then "Assign to me" again.', 'Status WIP; the button now reads "Re-schedule +24h (3/3)" and is disabled (FR-ALT-030).'),
      S('u-layla', 'Alert workspace', 'Decide False Positive / Customer declined, rationale "Customer declined to engage after three call attempts; activity in line with profile".', 'Status Closed. TAT shown excludes the time spent re-scheduled.'),
    ],
    expected: 'The system enforces the configurable maximum of 3 re-schedules.',
  },
  {
    id: 'TC-A06', group: A, kind: 'Alternate path', sheet: '2', brd: 'FR-ALT-035, 060, 061',
    title: 'Refer to FP&I for feedback, FP&I responds, Confirmed Fraud closed without a case',
    records: ['ALT-TC-A06'], startStatus: 'Yet to start', customer: '8800106', startAs: 'u-layla',
    setup: 'Mule-pattern alert DSP-R310: AED 35,000 inbound moved out to Crypto Exchange XT within 10 minutes.',
    flow: 'Yet to start > WIP > Referred to FP&I > WIP > Closed (Confirmed Fraud)',
    steps: [
      S('u-layla', 'Alert workspace', 'Open ALT-TC-A06, "Assign to me", click "Refer to FP&I", type a question, "Refer".', 'Status Referred to FP&I; "Waiting for FP&I feedback"; Raise EDD SR and Refer to FP&I are hidden and Submit decision is disabled until FP&I responds; email "Alert referral for feedback" to FP&I.'),
      S('u-rashid', 'Alert workspace (FP&I has view access)', 'Open ALT-TC-A06 (global search), click "Respond to referral", Send back to = "The analyst who referred it", enter response, "Send response".', 'Status WIP, still assigned to Layla; email "FP&I responded" to Layla.'),
      S('u-layla', 'Alert workspace', 'Read "FP&I response" in the Alert record. Decide Confirmed Fraud / Scam-malicious code (personal PC) with rationale. Do NOT create a case.', 'Status Closed; "Create a case for investigation" button remains available for later (creating a case is optional).'),
    ],
    expected: 'Referral loop is emailed both ways and recorded; a confirmed-fraud alert can close without a formal case.',
  },
  {
    id: 'TC-A07', group: A, kind: 'Alternate path', sheet: '2', brd: 'FR-ALT-010..013, 026, 033, FR-LP-014',
    title: 'Send back to queue, re-assign to a colleague, and supervisor assignment',
    records: ['ALT-TC-A07'], startStatus: 'Yet to start', customer: '8800107', startAs: 'u-aisha',
    setup: 'Phishing alert DSP-R412 (card-not-present spike after OTP reset), unassigned.',
    flow: 'Yet to start > WIP (Aisha) > Yet to start > WIP (Omar) > WIP (Layla) > WIP (Aisha, by manager) > Closed',
    steps: [
      S('u-aisha', 'Alert workspace', 'Open ALT-TC-A07, "Assign to me", then "Send back to queue".', 'Status Yet to start, unassigned.'),
      S('u-omar', 'Alert queue', 'Tick the row for ALT-TC-A07 and click "Assign 1 to me" (bulk assignment).', 'Assigned to Omar, status WIP.'),
      S('u-omar', 'Alert workspace', 'Click "Re-assign", choose Layla Nasser, "Re-assign".', 'Assigned to Layla; Omar sees it read-only; activity log reads "Re-assigned to Layla Nasser".'),
      S('u-hassan', 'Alert workspace (manager)', 'Use "Assign to analyst…" = Aisha Rahman, click "Assign".', 'Assigned to Aisha; event "Assigned to Aisha Rahman".'),
      S('u-aisha', 'Alert workspace', 'Decide False Positive / Customer declined: "Customer declined fraud claim, purchases confirmed".', 'Closed. Activity log shows every hand-over in order.'),
    ],
    expected: 'All queue movements are possible and audited.',
  },
  {
    id: 'TC-A08', group: A, kind: 'Edge case', sheet: '2', brd: 'FR-ALT-007, 011',
    title: 'Several alerts for one customer grouped and decided in one action',
    records: ['ALT-TC-A08', 'ALT-TC-A08B', 'ALT-TC-A08C'], startStatus: 'Yet to start', customer: '8800108', startAs: 'u-aisha',
    setup: 'Three rules fired for Yusuf Rahimi (new beneficiary transfer, mule pattern, velocity).',
    flow: '3 x Yet to start > Closed (False Positive) in one decision',
    steps: [
      S('u-aisha', 'Alert workspace', 'Open ALT-TC-A08.', 'Blue banner: "2 other open alert(s) for this customer: ALT-TC-A08B ALT-TC-A08C. You can decide them together".'),
      S('u-aisha', 'Alert workspace: Actions', '"Assign to me"; decide False Positive / Rule discrepancy; under "Apply the same decision to other alerts" tick both; rationale; "Submit decision".', 'All three alerts Closed with the same decision (check each in History).'),
    ],
    expected: 'One decision covers all alerts of the same customer.',
  },
  {
    id: 'TC-A09', group: A, kind: 'Edge case', sheet: '2', brd: 'FR-ALT-03, 05',
    title: 'Data-quality exception: unknown CIF and missing account number',
    records: ['ALT-TC-A09'], startStatus: 'Yet to start', startAs: 'u-omar',
    setup: 'DSP sent an alert for CIF UNK0009 (not in Feature Store) without an account number.',
    flow: 'Yet to start > WIP > Closed (False Positive / System issue)',
    steps: [
      S('u-omar', 'Alert workspace', 'Open ALT-TC-A09.', 'Yellow banner "Data quality exception: missing accountNumber, cif (not found in Feature Store)"; Customer card "Customer not found in Feature Store".'),
      S('u-omar', 'Alert record', 'Click "Raw DSP payload".', 'Original payload shown unchanged (immutable, FR-ALT-05).'),
      S('u-omar', 'Alert workspace', '"Assign to me" and decide False Positive / System issue: "Test record sent by DSP during deployment".', 'Closed.'),
    ],
    expected: 'Bad data is flagged, not silently dropped, and can still be dispositioned.',
  },
  {
    id: 'TC-A10', group: A, kind: 'Alternate path', sheet: '2', brd: 'FR-ALT-04, 09, 041',
    title: 'HR department queue: staff account receiving customer funds, HR confirms fraud and raises a case',
    records: ['ALT-TC-A10'], startStatus: 'Yet to start', customer: '8800110', startAs: 'u-aisha',
    setup: 'Rule DSP-R520: Grace Thomas sent AED 18,000 to the staff account of teller Ravi Shankar (S11877). Routed to the HR queue.',
    flow: 'Yet to start > WIP (HR) > Closed (Confirmed Fraud) > Case Draft in Fraud Ops Maker pool',
    steps: [
      S('u-aisha', 'Global search', 'Search ALT-TC-A10, then open /alerts/ALT-TC-A10 directly.', 'Not found in search; the direct link shows "Chinese wall: you cannot view this alert." (HR queue, FR-ALT-04).'),
      S('u-daniel', 'Alert queue', 'Open ALT-TC-A10, "Assign to me", decide Confirmed Fraud / External fraud with rationale.', 'Closed.'),
      S('u-daniel', 'Alert workspace', 'Click "Create a case for investigation".', 'Case created in Draft, Desk Fraud Ops Maker (pool), read-only for Daniel; email to FP&I.'),
      S('u-aisha', 'Fraud cases > My pool (to pick up)', 'Find the new case for Grace Thomas and "Pick up from Fraud Ops Maker pool".', 'Aisha becomes the maker.'),
    ],
    expected: 'Staff-related alerts are only workable by HR, and HR can still start a case.',
  },
  {
    id: 'TC-A11', group: A, kind: 'Alternate path', sheet: '2', brd: 'FR-ALT-04, 09',
    title: 'Governance department queue: dormant account access out of hours, closed as Valid alert',
    records: ['ALT-TC-A11'], startStatus: 'Yet to start', customer: '8800111', startAs: 'u-sana',
    setup: 'Rule DSP-R530: staff accessed dormant account of Nadia Saleh at 22:40. Routed to Retail Governance.',
    flow: 'Yet to start > WIP > Closed (False Positive)',
    steps: [
      S('u-sana', 'Alert queue', 'Open ALT-TC-A11 (queue shows "Retail Governance").', '"Assign to me" available only for Governance.'),
      S('u-sana', 'Alert workspace', 'Assign, decide False Positive / Valid alert-non fraud: "Approved dormancy re-activation request SR-6612".', 'Closed.'),
    ],
    expected: 'Governance works its own queue.',
  },
  {
    id: 'TC-A12', group: A, kind: 'Control check', sheet: '2', brd: 'FR-ALT-063..066',
    title: 'Overdue alert (SLA breached) and the daily SLA breach email',
    records: ['ALT-TC-A12'], startStatus: 'WIP', customer: '8800112', startAs: 'u-omar',
    setup: 'Medium-priority alert (96h SLA) created 5 days ago, assigned to Omar, still WIP.',
    flow: 'WIP (overdue) > Closed',
    steps: [
      S('u-omar', 'Alert queue', 'Find ALT-TC-A12 in the queue.', 'Row shaded light red with a red left stripe and "Overdue +~1d" in the TAT column; red badge "n overdue (SLA breached)" above the table.'),
      S('u-hassan', 'Reports & dashboards', 'Click "Send daily SLA breach email".', 'Toast; Email outbox has "Daily SLA breach summary" to Omar cc hassan.tariq@auronova.example listing ALT-TC-A12.'),
      S('u-omar', 'Alert workspace', 'Decide False Positive / Inconclusive.', 'Closed; no longer overdue.'),
    ],
    expected: 'Breaches are visible with ageing and summarised by email to users and managers.',
  },
  {
    id: 'TC-A13', group: A, kind: 'Control check', sheet: '2', brd: 'FR-ALT-068',
    title: 'EDD open for more than 8 days triggers a notification to Fraud Ops',
    records: ['ALT-TC-A13'], startStatus: 'EDD raised', customer: '8800113', startAs: 'u-super',
    setup: 'EDD SR raised 9 days ago by Omar, still no response from business.',
    flow: 'EDD raised (notified) > EDD responded > Closed (Confirmed Fraud)',
    steps: [
      S('u-super', 'Email outbox', 'Look for subject "EDD open more than 8 days: ALT-TC-A13".', 'Email to fraud.ops@auronova.example present.'),
      S('u-omar', 'Alert workspace', 'Open ALT-TC-A13, "Fetch CRM outcome (simulated)", then decide Confirmed Fraud / Scam-pharming and create a case if you wish.', 'EDD responded > Closed.'),
    ],
    expected: 'Long-running EDD requests are chased automatically.',
  },

  // ======================= B · Prevention alerts (Sheet 3) =======================
  {
    id: 'TC-B01', group: B, kind: 'Happy path', sheet: '3', brd: 'FR-ALT-046..053',
    title: 'Grey (step-up) held transaction released: Approve as Expected or Authorized Behavior',
    records: ['ALT-TC-B01'], startStatus: 'Hold', customer: '8800201', startAs: 'u-aisha',
    setup: 'AED 18,000 SWIFT to a regular supplier held by the decision layer; auto-allocated to Aisha. 30-minute SLA.',
    flow: 'Hold (held) > Closed (Approve, released)',
    steps: [
      S('u-aisha', 'Alert queue', 'Open the queue.', 'Prevention alerts (coloured chips) are listed above all detection alerts (FR-ALT-047).'),
      S('u-aisha', 'Prevention desk', 'Find ALT-TC-B01 in "Work area: ranked by SLA risk" (Grey, HELD, SLA bar).', 'Held transactions KPI includes it.'),
      S('u-aisha', 'Alert workspace', 'Disposition: Decision Approve, Reason Expected or Authorized Behavior, Description "Call-back to customer confirmed supplier payment". "Submit decision".', 'Status Closed, HELD badge removed, event "Approved: held transaction released"; listed under Recent decisions.'),
    ],
    expected: 'Held money is released only after an analyst decision, within SLA.',
  },
  {
    id: 'TC-B02', group: B, kind: 'Happy path', sheet: '3, 4', brd: 'FR-ALT-051..053, FR-CASE-01',
    title: 'Grey held transaction rejected as Confirmed fraud, then a case is created',
    records: ['ALT-TC-B02'], startStatus: 'Hold', customer: '8800202', startAs: 'u-aisha',
    setup: 'First-time AED 45,000 instant payment from a new device to an unknown beneficiary; held; allocated to Aisha.',
    flow: 'Hold > Closed (Reject, blocked) > Case Draft',
    steps: [
      S('u-aisha', 'Alert workspace', 'Open ALT-TC-B02. Decision Reject, Reason Confirmed fraud, description. Submit.', 'Closed; event "Rejected: transaction blocked (confirmed fraud)".'),
      S('u-aisha', 'Alert workspace', 'Click "Create a case for investigation".', 'Case in Draft with the held transaction and steps inherited.'),
    ],
    expected: 'A rejected prevention alert can become a case like a confirmed detection alert.',
  },
  {
    id: 'TC-B03', group: B, kind: 'Alternate path', sheet: '3', brd: 'FR-ALT-050, 052',
    title: 'Red (blocked by decision layer): analyst confirms the block',
    records: ['ALT-TC-B03'], startStatus: 'WIP', customer: '8800203', startAs: 'u-omar',
    setup: 'Transfer to a watch-listed beneficiary blocked (Red); allocated to Omar.',
    flow: 'WIP > Closed (Reject)',
    steps: [S('u-omar', 'Prevention desk > ALT-TC-B03', 'Decision Reject / Confirmed fraud with description; submit.', 'Closed; decision listed under Recent decisions as Reject.')],
    expected: 'Red alerts are not held (already blocked) but still need a recorded disposition.',
  },
  {
    id: 'TC-B04', group: B, kind: 'Alternate path', sheet: '3', brd: 'FR-ALT-050, 052',
    title: 'Green (allowed to go): reviewed for pattern and approved as False positive',
    records: ['ALT-TC-B04'], startStatus: 'WIP', customer: '8800204', startAs: 'u-layla',
    setup: 'AED 3,500 payment allowed by the decision layer (Green); allocated to Layla.',
    flow: 'WIP > Closed (Approve)',
    steps: [S('u-layla', 'Prevention desk > ALT-TC-B04', 'Decision Approve / False positive with description; submit.', 'Closed; no hold involved.')],
    expected: 'All three colour codes have a disposition path.',
  },
  {
    id: 'TC-B05', group: B, kind: 'Control check', sheet: '3', brd: 'FR-ALT-054, 067',
    title: 'Prevention SLA breach escalates immediately to the Fraud Ops Manager',
    records: ['ALT-TC-B05'], startStatus: 'Hold', customer: '8800205', startAs: 'u-hassan',
    setup: 'Grey held SWIFT AED 27,000 to a high-risk jurisdiction, allocated to Omar 50 minutes ago (SLA 30 min).',
    flow: 'Hold (breached, escalated) > re-assigned > Closed',
    steps: [
      S('u-hassan', 'Prevention desk', 'Check the "SLA breached" KPI and the red SLA bar on ALT-TC-B05.', '"Breached +20m" or more.'),
      S('u-hassan', 'Email outbox', 'Find "ESCALATION: prevention alert ALT-TC-B05 breached SLA".', 'Sent to the manager; event "SLA breach escalated to Fraud Ops Manager" in the alert activity.'),
      S('u-hassan', 'Alert workspace', '"Assign to analyst…" = Layla Nasser, "Assign".', 'Assigned to Layla.'),
      S('u-layla', 'Alert workspace', 'Decide Reject / Confirmed fraud.', 'Closed.'),
    ],
    expected: 'Breaches are escalated without anyone having to notice them.',
  },

  // ======================= C · Case creation, Maker-Checker and routing (Sheet 4) =======================
  {
    id: 'TC-C01', group: C, kind: 'Happy path', sheet: '4', brd: 'FR-CASE-01, 05..029',
    title: 'Manual case by the Fraud Ops Maker: draft save, mandatory validation, multi-currency transactions',
    records: [], customer: '8800301', startAs: 'u-aisha',
    setup: 'Noura Al Marzooqi phoned the branch: she sent USD 5,000 and EUR 2,000 to a fake broker. No alert exists.',
    flow: 'Draft > Submitted to FO Checker > Approved for Investigation',
    steps: [
      S('u-aisha', 'Fraud cases', 'Click "+ New case", CIF 8800301, description, "Create case".', 'Draft case opens, origin "Manual - Fraud Ops"; customer details auto-filled from core banking.'),
      S('u-aisha', 'Case: Workflow', 'Click "Submit to Fraud Ops Checker" straight away (with a comment).', 'Error toast listing missing mandatory fields (Complexity, Risk Category L1/L2, Risk Title, Reporting channel, Recommendation category). Date reported is already today.'),
      S('u-aisha', 'Case: Transaction details', 'In "Find and add transactions" click "Search", tick TC-8800301-F1, F2 and F3, "Add 3 selected".', 'Rows show Original USD 5,000 / EUR 2,000 / AED 3,000 with FX 3.6725 / 3.98 / 1 and AED totals; summary by type; selected rows disappear from search.'),
      S('u-aisha', 'Case sections', 'Complexity L2; Source details: Reporting channel Customer call (Date reported is pre-filled with today); Risk: Investment Scam / Fake Investment / Forex platform; Recommendation Category People; Mandatory actions tick Customer contacted and "Business notified". "Save draft".', 'Toast "Saved"; email "business notification" in outbox; Show Diff lists the changed fields.'),
      S('u-aisha', 'Case: Workflow', 'Submit to Fraud Ops Checker.', 'Status Submitted to FO Checker.'),
      S('u-layla', 'Fraud cases > My pool', 'Pick up and Approve.', 'Approved for Investigation (rule R4).'),
    ],
    expected: 'Draft can be saved incomplete, but submit is blocked until mandatory fields are filled; FX frozen per transaction.',
  },
  {
    id: 'TC-C02', group: C, kind: 'Control check', sheet: '4', brd: 'FR-CASE-030, 033, 085, 087',
    title: 'Golden rule (maker cannot check own case) and Checker return for rework loop',
    records: ['FC-TC-C02'], startStatus: 'Submitted to FO Checker', customer: '8800302', startAs: 'u-omar',
    setup: 'Mule Account case prepared and submitted by Omar (who also holds the Checker role).',
    flow: 'Submitted to FO Checker > Return for re-work > Submitted to FO Checker > Approved for Investigation',
    steps: [
      S('u-omar', 'Case FC-TC-C02', 'Open the case.', 'No pick-up button; red box "Separation of duties: the Fraud Ops Maker cannot be the Checker of the same case (FR-CASE-030)".'),
      S('u-layla', 'Case FC-TC-C02', '"Pick up from Fraud Ops Checker pool", then "Return to Maker" with "Please attach the beneficiary bank recall reference".', 'Status Return for re-work; red banner with the comment; returned to Omar; Rework loops 1.'),
      S('u-omar', 'Case FC-TC-C02', 'Note there is no "Delete draft" button (returned cases cannot be deleted). Edit Financial summary Amount saved 5000, "Save draft", "Submit to Fraud Ops Checker".', 'Status Submitted to FO Checker, back in the Fraud Ops Checker pool.'),
      S('u-layla', 'Case FC-TC-C02', 'Pick up and "Approve (apply routing rules)".', 'Approved for Investigation; Audit trail shows the full back-and-forth; Show Diff shows amountSaved 0 > 5000.'),
    ],
    expected: 'Four-eyes rule enforced server-side; unlimited rework loops audited.',
  },
  {
    id: 'TC-C03', group: C, kind: 'Alternate path', sheet: '4', brd: 'FR-CASE-032, 084',
    title: 'Checker rejects a case (closed), comment is mandatory',
    records: ['FC-TC-C03'], startStatus: 'Submitted to FO Checker', customer: '8800303', startAs: 'u-layla',
    setup: 'Duplicate phishing case submitted by Aisha.',
    flow: 'Submitted to FO Checker > Reject (closed)',
    steps: [
      S('u-layla', 'Case FC-TC-C03', 'Pick up, click "Reject (close case)" and try to confirm with an empty comment.', 'Confirm button disabled until a comment is typed (FR-CASE-084).'),
      S('u-layla', 'Case FC-TC-C03', 'Comment "Duplicate of an existing case for the same transaction", confirm.', 'Status Reject; Frozen; moves to Fraud cases > History.'),
    ],
    expected: 'Reject closes the case without routing.',
  },
  ...(
    [
      ['TC-C04', 'FC-TC-C04', '8800304', 'Group Compliance / Regulatory / AML / Suspicious structuring', 'R1: close + email Group Compliance', 'Approved and Closed (FO); email "closed by routing rule R1" to group.compliance@ only (not Cyber Security)'],
      ['TC-C05', 'FC-TC-C05', '8800305', 'Cyber Security / Malware / Intrusion / Credential theft', 'R1: close + email Cyber Security', 'Approved and Closed (FO); routing email to cyber.security@ only (not Group Compliance)'],
      ['TC-C06', 'FC-TC-C06', '8800306', 'External Fraud / Phishing / Vishing / Vishing - OTP disclosure', 'R2: close at Fraud Ops', 'Approved and Closed (FO); no FP&I involvement'],
      ['TC-C07', 'FC-TC-C07', '8800307', 'Card Fraud / Card Not Present / E-commerce compromise', 'R2: close at Fraud Ops', 'Approved and Closed (FO)'],
      ['TC-C08', 'FC-TC-C08', '8800308', 'Fraudulent Enquiries / Customer Enquiry / Unrecognised transaction enquiry', 'R2: close at Fraud Ops', 'Approved and Closed (FO)'],
      ['TC-C09', 'FC-TC-C09', '8800309', 'Advance Fee Scam / Advance Fee / Lottery / prize, amount lost AED 9,500', 'R3: below X (10,000), close', 'Approved and Closed (FO); routing note "AED 9,500 is at or below X"'],
      ['TC-C10', 'FC-TC-C10', '8800310', 'Advance Fee Scam / Advance Fee / Inheritance, amount lost exactly AED 10,000', 'R3 boundary: equal to X, close', 'Approved and Closed (FO); "AED 10,000 is at or below X = AED 10,000"'],
      ['TC-C11', 'FC-TC-C11', '8800311', 'Advance Fee Scam / Advance Fee / Romance scam, amount lost AED 25,000', 'R3: above X, investigate', 'Approved for Investigation; in FP&I Investigator pool; email to FP&I'],
      ['TC-C12', 'FC-TC-C12', '8800312', 'Internal Fraud / Staff Misconduct / Unauthorised access', 'R4: all others, FP&I Investigator pool', 'Approved for Investigation'],
    ] as const
  ).map(([id, rec, cif, cat, rule, result]): Scenario => ({
    id, group: C, kind: 'Control check', sheet: '4', brd: 'FR-CASE-035',
    title: `Routing on Checker approval: ${rule}`,
    records: [rec], startStatus: 'Submitted to FO Checker', customer: cif, startAs: 'u-layla',
    setup: `Case prepared and submitted by Aisha with risk classification ${cat}.`,
    flow: `Submitted to FO Checker > ${result.split(';')[0]}`,
    steps: [
      S('u-layla', `Case ${rec}`, 'Open the case; read the blue "If approved:" box in the Workflow card (also shown in Risk classification).', `Preview names rule ${rule.slice(0, 2)}.`),
      S('u-layla', `Case ${rec}`, '"Pick up from Fraud Ops Checker pool", "Approve (apply routing rules)" with a comment.', result),
      S('u-layla', 'Case: Audit trail', 'Open Audit trail.', `Entry "Checker approved" with "[Routing ${rule.slice(0, 2)}]" explanation.`),
    ],
    expected: `Data-driven routing table applied: ${rule}.`,
  })),
  {
    id: 'TC-C13', group: C, kind: 'Edge case', sheet: '4', brd: 'FR-CASE-035 (configurable X)',
    title: 'Changing the Advance Fee Scam threshold X changes the routing outcome',
    records: ['FC-TC-C13'], startStatus: 'Submitted to FO Checker', customer: '8800313', startAs: 'u-mariam',
    setup: 'Advance Fee Scam case with amount lost AED 25,000 (above the default X = 10,000).',
    flow: 'Submitted to FO Checker > Approved and Closed (FO) (after X raised to 30,000)',
    steps: [
      S('u-layla', 'Case FC-TC-C13', 'Open and read "If approved:".', '"above X = AED 10,000, so send to the FP&I Investigator pool".'),
      S('u-mariam', 'Configuration', 'Set "Advance Fee Scam threshold X (AED)" to 30000 and click its "Save".', 'Toast "Advance Fee Scam threshold X saved".'),
      S('u-layla', 'Case FC-TC-C13', 'Refresh: preview now says "at or below X = AED 30,000, so close the case". Pick up and approve.', 'Approved and Closed (FO).'),
      S('u-mariam', 'Configuration', 'Set X back to 10000 and save.', 'Default restored (other scenarios rely on it).'),
    ],
    expected: 'Business can tune X without code changes.',
  },
  {
    id: 'TC-C14', group: C, kind: 'Edge case', sheet: '4, 5', brd: 'FR-CASE-026, 087',
    title: 'Deleting a draft: allowed only if never returned',
    records: ['FC-TC-C14'], startStatus: 'Draft', customer: '8800314', startAs: 'u-aisha',
    setup: 'Draft created by Aisha by mistake; never submitted.',
    flow: 'Draft > deleted',
    steps: [
      S('u-omar', 'Case FC-TC-C14', 'Open the case.', 'Read-only; no "Delete draft" (only the Fraud Ops Maker who created it, while it is still with them, or a super user may delete).'),
      S('u-aisha', 'Case FC-TC-C14', 'Click "Delete draft"; the app\'s confirmation pop-up opens. Click "Delete draft" in the pop-up.', 'Back on Fraud cases with toast "Draft deleted"; the case is gone. Compare with FC-TC-C02 (submitted) where no delete button exists.'),
    ],
    expected: 'Only never-returned drafts can be deleted, only by the creator.',
  },
  {
    id: 'TC-C15', group: C, kind: 'Alternate path', sheet: '4', brd: 'FR-CASE-01 (CRM SR)',
    title: 'Case auto-created from a CRM service request, picked by a Maker from the pool',
    records: ['FC-TC-C15'], startStatus: 'Draft', customer: '8800315', startAs: 'u-omar',
    setup: 'CRM SR-77000123 "unrecognised card transactions abroad" created the case automatically (unassigned).',
    flow: 'Draft (pool) > Draft (Omar) > Submitted to FO Checker',
    steps: [
      S('u-omar', 'Fraud cases > My pool (to pick up)', 'Open FC-TC-C15 (Origin "CRM service request", SR number pre-filled). Click "Pick up from Fraud Ops Maker pool".', 'Assigned to Omar.'),
      S('u-omar', 'Case sections', 'Fill Risk Card Fraud / Card Present / Cloned card, Complexity L1, Recommendation category, save and submit.', 'Submitted to FO Checker; preview shows rule R2.'),
    ],
    expected: 'System-originated cases enter the Maker pool.',
  },
  {
    id: 'TC-C16', group: C, kind: 'Alternate path', sheet: '4', brd: 'FR-CASE-02',
    title: 'FP&I asks Fraud Ops to create a case (initial checks and precautionary steps)',
    records: ['FC-TC-C16'], startStatus: 'Draft', customer: '8800316', startAs: 'u-rashid',
    setup: 'Rashid (FP&I) raised FC-TC-C16 after an external bank notification. Email sent to Fraud Ops.',
    flow: 'Draft (Maker pool) > Draft (Aisha)',
    steps: [
      S('u-rashid', 'Fraud cases', 'Optional: click "+ New case" yourself to see the info box "As FP&I, this sends the case to the Fraud Ops Maker pool..."', 'A second case is created the same way.'),
      S('u-aisha', 'Email outbox', 'Find "FP&I request: please create and action case FC-TC-C16".', 'Email present (sent to the Fraud Ops team mailbox fraud.ops@auronova.example, which every Fraud Ops user sees).'),
      S('u-aisha', 'Fraud cases > My pool', 'Pick up FC-TC-C16 (origin "Manual - FP&I").', 'Assigned to Aisha as Maker.'),
    ],
    expected: 'FP&I-initiated cases follow the normal Maker-Checker path.',
  },

  // ======================= D · FP&I (Sheet 5) =======================
  {
    id: 'TC-D01', group: D, kind: 'Happy path', sheet: '5', brd: 'FR-CASE-036..062, 067..070',
    title: 'Investigator works the case and Reviewer approves and closes (no Approver needed)',
    records: ['FC-TC-D01'], startStatus: 'Approved for Investigation', customer: '8800401', startAs: 'u-rashid',
    setup: 'Mule Account case approved by Checker Layla; waiting in the FP&I Investigator pool.',
    flow: 'Approved for Investigation > Investigation in progress > Review in progress > Investigation Approved > Final report generated and closed',
    steps: [
      S('u-rashid', 'Case FC-TC-D01', '"Pick up from FP&I Investigator pool".', 'Investigation in progress; Checklist with 6 Mule Account items, owner Rashid, target date +14 days; "Date reported to FP&I" set.'),
      S('u-rashid', 'Case: Parties involved', 'Add Third party "Mule holder", IBAN AE440330000012345678901, tick Suspect and Blacklist, "Add".', 'Party listed with flags.'),
      S('u-rashid', 'Case: Checklist / Diary', 'Complete 3 items, add 2 findings with "Include in final report".', 'Checklist 3/6; Report section lists 2 findings.'),
      S('u-rashid', 'Case: Financial impact + Investigator recommendation', 'Attempted 31000, Successful 31000, Near miss 0, Potential 10000, Gross 31000, Recovery 0, Memo ref; Recommendation Process / Non-Generic / Delayed hold on beneficiary / Strengthen control + text. Save draft, "Submit to Reviewer".', 'Review in progress.'),
      S('u-khalid', 'Case FC-TC-D01', 'Pick up from FP&I Reviewer pool; "Approve and Close".', 'Warning "final report will be generated..."; status Final report generated and closed (via Investigation Approved in the audit trail); post tasks Op Risk Event + Non-Generic Issue.'),
    ],
    expected: 'Reviewer can close without the Approver.',
  },
  {
    id: 'TC-D02', group: D, kind: 'Control check', sheet: '5', brd: 'FR-CASE-043..045, 058..060',
    title: 'Financial impact validations and missing recommendation block Submit to Reviewer',
    records: ['FC-TC-D02'], startStatus: 'Investigation in progress', customer: '8800402', startAs: 'u-rashid',
    setup: 'Rashid entered inconsistent figures: Attempted 20,000, Successful 18,000, Near miss 5,000, Potential 19,000, Gross 18,000, Recovery 25,000; no investigator recommendation yet.',
    flow: 'Investigation in progress (blocked) > Review in progress',
    steps: [
      S('u-rashid', 'Case FC-TC-D02: Financial impact', 'Open the section.', 'Three red messages: Successful + Near miss > Attempted; Potential > Successful; Recovery > Gross. Workflow card warns "Investigator recommendation required".'),
      S('u-rashid', 'Case: Workflow', 'Click "Submit to Reviewer" with a comment.', 'Error "Financial impact invalid: ... (FR-CASE-045)". Status unchanged.'),
      S('u-rashid', 'Financial impact', 'Change Attempted 25000, Potential 15000, Recovery 3000; check Net loss = 15,000 (computed). Save draft.', '"All financial validations pass".'),
      S('u-rashid', 'Case: Workflow', 'Submit again.', 'Error "Add a recommendation before submitting to the Reviewer".'),
      S('u-rashid', 'Investigator recommendation', 'Fill Category, Type and text; save; Submit to Reviewer.', 'Review in progress.'),
    ],
    expected: 'FR-CASE-045 rules are enforced on the server, not just in the browser.',
  },
  {
    id: 'TC-D03', group: D, kind: 'Alternate path', sheet: '5', brd: 'FR-CASE-063',
    title: 'Investigator returns the case to the Fraud Ops Maker for missing information',
    records: ['FC-TC-D03'], startStatus: 'Approved for Investigation', customer: '8800403', startAs: 'u-priya',
    setup: 'Mule Account case made by Omar, checked by Hassan; in the Investigator pool.',
    flow: 'Approved for Investigation > Investigation in progress > Return for re-work (Maker) > Submitted to FO Checker > Approved for Investigation',
    steps: [
      S('u-priya', 'Case FC-TC-D03', 'Pick up, then "Return for rework (to Fraud Ops Maker)": "Statement for the linked account is missing".', 'Return for re-work; Desk Fraud Ops Maker; assigned to Omar.'),
      S('u-omar', 'Case FC-TC-D03', 'Add a transaction or document, "Submit to Fraud Ops Checker".', 'Submitted to FO Checker (Checker pool).'),
      S('u-layla', 'Case FC-TC-D03', 'Pick up and approve.', 'Back in the Investigator pool; Rework loops 1.'),
    ],
    expected: 'FP&I can bounce incomplete cases back to Fraud Ops.',
  },
  {
    id: 'TC-D04', group: D, kind: 'Alternate path', sheet: '5', brd: 'FR-CASE-064..066',
    title: 'Investigator approves an Advance Fee Scam directly (final report and close)',
    records: ['FC-TC-D04'], startStatus: 'Investigation in progress', customer: '8800404', startAs: 'u-rashid',
    setup: 'Romance-scam Advance Fee Scam case (AED 25,000, above X) picked by Rashid.',
    flow: 'Investigation in progress > Final report generated and closed',
    steps: [
      S('u-rashid', 'Case FC-TC-D04: Workflow', 'Click "Approve Advance Fee Scam (final report + close)" with a comment.', 'Closed and frozen; final report and email generated without Reviewer/Approver.'),
      S('u-rashid', 'Compare', 'Open FC-TC-E01 (Mule Account, still in investigation with Rashid; just look, do not act).', 'Workflow shows Submit to Reviewer and Return to Maker, but no "Approve Advance Fee Scam" button (AFS only).'),
    ],
    expected: 'AFS shortcut is available only for the AFS category.',
  },
  {
    id: 'TC-D05', group: D, kind: 'Alternate path', sheet: '5', brd: 'FR-CASE-067..070, 078',
    title: 'Reviewer returns to the Investigator, Investigator resubmits, Reviewer sends to Approver',
    records: ['FC-TC-D05'], startStatus: 'Review in progress', customer: '8800405', startAs: 'u-khalid',
    setup: 'Investment Scam case investigated by Priya, waiting in the Reviewer pool.',
    flow: 'Review in progress > Return for re-work (Investigator) > Review in progress > Pending Approval',
    steps: [
      S('u-khalid', 'Case FC-TC-D05', 'Pick up; "Return for rework (to Investigator)": "Add the recall request evidence".', 'Return for re-work; Desk FP&I Investigator; assigned to Priya.'),
      S('u-priya', 'Case FC-TC-D05', 'Upload a file in Evidence vault (folder Recall requests); "Submit to Reviewer".', 'Review in progress, assigned straight back to Khalid.'),
      S('u-khalid', 'Case FC-TC-D05', '"Send to Approver".', 'Pending Approval in the Approver pool.'),
    ],
    expected: 'Unlimited back-and-forth; the case returns to the same reviewer.',
  },
  {
    id: 'TC-D06', group: D, kind: 'Happy path', sheet: '5, 7', brd: 'FR-CASE-071..080, 0118..0123',
    title: 'Approver approves: final report emailed, case frozen, post-completion tasks allocated',
    records: ['FC-TC-D06'], startStatus: 'Pending Approval', customer: '8800406', startAs: 'u-mariam',
    setup: 'Mule Account, gross AED 64,000, recovery 4,000, STR required, Generic recommendation. Investigated by Rashid, reviewed by Khalid.',
    flow: 'Pending Approval > Investigation Approved > Final report generated and closed',
    steps: [
      S('u-mariam', 'Case FC-TC-D06', 'Pick up from FP&I Approver pool; "Approve (final report + close)".', 'Closed; Frozen badge; Workflow card "final report emailed ..." and Net loss AED 60,000.'),
      S('u-mariam', 'Case: Evidence vault', 'Open the vault.', 'Final Report folder has the .docx; Emails folder has the saved email.'),
      S('u-mariam', 'Case: Post-closure activity', 'Open the section.', 'Tasks Op Risk Event, Central Bank STR, Generic Issue with owner teams and target dates.'),
    ],
    expected: 'Closure triggers the reporting chain automatically.',
  },
  {
    id: 'TC-D07', group: D, kind: 'Alternate path', sheet: '5', brd: 'FR-CASE-072..074',
    title: 'Approver returns for rework: goes back to the Investigator',
    records: ['FC-TC-D07'], startStatus: 'Pending Approval', customer: '8800407', startAs: 'u-mariam',
    setup: 'Investment Scam case pending approval (investigator Rashid).',
    flow: 'Pending Approval > Return for re-work (Investigator)',
    steps: [S('u-mariam', 'Case FC-TC-D07', 'Pick up; "Return for rework" with a comment.', 'Desk FP&I Investigator, assigned to Rashid.')],
    expected: 'Standard Approver return lands with the Investigator.',
  },
  {
    id: 'TC-D08', group: D, kind: 'Edge case', sheet: '5', brd: 'FR-CASE-074, 075',
    title: 'Approver returns an Advance Fee Scam: it goes to the Fraud Ops Maker',
    records: ['FC-TC-D08'], startStatus: 'Pending Approval', customer: '8800408', startAs: 'u-mariam',
    setup: 'Advance Fee Scam (AED 40,000) pending approval; maker Aisha.',
    flow: 'Pending Approval > Return for re-work (Fraud Ops Maker)',
    steps: [S('u-mariam', 'Case FC-TC-D08', 'Pick up; click "Return for rework".', 'Modal warns "Advance Fee Scam: a return goes back to the Fraud Ops Maker (FR-CASE-075)"; after confirm Desk = Fraud Ops Maker, assigned to Aisha.')],
    expected: 'AFS exception to the return path is applied.',
  },
  {
    id: 'TC-D09', group: D, kind: 'Control check', sheet: '5', brd: 'FR-CASE-085',
    title: 'Separation of duties: the Reviewer of a case cannot also approve it',
    records: ['FC-TC-D09'], startStatus: 'Pending Approval', customer: '8800409', startAs: 'u-mariam',
    setup: 'Mariam (Reviewer + Approver roles) reviewed this Internal Fraud case and sent it to the Approver pool.',
    flow: 'Pending Approval (blocked for Mariam)',
    steps: [
      S('u-mariam', 'Case FC-TC-D09', 'Open the case.', 'No pick-up button; red box "Separation of duties: the Reviewer cannot also be the Approver of the same case."'),
      S('u-rashid', 'Case FC-TC-D09', 'Open as the investigator.', 'No reviewer/approver actions for Rashid either.'),
    ],
    expected: 'No single person can review and approve the same case (this record stays blocked by design).',
  },

  // ======================= E · Joint & Whistleblower (Sheet 6) =======================
  {
    id: 'TC-E01', group: E, kind: 'Happy path', sheet: '6', brd: 'FR-CASE-088..091',
    title: 'Joint investigation: lead can submit only after every co-investigator finishes',
    records: ['FC-TC-E01'], startStatus: 'Investigation in progress', customer: '8800501', startAs: 'u-rashid',
    setup: 'Mule Account case led by Rashid; financial impact and recommendation already complete.',
    flow: 'Investigation in progress (joint) > Review in progress',
    steps: [
      S('u-rashid', 'Case FC-TC-E01: Joint investigation', 'Select Priya Menon in "Add co-investigator…", "Add".', 'Priya listed as Co / Working; email "You were added to joint investigation" to Priya.'),
      S('u-rashid', 'Case: Workflow', '"Submit to Reviewer".', 'Error "Joint investigation: co-investigators still working (Priya Menon)".'),
      S('u-priya', 'Case FC-TC-E01', 'Add a diary entry (co-investigators can edit), then in Joint investigation click "Mark my part finished".', 'Priya shows Finished.'),
      S('u-rashid', 'Case: Workflow', '"Submit to Reviewer".', 'Review in progress.'),
    ],
    expected: 'Joint workers update the same case; the lead hand-off waits for all.',
  },
  {
    id: 'TC-E02', group: E, kind: 'Alternate path', sheet: '6', brd: 'FR-CASE-092',
    title: 'Joint review: co-reviewer must finish before the lead reviewer can close',
    records: ['FC-TC-E02'], startStatus: 'Review in progress', customer: '8800502', startAs: 'u-khalid',
    setup: 'Investment Scam case in the Reviewer pool (investigated by Priya).',
    flow: 'Review in progress (joint) > Final report generated and closed',
    steps: [
      S('u-khalid', 'Case FC-TC-E02', 'Pick up; Joint investigation: add Mariam Qasim as co-reviewer; try "Approve and Close".', 'Error "Joint review: co-reviewers still working (Mariam Qasim)".'),
      S('u-mariam', 'Case FC-TC-E02: Joint investigation', '"Mark my part finished".', 'Finished.'),
      S('u-khalid', 'Case FC-TC-E02', '"Approve and Close".', 'Closed with final report.'),
    ],
    expected: 'Joint reviewers work the same way as joint investigators.',
  },
  {
    id: 'TC-E03', group: E, kind: 'End-to-end', sheet: '6', brd: 'FR-CASE-093..098',
    title: 'Whistleblower case: FP&I creates and routes to HR, HR investigates and closes',
    records: ['WB-TC-E03'], startStatus: 'Draft', startAs: 'u-priya',
    setup: 'Hotline report: a teller photographs customer ID documents. Draft created by Priya.',
    flow: 'Draft > Under Investigation > Closed',
    steps: [
      S('u-aisha', 'Whistleblower', 'Open the Whistleblower page / search WB-TC-E03.', 'Fraud Ops cannot see whistleblower cases (Chinese wall).'),
      S('u-priya', 'Case WB-TC-E03', 'Upload a document in Evidence vault, then "Route to HR / Governance" with a comment.', 'Under Investigation; HR / Governance pool; email to hr.governance@.'),
      S('u-daniel', 'Whistleblower > My pool', 'Pick up; Parties: add Staff S11877 (details auto-filled from HRMS), Suspect; Staff status Suspended requires a Status date; add diary entry; fill "HR / Governance outcome".', 'Staff party with position/department from HRMS.'),
      S('u-daniel', 'Case WB-TC-E03', '"Close whistleblower case".', 'Closed; final report in Evidence vault; closure date recorded.'),
    ],
    expected: 'Whistleblower cases skip Fraud Ops entirely.',
  },
  {
    id: 'TC-E04', group: E, kind: 'Alternate path', sheet: '6', brd: 'FR-CASE-094..096',
    title: 'Whistleblower case closed by Governance',
    records: ['WB-TC-E04'], startStatus: 'Under Investigation', startAs: 'u-sana',
    setup: 'Expense-manipulation allegation routed by Rashid; waiting in the HR / Governance pool.',
    flow: 'Under Investigation > Closed',
    steps: [S('u-sana', 'Whistleblower > My pool', 'Pick up WB-TC-E04, add a diary entry, "Close whistleblower case".', 'Closed.')],
    expected: 'Governance has the same powers as HR on whistleblower cases.',
  },

  // ======================= F · Post-closure (Sheet 7) =======================
  {
    id: 'TC-F01', group: F, kind: 'Happy path', sheet: '7', brd: 'FR-CASE-0118..0128',
    title: 'Post-completion tasks: push to OpenPages, STR reference, delegate, complete',
    records: ['FC-TC-F01'], startStatus: 'Final report generated and closed', customer: '8800601', startAs: 'u-super',
    setup: 'Closed case with tasks FC-TC-F01-PT1 Op Risk Event, PT2 Central Bank STR, PT3 Generic Issue.',
    flow: 'Tasks: Open > Submitted > Completed',
    steps: [
      S('u-super', 'Post-closure', 'Click the Op Risk Event card FC-TC-F01-PT1, then "Push to OpenPages (simulated)".', 'Status Submitted with reference OP-LE-xxxxxx and date.'),
      S('u-super', 'Post-closure', 'Re-open PT1 and click "Complete task".', 'Moves to the Completed tab.'),
      S('u-super', 'Post-closure', 'Open PT2 (Central Bank STR): notice the STR warning; "Delegate to" Hassan Tariq.', 'Email "Task ... delegated to you".'),
      S('u-super', 'Post-closure', 'Open PT3 (Generic Issue): try "Complete task" with an empty Reference ID.', 'Button disabled until Reference ID and date are entered; then completes.'),
    ],
    expected: 'Every task needs an external reference before it can be completed.',
  },
  {
    id: 'TC-F02', group: F, kind: 'Control check', sheet: '7', brd: 'FR-CASE-0150..0155',
    title: 'Later recovery with maker-checker; recovery can never exceed the gross loss',
    records: ['FC-TC-F02'], startStatus: 'Final report generated and closed', customer: '8800602', startAs: 'u-rashid',
    setup: 'Closed Mule Account case, gross loss AED 30,000, recovery 0.',
    flow: 'Recovery: Pending > Approved (case updated) | Pending > Rejected',
    steps: [
      S('u-rashid', 'Case FC-TC-F02: Post-closure activity', 'Amount 7500, Mode Beneficiary bank recall, tick Blacklist, "Submit for approval".', 'Pending entry; for Rashid "Waiting for a different checker".'),
      S('u-khalid', 'Case FC-TC-F02: Post-closure activity', 'Click "Approve".', 'Recovery Approved; Net loss AED 22,500; Show Diff shows financialImpact.recovery 0 > 7500; third-party party blacklisted.'),
      S('u-rashid', 'Post-closure activity', 'Submit a second recovery of 40000.', 'Pending.'),
      S('u-khalid', 'Post-closure activity', 'Click "Approve".', 'Error "Recovery would exceed gross loss (AED 30000)"; click "Reject" instead.'),
    ],
    expected: 'Recovery updates the main case only after a different person checks it.',
  },
  {
    id: 'TC-F03', group: F, kind: 'Alternate path', sheet: '7', brd: 'FR-CASE-081, 082',
    title: 'Super user re-opens a closed case into the Investigator pool',
    records: ['FC-TC-F03'], startStatus: 'Final report generated and closed', customer: '8800603', startAs: 'u-super',
    setup: 'Closed Mule Account case; new evidence has arrived.',
    flow: 'Final report generated and closed > Case re-opened > Investigation in progress',
    steps: [
      S('u-rashid', 'Case FC-TC-F03', 'Open the case.', 'Frozen, no edit; no Re-open button for non-super users.'),
      S('u-super', 'Case FC-TC-F03', '"Re-open case" with comment.', 'Case re-opened; frozen removed; Desk FP&I Investigator pool.'),
      S('u-rashid', 'Case FC-TC-F03', 'Pick up from FP&I Investigator pool.', 'Investigation in progress; same workflow as before.'),
    ],
    expected: 'Closed cases are immutable unless a super user re-opens them.',
  },
  {
    id: 'TC-F04', group: F, kind: 'Control check', sheet: '7', brd: 'FR-CASE-0134',
    title: 'Super user disables a case (no further updates by anyone), then enables it',
    records: ['FC-TC-F04'], startStatus: 'Submitted to FO Checker', customer: '8800604', startAs: 'u-super',
    setup: 'Case waiting for the Checker.',
    flow: 'Submitted to FO Checker (disabled) > enabled',
    steps: [
      S('u-super', 'Case FC-TC-F04', 'Click "Disable case", reason "Legal hold".', 'Red badge Disabled.'),
      S('u-layla', 'Case FC-TC-F04', 'Open the case.', 'No pick-up / actions available.'),
      S('u-super', 'Case FC-TC-F04', '"Enable case" with a reason.', 'Layla can pick it up again. Audit trail records both.'),
    ],
    expected: 'Disable freezes all activity, audited.',
  },
  {
    id: 'TC-F05', group: F, kind: 'Control check', sheet: '7', brd: 'FR-CASE-0131, 0132',
    title: 'Alerts closed more than 90 days ago are archived to history',
    records: ['ALT-TC-F05'], startStatus: 'Closed', customer: '8800114', startAs: 'u-omar',
    setup: 'False-positive alert closed 100 days ago (archive window 90 days, configurable).',
    flow: 'Closed > Archived',
    steps: [S('u-omar', 'Alert queue > History', 'Search ALT-TC-F05.', 'Row shows an "Archived" badge next to Closed.')],
    expected: 'Archival window is applied from configuration.',
  },

  // ======================= X · Cross-cutting =======================
  {
    id: 'TC-X01', group: X, kind: 'Control check', sheet: '1', brd: 'Chinese wall (BRD 5.10), FR-ALT-045',
    title: 'Chinese wall by entity: a user without Digital access cannot see a Digital case',
    records: ['FC-TC-X01'], startStatus: 'Approved for Investigation', customer: '8800701', startAs: 'u-priya',
    setup: 'Digital-entity Mule Account case in the Investigator pool.',
    flow: 'Approved for Investigation (visible to Rashid only)',
    steps: [
      S('u-priya', 'Global search', 'Search FC-TC-X01, then open /cases/FC-TC-X01 directly.', 'No results; direct link shows "Chinese wall: you cannot view this case."'),
      S('u-rashid', 'Fraud cases > My pool', 'Find FC-TC-X01.', 'Visible and can be picked up.'),
    ],
    expected: 'Entity-level access is enforced by the API.',
  },
  {
    id: 'TC-X02', group: X, kind: 'Control check', sheet: '1', brd: 'FR-LP-003..017',
    title: 'Global and fuzzy search, KPI filters and Excel export',
    records: [], customer: '8800101', startAs: 'u-omar',
    setup: 'Uses customer Hamdan Al Ketbi (TC-A01).',
    flow: 'n/a',
    steps: [
      S('u-omar', 'Top search bar', 'Search national ID 784-1984-8800101-3.', 'Results show ALT-TC-A01 (and its case if TC-A01 was run).'),
      S('u-omar', 'Alert queue', 'Fuzzy search "Hamdan Al Ketbe" (typo).', 'ALT-TC-A01 still found.'),
      S('u-omar', 'Alert queue', 'Click a KPI tile (e.g. Priority High), then the table export button.', 'Table filtered; Excel file downloads.'),
    ],
    expected: 'Search works on IDs, names (fuzzy) and identity documents.',
  },
  {
    id: 'TC-X03', group: X, kind: 'Control check', sheet: '1, 8', brd: 'FR-CASE-0138..0158',
    title: 'Process map, dashboards, calendar, email outbox and agent placeholders',
    records: [], startAs: 'u-hassan',
    setup: 'Run after a few scenarios so the counts move.',
    flow: 'n/a',
    steps: [
      S('u-hassan', 'Process map', 'Click a station with a count.', 'Opens the matching queue.'),
      S('u-hassan', 'Reports & dashboards', 'Toggle chart/table, filter by Entity Islamic, export Rule precision.', 'Figures change with the filter; Excel export works.'),
      S('u-rashid', 'Calendar', 'Open the current month.', 'Checklist target dates and post-completion tasks shown.'),
      S('u-super', 'Agent hub', 'Open the hub and an AI-assist slot on any case.', '12 agents listed as Planned; "Run ... agent" buttons are disabled ("Agent layer comes in the next phase").'),
    ],
    expected: 'MI reflects the work done in the scenarios.',
  },
]

export const scenarioRecordIds = () => SCENARIOS.flatMap((s) => s.records)
