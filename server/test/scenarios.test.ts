// Verifies the test-scenario pack: every seeded record starts where the guide says, and the expected outcomes
// described in shared/src/scenarios.ts actually happen when the steps are performed (through the same services the UI calls).
import { beforeAll, describe, expect, it } from 'vitest'
import { SCENARIOS } from '../../shared/src/scenarios.js'
import { get, setConfig } from '../src/db.js'
import { seedAll } from '../src/seed.js'
import * as A from '../src/services/alerts.js'
import * as C from '../src/services/cases.js'
import { canSeeCase, getUser } from '../src/services/common.js'

const U = (id: string) => getUser(id)!
const status = (id: string) => (get('SELECT status FROM alerts WHERE id = ?', id) ?? get('SELECT status FROM cases WHERE id = ?', id))?.status
const caseRow = (id: string) => get('SELECT * FROM cases WHERE id = ?', id)!

beforeAll(async () => { await seedAll() }, 120_000)

describe('scenario pack seeding', () => {
  it('has unique scenario IDs', () => {
    const ids = SCENARIOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  for (const s of SCENARIOS.filter((x) => x.records.length)) {
    it(`${s.id} starts at "${s.startStatus}"`, () => {
      for (const r of s.records) expect(status(r), r).toBeDefined()
      expect(status(s.records[0])).toBe(s.startStatus)
    })
  }
})

describe('scenario outcomes', () => {
  it('TC-A01 end to end: alert to closed case with post-completion tasks', async () => {
    const aisha = U('u-aisha'), layla = U('u-layla'), rashid = U('u-rashid'), khalid = U('u-khalid'), mariam = U('u-mariam')
    A.assignAlerts(aisha, ['ALT-TC-A01'])
    A.alertAct(aisha, 'ALT-TC-A01', { kind: 'decide', decision: 'Confirmed Fraud', subClass: 'Scam-phishing', rationale: 'Fake crypto platform.' })
    const id = C.createCaseFromAlert(aisha, 'ALT-TC-A01')
    expect(caseRow(id).assigned_to).toBe('u-aisha')
    C.saveCase(aisha, id, { fields: { risk_l1: 'Investment Scam', risk_l2: 'Fake Investment', risk_title: 'Crypto platform' }, data: { recommendation: { category: 'Process' } } as any })
    await C.transitionCase(aisha, id, 'submit', 'ok')
    C.claimCase(layla, id); expect((await C.transitionCase(layla, id, 'checker_approve', 'ok')).status).toBe('Approved for Investigation')
    C.claimCase(rashid, id)
    C.saveCase(rashid, id, { data: { financialImpact: { attempted: 60500, successful: 48500, nearMiss: 12000, potential: 20000, gross: 48500, recovery: 0 }, fpiRecommendation: { category: 'System', type: 'Generic', text: 'Tune rule', strRequired: true } } as any })
    await C.transitionCase(rashid, id, 'inv_submit', 'ok')
    C.claimCase(khalid, id); await C.transitionCase(khalid, id, 'rev_send_approver', 'ok')
    C.claimCase(mariam, id); expect((await C.transitionCase(mariam, id, 'app_approve', 'ok')).status).toBe('Final report generated and closed')
    const tasks = C.getCaseFull(mariam, id).postTasks.map((t: any) => t.type)
    expect(tasks).toEqual(['Op Risk Event', 'Central Bank STR', 'Generic Issue'])
  })

  it('TC-A04 EDD refused for a customer not in CRM; TC-A05 fourth re-schedule refused', () => {
    const aisha = U('u-aisha'), layla = U('u-layla')
    A.assignAlerts(aisha, ['ALT-TC-A04'])
    expect(() => A.alertAct(aisha, 'ALT-TC-A04', { kind: 'edd' })).toThrow(/not found in Siebel CRM/)
    A.assignAlerts(layla, ['ALT-TC-A05'])
    expect(get('SELECT reschedule_count n FROM alerts WHERE id = ?', 'ALT-TC-A05')!.n).toBe(2)
    A.alertAct(layla, 'ALT-TC-A05', { kind: 'reschedule' })
    A.alertAct(layla, 'ALT-TC-A05', { kind: 'requeue' })
    A.assignAlerts(layla, ['ALT-TC-A05'])
    expect(() => A.alertAct(layla, 'ALT-TC-A05', { kind: 'reschedule' })).toThrow(/Maximum 3/)
  })

  it('TC-A08 one decision closes all three alerts of the customer', () => {
    const aisha = U('u-aisha')
    A.assignAlerts(aisha, ['ALT-TC-A08'])
    A.alertAct(aisha, 'ALT-TC-A08', { kind: 'decide', decision: 'False Positive', subClass: 'Rule discrepancy', rationale: 'x', alsoIds: ['ALT-TC-A08B', 'ALT-TC-A08C'] })
    expect(['ALT-TC-A08', 'ALT-TC-A08B', 'ALT-TC-A08C'].map(status)).toEqual(['Closed', 'Closed', 'Closed'])
  })

  it('TC-A09 data-quality exception and TC-A10 HR-only queue with HR case creation', () => {
    expect(JSON.parse(get('SELECT dq_exceptions d FROM alerts WHERE id = ?', 'ALT-TC-A09')!.d)).toEqual(['accountNumber', 'cif (not found in Feature Store)'])
    expect(() => A.alertWorkspace(U('u-aisha'), 'ALT-TC-A10')).toThrow(/Chinese wall/)
    const daniel = U('u-daniel')
    A.assignAlerts(daniel, ['ALT-TC-A10'])
    A.alertAct(daniel, 'ALT-TC-A10', { kind: 'decide', decision: 'Confirmed Fraud', subClass: 'External fraud', rationale: 'Staff account.' })
    const id = C.createCaseFromAlert(daniel, 'ALT-TC-A10')
    const c = caseRow(id)
    expect([c.owner, c.assigned_to, canSeeCase(daniel, c)]).toEqual(['FO_MAKER', null, true])
  })

  it('TC-A12 overdue, TC-A13 EDD > 8 days notified, TC-B05 prevention escalation, TC-F05 archived', () => {
    const list = A.listAlerts(U('u-super'), { scope: 'live' }).rows
    expect(list.find((a: any) => a.id === 'ALT-TC-A12')!.overdue).toBe(true)
    expect(get("SELECT 1 x FROM outbox WHERE subject LIKE 'EDD open more than 8 days: ALT-TC-A13%'")).toBeTruthy()
    expect(get("SELECT 1 x FROM outbox WHERE subject LIKE 'ESCALATION: prevention alert ALT-TC-B05%'")).toBeTruthy()
    expect(A.listAlerts(U('u-super'), { scope: 'history' }).rows.find((a: any) => a.id === 'ALT-TC-F05')!.archived).toBe(true)
  })

  it('TC-B01 / TC-B02 prevention approve releases, reject allows a case', () => {
    const aisha = U('u-aisha')
    A.alertAct(aisha, 'ALT-TC-B01', { kind: 'prevention_decide', decision: 'Approve', reason: 'Expected or Authorized Behavior', description: 'Call-back ok.' })
    expect(get('SELECT held FROM alerts WHERE id = ?', 'ALT-TC-B01')!.held).toBe(0)
    A.alertAct(aisha, 'ALT-TC-B02', { kind: 'prevention_decide', decision: 'Reject', reason: 'Confirmed fraud', description: 'Fraud.' })
    expect(C.createCaseFromAlert(aisha, 'ALT-TC-B02')).toMatch(/^FC-/)
  })

  it('TC-C02 golden rule blocks the maker as checker', () => {
    expect(() => C.claimCase(U('u-omar'), 'FC-TC-C02')).toThrow(/Separation of duties/)
  })

  it('TC-C04..C12 routing outcomes', async () => {
    const layla = U('u-layla')
    const expected: Record<string, string> = {
      'FC-TC-C04': 'Approved and Closed (FO)', 'FC-TC-C05': 'Approved and Closed (FO)', 'FC-TC-C06': 'Approved and Closed (FO)', 'FC-TC-C07': 'Approved and Closed (FO)',
      'FC-TC-C08': 'Approved and Closed (FO)', 'FC-TC-C09': 'Approved and Closed (FO)', 'FC-TC-C10': 'Approved and Closed (FO)', 'FC-TC-C11': 'Approved for Investigation', 'FC-TC-C12': 'Approved for Investigation',
    }
    for (const [id, to] of Object.entries(expected)) {
      C.claimCase(layla, id)
      expect((await C.transitionCase(layla, id, 'checker_approve', 'ok')).status, id).toBe(to)
    }
    expect(get("SELECT 1 x FROM outbox WHERE subject = 'Case FC-TC-C04 closed by routing rule R1'")).toBeTruthy()
  })

  it('TC-C13 raising X to 30,000 closes the AFS case', async () => {
    setConfig('afsThresholdAed', 30000)
    C.claimCase(U('u-layla'), 'FC-TC-C13')
    expect((await C.transitionCase(U('u-layla'), 'FC-TC-C13', 'checker_approve', 'ok')).status).toBe('Approved and Closed (FO)')
    setConfig('afsThresholdAed', 10000)
  })

  it('TC-D02 financial validations then recommendation block submit', async () => {
    const rashid = U('u-rashid')
    await expect(C.transitionCase(rashid, 'FC-TC-D02', 'inv_submit', 'x')).rejects.toThrow(/Financial impact invalid/)
    C.saveCase(rashid, 'FC-TC-D02', { data: { financialImpact: { attempted: 25000, potential: 15000, recovery: 3000 } } as any })
    await expect(C.transitionCase(rashid, 'FC-TC-D02', 'inv_submit', 'x')).rejects.toThrow(/Add a recommendation/)
  })

  it('TC-D04 AFS direct approval; TC-D08 AFS approver return goes to the maker; TC-D09 reviewer cannot approve', async () => {
    expect((await C.transitionCase(U('u-rashid'), 'FC-TC-D04', 'inv_approve_afs', 'ok')).status).toBe('Final report generated and closed')
    C.claimCase(U('u-mariam'), 'FC-TC-D08')
    await C.transitionCase(U('u-mariam'), 'FC-TC-D08', 'app_return', 'rework')
    expect([caseRow('FC-TC-D08').owner, caseRow('FC-TC-D08').assigned_to]).toEqual(['FO_MAKER', 'u-aisha'])
    expect(() => C.claimCase(U('u-mariam'), 'FC-TC-D09')).toThrow(/Reviewer cannot also be the Approver/)
  })

  it('TC-E01 joint investigation blocks the lead until the co-investigator finishes', async () => {
    const rashid = U('u-rashid'), priya = U('u-priya')
    C.addCoInvestigator(rashid, 'FC-TC-E01', 'u-priya', 'INVESTIGATION')
    await expect(C.transitionCase(rashid, 'FC-TC-E01', 'inv_submit', 'x')).rejects.toThrow(/co-investigators still working/)
    C.markCoDone(priya, 'FC-TC-E01', 'INVESTIGATION', true)
    expect((await C.transitionCase(rashid, 'FC-TC-E01', 'inv_submit', 'x')).status).toBe('Review in progress')
  })

  it('TC-E03 whistleblower hidden from Fraud Ops, routed and closed by HR', async () => {
    expect(canSeeCase(U('u-aisha'), caseRow('WB-TC-E03'))).toBe(false)
    await C.transitionCase(U('u-priya'), 'WB-TC-E03', 'wb_route', 'to HR')
    C.claimCase(U('u-daniel'), 'WB-TC-E03')
    C.addParty(U('u-daniel'), 'WB-TC-E03', { kind: 'Staff', ref: 'S11877', suspect: true })
    expect((await C.transitionCase(U('u-daniel'), 'WB-TC-E03', 'wb_close', 'closed')).status).toBe('Closed')
  })

  it('TC-F01 tasks, TC-F02 recovery maker-checker and gross-loss cap, TC-F03 re-open', async () => {
    expect(C.getCaseFull(U('u-super'), 'FC-TC-F01').postTasks.map((t: any) => t.id)).toEqual(['FC-TC-F01-PT1', 'FC-TC-F01-PT2', 'FC-TC-F01-PT3'])
    const rashid = U('u-rashid'), khalid = U('u-khalid')
    C.createRecovery(rashid, 'FC-TC-F02', { amount: 7500, mode: 'Beneficiary bank recall', date: '2026-11-05', comment: '', blacklist: true })
    const rec = () => get("SELECT id FROM recoveries WHERE case_id = 'FC-TC-F02' AND status = 'Pending'")!.id
    expect(() => C.decideRecovery(rashid, 'FC-TC-F02', rec(), true, 'x')).toThrow(/Separation of duties/)
    C.decideRecovery(khalid, 'FC-TC-F02', rec(), true, 'ok')
    expect(C.getCaseFull(khalid, 'FC-TC-F02').data.financialImpact.net).toBe(22500)
    C.createRecovery(rashid, 'FC-TC-F02', { amount: 40000, mode: 'Beneficiary bank recall', date: '2026-11-05', comment: '' })
    expect(() => C.decideRecovery(khalid, 'FC-TC-F02', rec(), true, 'x')).toThrow(/exceed gross loss/)
    expect((await C.transitionCase(U('u-super'), 'FC-TC-F03', 'reopen', 'new evidence')).status).toBe('Case re-opened')
  })

  it('TC-X01 Chinese wall by entity', () => {
    const c = caseRow('FC-TC-X01')
    expect([c.entity, canSeeCase(U('u-priya'), c), canSeeCase(U('u-rashid'), c)]).toEqual(['Digital', false, true])
  })
})
