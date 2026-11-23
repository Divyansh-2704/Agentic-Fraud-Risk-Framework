// Full journeys through the UI only: TC-A01 (alert to closed case across six users) and TC-A02 (false positive).
import { expect, test } from '@playwright/test'
import { actWithComment, btn, expectHeaderStatus, main, openAs, resetData, saveDraft, section, toast } from './helpers'

test.beforeAll(async ({ request }) => { await resetData(request) })

test('TC-A01 alert to closed case: Confirmed Fraud, Maker, Checker, Investigator, Reviewer, Approver', async ({ page }) => {
  // Fraud Ops analyst confirms fraud and raises the case
  await openAs(page, 'u-aisha', '/alerts/ALT-TC-A01')
  await btn(page, 'Assign to me').click()
  await expectHeaderStatus(page, 'WIP')
  await page.getByLabel(/^Decision/).selectOption('Confirmed Fraud')
  await page.getByLabel(/^Sub-classification/).selectOption('Scam-phishing')
  await page.getByLabel(/^Rationale/).fill('Customer confirms transfers were induced by a fake crypto platform.')
  await btn(page, 'Submit decision').click()
  await expectHeaderStatus(page, 'Closed')
  await btn(page, 'Create a case for investigation').click()
  await expect(page).toHaveURL(/\/cases\/FC-\d{4}-\d{4}$/)
  const caseUrl = new URL(page.url()).pathname
  await expectHeaderStatus(page, 'Draft')

  // Maker completes the mandatory sections and submits
  await section(page, 'Risk classification')
  await page.getByLabel(/^Risk Category \(L1\)/).selectOption('Investment Scam')
  await page.getByLabel(/^Risk Category \(L2\)/).selectOption('Fake Investment')
  await page.getByLabel(/^Risk title/).selectOption('Crypto platform')
  await section(page, 'Recommendation')
  await page.getByLabel(/^Category/).selectOption('Process')
  await saveDraft(page)
  await expect(main(page).getByText('Before submitting:')).toBeHidden()
  await actWithComment(page, 'Submit to Fraud Ops Checker', 'All sections complete.')
  await expectHeaderStatus(page, 'Submitted to FO Checker')

  // Checker approves: routing R4 sends it to FP&I
  await openAs(page, 'u-layla', caseUrl)
  await btn(page, /^Pick up from/).click()
  await actWithComment(page, 'Approve (apply routing rules)', 'Verified by checker.')
  await expectHeaderStatus(page, 'Approved for Investigation')

  // Investigator
  await openAs(page, 'u-rashid', caseUrl)
  await btn(page, /^Pick up from/).click()
  await expectHeaderStatus(page, 'Investigation in progress')
  await section(page, 'Financial impact')
  for (const [label, v] of [['Attempted fraud', '60500'], ['Successful fraud', '48500'], ['Near miss', '12000'], ['Potential loss', '20000'], ['Gross loss', '48500'], ['Recovery', '0']] as const)
    await page.getByLabel(new RegExp(`^${label} \\(AED\\)`)).fill(v)
  await section(page, 'Investigator recommendation')
  await page.getByLabel(/^Category/).selectOption('System')
  await page.getByLabel(/^Recommendation type/).selectOption('Generic')
  await page.getByLabel(/^Recommendation\b(?! type)/).fill('Tune the investment-platform rule and add a device-binding check.')
  await saveDraft(page)
  await actWithComment(page, 'Submit to Reviewer', 'Investigation complete.')
  await expectHeaderStatus(page, 'Review in progress')

  // Reviewer and Approver
  await openAs(page, 'u-khalid', caseUrl)
  await btn(page, /^Pick up from/).click()
  await actWithComment(page, 'Send to Approver', 'Material loss: send to approver.')
  await expectHeaderStatus(page, 'Pending Approval')
  await openAs(page, 'u-mariam', caseUrl)
  await btn(page, /^Pick up from/).click()
  await actWithComment(page, 'Approve (final report + close)', 'Approved.')
  await expectHeaderStatus(page, 'Final report generated and closed')
  await expect(main(page).locator('.page-head h1')).toContainText('Frozen')
  await section(page, 'Post-closure activity')
  await expect(main(page)).toContainText('Op Risk Event')
})

test('TC-A02 False Positive: closed without a case', async ({ page }) => {
  await openAs(page, 'u-aisha', '/alerts/ALT-TC-A02')
  await btn(page, 'Assign to me').click()
  await page.getByLabel(/^Decision/).selectOption('False Positive')
  await page.getByLabel(/^Sub-classification/).selectOption('Valid alert-non fraud')
  await expect(btn(page, 'Submit decision')).toBeDisabled() // rationale is mandatory
  await page.getByLabel(/^Rationale/).fill('Customer confirmed month-end bill payments by recorded call.')
  await btn(page, 'Submit decision').click()
  await expect(toast(page)).toContainText('Decision recorded')
  await expectHeaderStatus(page, 'Closed')
  await expect(main(page).getByRole('button', { name: 'Create a case for investigation' })).toHaveCount(0)
})
