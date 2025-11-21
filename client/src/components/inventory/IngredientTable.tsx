import type { Ingredient } from '../../types/ingredient'
import { IngredientRow } from './IngredientRow'

interface IngredientTableProps {
  ingredients: Ingredient[]
}

export const IngredientTable = ({ ingredients }: IngredientTableProps) => {
  return (
    <table className="inventory-table">
      <thead>
        <tr>
          <th>Product Name</th>
          <th>Manufacturer</th>
          <th>Price</th>
          <th>Quantity</th>
          <th>Check to Select</th>
          <th>Edit</th>
        </tr>
      </thead>
      <tbody>
        {ingredients.map((ingredient) => (
          <IngredientRow key={ingredient.id} ingredient={ingredient} />
        ))}
      </tbody>
    </table>
  )
}
