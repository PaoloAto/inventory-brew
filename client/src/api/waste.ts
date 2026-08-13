import type { Ingredient } from '../types/ingredient'
import { request, type PaginationMeta } from './http'
import { toIngredient, type IngredientDTO, type InventoryTransactionDTO } from './ingredients'

export type WasteReasonCode =
  | 'WASTE_SPOILAGE'
  | 'WASTE_EXPIRED'
  | 'WASTE_PREP'
  | 'WASTE_DAMAGE'
  | 'WASTE_OTHER'

export const wasteReasonLabels: Record<WasteReasonCode, string> = {
  WASTE_SPOILAGE: 'Spoilage',
  WASTE_EXPIRED: 'Expired',
  WASTE_PREP: 'Prep waste',
  WASTE_DAMAGE: 'Damage',
  WASTE_OTHER: 'Other',
}

export const wasteReasonCodes = Object.keys(wasteReasonLabels) as WasteReasonCode[]

export interface RecordWastePayload {
  quantity: number
  reasonCode: WasteReasonCode
  note?: string
}

export interface WasteItem {
  id: string
  ingredientId: string
  ingredientName: string
  unit: string
  quantity: number
  unitCost?: number
  lossValue: number
  reasonCode: WasteReasonCode
  note: string
  previousStock: number
  newStock: number
  operationId?: string
  createdAt: string
}

export interface WasteSummary {
  eventCount: number
  totalWasteValue: number
  byReason: Array<{
    reasonCode: WasteReasonCode
    eventCount: number
    totalWasteValue: number
  }>
}

export interface WasteQuery {
  ingredientId?: string
  reasonCode?: WasteReasonCode
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
  sortOrder?: 'asc' | 'desc'
}

export interface WasteHistoryResponse {
  items: WasteItem[]
  summary: WasteSummary
  pagination: PaginationMeta
}

export const recordWaste = async (ingredientId: string, payload: RecordWastePayload) => {
  const response = await request<{
    ingredient: IngredientDTO
    transaction: InventoryTransactionDTO
    operationId: string
    lossValue: number
  }>(`/ingredients/${ingredientId}/waste`, { method: 'POST', body: payload })
  return {
    ingredient: toIngredient(response.ingredient) as Ingredient,
    transaction: response.transaction,
    operationId: response.operationId,
    lossValue: response.lossValue,
  }
}

export const listWaste = (query: WasteQuery = {}) =>
  request<WasteHistoryResponse>('/waste', { method: 'GET', query })
