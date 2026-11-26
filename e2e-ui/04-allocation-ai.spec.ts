// Balanced allocation (rules 1a-1c) and the AI disposition agent surfaces, through the UI.
// Runs last: Rebalance redistributes the seeded backlog. The AI agent is switched off for UI tests (no LLM calls).
import { expect, test } from '@playwright/test'
import { apiAs, main, openAs, resetData, toast } from './helpers'

test.beforeAll(async ({ request }) => { await resetData(request) })

const FO = ['u-aisha', 'u-layla', 'u-omar']
async function foLoads(request: any) {
  const q = await apiAs(request, 'u-super', '/alerts?scope=live')
  return FO.map((u) => q.rows.filter((a: any) => a.assigned_to === u))
}

test('a new alert is auto-allocated to the least-loaded analyst on arrival', async ({ request }) => {
  const before = (await foLoads(request)).map((l) => l.length)
  const r = await request.post('/api/alerts/ingest', { headers: { 'X-User': 'u-super' }, data: { alertDateTime: new Date().toISOString(), riskScore: 88, category: 'Detection', scenarioId: 'SC-412', ruleId: 'DSP-R412', ruleName: 'CNP spike', alertType: 'Phishing', cif: '1000000', accountNumber: 'AE000TEST', txnAmount: 4200 } })
  expect(r.ok()).toBeTruthy()
  const { id } = await r.json()
  const ws = await apiAs(request, 'u-super', `/alerts/${id}`)
  // Same customer already has open alerts: they stay with that customer's analyst; otherwise the least-loaded one.
  const sameCustomerOwner = ws.sameCustomerOpen.find((x: any) => x.assigned_to)?.assigned_to
  const leastLoaded = FO[before.indexOf(Math.min(...before))]
  expect(ws.alert.assigned_to).toBe(sameCustomerOwner ?? leastLoaded)
  expect(ws.alert.status).toBe('WIP')
  expect(ws.events.some((e: any) => /^Auto-allocated to/.test(e.action))).toBe(true)
})

test('analysts do not see Rebalance; the queue shows the AI verdict column', async ({ page }) => {
  await openAs(page, 'u-aisha', '/alerts')
  await expect(main(page).locator('th', { hasText: 'AI verdict' })).toBeVisible()
  await expect(main(page).getByText('Not analysed').first()).toBeVisible()
  await expect(main(page).getByRole('button', { name: 'Rebalance workload' })).toHaveCount(0)
})

test('the manager previews and applies Rebalance: equal totals and an even High / Medium / Low mix', async ({ page, request }) => {
  await openAs(page, 'u-hassan', '/alerts')
  await main(page).getByRole('button', { name: 'Rebalance workload' }).click()
  const modal = page.locator('.modal')
  await expect(modal.locator('table').first()).toContainText('Aisha Rahman')
  const move = modal.getByRole('button', { name: /^Move \d+ alert/ })
  await expect(move).toBeEnabled()
  await move.click()
  await expect(toast(page)).toContainText('Workload rebalanced')
  await expect(modal).toContainText('alert(s) moved')

  const loads = await foLoads(request)
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
  expect(spread(loads.map((l) => l.length))).toBeLessThanOrEqual(1)
  for (const p of ['High', 'Medium', 'Low']) expect(spread(loads.map((l) => l.filter((a: any) => a.priority === p).length)), p).toBeLessThanOrEqual(1)
})

test('the alert page shows the AI recommendation panel in place of the old placeholder', async ({ page }) => {
  await openAs(page, 'u-aisha', '/alerts/ALT-TC-A01')
  const rail = page.getByLabel('AI recommendation')
  await expect(rail).toContainText('Recommend only')
  await expect(rail).toContainText('switched off') // AI_AGENT_DISABLED in the UI test server
  await expect(main(page)).not.toContainText('AI assist')
})

test('the agent hub shows the live Disposition agent pipeline', async ({ page }) => {
  await openAs(page, 'u-hassan', '/agents')
  await expect(main(page)).toContainText('#4 Disposition agent')
  await expect(main(page)).toContainText('Presidio masking service')
  await expect(main(page).getByRole('button', { name: 'Analyse all open alerts' })).toBeDisabled() // switched off in tests
})
