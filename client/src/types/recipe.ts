import type { Unit } from './ingredient'

export interface RecipeIngredient {
  ingredientId: string
  quantity: number
  unit: Unit
}

export interface Recipe {
  id: string
  name: string
  description?: string
  sellingPrice: number
  ingredients: RecipeIngredient[]
  isActive: boolean
}
