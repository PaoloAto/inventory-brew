import { expect, test } from '@playwright/test'
import { resetTestState } from './helpers/api'

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ request }) => {
  await resetTestState(request)
})

test('Mobile shell keeps core operational routes navigable without global overflow', async ({ page }) => {
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' })
  const assertNoDocumentOverflow = async () => {
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(
      dimensions.scrollWidth,
      `document overflowed: scrollWidth=${dimensions.scrollWidth}, clientWidth=${dimensions.clientWidth}`,
    ).toBeLessThanOrEqual(dimensions.clientWidth + 2)
  }
  const openNavigation = async () => {
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(navigation).toBeVisible()
  }
  const navigateFromDrawer = async (label: string, path: string, heading: string) => {
    await navigation.getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`))
    await expect(navigation).not.toBeVisible()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await assertNoDocumentOverflow()
  }

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await assertNoDocumentOverflow()

  await openNavigation()
  await expect(navigation.getByText('Inventory', { exact: true })).toBeVisible()
  await expect(navigation.getByText('Kitchen', { exact: true })).toBeVisible()
  await expect(navigation.getByText('Review', { exact: true })).toBeVisible()

  await navigateFromDrawer('Ingredients', '/ingredients', 'Ingredients')
  await openNavigation()
  await navigateFromDrawer('Purchasing', '/purchasing', 'Purchasing')
  await openNavigation()
  await navigateFromDrawer('Prep Plan', '/prep-plan', 'Prep Plan')
  await openNavigation()
  await navigateFromDrawer('Stock Count', '/stock-counts', 'Stock Count')
  await openNavigation()
  await navigateFromDrawer('Sales', '/sales', 'Sales')
})
