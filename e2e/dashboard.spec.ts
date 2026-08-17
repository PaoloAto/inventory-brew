import { expect, test } from '@playwright/test'
import {
  createIngredient,
  createPurchaseOrder,
  createRecipe,
  createSupplier,
  getDashboardOverview,
  recordHistoricalSales,
  recordWaste,
  resetTestState,
} from './helpers/api'

test.beforeEach(async ({ request }) => {
  await resetTestState(request)
})

test('Manager Overview shows cross-domain attention and hands reorder intent to Purchasing', async ({ page, request }) => {
  const dateContext = await page.evaluate(() => {
    const toDateOnly = (date: Date) => [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    const now = new Date()
    now.setHours(12, 0, 0, 0)
    return {
      asOf: toDateOnly(now),
      historyDates: Array.from({ length: 5 }, (_, index) => {
        const date = new Date(now)
        date.setDate(date.getDate() - (index + 1))
        return toDateOnly(date)
      }),
    }
  })
  const supplier = await createSupplier(request, 'E2E Overview Supplier')
  const ingredient = await createIngredient(request, {
    name: 'E2E Overview Chicken',
    stockQuantity: 2,
    costPerUnit: 5,
    reorderLevel: 5,
    parLevel: 12,
    preferredSupplierId: supplier._id,
  })
  const recipe = await createRecipe(request, {
    name: 'E2E Overview Bowl',
    ingredientId: ingredient._id,
    quantity: 1,
  })
  await recordHistoricalSales(request, recipe._id, dateContext.historyDates, 10)
  await recordWaste(request, ingredient._id, {
    quantity: 1,
    reasonCode: 'WASTE_SPOILAGE',
    note: 'E2E overview waste',
  })
  await createPurchaseOrder(request, {
    supplierId: supplier._id,
    ingredientId: ingredient._id,
    orderedQuantity: 4,
    expectedUnitCost: 5,
  })
  const overview = await getDashboardOverview(request, dateContext.asOf)
  const reorderItem = overview.inventory.items.find((item) => item.id === ingredient._id)
  expect(reorderItem?.suggestedReorderQuantity).toBeGreaterThan(0)

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByText('Attention', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sales · Last 7 days' })).toBeVisible()
  await expect(page.getByText('Estimated revenue', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Prep readiness' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Inventory attention' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Open purchasing' })).toBeVisible()
  await expect(page.getByText('Menu performance', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Waste · Last 7 days' })).toBeVisible()

  const inventorySection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Inventory attention' }),
  })
  await inventorySection.getByRole('link', { name: 'Create PO' }).click()

  await expect(page).toHaveURL(/\/purchasing$/)
  const purchaseDialog = page.getByRole('dialog', { name: 'Create draft purchase order' })
  await expect(purchaseDialog.getByLabel('Supplier')).toContainText('E2E Overview Supplier')
  await expect(purchaseDialog.getByLabel('Ingredient')).toContainText('E2E Overview Chicken')
  await expect(purchaseDialog.getByLabel('Quantity')).toHaveValue(
    String(reorderItem?.suggestedReorderQuantity),
  )
})
