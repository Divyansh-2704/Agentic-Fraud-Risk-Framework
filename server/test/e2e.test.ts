// End-to-end over HTTP: alert -> Confirmed Fraud -> case -> Maker -> Checker -> Investigator -> Reviewer -> Approver
// -> closed (final report, post tasks) -> recovery maker-checker -> re-open.
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/routes.js'
import { closeDb, get } from '../src/db.js'
import { resetDb, seedConfig, seedCustomers, seedUsers } from '../src/seed.js'

let baseUrl = ''
let server: ReturnType<ReturnType<typeof createApp>['listen']>
let cif = ''

async function call(user: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-User': user }, body: body ? JSON.stringify(body) : undefined })
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.arrayBuffer()
  return { status: res.status, data: data as any }
}
const ok = async (user: string, method: string, path: string, body?: unknown) => {
  const r = await call(user, method, path, body)
  if (r.status >= 400) throw new Error(`${method} ${path} as ${user} -> ${r.status}: ${r.data?.error}`)
  return r.data
}

beforeAll(async () => {
  await resetDb(); await seedConfig(); await seedUsers()
  const custs = await seedCustomers()
  for (const c of custs) if ((await get('SELECT entity FROM customers WHERE cif = ?', c))!.entity === 'Retail') { cif = c; break }
  server = createApp().listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => { server?.close(); await closeDb() })

describe('full fraud lifecycle over the API', () => {
  let alertId = '', caseId = ''

  it('ingests and triages an alert, then the analyst confirms fraud and creates a case', async () => {
    const acct = JSON.parse((await get('SELECT accounts FROM customers WHERE cif = ?', cif))!.accounts)[0]
    alertId = (await ok('u-super', 'POST', '/alerts/ingest', { alertDateTime: new Date().toISOString(), riskScore: 91, category: 'Detection', scenarioId: 'SC-310', ruleId: 'DSP-R310', ruleName: 'Mule pattern', alertType: 'Mule account', cif, accountNumber: acct, txnAmount: 25000 })).id
    const ws = await ok('u-omar', 'GET', `/alerts/${alertId}`)
    expect(ws.alert.complexity).toBe('High')
    expect(ws.alert.level).toBe('L2')
    expect(ws.actions.length).toBeGreaterThan(0) // pre-filled precautionary steps (FR-ALT-021)

    // HR cannot work a Fraud Ops alert (Chinese wall / dept queue)
    expect((await call('u-daniel', 'GET', `/alerts/${alertId}`)).status).toBe(403)

    await ok('u-omar', 'POST', '/alerts/assign', { ids: [alertId] })
    const bad = await call('u-omar', 'POST', `/alerts/${alertId}/act`, { kind: 'decide', decision: 'Confirmed Fraud', subClass: 'External fraud', rationale: '' })
    expect(bad.status).toBe(400) // rationale mandatory
    await ok('u-omar', 'POST', `/alerts/${alertId}/act`, { kind: 'decide', decision: 'Confirmed Fraud', subClass: 'External fraud', rationale: 'Victim funds moved out within minutes.' })
    caseId = (await ok('u-omar', 'POST', `/alerts/${alertId}/case`)).caseId
    const c = await ok('u-omar', 'GET', `/cases/${caseId}`)
    expect(c.case.status).toBe('Draft')
    expect(c.case.assigned_to).toBe('u-omar')
    expect(c.data.precautions.length).toBeGreaterThan(0) // inherited (FR-CASE-04)
    const outbox = await ok('u-super', 'GET', '/outbox')
    expect(outbox.some((e: any) => e.subject.includes(caseId) && e.to_addr.includes('fpi'))).toBe(true)
  })

  it('validates mandatory fields, and the maker can never check their own case', async () => {
    const r = await call('u-omar', 'POST', `/cases/${caseId}/transition`, { action: 'submit', comment: 'go' })
    expect(r.status).toBe(400)
    expect(r.data.error).toMatch(/Mandatory fields missing/)
    await ok('u-omar', 'PUT', `/cases/${caseId}`, {
      fields: { complexity: 'L2', risk_l1: 'Mule Account', risk_l2: 'Mule Network', risk_title: 'Recruited mule' },
      data: { details: { description: 'Mule account received victim funds.' }, sourceDetails: { reportingChannel: 'Alert (DSP)', dateReported: '2026-11-01' }, recommendation: { category: 'Process', type: 'Generic' } },
    })
    await ok('u-omar', 'POST', `/cases/${caseId}/transition`, { action: 'submit', comment: 'Ready' })
    const self = await call('u-omar', 'POST', `/cases/${caseId}/claim`)
    expect(self.status).toBe(400)
    expect(self.data.error).toMatch(/Separation of duties/)
  })

  it('checker returns, maker resubmits, checker approves and routing sends it to FP&I', async () => {
    await ok('u-layla', 'POST', `/cases/${caseId}/claim`)
    await ok('u-layla', 'POST', `/cases/${caseId}/transition`, { action: 'checker_return', comment: 'Add the police reference.' })
    let c = await ok('u-omar', 'GET', `/cases/${caseId}`)
    expect([c.case.status, c.case.assigned_to]).toEqual(['Return for re-work', 'u-omar'])
    await ok('u-omar', 'POST', `/cases/${caseId}/transition`, { action: 'submit', comment: 'Police ref added' })
    await ok('u-layla', 'POST', `/cases/${caseId}/claim`)
    const approve = await ok('u-layla', 'POST', `/cases/${caseId}/transition`, { action: 'checker_approve', comment: 'Approved' })
    expect(approve.status).toBe('Approved for Investigation')
    c = await ok('u-rashid', 'GET', `/cases/${caseId}`)
    expect(c.canClaim).toBe(true)
  })

  it('investigator works the case; validations guard the submit', async () => {
    await ok('u-rashid', 'POST', `/cases/${caseId}/claim`)
    let c = await ok('u-rashid', 'GET', `/cases/${caseId}`)
    expect(c.case.status).toBe('Investigation in progress')
    expect(c.checklist.length).toBeGreaterThan(0) // generated from risk category (FR-CASE-046)
    expect((await call('u-rashid', 'POST', `/cases/${caseId}/transition`, { action: 'inv_submit', comment: 'x' })).data.error).toMatch(/recommendation/i)
    await ok('u-rashid', 'PUT', `/cases/${caseId}`, { data: { financialImpact: { attempted: 1000, successful: 900, nearMiss: 200, gross: 900, recovery: 0 }, fpiRecommendation: { category: 'System', type: 'Non-Generic', text: 'Tune the rule.', strRequired: true } } })
    expect((await call('u-rashid', 'POST', `/cases/${caseId}/transition`, { action: 'inv_submit', comment: 'x' })).data.error).toMatch(/Successful fraud \+ Near miss/)
    await ok('u-rashid', 'PUT', `/cases/${caseId}`, { data: { financialImpact: { attempted: 30000, successful: 25000, nearMiss: 5000, potential: 10000, gross: 25000, recovery: 0, exposure: 30000 } } })
    await ok('u-rashid', 'POST', `/cases/${caseId}/log`, { description: 'Reviewed beneficiary statement', finding: 'Mule pattern confirmed.', include_in_report: true })
    c = await ok('u-rashid', 'GET', `/cases/${caseId}`)
    expect(c.data.financialImpact.net).toBe(25000)
    expect(c.diffs.length).toBeGreaterThan(0) // Show Diff (FR-CASE-039)
    await ok('u-rashid', 'POST', `/cases/${caseId}/transition`, { action: 'inv_submit', comment: 'Investigation complete' })
  })

  it('reviewer reworks, then approver signs off: final report, email and post-completion tasks', async () => {
    expect((await call('u-rashid', 'POST', `/cases/${caseId}/claim`)).status).toBe(400)
    await ok('u-khalid', 'POST', `/cases/${caseId}/claim`)
    await ok('u-khalid', 'POST', `/cases/${caseId}/transition`, { action: 'rev_return', comment: 'Attach recall reference' })
    await ok('u-rashid', 'POST', `/cases/${caseId}/transition`, { action: 'inv_submit', comment: 'Attached' })
    let c = await ok('u-khalid', 'GET', `/cases/${caseId}`)
    expect([c.case.status, c.case.assigned_to]).toEqual(['Review in progress', 'u-khalid'])
    await ok('u-khalid', 'POST', `/cases/${caseId}/transition`, { action: 'rev_send_approver', comment: 'Material loss' })
    await ok('u-mariam', 'POST', `/cases/${caseId}/claim`)
    await ok('u-mariam', 'POST', `/cases/${caseId}/transition`, { action: 'app_approve', comment: 'Approved' })
    c = await ok('u-mariam', 'GET', `/cases/${caseId}`)
    expect(c.case.status).toBe('Final report generated and closed')
    expect(c.case.frozen).toBe(true)
    expect(c.case.report_email_at).toBeTruthy()
    expect(c.evidence.some((e: any) => e.folder === 'Final Report')).toBe(true)
    expect(c.postTasks.map((t: any) => t.type).sort()).toEqual(['Central Bank STR', 'Non-Generic Issue', 'Op Risk Event'])
    expect(c.audit.some((a: any) => a.to_status === 'Investigation Approved')).toBe(true)
    // frozen
    expect((await call('u-mariam', 'PUT', `/cases/${caseId}`, { data: { details: { description: 'x' } } })).status).toBeGreaterThanOrEqual(400)
    // on-demand Word report
    const doc = await call('u-mariam', 'GET', `/cases/${caseId}/report.docx`)
    expect(doc.status).toBe(200)
    expect((doc.data as ArrayBuffer).byteLength).toBeGreaterThan(2000)
  })

  it('post-closure: tasks need a reference, recovery is maker-checker, super user re-opens', async () => {
    const tasks = (await ok('u-super', 'GET', `/cases/${caseId}`)).postTasks
    expect((await call('u-super', 'PUT', `/post-tasks/${tasks[0].id}`, { action: 'complete' })).status).toBe(400)
    await ok('u-super', 'PUT', `/post-tasks/${tasks[0].id}`, { action: 'push' })
    await ok('u-super', 'PUT', `/post-tasks/${tasks[0].id}`, { action: 'complete' })

    await ok('u-rashid', 'POST', `/cases/${caseId}/recoveries`, { amount: 5000, mode: 'Beneficiary bank recall', date: '2026-11-02', comment: 'Partial recall' })
    const rec = (await ok('u-rashid', 'GET', `/cases/${caseId}`)).recoveries[0]
    expect((await call('u-rashid', 'POST', `/cases/${caseId}/recoveries/${rec.id}/decide`, { approve: true, comment: 'self' })).status).toBe(400)
    await ok('u-mariam', 'POST', `/cases/${caseId}/recoveries/${rec.id}/decide`, { approve: true, comment: 'Verified' })
    let c = await ok('u-mariam', 'GET', `/cases/${caseId}`)
    expect(c.data.financialImpact.recovery).toBe(5000)
    expect(c.data.financialImpact.net).toBe(20000)

    expect((await call('u-mariam', 'POST', `/cases/${caseId}/transition`, { action: 'reopen', comment: 'x' })).status).toBe(400)
    await ok('u-super', 'POST', `/cases/${caseId}/transition`, { action: 'reopen', comment: 'New evidence received' })
    c = await ok('u-rashid', 'GET', `/cases/${caseId}`)
    expect([c.case.status, c.case.frozen, c.canClaim]).toEqual(['Case re-opened', false, true])
  })

  it('advance fee scam below X is closed by rule at the checker', async () => {
    const id = (await ok('u-aisha', 'POST', '/cases', { cif, description: 'Lottery scam' })).id
    await ok('u-aisha', 'PUT', `/cases/${id}`, { fields: { complexity: 'L1', risk_l1: 'Advance Fee Scam', risk_l2: 'Advance Fee', risk_title: 'Lottery / prize' }, data: { sourceDetails: { reportingChannel: 'Customer call', dateReported: '2026-11-01' }, financialSummary: { amountLost: 2500 }, recommendation: { category: 'People' } } })
    await ok('u-aisha', 'POST', `/cases/${id}/transition`, { action: 'submit', comment: 'go' })
    await ok('u-layla', 'POST', `/cases/${id}/claim`)
    const r = await ok('u-layla', 'POST', `/cases/${id}/transition`, { action: 'checker_approve', comment: 'ok' })
    expect(r.status).toBe('Approved and Closed (FO)')
    expect(r.routing.rule.id).toBe('R3')
  })

  it('whistleblower cases skip Fraud Ops and go to HR / Governance', async () => {
    expect((await call('u-aisha', 'POST', '/cases', { type: 'WHISTLEBLOWER', description: 'x' })).status).toBe(403)
    const id = (await ok('u-priya', 'POST', '/cases', { type: 'WHISTLEBLOWER', description: 'Hotline report' })).id
    expect((await call('u-aisha', 'GET', `/cases/${id}`)).status).toBe(403) // Fraud Ops cannot see whistleblower cases
    await ok('u-priya', 'POST', `/cases/${id}/transition`, { action: 'wb_route', comment: 'To HR' })
    await ok('u-daniel', 'POST', `/cases/${id}/claim`)
    await ok('u-daniel', 'POST', `/cases/${id}/transition`, { action: 'wb_close', comment: 'Allegation substantiated; staff suspended.' })
    const c = await ok('u-daniel', 'GET', `/cases/${id}`)
    expect(c.case.status).toBe('Closed')
    expect(c.evidence.some((e: any) => e.folder === 'Final Report')).toBe(true)
  })

  it('dashboards and process map respond', async () => {
    const d = await ok('u-super', 'GET', '/dashboard')
    expect(d.kpis.closedCases).toBeGreaterThan(0)
    expect(d.tatByActor.length).toBeGreaterThan(0)
    const p = await ok('u-super', 'GET', '/process-counts')
    expect(p.investigator).toBeGreaterThan(0)
    const agents = await ok('u-super', 'GET', '/agents')
    expect(agents.agents).toHaveLength(12)
    expect((await call('u-super', 'POST', '/agents/triage/run')).status).toBe(501)
  })
})
