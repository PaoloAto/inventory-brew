import type { Recipe } from '../types/recipe'

export const mockRecipes: Recipe[] = [
  {
    id: 'r-1',
    name: 'Chicken Pasta',
    description: 'Creamy pasta with grilled chicken.',
    sellingPrice: 320,
    isActive: true,
    ingredients: [
      { ingredientId: 'ing-1', quantity: 1, unit: 'pcs' },
      { ingredientId: 'ing-2', quantity: 0.5, unit: 'kg' },
    ],
  },
  {
    id: 'r-2',
    name: 'Garden Salad',
    description: 'Fresh mixed greens with vinaigrette.',
    sellingPrice: 180,
    isActive: true,
    ingredients: [
      { ingredientId: 'ing-2', quantity: 0.2, unit: 'kg' },
      { ingredientId: 'ing-3', quantity: 0.1, unit: 'kg' },
    ],
  },
]
