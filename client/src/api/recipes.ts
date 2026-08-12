import type { Unit } from '../types/ingredient'
import type {
  Recipe,
  RecipeComputedMetrics,
  RecipeConfiguration,
} from '../types/recipe'
import { request, type PaginatedResponse } from './http'

interface RecipeIngredientDTO {
  ingredientId: string
  quantity: number
  unit: Unit
  quantityBase?: number
  baseUnit?: 'pcs' | 'g' | 'ml'
}

interface RecipeDTO {
  _id: string
  name: string
  description?: string
  sellingPrice: number
  yieldServings: number
  ingredients: RecipeIngredientDTO[]
  computed?: RecipeComputedMetrics | null
  configuration?: RecipeConfiguration
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface RecipeIngredientDetail {
  ingredientId: string
  ingredientName: string
  ingredientUnit: Unit | null
  ingredientIsActive: boolean
  quantity: number
  unit: Unit
  costPerUnit: number | null
  costContribution: number | null
}

export interface RecipeDetails {
  recipe: Recipe
  ingredientDetails: RecipeIngredientDetail[]
  computed?: RecipeComputedMetrics | null
  configuration?: RecipeConfiguration
}

export interface RecipeQuery {
  search?: string
  includeInactive?: boolean
  onlyInactive?: boolean
  includeComputed?: boolean
  page?: number
  limit?: number
  sortBy?: 'name' | 'sellingPrice' | 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
}

export interface RecipeWritePayload {
  name: string
  description?: string
  sellingPrice: number
  yieldServings: number
  ingredients: Array<{
    ingredientId: string
    quantity: number
    unit: Unit
  }>
  isActive?: boolean
}

export interface RecipeUpdatePayload {
  name?: string
  description?: string
  sellingPrice?: number
  yieldServings?: number
  ingredients?: Array<{
    ingredientId: string
    quantity: number
    unit: Unit
  }>
}

export interface CookPreviewRequirement {
  ingredientId: string
  ingredientName: string
  unit: Unit
  requiredQuantity: number
  requiredQuantityBase: number
  availableQuantity: number
  availableQuantityBase: number
  shortfall: number
  canSatisfy: boolean
  costPerUnit: number
  estimatedLineCost: number
}

export interface CookPreviewResponse {
  recipe: {
    id: string
    name: string
    yieldServings: number
    sellingPrice: number
  }
  requestedServings: number
  canCook: boolean
  maxCookableServings: number
  estimatedIngredientCost: number
  expectedRevenue: number
  estimatedGrossMargin: number
  requirements: CookPreviewRequirement[]
}

export interface CookRecipeResponse {
  message: string
  executionMode: 'transaction' | 'fallback'
  recipe: {
    id: string
    name: string
  }
  servings: number
  consumption: Array<{
    ingredientId: string
    ingredientName: string
    unit: Unit
    requiredQuantity: number
    previousStock: number
    newStock: number
    costPerUnit: number
  }>
  transactionsCreated: number
  cookEventId: string
  operationId: string
  replayed: boolean
}

const toRecipe = (dto: RecipeDTO): Recipe => ({
  id: dto._id,
  name: dto.name,
  description: dto.description,
  sellingPrice: dto.sellingPrice,
  yieldServings: dto.yieldServings ?? 1,
  ingredients: dto.ingredients.map((line) => ({
    ingredientId: line.ingredientId,
    quantity: line.quantity,
    unit: line.unit,
    quantityBase: line.quantityBase,
    baseUnit: line.baseUnit,
  })),
  computed: dto.computed,
  configuration: dto.configuration,
  isActive: dto.isActive,
})

export const listRecipes = async (query: RecipeQuery = {}): Promise<PaginatedResponse<Recipe>> => {
  const response = await request<PaginatedResponse<RecipeDTO>>('/recipes', {
    method: 'GET',
    query,
  })

  return {
    items: response.items.map(toRecipe),
    pagination: response.pagination,
  }
}

export const getRecipeDetails = async (id: string, includeInactive = false): Promise<RecipeDetails> => {
  const response = await request<{
    recipe: RecipeDTO
    ingredientDetails: RecipeIngredientDetail[]
    computed?: RecipeComputedMetrics | null
    configuration?: RecipeConfiguration
  }>(`/recipes/${id}`, {
    method: 'GET',
    query: {
      includeInactive,
      includeComputed: true,
    },
  })

  return {
    recipe: toRecipe(response.recipe),
    ingredientDetails: response.ingredientDetails,
    computed: response.computed,
    configuration: response.configuration,
  }
}

export const createRecipe = async (payload: RecipeWritePayload): Promise<Recipe> => {
  const response = await request<RecipeDTO>('/recipes', {
    method: 'POST',
    body: payload,
  })

  return toRecipe(response)
}

export const updateRecipe = async (id: string, payload: RecipeUpdatePayload): Promise<Recipe> => {
  const response = await request<RecipeDTO>(`/recipes/${id}`, {
    method: 'PUT',
    body: payload,
  })

  return toRecipe(response)
}

export const archiveRecipe = async (id: string): Promise<Recipe> => {
  const response = await request<{ recipe: RecipeDTO }>(`/recipes/${id}`, {
    method: 'DELETE',
  })

  return toRecipe(response.recipe)
}

export const restoreRecipe = async (id: string): Promise<Recipe> => {
  const response = await request<{ recipe: RecipeDTO }>(`/recipes/${id}/restore`, {
    method: 'PATCH',
  })

  return toRecipe(response.recipe)
}

export const previewCook = async (id: string, servings: number): Promise<CookPreviewResponse> => {
  return request<CookPreviewResponse>(`/recipes/${id}/cook-preview`, {
    method: 'POST',
    body: { servings },
  })
}

export const cookRecipe = async (
  id: string,
  servings: number,
  idempotencyKey: string,
): Promise<CookRecipeResponse> => {
  return request<CookRecipeResponse>(`/recipes/${id}/cook`, {
    method: 'POST',
    body: { servings, idempotencyKey },
  })
}
