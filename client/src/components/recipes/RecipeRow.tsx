import { Chip, IconButton, TableCell, TableRow, Tooltip } from '@mui/material'
import RestaurantIcon from '@mui/icons-material/Restaurant'
import VisibilityIcon from '@mui/icons-material/Visibility'
import EditIcon from '@mui/icons-material/Edit'
import type { Recipe } from '../../types/recipe'

interface RecipeRowProps {
  recipe: Recipe
  computeCostPerServing: (ingredients: Recipe['ingredients']) => number
  onCook: () => void
  onView: () => void
  onEdit: () => void
}

export const RecipeRow = ({ recipe, computeCostPerServing, onCook, onView, onEdit }: RecipeRowProps) => {
  const cost = computeCostPerServing(recipe.ingredients)
  const margin = recipe.sellingPrice - cost
  const marginPercent = recipe.sellingPrice ? (margin / recipe.sellingPrice) * 100 : 0

  const marginColor = marginPercent < 20 ? 'error' : marginPercent < 40 ? 'warning' : 'success'

  return (
    <TableRow hover>
      <TableCell sx={{ fontWeight: 500 }}>{recipe.name}</TableCell>
      <TableCell sx={{ maxWidth: 260 }} title={recipe.description}>
        {recipe.description}
      </TableCell>

      <TableCell align="right">{recipe.sellingPrice.toFixed(2)}</TableCell>
      <TableCell align="right">{cost.toFixed(2)}</TableCell>

      <TableCell align="right">
        <Chip size="small" label={`${margin.toFixed(2)} (${marginPercent.toFixed(0)}%)`} color={marginColor} variant="outlined" />
      </TableCell>

      <TableCell align="center">
        <Chip size="small" variant="outlined" label={`${recipe.ingredients.length} items`} />
      </TableCell>

      <TableCell align="center">
        <Tooltip title="View details">
          <IconButton size="small" sx={{ mr: 1 }} onClick={onView}>
            <VisibilityIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Edit">
          <IconButton size="small" sx={{ mr: 1 }} onClick={onEdit}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Cook">
          <IconButton size="small" color="primary" onClick={onCook}>
            <RestaurantIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}
