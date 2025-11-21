import type { Ingredient } from '../../types/ingredient'

interface IngredientRowProps {
  ingredient: Ingredient
}

export const IngredientRow = ({ ingredient }: IngredientRowProps) => {
  return (
    <tr>
      <td className="linkish">{ingredient.name}</td>
      <td>{ingredient.manufacturer ?? '—'}</td>
      <td>{ingredient.costPerUnit}</td>
      <td>{ingredient.stockQuantity}</td>
      <td>
        <input type="checkbox" />
      </td>
      <td>
        <button className="btn-outline">Edit</button>
      </td>
    </tr>
  )
}
