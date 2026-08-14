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

import { request } from './http'

export const getInventoryPlanning = (query: InventoryPlanningQuery = {}) =>
  request<InventoryPlanningResponse>('/planning/inventory', { method: 'GET', query })
