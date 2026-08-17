import type { StockStatus, Unit } from '../types/ingredient'
import type { PaginationMeta } from './http'

export type PlanningSortBy = 'urgency' | 'daysRemaining' | 'name' | 'averageDailyDepletion'

export interface InventoryPlanningItem {
  id: string
  name: string
  category?: string
  unit: Unit
  stockQuantity: number
  reorderLevel: number
  parLevel: number
  preferredSupplier: { id: string; name: string } | null
  stockStatus: StockStatus
  historyCoverageDays: number
  dataSufficient: boolean
  consumptionQuantity: number
  wasteQuantity: number
  otherOutQuantity: number
  depletionQuantity: number
  averageDailyConsumption: number
  averageDailyWaste: number
  averageDailyDepletion: number
  daysRemaining: number | null
  daysUntilReorder: number | null
  reorderTriggered: boolean
  parConfigured: boolean
  suggestedReorderQuantity: number | null
}

export interface InventoryPlanningQuery {
  lookbackDays?: 7 | 14 | 30 | 60 | 90
  search?: string
  category?: string
  reorderOnly?: boolean
  page?: number
  limit?: number
  sortBy?: PlanningSortBy
  sortOrder?: 'asc' | 'desc'
}

export interface InventoryPlanningResponse {
  items: InventoryPlanningItem[]
  summary: {
    ingredientCount: number
    outOfStockCount: number
    reorderTriggeredCount: number
    parUnconfiguredCount: number
    noDepletionDataCount: number
  }
  meta: { lookbackDays: number }
  pagination: PaginationMeta
}

export type PrepLookbackDays = 7 | 14 | 30

export interface PrepPlanMeta {
  asOf: string
  historyDateFrom: string
  historyDateTo: string
  lookbackDays: PrepLookbackDays
  recordedDayCount: number
  dataSufficient: boolean
}

export interface PrepRecommendation {
  recipeId: string
  recipeName: string
  recentServingsSold: number
  averageDailySales: number
  suggestedServings: number
}

export interface PrepIngredientRequirement {
  ingredientId: string
  ingredientName: string
  unit: Unit
  baseUnit: 'pcs' | 'g' | 'ml'
  requiredQuantity: number
  requiredQuantityBase: number
  availableQuantity: number
  availableQuantityBase: number
  shortfall: number
  shortfallBase: number
  canSatisfy: boolean
  preferredSupplier: { id: string; name: string } | null
}

export interface PrepPreview {
  summary: {
    recipeCount: number
    totalPlannedServings: number
    ingredientCount: number
    shortageIngredientCount: number
    estimatedIngredientCost: number
    canPrepare: boolean
  }
  ingredients: PrepIngredientRequirement[]
}

export interface PrepPlanResponse {
  meta: PrepPlanMeta
  recommendations: PrepRecommendation[]
  preview: PrepPreview
}

import { request } from './http'

export const getInventoryPlanning = (query: InventoryPlanningQuery = {}) =>
  request<InventoryPlanningResponse>('/planning/inventory', { method: 'GET', query })

export const getPrepPlan = (asOf: string, lookbackDays: PrepLookbackDays) =>
  request<PrepPlanResponse>('/planning/prep', {
    method: 'GET',
    query: { asOf, lookbackDays },
  })

export const previewPrepPlan = async (
  lines: Array<{ recipeId: string; servings: number }>,
) => {
  const response = await request<{ preview: PrepPreview }>('/planning/prep/preview', {
    method: 'POST',
    body: { lines },
  })
  return response.preview
}
