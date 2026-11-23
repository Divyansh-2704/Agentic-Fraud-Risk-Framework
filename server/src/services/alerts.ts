// FAMS: alert ingestion, triage, workspace, actions, SLA (BRD section 4).
import type { User } from '../../../shared/src/index.js'
import { PRECAUTION_CATALOGUE, complexityToLevel } from '../../../shared/src/index.js'
import { all, get, getConfig, insert, json, nextId, nowIso, run, tx, update, type Row } from '../db.js'
import { alertTransition, slaMinutesFor, tatMs, type AlertAction, type AlertSnapshot } from '../workflow/alert.js'
import { AGE_BUCKETS, ageBucket, bad, canSeeAlert, forbidden, fuzzyMatch, getUser, hasRole, listUsers, MAILBOX, notFound, sendEmail, userName } from './common.js'

const MANDATORY_ALERT_FIELDS = ['alertDateTime', 'riskScore', 'category', 'scenarioId', 'ruleId', 'cif', 'accountNumber', 'alertType'] as const

export interface DspPayload {
  alertDateTime: string; riskScore: number; category: 'Prevention' | 'Detection'; mode?: 'Real Time' | 'T+1'
  scenarioId: string; scenarioDesc?: string; ruleId: string; ruleName?: string; ruleCondition?: string; decisionLayer?: string
  alertType: string; typology?: string; cif: string; accountNumber: string; txnAmount?: number; txnRef?: string
  alertOn?: string; alertedEntityType?: string; deviceId?: string; beneficiaryAccount?: string
  preventionColour?: 'Green' | 'Red' | 'Grey'; srType?: 'Financial' | 'Non-financial'
}

// ---------- Ingestion (FR-ALT-01..09) ----------
export async function ingestAlert(p: DspPayload, opts: { id?: string; now?: Date; skipAutoAllocate?: boolean } = {}) {
  const raw = JSON.stringify(p) // FR-ALT-05: immutable raw payload
  const dq: string[] = MANDATORY_ALERT_FIELDS.filter((k) => p[k] === undefined || p[k] === null || p[k] === '')
  const cust = await get('SELECT * FROM customers WHERE cif = ?', p.cif) // Feature Store enrichment
  if (!cust) dq.push('cif (not found in Feature Store)')
  const scenarioCfg = getConfig<Record<string, { dept?: string; complexity?: string }>>('scenarios', {})
  const sc = scenarioCfg[p.scenarioId] ?? {}
  const complexity = sc.complexity ?? (p.riskScore >= 80 ? 'High' : 'Medium') // FR-ALT-08
  const priority = p.category === 'Prevention' ? 'High' : p.riskScore >= 80 ? 'High' : p.riskScore >= 50 ? 'Medium' : 'Low'
  const dept = sc.dept ?? 'FRAUD_OPS' // FR-ALT-04 / 09
  const sla = getConfig<Record<string, number>>('slaMinutes')
  const created = p.alertDateTime ?? (opts.now ?? new Date()).toISOString()
  const slaDue = new Date(new Date(created).getTime() + slaMinutesFor(p.category, priority, sla) * 60_000).toISOString()
  const held = p.category === 'Prevention' && p.preventionColour === 'Grey' ? 1 : 0 // FR-ALT-051
  const id = opts.id ?? await nextId('ALT-', 'alerts')
  const accounts = json<string[]>(cust?.accounts, [])
  const balance = accounts.length ? (await get<{ balance: number }>('SELECT balance FROM transactions WHERE account = ? ORDER BY date DESC LIMIT 1', p.accountNumber))?.balance ?? null : null
  await tx(async () => {
    await insert('alerts', {
      id, created_at: created, category: p.category, mode: p.mode ?? (p.category === 'Prevention' ? 'Real Time' : 'T+1'),
      rule_id: p.ruleId, rule_name: p.ruleName ?? p.ruleId, scenario_id: p.scenarioId, scenario_desc: p.scenarioDesc ?? '',
      rule_condition: p.ruleCondition ?? '', decision_layer: p.decisionLayer ?? '', alert_type: p.alertType, typology: p.typology ?? p.alertType,
      risk_score: p.riskScore, priority, complexity, dept, entity: cust?.entity ?? 'Retail', cif: p.cif, customer_name: cust?.name ?? 'UNKNOWN',
      segment: cust?.segment ?? null, rm: cust?.rm ?? null, txn_amount: p.txnAmount ?? 0, available_balance: balance, account: p.accountNumber,
      txn_ref: p.txnRef ?? null, alert_on: p.alertOn ?? 'CUSTOMER ACCOUNT NUMBER', alerted_entity_type: p.alertedEntityType ?? 'VICTIM',
      device_id: p.deviceId ?? null, beneficiary_account: p.beneficiaryAccount ?? null, prevention_colour: p.preventionColour ?? null, held,
      status: held ? 'Hold' : 'Yet to start', group_key: p.cif, sla_due: slaDue, sr_type: p.srType ?? 'Financial',
      review_team: dept === 'FRAUD_OPS' ? 'Fraud Ops' : dept === 'GOVERNANCE' ? `${cust?.entity ?? 'Retail'} Governance` : 'HR',
      dq_exceptions: JSON.stringify(dq), raw_payload: raw,
    })
    // FR-ALT-021: pre-populate precautionary steps from the alert-type mapping
    const mapping = getConfig<Record<string, string[]>>('precautionMapping', {})
    for (const step of mapping[p.alertType] ?? mapping['*'] ?? []) {
      const def = PRECAUTION_CATALOGUE.find((s) => s.step === step)
      if (def) await insert('alert_actions', { alert_id: id, category: def.category, step: def.step, selected: 1, prefilled: 1, vals: '{}', updated_at: created })
    }
    await insert('alert_events', { alert_id: id, ts: created, actor: 'system', action: 'Ingested from DSP', from_status: null, to_status: held ? 'Hold' : 'Yet to start', comment: dq.length ? `Data quality exception: ${dq.join(', ')}` : `Triage: ${complexity} (${complexityToLevel(complexity as any)}), routed to ${dept}` })
    // FR-ALT-047/048 + FR-ALT-012: auto-allocation (always for prevention, configurable for detection)
    const auto = getConfig<{ prevention: boolean; detection: boolean }>('autoAllocate', { prevention: true, detection: false })
    if (!opts.skipAutoAllocate && ((p.category === 'Prevention' && auto.prevention) || (p.category === 'Detection' && auto.detection))) {
      const analyst = await leastLoadedAnalyst(dept, cust?.entity ?? 'Retail')
      if (analyst) {
        await update('alerts', 'id', id, { assigned_to: analyst, assigned_at: created, status: held ? 'Hold' : 'WIP' })
        await insert('alert_events', { alert_id: id, ts: created, actor: 'system', action: `Auto-allocated to ${userName(analyst)}`, from_status: null, to_status: held ? 'Hold' : 'WIP', comment: null })
      }
    }
  })
  return id
}

async function leastLoadedAnalyst(dept: string, entity: string) {
  const role = dept === 'FRAUD_OPS' ? 'FO_ANALYST' : dept === 'GOVERNANCE' ? 'GOVERNANCE' : 'HR'
  const candidates = listUsers().filter((u) => u.roles.includes(role as any) && u.entities.includes(entity as any))
  if (!candidates.length) return null
  const loads = await all<{ assigned_to: string; n: number }>("SELECT assigned_to, COUNT(*) AS n FROM alerts WHERE assigned_to IS NOT NULL AND status <> 'Closed' GROUP BY assigned_to")
  const load = (uid: string) => Number(loads.find((l) => l.assigned_to === uid)?.n ?? 0)
  return candidates.sort((a, b) => load(a.id) - load(b.id))[0].id
}

// ---------- Background sweep: re-schedules, SLA breaches, EDD ageing ----------
export async function sweepAlerts(now = new Date()) {
  const nowIsoStr = now.toISOString()
  for (const a of await all("SELECT * FROM alerts WHERE status = 'Re-scheduled' AND reschedule_until <= ?", nowIsoStr)) {
    const paused = a.paused_at ? now.getTime() - new Date(a.paused_at).getTime() : 0
    await update('alerts', 'id', a.id, { status: 'Yet to start', paused_ms: Number(a.paused_ms ?? 0) + paused, paused_at: null, reschedule_until: null })
    await insert('alert_events', { alert_id: a.id, ts: nowIsoStr, actor: 'system', action: 'Re-schedule date reached: back in queue', from_status: 'Re-scheduled', to_status: 'Yet to start', comment: null })
  }
  const sla = getConfig<Record<string, number>>('slaMinutes')
  for (const a of await all("SELECT * FROM alerts WHERE status <> 'Closed' AND category = 'Prevention' AND escalated = 0")) {
    if (tatMs(snap(a), now) > slaMinutesFor('Prevention', a.priority, sla) * 60_000) {
      // Claim the escalation atomically so two concurrent sweeps never email twice.
      const claimed = await run('UPDATE alerts SET escalated = 1 WHERE id = ? AND escalated = 0', a.id)
      if (!claimed.changes) continue
      const managers = listUsers().filter((u) => u.roles.includes('MANAGER')).map((u) => u.email).join('; ')
      await sendEmail({ to: managers, subject: `ESCALATION: prevention alert ${a.id} breached SLA`, body: `Prevention alert ${a.id} for ${a.customer_name} (CIF ${a.cif}), AED ${a.txn_amount}, has breached its SLA and is ${a.held ? 'still HELD' : 'open'}. Assigned to: ${userName(a.assigned_to) ?? 'unassigned'}. (FR-ALT-054 / FR-ALT-067)`, relatedType: 'alert', relatedId: a.id, template: 'prevention_sla_escalation' })
      await insert('alert_events', { alert_id: a.id, ts: nowIsoStr, actor: 'system', action: 'SLA breach escalated to Fraud Ops Manager', from_status: a.status, to_status: a.status, comment: null })
    }
  }
  const eddDays = getConfig<number>('eddAlertDays', 8)
  for (const a of await all("SELECT * FROM alerts WHERE status = 'EDD raised' AND edd_notified = 0 AND edd_raised_at <= ?", new Date(now.getTime() - eddDays * 86400_000).toISOString())) {
    const claimed = await run('UPDATE alerts SET edd_notified = 1 WHERE id = ? AND edd_notified = 0', a.id)
    if (!claimed.changes) continue
    await sendEmail({ to: MAILBOX.FRAUD_OPS, subject: `EDD open more than ${eddDays} days: ${a.id}`, body: `EDD SR ${a.edd_sr} on alert ${a.id} (${a.customer_name}) has not been closed within ${eddDays} days (FR-ALT-068).`, relatedType: 'alert', relatedId: a.id, template: 'edd_overdue' })
  }
}

/** FR-ALT-066: daily summary of SLA breaches to users, cc managers. */
export async function dailySlaSummary() {
  const breaches = (await all("SELECT * FROM alerts WHERE status <> 'Closed'")).map(alertDto).filter((a) => a.overdue)
  const managers = listUsers().filter((u) => u.roles.includes('MANAGER')).map((u) => u.email).join('; ')
  const byUser = new Map<string, any[]>()
  for (const b of breaches) { const k = b.assigned_to ?? 'unassigned'; byUser.set(k, [...(byUser.get(k) ?? []), b]) }
  for (const [uid, list] of byUser) {
    const u = getUser(uid)
    await sendEmail({ to: u?.email ?? MAILBOX.FRAUD_OPS, cc: managers, subject: `Daily SLA breach summary: ${list.length} overdue alert(s)`, body: list.map((b) => `${b.id} | ${b.customer_name} | ${b.priority} | overdue by ${Math.round(b.overdue_ms / 3600_000)}h`).join('\n'), relatedType: 'sla', template: 'daily_sla_summary' })
  }
  return { breaches: breaches.length, emails: byUser.size }
}

// ---------- DTOs ----------
export const snap = (a: Row): AlertSnapshot => ({
  id: a.id, category: a.category, dept: a.dept, status: a.status, assignedTo: a.assigned_to, rescheduleCount: Number(a.reschedule_count ?? 0),
  pausedAt: a.paused_at, pausedMs: Number(a.paused_ms ?? 0), createdAt: a.created_at, closedAt: a.closed_at,
})

export function alertDto(a: Row) {
  const sla = getConfig<Record<string, number>>('slaMinutes')
  const tat = tatMs(snap(a))
  const slaMs = slaMinutesFor(a.category, a.priority, sla) * 60_000
  const rest: Row = { ...a }
  delete rest.raw_payload
  return Object.assign(rest, {
    held: !!a.held, escalated: !!a.escalated, dq_exceptions: json<string[]>(a.dq_exceptions, []),
    assigned_name: userName(a.assigned_to), tat_ms: tat, sla_ms: slaMs, overdue: a.status !== 'Closed' && tat > slaMs,
    overdue_ms: Math.max(0, tat - slaMs), age_bucket: ageBucket(tat), level: complexityToLevel(a.complexity),
  })
}
export type AlertDto = ReturnType<typeof alertDto>

// ---------- Landing page list + KPIs (FR-LP-03..017) ----------
export interface AlertFilters { tab?: string; scope?: string; q?: string; status?: string; priority?: string; assigned?: string; age?: string; srType?: string; category?: string; mine?: string; dept?: string; kpi?: string }

export async function listAlerts(u: User, f: AlertFilters) {
  await sweepAlerts()
  const archiveDays = getConfig<number>('archiveDays', 90)
  const rows = (await all('SELECT * FROM alerts ORDER BY created_at DESC, id DESC')).filter((a) => canSeeAlert(u, a)).map(alertDto)
  const scopeRows = rows.filter((a) => (f.scope === 'history' ? a.status === 'Closed' : a.status !== 'Closed'))
  let list = scopeRows
  if (f.tab === 'realtime') list = list.filter((a) => a.mode === 'Real Time')
  if (f.tab === 't1') list = list.filter((a) => a.mode === 'T+1')
  if (f.category) list = list.filter((a) => a.category === f.category)
  if (f.dept) list = list.filter((a) => a.dept === f.dept)
  if (f.mine === '1') list = list.filter((a) => a.assigned_to === u.id)
  const kpiBase = list
  if (f.status) list = list.filter((a) => a.status === f.status)
  if (f.priority) list = list.filter((a) => a.priority === f.priority)
  if (f.assigned === 'yes') list = list.filter((a) => a.assigned_to)
  if (f.assigned === 'no') list = list.filter((a) => !a.assigned_to)
  if (f.age) list = list.filter((a) => a.age_bucket === f.age)
  if (f.srType) list = list.filter((a) => a.sr_type === f.srType)
  if (f.q) {
    const ids = await customerIds()
    list = list.filter((a) => fuzzyMatch(f.q!, a.id, a.cif, a.customer_name, a.rule_id, a.rule_name, a.alert_type, a.status, a.assigned_name, a.edd_sr, a.sr_status, a.account, a.typology, ...(ids.get(a.cif) ?? [])))
  }
  // Prevention first (FR-ALT-047), then overdue, then score
  list.sort((a, b) => (a.category === b.category ? 0 : a.category === 'Prevention' ? -1 : 1) || Number(b.overdue) - Number(a.overdue) || b.risk_score - a.risk_score)
  const count = <T extends string>(keys: T[], fn: (a: AlertDto) => string | null | undefined) => Object.fromEntries(keys.map((k) => [k, kpiBase.filter((a) => fn(a) === k).length]))
  const kpis = {
    assignment: { Assigned: kpiBase.filter((a) => a.assigned_to).length, Unassigned: kpiBase.filter((a) => !a.assigned_to).length },
    status: count([...new Set(kpiBase.map((a) => a.status))], (a) => a.status),
    priority: count(['High', 'Medium', 'Low'], (a) => a.priority),
    age: count(AGE_BUCKETS, (a) => a.age_bucket),
    srType: count(['Financial', 'Non-financial'], (a) => a.sr_type),
    overdue: kpiBase.filter((a) => a.overdue).length,
  }
  return { rows: list.map((a) => ({ ...a, archived: f.scope === 'history' && a.closed_at && Date.now() - new Date(a.closed_at).getTime() > archiveDays * 86400_000 })), kpis, total: scopeRows.length }
}
/** CIF -> [Emirates ID, passport, trade licence], for fuzzy search on customer identifiers. */
export async function customerIds() {
  const rows = await all<{ cif: string; eid: string; passport: string; tl: string }>('SELECT cif, eid, passport, tl FROM customers')
  return new Map(rows.map((c) => [c.cif, [c.eid, c.passport, c.tl]]))
}

// ---------- Workspace (FR-ALT-014..018) ----------
export async function alertWorkspace(u: User, id: string) {
  await sweepAlerts()
  const a = await get('SELECT * FROM alerts WHERE id = ?', id)
  if (!a) throw notFound('Alert not found')
  if (!canSeeAlert(u, a)) throw forbidden('Chinese wall: you cannot view this alert.')
  const histN = getConfig<number>('historyAlerts', 5)
  const months = getConfig<number>('txnMonths', 3)
  const cust = await get('SELECT * FROM customers WHERE cif = ?', a.cif)
  const linked = json<string[]>(cust?.linked_cifs, [])
  const since = new Date(Date.now() - months * 30 * 86400_000).toISOString()
  const otherAccounts: { cif: string; name: string; account: string; entity: string }[] = []
  for (const cif of [a.cif, ...linked]) {
    const c = await get('SELECT * FROM customers WHERE cif = ?', cif)
    if (c) otherAccounts.push(...json<string[]>(c.accounts, []).map((acc) => ({ cif, name: c.name, account: acc, entity: c.entity })))
  }
  return {
    alert: alertDto(a),
    rawPayload: json(a.raw_payload, {}),
    customer: cust ? { ...cust, accounts: json(cust.accounts, []), cards: json(cust.cards, []), linked_cifs: linked } : null,
    otherAccounts,
    history: (await all('SELECT * FROM alerts WHERE cif = ? AND id <> ? ORDER BY created_at DESC LIMIT ?', a.cif, a.id, histN)).map(alertDto),
    sameCustomerOpen: (await all("SELECT * FROM alerts WHERE cif = ? AND id <> ? AND status <> 'Closed' ORDER BY created_at", a.cif, a.id)).map(alertDto),
    transactions: await all('SELECT * FROM transactions WHERE cif = ? AND date >= ? ORDER BY date DESC', a.cif, since),
    actions: (await all('SELECT * FROM alert_actions WHERE alert_id = ? ORDER BY id', id)).map((r) => ({ ...r, selected: !!r.selected, prefilled: !!r.prefilled, vals: json(r.vals, {}) })),
    events: (await all('SELECT * FROM alert_events WHERE alert_id = ? ORDER BY ts DESC, id DESC', id)).map((e) => ({ ...e, actor_name: userName(e.actor) ?? e.actor })),
    emails: await all("SELECT * FROM outbox WHERE related_type = 'alert' AND related_id = ? ORDER BY ts DESC, id DESC", id),
    evidence: await all('SELECT * FROM evidence WHERE alert_id = ? ORDER BY uploaded_at DESC', id),
    analysts: listUsers().filter((x) => x.dept === u.dept && x.id !== u.id).map((x) => ({ id: x.id, name: x.name })),
  }
}

// ---------- Actions ----------
export async function alertAct(u: User, id: string, body: any): Promise<{ results: { id: string; status: string }[]; refused?: string }> {
  const a = await get('SELECT * FROM alerts WHERE id = ?', id)
  if (!a) throw notFound('Alert not found')
  if (!canSeeAlert(u, a)) throw forbidden('Chinese wall: you cannot act on this alert.')
  const cfg = { maxReschedules: getConfig<number>('maxReschedules', 3), rescheduleHours: getConfig<number>('rescheduleHours', 24) }
  let action: AlertAction
  switch (body.kind) {
    case 'edd': action = { kind: 'edd', crmAvailable: !String(a.cif).startsWith('NEW') }; break
    case 'reassign': {
      const target = getUser(body.toUserId)
      if (!target) throw bad('Unknown user')
      action = { kind: 'reassign', toUserId: target.id, toUserDept: target.dept, toUserName: target.name }; break
    }
    case 'refer_fpi': action = { kind: 'refer_fpi', note: String(body.note ?? '') }; break
    case 'fpi_response': action = { kind: 'fpi_response', response: String(body.response ?? ''), backTo: body.backTo === 'queue' ? 'queue' : 'sender' }; break
    case 'edd_response': action = { kind: 'edd_response', response: String(body.response ?? 'EDD completed by business: no adverse findings.') }; break
    case 'decide': action = { kind: 'decide', decision: body.decision, subClass: body.subClass, rationale: String(body.rationale ?? '') }; break
    case 'prevention_decide': action = { kind: 'prevention_decide', decision: body.decision, reason: body.reason, description: String(body.description ?? '') }; break
    default: action = { kind: body.kind }
  }
  // FR-ALT-025: CRM refusing the EDD SR is an expected business outcome, not a client error. It is logged on the alert
  // and returned as a handled refusal (HTTP 200 with "refused"), which the UI shows as an error toast.
  if (action.kind === 'edd' && !action.crmAvailable) {
    const pre = alertTransition(snap(a), { id: u.id, roles: u.roles, dept: u.dept }, action, cfg, new Date(nowIso()))
    if (!pre.ok && /Siebel CRM/.test(pre.error)) {
      await insert('alert_events', { alert_id: id, ts: nowIso(), actor: u.id, action: 'EDD SR refused by CRM (CIF not in Siebel)', from_status: a.status, to_status: a.status, comment: null })
      return { results: [], refused: pre.error }
    }
  }
  // FR-ALT-011: one decision can cover several alerts of the same customer
  const ids: string[] = [id, ...((body.alsoIds as string[] | undefined) ?? [])]
  const results: { id: string; status: string }[] = []
  await tx(async () => {
    for (const aid of ids) {
      const row = aid === id ? a : await get('SELECT * FROM alerts WHERE id = ?', aid)
      if (!row) throw notFound(`Alert ${aid} not found`)
      if (row.cif !== a.cif) throw bad('Multi-alert decision is only allowed for the same customer (FR-ALT-011).')
      // Bulk alerts are claimed implicitly by the analyst taking the decision
      const s = snap(row)
      if (aid !== id && !s.assignedTo) { s.assignedTo = u.id; if (s.status === 'Yet to start') s.status = 'WIP' }
      const r = alertTransition(s, { id: u.id, roles: u.roles, dept: u.dept }, action, cfg, new Date(nowIso()))
      if (!r.ok) throw bad(aid === id ? r.error : `${aid}: ${r.error}`)
      const patch: Row = { ...r.patch, status: r.to, assigned_to: r.assignedTo }
      if (action.kind === 'edd') { patch.edd_sr = `SR-${Math.floor(1e7 + Math.random() * 9e7)}` }
      await update('alerts', 'id', aid, patch)
      await insert('alert_events', { alert_id: aid, ts: nowIso(), actor: u.id, action: r.event, from_status: row.status, to_status: r.to, comment: body.comment ?? body.note ?? body.rationale ?? body.description ?? body.response ?? null })
      await sideEffects(u, row, action, patch)
      results.push({ id: aid, status: r.to })
    }
  })
  return { results }
}

async function sideEffects(u: User, a: Row, action: AlertAction, patch: Row) {
  const base = `Alert ${a.id} | ${a.customer_name} (CIF ${a.cif}) | ${a.alert_type} | AED ${a.txn_amount}`
  if (action.kind === 'refer_fpi') await sendEmail({ to: MAILBOX.FPI, cc: u.email, subject: `Alert referral for feedback: ${a.id}`, body: `${base}\n\n${action.note}`, relatedType: 'alert', relatedId: a.id, template: 'refer_fpi' }) // FR-ALT-060
  if (action.kind === 'fpi_response') await sendEmail({ to: getUser(a.assigned_to)?.email ?? MAILBOX.FRAUD_OPS, subject: `FP&I responded on ${a.id}`, body: `${base}\n\n${action.response}`, relatedType: 'alert', relatedId: a.id, template: 'fpi_response' }) // FR-ALT-061
  if (action.kind === 'edd') {
    await insert('alert_actions', { alert_id: a.id, category: 'EDD', step: 'EDD SR Raised', selected: 1, prefilled: 0, vals: JSON.stringify({ 'SR reference': patch.edd_sr, Date: nowIso().slice(0, 10) }), updated_at: nowIso() })
  }
  if (action.kind === 'decide' || action.kind === 'prevention_decide') {
    // FR-ALT-043: decision interfaced back to DSP and CRM
    await insert('alert_events', { alert_id: a.id, ts: nowIso(), actor: 'system', action: 'Decision sent to DSP + CRM', from_status: 'Closed', to_status: 'Closed', comment: `${patch.decision} / ${patch.sub_class}` })
  }
}

export async function updatePrecautions(u: User, id: string, steps: { id?: number; category: string; step: string; selected: boolean; vals: Record<string, string> }[]) {
  const a = await get('SELECT * FROM alerts WHERE id = ?', id)
  if (!a) throw notFound()
  if (a.assigned_to !== u.id) throw forbidden('Only the assigned analyst can record precautionary steps.')
  if (a.status === 'Closed') throw bad('Alert is closed.')
  await tx(async () => {
    for (const s of steps) {
      if (s.id) await run('UPDATE alert_actions SET selected = ?, vals = ?, updated_at = ? WHERE id = ? AND alert_id = ?', s.selected ? 1 : 0, JSON.stringify(s.vals ?? {}), nowIso(), s.id, id)
      else await insert('alert_actions', { alert_id: id, category: s.category, step: s.step, selected: s.selected ? 1 : 0, prefilled: 0, vals: JSON.stringify(s.vals ?? {}), updated_at: nowIso() })
    }
  })
  return { ok: true }
}

export async function updateAlertFields(u: User, id: string, body: any) {
  const a = await get('SELECT * FROM alerts WHERE id = ?', id)
  if (!a) throw notFound()
  if (a.assigned_to !== u.id && !hasRole(u, 'SUPER_USER')) throw forbidden('Only the assigned analyst can edit this alert.')
  const patch: Row = {}
  for (const k of ['notes', 'ref_ids', 'potential_savings', 'linked_account']) if (k in body) patch[k] = body[k]
  if ('potential_savings' in patch) { const n = Number(patch.potential_savings); patch.potential_savings = patch.potential_savings === '' || patch.potential_savings === null || Number.isNaN(n) ? null : n }
  await update('alerts', 'id', id, patch)
  return { ok: true }
}

/** FR-LP-014 / FR-ALT-013: assign one or many alerts (self-assign or super-user assignment). */
export async function assignAlerts(u: User, ids: string[], toUserId?: string) {
  const target = toUserId ? getUser(toUserId) : u
  if (!target) throw bad('Unknown user')
  if (toUserId && toUserId !== u.id && !hasRole(u, 'SUPER_USER', 'MANAGER')) throw forbidden('Only a manager or super user can assign alerts to others.')
  const out: string[] = []
  await tx(async () => {
    for (const id of ids) {
      const a = await get('SELECT * FROM alerts WHERE id = ?', id)
      if (!a || !canSeeAlert(target, a)) continue
      const r = alertTransition({ ...snap(a), assignedTo: a.assigned_to === u.id || hasRole(u, 'SUPER_USER', 'MANAGER') ? null : a.assigned_to }, { id: target.id, roles: target.roles, dept: target.dept }, { kind: 'claim' }, { maxReschedules: 3, rescheduleHours: 24 })
      if (!r.ok) { if (ids.length === 1) throw bad(r.error); continue }
      await update('alerts', 'id', id, { status: r.to, assigned_to: target.id, assigned_at: nowIso() })
      await insert('alert_events', { alert_id: id, ts: nowIso(), actor: u.id, action: target.id === u.id ? 'Picked from queue' : `Assigned to ${target.name}`, from_status: a.status, to_status: r.to, comment: null })
      out.push(id)
    }
  })
  return { assigned: out }
}

// ---------- Email templates (FR-ALT-056..059) ----------
export const ALERT_EMAIL_TEMPLATES: Record<string, { to: string; subject: string; step: string }> = {
  edd_ei_linked: { to: 'islamic.edd@auronova.example', subject: 'EDD request: Islamic linked account', step: 'EDD Email Sent for Islamic Linked Account' },
  edd_ei_beneficiary: { to: 'islamic.edd@auronova.example', subject: 'EDD request: Islamic beneficiary account', step: 'EDD Email Sent for Islamic Beneficiary Account' },
  edd_sr_bu: { to: 'business.unit@auronova.example', subject: 'EDD SR raised: action requested', step: 'EDD SR Email Sent to Business Unit' },
  cards_business: { to: 'cards.business@auronova.example', subject: 'Fraud alert: cards business informed', step: 'Cards Business Informed' },
  business_notified: { to: 'business.unit@auronova.example', subject: 'Fraud alert notification', step: 'Business Notified' },
  fpi_notified: { to: MAILBOX.FPI, subject: 'Fraud alert: FP&I notified', step: 'FP&I Notified' },
}
export async function sendAlertEmail(u: User, id: string, template: string) {
  const a = await get('SELECT * FROM alerts WHERE id = ?', id)
  const t = ALERT_EMAIL_TEMPLATES[template]
  if (!a || !t) throw notFound()
  if (a.assigned_to !== u.id) throw forbidden('Only the assigned analyst can send emails from this alert.')
  const body = `Dear Team,\n\nPlease note the following fraud alert requiring your attention.\n\nAlert ID: ${a.id}\nCustomer: ${a.customer_name} (CIF ${a.cif})\nAccount: ${a.account}\nTransaction ref: ${a.txn_ref ?? '-'}\nAmount: AED ${a.txn_amount}\nAlert type: ${a.alert_type}\nRule: ${a.rule_id} ${a.rule_name}\n\nRegards,\n${u.name}\nFraud Operations`
  await sendEmail({ to: t.to, cc: u.email, subject: `${t.subject}: ${a.id}`, body, relatedType: 'alert', relatedId: id, template })
  const def = PRECAUTION_CATALOGUE.find((s) => s.step === t.step)!
  const existing = await get('SELECT id FROM alert_actions WHERE alert_id = ? AND step = ? ORDER BY id LIMIT 1', id, t.step)
  const vals = JSON.stringify({ Date: nowIso().slice(0, 10) })
  if (existing) await run('UPDATE alert_actions SET selected = 1, vals = ?, updated_at = ? WHERE id = ?', vals, nowIso(), existing.id)
  else await insert('alert_actions', { alert_id: id, category: def.category, step: def.step, selected: 1, prefilled: 0, vals, updated_at: nowIso() })
  await insert('alert_events', { alert_id: id, ts: nowIso(), actor: u.id, action: `Email sent: ${t.subject}`, from_status: a.status, to_status: a.status, comment: t.to })
  return { ok: true }
}
