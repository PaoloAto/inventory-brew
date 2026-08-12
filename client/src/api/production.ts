import { request, type PaginatedResponse } from './http'

export interface CookEventIngredientSnapshot {
  ingredientId: string
  ingredientNameSnapshot: string
  displayUnit: string
  baseUnit: string
  quantity: number
  quantityBase: number
  costPerUnitSnapshot: number
  averageCostPerBaseUnitSnapshot: number
  lineCost: number
}

export interface CookEvent {
  _id: string
  operationId: string
  idempotencyKey?: string
  recipeId: string
  recipeNameSnapshot: string
  servings: number
  yieldServingsSnapshot: number
  sellingPricePerServingSnapshot: number
  totalIngredientCost: number
  expectedRevenue: number
  grossMarginTotal: number
  costPerServingSnapshot: number
  grossMarginPerServingSnapshot: number
  marginPercentSnapshot: number | null
  ingredients: CookEventIngredientSnapshot[]
  createdAt: string
  updatedAt: string
}

export interface ProductionQuery {
  recipeId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
  sortOrder?: 'asc' | 'desc'
}

export const listProduction = (query: ProductionQuery = {}) =>
  request<PaginatedResponse<CookEvent>>('/production', { method: 'GET', query })
