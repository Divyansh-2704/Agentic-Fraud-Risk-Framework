// Seeds the test-scenario pack (shared/src/scenarios.ts): one dedicated customer and one fixed-ID record per scenario,
// each placed at the starting point of its test by replaying the real workflow services (so audit trails and emails are genuine).
import type { User } from '../../shared/src/index.js'
import { SCENARIO_CUSTOMERS } from '../../shared/src/scenarios.js'
import { all, get, insert, nowIso, setClock, update } from './db.js'
import * as A from './services/alerts.js'
import * as C from './services/cases.js'
import { getUser, userName } from './services/common.js'

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000
const at = (msAgo: number) => setClock(new Date(Date.now() - msAgo))
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
let seed = 8800101
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const int = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1))
const U = (id: string) => getUser(id)!

// ---------- Customers + transactions ----------
const accountsOf = (cif: string) => {
  const n = cif.replace(/\D/g, '').padStart(7, '0')
  return [`AE07026000${n}1001`, `AE07026000${n}2002`]
}
type Txn = { k: string; ago: number; type: string; amount: number; currency?: string; cp: string; iban?: string; channel?: string; acc?: 0 | 1 }
const GB = 'GB29BARC20040512345678', CY = 'CY17002001280000001200527600'
const FRAUD: Record<string, Txn[]> = {
  '8800101': [
    { k: 'F1', ago: 50 * MIN, type: 'SWIFT transfer', amount: -48500, cp: 'Global Invest FX', iban: GB, channel: 'Mobile app' },
    { k: 'F2', ago: 3 * DAY, type: 'SWIFT transfer', amount: -12000, cp: 'Global Invest FX', iban: GB, channel: 'Mobile app' },
  ],
  '8800102': [
    ['Rent - Al Futtaim', -2400], ['DEWA', -850], ['Etisalat', -420], ['Al Noor School fees', -1950], ['Carrefour', -310], ['ADNOC', -180], ['Family support - Kerala', -1500], ['du', -260], ['Lulu Hypermarket', -640],
  ].map(([cp, amount], i) => ({ k: `F${i + 1}`, ago: (55 - i * 5) * MIN, type: 'IPI instant payment', amount: amount as number, cp: cp as string, channel: 'Mobile app' })),
  '8800103': [{ k: 'F1', ago: 2 * HOUR, type: 'UAEFTS transfer', amount: -22000, cp: 'Unknown beneficiary', channel: 'Online banking' }],
  NEW0002: [{ k: 'F1', ago: 90 * MIN, type: 'IPI instant payment', amount: -7800, cp: 'Unknown beneficiary', channel: 'Mobile app' }],
  '8800105': [{ k: 'F1', ago: 3 * DAY, type: 'Card purchase', amount: -3100, cp: 'Amazon AE', channel: 'POS' }],
  '8800106': [
    { k: 'F1', ago: 70 * MIN, type: 'Internal transfer', amount: 35000, cp: 'Unknown remitter', channel: 'Online banking' },
    { k: 'F2', ago: 60 * MIN, type: 'IPI instant payment', amount: -34000, cp: 'Crypto Exchange XT', iban: CY, channel: 'Mobile app' },
  ],
  '8800107': [{ k: 'F1', ago: 2 * HOUR, type: 'Card purchase', amount: -6200, cp: 'Noon.com', channel: 'POS' }],
  '8800108': [
    { k: 'F1', ago: 4 * HOUR, type: 'UAEFTS transfer', amount: -15000, cp: 'New beneficiary - A. Karimov', channel: 'Mobile app' },
    { k: 'F2', ago: 3 * HOUR, type: 'IPI instant payment', amount: -9000, cp: 'New beneficiary - A. Karimov', channel: 'Mobile app' },
  ],
  '8800110': [{ k: 'F1', ago: 26 * HOUR, type: 'UAEFTS transfer', amount: -18000, cp: 'Ravi Shankar', iban: 'AE070260001015331040188', channel: 'Branch' }],
  '8800111': [{ k: 'F1', ago: 20 * HOUR, type: 'Internal transfer', amount: -200, cp: 'Account maintenance fee', channel: 'Branch' }],
  '8800112': [{ k: 'F1', ago: 5 * DAY, type: 'SWIFT transfer', amount: -4400, cp: 'Western Union', iban: GB, channel: 'Online banking' }],
  '8800113': [{ k: 'F1', ago: 10 * DAY, type: 'UAEFTS transfer', amount: -26000, cp: 'Unknown beneficiary', channel: 'Online banking' }],
  '8800114': [{ k: 'F1', ago: 101 * DAY, type: 'Card purchase', amount: -1500, cp: 'Noon.com', channel: 'POS' }],
  '8800201': [{ k: 'F1', ago: 4 * MIN, type: 'SWIFT transfer', amount: -18000, cp: 'Supplier - Gulf Trading LLC', iban: GB, channel: 'Online banking' }],
  '8800202': [{ k: 'F1', ago: 3 * MIN, type: 'IPI instant payment', amount: -45000, cp: 'Unknown beneficiary', channel: 'Mobile app' }],
  '8800203': [{ k: 'F1', ago: 2 * MIN, type: 'UAEFTS transfer', amount: -9900, cp: 'Watch-listed beneficiary', channel: 'Mobile app' }],
  '8800204': [{ k: 'F1', ago: 2 * MIN, type: 'IPI instant payment', amount: -3500, cp: 'Lulu Hypermarket', channel: 'Mobile app' }],
  '8800205': [{ k: 'F1', ago: 50 * MIN, type: 'SWIFT transfer', amount: -27000, cp: 'Offshore Trading Ltd', iban: CY, channel: 'Online banking' }],
  '8800301': [
    { k: 'F1', ago: 6 * DAY, type: 'SWIFT transfer', amount: -5000, currency: 'USD', cp: 'Global Invest FX', iban: GB, channel: 'Online banking' },
    { k: 'F2', ago: 5 * DAY, type: 'SWIFT transfer', amount: -2000, currency: 'EUR', cp: 'Global Invest FX', iban: GB, channel: 'Online banking' },
    { k: 'F3', ago: 4 * DAY, type: 'UAEFTS transfer', amount: -3000, cp: 'Global Invest FX - local agent', channel: 'Mobile app' },
  ],
}
/** Cases: one fraud transaction per customer for the case amount. */
const CASE_TXN: Record<string, [number, string, string]> = {
  '8800302': [22000, 'IPI instant payment', 'Crypto Exchange XT'], '8800303': [1200, 'Card purchase', 'Phishing merchant'],
  '8800304': [14000, 'UAEFTS transfer', 'Structured deposits'], '8800305': [15000, 'IPI instant payment', 'Unknown beneficiary'],
  '8800306': [6500, 'IPI instant payment', 'Unknown beneficiary'], '8800307': [2300, 'Card purchase', 'Online electronics store'],
  '8800308': [800, 'Card purchase', 'Unrecognised merchant'], '8800309': [9500, 'SWIFT transfer', 'Lottery release fee'],
  '8800310': [10000, 'SWIFT transfer', 'Inheritance lawyer'], '8800311': [25000, 'SWIFT transfer', 'Romance partner'],
  '8800312': [12000, 'Internal transfer', 'Dormant account debit'], '8800313': [25000, 'SWIFT transfer', 'Lottery release fee'],
  '8800314': [3000, 'Card purchase', 'Unknown merchant'], '8800315': [4100, 'Card purchase', 'Overseas ATM'],
  '8800316': [17000, 'UAEFTS transfer', 'External bank recall'],
  '8800401': [31000, 'IPI instant payment', 'Mule account'], '8800402': [18000, 'SWIFT transfer', 'FX broker'],
  '8800403': [23000, 'IPI instant payment', 'Mule account'], '8800404': [25000, 'SWIFT transfer', 'Romance partner'],
  '8800405': [33000, 'SWIFT transfer', 'Crypto platform'], '8800406': [64000, 'IPI instant payment', 'Mule account'],
  '8800407': [52000, 'SWIFT transfer', 'Forex platform'], '8800408': [40000, 'SWIFT transfer', 'Inheritance lawyer'],
  '8800409': [75000, 'Internal transfer', 'Colluding staff'], '8800501': [47000, 'IPI instant payment', 'Mule account'],
  '8800502': [39000, 'SWIFT transfer', 'Crypto platform'], '8800601': [36000, 'IPI instant payment', 'Mule account'],
  '8800602': [30000, 'IPI instant payment', 'Mule account'], '8800603': [21000, 'IPI instant payment', 'Mule account'],
  '8800604': [14000, 'IPI instant payment', 'Mule account'], '8800701': [19000, 'IPI instant payment', 'Mule account'],
}
const NORMAL: [string, number, number, string][] = [ // counterparty, min, max, type
  ['Salary - ACME LLC', 9000, 22000, 'Internal transfer'], ['DEWA', 250, 900, 'UAEFTS transfer'], ['Etisalat', 150, 450, 'UAEFTS transfer'],
  ['Carrefour', 80, 900, 'Card purchase'], ['Rent - Al Futtaim', 2000, 6500, 'UAEFTS transfer'], ['Noon.com', 60, 700, 'Card purchase'],
  ['ADNOC', 60, 250, 'Card purchase'], ['ATM cash', 200, 1500, 'ATM withdrawal'], ['Lulu Hypermarket', 90, 650, 'Card purchase'],
]

function seedScenarioCustomers() {
  for (const [cif, c] of Object.entries(SCENARIO_CUSTOMERS)) {
    const accounts = accountsOf(cif)
    insert('customers', {
      cif, name: c.name, entity: c.entity, segment: c.segment, rm: cif.startsWith('NEW') ? null : 'RM Joseph M.', eid: c.eid,
      passport: `P${cif.replace(/\D/g, '').padStart(7, '0')}`, tl: c.segment === 'SME' || c.segment === 'Corporate' ? `TL-${cif.slice(-6)}` : null,
      nationality: 'UAE', dob: '1986-04-12', accounts: JSON.stringify(accounts), cards: JSON.stringify([`4${cif.slice(-3)} **** **** ${cif.slice(-4)}`]), linked_cifs: '[]',
    })
    const txns: Txn[] = []
    for (let i = 0; i < 14; i++) {
      const [cp, lo, hi, type] = NORMAL[i % NORMAL.length]
      txns.push({ k: `N${String(i + 1).padStart(2, '0')}`, ago: (int(6, 88) * DAY) + int(0, 20) * HOUR, type, amount: (cp.startsWith('Salary') ? 1 : -1) * int(lo, hi), cp, channel: type === 'Card purchase' ? 'POS' : type === 'ATM withdrawal' ? 'ATM' : 'Mobile app', acc: (i % 3 === 2 ? 1 : 0) as 0 | 1 })
    }
    txns.push(...(FRAUD[cif] ?? []))
    const ct = CASE_TXN[cif]
    if (ct) txns.push({ k: 'F1', ago: 2 * DAY + 3 * HOUR, type: ct[1], amount: -ct[0], cp: ct[2], iban: ct[1] === 'SWIFT transfer' ? GB : undefined, channel: 'Mobile app' })
    let bal = 60000
    for (const t of txns.sort((a, b) => b.ago - a.ago)) {
      bal = Math.max(0, bal + t.amount * (t.currency && t.currency !== 'AED' ? 3.7 : 1))
      insert('transactions', {
        id: `TC-${cif}-${t.k}`, cif, account: accounts[t.acc ?? 0], date: iso(t.ago), type: t.type, amount: t.amount, currency: t.currency ?? 'AED',
        balance: Math.round(bal * 100) / 100, counterparty: t.cp, iban: t.iban ?? `AE4403300000${cif.replace(/\D/g, '').padStart(7, '0')}${t.k.padStart(3, '0').slice(-3)}`, channel: t.channel ?? 'Mobile app',
      })
    }
  }
}

// ---------- Alerts ----------
const R = {
  INV: { scenarioId: 'SC-450', ruleId: 'DSP-R450', ruleName: 'Repeated transfers to overseas investment platform', alertType: 'High-risk counterparty', typology: 'Investment scam', cond: 'beneficiary_category = investment AND country_risk = high' },
  ATO: { scenarioId: 'SC-101', ruleId: 'DSP-R101', ruleName: 'New beneficiary + immediate high-value transfer', alertType: 'Account takeover', typology: 'Account takeover', cond: 'beneficiary_age < 2h AND amount > 3x avg_30d' },
  MAL: { scenarioId: 'SC-102', ruleId: 'DSP-R102', ruleName: 'New device login followed by IPI', alertType: 'Malware / remote access', typology: 'Malware / remote access', cond: 'device_first_seen < 30m AND ipi_amount > 5000' },
  VEL: { scenarioId: 'SC-205', ruleId: 'DSP-R205', ruleName: 'Velocity: > 8 transfers in 1h', alertType: 'Velocity breach', typology: 'Velocity breach', cond: 'count(transfers,1h) > 8' },
  MULE: { scenarioId: 'SC-310', ruleId: 'DSP-R310', ruleName: 'Inbound funds moved out within 15 minutes', alertType: 'Mule account', typology: 'Mule account', cond: 'inbound > 10000 AND outbound_within_15m > 90%' },
  PHISH: { scenarioId: 'SC-412', ruleId: 'DSP-R412', ruleName: 'Card-not-present spike after OTP reset', alertType: 'Phishing', typology: 'Phishing', cond: 'otp_reset AND cnp_count_24h > 5' },
  STAFF: { scenarioId: 'SC-520', ruleId: 'DSP-R520', ruleName: 'Staff account receiving customer funds', alertType: 'Staff anomaly', typology: 'Staff anomaly', cond: 'beneficiary IN staff_accounts' },
  DORM: { scenarioId: 'SC-530', ruleId: 'DSP-R530', ruleName: 'Staff accessed dormant accounts out of hours', alertType: 'Staff anomaly', typology: 'Staff anomaly', cond: 'dormant_access AND hour NOT IN 7..19' },
  P_WATCH: { scenarioId: 'SC-600', ruleId: 'DSP-P600', ruleName: 'Beneficiary on internal watchlist', alertType: 'Mule account', typology: 'Mule account', cond: 'pre-authorisation decision layer' },
  P_SWIFT: { scenarioId: 'SC-610', ruleId: 'DSP-P610', ruleName: 'SWIFT to high-risk jurisdiction', alertType: 'Advance fee scam', typology: 'Advance fee scam', cond: 'pre-authorisation decision layer' },
  P_IPI: { scenarioId: 'SC-620', ruleId: 'DSP-P620', ruleName: 'First-time large IPI from new device', alertType: 'Account takeover', typology: 'Account takeover', cond: 'pre-authorisation decision layer' },
}
type Rule = (typeof R)[keyof typeof R]

function alert(id: string, cif: string, r: Rule, o: { ago: number; score: number; txn?: string; colour?: 'Green' | 'Red' | 'Grey'; extra?: Partial<A.DspPayload> }) {
  const c = get('SELECT * FROM customers WHERE cif = ?', cif)
  const t = o.txn ? get('SELECT * FROM transactions WHERE id = ?', `TC-${cif}-${o.txn}`) : null
  const prevention = !!o.colour
  return A.ingestAlert({
    alertDateTime: iso(o.ago), riskScore: o.score, category: prevention ? 'Prevention' : 'Detection', mode: prevention || o.ago < 6 * HOUR ? 'Real Time' : 'T+1',
    scenarioId: r.scenarioId, scenarioDesc: r.ruleName, ruleId: r.ruleId, ruleName: r.ruleName, ruleCondition: r.cond, decisionLayer: prevention ? 'DL-1 Pre-authorisation' : 'DL-2 Fraud Score',
    alertType: r.alertType, typology: r.typology, cif, accountNumber: c ? JSON.parse(c.accounts)[0] : '', txnAmount: t ? Math.abs(t.amount) : 0, txnRef: t?.id,
    alertOn: 'CUSTOMER ACCOUNT NUMBER', alertedEntityType: r.alertType === 'Mule account' ? 'MULE' : r.alertType === 'Staff anomaly' ? 'STAFF' : 'VICTIM',
    deviceId: `DEV-${id.slice(-3)}`, beneficiaryAccount: t?.iban, preventionColour: o.colour, srType: 'Financial', ...o.extra,
  }, { id, skipAutoAllocate: true })
}
/** Mirrors the prevention auto-allocation (FR-ALT-048) but to a known analyst, so the guide can name them. */
function allocate(id: string, uid: string) {
  const a = get('SELECT * FROM alerts WHERE id = ?', id)!
  const to = a.held ? 'Hold' : 'WIP'
  update('alerts', 'id', id, { assigned_to: uid, assigned_at: a.created_at, status: to })
  insert('alert_events', { alert_id: id, ts: a.created_at, actor: 'system', action: `Auto-allocated to ${userName(uid)}`, from_status: null, to_status: to, comment: null })
}

function seedScenarioAlerts() {
  const aisha = U('u-aisha'), omar = U('u-omar'), layla = U('u-layla')
  // A · detection
  alert('ALT-TC-A01', '8800101', R.INV, { ago: 45 * MIN, score: 86, txn: 'F1' })
  alert('ALT-TC-A02', '8800102', R.VEL, { ago: 20 * MIN, score: 58, txn: 'F1', extra: { txnAmount: 8510 } })
  alert('ALT-TC-A03', '8800103', R.ATO, { ago: 100 * MIN, score: 77, txn: 'F1' })
  alert('ALT-TC-A04', 'NEW0002', R.MAL, { ago: 80 * MIN, score: 84, txn: 'F1' })
  { // A05: already re-scheduled twice (real actions, TAT paused each time)
    const id = alert('ALT-TC-A05', '8800105', R.PHISH, { ago: 3 * DAY, score: 64, txn: 'F1' })
    at(70 * HOUR); A.assignAlerts(layla, [id]); A.alertAct(layla, id, { kind: 'reschedule' })
    A.sweepAlerts(new Date(Date.now() - 46 * HOUR))
    at(40 * HOUR); A.assignAlerts(layla, [id]); A.alertAct(layla, id, { kind: 'reschedule' })
    A.sweepAlerts(new Date(Date.now() - 16 * HOUR))
    setClock(null)
  }
  alert('ALT-TC-A06', '8800106', R.MULE, { ago: 55 * MIN, score: 92, txn: 'F2' })
  alert('ALT-TC-A07', '8800107', R.PHISH, { ago: 110 * MIN, score: 69, txn: 'F1' })
  alert('ALT-TC-A08', '8800108', R.ATO, { ago: 230 * MIN, score: 81, txn: 'F1' })
  alert('ALT-TC-A08B', '8800108', R.MULE, { ago: 170 * MIN, score: 74, txn: 'F2' })
  alert('ALT-TC-A08C', '8800108', R.VEL, { ago: 160 * MIN, score: 55, txn: 'F2' })
  A.ingestAlert({ alertDateTime: iso(35 * MIN), riskScore: 61, category: 'Detection', mode: 'Real Time', scenarioId: 'SC-205', scenarioDesc: R.VEL.ruleName, ruleId: R.VEL.ruleId, ruleName: R.VEL.ruleName, ruleCondition: R.VEL.cond, alertType: 'Velocity breach', cif: 'UNK0009', accountNumber: '', txnAmount: 1200 }, { id: 'ALT-TC-A09', skipAutoAllocate: true })
  alert('ALT-TC-A10', '8800110', R.STAFF, { ago: 25 * HOUR, score: 88, txn: 'F1' })
  alert('ALT-TC-A11', '8800111', R.DORM, { ago: 19 * HOUR, score: 79, txn: 'F1' })
  { // A12: overdue (Medium, 96h SLA, 5 days old)
    const id = alert('ALT-TC-A12', '8800112', R.PHISH, { ago: 5 * DAY, score: 62, txn: 'F1' })
    at(5 * DAY - 2 * HOUR); A.assignAlerts(omar, [id]); setClock(null)
  }
  { // A13: EDD raised 9 days ago, no response
    const id = alert('ALT-TC-A13', '8800113', R.ATO, { ago: 10 * DAY, score: 82, txn: 'F1' })
    at(9 * DAY + 2 * HOUR); A.assignAlerts(omar, [id])
    at(9 * DAY); A.alertAct(omar, id, { kind: 'edd' }); setClock(null)
  }
  { // F05: closed 100 days ago (archived)
    const id = alert('ALT-TC-F05', '8800114', R.PHISH, { ago: 101 * DAY, score: 52, txn: 'F1' })
    at(100 * DAY); A.assignAlerts(omar, [id]); A.alertAct(omar, id, { kind: 'decide', decision: 'False Positive', subClass: 'Valid alert-non fraud', rationale: 'Customer confirmed the online purchase.' }); setClock(null)
  }
  // B · prevention (auto-allocated)
  allocate(alert('ALT-TC-B01', '8800201', R.P_SWIFT, { ago: 4 * MIN, score: 88, txn: 'F1', colour: 'Grey' }), aisha.id)
  allocate(alert('ALT-TC-B02', '8800202', R.P_IPI, { ago: 3 * MIN, score: 95, txn: 'F1', colour: 'Grey' }), aisha.id)
  allocate(alert('ALT-TC-B03', '8800203', R.P_WATCH, { ago: 2 * MIN, score: 91, txn: 'F1', colour: 'Red' }), omar.id)
  allocate(alert('ALT-TC-B04', '8800204', R.P_IPI, { ago: 2 * MIN, score: 72, txn: 'F1', colour: 'Green' }), layla.id)
  allocate(alert('ALT-TC-B05', '8800205', R.P_SWIFT, { ago: 50 * MIN, score: 90, txn: 'F1', colour: 'Grey' }), omar.id)
}

// ---------- Cases ----------
type Fill = { l1: string; l2: string; title: string; lost: number; desc: string; complexity?: 'L1' | 'L2' }
/** A clock that moves forward from `startAgo` in steps of hours. */
const timeline = (startAgo: number) => { let t = startAgo; at(t); return (hours = 1) => { t = Math.max(60_000, t - hours * HOUR); at(t) } }

function makerCase(id: string, maker: User, cif: string, f: Fill) {
  C.createCase(maker, { cif, description: f.desc }, { id })
  const txns = all('SELECT id FROM transactions WHERE cif = ? AND id LIKE ?', cif, `TC-${cif}-F%`).map((t) => t.id)
  if (txns.length) C.addCaseTransactions(maker, id, txns)
  C.saveCase(maker, id, {
    fields: { complexity: f.complexity ?? (f.lost > 30000 ? 'L2' : 'L1'), risk_l1: f.l1, risk_l2: f.l2, risk_title: f.title },
    data: {
      details: { description: f.desc, source: 'External', customerComplaint: true } as any,
      customer: { customerRole: 'Victim' },
      sourceDetails: { reportingChannel: 'Customer call', dateReported: nowIso().slice(0, 10), scamMethod: 'Phone call', scamType: 'Vishing', compromiseSource: 'Social engineering' },
      financialSummary: { balanceAtFraud: 60000, amountLost: f.lost, amountSaved: 0, amountRecovered: 0, preventedCount: 0, amountWithdrawnAfter: 0 },
      mandatoryActions: { reportedToPolice: true, policeChannel: 'Email', customerContacted: true, businessNotified: false, fpiNotified: false },
      recommendation: { category: 'Process', type: 'Non-Generic', issue: 'Delayed hold on beneficiary', action: 'Strengthen control', text: 'Hold beneficiary funds faster on mule-pattern alerts.' },
    },
  })
}
const T = (u: User, id: string, action: any, comment: string) => C.transitionCase(u, id, action, comment)

function fpiFill(u: User, id: string, o: { gross: number; rec?: number; str?: boolean; type?: 'Generic' | 'Non-Generic'; impact?: Record<string, number>; noRec?: boolean }) {
  C.saveCase(u, id, {
    data: {
      investigation: { unitBranch: 'Retail Digital', isFraud: true, reportableMis: true, reportableOpRisk: o.gross > 20000 } as any,
      financialImpact: { attempted: o.gross + 5000, successful: o.gross, nearMiss: 5000, potential: Math.round(o.gross * 0.5), gross: o.gross, recovery: o.rec ?? 0, exposure: o.gross + 5000, currency: 'AED', memoRef: `MEMO-${id.slice(-3)}`, ...o.impact } as any,
      ...(o.noRec ? {} : { fpiRecommendation: { category: 'System', type: o.type ?? 'Non-Generic', issue: 'Rule gap in DSP', action: 'Tune DSP rule', text: 'Lower the mule-pattern threshold for new accounts and add a device-binding check.', strRequired: !!o.str } }),
    },
  })
  const items = all('SELECT id FROM checklist_items WHERE case_id = ? ORDER BY id', id)
  items.slice(0, 3).forEach((i) => C.updateChecklistItem(u, id, i.id, { status: 'Completed' }))
  C.addLog(u, id, { checklist_id: items[0]?.id, description: 'Interviewed the customer by recorded line.', finding: 'Customer was socially engineered; no staff involvement found.', include_in_report: true })
  C.addLog(u, id, { checklist_id: items[1]?.id, description: 'Reviewed beneficiary account statement (Feature Store).', finding: 'Beneficiary received funds from 3 other victims within 48h: mule pattern.', include_in_report: true })
  C.addEvidence(u, { caseId: id }, { name: 'Customer interview transcript.txt', mime: 'text/plain', folder: 'Interview transcripts', base64: Buffer.from('Interview transcript (synthetic test data).').toString('base64'), checklist_id: items[0]?.id })
}

async function seedScenarioCases() {
  const aisha = U('u-aisha'), omar = U('u-omar'), layla = U('u-layla'), hassan = U('u-hassan'), rashid = U('u-rashid'), priya = U('u-priya'), khalid = U('u-khalid'), mariam = U('u-mariam'), sup = U('u-super')
  const mule = (lost: number, title = 'Recruited mule') => ({ l1: 'Mule Account', l2: 'Mule Network', title, lost, desc: `Victim funds of AED ${lost.toLocaleString('en-US')} routed through a ${title.toLowerCase()} after a vishing call.` })

  /** Maker prepares + submits; optionally a checker approves. */
  const toChecker = async (id: string, maker: User, cif: string, f: Fill, startAgo: number) => {
    const step = timeline(startAgo); makerCase(id, maker, cif, f); step(1); await T(maker, id, 'submit', 'All sections complete; submitted for checking.'); return step
  }
  const toFpi = async (id: string, maker: User, checker: User, cif: string, f: Fill, startAgo: number) => {
    const step = await toChecker(id, maker, cif, f, startAgo); step(2); C.claimCase(checker, id); step(1); await T(checker, id, 'checker_approve', 'Verified by checker; apply routing.'); return step
  }
  const investigate = async (id: string, maker: User, checker: User, inv: User, cif: string, f: Fill, startAgo: number, fill?: Parameters<typeof fpiFill>[2]) => {
    const step = await toFpi(id, maker, checker, cif, f, startAgo); step(3); C.claimCase(inv, id); step(4); if (fill) fpiFill(inv, id, fill); return step
  }

  // ---- C · Maker-Checker and routing ----
  await toChecker('FC-TC-C02', omar, '8800302', mule(22000, 'Rented account'), 2 * DAY)
  await toChecker('FC-TC-C03', aisha, '8800303', { l1: 'External Fraud', l2: 'Phishing / Vishing', title: 'Phishing link', lost: 1200, desc: 'Customer entered card details on a phishing link (already reported on another case).' }, 26 * HOUR)
  const routing: [string, string, Fill][] = [
    ['FC-TC-C04', '8800304', { l1: 'Group Compliance', l2: 'Regulatory / AML', title: 'Suspicious structuring', lost: 14000, desc: 'Cash deposits structured below reporting thresholds over 3 days.' }],
    ['FC-TC-C05', '8800305', { l1: 'Cyber Security', l2: 'Malware / Intrusion', title: 'Credential theft', lost: 15000, desc: 'Online banking credentials stolen by an info-stealer on the customer laptop.' }],
    ['FC-TC-C06', '8800306', { l1: 'External Fraud', l2: 'Phishing / Vishing', title: 'Vishing - OTP disclosure', lost: 6500, desc: 'Customer shared an OTP with a caller impersonating the bank.' }],
    ['FC-TC-C07', '8800307', { l1: 'Card Fraud', l2: 'Card Not Present', title: 'E-commerce compromise', lost: 2300, desc: 'Card details used online after a merchant data breach.' }],
    ['FC-TC-C08', '8800308', { l1: 'Fraudulent Enquiries', l2: 'Customer Enquiry', title: 'Unrecognised transaction enquiry', lost: 800, desc: 'Customer did not recognise a merchant descriptor; enquiry only.' }],
    ['FC-TC-C09', '8800309', { l1: 'Advance Fee Scam', l2: 'Advance Fee', title: 'Lottery / prize', lost: 9500, desc: 'Customer paid a "release fee" for a fake lottery prize.' }],
    ['FC-TC-C10', '8800310', { l1: 'Advance Fee Scam', l2: 'Advance Fee', title: 'Inheritance', lost: 10000, desc: 'Customer paid fees to a fake lawyer to unlock an inheritance.' }],
    ['FC-TC-C11', '8800311', { l1: 'Advance Fee Scam', l2: 'Advance Fee', title: 'Romance scam', lost: 25000, desc: 'Romance scam: customer sent money to an overseas "partner" for travel fees.' }],
    ['FC-TC-C12', '8800312', { l1: 'Internal Fraud', l2: 'Staff Misconduct', title: 'Unauthorised access', lost: 12000, desc: 'Branch staff debited a dormant account without customer instruction.' }],
    ['FC-TC-C13', '8800313', { l1: 'Advance Fee Scam', l2: 'Advance Fee', title: 'Lottery / prize', lost: 25000, desc: 'Customer paid several fees for a fake prize draw.' }],
  ]
  for (const [i, [id, cif, f]] of routing.entries()) await toChecker(id, aisha, cif, f, 20 * HOUR - i * 30 * MIN)
  { at(3 * HOUR); C.createCase(aisha, { cif: '8800314', description: 'Draft opened by mistake for an unrelated card query.' }, { id: 'FC-TC-C14' }) }
  { at(2 * HOUR); C.createCase(sup, { cif: '8800315', srNumber: 'SR-77000123', description: 'Customer complaint SR: unrecognised card transactions abroad.' }, { system: true, id: 'FC-TC-C15' }) }
  { at(5 * HOUR); C.createCase(rashid, { cif: '8800316', description: 'External bank notification: funds received from this customer were reported as fraud. Please perform initial checks and precautionary steps.' }, { id: 'FC-TC-C16' }) }

  // ---- D · FP&I ----
  await toFpi('FC-TC-D01', aisha, layla, '8800401', mule(31000), 3 * DAY)
  await investigate('FC-TC-D02', aisha, layla, rashid, '8800402', { l1: 'Investment Scam', l2: 'Fake Investment', title: 'Forex platform', lost: 18000, desc: 'Customer invested in a fake forex platform promoted on social media.' }, 5 * DAY,
    { gross: 18000, noRec: true, impact: { attempted: 20000, successful: 18000, nearMiss: 5000, potential: 19000, gross: 18000, recovery: 25000, exposure: 20000 } })
  await toFpi('FC-TC-D03', omar, hassan, '8800403', mule(23000, 'Rented account'), 2 * DAY)
  await investigate('FC-TC-D04', aisha, layla, rashid, '8800404', { l1: 'Advance Fee Scam', l2: 'Advance Fee', title: 'Romance scam', lost: 25000, desc: 'Romance scam with repeated SWIFT transfers for "visa fees".' }, 3 * DAY)
  { const s = await investigate('FC-TC-D05', aisha, omar, priya, '8800405', { l1: 'Investment Scam', l2: 'Fake Investment', title: 'Crypto platform', lost: 33000, desc: 'Fake crypto platform; customer made 4 transfers.' }, 6 * DAY, { gross: 33000 }); s(20); await T(priya, 'FC-TC-D05', 'inv_submit', 'Investigation complete.') }
  const toApprover = async (id: string, maker: User, inv: User, rev: User, cif: string, f: Fill, startAgo: number, fill: Parameters<typeof fpiFill>[2]) => {
    const s = await investigate(id, maker, layla, inv, cif, f, startAgo, fill); s(20); await T(inv, id, 'inv_submit', 'Ready for review.'); s(6); C.claimCase(rev, id); s(4); await T(rev, id, 'rev_send_approver', 'Material loss: send to approver.'); return s
  }
  await toApprover('FC-TC-D06', omar, rashid, khalid, '8800406', mule(64000), 9 * DAY, { gross: 64000, rec: 4000, str: true, type: 'Generic' })
  await toApprover('FC-TC-D07', aisha, rashid, khalid, '8800407', { l1: 'Investment Scam', l2: 'Fake Investment', title: 'Forex platform', lost: 52000, desc: 'Fake forex platform; six transfers over two weeks.' }, 8 * DAY, { gross: 52000 })
  await toApprover('FC-TC-D08', aisha, priya, khalid, '8800408', { l1: 'Advance Fee Scam', l2: 'Advance Fee', title: 'Inheritance', lost: 40000, desc: 'Inheritance fee scam; customer paid four instalments.' }, 7 * DAY, { gross: 40000 })
  await toApprover('FC-TC-D09', omar, rashid, mariam, '8800409', { l1: 'Internal Fraud', l2: 'Staff Misconduct', title: 'Collusion', lost: 75000, desc: 'Branch staff colluded with an external mule ring.' }, 10 * DAY, { gross: 75000, str: true })

  // ---- E · joint + whistleblower ----
  await investigate('FC-TC-E01', aisha, layla, rashid, '8800501', mule(47000), 4 * DAY, { gross: 47000 })
  { const s = await investigate('FC-TC-E02', aisha, omar, priya, '8800502', { l1: 'Investment Scam', l2: 'Fake Investment', title: 'Crypto platform', lost: 39000, desc: 'Fake crypto platform advertised by a celebrity deep-fake video.' }, 5 * DAY, { gross: 39000 }); s(10); await T(priya, 'FC-TC-E02', 'inv_submit', 'Investigation complete.') }
  {
    at(20 * HOUR)
    C.createCase(priya, { type: 'WHISTLEBLOWER', description: 'Hotline report: a teller photographs customer ID documents with a personal phone.' }, { id: 'WB-TC-E03' })
    C.saveCase(priya, 'WB-TC-E03', { fields: { complexity: 'L2', risk_l1: 'Internal Fraud', risk_l2: 'Staff Misconduct', risk_title: 'Unauthorised access' }, data: { whistleblower: { allegation: 'Teller at Al Barsha branch allegedly photographs customer national ID cards.', channel: 'Whistleblowing hotline' } } as any })
  }
  {
    const s = timeline(3 * DAY)
    C.createCase(rashid, { type: 'WHISTLEBLOWER', description: 'Email from a former employee alleging expense-claim manipulation in Central Operations.' }, { id: 'WB-TC-E04' })
    C.saveCase(rashid, 'WB-TC-E04', { fields: { complexity: 'L1', risk_l1: 'Internal Fraud', risk_l2: 'Staff Misconduct', risk_title: 'Unauthorised access' }, data: { whistleblower: { allegation: 'Inflated taxi and hotel claims submitted by a team lead.', channel: 'Email' } } as any })
    C.addEvidence(rashid, { caseId: 'WB-TC-E04' }, { name: 'Whistleblower email.txt', mime: 'text/plain', folder: 'Whistleblower', base64: Buffer.from('Whistleblower email (synthetic).').toString('base64') })
    s(2); await T(rashid, 'WB-TC-E04', 'wb_route', 'Routing to Governance for review of expense claims.')
  }

  // ---- F · post-closure ----
  { const s = await toApprover('FC-TC-F01', aisha, rashid, khalid, '8800601', mule(36000), 20 * DAY, { gross: 36000, str: true, type: 'Generic' }); s(24); C.claimCase(mariam, 'FC-TC-F01'); s(4); await T(mariam, 'FC-TC-F01', 'app_approve', 'Approved.') }
  {
    const s = await investigate('FC-TC-F02', aisha, layla, priya, '8800602', mule(30000), 18 * DAY, { gross: 30000 })
    C.addParty(priya, 'FC-TC-F02', { kind: 'Third party', ref: 'AE440330000099887766554', name: 'Mule account holder', suspect: true, details: { bankName: 'Other UAE bank' } })
    s(24); await T(priya, 'FC-TC-F02', 'inv_submit', 'Investigation complete.'); s(6); C.claimCase(khalid, 'FC-TC-F02'); s(4); await T(khalid, 'FC-TC-F02', 'rev_approve_close', 'Approved and closed at review.')
  }
  { const s = await investigate('FC-TC-F03', omar, layla, rashid, '8800603', mule(21000), 16 * DAY, { gross: 21000 }); s(24); await T(rashid, 'FC-TC-F03', 'inv_submit', 'Done.'); s(6); C.claimCase(khalid, 'FC-TC-F03'); s(4); await T(khalid, 'FC-TC-F03', 'rev_approve_close', 'Approved and closed.') }
  await toChecker('FC-TC-F04', aisha, '8800604', mule(14000, 'Rented account'), 22 * HOUR)

  // ---- X · Chinese wall ----
  await toFpi('FC-TC-X01', aisha, layla, '8800701', mule(19000), 2 * DAY)
  setClock(null)
}

export async function seedScenarios() {
  seedScenarioCustomers()
  seedScenarioAlerts()
  await seedScenarioCases()
  setClock(null)
}
