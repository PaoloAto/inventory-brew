import { expect, type APIRequestContext, type APIResponse } from '@playwright/test'

const API_URL = 'http://127.0.0.1:5001/api'
const RESET_URL = 'http://127.0.0.1:5002/reset'

export interface SupplierFixture {
  _id: string
  name: string
}

export interface IngredientFixture {
  _id: string
  name: string
  unit: 'pcs'
  stockQuantity: number
  stockQuantityBase: number
}

export interface RecipeFixture {
  _id: string
  name: string
}

interface Paginated<T> {
  items: T[]
  pagination: { total: number }
}

const readJson = async <T>(response: APIResponse, label: string): Promise<T> => {
  const body = await response.text()
  expect(response.ok(), `${label} failed (${response.status()}): ${body}`).toBeTruthy()
  return JSON.parse(body) as T
}

export const resetTestState = async (request: APIRequestContext) => {
  await readJson(await request.post(RESET_URL), 'Reset E2E state')
}

export const createSupplier = async (request: APIRequestContext, name: string) =>
  readJson<SupplierFixture>(
    await request.post(`${API_URL}/suppliers`, { data: { name } }),
    `Create supplier ${name}`,
  )

export const createIngredient = async (
  request: APIRequestContext,
  input: {
    name: string
    stockQuantity: number
    costPerUnit: number
    preferredSupplierId?: string
    reorderLevel?: number
    parLevel?: number
  },
) =>
  readJson<IngredientFixture>(
    await request.post(`${API_URL}/ingredients`, {
      data: {
        ...input,
        unit: 'pcs',
      },
    }),
    `Create ingredient ${input.name}`,
  )

export const createRecipe = async (
  request: APIRequestContext,
  input: {
    name: string
    ingredientId: string
    quantity: number
    sellingPrice?: number
  },
) =>
  readJson<RecipeFixture>(
    await request.post(`${API_URL}/recipes`, {
      data: {
        name: input.name,
        sellingPrice: input.sellingPrice ?? 100,
        yieldServings: 1,
        ingredients: [{ ingredientId: input.ingredientId, quantity: input.quantity, unit: 'pcs' }],
      },
    }),
    `Create recipe ${input.name}`,
  )

export const recordHistoricalSales = async (
  request: APIRequestContext,
  recipeId: string,
  businessDates: string[],
  servingsSold: number,
) => {
  for (const businessDate of businessDates) {
    await readJson(
      await request.post(`${API_URL}/sales/records`, {
        data: { businessDate, lines: [{ recipeId, servingsSold }] },
      }),
      `Record historical sales for ${businessDate}`,
    )
  }
}

export const recordWaste = async (
  request: APIRequestContext,
  ingredientId: string,
  input: { quantity: number; reasonCode: 'WASTE_SPOILAGE'; note?: string },
) =>
  readJson(
    await request.post(`${API_URL}/ingredients/${ingredientId}/waste`, { data: input }),
    'Record waste fixture',
  )

export const createPurchaseOrder = async (
  request: APIRequestContext,
  input: {
    supplierId: string
    ingredientId: string
    orderedQuantity: number
    expectedUnitCost: number
  },
) =>
  readJson<PurchaseOrderFixture>(
    await request.post(`${API_URL}/purchase-orders`, {
      data: {
        supplierId: input.supplierId,
        items: [
          {
            ingredientId: input.ingredientId,
            orderedQuantity: input.orderedQuantity,
            expectedUnitCost: input.expectedUnitCost,
          },
        ],
      },
    }),
    'Create purchase order fixture',
  )

export const getDashboardOverview = async (request: APIRequestContext, asOf: string) =>
  readJson<{
    inventory: {
      items: Array<{ id: string; suggestedReorderQuantity: number | null }>
    }
  }>(
    await request.get(`${API_URL}/dashboard/overview`, { params: { asOf } }),
    'Get dashboard overview',
  )

export const getIngredient = async (request: APIRequestContext, id: string) =>
  readJson<IngredientFixture>(await request.get(`${API_URL}/ingredients/${id}`), 'Get ingredient')

export const getIngredientTransactionCount = async (request: APIRequestContext, id: string) => {
  const response = await readJson<Paginated<unknown>>(
    await request.get(`${API_URL}/ingredients/${id}/transactions`, { params: { page: 1, limit: 1 } }),
    'Get ingredient transaction count',
  )
  return response.pagination.total
}

export interface InventoryTransactionFixture {
  _id: string
  type: 'IN' | 'OUT' | 'ADJUST'
  quantity: number
  deltaQuantity: number
  previousStock: number
  newStock: number
  reasonCode: string
  unitCost: number
  referenceType: string
  referenceId?: string
}

export const listIngredientTransactions = async (request: APIRequestContext, id: string) =>
  readJson<Paginated<InventoryTransactionFixture>>(
    await request.get(`${API_URL}/ingredients/${id}/transactions`, { params: { page: 1, limit: 100 } }),
    'List ingredient transactions',
  )

export const adjustIngredientStock = async (
  request: APIRequestContext,
  id: string,
  payload: { type: 'OUT'; quantity: number; reason: string },
) =>
  readJson(
    await request.post(`${API_URL}/ingredients/${id}/adjust-stock`, { data: payload }),
    'Adjust ingredient stock',
  )

export interface StocktakeFixture {
  _id: string
  status: 'DRAFT' | 'POSTED' | 'CANCELLED'
  summary: {
    lineCount: number
    varianceLineCount: number
    shortageLineCount: number
    overageLineCount: number
  }
}

export const getStocktake = async (request: APIRequestContext, id: string) =>
  readJson<StocktakeFixture>(await request.get(`${API_URL}/stocktakes/${id}`), 'Get stock count')

export interface WasteFixture {
  ingredientName: string
  quantity: number
  reasonCode: string
  lossValue: number
  note: string
}

export const listWaste = async (request: APIRequestContext, ingredientId: string) =>
  readJson<Paginated<WasteFixture>>(
    await request.get(`${API_URL}/waste`, { params: { ingredientId, limit: 100 } }),
    'List waste history',
  )

export interface PurchaseOrderFixture {
  _id: string
  supplierNameSnapshot: string
  status: string
  items: Array<{ ingredientId: string; orderedQuantity: number; receivedQuantity: number }>
}

export const listPurchaseOrders = async (request: APIRequestContext) =>
  readJson<Paginated<PurchaseOrderFixture>>(
    await request.get(`${API_URL}/purchase-orders`, { params: { limit: 100 } }),
    'List purchase orders',
  )

export interface ProductionFixture {
  recipeId: string
  recipeNameSnapshot: string
  servings: number
}

export const listProduction = async (request: APIRequestContext) =>
  readJson<Paginated<ProductionFixture>>(
    await request.get(`${API_URL}/production`, { params: { limit: 100 } }),
    'List production history',
  )

export interface SalesRecordListFixture {
  id: string
  status: 'ACTIVE' | 'CANCELLED'
}

export interface SalesRecordFixture {
  _id: string
  status: 'ACTIVE' | 'CANCELLED'
}

export const listSalesRecords = async (request: APIRequestContext) =>
  readJson<Paginated<SalesRecordListFixture>>(
    await request.get(`${API_URL}/sales/records`, { params: { limit: 100 } }),
    'List sales records',
  )

export const getSalesRecord = async (request: APIRequestContext, id: string) => {
  const response = await readJson<{ record: SalesRecordFixture }>(
    await request.get(`${API_URL}/sales/records/${id}`),
    'Get sales record',
  )
  return response.record
}
