import AddRoundedIcon from '@mui/icons-material/AddRounded'
import EditIcon from '@mui/icons-material/Edit'
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded'
import { Chip, Checkbox, TableCell, TableRow, Typography } from '@mui/material'
import { RowActionMenu } from '../ui/RowActionMenu'
import type { Ingredient } from '../../types/ingredient'
import type { IngredientColumnKey } from './IngredientTable'

interface IngredientRowProps {
  ingredient: Ingredient
  visibleColumns: IngredientColumnKey[]
  selected: boolean
  onSelect: (id: string, checked: boolean) => void
  onEdit: (ingredient: Ingredient) => void
  onAdjustStock: (ingredient: Ingredient, delta: number) => void
}

export const IngredientRow = ({
  ingredient,
  visibleColumns,
  selected,
  onSelect,
  onEdit,
  onAdjustStock,
}: IngredientRowProps) => {
  const totalValue = ingredient.stockQuantity * ingredient.costPerUnit
  const isLowStock =
    ingredient.reorderLevel !== undefined
      ? ingredient.stockQuantity < ingredient.reorderLevel
      : ingredient.stockQuantity <= 3

  const isVisible = (column: IngredientColumnKey) => visibleColumns.includes(column)

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

      {isVisible('name') && (
        <TableCell sx={{ fontWeight: 600, color: 'primary.main', cursor: 'pointer' }}>{ingredient.name}</TableCell>
      )}
      {isVisible('manufacturer') && <TableCell>{ingredient.manufacturer ?? 'N/A'}</TableCell>}
      {isVisible('costPerUnit') && <TableCell align="right">{ingredient.costPerUnit.toFixed(2)}</TableCell>}
      {isVisible('stockQuantity') && (
        <TableCell align="right">
          <Typography component="span" sx={{ fontWeight: 600 }}>
            {ingredient.stockQuantity.toLocaleString()}
          </Typography>{' '}
          <Typography component="span" variant="caption" color="text.secondary">
            {ingredient.unit}
          </Typography>
        </TableCell>
      )}
      {isVisible('totalValue') && <TableCell align="right">{totalValue.toFixed(2)}</TableCell>}
      {isVisible('status') && (
        <TableCell>
          <Chip
            size="small"
            label={isLowStock ? 'Low' : 'OK'}
            color={isLowStock ? 'error' : 'success'}
            variant={isLowStock ? 'outlined' : 'filled'}
          />
        </TableCell>
      )}
      {isVisible('actions') && (
        <TableCell align="center">
          <RowActionMenu
            tooltip={`Actions for ${ingredient.name}`}
            actions={[
              {
                key: 'increase',
                label: 'Increase stock',
                icon: <AddRoundedIcon fontSize="small" />,
                onClick: () => onAdjustStock(ingredient, 1),
              },
              {
                key: 'decrease',
                label: 'Decrease stock',
                icon: <RemoveRoundedIcon fontSize="small" />,
                onClick: () => onAdjustStock(ingredient, -1),
                disabled: ingredient.stockQuantity <= 0,
              },
              {
                key: 'edit',
                label: 'Edit ingredient',
                icon: <EditIcon fontSize="small" />,
                onClick: () => onEdit(ingredient),
              },
            ]}
          />
        </TableCell>
      )}
    </TableRow>
  )
}
