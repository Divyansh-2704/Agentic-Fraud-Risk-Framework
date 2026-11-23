// Every scenario of the UAT pack can be started from the Test scenarios page: the Start button switches to the
// right user and opens the fixed-ID record, which is in the starting status the guide describes.
import { expect, test } from '@playwright/test'
import { SCENARIOS } from '../shared/src/scenarios'
import { apiAs, expectHeaderStatus, main, openAs, resetData } from './helpers'

test.beforeAll(async ({ request }) => { await resetData(request) })

test('Test scenarios page lists every scenario as Ready after a reset', async ({ page }) => {
  await openAs(page, 'u-super', '/scenarios')
  const seeded = SCENARIOS.filter((s) => s.records.length).length
  await expect(page.getByText(`${seeded} of ${seeded} seeded scenarios ready`)).toBeVisible({ timeout: 30_000 })
})

for (const s of SCENARIOS.filter((x) => x.records.length)) {
  test(`${s.id} Start opens ${s.records[0]} at "${s.startStatus}"`, async ({ page, request }) => {
    await openAs(page, 'u-super', '/scenarios')
    await page.getByPlaceholder('Search scenario, record or BRD ref…').fill(s.id)
    const row = page.locator('tbody tr', { has: page.locator('td:first-child', { hasText: new RegExp(`^${s.id}$`) }) })
    await row.getByRole('button', { name: 'Start' }).click()
    await expect(page).toHaveURL(new RegExp(`/${s.records[0].startsWith('ALT-') ? 'alerts' : 'cases'}/${s.records[0]}$`))
    // Some scenarios start with a Chinese-wall check: the start user must NOT see the record (e.g. TC-A10, TC-X01).
    if (s.steps[0]?.as === s.startAs && s.steps[0].expect.includes('Chinese wall')) {
      await expect(main(page)).toContainText('Chinese wall')
      const st = await apiAs(request, 'u-super', '/scenarios/status')
      expect(st[s.records[0]]).toBe(s.startStatus)
    } else await expectHeaderStatus(page, s.startStatus)
    expect(await page.evaluate(() => localStorage.getItem('fcms.user'))).toBe(s.startAs)
  })
}
