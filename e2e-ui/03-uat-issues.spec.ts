// One regression check per issue in the UAT issues log (test-reports/UAT-Issues-Log.xlsx), run through the UI.
import { expect, test } from '@playwright/test'
import { actWithComment, apiAs, btn, expectHeaderStatus, main, openAs, resetData, saveDraft, section, toast } from './helpers'

test.beforeAll(async ({ request }) => { await resetData(request) })

test('#1 the API runs on a shared, persistent database and reports it', async ({ request }) => {
  const h = await (await request.get('/api/health')).json()
  expect(h.ok).toBe(true)
  expect(h.users).toBeGreaterThan(0)
  // Writes are persisted: assign an alert, read it back in a separate request.
  const r = await request.post('/api/alerts/assign', { headers: { 'X-User': 'u-aisha' }, data: { ids: ['ALT-TC-A03'] } })
  expect(r.ok()).toBeTruthy()
  const ws = await apiAs(request, 'u-aisha', '/alerts/ALT-TC-A03')
  expect([ws.alert.status, ws.alert.assigned_to]).toEqual(['WIP', 'u-aisha'])
})

test('#2 TC-A01 the raw DSP payload pop-up closes with Escape', async ({ page }) => {
  await openAs(page, 'u-aisha', '/alerts/ALT-TC-A01')
  await main(page).getByRole('button', { name: 'Raw DSP payload' }).click()
  await expect(page.locator('.modal')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.modal')).toBeHidden()
})

test('#3 / #23 TC-C16 team mailboxes: Fraud Ops and FP&I users see their team emails in the outbox', async ({ page }) => {
  await openAs(page, 'u-aisha', '/outbox')
  await expect(main(page)).toContainText('FP&I request: please create and action case FC-TC-C16')
  await openAs(page, 'u-mariam', '/outbox')
  await expect(main(page)).toContainText('fpi.team@auronova.example')
  await openAs(page, 'u-daniel', '/outbox')
  await expect(main(page)).not.toContainText('FP&I request: please create and action case FC-TC-C16')
})

test('#5 TC-A02 rule precision shows last-7-days activity and the last decision per rule', async ({ page }) => {
  await openAs(page, 'u-super', '/dashboards')
  const card = main(page).locator('.card', { hasText: 'Rule precision: feedback to DSP' })
  await expect(card.locator('th', { hasText: 'Last 7 days' })).toBeVisible()
  await expect(card.locator('th', { hasText: 'Last decision' })).toBeVisible()
  await expect(card.locator('tbody tr', { hasText: 'DSP-R205' })).toBeVisible()
})

test('#6 / #7 / #8 TC-A04 CRM refusal is a handled message (no HTTP error); calendar entry and equal columns', async ({ page }) => {
  const errors: string[] = []
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`) })
  await openAs(page, 'u-aisha', '/alerts/ALT-TC-A04')
  await btn(page, 'Assign to me').click()
  await btn(page, 'Raise EDD SR').click()
  await expect(toast(page)).toContainText('CIF not found in Siebel CRM')
  await expectHeaderStatus(page, 'WIP')
  expect(errors).toEqual([])
  await btn(page, /^Re-schedule \+24h/).click()
  await expectHeaderStatus(page, 'Re-scheduled')
  await openAs(page, 'u-aisha', '/calendar')
  const entry = main(page).locator('.cal-ev', { hasText: 'Re-scheduled alert: Lucas Moreau' })
  if (!(await entry.count())) await main(page).getByRole('button', { name: '›' }).click() // tomorrow may be next month
  await expect(main(page).locator('.cal-ev', { hasText: 'Re-scheduled alert: Lucas Moreau' })).toBeVisible()
  const widths = await main(page).locator('.cal-h').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2)
})

test('#9 global search suggests matches while typing', async ({ page }) => {
  await openAs(page, 'u-aisha', '/')
  await page.getByRole('textbox', { name: 'Global search' }).fill('ALT-TC-A07')
  const option = page.getByRole('listbox', { name: 'Search suggestions' }).getByRole('option').first()
  await expect(option).toContainText('ALT-TC-A07')
  await option.click()
  await expect(page).toHaveURL(/\/alerts\/ALT-TC-A07$/)
})

test('#10 TC-A06 while referred to FP&I, Raise EDD SR is not offered', async ({ page }) => {
  await openAs(page, 'u-layla', '/alerts/ALT-TC-A06')
  await btn(page, 'Assign to me').click()
  await actWithComment(page, 'Refer to FP&I', 'Is the beneficiary a known mule?')
  await expectHeaderStatus(page, 'Referred to FP&I')
  await expect(main(page).getByRole('button', { name: 'Raise EDD SR' })).toHaveCount(0)
  await expect(btn(page, 'Submit decision')).toBeDisabled()
})

test('#11 TC-A07 the activity log names the colleague on re-assign', async ({ page }) => {
  await openAs(page, 'u-omar', '/alerts/ALT-TC-A07')
  await btn(page, 'Assign to me').click()
  await btn(page, 'Re-assign').click()
  await page.locator('.modal').getByLabel('Analyst').selectOption({ label: 'Layla Nasser' })
  await page.locator('.modal-foot').getByRole('button', { name: 'Re-assign' }).click()
  await expect(main(page)).toContainText('Re-assigned to Layla Nasser')
  await expect(main(page)).not.toContainText('Re-assigned to u-layla')
})

test('#12 / #13 TC-A10 blocked alert is requested once; the HR creator cannot delete the case', async ({ page }) => {
  const hits: number[] = []
  page.on('response', (r) => { if (r.url().endsWith('/api/alerts/ALT-TC-A10')) hits.push(r.status()) })
  await openAs(page, 'u-aisha', '/alerts/ALT-TC-A10')
  await expect(main(page)).toContainText('Chinese wall')
  await page.waitForTimeout(1500)
  expect(hits.filter((s) => s === 403).length).toBeLessThanOrEqual(2) // React dev mode mounts twice; no retries on 403
  expect(hits.filter((s) => s === 403).length).toBeGreaterThanOrEqual(1)

  await openAs(page, 'u-daniel', '/alerts/ALT-TC-A10')
  await btn(page, 'Assign to me').click()
  await page.getByLabel(/^Decision/).selectOption('Confirmed Fraud')
  await page.getByLabel(/^Sub-classification/).selectOption('External fraud')
  await page.getByLabel(/^Rationale/).fill('Staff account received customer funds.')
  await btn(page, 'Submit decision').click()
  await btn(page, 'Create a case for investigation').click()
  await expect(page).toHaveURL(/\/cases\/FC-/)
  await expect(main(page)).toContainText('waiting in the Fraud Ops Maker pool')
  await expect(main(page).getByRole('button', { name: 'Delete draft' })).toHaveCount(0)
})

test('#14 TC-A12 the overdue row is shaded red in the alert queue', async ({ page }) => {
  await openAs(page, 'u-omar', '/alerts')
  const row = main(page).locator('tr.overdue', { hasText: 'ALT-TC-A12' })
  await expect(row).toBeVisible()
  const bg = await row.locator('td').nth(1).evaluate((td) => getComputedStyle(td).backgroundColor)
  expect(bg).toBe('rgb(255, 241, 241)')
})

test('#15 TC-B03 recent prevention decisions are newest first', async ({ page }) => {
  for (const [user, id] of [['u-layla', 'ALT-TC-B04'], ['u-omar', 'ALT-TC-B03']] as const) {
    await openAs(page, user, `/alerts/${id}`)
    await page.getByLabel(/^Decision/).selectOption(id === 'ALT-TC-B03' ? 'Reject' : 'Approve')
    await page.getByLabel(/^Reason/).selectOption({ index: 1 })
    await page.getByLabel(/^Description/).fill('Decision recorded by the automated UI test.')
    await btn(page, 'Submit decision').click()
    await expectHeaderStatus(page, 'Closed')
  }
  await openAs(page, 'u-super', '/prevention')
  const recent = main(page).locator('.card', { hasText: 'Recent decisions' }).locator('tbody tr')
  await expect(recent.first()).toContainText('ALT-TC-B03') // decided last
  await expect(recent.nth(1)).toContainText('ALT-TC-B04')
})

test('#16 TC-C01 a manual case starts with today as Date reported', async ({ page }) => {
  await openAs(page, 'u-aisha', '/cases')
  await btn(page, /New case/).click()
  await page.locator('.modal').getByLabel('Customer CIF').fill('8800301')
  await page.locator('.modal').getByLabel(/^Case description/).fill('Customer reports three transfers to a fake investment platform.')
  await page.locator('.modal-foot').getByRole('button', { name: 'Create case' }).click()
  await expect(page).toHaveURL(/\/cases\/FC-/)
  await section(page, 'Source details')
  const today = new Date().toISOString().slice(0, 10)
  await expect(page.getByLabel(/^Date reported/)).toHaveValue(today)
  await expect(main(page).getByText('Before submitting:')).not.toContainText('Date reported')
})

test('#17 TC-C02 the maker sees the Checker rule FR-CASE-030', async ({ page }) => {
  await openAs(page, 'u-omar', '/cases/FC-TC-C02')
  await expect(main(page)).toContainText('the Fraud Ops Maker cannot be the Checker of the same case (FR-CASE-030)')
})

test('#18 TC-C05 routing R1 emails Cyber Security only', async ({ page }) => {
  await openAs(page, 'u-layla', '/cases/FC-TC-C05')
  await btn(page, /^Pick up from/).click()
  await actWithComment(page, 'Approve (apply routing rules)', 'Approve: forward to Cyber Security.')
  await expectHeaderStatus(page, 'Approved and Closed (FO)')
  await openAs(page, 'u-super', '/outbox')
  const row = main(page).locator('tbody tr', { hasText: 'Case FC-TC-C05 closed by routing rule R1' })
  await expect(row).toContainText('cyber.security@auronova.example')
  await expect(row).not.toContainText('group.compliance@')
})

test('#19 TC-C13 the configuration toast names the setting, not its key', async ({ page }) => {
  await openAs(page, 'u-mariam', '/config')
  const x = page.getByLabel(/^Advance Fee Scam threshold "X"/)
  await x.fill('10000')
  await x.locator('xpath=ancestor::div[contains(@class,"row")][1]').getByRole('button', { name: 'Save' }).click()
  await expect(toast(page)).toContainText('Advance Fee Scam threshold X saved')
  await expect(toast(page)).not.toContainText('afsThresholdAed')
})

test('#20 / #21 / #22 TC-C14 delete draft: in-app confirmation, only the creator, no reload of the deleted case', async ({ page }) => {
  await openAs(page, 'u-omar', '/cases/FC-TC-C14')
  await expect(main(page).getByRole('button', { name: 'Delete draft' })).toHaveCount(0)
  const notFound: string[] = []
  page.on('response', (r) => { if (r.url().includes('/api/cases/FC-TC-C14') && r.status() === 404) notFound.push(r.url()) })
  let nativeDialog = false
  page.on('dialog', async (d) => { nativeDialog = true; await d.dismiss() })
  await openAs(page, 'u-aisha', '/cases/FC-TC-C14')
  await btn(page, 'Delete draft').click()
  const modal = page.locator('.modal')
  await expect(modal).toContainText('Delete draft FC-TC-C14?')
  await modal.locator('.modal-foot').getByRole('button', { name: 'Delete draft' }).click()
  await expect(page).toHaveURL(/\/cases$/)
  await expect(toast(page)).toContainText('Draft deleted')
  await page.waitForTimeout(1500)
  expect(nativeDialog).toBe(false)
  expect(notFound).toEqual([])
})

test('#24 TC-D04 a non-AFS case in investigation has no "Approve Advance Fee Scam" button', async ({ page }) => {
  await openAs(page, 'u-rashid', '/cases/FC-TC-E01')
  await expect(btn(page, 'Submit to Reviewer')).toBeVisible()
  await expect(main(page).getByRole('button', { name: /Approve Advance Fee Scam/ })).toHaveCount(0)
  await openAs(page, 'u-rashid', '/cases/FC-TC-D04')
  await expect(btn(page, /Approve Advance Fee Scam/)).toBeVisible()
})

test('TC-C01 the Maker can save a draft with mandatory fields missing, and Show Diff records the change', async ({ page }) => {
  await openAs(page, 'u-aisha', '/cases')
  await btn(page, /New case/).click()
  await page.locator('.modal').getByLabel('Customer CIF').fill('8800301')
  await page.locator('.modal').getByLabel(/^Case description/).fill('Draft save check.')
  await page.locator('.modal-foot').getByRole('button', { name: 'Create case' }).click()
  await section(page, 'Risk classification')
  await page.getByLabel(/^Risk Category \(L1\)/).selectOption('Investment Scam')
  await saveDraft(page)
  await section(page, 'Show Diff')
  await expect(main(page)).toContainText('risk_l1')
})
