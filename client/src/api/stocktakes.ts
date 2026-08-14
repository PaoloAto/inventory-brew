import { request, type PaginatedResponse } from './http'
import type { Unit } from '../types/ingredient'

export type StocktakeStatus = 'DRAFT' | 'POSTED' | 'CANCELLED'

export interface StocktakeLine {
  ingredientId: string
  ingredientNameSnapshot: string
  categorySnapshot: string
  unit: Unit
  baseUnit: 'pcs' | 'g' | 'ml'
  expectedStockQuantitySnapshot: number
  expectedStockQuantityBaseSnapshot: number
  countedQuantity: number | null
  countedQuantityBase: number | null
  varianceQuantity: number | null
  varianceQuantityBase: number | null
  unitCostSnapshot: number | null
  varianceValue: number | null
}

export interface StocktakeSummary {
  lineCount: number
  varianceLineCount: number
  shortageLineCount: number
  overageLineCount: number
  netVarianceValue: number
  absoluteVarianceValue: number
}

export interface StocktakeListItem {
  id: string
  name: string
  status: StocktakeStatus
  startedAt: string
  postedAt: string | null
  cancelledAt: string | null
  lineCount: number
  countedLineCount: number
  varianceLineCount: number
  netVarianceValue: number
  absoluteVarianceValue: number
}

export interface Stocktake extends Omit<StocktakeListItem, 'lineCount' | 'varianceLineCount' | 'netVarianceValue' | 'absoluteVarianceValue'> {
  _id: string
  notes: string
  operationId: string | null
  lines: StocktakeLine[]
  summary: StocktakeSummary
}

export interface StocktakeConflict {
  ingredientId: string
  ingredientName: string
  unit: Unit
  expectedQuantity: number
  currentQuantity: number | null
}

export const listStocktakes = (query: { status?: StocktakeStatus; search?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number; sortOrder?: 'asc' | 'desc' } = {}) =>
  request<PaginatedResponse<StocktakeListItem>>('/stocktakes', { method: 'GET', query })

export const getStocktake = (id: string) => request<Stocktake>(`/stocktakes/${id}`, { method: 'GET' })
export const startStocktake = (payload: { name: string; notes?: string }) => request<Stocktake>('/stocktakes', { method: 'POST', body: payload })
export const saveStocktake = (id: string, counts: Array<{ ingredientId: string; countedQuantity: number | null }>) => request<Stocktake>(`/stocktakes/${id}`, { method: 'PUT', body: { counts } })
export const finishStocktake = (id: string) => request<Stocktake>(`/stocktakes/${id}/post`, { method: 'POST' })
export const cancelStocktake = (id: string) => request<Stocktake>(`/stocktakes/${id}/cancel`, { method: 'POST' })
