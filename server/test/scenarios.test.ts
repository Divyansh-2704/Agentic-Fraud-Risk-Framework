// Verifies the test-scenario pack: every seeded record starts where the guide says, and the expected outcomes
// described in shared/src/scenarios.ts actually happen when the steps are performed (through the same services the UI calls).
// The last block re-checks every issue raised in the UAT issues log (test-reports/UAT-Issues-Log.xlsx).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SCENARIOS } from '../../shared/src/scenarios.js'
import { all, closeDb, get, setConfig } from '../src/db.js'
import { seedAll } from '../src/seed.js'
import * as A from '../src/services/alerts.js'
import * as C from '../src/services/cases.js'
import { canSeeCase, emailVisibleTo, getUser } from '../src/services/common.js'
import { evaluateRouting, DEFAULT_ROUTING_RULES } from '../src/workflow/routing.js'

const U = (id: string) => getUser(id)!
const status = async (id: string) => ((await get('SELECT status FROM alerts WHERE id = ?', id)) ?? (await get('SELECT status FROM cases WHERE id = ?', id)))?.status
const caseRow = async (id: string) => (await get('SELECT * FROM cases WHERE id = ?', id))!

beforeAll(async () => { await seedAll() }, 300_000)
afterAll(async () => { await closeDb() })

describe('scenario pack seeding', () => {
  it('has unique scenario IDs', () => {
    const ids = SCENARIOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  for (const s of SCENARIOS.filter((x) => x.records.length)) {
    it(`${s.id} starts at "${s.startStatus}"`, async () => {
      for (const r of s.records) expect(await status(r), r).toBeDefined()
      expect(await status(s.records[0])).toBe(s.startStatus)
    })
  }
})

describe('scenario outcomes', () => {
  it('TC-A01 end to end: alert to closed case with post-completion tasks', async () => {
    const aisha = U('u-aisha'), layla = U('u-layla'), rashid = U('u-rashid'), khalid = U('u-khalid'), mariam = U('u-mariam')
    await A.assignAlerts(aisha, ['ALT-TC-A01'])
    await A.alertAct(aisha, 'ALT-TC-A01', { kind: 'decide', decision: 'Confirmed Fraud', subClass: 'Scam-phishing', rationale: 'Fake crypto platform.' })
    const id = await C.createCaseFromAlert(aisha, 'ALT-TC-A01')
    expect((await caseRow(id)).assigned_to).toBe('u-aisha')
    await C.saveCase(aisha, id, { fields: { risk_l1: 'Investment Scam', risk_l2: 'Fake Investment', risk_title: 'Crypto platform' }, data: { recommendation: { category: 'Process' } } as any })
    await C.transitionCase(aisha, id, 'submit', 'ok')
    await C.claimCase(layla, id); expect((await C.transitionCase(layla, id, 'checker_approve', 'ok')).status).toBe('Approved for Investigation')
    await C.claimCase(rashid, id)
    await C.saveCase(rashid, id, { data: { financialImpact: { attempted: 60500, successful: 48500, nearMiss: 12000, potential: 20000, gross: 48500, recovery: 0 }, fpiRecommendation: { category: 'System', type: 'Generic', text: 'Tune rule', strRequired: true } } as any })
    await C.transitionCase(rashid, id, 'inv_submit', 'ok')
    await C.claimCase(khalid, id); await C.transitionCase(khalid, id, 'rev_send_approver', 'ok')
    await C.claimCase(mariam, id); expect((await C.transitionCase(mariam, id, 'app_approve', 'ok')).status).toBe('Final report generated and closed')
    const tasks = (await C.getCaseFull(mariam, id)).postTasks.map((t: any) => t.type)
    expect(tasks).toEqual(['Op Risk Event', 'Central Bank STR', 'Generic Issue'])
  })

  it('TC-A04 EDD refused for a customer not in CRM; TC-A05 fourth re-schedule refused', async () => {
    const aisha = U('u-aisha'), layla = U('u-layla')
    await A.assignAlerts(aisha, ['ALT-TC-A04'])
    const r = await A.alertAct(aisha, 'ALT-TC-A04', { kind: 'edd' })
    expect(r.refused).toMatch(/not found in Siebel CRM/)
    expect(await status('ALT-TC-A04')).toBe('WIP')
    await A.assignAlerts(layla, ['ALT-TC-A05'])
    expect(Number((await get('SELECT reschedule_count AS n FROM alerts WHERE id = ?', 'ALT-TC-A05'))!.n)).toBe(2)
    await A.alertAct(layla, 'ALT-TC-A05', { kind: 'reschedule' })
    await A.alertAct(layla, 'ALT-TC-A05', { kind: 'requeue' })
    await A.assignAlerts(layla, ['ALT-TC-A05'])
    await expect(A.alertAct(layla, 'ALT-TC-A05', { kind: 'reschedule' })).rejects.toThrow(/Maximum 3/)
  })

  it('TC-A08 one decision closes all three alerts of the customer', async () => {
    const aisha = U('u-aisha')
    await A.assignAlerts(aisha, ['ALT-TC-A08'])
    await A.alertAct(aisha, 'ALT-TC-A08', { kind: 'decide', decision: 'False Positive', subClass: 'Rule discrepancy', rationale: 'x', alsoIds: ['ALT-TC-A08B', 'ALT-TC-A08C'] })
    expect(await Promise.all(['ALT-TC-A08', 'ALT-TC-A08B', 'ALT-TC-A08C'].map(status))).toEqual(['Closed', 'Closed', 'Closed'])
  })

  it('TC-A09 data-quality exception and TC-A10 HR-only queue with HR case creation', async () => {
    expect(JSON.parse((await get('SELECT dq_exceptions AS d FROM alerts WHERE id = ?', 'ALT-TC-A09'))!.d)).toEqual(['accountNumber', 'cif (not found in Feature Store)'])
    await expect(A.alertWorkspace(U('u-aisha'), 'ALT-TC-A10')).rejects.toThrow(/Chinese wall/)
    const daniel = U('u-daniel')
    await A.assignAlerts(daniel, ['ALT-TC-A10'])
    await A.alertAct(daniel, 'ALT-TC-A10', { kind: 'decide', decision: 'Confirmed Fraud', subClass: 'External fraud', rationale: 'Staff account.' })
    const id = await C.createCaseFromAlert(daniel, 'ALT-TC-A10')
    const c = await caseRow(id)
    expect([c.owner, c.assigned_to, canSeeCase(daniel, c)]).toEqual(['FO_MAKER', null, true])
    // UAT issue 12: the HR creator can follow the case but can no longer delete it
    expect((await C.getCaseFull(daniel, id)).canDelete).toBe(false)
    await expect(C.deleteDraft(daniel, id)).rejects.toThrow(/Fraud Ops Maker/)
  })

  it('TC-A12 overdue, TC-A13 EDD > 8 days notified, TC-B05 prevention escalation, TC-F05 archived', async () => {
    const list = (await A.listAlerts(U('u-super'), { scope: 'live' })).rows
    expect(list.find((a: any) => a.id === 'ALT-TC-A12')!.overdue).toBe(true)
    expect(await get("SELECT 1 AS x FROM outbox WHERE subject LIKE 'EDD open more than 8 days: ALT-TC-A13%'")).toBeTruthy()
    expect(await get("SELECT 1 AS x FROM outbox WHERE subject LIKE 'ESCALATION: prevention alert ALT-TC-B05%'")).toBeTruthy()
    expect((await A.listAlerts(U('u-super'), { scope: 'history' })).rows.find((a: any) => a.id === 'ALT-TC-F05')!.archived).toBe(true)
  })

  it('TC-B01 / TC-B02 prevention approve releases, reject allows a case', async () => {
    const aisha = U('u-aisha')
    await A.alertAct(aisha, 'ALT-TC-B01', { kind: 'prevention_decide', decision: 'Approve', reason: 'Expected or Authorized Behavior', description: 'Call-back ok.' })
    expect(Number((await get('SELECT held FROM alerts WHERE id = ?', 'ALT-TC-B01'))!.held)).toBe(0)
    await A.alertAct(aisha, 'ALT-TC-B02', { kind: 'prevention_decide', decision: 'Reject', reason: 'Confirmed fraud', description: 'Fraud.' })
    expect(await C.createCaseFromAlert(aisha, 'ALT-TC-B02')).toMatch(/^FC-/)
  })

  it('TC-C02 golden rule blocks the maker as checker, citing FR-CASE-030', async () => {
    await expect(C.claimCase(U('u-omar'), 'FC-TC-C02')).rejects.toThrow(/Fraud Ops Maker cannot be the Checker of the same case \(FR-CASE-030\)/)
  })

  it('TC-C04..C12 routing outcomes', async () => {
    const layla = U('u-layla')
    const expected: Record<string, string> = {
      'FC-TC-C04': 'Approved and Closed (FO)', 'FC-TC-C05': 'Approved and Closed (FO)', 'FC-TC-C06': 'Approved and Closed (FO)', 'FC-TC-C07': 'Approved and Closed (FO)',
      'FC-TC-C08': 'Approved and Closed (FO)', 'FC-TC-C09': 'Approved and Closed (FO)', 'FC-TC-C10': 'Approved and Closed (FO)', 'FC-TC-C11': 'Approved for Investigation', 'FC-TC-C12': 'Approved for Investigation',
    }
    for (const [id, to] of Object.entries(expected)) {
      await C.claimCase(layla, id)
      expect((await C.transitionCase(layla, id, 'checker_approve', 'ok')).status, id).toBe(to)
    }
    // UAT issue 17: R1 emails only the team that owns the category
    const c04 = await get("SELECT to_addr FROM outbox WHERE subject = 'Case FC-TC-C04 closed by routing rule R1'")
    const c05 = await get("SELECT to_addr FROM outbox WHERE subject = 'Case FC-TC-C05 closed by routing rule R1'")
    expect(c04!.to_addr).toBe('group.compliance@auronova.example')
    expect(c05!.to_addr).toBe('cyber.security@auronova.example')
  })

  it('TC-C13 raising X to 30,000 closes the AFS case', async () => {
    await setConfig('afsThresholdAed', 30000)
    await C.claimCase(U('u-layla'), 'FC-TC-C13')
    expect((await C.transitionCase(U('u-layla'), 'FC-TC-C13', 'checker_approve', 'ok')).status).toBe('Approved and Closed (FO)')
    await setConfig('afsThresholdAed', 10000)
  })

  it('TC-C14 draft delete: only the Maker creator while it is still with them', async () => {
    expect((await C.getCaseFull(U('u-omar'), 'FC-TC-C14')).canDelete).toBe(false)
    await expect(C.deleteDraft(U('u-omar'), 'FC-TC-C14')).rejects.toThrow(/Only the creator/)
    expect((await C.getCaseFull(U('u-aisha'), 'FC-TC-C14')).canDelete).toBe(true)
    await C.deleteDraft(U('u-aisha'), 'FC-TC-C14')
    expect(await status('FC-TC-C14')).toBeUndefined()
  })

  it('TC-C16 the FP&I request email reaches the Fraud Ops team mailbox (UAT issue 22)', async () => {
    const mail = (await all("SELECT * FROM outbox WHERE subject = 'FP&I request: please create and action case FC-TC-C16'"))[0]
    expect(mail.to_addr).toBe('fraud.ops@auronova.example')
    expect(emailVisibleTo(U('u-aisha'), mail)).toBe(true)
    expect(emailVisibleTo(U('u-daniel'), mail)).toBe(false)
  })

  it('TC-D02 financial validations then recommendation block submit', async () => {
    const rashid = U('u-rashid')
    await expect(C.transitionCase(rashid, 'FC-TC-D02', 'inv_submit', 'x')).rejects.toThrow(/Financial impact invalid/)
    await C.saveCase(rashid, 'FC-TC-D02', { data: { financialImpact: { attempted: 25000, potential: 15000, recovery: 3000 } } as any })
    await expect(C.transitionCase(rashid, 'FC-TC-D02', 'inv_submit', 'x')).rejects.toThrow(/Add a recommendation/)
  })

  it('TC-D04 AFS direct approval; TC-D08 AFS approver return goes to the maker; TC-D09 reviewer cannot approve', async () => {
    // UAT issue 23: a non-AFS case still in investigation has no "Approve Advance Fee Scam" action
    expect((await C.getCaseFull(U('u-rashid'), 'FC-TC-E01')).actions).not.toContain('inv_approve_afs')
    expect((await C.getCaseFull(U('u-rashid'), 'FC-TC-D04')).actions).toContain('inv_approve_afs')
    expect((await C.transitionCase(U('u-rashid'), 'FC-TC-D04', 'inv_approve_afs', 'ok')).status).toBe('Final report generated and closed')
    await C.claimCase(U('u-mariam'), 'FC-TC-D08')
    await C.transitionCase(U('u-mariam'), 'FC-TC-D08', 'app_return', 'rework')
    expect([(await caseRow('FC-TC-D08')).owner, (await caseRow('FC-TC-D08')).assigned_to]).toEqual(['FO_MAKER', 'u-aisha'])
    await expect(C.claimCase(U('u-mariam'), 'FC-TC-D09')).rejects.toThrow(/Reviewer cannot also be the Approver/)
  })

  it('TC-E01 joint investigation blocks the lead until the co-investigator finishes', async () => {
    const rashid = U('u-rashid'), priya = U('u-priya')
    await C.addCoInvestigator(rashid, 'FC-TC-E01', 'u-priya', 'INVESTIGATION')
    await expect(C.transitionCase(rashid, 'FC-TC-E01', 'inv_submit', 'x')).rejects.toThrow(/co-investigators still working/)
    await C.markCoDone(priya, 'FC-TC-E01', 'INVESTIGATION', true)
    expect((await C.transitionCase(rashid, 'FC-TC-E01', 'inv_submit', 'x')).status).toBe('Review in progress')
  })

  it('TC-E03 whistleblower hidden from Fraud Ops, routed and closed by HR', async () => {
    expect(canSeeCase(U('u-aisha'), await caseRow('WB-TC-E03'))).toBe(false)
    await C.transitionCase(U('u-priya'), 'WB-TC-E03', 'wb_route', 'to HR')
    await C.claimCase(U('u-daniel'), 'WB-TC-E03')
    await C.addParty(U('u-daniel'), 'WB-TC-E03', { kind: 'Staff', ref: 'S11877', suspect: true })
    expect((await C.transitionCase(U('u-daniel'), 'WB-TC-E03', 'wb_close', 'closed')).status).toBe('Closed')
  })

  it('TC-F01 tasks, TC-F02 recovery maker-checker and gross-loss cap, TC-F03 re-open', async () => {
    expect((await C.getCaseFull(U('u-super'), 'FC-TC-F01')).postTasks.map((t: any) => t.id)).toEqual(['FC-TC-F01-PT1', 'FC-TC-F01-PT2', 'FC-TC-F01-PT3'])
    const rashid = U('u-rashid'), khalid = U('u-khalid')
    await C.createRecovery(rashid, 'FC-TC-F02', { amount: 7500, mode: 'Beneficiary bank recall', date: '2026-11-05', comment: '', blacklist: true })
    const rec = async () => (await get("SELECT id FROM recoveries WHERE case_id = 'FC-TC-F02' AND status = 'Pending'"))!.id
    await expect(C.decideRecovery(rashid, 'FC-TC-F02', await rec(), true, 'x')).rejects.toThrow(/Separation of duties/)
    await C.decideRecovery(khalid, 'FC-TC-F02', await rec(), true, 'ok')
    expect((await C.getCaseFull(khalid, 'FC-TC-F02')).data.financialImpact.net).toBe(22500)
    expect((await C.getCaseFull(khalid, 'FC-TC-F02')).parties.filter((p: any) => p.kind !== 'Customer').every((p: any) => p.blacklist)).toBe(true)
    await C.createRecovery(rashid, 'FC-TC-F02', { amount: 40000, mode: 'Beneficiary bank recall', date: '2026-11-05', comment: '' })
    await expect(C.decideRecovery(khalid, 'FC-TC-F02', await rec(), true, 'x')).rejects.toThrow(/exceed gross loss/)
    expect((await C.transitionCase(U('u-super'), 'FC-TC-F03', 'reopen', 'new evidence')).status).toBe('Case re-opened')
  })

  it('TC-X01 Chinese wall by entity', async () => {
    const c = await caseRow('FC-TC-X01')
    expect([c.entity, canSeeCase(U('u-priya'), c), canSeeCase(U('u-rashid'), c)]).toEqual(['Digital', false, true])
  })
})

describe('UAT issues log: fixes', () => {
  it('issue 3 / 22: users see emails sent to their team mailbox', async () => {
    const toFpi = { to_addr: 'fpi.team@auronova.example', cc: '' }
    expect(emailVisibleTo(U('u-mariam'), toFpi)).toBe(true)
    expect(emailVisibleTo(U('u-rashid'), toFpi)).toBe(true)
    expect(emailVisibleTo(U('u-aisha'), toFpi)).toBe(false)
    expect(emailVisibleTo(U('u-sana'), { to_addr: 'hr.governance@auronova.example' })).toBe(true)
  })

  it('issue 4: rule precision shows recent activity per rule', async () => {
    const { dashboard } = await import('../src/services/dashboard.js')
    const d = await dashboard(U('u-super'), {})
    const r205 = d.rulePrecision.find((r: any) => r.rule === 'DSP-R205')!
    expect(r205).toHaveProperty('closed7d')
    expect(r205).toHaveProperty('fp7d')
    expect(r205.lastDecisionAt).toBeTruthy()
  })

  it('issue 6: re-scheduled alerts show "Re-scheduled alert: <customer>" on the calendar', async () => {
    const cal = await C.calendar(U('u-super'))
    const item = cal.find((x: any) => x.kind === 'Re-scheduled alert')
    expect(item?.title).toMatch(/^Re-scheduled alert: /)
  })

  it('issue 10: re-assign writes the colleague name in the activity log', async () => {
    const a: any = (await A.listAlerts(U('u-aisha'), { scope: 'live', category: 'Detection', dept: 'FRAUD_OPS' })).rows.find((x: any) => x.status === 'Yet to start' && !x.id.startsWith('ALT-TC'))!
    await A.assignAlerts(U('u-aisha'), [a.id])
    await A.alertAct(U('u-aisha'), a.id, { kind: 'reassign', toUserId: 'u-layla' })
    expect((await get("SELECT action FROM alert_events WHERE alert_id = ? AND action LIKE 'Re-assigned%' ORDER BY id DESC LIMIT 1", a.id))!.action).toBe('Re-assigned to Layla Nasser')
  })

  it('issue 15: a manual case starts with today as Date reported', async () => {
    const id = await C.createCase(U('u-aisha'), { cif: '8800314', description: 'Manual case' })
    expect((await C.getCaseFull(U('u-aisha'), id)).data.sourceDetails.dateReported).toBe(new Date().toISOString().slice(0, 10))
  })

  it('issue 17: routing R1 picks the category mailbox', () => {
    expect(evaluateRouting({ riskL1: 'Cyber Security', riskL2: 'Malware / Intrusion', successfulAmountAed: 1 }, DEFAULT_ROUTING_RULES, 10000).emailTo).toBe('cyber.security@auronova.example')
    expect(evaluateRouting({ riskL1: 'Group Compliance', riskL2: 'Regulatory / AML', successfulAmountAed: 1 }, DEFAULT_ROUTING_RULES, 10000).emailTo).toBe('group.compliance@auronova.example')
  })
})
