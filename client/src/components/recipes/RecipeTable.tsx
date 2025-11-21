import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material'
import type { Recipe } from '../../types/recipe'
import { RecipeRow } from './RecipeRow'

interface RecipeTableProps {
  recipes: Recipe[]
  computeCostPerServing: (ingredients: Recipe['ingredients']) => number
  onCook: (recipe: Recipe) => void
}

export const RecipeTable = ({ recipes, computeCostPerServing, onCook }: RecipeTableProps) => {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Recipe</TableCell>
          <TableCell>Description</TableCell>
          <TableCell align="right">Price / Serving</TableCell>
          <TableCell align="right">Cost / Serving</TableCell>
          <TableCell align="right">Margin</TableCell>
          <TableCell align="center">Ingredients</TableCell>
          <TableCell align="center">Action</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {recipes.map((recipe) => (
          <RecipeRow
            key={recipe.id}
            recipe={recipe}
            computeCostPerServing={computeCostPerServing}
            onCook={() => onCook(recipe)}
          />
        ))}
      </TableBody>
    </Table>
  )
}
