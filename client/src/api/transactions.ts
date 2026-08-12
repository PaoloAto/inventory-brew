import { request, type PaginatedResponse } from './http'

export type InventoryTransactionType = 'IN' | 'OUT' | 'ADJUST'
export type InventoryTransactionReferenceType = 'recipe' | 'manual' | 'purchase' | 'system'

interface InventoryTransactionDTO {
  _id: string
  ingredientId: string
  type: InventoryTransactionType
  quantity: number
  deltaQuantity?: number
  previousStock: number
  newStock: number
  reason?: string
  reasonCode?: string
  operationId?: string
  unitCost?: number
  referenceType?: InventoryTransactionReferenceType
  referenceId?: string
  createdAt: string
  updatedAt: string
  ingredient?: {
    id: string
    name: string
    unit: string
    isActive: boolean
  } | null
  reference?: {
    type: string
    id: string | null
    name: string | null
    isActive: boolean | null
  } | null
}

export interface InventoryTransaction {
  id: string
  ingredientId: string
  type: InventoryTransactionType
  quantity: number
  deltaQuantity?: number
  previousStock: number
  newStock: number
  reason?: string
  reasonCode?: string
  operationId?: string
  unitCost?: number
  referenceType?: InventoryTransactionReferenceType
  referenceId?: string
  createdAt: string
  updatedAt: string
  ingredient?: {
    id: string
    name: string
    unit: string
    isActive: boolean
  } | null
  reference?: {
    type: string
    id: string | null
    name: string | null
    isActive: boolean | null
  } | null
}

export interface TransactionQuery {
  ingredientId?: string
  type?: InventoryTransactionType
  referenceType?: InventoryTransactionReferenceType
  referenceId?: string
  reason?: string
  dateFrom?: string
  dateTo?: string
  includeRelated?: boolean
  page?: number
  limit?: number
  sortBy?:
    | 'createdAt'
    | 'updatedAt'
    | 'type'
    | 'quantity'
    | 'previousStock'
    | 'newStock'
    | 'unitCost'
  sortOrder?: 'asc' | 'desc'
}

const toInventoryTransaction = (dto: InventoryTransactionDTO): InventoryTransaction => ({
  id: dto._id,
  ingredientId: dto.ingredientId,
  type: dto.type,
  quantity: dto.quantity,
  deltaQuantity: dto.deltaQuantity,
  previousStock: dto.previousStock,
  newStock: dto.newStock,
  reason: dto.reason,
  reasonCode: dto.reasonCode,
  operationId: dto.operationId,
  unitCost: dto.unitCost,
  referenceType: dto.referenceType,
  referenceId: dto.referenceId,
  createdAt: dto.createdAt,
  updatedAt: dto.updatedAt,
  ingredient: dto.ingredient ?? null,
  reference: dto.reference ?? null,
})

export const listTransactions = async (
  query: TransactionQuery = {},
): Promise<PaginatedResponse<InventoryTransaction>> => {
  const response = await request<PaginatedResponse<InventoryTransactionDTO>>('/transactions', {
    method: 'GET',
    query,
  })

  return {
    items: response.items.map(toInventoryTransaction),
    pagination: response.pagination,
  }
}
