// Seeds bank-style synthetic data and replays real workflows (through the same services the API uses),
// so every case has a genuine audit trail. Run: npm run seed
import type { User } from '../../shared/src/index.js'
import { all, db, get, insert, nowIso, run, setClock, setConfig, update } from './db.js'
import { DEFAULT_ROUTING_RULES } from './workflow/routing.js'
import { AGENTS } from '../../shared/src/index.js'
import * as A from './services/alerts.js'
import * as C from './services/cases.js'
import { getUser } from './services/common.js'

// ---------- deterministic randomness ----------
let seed = 20261103
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]
const int = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1))
const DAY = 86400_000, HOUR = 3600_000
const ago = (ms: number) => new Date(Date.now() - ms)
const at = (ms: number) => setClock(ago(ms))

export function resetDb() {
  for (const t of ['users', 'customers', 'transactions', 'alerts', 'alert_actions', 'alert_events', 'cases', 'case_transactions', 'case_parties', 'checklist_items', 'activity_log', 'evidence', 'audit_trail', 'case_investigators', 'post_tasks', 'recoveries', 'outbox', 'config', 'agent_registry', 'agent_runs'])
    db.exec(`DELETE FROM ${t}`)
}

export function seedConfig() {
  setConfig('routingRules', DEFAULT_ROUTING_RULES)
  setConfig('afsThresholdAed', 10000) // "X" (FR-CASE-035), editable by FP&I
  setConfig('slaMinutes', { Prevention: 30, High: 48 * 60, Medium: 96 * 60, Low: 168 * 60 })
  setConfig('caseSlaDays', { L1: 30, L2: 60 })
  setConfig('maxReschedules', 3)
  setConfig('rescheduleHours', 24)
  setConfig('historyAlerts', 5)
  setConfig('txnMonths', 3)
  setConfig('eddAlertDays', 8)
  setConfig('archiveDays', 90)
  setConfig('reminderDays', 10)
  setConfig('autoAllocate', { prevention: true, detection: false })
  setConfig('holidays', ['2026-12-02', '2026-12-03', '2026-12-25', '2027-01-01'])
  setConfig('scenarios', {
    'SC-101': { dept: 'FRAUD_OPS', complexity: 'High' }, 'SC-102': { dept: 'FRAUD_OPS', complexity: 'High' }, 'SC-205': { dept: 'FRAUD_OPS', complexity: 'Medium' },
    'SC-310': { dept: 'FRAUD_OPS', complexity: 'High' }, 'SC-412': { dept: 'FRAUD_OPS', complexity: 'Medium' }, 'SC-450': { dept: 'FRAUD_OPS', complexity: 'Medium' },
    'SC-520': { dept: 'HR', complexity: 'High' }, 'SC-530': { dept: 'GOVERNANCE', complexity: 'High' },
    'SC-600': { dept: 'FRAUD_OPS', complexity: 'High' }, 'SC-610': { dept: 'FRAUD_OPS', complexity: 'High' }, 'SC-620': { dept: 'FRAUD_OPS', complexity: 'Medium' },
  })
  setConfig('precautionMapping', {
    'Account takeover': ['Victim Online Banking Blocked', 'Victim Customer Contacted', 'Lien Amount', 'Remitting Bank Contacted'],
    'Mule account': ['Lien Amount', 'Lien Accounts', 'Freeze Placed in Beneficiary Account', 'Linked Accounts Identified', 'STR Raised'],
    Phishing: ['Victim Card Blocked', 'Victim Customer Contacted', 'Case Reported to Police by Email', 'TDRA Reported'],
    Pharming: ['Victim Online Banking Blocked', 'Victim Customer Contacted'],
    'Malware / remote access': ['Victim Online Banking Blocked', 'Victim Card Blocked', 'Victim Customer Contacted'],
    'Advance fee scam': ['Victim Customer Contacted', 'SWIFT Cancellation Initiated', 'Case Reported to Police by Call'],
    'Velocity breach': ['Victim Customer Contacted'],
    'Staff anomaly': ['Others'],
    '*': ['Victim Customer Contacted'],
  })
  setConfig('checklistByCategory', {
    'Internal Fraud': [0, 2, 3, 7, 8, 9, 13], 'Mule Account': [0, 1, 3, 5, 10, 11], 'Investment Scam': [0, 1, 5, 10, 11, 12],
    'Advance Fee Scam': [0, 1, 5, 10], '*': [0, 1, 3, 5, 10],
  })
  setConfig('reportableByCategory', {
    'Internal Fraud': { mis: true, oprisk: true }, 'Mule Account': { mis: true, oprisk: false }, 'Investment Scam': { mis: true, oprisk: true },
    'Account Takeover': { mis: true, oprisk: true },
  })
  setConfig('hrms', [
    { staffId: 'S10231', name: 'Faisal Al Marri', email: 'faisal.almarri@auronova.example', position: 'Relationship Officer', department: 'Retail Branch - Deira', reportingManager: 'Noura Khalifa', joiningDate: '2019-04-14', staffAccount: 'AE070260001015331040101', status: 'Active', nationality: 'UAE', passport: 'P8812341', dob: '1990-02-11' },
    { staffId: 'S11877', name: 'Ravi Shankar', email: 'ravi.shankar@auronova.example', position: 'Teller', department: 'Retail Branch - Al Barsha', reportingManager: 'Joseph Mathew', joiningDate: '2021-09-01', staffAccount: 'AE070260001015331040188', status: 'Active', nationality: 'India', passport: 'Z4410992', dob: '1994-07-23' },
    { staffId: 'S09012', name: 'Hind Al Suwaidi', email: 'hind.alsuwaidi@auronova.example', position: 'Operations Officer', department: 'Central Operations', reportingManager: 'Majid Rahim', joiningDate: '2016-01-10', staffAccount: 'AE070260001015331040003', status: 'Active', nationality: 'UAE', passport: 'P1100452', dob: '1987-12-02' },
  ])
  for (const a of AGENTS) insert('agent_registry', { id: a.id, def: JSON.stringify(a), status: 'planned' })
}

const USERS: User[] = [
  { id: 'u-aisha', name: 'Aisha Rahman', email: 'aisha.rahman@auronova.example', roles: ['FO_ANALYST', 'FO_MAKER'], entities: ['Retail', 'Islamic', 'Digital'], dept: 'FRAUD_OPS' },
  { id: 'u-omar', name: 'Omar Haddad', email: 'omar.haddad@auronova.example', roles: ['FO_ANALYST', 'FO_MAKER', 'FO_CHECKER'], entities: ['Retail', 'Islamic', 'Digital'], dept: 'FRAUD_OPS' },
  { id: 'u-layla', name: 'Layla Nasser', email: 'layla.nasser@auronova.example', roles: ['FO_ANALYST', 'FO_CHECKER'], entities: ['Retail', 'Islamic', 'Digital'], dept: 'FRAUD_OPS' },
  { id: 'u-rashid', name: 'Rashid Al Mansoori', email: 'rashid.almansoori@auronova.example', roles: ['FPI_INVESTIGATOR'], entities: ['Retail', 'Islamic', 'Digital'], dept: 'FPI' },
  { id: 'u-priya', name: 'Priya Menon', email: 'priya.menon@auronova.example', roles: ['FPI_INVESTIGATOR'], entities: ['Retail', 'Islamic'], dept: 'FPI' },
  { id: 'u-khalid', name: 'Khalid Suleiman', email: 'khalid.suleiman@auronova.example', roles: ['FPI_REVIEWER'], entities: ['Retail', 'Islamic', 'Digital'], dept: 'FPI' },
  { id: 'u-mariam', name: 'Mariam Qasim', email: 'mariam.qasim@auronova.example', roles: ['FPI_APPROVER', 'FPI_REVIEWER'], entities: ['Retail', 'Islamic', 'Digital'], dept: 'FPI' },
  { id: 'u-sana', name: 'Sana Iqbal', email: 'sana.iqbal@auronova.example', roles: ['GOVERNANCE'], entities: ['Retail', 'Islamic'], dept: 'GOVERNANCE' },
  { id: 'u-daniel', name: 'Daniel Fernandes', email: 'daniel.fernandes@auronova.example', roles: ['HR'], entities: ['Retail', 'Islamic'], dept: 'HR' },
  { id: 'u-hassan', name: 'Hassan Tariq', email: 'hassan.tariq@auronova.example', roles: ['MANAGER', 'FO_CHECKER'], entities: ['Retail', 'Islamic', 'Digital'], dept: 'FRAUD_OPS' },
  { id: 'u-super', name: 'System Administrator', email: 'fcms.admin@auronova.example', roles: ['SUPER_USER'], entities: ['Retail', 'Islamic', 'Digital'], dept: 'ADMIN' },
]
export function seedUsers() {
  for (const u of USERS) insert('users', { ...u, roles: JSON.stringify(u.roles), entities: JSON.stringify(u.entities) })
}

const FIRST = ['Ahmed', 'Fatima', 'Mohammed', 'Sara', 'Yousef', 'Noor', 'Ali', 'Huda', 'John', 'Anita', 'Rahul', 'Elena', 'Tariq', 'Mona', 'Kareem', 'Leena', 'George', 'Zainab', 'Imran', 'Grace']
const LAST = ['Al Falasi', 'Al Nuaimi', 'Khan', 'Thomas', 'Sharma', 'Haddad', 'Mahmoud', 'Pereira', 'Al Ketbi', 'Ibrahim', 'Joseph', 'Nair', 'Saleh', 'Rossi', 'Al Hashimi']
const SEGMENTS = ['Retail - Mass', 'Retail - Priority', 'Private Banking', 'SME', 'Corporate']
const COUNTERPARTIES = ['Carrefour', 'DEWA', 'Etisalat', 'Noon.com', 'Amazon AE', 'Air Arabia', 'Salary - ACME LLC', 'Rent - Al Futtaim', 'Crypto Exchange XT', 'Global Invest FX', 'Western Union', 'Unknown beneficiary', 'Lulu Hypermarket', 'ADNOC']
const iban = () => `AE${int(10, 99)}0260001${String(int(1e9, 9e9))}${int(100, 999)}`

export function seedCustomers() {
  const custs: string[] = []
  for (let i = 0; i < 32; i++) {
    const cif = String(1000000 + i * 7919).slice(0, 7)
    const entity = i % 7 === 0 ? 'Islamic' : i % 11 === 0 ? 'Digital' : 'Retail'
    const accounts = Array.from({ length: int(1, 3) }, iban)
    insert('customers', {
      cif, name: `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`, entity, segment: SEGMENTS[i % SEGMENTS.length], rm: `RM ${pick(['Noura K.', 'Joseph M.', 'Majid R.', 'Fiona D.'])}`,
      eid: `784-19${int(60, 99)}-${int(1000000, 9999999)}-${int(1, 9)}`, passport: `P${int(1000000, 9999999)}`, tl: i % 5 === 3 ? `TL-${int(100000, 999999)}` : null,
      nationality: pick(['UAE', 'India', 'Pakistan', 'Egypt', 'UK', 'Philippines', 'Jordan']), dob: `19${int(60, 99)}-0${int(1, 9)}-1${int(0, 9)}`,
      accounts: JSON.stringify(accounts), cards: JSON.stringify([`4${int(100, 999)} **** **** ${int(1000, 9999)}`]), linked_cifs: JSON.stringify([]),
    })
    custs.push(cif)
    let bal = int(5000, 250000)
    for (let t = 0; t < 45; t++) {
      const acc = pick(accounts)
      const out = rnd() < 0.7
      const amt = Math.round((out ? -1 : 1) * (rnd() < 0.1 ? int(5000, 60000) : int(50, 4000)) * 100) / 100
      bal = Math.max(0, bal + amt)
      const cp = pick(COUNTERPARTIES)
      insert('transactions', {
        id: `TXN${cif}${String(t).padStart(3, '0')}`, cif, account: acc, date: ago(int(0, 100) * DAY + int(0, 23) * HOUR).toISOString(),
        type: out ? pick(['UAEFTS transfer', 'IPI instant payment', 'Card purchase', 'SWIFT transfer', 'ATM withdrawal']) : 'Internal transfer',
        amount: amt, currency: rnd() < 0.85 ? 'AED' : pick(['USD', 'EUR', 'GBP']), balance: bal, counterparty: cp,
        iban: cp.includes('Unknown') || cp.includes('Crypto') || cp.includes('FX') ? (rnd() < 0.5 ? `GB${int(10, 99)}BARC${int(1e9, 9e9)}` : iban()) : iban(), channel: pick(['Mobile app', 'Online banking', 'POS', 'ATM', 'Branch']),
      })
    }
  }
  // linked CIFs (multiple CIFs for the same person, FR-ALT-017)
  update('customers', 'cif', custs[1], { linked_cifs: JSON.stringify([custs[9]]) })
  update('customers', 'cif', custs[4], { linked_cifs: JSON.stringify([custs[12], custs[20]]) })
  // a new-to-bank customer not yet in Siebel CRM (EDD SR will fail, FR-ALT-025)
  insert('customers', { cif: 'NEW0001', name: 'Victor Almeida', entity: 'Retail', segment: 'Retail - Mass', rm: null, eid: '784-1999-1234567-1', passport: 'P0099881', tl: null, nationality: 'Portugal', dob: '1999-05-05', accounts: JSON.stringify([iban()]), cards: '[]', linked_cifs: '[]' })
  return custs
}

const RULES = [
  { scenarioId: 'SC-101', ruleId: 'DSP-R101', ruleName: 'New beneficiary + immediate high-value transfer', type: 'Account takeover', cond: 'beneficiary_age < 2h AND amount > 3x avg_30d' },
  { scenarioId: 'SC-102', ruleId: 'DSP-R102', ruleName: 'New device login followed by IPI', type: 'Malware / remote access', cond: 'device_first_seen < 30m AND ipi_amount > 5000' },
  { scenarioId: 'SC-205', ruleId: 'DSP-R205', ruleName: 'Velocity: > 8 transfers in 1h', type: 'Velocity breach', cond: 'count(transfers,1h) > 8' },
  { scenarioId: 'SC-310', ruleId: 'DSP-R310', ruleName: 'Inbound funds moved out within 15 minutes', type: 'Mule account', cond: 'inbound > 10000 AND outbound_within_15m > 90%' },
  { scenarioId: 'SC-412', ruleId: 'DSP-R412', ruleName: 'Card-not-present spike after OTP reset', type: 'Phishing', cond: 'otp_reset AND cnp_count_24h > 5' },
  { scenarioId: 'SC-450', ruleId: 'DSP-R450', ruleName: 'Repeated transfers to overseas investment platform', type: 'Advance fee scam', cond: 'beneficiary_category = investment AND country risk high' },
  { scenarioId: 'SC-520', ruleId: 'DSP-R520', ruleName: 'Staff account receiving customer funds', type: 'Staff anomaly', cond: 'beneficiary IN staff_accounts' },
  { scenarioId: 'SC-530', ruleId: 'DSP-R530', ruleName: 'Staff accessed dormant accounts out of hours', type: 'Staff anomaly', cond: 'dormant_access AND hour NOT IN 7..19' },
]
const PREV_RULES = [
  { scenarioId: 'SC-600', ruleId: 'DSP-P600', ruleName: 'Beneficiary on internal watchlist', type: 'Mule account' },
  { scenarioId: 'SC-610', ruleId: 'DSP-P610', ruleName: 'SWIFT to high-risk jurisdiction', type: 'Advance fee scam' },
  { scenarioId: 'SC-620', ruleId: 'DSP-P620', ruleName: 'First-time large IPI from new device', type: 'Account takeover' },
]

function makePayload(cif: string, opts: Partial<A.DspPayload> & { rule?: (typeof RULES)[number] } = {}): A.DspPayload {
  const c = get('SELECT * FROM customers WHERE cif = ?', cif)!
  const r = opts.rule ?? pick(RULES)
  const txn = get('SELECT * FROM transactions WHERE cif = ? AND amount < 0 ORDER BY amount ASC LIMIT 1 OFFSET ?', cif, int(0, 3))
  return {
    alertDateTime: opts.alertDateTime ?? nowIso(), riskScore: opts.riskScore ?? int(35, 98), category: 'Detection', mode: rnd() < 0.5 ? 'Real Time' : 'T+1',
    scenarioId: r.scenarioId, scenarioDesc: r.ruleName, ruleId: r.ruleId, ruleName: r.ruleName, ruleCondition: r.cond, decisionLayer: 'DL-2 Fraud Score',
    alertType: r.type, typology: r.type, cif, accountNumber: JSON.parse(c.accounts)[0], txnAmount: txn ? Math.abs(txn.amount) : int(1000, 30000), txnRef: txn?.id,
    alertOn: 'CUSTOMER ACCOUNT NUMBER', alertedEntityType: r.type === 'Mule account' ? 'MULE' : r.type === 'Staff anomaly' ? 'STAFF' : 'VICTIM',
    deviceId: `DEV-${int(10000, 99999)}`, beneficiaryAccount: txn?.iban, srType: rnd() < 0.8 ? 'Financial' : 'Non-financial', ...opts,
  }
}

const U = (id: string) => getUser(id)!

async function main() {
  console.log('Resetting database...')
  resetDb()
  seedConfig()
  seedUsers()
  const custs = seedCustomers()

  // ---- 1. Open detection alerts in the queues (FAMS landing) ----
  for (let i = 0; i < 26; i++) {
    const created = ago(int(1, 9 * 24) * HOUR)
    A.ingestAlert(makePayload(custs[i % custs.length], { alertDateTime: created.toISOString(), rule: RULES[i % 6] }))
  }
  // Same customer, several rules (grouping, FR-ALT-007)
  for (const r of [RULES[0], RULES[3], RULES[2]]) A.ingestAlert(makePayload(custs[4], { alertDateTime: ago(int(2, 20) * HOUR).toISOString(), rule: r }))
  // HR / Governance queues
  A.ingestAlert(makePayload(custs[6], { rule: RULES[6], alertDateTime: ago(30 * HOUR).toISOString(), riskScore: 88 }))
  A.ingestAlert(makePayload(custs[7], { rule: RULES[7], alertDateTime: ago(50 * HOUR).toISOString(), riskScore: 91 }))
  A.ingestAlert(makePayload(custs[14], { rule: RULES[7], alertDateTime: ago(5 * HOUR).toISOString(), riskScore: 76 }))
  // Data-quality exception + new-to-bank customer (CRM failure)
  A.ingestAlert(makePayload('NEW0001', { rule: RULES[1], alertDateTime: ago(3 * HOUR).toISOString(), riskScore: 84 }))

  // ---- 2. Prevention alerts (held transactions, auto-allocated) ----
  const colours: ('Grey' | 'Red' | 'Green')[] = ['Grey', 'Grey', 'Grey', 'Red', 'Green', 'Grey', 'Red', 'Grey']
  colours.forEach((col, i) => {
    const r = PREV_RULES[i % 3]
    A.ingestAlert(makePayload(custs[(i * 5 + 2) % custs.length], { category: 'Prevention', mode: 'Real Time', preventionColour: col, rule: { ...r, cond: 'pre-authorisation decision layer' } as any, riskScore: int(70, 99), alertDateTime: ago((i < 2 ? 45 : int(2, 25)) * 60_000).toISOString() }))
  })

  // One prevention alert already decided (Green: expected behaviour, released)
  {
    const g = get("SELECT * FROM alerts WHERE category = 'Prevention' AND prevention_colour = 'Green' LIMIT 1")
    if (g?.assigned_to) A.alertAct(getUser(g.assigned_to)!, g.id, { kind: 'prevention_decide', decision: 'Approve', reason: 'Expected or Authorized Behavior', description: 'Customer confirmed the payment to a known supplier by call-back.' })
  }

  // ---- 3. Alerts mid-flight: EDD, re-scheduled, referred ----
  const aisha = U('u-aisha'), omar = U('u-omar'), layla = U('u-layla')
  const open = () => all("SELECT * FROM alerts WHERE status = 'Yet to start' AND dept = 'FRAUD_OPS' AND category = 'Detection' AND cif <> 'NEW0001' ORDER BY created_at")
  const work = (u: User, id: string, body: any) => A.alertAct(u, id, body)
  {
    const [, a2, a3, a4] = open()
    const a1 = A.ingestAlert(makePayload(custs[0], { alertDateTime: ago(11 * DAY).toISOString(), rule: RULES[0], riskScore: 72 }))
    at(10 * DAY); A.assignAlerts(aisha, [a1]); work(aisha, a1, { kind: 'edd' }) // EDD open > 8 days -> notification (FR-ALT-068)
    setClock(null)
    A.assignAlerts(omar, [a2.id]); work(omar, a2.id, { kind: 'edd' }); work(omar, a2.id, { kind: 'edd_response', response: 'Business confirms customer did not authorise the transfer.' })
    A.assignAlerts(aisha, [a3.id]); work(aisha, a3.id, { kind: 'reschedule' })
    A.assignAlerts(layla, [a4.id]); work(layla, a4.id, { kind: 'refer_fpi', note: 'Beneficiary IBAN appears on two other cases. Please advise whether to treat as mule network.' })
  }
  // A few WIP alerts assigned to Aisha (her personal queue)
  for (const a of open().slice(0, 3)) A.assignAlerts(aisha, [a.id])

  // ---- 4. Closed alerts: false positives (rule precision) ----
  for (let i = 0; i < 14; i++) {
    const c = custs[(i * 3 + 1) % custs.length]
    at(int(12, 30) * DAY)
    const id = A.ingestAlert(makePayload(c, { alertDateTime: nowIso(), rule: RULES[i % 5] }))
    at(int(10, 11) * DAY); A.assignAlerts(omar, [id])
    work(omar, id, { kind: 'decide', decision: 'False Positive', subClass: pick(['Valid alert-non fraud', 'Customer declined', 'Rule discrepancy', 'Inconclusive']), rationale: 'Customer confirmed the transaction on recorded line; beneficiary is a known family member.' })
  }
  setClock(null)

  // ---- 5. Cases replayed through the real workflow ----
  const rashid = U('u-rashid'), priya = U('u-priya'), khalid = U('u-khalid'), mariam = U('u-mariam'), sup = U('u-super'), daniel = U('u-daniel'), hassan = U('u-hassan')

  /** Confirmed-fraud alert -> case, filled in by the maker. */
  const caseFromAlert = (cust: string, rule: (typeof RULES)[number], daysAgo: number, maker: User, fill: { l1: string; l2: string; title: string; lost: number; desc: string }) => {
    at(daysAgo * DAY)
    const id = A.ingestAlert(makePayload(cust, { alertDateTime: nowIso(), rule, riskScore: int(80, 97) }))
    at(daysAgo * DAY - 2 * HOUR); A.assignAlerts(maker, [id])
    work(maker, id, { kind: 'decide', decision: 'Confirmed Fraud', subClass: pick(['Scam-phishing', 'External fraud', 'Scam-pharming']), rationale: fill.desc })
    const caseId = C.createCaseFromAlert(maker, id)
    if (!get('SELECT assigned_to FROM cases WHERE id = ?', caseId)?.assigned_to) C.claimCase(maker, caseId)
    const txns = all('SELECT id FROM transactions WHERE cif = ? AND amount < 0 ORDER BY amount LIMIT 2', cust).map((t) => t.id)
    const existing = new Set(all('SELECT txn_id FROM case_transactions WHERE case_id = ?', caseId).map((t) => t.txn_id))
    const toAdd = txns.filter((t) => !existing.has(t))
    if (toAdd.length) C.addCaseTransactions(maker, caseId, toAdd)
    C.saveCase(maker, caseId, {
      fields: { complexity: fill.lost > 20000 ? 'L2' : 'L1', risk_l1: fill.l1, risk_l2: fill.l2, risk_title: fill.title },
      data: {
        details: { description: fill.desc, source: 'External', customerComplaint: true } as any,
        sourceDetails: { reportingChannel: 'Alert (DSP)', dateReported: nowIso().slice(0, 10), scamMethod: 'Phone call', scamType: 'Vishing', compromiseSource: 'Social engineering', firstFraudAt: nowIso() },
        financialSummary: { balanceAtFraud: int(10000, 90000), amountLost: fill.lost, amountSaved: Math.round(fill.lost * 0.2), amountRecovered: 0, preventedCount: 1, amountWithdrawnAfter: 0 },
        mandatoryActions: { reportedToPolice: true, policeChannel: 'Email', customerContacted: true, businessNotified: false, fpiNotified: false },
        recommendation: { category: 'Process', type: 'Generic', issue: 'Delayed hold on beneficiary', action: 'Strengthen control', text: 'Hold beneficiary funds faster on mule-pattern alerts.' },
      },
    })
    return caseId
  }
  // Steps happen `hoursLater` after the case was prepared (prepared at base - 2h).
  const T = async (u: User, id: string, action: any, comment: string, hoursLater: number, base: number) => { at(base - (hoursLater + 2) * HOUR); await C.transitionCase(u, id, action, comment) }
  const claim = (u: User, id: string, hoursLater: number, base: number) => { at(base - (hoursLater + 2) * HOUR); C.claimCase(u, id) }
  const fpiFill = (u: User, id: string, opts: { gross: number; rec?: number; str?: boolean; type?: string }) => {
    C.saveCase(u, id, {
      data: {
        investigation: { unitBranch: 'Retail Digital', isFraud: true, reportableMis: true, reportableOpRisk: opts.gross > 20000 } as any,
        financialImpact: { attempted: opts.gross + 5000, successful: opts.gross, nearMiss: 5000, potential: Math.round(opts.gross * 0.5), gross: opts.gross, recovery: opts.rec ?? 0, exposure: opts.gross + 5000, currency: 'AED', memoRef: `MEMO-${int(1000, 9999)}` },
        fpiRecommendation: { category: 'System', type: opts.type ?? 'Non-Generic', issue: 'Rule gap in DSP', action: 'Tune DSP rule', text: 'Lower the mule-pattern threshold for newly opened accounts and add device binding check.', strRequired: !!opts.str },
      },
    })
    const items = all('SELECT id FROM checklist_items WHERE case_id = ?', id)
    items.slice(0, 3).forEach((i) => C.updateChecklistItem(u, id, i.id, { status: 'Completed' }))
    C.addLog(u, id, { checklist_id: items[0]?.id, description: 'Interviewed customer; confirmed OTP was shared with caller impersonating bank staff.', finding: 'Customer was socially engineered into sharing OTP; no staff involvement found.', include_in_report: true })
    C.addLog(u, id, { checklist_id: items[1]?.id, description: 'Reviewed beneficiary account statement from Feature Store.', finding: 'Beneficiary account received funds from 4 other victims within 48h: mule pattern.', include_in_report: true })
    C.addLog(u, id, { description: 'Requested ATM snapshot for cash-out location.', finding: '', include_in_report: false })
    C.addEvidence(u, { caseId: id }, { name: 'Customer interview transcript.txt', mime: 'text/plain', folder: 'Interview transcripts', base64: Buffer.from('Interview transcript (synthetic demo data).').toString('base64'), checklist_id: items[0]?.id })
    C.addEvidence(u, { caseId: id }, { name: 'Call recording.mp3', mime: 'audio/mpeg', folder: 'Recordings', maktabaRef: `MK-${int(100000, 999999)}` })
  }

  // (a) Draft at maker
  caseFromAlert(custs[2], RULES[0], 1, aisha, { l1: 'Mule Account', l2: 'Mule Network', title: 'Recruited mule', lost: 18500, desc: 'Customer reported unauthorised transfer after a call from a person claiming to be bank staff.' })
  // (b) Submitted, waiting for a checker (Omar made it, so Omar cannot check it)
  { const b = 2 * DAY; const id = caseFromAlert(custs[3], RULES[1], 2, omar, { l1: 'Investment Scam', l2: 'Fake Investment', title: 'Crypto platform', lost: 42000, desc: 'Customer transferred funds to a fake crypto investment platform advertised on social media.' }); await T(omar, id, 'submit', 'All sections complete. Precautionary lien placed.', 3, b) }
  // (c) Returned to maker by checker
  { const b = 3 * DAY; const id = caseFromAlert(custs[5], RULES[4], 3, aisha, { l1: 'Account Takeover' as any, l2: 'SIM swap', title: 'SIM swap', lost: 9600, desc: 'Card-not-present transactions after a SIM swap.' }); C.saveCase(aisha, id, { fields: { risk_l1: 'External Fraud', risk_l2: 'Account Takeover' } }); await T(aisha, id, 'submit', 'Submitted for checking.', 2, b); claim(layla, id, 4, b); await T(layla, id, 'checker_return', 'Please attach the police report reference and confirm the card block date.', 5, b) }
  // (d) Closed by rule at Fraud Ops: External Fraud
  { const b = 6 * DAY; const id = caseFromAlert(custs[8], RULES[4], 6, aisha, { l1: 'External Fraud', l2: 'Phishing / Vishing', title: 'Phishing link', lost: 3200, desc: 'Customer clicked a phishing SMS link and entered card details.' }); await T(aisha, id, 'submit', 'Ready for review.', 2, b); claim(layla, id, 5, b); await T(layla, id, 'checker_approve', 'Verified. Card blocked and customer refunded under chargeback.', 6, b) }
  // (e) Closed by rule with email: Cyber Security
  { const b = 8 * DAY; const id = caseFromAlert(custs[10], RULES[1], 8, omar, { l1: 'Cyber Security', l2: 'Malware / Intrusion', title: 'Remote access trojan', lost: 15000, desc: 'Remote access trojan on customer laptop used to initiate payments.' }); await T(omar, id, 'submit', 'Malware confirmed by customer IT.', 1, b); claim(layla, id, 3, b); await T(layla, id, 'checker_approve', 'Approve: forward to Cyber Security.', 4, b) }
  // (f) Advance Fee Scam below X -> closed; above X -> investigator pool
  { const b = 5 * DAY; const id = caseFromAlert(custs[11], RULES[5], 5, aisha, { l1: 'Advance Fee Scam', l2: 'Advance Fee', title: 'Lottery / prize', lost: 4500, desc: 'Customer paid "release fees" for a fake lottery prize.' }); await T(aisha, id, 'submit', 'Submitted.', 1, b); claim(omar, id, 2, b); await T(omar, id, 'checker_approve', 'Amount below threshold.', 3, b) }
  const afsBig = await (async () => { const b = 4 * DAY; const id = caseFromAlert(custs[13], RULES[5], 4, aisha, { l1: 'Advance Fee Scam', l2: 'Advance Fee', title: 'Romance scam', lost: 65000, desc: 'Romance scam: customer sent multiple SWIFT transfers to an overseas "partner".' }); await T(aisha, id, 'submit', 'Submitted with all SWIFT references.', 1, b); claim(layla, id, 2, b); await T(layla, id, 'checker_approve', 'Above X, needs investigation.', 3, b); return id })()
  // (g) More cases in the investigator pool
  for (const [i, cust] of [custs[15], custs[16]].entries()) {
    const b = (3 + i) * DAY
    const id = caseFromAlert(cust, RULES[3], 3 + i, omar, { l1: 'Mule Account', l2: 'Mule Network', title: 'Rented account', lost: 28000 + i * 9000, desc: 'Inbound victim funds moved out within minutes through a rented account.' })
    await T(omar, id, 'submit', 'Mule pattern confirmed.', 1, b); claim(layla, id, 2, b); await T(layla, id, 'checker_approve', 'Route to FP&I.', 3, b)
  }
  // (h) Investigation in progress (Rashid) incl. AFS case
  claim(rashid, afsBig, 70, 4 * DAY)
  { const b = 7 * DAY; const id = caseFromAlert(custs[17], RULES[3], 7, aisha, { l1: 'Mule Account', l2: 'Mule Network', title: 'Recruited mule', lost: 51000, desc: 'Student account recruited as mule via social media job offer.' }); await T(aisha, id, 'submit', 'Submitted.', 1, b); claim(omar, id, 2, b); await T(omar, id, 'checker_approve', 'Approved.', 3, b); claim(rashid, id, 20, b); fpiFill(rashid, id, { gross: 51000 }) }
  // (i) Joint investigation: Rashid lead, Priya co-investigator still working
  { const b = 9 * DAY; const id = caseFromAlert(custs[18], RULES[2], 9, omar, { l1: 'Internal Fraud', l2: 'Staff Misconduct', title: 'Collusion', lost: 120000, desc: 'Possible collusion between a branch staff member and an external mule ring.' }); await T(omar, id, 'submit', 'Staff involvement suspected.', 1, b); claim(layla, id, 2, b); await T(layla, id, 'checker_approve', 'Approved.', 3, b); claim(rashid, id, 24, b); at(b - 25 * HOUR); C.addCoInvestigator(rashid, id, 'u-priya', 'INVESTIGATION'); C.addParty(rashid, id, { kind: 'Staff', ref: 'S10231', suspect: true }); fpiFill(rashid, id, { gross: 120000, str: true, type: 'Generic' }) }
  // (j) Review in progress (Khalid) after a rework loop
  { const b = 12 * DAY; const id = caseFromAlert(custs[19], RULES[3], 12, aisha, { l1: 'Mule Account', l2: 'Mule Network', title: 'Rented account', lost: 34000, desc: 'Rented account used to collect investment-scam proceeds.' }); await T(aisha, id, 'submit', 'Submitted.', 1, b); claim(omar, id, 2, b); await T(omar, id, 'checker_approve', 'Approved.', 3, b); claim(priya, id, 20, b); fpiFill(priya, id, { gross: 34000 }); await T(priya, id, 'inv_submit', 'Investigation complete.', 60, b); claim(khalid, id, 70, b); await T(khalid, id, 'rev_return', 'Add the beneficiary bank recall reference to the evidence vault.', 72, b); await T(priya, id, 'inv_submit', 'Recall reference added.', 90, b) }
  // (k) Pending approval (Mariam)
  { const b = 14 * DAY; const id = caseFromAlert(custs[21], RULES[0], 14, omar, { l1: 'Investment Scam', l2: 'Fake Investment', title: 'Forex platform', lost: 88000, desc: 'Fake forex platform; customer made 6 transfers over two weeks.' }); await T(omar, id, 'submit', 'Submitted.', 1, b); claim(hassan, id, 2, b); await T(hassan, id, 'checker_approve', 'Approved.', 3, b); claim(rashid, id, 20, b); fpiFill(rashid, id, { gross: 88000, rec: 12000, str: true }); await T(rashid, id, 'inv_submit', 'Ready for review.', 80, b); claim(khalid, id, 90, b); await T(khalid, id, 'rev_send_approver', 'Material loss: send to approver.', 100, b); claim(mariam, id, 110, b) }
  // (l) Fully closed with post-completion tasks and a pending recovery
  for (const [i, cust] of [custs[26], custs[23]].entries()) {
    const b = (25 + i * 5) * DAY
    const id = caseFromAlert(cust, RULES[3], 25 + i * 5, aisha, { l1: 'Mule Account', l2: 'Mule Network', title: 'Recruited mule', lost: 26000 + i * 15000, desc: 'Mule account collecting phishing proceeds from multiple victims.' })
    await T(aisha, id, 'submit', 'Submitted.', 1, b); claim(layla, id, 2, b); await T(layla, id, 'checker_approve', 'Approved.', 3, b)
    claim(priya, id, 20, b); fpiFill(priya, id, { gross: 26000 + i * 15000, str: i === 0, type: i === 0 ? 'Generic' : 'Non-Generic' }); C.updateParty(priya, id, all('SELECT id FROM case_parties WHERE case_id = ?', id)[0].id, { suspect: false })
    C.addParty(priya, id, { kind: 'Third party', ref: 'AE440330000012345678901', name: 'Mule account holder', suspect: true, blacklist: true, details: { bankName: 'Other UAE bank' } })
    await T(priya, id, 'inv_submit', 'Investigation complete.', 100, b); claim(khalid, id, 110, b)
    if (i === 0) { await T(khalid, id, 'rev_approve_close', 'Approved and closed at review.', 120, b) }
    else { await T(khalid, id, 'rev_send_approver', 'Send to approver.', 120, b); claim(mariam, id, 130, b); await T(mariam, id, 'app_approve', 'Approved.', 140, b) }
    if (i === 0) {
      const tasks = all('SELECT id FROM post_tasks WHERE case_id = ?', id)
      if (tasks[0]) { at(b - 160 * HOUR); C.updatePostTask(sup, tasks[0].id, { action: 'push' }) }
      at(b - 200 * HOUR); C.createRecovery(priya, id, { amount: 6000, mode: 'Beneficiary bank recall', date: nowIso().slice(0, 10), comment: 'Partial recall received from beneficiary bank.', blacklist: true })
    }
  }
  // (m) Whistleblower cases
  { at(6 * DAY); const id = C.createCase(rashid, { type: 'WHISTLEBLOWER', description: 'Anonymous report: staff member sharing customer data with a third party.' }); C.saveCase(rashid, id, { fields: { complexity: 'L2', risk_l1: 'Internal Fraud', risk_l2: 'Staff Misconduct', risk_title: 'Unauthorised access' }, data: { whistleblower: { allegation: 'Teller allegedly photographs customer ID documents.', channel: 'Whistleblowing hotline' } } }); C.addEvidence(rashid, { caseId: id }, { name: 'Hotline note.txt', mime: 'text/plain', folder: 'Whistleblower', base64: Buffer.from('Hotline note (synthetic).').toString('base64') }); at(6 * DAY - 2 * HOUR); await C.transitionCase(rashid, id, 'wb_route', 'Routing to HR for staff investigation.'); at(5 * DAY); C.claimCase(daniel, id); C.addParty(daniel, id, { kind: 'Staff', ref: 'S11877', suspect: true }) }
  { at(1 * DAY); const id = C.createCase(priya, { type: 'WHISTLEBLOWER', description: 'Email from former employee alleging expense manipulation.' }); void id }
  // (n) FP&I asks Fraud Ops to create a case (FR-CASE-02) + auto case from a CRM SR (FR-CASE-01)
  { at(20 * HOUR); C.createCase(rashid, { cif: custs[24], description: 'FP&I received an external bank notification about funds from this customer. Please perform initial checks and precautionary steps.' }) }
  { at(6 * HOUR); C.createCase(sup, { cif: custs[25], srNumber: 'SR-55120934', description: 'Customer complaint SR: unrecognised card transactions abroad.' }, { system: true }) }

  setClock(null)
  A.sweepAlerts()
  C.sweepCases()
  const n = (t: string) => get<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`)!.n
  console.log(`Seeded: ${n('users')} users, ${n('customers')} customers, ${n('transactions')} transactions, ${n('alerts')} alerts, ${n('cases')} cases, ${n('post_tasks')} post tasks, ${n('outbox')} emails.`)
  void run
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('src/seed.ts')) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
export { main as seedAll }
