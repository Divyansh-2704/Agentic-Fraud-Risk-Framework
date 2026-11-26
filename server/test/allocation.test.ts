// Balanced alert allocation: equal totals, then priority mix, then typology mix; same customer stays together;
// the manager's Rebalance only moves alerts nobody has started.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { all, closeDb, exec, get } from '../src/db.js'
import { resetDb, seedConfig, seedCustomers, seedUsers } from '../src/seed.js'
import * as A from '../src/services/alerts.js'
import { rebalance } from '../src/services/allocation.js'
import { getUser } from '../src/services/common.js'

const U = (id: string) => getUser(id)!
const FO = ['u-aisha', 'u-layla', 'u-omar']
let custs: string[] = []
let retail: string[] = []
let n = 0

beforeAll(async () => {
  await resetDb(); await seedConfig(); await seedUsers()
  custs = await seedCustomers()
  retail = []
  for (const c of custs) if ((await get('SELECT entity FROM customers WHERE cif = ?', c))!.entity !== 'Digital') retail.push(c)
})
afterAll(async () => { await closeDb() })
beforeEach(async () => { await exec('TRUNCATE alerts, alert_events, alert_actions, evidence, ai_analyses RESTART IDENTITY') })

/** Ingest a Fraud Ops detection alert. score >= 80 -> High, >= 50 -> Medium, else Low. */
async function alert(cif: string, score: number, typology = 'Phishing', opts: { skipAutoAllocate?: boolean } = {}) {
  const acct = JSON.parse((await get('SELECT accounts FROM customers WHERE cif = ?', cif))!.accounts)[0]
  n++
  return A.ingestAlert({ alertDateTime: new Date(Date.now() - (1000 - n) * 60_000).toISOString(), riskScore: score, category: 'Detection', scenarioId: 'SC-412', ruleId: 'DSP-R412', ruleName: 'Test rule', alertType: typology, typology, cif, accountNumber: acct, txnAmount: 1000 }, opts)
}
const owner = async (id: string) => (await get('SELECT assigned_to FROM alerts WHERE id = ?', id))!.assigned_to as string
async function loads() {
  const rows = await all("SELECT assigned_to, priority, typology FROM alerts WHERE status <> 'Closed' AND assigned_to IS NOT NULL")
  return Object.fromEntries(FO.map((u) => {
    const mine = rows.filter((r) => r.assigned_to === u)
    return [u, { total: mine.length, High: mine.filter((r) => r.priority === 'High').length, Medium: mine.filter((r) => r.priority === 'Medium').length, Low: mine.filter((r) => r.priority === 'Low').length, typ: mine.map((r) => r.typology) }]
  }))
}
const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs)

describe('allocation on arrival', () => {
  it('1a: every analyst gets the same number of alerts', async () => {
    for (let i = 0; i < 12; i++) await alert(retail[i], 60)
    const l = await loads()
    expect(FO.map((u) => l[u].total)).toEqual([4, 4, 4])
  })

  it('1a: counts existing open alerts too, so new alerts go to whoever has fewest', async () => {
    // Aisha already holds 4 open alerts picked from the queue.
    for (let i = 0; i < 4; i++) await A.assignAlerts(U('u-aisha'), [await alert(retail[i], 60, 'Phishing', { skipAutoAllocate: true })])
    for (let i = 4; i < 10; i++) await alert(retail[i], 60)
    const l = await loads()
    expect([l['u-aisha'].total, l['u-layla'].total, l['u-omar'].total]).toEqual([4, 3, 3])
  })

  it('1b: High / Medium / Low are spread evenly, even when they arrive in blocks', async () => {
    for (const score of [90, 90, 90, 90, 90, 90, 60, 60, 60, 40, 40, 40]) await alert(retail[n % retail.length], score)
    const l = await loads()
    for (const p of ['High', 'Medium', 'Low'] as const) expect(spread(FO.map((u) => l[u][p])), p).toBeLessThanOrEqual(1)
    expect(FO.map((u) => l[u].High)).toEqual([2, 2, 2])
  })

  it('1c: a typology is not concentrated on one analyst', async () => {
    const first = await alert(retail[0], 90, 'Phishing')
    await alert(retail[1], 90, 'Mule account')
    await alert(retail[2], 90, 'Velocity breach')
    // Totals and High counts are now tied 1-1-1: the next phishing alert must go to someone without one.
    const second = await alert(retail[3], 90, 'Phishing')
    expect(await owner(second)).not.toBe(await owner(first))
    for (let i = 4; i < 13; i++) await alert(retail[i], 90, 'Phishing')
    const l = await loads()
    expect(spread(FO.map((u) => l[u].typ.filter((t: string) => t === 'Phishing').length))).toBeLessThanOrEqual(1)
  })

  it('keeps alerts of one customer with the same analyst', async () => {
    const a1 = await alert(retail[0], 60)
    await alert(retail[1], 60); await alert(retail[2], 60)
    const a2 = await alert(retail[0], 90, 'Mule account')
    expect(await owner(a2)).toBe(await owner(a1))
  })

  it('prevention alerts follow the same rules', async () => {
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const acct = JSON.parse((await get('SELECT accounts FROM customers WHERE cif = ?', retail[i]))!.accounts)[0]
      ids.push(await A.ingestAlert({ alertDateTime: new Date().toISOString(), riskScore: 90, category: 'Prevention', mode: 'Real Time', preventionColour: 'Grey', scenarioId: 'SC-600', ruleId: 'DSP-P600', alertType: 'Mule account', cif: retail[i], accountNumber: acct }))
    }
    expect(new Set(await Promise.all(ids.map(owner))).size).toBe(3)
  })
})

describe('rebalance (manager)', () => {
  it('only a manager or super user can rebalance', async () => {
    await expect(rebalance(U('u-aisha'), false)).rejects.toThrow(/manager or super user/)
  })

  it('moves only unstarted alerts and evens out totals, priorities and typologies', async () => {
    // Backlog: Aisha picked 9 alerts; she has started work on two of them. Three more alerts are unassigned.
    const picked: string[] = []
    for (let i = 0; i < 9; i++) {
      const id = await alert(retail[i], [90, 60, 40][i % 3], ['Phishing', 'Mule account', 'Velocity breach'][i % 3], { skipAutoAllocate: true })
      await A.assignAlerts(U('u-aisha'), [id]); picked.push(id)
    }
    await A.alertAct(U('u-aisha'), picked[0], { kind: 'edd' })
    await A.updateAlertFields(U('u-aisha'), picked[1], { notes: 'Called the customer, waiting for documents.' })
    const unassigned: string[] = []
    for (let i = 9; i < 12; i++) unassigned.push(await alert(retail[i], 60, 'Phishing', { skipAutoAllocate: true }))

    const preview = await rebalance(U('u-hassan'), false)
    expect(preview.applied).toBe(false)
    expect(preview.movable).toBe(10) // 7 unstarted of Aisha's + 3 unassigned
    expect(preview.moves.map((m) => m.id)).not.toContain(picked[0])
    expect(preview.moves.map((m) => m.id)).not.toContain(picked[1])
    expect(await owner(picked[2])).toBe('u-aisha') // preview changes nothing

    const done = await rebalance(U('u-hassan'), true)
    expect(done.applied).toBe(true)
    const l = await loads()
    expect(FO.map((u) => l[u].total)).toEqual([4, 4, 4])
    for (const p of ['High', 'Medium', 'Low'] as const) expect(spread(FO.map((u) => l[u][p])), p).toBeLessThanOrEqual(1)
    expect(await owner(picked[0])).toBe('u-aisha')
    expect(await owner(picked[1])).toBe('u-aisha')
    for (const id of unassigned) expect((await get('SELECT status FROM alerts WHERE id = ?', id))!.status).toBe('WIP')
    const ev = await all("SELECT action FROM alert_events WHERE action LIKE 'Rebalanced%'")
    expect(ev.length).toBe(done.moves.length)
    // A second run finds nothing to do.
    await expect(rebalance(U('u-hassan'), true)).rejects.toThrow(/already balanced/)
  })

  it('unstarted alerts of a customer already being worked stay with that analyst', async () => {
    const started = await alert(retail[0], 90, 'Phishing', { skipAutoAllocate: true })
    await A.assignAlerts(U('u-omar'), [started]); await A.alertAct(U('u-omar'), started, { kind: 'edd' })
    const sibling = await alert(retail[0], 60, 'Phishing', { skipAutoAllocate: true })
    for (let i = 1; i < 6; i++) await alert(retail[i], 60, 'Phishing', { skipAutoAllocate: true })
    await rebalance(U('u-hassan'), true)
    expect(await owner(sibling)).toBe('u-omar')
  })
})
