// FCMS: fraud case lifecycle (BRD section 5).
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CaseAction, CaseStatus, User } from '../../../shared/src/index.js'
import { CHECKLIST_TEMPLATES, FX_TO_AED, isClosedCase } from '../../../shared/src/index.js'
import { all, get, getConfig, insert, json, nextId, nowIso, run, tx, update, UPLOAD_DIR, type Row } from '../db.js'
import { availableActions, claimCheck, transition, type CaseSnapshot, type Effect } from '../workflow/case.js'
import { computeImpact, EMPTY_IMPACT, validateImpact } from '../workflow/financial.js'
import { evaluateRouting, type RoutingRule } from '../workflow/routing.js'
import { AGE_BUCKETS, ageBucket, bad, canSeeCase, forbidden, fuzzyMatch, getUser, hasRole, isFpi, listUsers, notFound, sendEmail, userName } from './common.js'
import { buildCaseReport } from './report.js'

export const STAKEHOLDERS = 'fpi.team@auronova.example; fraud.ops@auronova.example; business.unit@auronova.example'

export function emptyCaseData() {
  return {
    details: { description: '', source: 'External', customerComplaint: false },
    customer: { customerRole: 'Victim' },
    sourceDetails: {} as Row,
    financialSummary: { balanceAtFraud: 0, amountLost: 0, amountSaved: 0, amountRecovered: 0, preventedCount: 0, amountWithdrawnAfter: 0 },
    mandatoryActions: { reportedToPolice: false, policeChannel: '', customerContacted: false, businessNotified: false, fpiNotified: false },
    precautions: [] as { category: string; step: string; vals: Record<string, string> }[],
    recommendation: {} as Row,
    investigation: { dateReportedToFpi: null, unitBranch: '', isFraud: true, reportableMis: false, reportableOpRisk: false } as Row,
    financialImpact: { ...EMPTY_IMPACT },
    fpiRecommendation: {} as Row,
    whistleblower: {} as Row,
  }
}
export type CaseData = ReturnType<typeof emptyCaseData>

const loadCase = (id: string) => {
  const c = get('SELECT * FROM cases WHERE id = ?', id)
  if (!c) throw notFound('Case not found')
  return c
}
const caseData = (c: Row): CaseData => ({ ...emptyCaseData(), ...json(c.data, {}) })

// ---------- Validation ----------
export function missingMandatory(c: Row, d: CaseData) {
  const m: string[] = []
  if (!d.details.description?.trim()) m.push('Case description')
  if (!c.cif) m.push('CIF')
  if (!c.complexity) m.push('Complexity L1/L2')
  if (!c.risk_l1) m.push('Risk Category (L1)')
  if (!c.risk_l2) m.push('Risk Category (L2)')
  if (!c.risk_title) m.push('Risk Title')
  if (!d.sourceDetails.reportingChannel) m.push('Reporting channel')
  if (!d.sourceDetails.dateReported) m.push('Date reported')
  if (!d.recommendation.category) m.push('Recommendation category')
  return m
}
function txnTotalAed(caseId: string) {
  return get<{ t: number }>('SELECT COALESCE(SUM(amount_aed),0) t FROM case_transactions WHERE case_id = ?', caseId)!.t
}
export function successfulAed(c: Row, d: CaseData) {
  return Number(d.financialImpact.successful) || Number(d.financialSummary.amountLost) || txnTotalAed(c.id)
}

export function snapshot(c: Row): CaseSnapshot {
  const d = caseData(c)
  const inv = all('SELECT * FROM case_investigators WHERE case_id = ?', c.id)
  const pending = (stage: string) => inv.filter((i) => i.stage === stage && i.role === 'Co' && !i.done).map((i) => userName(i.user_id)!)
  return {
    id: c.id, type: c.type, status: c.status, owner: c.owner, assignedTo: c.assigned_to, createdBy: c.created_by, makerId: c.maker_id,
    checkerId: c.checker_id, investigatorId: c.investigator_id, reviewerId: c.reviewer_id, approverId: c.approver_id,
    riskL1: c.risk_l1, riskL2: c.risk_l2, successfulAed: successfulAed(c, d), missingMandatory: missingMandatory(c, d),
    financialErrors: validateImpact(d.financialImpact), hasRecommendation: !!(d.fpiRecommendation.category && d.fpiRecommendation.text?.trim()),
    jointPending: { INVESTIGATION: pending('INVESTIGATION'), REVIEW: pending('REVIEW') },
    investigators: inv.filter((i) => i.stage === 'INVESTIGATION').map((i) => i.user_id), disabled: !!c.disabled,
  }
}

const routingCfg = () => ({ rules: getConfig<RoutingRule[]>('routingRules'), afsThresholdAed: getConfig<number>('afsThresholdAed', 10000) })

// ---------- DTOs / list ----------
export function caseDto(c: Row) {
  const end = c.closed_at ? new Date(c.closed_at).getTime() : Date.now()
  const tat = end - new Date(c.created_at).getTime()
  const sla = getConfig<Record<string, number>>('caseSlaDays', { L1: 30, L2: 60 })
  const slaMs = (sla[c.complexity] ?? 45) * 86400_000
  const rest: Row = { ...c }
  delete rest.data
  return Object.assign(rest, {
    disabled: !!c.disabled, frozen: !!c.frozen, assigned_name: userName(c.assigned_to), created_by_name: userName(c.created_by),
    tat_ms: tat, age_bucket: ageBucket(tat), overdue: !isClosedCase(c.status) && tat > slaMs, closed: isClosedCase(c.status),
    sr_type: get('SELECT 1 FROM case_transactions WHERE case_id = ? LIMIT 1', c.id) ? 'Financial' : 'Non-financial',
  })
}
export type CaseDto = ReturnType<typeof caseDto>

const POOL_ROLE: Record<string, string> = { FO_MAKER: 'FO_MAKER', FO_CHECKER: 'FO_CHECKER', FPI_INVESTIGATOR: 'FPI_INVESTIGATOR', FPI_REVIEWER: 'FPI_REVIEWER', FPI_APPROVER: 'FPI_APPROVER', HR_GOV: 'HR' }
export const inMyPool = (u: User, c: Row) => !c.assigned_to && c.owner !== 'NONE' && (u.roles.includes(POOL_ROLE[c.owner] as any) || (c.owner === 'HR_GOV' && u.roles.includes('GOVERNANCE')))

export interface CaseFilters { scope?: string; q?: string; status?: string; priority?: string; assigned?: string; age?: string; srType?: string; type?: string; view?: string }
export function listCases(u: User, f: CaseFilters) {
  sweepCases()
  let rows = all('SELECT * FROM cases ORDER BY created_at DESC').filter((c) => canSeeCase(u, c))
  const scoped = rows.filter((c) => (f.scope === 'history' ? isClosedCase(c.status) : !isClosedCase(c.status)))
  let list = scoped
  if (f.view === 'mine') list = list.filter((c) => c.assigned_to === u.id)
  if (f.view === 'pool') list = list.filter((c) => inMyPool(u, c))
  if (f.type) list = list.filter((c) => c.type === f.type)
  const base = list.map(caseDto)
  let out = base
  if (f.status) out = out.filter((c) => c.status === f.status)
  if (f.priority) out = out.filter((c) => c.priority === f.priority)
  if (f.assigned === 'yes') out = out.filter((c) => c.assigned_to)
  if (f.assigned === 'no') out = out.filter((c) => !c.assigned_to)
  if (f.age) out = out.filter((c) => c.age_bucket === f.age)
  if (f.srType) out = out.filter((c) => c.sr_type === f.srType)
  if (f.q) out = out.filter((c) => {
    const cust = get('SELECT eid, passport, tl FROM customers WHERE cif = ?', c.cif)
    return fuzzyMatch(f.q!, c.id, c.cif, c.customer_name, c.typology, c.risk_l1, c.risk_l2, c.risk_title, c.status, c.assigned_name, c.sr_number, c.entity, cust?.eid, cust?.passport, cust?.tl)
  })
  const count = (keys: string[], fn: (c: CaseDto) => string) => Object.fromEntries(keys.map((k) => [k, base.filter((c) => fn(c) === k).length]))
  return {
    rows: out,
    total: scoped.length,
    kpis: {
      assignment: { Assigned: base.filter((c) => c.assigned_to).length, Unassigned: base.filter((c) => !c.assigned_to).length },
      status: count([...new Set(base.map((c) => c.status))], (c) => c.status),
      priority: count(['High', 'Medium', 'Low'], (c) => c.priority),
      age: count(AGE_BUCKETS, (c) => c.age_bucket),
      srType: count(['Financial', 'Non-financial'], (c) => c.sr_type),
      overdue: base.filter((c) => c.overdue).length,
    },
  }
}

// ---------- Full case view ----------
export function getCaseFull(u: User, id: string) {
  const c = loadCase(id)
  if (!canSeeCase(u, c)) throw forbidden('Chinese wall: you cannot view this case.')
  const d = caseData(c)
  const s = snapshot(c)
  const txns = all('SELECT * FROM case_transactions WHERE case_id = ? ORDER BY date', id)
  const summary = Object.values(txns.reduce((acc: Record<string, { type: string; count: number; amount_aed: number }>, t) => {
    if (!t.amount_aed) return acc // FR-CASE-014: only transactions with an amount impact
    acc[t.type] ??= { type: t.type, count: 0, amount_aed: 0 }
    acc[t.type].count++; acc[t.type].amount_aed += t.amount_aed
    return acc
  }, {}))
  const claim = c.assigned_to ? null : claimCheck(s, { id: u.id, roles: u.roles })
  const routing = c.risk_l1 ? evaluateRouting({ riskL1: c.risk_l1, riskL2: c.risk_l2, successfulAmountAed: s.successfulAed }, routingCfg().rules, routingCfg().afsThresholdAed) : null
  const checklist = all('SELECT * FROM checklist_items WHERE case_id = ? ORDER BY id', id).map((i) => ({ ...i, assigned_name: userName(i.assigned_to) }))
  const audit = all('SELECT * FROM audit_trail WHERE case_id = ? ORDER BY ts DESC, id DESC', id).map((a): Row => ({ ...a, actor_name: userName(a.actor) ?? a.actor, changes: json<any>(a.changes, null) }))
  return {
    case: caseDto(c),
    data: { ...d, financialImpact: computeImpact(d.financialImpact) },
    computed: {
      txnSummary: summary, txnTotalAed: txnTotalAed(id), fraudulentTxnCount: txns.length,
      preventedVolume: Number(d.financialSummary.amountSaved || 0) + Number(d.financialSummary.amountRecovered || 0),
      successfulAed: s.successfulAed,
    },
    validation: { missingMandatory: s.missingMandatory, financialErrors: s.financialErrors, hasRecommendation: s.hasRecommendation, jointPending: s.jointPending },
    transactions: txns,
    parties: all('SELECT * FROM case_parties WHERE case_id = ? ORDER BY id', id).map((p) => ({ ...p, details: json(p.details, {}), suspect: !!p.suspect, blacklist: !!p.blacklist })),
    checklist,
    activityLog: all('SELECT * FROM activity_log WHERE case_id = ? ORDER BY date, id', id).map((l) => ({ ...l, include_in_report: !!l.include_in_report, actor_name: userName(l.actor) })),
    evidence: all('SELECT * FROM evidence WHERE case_id = ? OR (alert_id IS NOT NULL AND alert_id = ?) ORDER BY uploaded_at DESC', id, c.alert_id ?? '__none__').map((e) => ({ ...e, uploaded_by_name: userName(e.uploaded_by) ?? e.uploaded_by })),
    audit: audit.filter((a) => a.action !== 'Edited'),
    diffs: audit.filter((a) => a.changes),
    investigators: all('SELECT * FROM case_investigators WHERE case_id = ?', id).map((i) => ({ ...i, done: !!i.done, name: userName(i.user_id) })),
    postTasks: all('SELECT * FROM post_tasks WHERE case_id = ? ORDER BY id', id).map((t) => ({ ...t, details: json(t.details, {}), assigned_name: userName(t.assigned_to) })),
    recoveries: all('SELECT * FROM recoveries WHERE case_id = ? ORDER BY id DESC', id).map((r) => ({ ...r, suspect: !!r.suspect, blacklist: !!r.blacklist, maker_name: userName(r.maker_id), checker_name: userName(r.checker_id) })),
    emails: all("SELECT * FROM outbox WHERE related_type = 'case' AND related_id = ? ORDER BY ts DESC", id),
    alert: c.alert_id ? get('SELECT id, rule_id, rule_name, alert_type, decision, sub_class, rationale FROM alerts WHERE id = ?', c.alert_id) : null,
    actions: availableActions(s, { id: u.id, roles: u.roles }),
    canClaim: !!claim?.ok, claimBlockedReason: claim && !claim.ok ? claim.error : null,
    canEdit: canEdit(u, c),
    routingPreview: routing,
    people: {
      maker: userName(c.maker_id), checker: userName(c.checker_id), investigator: userName(c.investigator_id),
      reviewer: userName(c.reviewer_id), approver: userName(c.approver_id), creator: userName(c.created_by),
    },
  }
}

export function canEdit(u: User, c: Row) {
  if (c.frozen || c.disabled) return false
  if (c.assigned_to !== u.id) return false
  return true // assigned user at any open stage may update (FR-CASE-031, 040, 067, 071)
}
const requireEdit = (u: User, c: Row) => {
  if (c.frozen) throw bad('Case is closed and frozen (FR-CASE-080). A super user can re-open it.')
  if (c.disabled) throw bad('Case is disabled.')
  if (c.assigned_to !== u.id) {
    // co-investigators may update during a joint investigation (FR-CASE-090)
    const co = get("SELECT 1 FROM case_investigators WHERE case_id = ? AND user_id = ? AND done = 0", c.id, u.id)
    if (!co) throw forbidden('Only the user the case is assigned to can update it.')
  }
}

function audit(caseId: string, actor: string, action: string, from: string | null, to: string | null, comment: string | null, changes?: unknown) {
  insert('audit_trail', { case_id: caseId, ts: nowIso(), actor, action, from_status: from, to_status: to, comment, changes: changes ? JSON.stringify(changes) : null })
}

// ---------- Creation (FR-CASE-01..04, 093) ----------
export function createCase(u: User, body: { type?: 'STANDARD' | 'WHISTLEBLOWER'; cif?: string; description?: string; origin?: string; srNumber?: string; entity?: string }, opts: { alertId?: string; inherit?: Row; precautions?: CaseData['precautions']; system?: boolean; id?: string } = {}) {
  const type = body.type ?? 'STANDARD'
  if (type === 'WHISTLEBLOWER' && !isFpi(u)) throw forbidden('Only FP&I can create whistleblower cases (FR-CASE-093).')
  // HR / Governance analysts may raise a case from an alert in their own queue (Sheet 2, step 10); it lands in the Fraud Ops Maker pool.
  const fromOwnAlert = !!opts.alertId && hasRole(u, 'HR', 'GOVERNANCE')
  if (type === 'STANDARD' && !opts.system && !fromOwnAlert && !hasRole(u, 'FO_MAKER', 'FO_ANALYST', 'FPI_INVESTIGATOR', 'FPI_REVIEWER', 'FPI_APPROVER', 'SUPER_USER')) throw forbidden('Your role cannot create cases.')
  const year = new Date().getFullYear()
  const id = opts.id ?? nextId(type === 'WHISTLEBLOWER' ? `WB-${year}-` : `FC-${year}-`, 'cases', 4) // fixed IDs are used by the test-scenario pack
  const cust = body.cif ? get('SELECT * FROM customers WHERE cif = ?', body.cif) : undefined
  const d = emptyCaseData()
  d.details.description = body.description ?? ''
  if (opts.precautions) d.precautions = opts.precautions
  if (opts.inherit) {
    d.sourceDetails = { reportingChannel: 'Alert (DSP)', dateReported: nowIso().slice(0, 10), firstFraudAt: opts.inherit.created_at }
    d.details.description ||= `Created from alert ${opts.inherit.id}: ${opts.inherit.alert_type}. Rule ${opts.inherit.rule_id} ${opts.inherit.rule_name}. ${opts.inherit.rationale ?? ''}`.trim()
  }
  if (body.srNumber) d.sourceDetails = { ...d.sourceDetails, reportingChannel: 'CRM service request', srReceivedAt: nowIso(), dateReported: nowIso().slice(0, 10) }
  const fromFpi = isFpi(u) && type === 'STANDARD'
  const isMaker = hasRole(u, 'FO_MAKER')
  const row: Row = {
    id, type, status: 'Draft', created_by: u.id, created_at: nowIso(), updated_at: nowIso(),
    owner: type === 'WHISTLEBLOWER' ? 'NONE' : 'FO_MAKER',
    assigned_to: type === 'WHISTLEBLOWER' ? u.id : isMaker && !opts.system ? u.id : null,
    assigned_at: nowIso(), alert_id: opts.alertId ?? null,
    origin: body.origin ?? (opts.alertId ? 'Alert decision' : body.srNumber ? 'CRM service request' : fromFpi ? 'Manual - FP&I' : 'Manual - Fraud Ops'),
    entity: cust?.entity ?? body.entity ?? 'Retail', dept: type === 'WHISTLEBLOWER' ? 'FPI' : 'FRAUD_OPS', cif: body.cif ?? null,
    customer_name: cust?.name ?? null, segment: cust?.segment ?? null, sr_number: body.srNumber ?? null,
    typology: opts.inherit?.typology ?? null, risk_score: opts.inherit?.risk_score ?? null, priority: opts.inherit?.priority ?? 'Medium',
    complexity: opts.inherit ? (opts.inherit.complexity === 'High' ? 'L2' : 'L1') : null, data: JSON.stringify(d),
  }
  tx(() => {
    insert('cases', row)
    audit(id, u.id, 'Case created', null, 'Draft', `Origin: ${row.origin}`)
    if (cust) insert('case_parties', { case_id: id, kind: 'Customer', name: cust.name, ref: cust.cif, details: JSON.stringify(customerDetails(cust)), suspect: 0, blacklist: 0, added_by: u.id })
    if (opts.inherit?.txn_ref) {
      const t = get('SELECT * FROM transactions WHERE id = ?', opts.inherit.txn_ref)
      if (t) addTxnRow(id, t)
    }
    if (fromFpi) sendEmail({ to: 'fraud.ops@auronova.example', cc: u.email, subject: `FP&I request: please create and action case ${id}`, body: `FP&I has initiated case ${id} for Fraud Ops initial checks and precautionary steps (FR-CASE-02).\n\n${row.customer_name ?? ''} ${body.description ?? ''}`, relatedType: 'case', relatedId: id, template: 'fpi_to_fo' })
  })
  return id
}

export function createCaseFromAlert(u: User, alertId: string) {
  const a = get('SELECT * FROM alerts WHERE id = ?', alertId)
  if (!a) throw notFound('Alert not found')
  if (a.case_id) return a.case_id as string
  if (a.decision !== 'Confirmed Fraud' && a.decision !== 'Reject') throw bad('A case can only be created from a Confirmed Fraud decision (FR-ALT-041).')
  const precautions = all('SELECT * FROM alert_actions WHERE alert_id = ? AND selected = 1', alertId).map((p) => ({ category: p.category, step: p.step, vals: json(p.vals, {}) }))
  const id = createCase(u, { cif: a.cif }, { alertId, inherit: a, precautions })
  update('alerts', 'id', alertId, { case_id: id })
  run('UPDATE evidence SET case_id = ? WHERE alert_id = ? AND case_id IS NULL', id, alertId)
  insert('alert_events', { alert_id: alertId, ts: nowIso(), actor: u.id, action: `Case ${id} created for investigation`, from_status: 'Closed', to_status: 'Closed', comment: null })
  sendEmail({ to: 'fpi.team@auronova.example', cc: u.email, subject: `Confirmed fraud: case ${id} created from alert ${alertId}`, body: `Alert ${alertId} (${a.customer_name}, CIF ${a.cif}) was decided Confirmed Fraud / ${a.sub_class}. Case ${id} has been created (FR-ALT-041, FR-ALT-062).\n\nRationale: ${a.rationale}`, relatedType: 'case', relatedId: id, template: 'case_from_alert' })
  return id
}

export function customerDetails(c: Row) {
  return { accounts: json(c.accounts, []), cards: json(c.cards, []), eid: c.eid, passport: c.passport, tradeLicense: c.tl, nationality: c.nationality, dob: c.dob, segment: c.segment, entity: c.entity }
}

// ---------- Save / edit with Show Diff (FR-CASE-026, 039) ----------
const EDITABLE_COLS = ['cif', 'complexity', 'risk_l1', 'risk_l2', 'risk_title', 'sr_number', 'typology', 'priority'] as const
export function saveCase(u: User, id: string, body: { fields?: Row; data?: Partial<CaseData> }) {
  const c = loadCase(id)
  requireEdit(u, c)
  const before = caseData(c)
  const next: CaseData = structuredClone(before)
  for (const [k, v] of Object.entries(body.data ?? {})) {
    if (Array.isArray(v)) (next as any)[k] = v
    else if (v && typeof v === 'object') (next as any)[k] = { ...(before as any)[k], ...v }
  }
  if (next.financialImpact) next.financialImpact = computeImpact(next.financialImpact)
  const cols: Row = {}
  for (const k of EDITABLE_COLS) if (body.fields && k in body.fields && body.fields[k] !== c[k]) cols[k] = body.fields[k] || null
  if (cols.cif) {
    const cust = get('SELECT * FROM customers WHERE cif = ?', cols.cif)
    if (!cust) throw bad(`CIF ${cols.cif} not found in core banking / Feature Store.`)
    Object.assign(cols, { customer_name: cust.name, segment: cust.segment, entity: cust.entity })
  }
  const changes = [
    ...Object.keys(cols).filter((k) => k !== 'customer_name' && k !== 'segment' && k !== 'entity').map((k) => ({ field: k, from: c[k], to: cols[k] })),
    ...diffObjects(before, next),
  ]
  if (!changes.length) return { ok: true, changes: 0 }
  tx(() => {
    update('cases', 'id', id, { ...cols, data: JSON.stringify(next), updated_at: nowIso() })
    audit(id, u.id, 'Edited', c.status, c.status, null, changes)
    // FR-CASE-017: Business / FP&I notified trigger auto emails
    if (!before.mandatoryActions.businessNotified && next.mandatoryActions.businessNotified)
      sendEmail({ to: 'business.unit@auronova.example', cc: u.email, subject: `Fraud case ${id}: business notification`, body: `Fraud case ${id} for ${c.customer_name ?? c.cif}. ${next.details.description}`, relatedType: 'case', relatedId: id, template: 'business_notified' })
    if (!before.mandatoryActions.fpiNotified && next.mandatoryActions.fpiNotified)
      sendEmail({ to: 'fpi.team@auronova.example', cc: u.email, subject: `Fraud case ${id}: FP&I notified`, body: `Fraud case ${id} for ${c.customer_name ?? c.cif}. ${next.details.description}`, relatedType: 'case', relatedId: id, template: 'fpi_notified' })
  })
  return { ok: true, changes: changes.length }
}

function diffObjects(a: any, b: any, prefix = ''): { field: string; from: unknown; to: unknown }[] {
  const out: { field: string; from: unknown; to: unknown }[] = []
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
  for (const k of keys) {
    const p = prefix ? `${prefix}.${k}` : k
    const x = a?.[k], y = b?.[k]
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) out.push(...diffObjects(x, y, p))
    else if (JSON.stringify(x ?? null) !== JSON.stringify(y ?? null) && !(isBlank(x) && isBlank(y))) out.push({ field: p, from: x ?? null, to: y ?? null })
  }
  return out
}
const isBlank = (v: unknown) => v === null || v === undefined || v === ''

// ---------- Workflow ----------
export function claimCase(u: User, id: string, targetUserId?: string) {
  const c = loadCase(id)
  const target = targetUserId ? getUser(targetUserId) : u
  if (!target) throw bad('Unknown user')
  if (targetUserId && targetUserId !== u.id && !hasRole(u, 'SUPER_USER', 'MANAGER', 'FPI_REVIEWER', 'FPI_APPROVER')) throw forbidden('Only super / monitoring users can assign cases to others (FR-CASE-037).')
  if (!canSeeCase(target, c)) throw forbidden(`${target.name} cannot see this case (Chinese wall).`)
  const s = snapshot(c)
  if (targetUserId && targetUserId !== u.id) s.assignedTo = null // super user re-assignment overrides the current holder
  const r = claimCheck(s, { id: target.id, roles: target.roles })
  if (!r.ok) throw bad(r.error)
  tx(() => {
    update('cases', 'id', id, { ...r.set, assigned_to: target.id, assigned_at: nowIso(), status: r.to ?? c.status, updated_at: nowIso() })
    if (c.owner === 'FPI_INVESTIGATOR' && r.set.investigator_id)
      run("INSERT OR IGNORE INTO case_investigators (case_id, user_id, stage, role, done) VALUES (?,?,?,?,0)", id, target.id, 'INVESTIGATION', 'Lead')
    if (c.owner === 'FPI_REVIEWER' && r.set.reviewer_id)
      run("INSERT OR IGNORE INTO case_investigators (case_id, user_id, stage, role, done) VALUES (?,?,?,?,0)", id, target.id, 'REVIEW', 'Lead')
    if (r.to === 'Investigation in progress') {
      const d = caseData(c)
      d.investigation.dateReportedToFpi ??= nowIso().slice(0, 10)
      update('cases', 'id', id, { data: JSON.stringify(d) })
      if (!get('SELECT 1 FROM checklist_items WHERE case_id = ?', id)) generateChecklist(id, c.risk_l1, target.id)
    }
    audit(id, u.id, target.id === u.id ? 'Picked from pool' : `Assigned to ${target.name}`, c.status, r.to ?? c.status, null)
  })
  return { ok: true }
}

export async function transitionCase(u: User, id: string, action: CaseAction, comment: string) {
  const c = loadCase(id)
  if (!canSeeCase(u, c)) throw forbidden('Chinese wall: you cannot act on this case.')
  const s = snapshot(c)
  const r = transition(s, { id: u.id, roles: u.roles }, action, comment, routingCfg())
  if (!r.ok) throw bad(r.error)
  tx(() => {
    const patch: Row = { status: r.to, owner: r.owner, assigned_to: r.assignedTo, assigned_at: nowIso(), updated_at: nowIso() }
    for (const [k, v] of Object.entries(r.set)) if (k !== 'returnedInc') patch[k] = v
    if (r.set.returnedInc) patch.returned_count = (c.returned_count ?? 0) + 1
    if (r.routing) patch.routing_note = r.routing.explanation
    if (r.effects.some((e) => e.type === 'freeze')) Object.assign(patch, { frozen: 1, closed_at: nowIso() })
    if (r.effects.some((e) => e.type === 'unfreeze')) Object.assign(patch, { frozen: 0, closed_at: null, reopened_count: (c.reopened_count ?? 0) + 1 })
    update('cases', 'id', id, patch)
    let from: string = c.status
    for (const v of r.via ?? []) { audit(id, u.id, `${actionLabel(action)} (${v})`, from, v, comment); from = v }
    audit(id, u.id, actionLabel(action), from, r.to, r.routing ? `${comment}\n[Routing ${r.routing.rule.id}] ${r.routing.explanation}` : comment)
    if (action === 'reopen') run('UPDATE case_investigators SET done = 0 WHERE case_id = ?', id)
    for (const e of r.effects) if (e.type === 'email') sendEmail({ to: e.to, cc: u.email, subject: e.subject, body: `${e.subject}.\n\nCustomer: ${c.customer_name ?? '-'} (CIF ${c.cif ?? '-'})\nRisk: ${c.risk_l1 ?? '-'} / ${c.risk_l2 ?? '-'}\nComment: ${comment}`, relatedType: 'case', relatedId: id, template: e.template })
    if (r.effects.some((e) => e.type === 'post_tasks')) createPostTasks(id)
  })
  if (r.effects.some((e) => e.type === 'final_report')) await finalizeReport(u, id)
  return { ok: true, status: r.to, routing: r.routing ?? null }
}
const actionLabel = (a: CaseAction) => ({
  submit: 'Submitted to FO Checker', checker_approve: 'Checker approved', checker_reject: 'Checker rejected', checker_return: 'Returned to Maker',
  inv_return: 'Investigator returned to Maker', inv_approve_afs: 'Investigator approved Advance Fee Scam', inv_submit: 'Submitted to Reviewer',
  rev_return: 'Reviewer returned to Investigator', rev_approve_close: 'Reviewer approved and closed', rev_send_approver: 'Sent to Approver',
  app_return: 'Approver returned for rework', app_approve: 'Approver approved', wb_route: 'Routed to HR / Governance', wb_close: 'Whistleblower case closed', reopen: 'Case re-opened',
}[a])

/** FR-CASE-079/080/097: final report generated, emailed to stakeholders, email saved to the Evidence Vault, case frozen. */
export async function finalizeReport(u: User, id: string) {
  const full = getCaseFull(getUser('u-super') ?? u, id)
  const buf = await buildCaseReport(full)
  const ts = nowIso()
  const file = `${id}-final-report-${ts.replace(/[:.]/g, '-')}.docx`
  writeFileSync(join(UPLOAD_DIR, file), buf)
  tx(() => {
    insert('evidence', { case_id: id, folder: 'Final Report', name: `${id} Final Investigation Report.docx`, size: buf.length, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', path: file, source: 'System', uploaded_by: 'system', uploaded_at: ts })
    const subject = `Final investigation report: ${id}`
    sendEmail({ to: STAKEHOLDERS, cc: u.email, subject, body: `Please find attached the final report for case ${id} (${full.case.customer_name ?? ''}). The case is now closed and frozen.`, relatedType: 'case', relatedId: id, template: 'final_report' })
    insert('evidence', { case_id: id, folder: 'Emails', name: `Email - ${subject}.eml`, size: 0, mime: 'message/rfc822', path: null, source: 'System', uploaded_by: 'system', uploaded_at: ts })
    update('cases', 'id', id, { report_email_at: ts })
    audit(id, 'system', 'Final report generated and emailed', full.case.status, full.case.status, `Email date recorded: ${ts}`)
  })
}

export function deleteDraft(u: User, id: string) {
  const c = loadCase(id)
  if (c.status !== 'Draft') throw bad('Only draft cases can be deleted.')
  if ((c.returned_count ?? 0) > 0) throw bad('A case that has been returned cannot be deleted (FR-CASE-087).')
  if (c.created_by !== u.id && !hasRole(u, 'SUPER_USER')) throw forbidden('Only the creator can delete a draft.')
  tx(() => {
    for (const t of ['case_transactions', 'case_parties', 'checklist_items', 'activity_log', 'audit_trail', 'case_investigators']) run(`DELETE FROM ${t} WHERE case_id = ?`, id)
    run('UPDATE alerts SET case_id = NULL WHERE case_id = ?', id)
    run('DELETE FROM cases WHERE id = ?', id)
  })
  return { ok: true }
}

export function setDisabled(u: User, id: string, disabled: boolean, comment: string) {
  if (!hasRole(u, 'SUPER_USER')) throw forbidden('Only a super user can disable a case (FR-CASE-0134).')
  if (!comment?.trim()) throw bad('Comment required.')
  const c = loadCase(id)
  update('cases', 'id', id, { disabled: disabled ? 1 : 0 })
  audit(id, u.id, disabled ? 'Case disabled' : 'Case enabled', c.status, c.status, comment)
  return { ok: true }
}

// ---------- Transactions (FR-CASE-07..016) ----------
export function searchCaseTransactions(caseId: string, q: { account?: string; from?: string; to?: string }) {
  const c = loadCase(caseId)
  if (!c.cif) throw bad('Enter the customer CIF first.')
  const selected = new Set(all('SELECT txn_id FROM case_transactions WHERE case_id = ?', caseId).map((r) => r.txn_id))
  let sql = 'SELECT * FROM transactions WHERE cif = ?'
  const p: unknown[] = [c.cif]
  if (q.account) { sql += ' AND account = ?'; p.push(q.account) }
  if (q.from) { sql += ' AND date >= ?'; p.push(q.from) }
  if (q.to) { sql += ' AND date <= ?'; p.push(`${q.to}T23:59:59`) }
  return all(sql + ' ORDER BY date DESC LIMIT 300', ...p).filter((t) => !selected.has(t.id)) // FR-CASE-012
}
function addTxnRow(caseId: string, t: Row) {
  const rate = FX_TO_AED[t.currency] ?? 1 // frozen to the transaction date (FR-CASE-011)
  insert('case_transactions', {
    case_id: caseId, txn_id: t.id, date: t.date, account: t.account, currency: t.currency, amount: Math.abs(t.amount), fx_rate: rate,
    amount_aed: Math.round(Math.abs(t.amount) * rate * 100) / 100, type: t.type, channel: t.channel, instrument: t.channel === 'POS' ? 'Debit card' : 'Account',
    transfer_cat: t.iban?.startsWith('AE') ? 'Local' : 'International', product: 'Current account', beneficiary_account: t.iban, beneficiary_name: t.counterparty,
    counterparty_bank: t.iban?.startsWith('AE') ? 'UAE bank' : 'Foreign bank', country: t.iban?.slice(0, 2) ?? 'AE',
  })
}
export function addCaseTransactions(u: User, caseId: string, txnIds: string[]) {
  const c = loadCase(caseId)
  requireEdit(u, c)
  tx(() => {
    for (const tid of txnIds) {
      if (get('SELECT 1 FROM case_transactions WHERE case_id = ? AND txn_id = ?', caseId, tid)) throw bad(`Transaction ${tid} is already selected (FR-CASE-012).`)
      const t = get('SELECT * FROM transactions WHERE id = ? AND cif = ?', tid, c.cif)
      if (!t) throw bad(`Transaction ${tid} not found for this customer.`)
      addTxnRow(caseId, t)
    }
    audit(caseId, u.id, 'Edited', c.status, c.status, null, txnIds.map((t) => ({ field: 'transactions', from: null, to: t })))
  })
  return { ok: true }
}
export function updateCaseTransaction(u: User, caseId: string, rowId: number, patch: Row) {
  const c = loadCase(caseId); requireEdit(u, c)
  const allowed: Row = {}
  for (const k of ['beneficiary_account', 'beneficiary_name', 'counterparty_bank', 'country']) if (k in patch) allowed[k] = patch[k]
  update('case_transactions', 'id', rowId, allowed)
  return { ok: true }
}
export function removeCaseTransaction(u: User, caseId: string, rowId: number) {
  const c = loadCase(caseId); requireEdit(u, c)
  const t = get('SELECT * FROM case_transactions WHERE id = ? AND case_id = ?', rowId, caseId)
  run('DELETE FROM case_transactions WHERE id = ? AND case_id = ?', rowId, caseId)
  audit(caseId, u.id, 'Edited', c.status, c.status, null, [{ field: 'transactions', from: t?.txn_id, to: null }])
  return { ok: true }
}

// ---------- Parties (FR-CASE-021, 041) ----------
export function lookupParty(kind: string, ref: string) {
  if (kind === 'Customer') {
    const c = get('SELECT * FROM customers WHERE cif = ?', ref)
    if (!c) throw notFound(`CIF ${ref} not found`)
    return { name: c.name, details: customerDetails(c) }
  }
  if (kind === 'Staff') {
    const staff = getConfig<Row[]>('hrms', []).find((s) => s.staffId === ref)
    if (!staff) throw notFound(`Staff ID ${ref} not found in HRMS`)
    return { name: staff.name, details: staff }
  }
  throw bad('Third-party details are entered manually.')
}
export function addParty(u: User, caseId: string, p: { kind: string; ref: string; name?: string; details?: Row; suspect?: boolean; blacklist?: boolean }) {
  const c = loadCase(caseId); requireEdit(u, c)
  if (p.kind === 'Staff' && !isFpi(u) && !hasRole(u, 'HR', 'GOVERNANCE')) throw forbidden('Staff parties are recorded by FP&I / HR (FR-CASE-041).')
  let name = p.name ?? '', details = p.details ?? {}
  if (p.kind !== 'Third party') { const l = lookupParty(p.kind, p.ref); name = l.name; details = { ...l.details, ...details } }
  if (!name) throw bad('Name is required.')
  if (p.kind === 'Staff' && ['Suspended', 'Terminated', 'Resigned'].includes(details.status) && !details.statusDate) throw bad('Date is mandatory for Suspended, Terminated or Resigned staff.')
  insert('case_parties', { case_id: caseId, kind: p.kind, name, ref: p.ref, details: JSON.stringify(details), suspect: p.suspect ? 1 : 0, blacklist: p.blacklist ? 1 : 0, added_by: u.id })
  audit(caseId, u.id, 'Edited', c.status, c.status, null, [{ field: `parties.${p.kind}`, from: null, to: `${name} (${p.ref})` }])
  return { ok: true }
}
export function updateParty(u: User, caseId: string, partyId: number, patch: { suspect?: boolean; blacklist?: boolean; details?: Row }) {
  const c = loadCase(caseId); requireEdit(u, c)
  const p = get('SELECT * FROM case_parties WHERE id = ? AND case_id = ?', partyId, caseId)
  if (!p) throw notFound()
  const changes = []
  if (patch.suspect !== undefined && !!p.suspect !== patch.suspect) changes.push({ field: `parties.${p.name}.suspect`, from: !!p.suspect, to: patch.suspect })
  if (patch.blacklist !== undefined && !!p.blacklist !== patch.blacklist) changes.push({ field: `parties.${p.name}.blacklist`, from: !!p.blacklist, to: patch.blacklist })
  update('case_parties', 'id', partyId, {
    suspect: patch.suspect === undefined ? p.suspect : patch.suspect ? 1 : 0, blacklist: patch.blacklist === undefined ? p.blacklist : patch.blacklist ? 1 : 0,
    details: patch.details ? JSON.stringify({ ...json(p.details, {}), ...patch.details }) : p.details,
  })
  if (changes.length) audit(caseId, u.id, 'Edited', c.status, c.status, null, changes)
  return { ok: true }
}
export function removeParty(u: User, caseId: string, partyId: number) {
  const c = loadCase(caseId); requireEdit(u, c)
  run('DELETE FROM case_parties WHERE id = ? AND case_id = ?', partyId, caseId)
  return { ok: true }
}

// ---------- Checklist + activity diary (FR-CASE-046..055) ----------
export function generateChecklist(caseId: string, riskL1: string | null, assignee: string) {
  const map = getConfig<Record<string, number[]>>('checklistByCategory', {})
  const idx = map[riskL1 ?? ''] ?? map['*'] ?? [0, 1, 3, 5, 10]
  const target = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)
  idx.forEach((i, n) => insert('checklist_items', { id: `${caseId}-CL${String(n + 1).padStart(2, '0')}`, case_id: caseId, title: CHECKLIST_TEMPLATES[i], assigned_to: assignee, assigned_date: nowIso().slice(0, 10), target_date: target, status: 'Open', comments: '' }))
}
export function addChecklistItem(u: User, caseId: string, item: { title: string; assigned_to?: string; target_date?: string }) {
  const c = loadCase(caseId); requireEdit(u, c)
  const n = get<{ n: number }>('SELECT COUNT(*) n FROM checklist_items WHERE case_id = ?', caseId)!.n
  let id = `${caseId}-CL${String(n + 1).padStart(2, '0')}`
  while (get('SELECT 1 FROM checklist_items WHERE id = ?', id)) id += 'a' // FR-CASE-049 unique id
  insert('checklist_items', { id, case_id: caseId, title: item.title, assigned_to: item.assigned_to ?? u.id, assigned_date: nowIso().slice(0, 10), target_date: item.target_date ?? null, status: 'Open', comments: '' })
  return { id }
}
export function updateChecklistItem(u: User, caseId: string, itemId: string, patch: Row) {
  const c = loadCase(caseId); requireEdit(u, c)
  const allowed: Row = {}
  for (const k of ['title', 'assigned_to', 'target_date', 'status', 'comments']) if (k in patch) allowed[k] = patch[k]
  if ('target_date' in allowed) allowed.reminded = 0
  update('checklist_items', 'id', itemId, allowed)
  return { ok: true }
}
export function removeChecklistItem(u: User, caseId: string, itemId: string) {
  const c = loadCase(caseId); requireEdit(u, c)
  run('DELETE FROM checklist_items WHERE id = ? AND case_id = ?', itemId, caseId)
  return { ok: true }
}
export function addLog(u: User, caseId: string, l: { checklist_id?: string; date?: string; description: string; finding?: string; include_in_report?: boolean }) {
  const c = loadCase(caseId); requireEdit(u, c)
  if (!l.description?.trim()) throw bad('Log description is required.')
  insert('activity_log', { case_id: caseId, checklist_id: l.checklist_id ?? null, date: l.date ?? nowIso().slice(0, 10), description: l.description, finding: l.finding ?? '', include_in_report: l.include_in_report ? 1 : 0, actor: u.id, created_at: nowIso() })
  return { ok: true }
}
export function updateLog(u: User, caseId: string, logId: number, patch: { include_in_report?: boolean; finding?: string }) {
  const c = loadCase(caseId); requireEdit(u, c)
  const r = get('SELECT * FROM activity_log WHERE id = ? AND case_id = ?', logId, caseId)
  if (!r) throw notFound()
  update('activity_log', 'id', logId, { include_in_report: patch.include_in_report === undefined ? r.include_in_report : patch.include_in_report ? 1 : 0, finding: patch.finding ?? r.finding })
  return { ok: true }
}

// ---------- Evidence vault (FR-ALT-069..071, FR-CASE-023..025, 056, 057) ----------
export function addEvidence(u: User, target: { caseId?: string; alertId?: string }, e: { name: string; mime?: string; base64?: string; folder?: string; checklist_id?: string; maktabaRef?: string }) {
  if (target.caseId) { const c = loadCase(target.caseId); if (c.frozen) throw bad('Case is closed and frozen.') }
  let path: string | null = null, size = 0
  if (e.base64) {
    const buf = Buffer.from(e.base64, 'base64')
    size = buf.length
    path = `${Date.now()}-${e.name.replace(/[^\w.\-]+/g, '_')}`
    writeFileSync(join(UPLOAD_DIR, path), buf)
  }
  insert('evidence', {
    case_id: target.caseId ?? null, alert_id: target.alertId ?? null, folder: e.folder ?? 'General', name: e.maktabaRef ? `${e.name} [Maktaba ${e.maktabaRef}]` : e.name,
    size, mime: e.mime ?? 'application/octet-stream', path, checklist_id: e.checklist_id ?? null, source: e.maktabaRef ? 'Maktaba' : 'Upload', uploaded_by: u.id, uploaded_at: nowIso(),
  })
  return { ok: true }
}

// ---------- Joint investigation (FR-CASE-088..092) ----------
export function addCoInvestigator(u: User, caseId: string, userId: string, stage: 'INVESTIGATION' | 'REVIEW') {
  const c = loadCase(caseId)
  const leadField = stage === 'INVESTIGATION' ? c.investigator_id : c.reviewer_id
  if (leadField !== u.id) throw forbidden(`Only the lead ${stage === 'INVESTIGATION' ? 'investigator' : 'reviewer'} can add co-workers.`)
  const target = getUser(userId)
  const role = stage === 'INVESTIGATION' ? 'FPI_INVESTIGATOR' : 'FPI_REVIEWER'
  if (!target || !target.roles.includes(role)) throw bad(`User must be an ${role === 'FPI_INVESTIGATOR' ? 'FP&I Investigator' : 'FP&I Reviewer'}.`)
  if (stage === 'REVIEW' && (target.id === c.created_by || target.id === c.investigator_id || get("SELECT 1 FROM case_investigators WHERE case_id = ? AND user_id = ? AND stage = 'INVESTIGATION'", caseId, userId))) throw bad('Separation of duties: an investigator or creator cannot co-review this case.')
  run('INSERT OR IGNORE INTO case_investigators (case_id, user_id, stage, role, done) VALUES (?,?,?,?,0)', caseId, userId, stage, 'Co')
  audit(caseId, u.id, `Co-${stage === 'INVESTIGATION' ? 'investigator' : 'reviewer'} added: ${target.name}`, c.status, c.status, null)
  sendEmail({ to: target.email, subject: `You were added to joint ${stage.toLowerCase()} of case ${caseId}`, body: `${u.name} added you as co-${stage === 'INVESTIGATION' ? 'investigator' : 'reviewer'} on ${caseId}.`, relatedType: 'case', relatedId: caseId, template: 'joint_added' })
  return { ok: true }
}
export function markCoDone(u: User, caseId: string, stage: string, done: boolean) {
  const c = loadCase(caseId)
  const r = get("SELECT * FROM case_investigators WHERE case_id = ? AND user_id = ? AND stage = ? AND role = 'Co'", caseId, u.id, stage)
  if (!r) throw forbidden('You are not a co-worker on this case.')
  run('UPDATE case_investigators SET done = ? WHERE case_id = ? AND user_id = ? AND stage = ?', done ? 1 : 0, caseId, u.id, stage)
  audit(caseId, u.id, done ? `Co-${stage.toLowerCase()} finished` : `Co-${stage.toLowerCase()} re-opened own work`, c.status, c.status, null)
  return { ok: true }
}

// ---------- Post-completion tasks (FR-CASE-0118..0128) ----------
export function createPostTasks(caseId: string) {
  const c = loadCase(caseId)
  const d = caseData(c)
  if (get('SELECT 1 FROM post_tasks WHERE case_id = ? AND status <> ?', caseId, 'Cancelled')) return
  const fi = computeImpact(d.financialImpact)
  const reportable = getConfig<Record<string, { mis: boolean; oprisk: boolean }>>('reportableByCategory', {})[c.risk_l1 ?? ''] ?? { mis: true, oprisk: false }
  d.investigation.reportableMis ||= reportable.mis
  d.investigation.reportableOpRisk ||= reportable.oprisk
  update('cases', 'id', caseId, { data: JSON.stringify(d) })
  const rec = d.fpiRecommendation.category ? d.fpiRecommendation : d.recommendation
  const types: { type: string; team: string; details: Row }[] = []
  if (d.investigation.reportableOpRisk || (fi.net ?? 0) > 0)
    types.push({ type: 'Op Risk Event', team: 'Op Risk', details: { system: 'OpenPages', eventTitle: `${c.risk_l1} - ${c.risk_title ?? ''}`.trim(), grossLossAed: fi.gross, recoveryAed: fi.recovery, netLossAed: fi.net, businessUnit: d.investigation.unitBranch || c.segment, description: d.details.description } })
  if (rec.strRequired)
    types.push({ type: 'Central Bank STR', team: 'Compliance', details: { system: 'FIU goAML', subject: c.customer_name, cif: c.cif, amountAed: fi.successful, narrativeDraft: '' } })
  if (rec.type === 'Generic')
    types.push({ type: 'Generic Issue', team: 'Compliance', details: { system: 'OpenPages', issue: rec.issue, action: rec.action, category: rec.category, recommendation: rec.text } })
  if (rec.type === 'Non-Generic')
    types.push({ type: 'Non-Generic Issue', team: 'Business Unit', details: { system: 'OpenPages', issue: rec.issue, action: rec.action, category: rec.category, recommendation: rec.text } })
  const target = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
  types.forEach((t, i) => {
    insert('post_tasks', { id: `${caseId}-PT${i + 1}`, case_id: caseId, type: t.type, owner_team: t.team, assigned_to: null, status: 'Open', ref_id: null, ref_date: null, details: JSON.stringify(t.details), created_at: nowIso(), target_date: target })
    sendEmail({ to: `${t.team.toLowerCase().replace(/\s+/g, '.')}@auronova.example`, subject: `Post-completion task ${t.type} for case ${caseId}`, body: `A ${t.type} task has been allocated to ${t.team} for closed case ${caseId}. Target date ${target}.`, relatedType: 'case', relatedId: caseId, template: 'post_task' })
  })
  if (types.length) audit(caseId, 'system', `Post-completion tasks allocated: ${types.map((t) => t.type).join(', ')}`, c.status, c.status, null)
}
export function listPostTasks(u: User) {
  return all('SELECT p.*, c.customer_name, c.entity, c.type AS case_type FROM post_tasks p JOIN cases c ON c.id = p.case_id ORDER BY p.created_at DESC')
    .filter((t) => canSeeCase(u, { entity: t.entity, type: t.case_type }))
    .map((t) => ({ ...t, details: json(t.details, {}), assigned_name: userName(t.assigned_to) }))
}
export function updatePostTask(u: User, taskId: string, body: { action: 'push' | 'complete' | 'delegate' | 'save'; assigned_to?: string; ref_id?: string; ref_date?: string; details?: Row }) {
  const t = get('SELECT * FROM post_tasks WHERE id = ?', taskId)
  if (!t) throw notFound()
  if (t.status === 'Completed') throw bad('Task already completed.')
  const patch: Row = {}
  if (body.details) patch.details = JSON.stringify({ ...json(t.details, {}), ...body.details })
  if (body.action === 'delegate') { // FR-CASE-0126: tasks can be delegated
    const target = getUser(body.assigned_to)
    if (!target) throw bad('Choose a user to delegate to.')
    patch.assigned_to = target.id
    sendEmail({ to: target.email, subject: `Task ${taskId} delegated to you`, body: `${u.name} delegated post-completion task ${t.type} on case ${t.case_id}.`, relatedType: 'case', relatedId: t.case_id, template: 'task_delegated' })
  }
  if (body.action === 'push') { // simulated OpenPages / FIU interface returning a reference (FR-CASE-0120..0123)
    const prefix = t.type === 'Central Bank STR' ? 'FIU-STR' : t.type === 'Op Risk Event' ? 'OP-LE' : 'OP-ISS'
    patch.ref_id = `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`
    patch.ref_date = nowIso().slice(0, 10)
    patch.status = 'Submitted'
  }
  if (body.action === 'complete') {
    const ref = body.ref_id ?? t.ref_id, date = body.ref_date ?? t.ref_date
    if (!ref || !date) throw bad('Reference ID and date are required to complete the task.')
    Object.assign(patch, { ref_id: ref, ref_date: date, status: 'Completed', completed_at: nowIso() })
  }
  update('post_tasks', 'id', taskId, patch)
  insert('audit_trail', { case_id: t.case_id, ts: nowIso(), actor: u.id, action: `Post-completion task ${t.type}: ${body.action}`, from_status: null, to_status: null, comment: patch.ref_id ? `Ref ${patch.ref_id}` : null, changes: null })
  return { ok: true }
}

// ---------- Recovery maker-checker (FR-CASE-0150..0155) ----------
export function createRecovery(u: User, caseId: string, r: { amount: number; mode: string; date: string; comment: string; suspect?: boolean; blacklist?: boolean }) {
  const c = loadCase(caseId)
  if (!isClosedCase(c.status)) throw bad('Recovery workflow is for closed cases. Record recovery in the financial impact while the case is open.')
  if (!hasRole(u, 'FO_MAKER', 'FPI_INVESTIGATOR', 'SUPER_USER')) throw forbidden('Only a Fraud Ops Maker or FP&I Investigator can start a recovery entry.')
  if (!(Number(r.amount) > 0) || !r.mode || !r.date) throw bad('Amount, mode and date of recovery are required.')
  if (get("SELECT 1 FROM recoveries WHERE case_id = ? AND status = 'Pending'", caseId)) throw bad('A recovery entry is already pending checker approval.')
  insert('recoveries', { case_id: caseId, amount: Number(r.amount), mode: r.mode, date: r.date, comment: r.comment ?? '', suspect: r.suspect ? 1 : 0, blacklist: r.blacklist ? 1 : 0, status: 'Pending', maker_id: u.id, created_at: nowIso() })
  audit(caseId, u.id, 'Recovery entry submitted for checker approval', c.status, c.status, `AED ${r.amount} via ${r.mode}`)
  return { ok: true }
}
export function decideRecovery(u: User, caseId: string, recId: number, approve: boolean, comment: string) {
  const c = loadCase(caseId)
  const r = get('SELECT * FROM recoveries WHERE id = ? AND case_id = ?', recId, caseId)
  if (!r || r.status !== 'Pending') throw bad('No pending recovery entry.')
  if (r.maker_id === u.id) throw bad('Separation of duties: the maker of a recovery entry cannot approve it (FR-CASE-0153).')
  if (!hasRole(u, 'FO_CHECKER', 'FPI_REVIEWER', 'FPI_APPROVER', 'SUPER_USER')) throw forbidden('Only a checker can approve recovery entries.')
  tx(() => {
    update('recoveries', 'id', recId, { status: approve ? 'Approved' : 'Rejected', checker_id: u.id, decided_at: nowIso(), checker_comment: comment })
    if (approve) {
      const d = caseData(c)
      const before = computeImpact(d.financialImpact)
      const fi = computeImpact({ ...before, recovery: before.recovery + Number(r.amount) })
      if (fi.gross > 0 && fi.recovery > fi.gross) throw bad(`Recovery would exceed gross loss (AED ${fi.gross}) (FR-CASE-045).`)
      d.financialImpact = fi
      d.financialSummary.amountRecovered = Number(d.financialSummary.amountRecovered || 0) + Number(r.amount)
      update('cases', 'id', caseId, { data: JSON.stringify(d), updated_at: nowIso() })
      if (r.suspect || r.blacklist) run("UPDATE case_parties SET suspect = MAX(suspect, ?), blacklist = MAX(blacklist, ?) WHERE case_id = ? AND kind <> 'Customer'", r.suspect, r.blacklist, caseId)
      audit(caseId, u.id, 'Recovery approved: main case updated', c.status, c.status, comment, [{ field: 'financialImpact.recovery', from: before.recovery, to: fi.recovery }, { field: 'financialImpact.net', from: before.net, to: fi.net }])
    } else audit(caseId, u.id, 'Recovery entry rejected', c.status, c.status, comment)
  })
  return { ok: true }
}

// ---------- Sweeps: calendar reminders (FR-CASE-0158) ----------
export function sweepCases() {
  const days = getConfig<number>('reminderDays', 10)
  const horizon = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10)
  for (const i of all("SELECT * FROM checklist_items WHERE status = 'Open' AND reminded = 0 AND target_date IS NOT NULL AND target_date <= ?", horizon)) {
    const usr = getUser(i.assigned_to)
    sendEmail({ to: usr?.email ?? 'fpi.team@auronova.example', subject: `Reminder: checklist item ${i.id} due ${i.target_date}`, body: `"${i.title}" on case ${i.case_id} is due on ${i.target_date}.`, relatedType: 'case', relatedId: i.case_id, template: 'reminder' })
    run('UPDATE checklist_items SET reminded = 1 WHERE id = ?', i.id)
  }
  for (const t of all("SELECT * FROM post_tasks WHERE status <> 'Completed' AND reminded = 0 AND target_date <= ?", horizon)) {
    sendEmail({ to: `${String(t.owner_team).toLowerCase().replace(/\s+/g, '.')}@auronova.example`, subject: `Reminder: post-completion task ${t.id} due ${t.target_date}`, body: `${t.type} for case ${t.case_id} is due on ${t.target_date}.`, relatedType: 'case', relatedId: t.case_id, template: 'reminder' })
    run('UPDATE post_tasks SET reminded = 1 WHERE id = ?', t.id)
  }
}

export function calendar(u: User) {
  const visible = (caseId: string) => { const c = get('SELECT * FROM cases WHERE id = ?', caseId); return c && canSeeCase(u, c) }
  return [
    ...all("SELECT * FROM checklist_items WHERE target_date IS NOT NULL").filter((i) => visible(i.case_id)).map((i) => ({ date: i.target_date, kind: 'Checklist', title: i.title, ref: i.id, caseId: i.case_id, status: i.status, owner: userName(i.assigned_to) })),
    ...all('SELECT * FROM post_tasks WHERE target_date IS NOT NULL').filter((t) => visible(t.case_id)).map((t) => ({ date: t.target_date, kind: 'Post-completion', title: t.type, ref: t.id, caseId: t.case_id, status: t.status, owner: t.owner_team })),
    ...all("SELECT * FROM alerts WHERE status = 'Re-scheduled'").map((a) => ({ date: String(a.reschedule_until).slice(0, 10), kind: 'Re-scheduled alert', title: `${a.customer_name} - ${a.alert_type}`, ref: a.id, caseId: null, status: a.status, owner: null })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

export const caseStatusList = (): CaseStatus[] => [...new Set(all('SELECT status FROM cases').map((r) => r.status))] as CaseStatus[]
export const fpiUsers = () => listUsers().filter((x) => isFpi(x))
export type { Effect }
