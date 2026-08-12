import type { Unit } from './ingredient'

export interface RecipeIngredient {
  ingredientId: string
  quantity: number
  unit: Unit
  quantityBase?: number
  baseUnit?: 'pcs' | 'g' | 'ml'
}

export interface RecipeComputedMetrics {
  batchCost: number
  ingredientCost: number
  costPerServing: number
  grossMargin: number
  marginPercent: number | null
}

export interface RecipeConfigurationIssue {
  code: 'MISSING_INGREDIENT' | 'INACTIVE_INGREDIENT' | 'UNIT_MISMATCH' | 'INVALID_QUANTITY' | 'INVALID_COST' | 'INVALID_YIELD'
  ingredientId?: string
  ingredientName?: string
  message: string
}

export interface RecipeConfiguration {
  isValid: boolean
  issues: RecipeConfigurationIssue[]
}

export interface Recipe {
  id: string
  name: string
  description?: string
  sellingPrice: number
  yieldServings?: number
  ingredients: RecipeIngredient[]
  computed?: RecipeComputedMetrics | null
  configuration?: RecipeConfiguration
  isActive: boolean
}
