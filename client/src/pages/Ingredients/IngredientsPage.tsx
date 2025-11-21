import { useMemo, useState } from 'react'
import type { Ingredient } from '../../types/ingredient'
import { IngredientTable } from '../../components/inventory/IngredientTable'

const MOCK_INGREDIENTS: Ingredient[] = [
  {
    id: '1',
    name: 'Product-1',
    manufacturer: 'ProdWip',
    unit: 'pcs',
    stockQuantity: 2,
    costPerUnit: 2000,
    isActive: true,
  },
  {
    id: '2',
    name: 'Product-2',
    manufacturer: 'ProdWip',
    unit: 'pcs',
    stockQuantity: 5,
    costPerUnit: 1500,
    isActive: true,
  },
  {
    id: '3',
    name: 'Product-3',
    manufacturer: 'WipProd Ltd.',
    unit: 'pcs',
    stockQuantity: 2,
    costPerUnit: 2000,
    isActive: true,
  },
  {
    id: '4',
    name: 'FifthProduct',
    manufacturer: 'WipProd',
    unit: 'pcs',
    stockQuantity: 5,
    costPerUnit: 5500,
    isActive: true,
  },
  {
    id: '5',
    name: 'Product-4',
    manufacturer: 'WipProd',
    unit: 'pcs',
    stockQuantity: 4,
    costPerUnit: 4500,
    isActive: true,
  },
  {
    id: '6',
    name: 'Two Product',
    manufacturer: 'ProdWip',
    unit: 'pcs',
    stockQuantity: 10,
    costPerUnit: 200,
    isActive: true,
  },
  {
    id: '7',
    name: 'Third Product',
    manufacturer: 'ProdWip',
    unit: 'pcs',
    stockQuantity: 4,
    costPerUnit: 3000,
    isActive: true,
  },
]

export const IngredientsPage = () => {
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      MOCK_INGREDIENTS.filter((ingredient) =>
        ingredient.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [search],
  )

  return (
    <section>
      <h1 className="page-title">Products Inventory</h1>
      <div className="card card-wide">
        <div className="card-search">
          <input
            type="text"
            placeholder="Search Product"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
        </div>
        <IngredientTable ingredients={filtered} />
        <div className="card-actions">
          <button className="btn-danger">Delete</button>
        </div>
      </div>
    </section>
  )
}
