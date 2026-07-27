import { Chip, TableCell, TableRow } from '@mui/material'
import RestaurantIcon from '@mui/icons-material/Restaurant'
import VisibilityIcon from '@mui/icons-material/Visibility'
import EditIcon from '@mui/icons-material/Edit'
import { RowActionMenu } from '../ui/RowActionMenu'
import type { Recipe } from '../../types/recipe'
import type { RecipeColumnKey } from './RecipeTable'

interface RecipeRowProps {
  recipe: Recipe
  visibleColumns: RecipeColumnKey[]
  computeCostPerServing: (ingredients: Recipe['ingredients']) => number
  onCook: () => void
  onView: () => void
  onEdit: () => void
}

export const RecipeRow = ({
  recipe,
  visibleColumns,
  computeCostPerServing,
  onCook,
  onView,
  onEdit,
}: RecipeRowProps) => {
  const cost = computeCostPerServing(recipe.ingredients)
  const margin = recipe.sellingPrice - cost
  const marginPercent = recipe.sellingPrice ? (margin / recipe.sellingPrice) * 100 : 0

  const marginColor = marginPercent < 20 ? 'error' : marginPercent < 40 ? 'warning' : 'success'
  const isVisible = (column: RecipeColumnKey) => visibleColumns.includes(column)

  return (
    <TableRow hover>
      {isVisible('name') && <TableCell sx={{ fontWeight: 600 }}>{recipe.name}</TableCell>}
      {isVisible('description') && (
        <TableCell sx={{ maxWidth: 260 }} title={recipe.description}>
          {recipe.description}
        </TableCell>
      )}

      {isVisible('sellingPrice') && <TableCell align="right">{recipe.sellingPrice.toFixed(2)}</TableCell>}
      {isVisible('costPerServing') && <TableCell align="right">{cost.toFixed(2)}</TableCell>}

      {isVisible('margin') && (
        <TableCell align="right">
          <Chip size="small" label={`${margin.toFixed(2)} (${marginPercent.toFixed(0)}%)`} color={marginColor} variant="outlined" />
        </TableCell>
      )}

      {isVisible('ingredientCount') && (
        <TableCell align="center">
          <Chip size="small" variant="outlined" label={`${recipe.ingredients.length} items`} />
        </TableCell>
      )}

      {isVisible('actions') && (
        <TableCell align="center">
          <RowActionMenu
            tooltip={`Actions for ${recipe.name}`}
            actions={[
              {
                key: 'view',
                label: 'View details',
                icon: <VisibilityIcon fontSize="small" />,
                onClick: onView,
              },
              {
                key: 'edit',
                label: 'Edit recipe',
                icon: <EditIcon fontSize="small" />,
                onClick: onEdit,
              },
              {
                key: 'cook',
                label: 'Cook recipe',
                icon: <RestaurantIcon fontSize="small" />,
                onClick: onCook,
              },
            ]}
          />
        </TableCell>
      )}
    </TableRow>
  )
}
