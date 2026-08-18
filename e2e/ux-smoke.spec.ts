import { expect, test } from '@playwright/test'
import { resetTestState } from './helpers/api'

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ request }) => {
  await resetTestState(request)
})

test('Mobile shell keeps core operational routes navigable without global overflow', async ({ page }) => {
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' })
  const assertNoDocumentOverflow = async () => {
    const hasNoOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
    )
    expect(hasNoOverflow).toBeTruthy()
  }
  const openNavigation = async () => {
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(navigation).toBeVisible()
  }
  const navigateFromDrawer = async (label: string, heading: string) => {
    await navigation.getByRole('link', { name: label }).click()
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    await expect(navigation).not.toBeVisible()
    await assertNoDocumentOverflow()
  }

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await assertNoDocumentOverflow()

  await openNavigation()
  await expect(navigation.getByText('Inventory', { exact: true })).toBeVisible()
  await expect(navigation.getByText('Kitchen', { exact: true })).toBeVisible()
  await expect(navigation.getByText('Review', { exact: true })).toBeVisible()

  await navigateFromDrawer('Ingredients', 'Ingredients')
  await openNavigation()
  await navigateFromDrawer('Purchasing', 'Purchasing')
  await openNavigation()
  await navigateFromDrawer('Prep Plan', 'Prep Plan')
  await openNavigation()
  await navigateFromDrawer('Stock Count', 'Stock Count')
  await openNavigation()
  await navigateFromDrawer('Sales', 'Sales')
})
