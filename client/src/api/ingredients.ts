import type { Ingredient, Unit } from '../types/ingredient'
import { request, type PaginatedResponse } from './http'

interface IngredientDTO {
  _id: string
  name: string
  manufacturer?: string
  category?: string
  unit: Unit
  stockQuantity: number
  costPerUnit: number
  reorderLevel?: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface InventoryTransactionDTO {
  _id: string
  ingredientId: string
  type: 'IN' | 'OUT' | 'ADJUST'
  quantity: number
  previousStock: number
  newStock: number
  reason?: string
  unitCost?: number
  referenceType?: 'recipe' | 'manual' | 'purchase' | 'system'
  referenceId?: string
  createdAt: string
  updatedAt: string
}

export interface IngredientQuery {
  search?: string
  category?: string
  lowStockOnly?: boolean
  healthyStockOnly?: boolean
  includeInactive?: boolean
  onlyInactive?: boolean
  page?: number
  limit?: number
  sortBy?: 'name' | 'manufacturer' | 'category' | 'stockQuantity' | 'costPerUnit' | 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
}

export interface IngredientWritePayload {
  name: string
  manufacturer?: string
  category?: string
  unit: Unit
  stockQuantity?: number
  costPerUnit: number
  reorderLevel?: number
  isActive?: boolean
}

export interface IngredientUpdatePayload {
  name?: string
  manufacturer?: string
  category?: string
  unit?: Unit
  costPerUnit?: number
  reorderLevel?: number
  isActive?: boolean
}

export type AdjustStockPayload =
  | {
      type: 'IN' | 'OUT'
      quantity: number
      reason?: string
      unitCost?: number
    }
  | {
      type: 'ADJUST'
      newStockQuantity: number
      reason?: string
      unitCost?: number
    }

const toIngredient = (dto: IngredientDTO): Ingredient => ({
  id: dto._id,
  name: dto.name,
  manufacturer: dto.manufacturer,
  category: dto.category,
  unit: dto.unit,
  stockQuantity: dto.stockQuantity,
  costPerUnit: dto.costPerUnit,
  reorderLevel: dto.reorderLevel,
  isActive: dto.isActive,
})

export const listIngredients = async (
  query: IngredientQuery = {},
): Promise<PaginatedResponse<Ingredient>> => {
  const response = await request<PaginatedResponse<IngredientDTO>>('/ingredients', {
    method: 'GET',
    query,
  })

  return {
    items: response.items.map(toIngredient),
    pagination: response.pagination,
  }
}

export const getIngredientById = async (id: string, includeInactive = false): Promise<Ingredient> => {
  const response = await request<IngredientDTO>(`/ingredients/${id}`, {
    method: 'GET',
    query: includeInactive ? { includeInactive: true } : undefined,
  })
  return toIngredient(response)
}

export const createIngredient = async (payload: IngredientWritePayload): Promise<Ingredient> => {
  const response = await request<IngredientDTO>('/ingredients', {
    method: 'POST',
    body: payload,
  })
  return toIngredient(response)
}

export const updateIngredient = async (id: string, payload: IngredientUpdatePayload): Promise<Ingredient> => {
  const response = await request<IngredientDTO>(`/ingredients/${id}`, {
    method: 'PUT',
    body: payload,
  })
  return toIngredient(response)
}

export const archiveIngredient = async (id: string): Promise<Ingredient> => {
  const response = await request<{ ingredient: IngredientDTO }>(`/ingredients/${id}`, {
    method: 'DELETE',
  })
  return toIngredient(response.ingredient)
}

export const restoreIngredient = async (id: string): Promise<Ingredient> => {
  const response = await request<{ ingredient: IngredientDTO }>(`/ingredients/${id}/restore`, {
    method: 'PATCH',
  })
  return toIngredient(response.ingredient)
}

export const adjustIngredientStock = async (
  id: string,
  payload: AdjustStockPayload,
): Promise<{ ingredient: Ingredient; transactionId: string }> => {
  const response = await request<{ ingredient: IngredientDTO; transaction: InventoryTransactionDTO }>(
    `/ingredients/${id}/adjust-stock`,
    {
      method: 'POST',
      body: payload,
    },
  )

  return {
    ingredient: toIngredient(response.ingredient),
    transactionId: response.transaction._id,
  }
}
