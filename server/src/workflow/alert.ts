// Alert state machine (Sheets 2 and 3 of the agentic flow workbook; BRD 4.4-4.8). Pure functions.
import type { AlertStatus, Role } from '../../../shared/src/index.js'
import { ALERT_SUBCLASS, PREVENTION_DECISIONS } from '../../../shared/src/index.js'

export interface AlertSnapshot {
  id: string
  category: 'Prevention' | 'Detection'
  dept: 'FRAUD_OPS' | 'GOVERNANCE' | 'HR'
  status: AlertStatus
  assignedTo: string | null
  rescheduleCount: number
  pausedAt: string | null
  pausedMs: number
  createdAt: string
  closedAt: string | null
}
export interface Actor { id: string; roles: Role[]; dept: string }
export interface AlertConfig { maxReschedules: number; rescheduleHours: number }

export type AlertAction =
  | { kind: 'claim' }
  | { kind: 'edd'; crmAvailable: boolean }
  | { kind: 'edd_response'; response: string }
  | { kind: 'sendback' }
  | { kind: 'reschedule' }
  | { kind: 'requeue' } // manually move a rescheduled alert back (FR-ALT-032)
  | { kind: 'reassign'; toUserId: string; toUserDept: string }
  | { kind: 'refer_fpi'; note: string }
  | { kind: 'fpi_response'; response: string; backTo: 'sender' | 'queue' }
  | { kind: 'decide'; decision: string; subClass: string; rationale: string }
  | { kind: 'prevention_decide'; decision: 'Approve' | 'Reject'; reason: string; description: string }

export interface AlertTransition {
  ok: true
  to: AlertStatus
  assignedTo: string | null
  patch: Record<string, unknown>
  event: string
}
type Result = AlertTransition | { ok: false; error: string }
const err = (error: string) => ({ ok: false as const, error })

export const ANALYST_ROLE_FOR_DEPT: Record<AlertSnapshot['dept'], Role> = { FRAUD_OPS: 'FO_ANALYST', GOVERNANCE: 'GOVERNANCE', HR: 'HR' }

export function canWorkAlert(a: AlertSnapshot, actor: Actor) {
  return actor.roles.includes(ANALYST_ROLE_FOR_DEPT[a.dept])
}

export function alertTransition(a: AlertSnapshot, actor: Actor, action: AlertAction, cfg: AlertConfig, now = new Date()): Result {
  const isFpi = actor.roles.some((r) => r.startsWith('FPI_'))
  if (a.status === 'Closed') return err('Alert is closed.')
  const nowIso = now.toISOString()
  const resumePause = () => (a.pausedAt ? { paused_ms: a.pausedMs + (now.getTime() - new Date(a.pausedAt).getTime()), paused_at: null } : {})

  if (action.kind === 'fpi_response') {
    if (!isFpi) return err('Only FP&I can respond to a referral.')
    if (a.status !== 'Referred to FP&I') return err('Alert is not referred to FP&I.')
    if (!action.response.trim()) return err('Response is required.')
    return action.backTo === 'sender'
      ? { ok: true, to: 'WIP', assignedTo: a.assignedTo, patch: { fpi_response: action.response }, event: 'FP&I responded (back to sender)' }
      : { ok: true, to: 'Yet to start', assignedTo: null, patch: { fpi_response: action.response }, event: 'FP&I responded (back to common queue)' }
  }
  if (action.kind === 'edd_response') {
    if (a.status !== 'EDD raised') return err('No EDD is open on this alert.')
    return { ok: true, to: 'EDD responded', assignedTo: a.assignedTo, patch: { edd_response: action.response, sr_status: 'Closed' }, event: 'EDD outcome received from CRM' }
  }

  if (!canWorkAlert(a, actor)) return err('This alert belongs to another department queue (FR-ALT-04).')

  if (action.kind === 'claim') {
    if (a.assignedTo && a.assignedTo !== actor.id) return err('Alert is already assigned.')
    if (a.status === 'Re-scheduled') return err('Alert is re-scheduled; move it back to the current queue first (FR-ALT-032).')
    if (!['Yet to start', 'Hold'].includes(a.status) && a.assignedTo) return err('Already yours.')
    const to: AlertStatus = a.status === 'Hold' ? 'Hold' : a.status === 'Yet to start' ? 'WIP' : a.status
    return { ok: true, to, assignedTo: actor.id, patch: { assigned_at: nowIso }, event: 'Picked from queue' }
  }
  if (action.kind === 'requeue') {
    if (a.status !== 'Re-scheduled') return err('Only re-scheduled alerts can be moved back to the queue.')
    return { ok: true, to: 'Yet to start', assignedTo: null, patch: { ...resumePause(), reschedule_until: null }, event: 'Moved back to current queue before re-schedule date' }
  }

  if (a.assignedTo !== actor.id) return err('Pick the alert up (assign it to yourself) before acting on it.')

  switch (action.kind) {
    case 'edd':
      if (!['WIP', 'EDD responded'].includes(a.status)) return err(`Cannot raise EDD from status ${a.status}.`)
      if (!action.crmAvailable) return err('CRM interface: CIF not found in Siebel CRM. EDD SR could not be raised; consider re-scheduling (FR-ALT-025).')
      return { ok: true, to: 'EDD raised', assignedTo: actor.id, patch: { edd_raised_at: nowIso, sr_status: 'Open' }, event: 'EDD SR raised in CRM' }
    case 'sendback':
      return { ok: true, to: 'Yet to start', assignedTo: null, patch: {}, event: 'Sent back to common queue' }
    case 'reschedule': {
      if (a.rescheduleCount >= cfg.maxReschedules) return err(`Maximum ${cfg.maxReschedules} re-schedules reached (FR-ALT-030).`)
      const until = new Date(now.getTime() + cfg.rescheduleHours * 3600_000).toISOString()
      return { ok: true, to: 'Re-scheduled', assignedTo: null, patch: { reschedule_count: a.rescheduleCount + 1, reschedule_until: until, paused_at: nowIso }, event: `Re-scheduled to ${until} (TAT paused)` }
    }
    case 'reassign':
      if (action.toUserDept !== actor.dept) return err('Can only re-assign within the same department.')
      return { ok: true, to: a.status === 'Yet to start' ? 'WIP' : a.status, assignedTo: action.toUserId, patch: { assigned_at: nowIso }, event: `Re-assigned to ${action.toUserId}` }
    case 'refer_fpi':
      if (!action.note.trim()) return err('A note for FP&I is required.')
      return { ok: true, to: 'Referred to FP&I', assignedTo: actor.id, patch: { fpi_referral: action.note }, event: 'Referred to FP&I for feedback' }
    case 'decide': {
      if (a.category !== 'Detection') return err('Prevention alerts use Approve / Reject.')
      if (!['WIP', 'EDD responded', 'EDD raised'].includes(a.status)) return err(`Cannot decide an alert in status ${a.status}.`)
      const subs = ALERT_SUBCLASS[action.decision as keyof typeof ALERT_SUBCLASS]
      if (!subs) return err('Decision must be False Positive or Confirmed Fraud (FR-ALT-038).')
      if (!subs.includes(action.subClass)) return err('Choose a valid sub-classification (FR-ALT-039).')
      if (!action.rationale.trim()) return err('Rationale is mandatory on every disposition (FR-ALT-040).')
      return { ok: true, to: 'Closed', assignedTo: actor.id, patch: { decision: action.decision, sub_class: action.subClass, rationale: action.rationale, closed_at: nowIso, serviced_by: actor.id }, event: `Final decision: ${action.decision} / ${action.subClass}` }
    }
    case 'prevention_decide': {
      if (a.category !== 'Prevention') return err('Only prevention alerts use Approve / Reject.')
      const reasons = PREVENTION_DECISIONS[action.decision]
      if (!reasons || !reasons.includes(action.reason)) return err('Choose a valid decision and reason (FR-ALT-052).')
      if (!action.description.trim()) return err('A description of the disposition is required (FR-ALT-053).')
      return {
        ok: true, to: 'Closed', assignedTo: actor.id,
        patch: { decision: action.decision, sub_class: action.reason, rationale: action.description, closed_at: nowIso, serviced_by: actor.id, held: 0 },
        event: action.decision === 'Approve' ? 'Approved: held transaction released' : 'Rejected: transaction blocked (confirmed fraud)',
      }
    }
  }
  return err('Unknown action')
}

/** Turnaround time in ms, excluding time spent Re-scheduled (FR-ALT-031). */
export function tatMs(a: Pick<AlertSnapshot, 'createdAt' | 'closedAt' | 'pausedMs' | 'pausedAt'>, now = new Date()) {
  const end = a.closedAt ? new Date(a.closedAt).getTime() : now.getTime()
  const openPause = a.pausedAt && !a.closedAt ? now.getTime() - new Date(a.pausedAt).getTime() : 0
  return Math.max(0, end - new Date(a.createdAt).getTime() - a.pausedMs - openPause)
}

export function slaMinutesFor(category: string, priority: string, sla: Record<string, number>) {
  return category === 'Prevention' ? sla.Prevention : sla[priority] ?? sla.Medium
}
