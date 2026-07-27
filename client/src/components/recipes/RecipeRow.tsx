import { TableCell, TableRow, Typography } from '@mui/material'
import RestaurantIcon from '@mui/icons-material/Restaurant'
import VisibilityIcon from '@mui/icons-material/Visibility'
import EditIcon from '@mui/icons-material/Edit'
import { RowActionMenu } from '../ui/RowActionMenu'
import type { Recipe } from '../../types/recipe'
import type { RecipeColumnKey } from './RecipeTable'
import { formatCurrency, formatPercentage } from '../ui/formatters'
import { numericSx } from '../../theme'

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

  const isVisible = (column: RecipeColumnKey) => visibleColumns.includes(column)
  const marginColor =
    marginPercent < 20 ? 'error.main' : marginPercent < 40 ? 'warning.main' : 'text.primary'

  return (
    <TableRow hover>
      {isVisible('name') && <TableCell sx={{ fontWeight: 500 }}>{recipe.name}</TableCell>}
      {isVisible('description') && (
        <TableCell sx={{ maxWidth: 260 }} title={recipe.description}>
          {recipe.description}
        </TableCell>
      )}

      {isVisible('sellingPrice') && (
        <TableCell align="right" sx={numericSx}>{formatCurrency(recipe.sellingPrice)}</TableCell>
      )}
      {isVisible('costPerServing') && (
        <TableCell align="right" sx={numericSx}>{formatCurrency(cost)}</TableCell>
      )}

      {isVisible('margin') && (
        <TableCell align="right" sx={{ ...numericSx, color: marginColor, fontWeight: 500 }}>
          {formatCurrency(margin)}
        </TableCell>
      )}

      {isVisible('marginPercent') && (
        <TableCell align="right">
          <Typography component="span" sx={{ ...numericSx, color: marginColor, fontSize: '0.8125rem' }}>
            {formatPercentage(marginPercent)}
          </Typography>
        </TableCell>
      )}

      {isVisible('ingredientCount') && (
        <TableCell align="right" sx={numericSx}>
          {recipe.ingredients.length}
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
