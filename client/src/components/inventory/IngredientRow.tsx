import { Chip, Checkbox, IconButton, TableCell, TableRow } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import type { Ingredient } from '../../types/ingredient'

interface IngredientRowProps {
  ingredient: Ingredient
  selected: boolean
  onSelect: (id: string, checked: boolean) => void
  onEdit: (ingredient: Ingredient) => void
}

export const IngredientRow = ({ ingredient, selected, onSelect, onEdit }: IngredientRowProps) => {
  const totalValue = ingredient.stockQuantity * ingredient.costPerUnit
  const isLowStock =
    ingredient.reorderLevel !== undefined
      ? ingredient.stockQuantity < ingredient.reorderLevel
      : ingredient.stockQuantity <= 3

  return (
    <TableRow hover>
      <TableCell padding="checkbox">
        <Checkbox
          color="primary"
          checked={selected}
          onChange={(e) => onSelect(ingredient.id, e.target.checked)}
          inputProps={{ 'aria-label': `select ${ingredient.name}` }}
        />
      </TableCell>
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
        <IconButton size="small" onClick={() => onEdit(ingredient)}>
          <EditIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  )
}
