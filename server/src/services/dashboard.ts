// Reports and dashboards (FR-CASE-0138..0149, FR-ALT-055) + live counts for the Process Map.
import type { User } from '../../../shared/src/index.js'
import { isClosedCase } from '../../../shared/src/index.js'
import { all, getConfig, json, type Row } from '../db.js'
import { computeImpact } from '../workflow/financial.js'
import { alertDto, sweepAlerts } from './alerts.js'
import { canSeeAlert, canSeeCase, listUsers, userName } from './common.js'

/** Business-time between two instants: excludes UAE weekend (Sat/Sun) and configured holidays (FR-CASE-0142). */
export function businessMs(startIso: string, endIso: string, holidays: string[]) {
  const start = new Date(startIso).getTime(), end = new Date(endIso).getTime()
  if (end <= start) return 0
  const hol = new Set(holidays)
  let total = 0
  let t = start
  while (t < end) {
    const d = new Date(t)
    const dayEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
    const segEnd = Math.min(dayEnd, end)
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6 && !hol.has(d.toISOString().slice(0, 10))) total += segEnd - t
    t = segEnd
  }
  return total
}

export interface DashFilters { from?: string; to?: string; entity?: string; user?: string }

export async function dashboard(u: User, f: DashFilters) {
  await sweepAlerts()
  const inRange = (iso: string) => (!f.from || iso >= f.from) && (!f.to || iso <= `${f.to}T23:59:59`)
  const alerts = (await all('SELECT * FROM alerts')).filter((a) => canSeeAlert(u, a) && inRange(a.created_at) && (!f.entity || a.entity === f.entity) && (!f.user || a.assigned_to === f.user)).map(alertDto)
  const cases = (await all('SELECT * FROM cases')).filter((c) => canSeeCase(u, c) && inRange(c.created_at) && (!f.entity || c.entity === f.entity) && (!f.user || c.assigned_to === f.user))
  const holidays = getConfig<string[]>('holidays', [])
  const group = <T,>(rows: T[], key: (r: T) => string) => Object.entries(rows.reduce((m: Record<string, number>, r) => { const k = key(r) ?? '-'; m[k] = (m[k] ?? 0) + 1; return m }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

  // TAT per stage and per actor from the audit trail (FR-CASE-0141)
  const caseIds = new Set(cases.map((c) => c.id))
  const events = new Map<string, Row[]>()
  for (const e of await all('SELECT * FROM audit_trail WHERE to_status IS NOT NULL AND from_status IS NOT NULL AND from_status <> to_status ORDER BY ts, id')) {
    if (caseIds.has(e.case_id)) events.set(e.case_id, [...(events.get(e.case_id) ?? []), e])
  }
  const stageDur: Record<string, number[]> = {}, actorDur: Record<string, number[]> = {}
  for (const c of cases) {
    let prevTs = c.created_at
    for (const e of events.get(c.id) ?? []) {
      const ms = businessMs(prevTs, e.ts, holidays)
      ;(stageDur[e.from_status] ??= []).push(ms)
      const who = userName(e.actor) ?? e.actor
      ;(actorDur[who] ??= []).push(ms)
      prevTs = e.ts
    }
  }
  const avgH = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length) / 3600_000) * 10) / 10
  const closedAlerts = alerts.filter((a) => a.status === 'Closed')

  // Rule precision: feedback to DSP (scope 1.3; agent #11 will narrate this later).
  // "Last 7 days" and "last decision" show how recent decisions moved each rule's numbers.
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
  const byRule: Record<string, { rule: string; name: string; closed: number; fraud: number; fp: number; closed7d: number; fp7d: number; lastDecisionAt: string | null }> = {}
  for (const a of closedAlerts) {
    const r = (byRule[a.rule_id] ??= { rule: a.rule_id, name: a.rule_name, closed: 0, fraud: 0, fp: 0, closed7d: 0, fp7d: 0, lastDecisionAt: null })
    const isFraud = a.decision === 'Confirmed Fraud' || a.decision === 'Reject'
    r.closed++
    if (isFraud) r.fraud++; else r.fp++
    if (a.closed_at && a.closed_at >= weekAgo) { r.closed7d++; if (!isFraud) r.fp7d++ }
    if (a.closed_at && (!r.lastDecisionAt || a.closed_at > r.lastDecisionAt)) r.lastDecisionAt = a.closed_at
  }
  const days = 14
  const trend = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86400_000).toISOString().slice(0, 10)
    return { date: d.slice(5), detection: alerts.filter((a) => a.created_at.startsWith(d) && a.category === 'Detection').length, prevention: alerts.filter((a) => a.created_at.startsWith(d) && a.category === 'Prevention').length }
  })
  const fiTotals = cases.reduce((t, c) => {
    const fi = computeImpact(json<any>(c.data, {}).financialImpact ?? {})
    t.attempted += fi.attempted; t.successful += fi.successful; t.gross += fi.gross; t.recovery += fi.recovery; t.net += fi.net ?? 0
    return t
  }, { attempted: 0, successful: 0, gross: 0, recovery: 0, net: 0 })
  const prevention = alerts.filter((a) => a.category === 'Prevention')

  return {
    kpis: {
      openAlerts: alerts.filter((a) => a.status !== 'Closed').length,
      overdueAlerts: alerts.filter((a) => a.overdue).length,
      heldTxns: prevention.filter((a) => a.held && a.status !== 'Closed').length,
      openCases: cases.filter((c) => !isClosedCase(c.status)).length,
      closedCases: cases.filter((c) => isClosedCase(c.status)).length,
      fpRate: closedAlerts.length ? Math.round((closedAlerts.filter((a) => a.decision === 'False Positive' || a.decision === 'Approve').length / closedAlerts.length) * 100) : 0,
      netLossAed: Math.round(fiTotals.net), recoveredAed: Math.round(fiTotals.recovery),
      avgAlertTatH: avgH(closedAlerts.map((a) => a.tat_ms)),
    },
    alertsByStatus: group(alerts, (a) => a.status),
    alertsByType: group(alerts, (a) => a.alert_type),
    alertsByDept: group(alerts, (a) => a.dept),
    casesByStatus: group(cases, (c) => c.status),
    casesByRisk: group(cases, (c) => c.risk_l1 ?? 'Unclassified'),
    tatByStage: Object.entries(stageDur).map(([stage, xs]) => ({ stage, avgHours: avgH(xs), count: xs.length })).sort((a, b) => b.avgHours - a.avgHours),
    tatByActor: Object.entries(actorDur).map(([actor, xs]) => ({ actor, avgHours: avgH(xs), actions: xs.length })).sort((a, b) => b.actions - a.actions),
    rulePrecision: Object.values(byRule).map((r) => ({ ...r, precision: Math.round((r.fraud / r.closed) * 100) })).sort((a, b) => a.precision - b.precision || a.rule.localeCompare(b.rule)),
    trend,
    financial: fiTotals,
    workload: listUsers().map((x) => ({ user: x.name, alerts: alerts.filter((a) => a.assigned_to === x.id && a.status !== 'Closed').length, cases: cases.filter((c) => c.assigned_to === x.id && !isClosedCase(c.status)).length })).filter((w) => w.alerts + w.cases > 0),
    preventionMi: {
      colour: group(prevention, (a) => a.prevention_colour ?? '-'),
      held: prevention.filter((a) => a.held && a.status !== 'Closed').length,
      breached: prevention.filter((a) => a.overdue || a.escalated).length,
      decided: group(prevention.filter((a) => a.status === 'Closed'), (a) => a.decision ?? '-'),
      avgDecisionMin: Math.round(prevention.filter((a) => a.status === 'Closed').reduce((s, a) => s + a.tat_ms, 0) / Math.max(1, prevention.filter((a) => a.status === 'Closed').length) / 60000),
    },
    overdueList: alerts.filter((a) => a.overdue).slice(0, 15).map((a) => ({ id: a.id, customer: a.customer_name, priority: a.priority, category: a.category, overdueH: Math.round(a.overdue_ms / 3600_000), assigned: a.assigned_name })),
  }
}

/** Live counts for each station of the Big Picture flowchart (Sheet 1). */
export async function processCounts(u: User) {
  await sweepAlerts()
  const alerts = (await all('SELECT * FROM alerts')).filter((a) => canSeeAlert(u, a))
  const cases = (await all('SELECT * FROM cases')).filter((c) => canSeeCase(u, c) && c.type === 'STANDARD')
  const n = (fn: (r: any) => boolean, rows: any[]) => rows.filter(fn).length
  return {
    ingested: alerts.length,
    queue: n((a) => a.status === 'Yet to start' || (a.status === 'Hold' && !a.assigned_to), alerts),
    working: n((a) => ['WIP', 'EDD raised', 'EDD responded', 'Referred to FP&I', 'Re-scheduled'].includes(a.status) || (a.status === 'Hold' && a.assigned_to), alerts),
    closedAlerts: n((a) => a.status === 'Closed', alerts),
    falsePositive: n((a) => a.decision === 'False Positive' || a.decision === 'Approve', alerts),
    confirmed: n((a) => a.decision === 'Confirmed Fraud' || a.decision === 'Reject', alerts),
    maker: n((c) => c.owner === 'FO_MAKER', cases),
    checker: n((c) => c.owner === 'FO_CHECKER', cases),
    investigator: n((c) => c.owner === 'FPI_INVESTIGATOR', cases),
    reviewer: n((c) => c.owner === 'FPI_REVIEWER', cases),
    approver: n((c) => c.owner === 'FPI_APPROVER', cases),
    closedByRule: n((c) => c.status === 'Approved and Closed (FO)' || c.status === 'Reject', cases),
    closedFinal: n((c) => c.status === 'Final report generated and closed', cases),
    postTasks: Number((await all("SELECT COUNT(*) AS n FROM post_tasks WHERE status <> 'Completed'"))[0].n),
    whistleblower: Number((await all("SELECT COUNT(*) AS n FROM cases WHERE type = 'WHISTLEBLOWER' AND status <> 'Closed'"))[0].n),
  }
}
