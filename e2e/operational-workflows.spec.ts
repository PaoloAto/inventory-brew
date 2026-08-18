import { expect, test } from '@playwright/test'
import {
  adjustIngredientStock,
  createIngredient,
  getIngredient,
  getIngredientTransactionCount,
  getStocktake,
  listIngredientTransactions,
  listWaste,
  resetTestState,
} from './helpers/api'

test.beforeEach(async ({ request }) => {
  await resetTestState(request)
})

test('Stock Count saves across refresh and posts only its reconciliation variance', async ({ page, request }) => {
  const chicken = await createIngredient(request, { name: 'E2E Count Chicken', stockQuantity: 10, costPerUnit: 5 })
  const rice = await createIngredient(request, { name: 'E2E Count Rice', stockQuantity: 5, costPerUnit: 2 })
  const chickenTransactionsBefore = await getIngredientTransactionCount(request, chicken._id)
  const riceTransactionsBefore = await getIngredientTransactionCount(request, rice._id)

  await page.goto('/stock-counts')
  await page.getByRole('button', { name: 'Start Stock Count' }).click()
  const startDialog = page.getByRole('dialog', { name: 'Start Stock Count' })
  await startDialog.getByLabel('Stock count name').fill('E2E Operational Count')
  await startDialog.getByRole('button', { name: 'Start Stock Count' }).click()
  await expect(page).toHaveURL(/\/stock-counts\/[^/]+$/)
  const stocktakeId = page.url().split('/').pop() as string

  const chickenCount = page.getByLabel('Physical count for E2E Count Chicken')
  const riceCount = page.getByLabel('Physical count for E2E Count Rice')
  await chickenCount.fill('7')
  await page.getByRole('button', { name: 'Save for later' }).click()
  await expect(page.getByText('Stock count saved for later.')).toBeVisible()

  await page.reload()
  await expect(chickenCount).toHaveValue('7')
  await expect(riceCount).toHaveValue('')
  await expect(page.getByText('1 of 2 items counted')).toBeVisible()

  await riceCount.fill('5')
  await page.getByRole('button', { name: 'Review & finish' }).click()
  await expect(page.getByRole('heading', { name: 'Review differences' })).toBeVisible()
  const variance = page.getByText('E2E Count Chicken').locator('..')
  await expect(variance).toContainText('System 10 pcs')
  await expect(variance).toContainText('Counted 7 pcs')
  await expect(variance).toContainText('Difference -3 pcs')
  await expect(page.getByText('E2E Count Rice')).not.toBeVisible()
  await page.getByRole('button', { name: 'Confirm & update inventory' }).click()
  await expect(page.getByText('Stock Count completed. Inventory is up to date.')).toBeVisible()
  await expect(page.getByText('2 items counted')).toBeVisible()
  await expect(page.getByText('1 item had differences')).toBeVisible()
  await expect(page.getByText('Lower than expected: 1')).toBeVisible()
  await expect(page.getByText('Higher than expected: 0')).toBeVisible()

  expect((await getIngredient(request, chicken._id)).stockQuantity).toBe(7)
  expect((await getIngredient(request, chicken._id)).stockQuantityBase).toBe(7)
  expect((await getIngredient(request, rice._id)).stockQuantity).toBe(5)
  expect((await getIngredient(request, rice._id)).stockQuantityBase).toBe(5)
  expect((await getStocktake(request, stocktakeId))).toMatchObject({
    status: 'POSTED',
    summary: { lineCount: 2, varianceLineCount: 1, shortageLineCount: 1, overageLineCount: 0 },
  })
  expect(await getIngredientTransactionCount(request, chicken._id)).toBe(chickenTransactionsBefore + 1)
  expect(await getIngredientTransactionCount(request, rice._id)).toBe(riceTransactionsBefore)
  expect((await listIngredientTransactions(request, chicken._id)).items[0]).toMatchObject({
    type: 'ADJUST',
    deltaQuantity: -3,
    previousStock: 10,
    newStock: 7,
    reasonCode: 'PHYSICAL_COUNT',
    referenceType: 'stocktake',
    referenceId: stocktakeId,
  })
})

test('Waste records a canonical inventory OUT transaction and survives history refresh', async ({ page, request }) => {
  const chicken = await createIngredient(request, { name: 'E2E Waste Chicken', stockQuantity: 10, costPerUnit: 5 })
  const transactionsBefore = await getIngredientTransactionCount(request, chicken._id)

  await page.goto('/ingredients')
  const ingredientRow = page.getByRole('row').filter({ hasText: 'E2E Waste Chicken' })
  await expect(ingredientRow).toBeVisible()
  await ingredientRow.getByRole('button', { name: 'Actions for E2E Waste Chicken' }).click()
  await page.getByRole('menuitem', { name: 'Record waste' }).click()
  const wasteDialog = page.getByRole('dialog', { name: 'Record waste' })
  await wasteDialog.getByLabel('Quantity wasted').fill('2')
  await wasteDialog.getByLabel('Reason').click()
  await page.getByRole('option', { name: 'Spoilage' }).click()
  await wasteDialog.getByLabel('Note').fill('E2E spoilage')
  await wasteDialog.getByRole('button', { name: 'Record waste' }).click()
  await expect(page.getByText('2 pcs waste recorded')).toBeVisible()

  expect((await getIngredient(request, chicken._id)).stockQuantity).toBe(8)
  expect((await getIngredient(request, chicken._id)).stockQuantityBase).toBe(8)
  expect(await getIngredientTransactionCount(request, chicken._id)).toBe(transactionsBefore + 1)
  expect((await listIngredientTransactions(request, chicken._id)).items[0]).toMatchObject({
    type: 'OUT',
    quantity: 2,
    deltaQuantity: -2,
    previousStock: 10,
    newStock: 8,
    reasonCode: 'WASTE_SPOILAGE',
    unitCost: 5,
  })
  const waste = await listWaste(request, chicken._id)
  expect(waste.items).toEqual([
    expect.objectContaining({
      ingredientName: 'E2E Waste Chicken',
      quantity: 2,
      reasonCode: 'WASTE_SPOILAGE',
      lossValue: 10,
      note: 'E2E spoilage',
    }),
  ])

  await page.goto('/waste')
  const wasteRow = page.getByRole('table', { name: 'Waste history' }).getByRole('row').filter({ hasText: 'E2E Waste Chicken' })
  await expect(wasteRow).toContainText('Spoilage')
  await expect(wasteRow).toContainText('2 pcs')
  await expect(wasteRow).toContainText('E2E spoilage')
  await page.reload()
  await expect(wasteRow).toContainText('E2E Waste Chicken')
  await expect(wasteRow).toContainText('E2E spoilage')
})

test('Stock Count refuses to overwrite inventory changed after counting began', async ({ page, request }) => {
  const ingredient = await createIngredient(request, { name: 'E2E Count Conflict', stockQuantity: 10, costPerUnit: 5 })
  const transactionsBefore = await getIngredientTransactionCount(request, ingredient._id)

  await page.goto('/stock-counts')
  await page.getByRole('button', { name: 'Start Stock Count' }).click()
  const startDialog = page.getByRole('dialog', { name: 'Start Stock Count' })
  await startDialog.getByLabel('Stock count name').fill('E2E Conflict Count')
  await startDialog.getByRole('button', { name: 'Start Stock Count' }).click()
  await expect(page).toHaveURL(/\/stock-counts\/[^/]+$/)
  const stocktakeId = page.url().split('/').pop() as string

  await adjustIngredientStock(request, ingredient._id, {
    type: 'OUT',
    quantity: 2,
    reason: 'E2E external inventory change',
  })
  expect((await getIngredient(request, ingredient._id)).stockQuantity).toBe(8)
  const transactionsAfterExternalAdjustment = await getIngredientTransactionCount(request, ingredient._id)

  await page.getByLabel('Physical count for E2E Count Conflict').fill('9')
  await page.getByRole('button', { name: 'Review & finish' }).click()
  await page.getByRole('button', { name: 'Confirm & update inventory' }).click()
  const conflictDialog = page.getByRole('dialog', { name: 'Inventory changed while you were counting' })
  await expect(conflictDialog).toContainText('Started: 10 pcs')
  await expect(conflictDialog).toContainText('Now: 8 pcs')

  expect((await getIngredient(request, ingredient._id)).stockQuantity).toBe(8)
  expect((await getStocktake(request, stocktakeId)).status).toBe('DRAFT')
  expect(await getIngredientTransactionCount(request, ingredient._id)).toBe(transactionsAfterExternalAdjustment)
  expect(transactionsAfterExternalAdjustment).toBe(transactionsBefore + 1)
  expect((await listIngredientTransactions(request, ingredient._id)).items).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ referenceType: 'stocktake', referenceId: stocktakeId }),
  ]))
})

test('Waste closes and refreshes after stale stock is rejected by the API', async ({ page, request }) => {
  const ingredient = await createIngredient(request, { name: 'E2E Waste Conflict', stockQuantity: 10, costPerUnit: 5 })

  await page.goto('/ingredients')
  const ingredientRow = page.getByRole('row').filter({ hasText: 'E2E Waste Conflict' })
  await expect(ingredientRow).toBeVisible()
  await ingredientRow.getByRole('button', { name: 'Actions for E2E Waste Conflict' }).click()
  await page.getByRole('menuitem', { name: 'Record waste' }).click()
  const wasteDialog = page.getByRole('dialog', { name: 'Record waste' })

  await adjustIngredientStock(request, ingredient._id, {
    type: 'OUT',
    quantity: 6,
    reason: 'E2E external inventory change',
  })
  const transactionsAfterExternalAdjustment = await getIngredientTransactionCount(request, ingredient._id)
  await wasteDialog.getByLabel('Quantity wasted').fill('6')
  await wasteDialog.getByRole('button', { name: 'Record waste' }).click()
  await expect(page.getByText('Stock changed while you were recording waste. The current quantity has been refreshed.')).toBeVisible()
  await expect(wasteDialog).not.toBeVisible()
  await expect(ingredientRow).toContainText('4 pcs')

  expect((await getIngredient(request, ingredient._id)).stockQuantity).toBe(4)
  expect(await getIngredientTransactionCount(request, ingredient._id)).toBe(transactionsAfterExternalAdjustment)
  expect((await listWaste(request, ingredient._id)).items).toHaveLength(0)
})
