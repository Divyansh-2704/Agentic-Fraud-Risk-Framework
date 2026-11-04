import { describe, expect, it } from 'vitest'
import { alertTransition, tatMs, type AlertSnapshot } from '../src/workflow/alert.js'
import { availableActions, claimCheck, separationError, transition, type CaseSnapshot } from '../src/workflow/case.js'
import { computeImpact, validateImpact } from '../src/workflow/financial.js'
import { DEFAULT_ROUTING_RULES, evaluateRouting } from '../src/workflow/routing.js'

const cfg = { rules: DEFAULT_ROUTING_RULES, afsThresholdAed: 10000 }
const base: CaseSnapshot = {
  id: 'FC-1', type: 'STANDARD', status: 'Submitted to FO Checker', owner: 'FO_CHECKER', assignedTo: 'checker', createdBy: 'maker', makerId: 'maker',
  checkerId: 'checker', investigatorId: null, reviewerId: null, approverId: null, riskL1: 'Mule Account', riskL2: 'Mule Network', successfulAed: 50000,
  missingMandatory: [], financialErrors: [], hasRecommendation: true, jointPending: { INVESTIGATION: [], REVIEW: [] }, investigators: [], disabled: false,
}
const checker = { id: 'checker', roles: ['FO_CHECKER' as const] }

describe('golden control rule (FR-CASE-030 / 085)', () => {
  it('the maker cannot check their own case, even holding the checker role', () => {
    const makerChecker = { id: 'maker', roles: ['FO_MAKER' as const, 'FO_CHECKER' as const] }
    const s = { ...base, assignedTo: null }
    const claim = claimCheck(s, makerChecker)
    expect(claim.ok).toBe(false)
    const r = transition({ ...base, assignedTo: 'maker' }, makerChecker, 'checker_approve', 'ok', cfg)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Separation of duties/)
  })
  it('investigator cannot review; reviewer cannot approve', () => {
    const s = { ...base, investigatorId: 'inv', reviewerId: 'rev', investigators: ['inv'] }
    expect(separationError(s, 'inv', 'REVIEWER')).toBeTruthy()
    expect(separationError(s, 'rev', 'APPROVER')).toBeTruthy()
    expect(separationError(s, 'someone', 'APPROVER')).toBeNull()
  })
  it('a comment is required on every routing action', () => {
    const r = transition(base, checker, 'checker_return', '  ', cfg)
    expect(r.ok).toBe(false)
  })
})

describe('routing table (FR-CASE-035)', () => {
  const route = (l1: string, amt = 0) => evaluateRouting({ riskL1: l1, riskL2: null, successfulAmountAed: amt }, DEFAULT_ROUTING_RULES, 10000)
  it('Group Compliance / Cyber close and email', () => {
    expect(route('Cyber Security').outcome).toBe('CLOSE')
    expect(route('Group Compliance').emailTo).toContain('compliance')
  })
  it('External / Card / Fraudulent Enquiries close', () => {
    for (const c of ['External Fraud', 'Card Fraud', 'Fraudulent Enquiries']) expect(route(c).outcome).toBe('CLOSE')
  })
  it('Advance Fee Scam: <= X closes, > X investigates', () => {
    expect(route('Advance Fee Scam', 9999).outcome).toBe('CLOSE')
    expect(route('Advance Fee Scam', 10000).outcome).toBe('CLOSE')
    expect(route('Advance Fee Scam', 10001).outcome).toBe('INVESTIGATE')
  })
  it('all others go to the investigator pool', () => {
    expect(route('Mule Account').outcome).toBe('INVESTIGATE')
  })
  it('checker approve applies the routing', () => {
    const r1 = transition({ ...base, riskL1: 'External Fraud' }, checker, 'checker_approve', 'ok', cfg)
    expect(r1.ok && r1.to).toBe('Approved and Closed (FO)')
    const r2 = transition(base, checker, 'checker_approve', 'ok', cfg)
    expect(r2.ok && r2.to).toBe('Approved for Investigation')
    expect(r2.ok && r2.owner).toBe('FPI_INVESTIGATOR')
  })
})

describe('return paths land on the right desk', () => {
  const inv = { id: 'inv', roles: ['FPI_INVESTIGATOR' as const] }
  const rev = { id: 'rev', roles: ['FPI_REVIEWER' as const] }
  const app = { id: 'app', roles: ['FPI_APPROVER' as const] }
  const invS: CaseSnapshot = { ...base, status: 'Investigation in progress', owner: 'FPI_INVESTIGATOR', assignedTo: 'inv', investigatorId: 'inv', investigators: ['inv'] }
  it('checker return -> maker', () => {
    const r = transition(base, checker, 'checker_return', 'fix', cfg)
    expect(r.ok && [r.to, r.owner, r.assignedTo]).toEqual(['Return for re-work', 'FO_MAKER', 'maker'])
  })
  it('investigator return -> Fraud Ops maker', () => {
    const r = transition(invS, inv, 'inv_return', 'missing info', cfg)
    expect(r.ok && [r.owner, r.assignedTo]).toEqual(['FO_MAKER', 'maker'])
  })
  it('reviewer return -> investigator', () => {
    const r = transition({ ...invS, status: 'Review in progress', owner: 'FPI_REVIEWER', assignedTo: 'rev', reviewerId: 'rev' }, rev, 'rev_return', 'add', cfg)
    expect(r.ok && [r.owner, r.assignedTo]).toEqual(['FPI_INVESTIGATOR', 'inv'])
  })
  it('approver return -> investigator, but -> maker for Advance Fee Scam (FR-CASE-075)', () => {
    const pa: CaseSnapshot = { ...invS, status: 'Pending Approval', owner: 'FPI_APPROVER', assignedTo: 'app', reviewerId: 'rev', approverId: 'app' }
    const r1 = transition(pa, app, 'app_return', 'redo', cfg)
    expect(r1.ok && r1.owner).toBe('FPI_INVESTIGATOR')
    const r2 = transition({ ...pa, riskL1: 'Advance Fee Scam' }, app, 'app_return', 'redo', cfg)
    expect(r2.ok && [r2.owner, r2.assignedTo]).toEqual(['FO_MAKER', 'maker'])
  })
  it('Approve Advance Fee Scam only for AFS cases', () => {
    expect(transition(invS, inv, 'inv_approve_afs', 'x', cfg).ok).toBe(false)
    const r = transition({ ...invS, riskL1: 'Advance Fee Scam' }, inv, 'inv_approve_afs', 'x', cfg)
    expect(r.ok && r.to).toBe('Final report generated and closed')
  })
  it('joint investigation: lead cannot submit until co-investigators finish', () => {
    const r = transition({ ...invS, jointPending: { INVESTIGATION: ['Priya'], REVIEW: [] } }, inv, 'inv_submit', 'done', cfg)
    expect(r.ok).toBe(false)
  })
  it('submit blocked by invalid financials', () => {
    const r = transition({ ...invS, financialErrors: ['Recovery must be <= Gross'] }, inv, 'inv_submit', 'done', cfg)
    expect(r.ok).toBe(false)
  })
  it('available actions reflect the desk', () => {
    expect(availableActions(invS, inv)).toEqual(['inv_return', 'inv_submit'])
    expect(availableActions(base, checker)).toEqual(['checker_approve', 'checker_reject', 'checker_return'])
  })
})

describe('financial validations (FR-CASE-045)', () => {
  it('passes a consistent set and computes net', () => {
    const fi = { attempted: 100, successful: 70, nearMiss: 30, potential: 50, gross: 70, recovery: 20, exposure: 100 }
    expect(validateImpact(fi)).toEqual([])
    expect(computeImpact(fi).net).toBe(50)
  })
  it('flags each rule', () => {
    expect(validateImpact({ attempted: 100, successful: 80, nearMiss: 30 })).toHaveLength(1)
    expect(validateImpact({ attempted: 100, successful: 10, potential: 20 })).toHaveLength(1)
    expect(validateImpact({ attempted: 0, gross: 10, recovery: 20 })).toHaveLength(1)
  })
})

describe('alert lifecycle (FR-ALT-023..044)', () => {
  const a: AlertSnapshot = { id: 'A1', category: 'Detection', dept: 'FRAUD_OPS', status: 'WIP', assignedTo: 'an', rescheduleCount: 0, pausedAt: null, pausedMs: 0, createdAt: new Date(Date.now() - 3600_000).toISOString(), closedAt: null }
  const an = { id: 'an', roles: ['FO_ANALYST' as const], dept: 'FRAUD_OPS' }
  const acfg = { maxReschedules: 3, rescheduleHours: 24 }
  it('re-schedule is refused after 3 times', () => {
    expect(alertTransition({ ...a, rescheduleCount: 2 }, an, { kind: 'reschedule' }, acfg).ok).toBe(true)
    expect(alertTransition({ ...a, rescheduleCount: 3 }, an, { kind: 'reschedule' }, acfg).ok).toBe(false)
  })
  it('TAT excludes paused (re-scheduled) time', () => {
    const now = new Date()
    const created = new Date(now.getTime() - 10 * 3600_000).toISOString()
    expect(Math.round(tatMs({ createdAt: created, closedAt: null, pausedMs: 4 * 3600_000, pausedAt: null }, now) / 3600_000)).toBe(6)
  })
  it('decision needs a valid sub-class and rationale', () => {
    expect(alertTransition(a, an, { kind: 'decide', decision: 'False Positive', subClass: 'Scam-phishing', rationale: 'x' }, acfg).ok).toBe(false)
    expect(alertTransition(a, an, { kind: 'decide', decision: 'False Positive', subClass: 'Inconclusive', rationale: '' }, acfg).ok).toBe(false)
    const r = alertTransition(a, an, { kind: 'decide', decision: 'Confirmed Fraud', subClass: 'External fraud', rationale: 'confirmed' }, acfg)
    expect(r.ok && r.to).toBe('Closed')
  })
  it('other departments cannot work the alert', () => {
    expect(alertTransition(a, { id: 'an', roles: ['HR'], dept: 'HR' }, { kind: 'sendback' }, acfg).ok).toBe(false)
  })
  it('EDD fails cleanly when CIF is not in CRM (FR-ALT-025)', () => {
    const r = alertTransition(a, an, { kind: 'edd', crmAvailable: false }, acfg)
    expect(r.ok).toBe(false)
  })
})
