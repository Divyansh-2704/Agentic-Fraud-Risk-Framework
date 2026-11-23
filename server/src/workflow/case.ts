// Fraud case state machine (Sheets 4-7 of the agentic flow workbook; BRD 5.4, 5.6, 5.7, 5.8, 5.11).
// Pure: takes a snapshot + actor and returns what should change. No database access here.
import type { CaseAction, CaseOwner, CaseStatus, CaseType, Role } from '../../../shared/src/index.js'
import { CLOSED_STATUSES } from '../../../shared/src/index.js'
import { evaluateRouting, type RoutingResult, type RoutingRule } from './routing.js'

export interface CaseSnapshot {
  id: string
  type: CaseType
  status: CaseStatus
  owner: CaseOwner
  assignedTo: string | null
  createdBy: string
  makerId: string | null
  checkerId: string | null
  investigatorId: string | null
  reviewerId: string | null
  approverId: string | null
  riskL1: string | null
  riskL2: string | null
  successfulAed: number
  missingMandatory: string[]
  financialErrors: string[]
  hasRecommendation: boolean
  /** Co-investigators / co-reviewers still working, by stage (joint investigation, FR-CASE-088..092). */
  jointPending: { INVESTIGATION: string[]; REVIEW: string[] }
  /** Everyone who has worked the case as investigator (lead + co). Used for separation of duties. */
  investigators: string[]
  disabled: boolean
}

export interface Actor { id: string; roles: Role[] }
export interface CaseConfig { rules: RoutingRule[]; afsThresholdAed: number }

export type Effect =
  | { type: 'email'; to: string; subject: string; template: string }
  | { type: 'final_report' }
  | { type: 'post_tasks' }
  | { type: 'freeze' }
  | { type: 'unfreeze' }

export interface TransitionOk {
  ok: true
  to: CaseStatus
  /** Intermediate statuses passed through (recorded in the audit trail), e.g. Investigation Approved. */
  via?: CaseStatus[]
  owner: CaseOwner
  assignedTo: string | null
  set: Partial<Record<'maker_id' | 'checker_id' | 'investigator_id' | 'reviewer_id' | 'approver_id', string | null>> & { returnedInc?: boolean }
  effects: Effect[]
  routing?: RoutingResult
}
export interface TransitionErr { ok: false; error: string }
export type TransitionResult = TransitionOk | TransitionErr

const err = (error: string): TransitionErr => ({ ok: false, error })
const has = (a: Actor, r: Role) => a.roles.includes(r)
const isAfs = (s: CaseSnapshot) => [s.riskL1, s.riskL2].includes('Advance Fee Scam')
export const FPI_EMAIL = 'fpi.team@auronova.example'

/** Golden control rule (FR-CASE-030, FR-CASE-085): whoever creates or prepares never checks, reviews or approves. */
export function separationError(s: CaseSnapshot, userId: string, stage: 'CHECKER' | 'REVIEWER' | 'APPROVER'): string | null {
  // At the Checker desk the maker rule (FR-CASE-030) is the one that applies, even when the maker also created the case.
  if (stage === 'CHECKER' && userId === s.makerId) return 'Separation of duties: the Fraud Ops Maker cannot be the Checker of the same case (FR-CASE-030).'
  if (userId === s.createdBy) return 'Separation of duties: the person who created this case cannot check, review or approve it (FR-CASE-085).'
  if (stage !== 'CHECKER') {
    if (userId === s.makerId || userId === s.checkerId) return 'Separation of duties: Fraud Ops maker/checker of this case cannot sign it off in FP&I.'
    if (s.investigators.includes(userId) || userId === s.investigatorId) return 'Separation of duties: an investigator of this case cannot review or approve it.'
  }
  if (stage === 'APPROVER' && userId === s.reviewerId) return 'Separation of duties: the Reviewer cannot also be the Approver of the same case.'
  return null
}

/** Which pool the case currently sits in, and who may pick it up (FR-CASE-029, 036, 038). */
export function claimCheck(s: CaseSnapshot, user: Actor): { ok: true; to?: CaseStatus; set: TransitionOk['set'] } | TransitionErr {
  if (s.disabled) return err('Case is disabled.')
  if (s.assignedTo && s.assignedTo !== user.id) return err('Case is already assigned to someone else.')
  switch (s.owner) {
    case 'FO_MAKER':
      if (!has(user, 'FO_MAKER')) return err('Only a Fraud Ops Maker can pick this case.')
      return { ok: true, set: {} }
    case 'FO_CHECKER': {
      if (!has(user, 'FO_CHECKER')) return err('Only a Fraud Ops Checker can pick this case.')
      const e = separationError(s, user.id, 'CHECKER'); if (e) return err(e)
      return { ok: true, set: { checker_id: user.id } }
    }
    case 'FPI_INVESTIGATOR':
      if (!has(user, 'FPI_INVESTIGATOR')) return err('Only an FP&I Investigator can pick this case.')
      if (user.id === s.createdBy && s.type !== 'STANDARD') return err('Creator cannot investigate this case.')
      return {
        ok: true, set: { investigator_id: user.id },
        to: s.status === 'Approved for Investigation' || s.status === 'Case re-opened' ? 'Investigation in progress' : undefined,
      }
    case 'FPI_REVIEWER': {
      if (!has(user, 'FPI_REVIEWER')) return err('Only an FP&I Reviewer can pick this case.')
      const e = separationError(s, user.id, 'REVIEWER'); if (e) return err(e)
      return { ok: true, set: { reviewer_id: user.id } }
    }
    case 'FPI_APPROVER': {
      if (!has(user, 'FPI_APPROVER')) return err('Only an FP&I Approver can pick this case.')
      const e = separationError(s, user.id, 'APPROVER'); if (e) return err(e)
      return { ok: true, set: { approver_id: user.id } }
    }
    case 'HR_GOV':
      if (!has(user, 'HR') && !has(user, 'GOVERNANCE')) return err('Only HR / Governance can pick this whistleblower case.')
      return { ok: true, set: {} }
    default:
      return err('This case is not in a pool.')
  }
}

export function transition(s: CaseSnapshot, actor: Actor, action: CaseAction, comment: string, cfg: CaseConfig): TransitionResult {
  if (s.disabled) return err('Case is disabled by a super user.')
  if (!comment || !comment.trim()) return err('A comment is required on every routing action (FR-CASE-084).')
  const mine = s.assignedTo === actor.id
  const notMine = err('Pick the case up (assign it to yourself) before acting on it.')

  switch (action) {
    // ---------------- Fraud Ops Maker ----------------
    case 'submit': {
      if (s.type !== 'STANDARD') return err('Whistleblower cases skip Fraud Ops; use "Route to HR / Governance".')
      if (!(s.status === 'Draft' || (s.status === 'Return for re-work' && s.owner === 'FO_MAKER'))) return err(`Cannot submit a case in status "${s.status}".`)
      if (!has(actor, 'FO_MAKER')) return err('Only a Fraud Ops Maker can submit to the Checker.')
      if (s.assignedTo && !mine) return notMine
      if (s.missingMandatory.length) return err(`Mandatory fields missing: ${s.missingMandatory.join(', ')} (FR-CASE-027).`)
      return { ok: true, to: 'Submitted to FO Checker', owner: 'FO_CHECKER', assignedTo: null, set: { maker_id: actor.id, checker_id: null }, effects: [] }
    }

    // ---------------- Fraud Ops Checker ----------------
    case 'checker_approve':
    case 'checker_reject':
    case 'checker_return': {
      if (s.status !== 'Submitted to FO Checker') return err('Case is not waiting for the Fraud Ops Checker.')
      if (!has(actor, 'FO_CHECKER')) return err('Only a Fraud Ops Checker can do this.')
      if (!mine) return notMine
      const sep = separationError(s, actor.id, 'CHECKER'); if (sep) return err(sep)
      if (action === 'checker_reject')
        return { ok: true, to: 'Reject', owner: 'NONE', assignedTo: null, set: {}, effects: [{ type: 'freeze' }] }
      if (action === 'checker_return')
        return { ok: true, to: 'Return for re-work', owner: 'FO_MAKER', assignedTo: s.makerId, set: { returnedInc: true }, effects: [] }
      const routing = evaluateRouting({ riskL1: s.riskL1, riskL2: s.riskL2, successfulAmountAed: s.successfulAed }, cfg.rules, cfg.afsThresholdAed)
      if (routing.outcome === 'CLOSE') {
        const effects: Effect[] = [{ type: 'freeze' }]
        if (routing.emailTo) effects.push({ type: 'email', to: routing.emailTo, subject: `Case ${s.id} closed by routing rule ${routing.rule.id}`, template: 'routing_close' })
        return { ok: true, to: 'Approved and Closed (FO)', owner: 'NONE', assignedTo: null, set: {}, effects, routing }
      }
      return {
        ok: true, to: 'Approved for Investigation', owner: 'FPI_INVESTIGATOR', assignedTo: null, set: {}, routing,
        effects: [{ type: 'email', to: FPI_EMAIL, subject: `Case ${s.id} approved for investigation`, template: 'approved_for_investigation' }],
      }
    }

    // ---------------- FP&I Investigator ----------------
    case 'inv_return':
    case 'inv_approve_afs':
    case 'inv_submit': {
      const atInvestigator = s.status === 'Investigation in progress' || (s.status === 'Return for re-work' && s.owner === 'FPI_INVESTIGATOR')
      if (!atInvestigator) return err('Case is not with the Investigator.')
      if (!has(actor, 'FPI_INVESTIGATOR')) return err('Only an FP&I Investigator can do this.')
      if (!mine) return err('Only the lead investigator assigned to this case can route it.')
      if (action === 'inv_return')
        return { ok: true, to: 'Return for re-work', owner: 'FO_MAKER', assignedTo: s.makerId, set: { returnedInc: true }, effects: [] }
      if (action === 'inv_approve_afs') {
        if (!isAfs(s)) return err('"Approve Advance Fee Scam" is only available when the risk category is Advance Fee Scam.')
        return { ok: true, to: 'Final report generated and closed', owner: 'NONE', assignedTo: null, set: {}, effects: closeEffects() }
      }
      if (s.jointPending.INVESTIGATION.length) return err(`Joint investigation: co-investigators still working (${s.jointPending.INVESTIGATION.join(', ')}). The lead can submit only when all have finished (FR-CASE-091).`)
      if (s.financialErrors.length) return err(`Financial impact invalid: ${s.financialErrors.join('; ')} (FR-CASE-045).`)
      if (!s.hasRecommendation) return err('Add a recommendation before submitting to the Reviewer (FR-CASE-058..060).')
      return { ok: true, to: 'Review in progress', owner: 'FPI_REVIEWER', assignedTo: s.reviewerId, set: {}, effects: [] }
    }

    // ---------------- FP&I Reviewer ----------------
    case 'rev_return':
    case 'rev_approve_close':
    case 'rev_send_approver': {
      if (s.status !== 'Review in progress') return err('Case is not with the Reviewer.')
      if (!has(actor, 'FPI_REVIEWER')) return err('Only an FP&I Reviewer can do this.')
      if (!mine) return notMine
      const sep = separationError(s, actor.id, 'REVIEWER'); if (sep) return err(sep)
      if (action === 'rev_return')
        return { ok: true, to: 'Return for re-work', owner: 'FPI_INVESTIGATOR', assignedTo: s.investigatorId, set: { returnedInc: true }, effects: [] }
      if (s.jointPending.REVIEW.length) return err(`Joint review: co-reviewers still working (${s.jointPending.REVIEW.join(', ')}).`)
      if (action === 'rev_approve_close')
        return { ok: true, to: 'Final report generated and closed', via: ['Investigation Approved'], owner: 'NONE', assignedTo: null, set: {}, effects: closeEffects() }
      return { ok: true, to: 'Pending Approval', owner: 'FPI_APPROVER', assignedTo: s.approverId, set: {}, effects: [] }
    }

    // ---------------- FP&I Approver ----------------
    case 'app_return':
    case 'app_approve': {
      if (s.status !== 'Pending Approval') return err('Case is not with the Approver.')
      if (!has(actor, 'FPI_APPROVER')) return err('Only an FP&I Approver can do this.')
      if (!mine) return notMine
      const sep = separationError(s, actor.id, 'APPROVER'); if (sep) return err(sep)
      if (action === 'app_return') {
        // FR-CASE-074/075: for Advance Fee Scam a return goes to the Fraud Ops Maker.
        if (isAfs(s)) return { ok: true, to: 'Return for re-work', owner: 'FO_MAKER', assignedTo: s.makerId, set: { returnedInc: true }, effects: [] }
        return { ok: true, to: 'Return for re-work', owner: 'FPI_INVESTIGATOR', assignedTo: s.investigatorId, set: { returnedInc: true }, effects: [] }
      }
      return { ok: true, to: 'Final report generated and closed', via: ['Investigation Approved'], owner: 'NONE', assignedTo: null, set: {}, effects: closeEffects() }
    }

    // ---------------- Whistleblower (FR-CASE-093..098) ----------------
    case 'wb_route': {
      if (s.type !== 'WHISTLEBLOWER') return err('Only whistleblower cases are routed to HR / Governance.')
      if (s.status !== 'Draft') return err('Whistleblower case already routed.')
      if (!actor.roles.some((r) => r.startsWith('FPI_'))) return err('Only FP&I can route a whistleblower case.')
      return {
        ok: true, to: 'Under Investigation', owner: 'HR_GOV', assignedTo: null, set: {},
        effects: [{ type: 'email', to: 'hr.governance@auronova.example', subject: `Whistleblower case ${s.id} routed to HR / Governance`, template: 'wb_routed' }],
      }
    }
    case 'wb_close': {
      if (s.type !== 'WHISTLEBLOWER' || s.status !== 'Under Investigation') return err('Case is not an open whistleblower investigation.')
      if (!has(actor, 'HR') && !has(actor, 'GOVERNANCE')) return err('Only HR / Governance can close a whistleblower case.')
      if (!mine) return notMine
      return { ok: true, to: 'Closed', owner: 'NONE', assignedTo: null, set: {}, effects: [{ type: 'final_report' }, { type: 'freeze' }] }
    }

    // ---------------- Super user (FR-CASE-081, 082) ----------------
    case 'reopen': {
      if (!has(actor, 'SUPER_USER')) return err('Only a super user can re-open a case.')
      if (!(CLOSED_STATUSES as string[]).includes(s.status) || s.type !== 'STANDARD') return err('Only closed standard cases can be re-opened.')
      return { ok: true, to: 'Case re-opened', owner: 'FPI_INVESTIGATOR', assignedTo: null, set: { investigator_id: null, reviewer_id: null, approver_id: null }, effects: [{ type: 'unfreeze' }] }
    }
  }
  return err(`Unknown action ${action}`)
}

const closeEffects = (): Effect[] => [{ type: 'final_report' }, { type: 'post_tasks' }, { type: 'freeze' }]

/** Actions that make sense for this user right now (drives the action bar in the UI). */
export function availableActions(s: CaseSnapshot, actor: Actor): CaseAction[] {
  const candidates: CaseAction[] = ['submit', 'checker_approve', 'checker_reject', 'checker_return', 'inv_return', 'inv_approve_afs', 'inv_submit',
    'rev_return', 'rev_approve_close', 'rev_send_approver', 'app_return', 'app_approve', 'wb_route', 'wb_close', 'reopen']
  // Use a lenient snapshot so the button still appears when only data validation fails (the server explains on click).
  const lenient: CaseSnapshot = { ...s, missingMandatory: [], financialErrors: [], hasRecommendation: true, jointPending: { INVESTIGATION: [], REVIEW: [] } }
  const cfg: CaseConfig = { rules: [{ id: 'X', label: 'x', categories: [], action: 'investigate' }], afsThresholdAed: 0 }
  return candidates.filter((a) => transition(lenient, actor, a, 'preview', cfg).ok)
}
