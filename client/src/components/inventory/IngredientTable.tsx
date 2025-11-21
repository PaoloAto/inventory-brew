import { Checkbox, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material'
import type { Ingredient } from '../../types/ingredient'
import { IngredientRow } from './IngredientRow'

interface IngredientTableProps {
  ingredients: Ingredient[]
  selectedIds: string[]
  onToggleSelect: (id: string, checked: boolean) => void
  onToggleSelectAll: (checked: boolean) => void
  onEdit: (ingredient: Ingredient) => void
}

export const IngredientTable = ({
  ingredients,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
}: IngredientTableProps) => {
  const allSelected = ingredients.length > 0 && ingredients.every((ing) => selectedIds.includes(ing.id))
  const isIndeterminate = selectedIds.length > 0 && !allSelected

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell padding="checkbox">
            <Checkbox
              color="primary"
              indeterminate={isIndeterminate}
              checked={allSelected}
              onChange={(e) => onToggleSelectAll(e.target.checked)}
              inputProps={{ 'aria-label': 'select all ingredients' }}
            />
          </TableCell>
          <TableCell>Ingredient</TableCell>
          <TableCell>Manufacturer</TableCell>
          <TableCell align="right">Cost / Unit</TableCell>
          <TableCell align="right">Stock</TableCell>
          <TableCell align="right">Total Value</TableCell>
          <TableCell>Status</TableCell>
          <TableCell align="center">Action</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {ingredients.map((ingredient) => (
          <IngredientRow
            key={ingredient.id}
            ingredient={ingredient}
            selected={selectedIds.includes(ingredient.id)}
            onSelect={onToggleSelect}
            onEdit={onEdit}
          />
        ))}
      </TableBody>
    </Table>
  )
}
