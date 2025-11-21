export type Unit = 'pcs' | 'g' | 'kg' | 'ml' | 'l'

export interface Ingredient {
  id: string
  name: string
  category?: string
  unit: Unit
  stockQuantity: number
  costPerUnit: number
  reorderLevel?: number
  isActive: boolean
  manufacturer?: string
}
