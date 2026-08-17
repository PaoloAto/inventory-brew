import { expect, test } from '@playwright/test'
import {
  createIngredient,
  createRecipe,
  createSupplier,
  getIngredient,
  getIngredientTransactionCount,
  getSalesRecord,
  listProduction,
  listPurchaseOrders,
  listSalesRecords,
  recordHistoricalSales,
  resetTestState,
} from './helpers/api'

test.beforeEach(async ({ request }) => {
  await resetTestState(request)
})

test('Purchasing creates, orders, and partially receives a purchase order', async ({ page, request }) => {
  await createSupplier(request, 'E2E Purchasing Supplier')
  const ingredient = await createIngredient(request, {
    name: 'E2E Purchasing Chicken',
    stockQuantity: 10,
    costPerUnit: 5,
  })

  await page.goto('/purchasing')
  await page.getByRole('button', { name: 'New purchase order' }).click()
  const draftDialog = page.getByRole('dialog', { name: 'Create draft purchase order' })
  await draftDialog.getByLabel('Supplier').click()
  await page.getByRole('option', { name: 'E2E Purchasing Supplier' }).click()
  await draftDialog.getByRole('button', { name: 'Add line' }).click()
  await draftDialog.getByLabel('Ingredient').click()
  await page.getByRole('option', { name: /E2E Purchasing Chicken/ }).click()
  await draftDialog.getByLabel('Quantity').fill('10')
  await draftDialog.getByLabel('Expected cost').fill('5')
  await draftDialog.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Draft purchase order created')).toBeVisible()

  const purchaseOrderRow = page.getByRole('row').filter({ hasText: 'E2E Purchasing Supplier' })
  await expect(purchaseOrderRow).toContainText('DRAFT')
  await purchaseOrderRow.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mark ordered' }).click()
  await expect(page.getByText('Purchase order marked ordered')).toBeVisible()
  await expect(purchaseOrderRow).toContainText('ORDERED')

  await purchaseOrderRow.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Receive' }).click()
  const receiptDialog = page.getByRole('dialog', { name: /Receive PO-/ })
  await receiptDialog.getByLabel('Receive now').fill('4')
  await receiptDialog.getByRole('button', { name: 'Record receipt' }).click()
  await expect(page.getByText('Purchase receipt recorded')).toBeVisible()
  await expect(purchaseOrderRow).toContainText('PARTIALLY_RECEIVED')

  await purchaseOrderRow.click()
  const detailsDialog = page.getByRole('dialog', { name: /PO-/ })
  const ingredientRow = detailsDialog.getByRole('row').filter({ hasText: 'E2E Purchasing Chicken' })
  await expect(ingredientRow).toContainText('4 pcs')
  await expect(ingredientRow).toContainText('6 pcs')

  expect((await getIngredient(request, ingredient._id)).stockQuantity).toBe(14)
  const orders = await listPurchaseOrders(request)
  const order = orders.items.find((item) => item.supplierNameSnapshot === 'E2E Purchasing Supplier')
  expect(order?.status).toBe('PARTIALLY_RECEIVED')
  expect(order?.items[0].receivedQuantity).toBe(4)
})

test('Cooking a recipe consumes inventory and appears in Production history', async ({ page, request }) => {
  const ingredient = await createIngredient(request, {
    name: 'E2E Production Chicken',
    stockQuantity: 10,
    costPerUnit: 5,
  })
  const recipe = await createRecipe(request, {
    name: 'E2E Production Bowl',
    ingredientId: ingredient._id,
    quantity: 2,
  })

  await page.goto('/recipes')
  await page.getByLabel('Search recipes').fill('E2E Production Bowl')
  const recipeRow = page.getByRole('row').filter({ hasText: 'E2E Production Bowl' })
  await recipeRow.getByRole('button', { name: 'Actions for E2E Production Bowl' }).click()
  await page.getByRole('menuitem', { name: 'Cook recipe' }).click()
  const cookDialog = page.getByRole('dialog', { name: 'Cook recipe' })
  await cookDialog.getByLabel('Servings').fill('2')
  await expect(cookDialog.getByText('Maximum available: 5 servings')).toBeVisible()
  await cookDialog.getByRole('button', { name: 'Cook recipe' }).click()
  await expect(page.getByText('Cooked 2 servings of E2E Production Bowl')).toBeVisible()

  await page.getByRole('link', { name: 'Production' }).click()
  const productionRow = page.getByRole('table', { name: 'Production history' })
    .getByRole('row')
    .filter({ hasText: 'E2E Production Bowl' })
  await expect(productionRow).toContainText('2')

  expect((await getIngredient(request, ingredient._id)).stockQuantity).toBe(6)
  const history = await listProduction(request)
  expect(history.items).toEqual(expect.arrayContaining([
    expect.objectContaining({
      recipeId: recipe._id,
      recipeNameSnapshot: 'E2E Production Bowl',
      servings: 2,
    }),
  ]))
})

test('Recording and cancelling Sales never mutates Ingredient inventory', async ({ page, request }) => {
  const ingredient = await createIngredient(request, {
    name: 'E2E Sales Chicken',
    stockQuantity: 10,
    costPerUnit: 5,
  })
  await createRecipe(request, {
    name: 'E2E Sales Bowl',
    ingredientId: ingredient._id,
    quantity: 1,
  })
  const beforeIngredient = await getIngredient(request, ingredient._id)
  const beforeTransactionCount = await getIngredientTransactionCount(request, ingredient._id)

  await page.goto('/sales')
  await page.getByRole('button', { name: 'Record Sales' }).click()
  const recordDialog = page.getByRole('dialog', { name: 'Record Sales' })
  await recordDialog.getByLabel('Servings sold for E2E Sales Bowl').fill('3')
  await recordDialog.getByRole('button', { name: 'Record Sales' }).click()
  await expect(page.getByText('Sales recorded.')).toBeVisible()

  const afterSaleIngredient = await getIngredient(request, ingredient._id)
  expect(afterSaleIngredient.stockQuantity).toBe(beforeIngredient.stockQuantity)
  expect(afterSaleIngredient.stockQuantityBase).toBe(beforeIngredient.stockQuantityBase)
  expect(await getIngredientTransactionCount(request, ingredient._id)).toBe(beforeTransactionCount)

  const sales = await listSalesRecords(request)
  expect(sales.items).toHaveLength(1)
  const salesTable = page.getByRole('table', { name: 'Recent sales records' })
  await salesTable.getByRole('button').click()
  const detailsDialog = page.getByRole('dialog', { name: 'Sales details' })
  await expect(detailsDialog.getByText('E2E Sales Bowl')).toBeVisible()
  await detailsDialog.getByRole('button', { name: 'Cancel record' }).click()
  const confirmDialog = page.getByRole('dialog', { name: 'Cancel sales record?' })
  await confirmDialog.getByRole('button', { name: 'Cancel record' }).click()
  await expect(page.getByText('Sales record cancelled.')).toBeVisible()
  await expect(salesTable).toContainText('Cancelled')

  expect((await getSalesRecord(request, sales.items[0].id)).status).toBe('CANCELLED')
  const afterCancelIngredient = await getIngredient(request, ingredient._id)
  expect(afterCancelIngredient.stockQuantity).toBe(beforeIngredient.stockQuantity)
  expect(afterCancelIngredient.stockQuantityBase).toBe(beforeIngredient.stockQuantityBase)
  expect(await getIngredientTransactionCount(request, ingredient._id)).toBe(beforeTransactionCount)
})

test('Prep Plan shortage opens a correctly prefilled purchase order', async ({ page, request }) => {
  const priorBusinessDates = await page.evaluate(() => {
    const dates: string[] = []
    for (let daysAgo = 1; daysAgo <= 5; daysAgo += 1) {
      const date = new Date()
      date.setHours(12, 0, 0, 0)
      date.setDate(date.getDate() - daysAgo)
      dates.push([
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-'))
    }
    return dates
  })
  const supplier = await createSupplier(request, 'E2E Prep Supplier')
  const ingredient = await createIngredient(request, {
    name: 'E2E Prep Chicken',
    stockQuantity: 2,
    costPerUnit: 5,
    preferredSupplierId: supplier._id,
  })
  const recipe = await createRecipe(request, {
    name: 'E2E Prep Bowl',
    ingredientId: ingredient._id,
    quantity: 1,
  })
  await recordHistoricalSales(request, recipe._id, priorBusinessDates, 10)

  await page.goto('/prep-plan')
  const recommendationRow = page.getByRole('table', { name: 'Prep recommendations' })
    .getByRole('row')
    .filter({ hasText: 'E2E Prep Bowl' })
  const plannedServings = recommendationRow.getByLabel('Planned servings for E2E Prep Bowl')
  await expect(plannedServings).not.toHaveValue('0')
  await expect(plannedServings).not.toHaveValue('')
  await page.getByRole('button', { name: 'Check ingredients' }).click()
  await expect(page.getByText('Ingredient needs checked.')).toBeVisible()

  const shortageRow = page.getByRole('table', { name: 'Prep ingredient needs' })
    .getByRole('row')
    .filter({ hasText: 'E2E Prep Chicken' })
  await expect(shortageRow).toContainText('Need more')
  const shortageText = await shortageRow.getByRole('cell').nth(3).textContent()
  const shortageQuantity = shortageText?.trim().split(/\s+/)[0]
  expect(shortageQuantity).toBeTruthy()
  await shortageRow.getByRole('link', { name: 'Create PO' }).click()

  await expect(page).toHaveURL(/\/purchasing$/)
  const purchaseDialog = page.getByRole('dialog', { name: 'Create draft purchase order' })
  await expect(purchaseDialog.getByLabel('Supplier')).toContainText('E2E Prep Supplier')
  await expect(purchaseDialog.getByLabel('Ingredient')).toContainText('E2E Prep Chicken')
  await expect(purchaseDialog.getByLabel('Quantity')).toHaveValue(shortageQuantity as string)
})
