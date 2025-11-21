import type { Ingredient } from '../types/ingredient'

export const mockIngredients: Ingredient[] = [
  {
    id: 'ing-1',
    name: 'Carrot',
    manufacturer: 'Fresh Farms',
    unit: 'pcs',
    stockQuantity: 30,
    costPerUnit: 3.5,
    reorderLevel: 10,
    isActive: true,
  },
  {
    id: 'ing-2',
    name: 'Chicken Breast',
    manufacturer: 'Poultry Co.',
    unit: 'g',
    stockQuantity: 5000,
    costPerUnit: 0.12,
    reorderLevel: 1200,
    isActive: true,
  },
  {
    id: 'ing-3',
    name: 'Olive Oil',
    manufacturer: 'Mediterranea',
    unit: 'ml',
    stockQuantity: 3200,
    costPerUnit: 0.03,
    reorderLevel: 600,
    isActive: true,
  },
]

export const ingredientCostMap = Object.fromEntries(mockIngredients.map((ing) => [ing.id, ing.costPerUnit]))

export const computeTotalStockValue = (ingredients: Ingredient[]) =>
  ingredients.reduce((sum, ing) => sum + ing.stockQuantity * ing.costPerUnit, 0)
