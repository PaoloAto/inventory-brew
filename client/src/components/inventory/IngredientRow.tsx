import type { Ingredient } from '../../types/ingredient'
import { Chip, IconButton, TableCell, TableRow } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'

interface IngredientRowProps {
  ingredient: Ingredient
}

export const IngredientRow = ({ ingredient }: IngredientRowProps) => {
  const totalValue = ingredient.stockQuantity * ingredient.costPerUnit
  const isLowStock = ingredient.stockQuantity <= 3

  return (
    <TableRow hover>
      <TableCell sx={{ fontWeight: 500, color: 'primary.main', cursor: 'pointer' }}>
        {ingredient.name}
      </TableCell>
      <TableCell>{ingredient.manufacturer ?? '—'}</TableCell>
      <TableCell align="right">{ingredient.costPerUnit.toFixed(2)}</TableCell>
      <TableCell align="right">{ingredient.stockQuantity}</TableCell>
      <TableCell align="right">{totalValue.toFixed(2)}</TableCell>
      <TableCell>
        <Chip
          size="small"
          label={isLowStock ? 'Low' : 'OK'}
          color={isLowStock ? 'error' : 'success'}
          variant={isLowStock ? 'outlined' : 'filled'}
        />
      </TableCell>
      <TableCell align="center">
        <IconButton size="small">
          <EditIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  )
}
