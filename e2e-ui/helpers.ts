import { expect, type APIRequestContext, type Page } from '@playwright/test'

/** Re-seed the test database (same as "Reset demo data" on the Test scenarios page). */
export async function resetData(request: APIRequestContext) {
  const r = await request.post('/api/admin/reset', { headers: { 'X-User': 'u-super' }, timeout: 180_000 })
  expect(r.ok(), `reset failed: ${r.status()} ${await r.text()}`).toBeTruthy()
}

/** Open a page as one of the demo users (the user switcher stores the choice in localStorage). */
export async function openAs(page: Page, userId: string, path: string) {
  await page.goto('/')
  await page.evaluate((u) => localStorage.setItem('fcms.user', u), userId)
  await page.goto(path)
  await expect(page.locator('main.content')).toBeVisible()
}

/** API call as a user (for checks that do not need the UI). */
export async function apiAs(request: APIRequestContext, userId: string, path: string) {
  const r = await request.get(`/api${path}`, { headers: { 'X-User': userId } })
  expect(r.ok(), `${path} -> ${r.status()}`).toBeTruthy()
  return r.json()
}

export const main = (page: Page) => page.locator('main.content')
export const btn = (page: Page, name: string | RegExp) => main(page).getByRole('button', { name }).first()
export const toast = (page: Page) => page.locator('.toasts')

/** Click an action that opens the comment pop-up, type the comment and confirm. */
export async function actWithComment(page: Page, action: string | RegExp, comment: string) {
  await btn(page, action).click()
  const modal = page.locator('.modal')
  await expect(modal).toBeVisible()
  await modal.locator('textarea').fill(comment)
  await modal.locator('.modal-foot').getByRole('button').last().click()
  await expect(modal).toBeHidden()
}

/** Select a case section in the left side panel. */
export async function section(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Case sections' }).getByRole('button', { name: new RegExp(`^${name}`) }).click()
}

export async function saveDraft(page: Page) {
  await main(page).getByRole('button', { name: 'Save draft' }).click()
  await expect(toast(page)).toContainText('Saved')
}

/** The case or alert header shows the current status as a badge next to the ID. */
export async function expectHeaderStatus(page: Page, status: string) {
  await expect(main(page).locator('.page-head h1')).toContainText(status)
}
