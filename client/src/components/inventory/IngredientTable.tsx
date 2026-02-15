import { Checkbox, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, Typography } from '@mui/material'
import type { Ingredient } from '../../types/ingredient'
import { IngredientRow } from './IngredientRow'

export type IngredientSortField = 'name' | 'manufacturer' | 'costPerUnit' | 'stockQuantity' | 'totalValue'
export type SortOrder = 'asc' | 'desc'
export type IngredientColumnKey =
  | 'name'
  | 'manufacturer'
  | 'costPerUnit'
  | 'stockQuantity'
  | 'totalValue'
  | 'status'
  | 'actions'

interface IngredientTableProps {
  ingredients: Ingredient[]
  selectedIds: string[]
  visibleColumns: IngredientColumnKey[]
  tableSize: 'small' | 'medium'
  onToggleSelect: (id: string, checked: boolean) => void
  onToggleSelectAll: (checked: boolean) => void
  onEdit: (ingredient: Ingredient) => void
  onAdjustStock: (ingredient: Ingredient, delta: number) => void
  sortBy: IngredientSortField
  sortOrder: SortOrder
  onRequestSort: (field: IngredientSortField) => void
}

export const IngredientTable = ({
  ingredients,
  selectedIds,
  visibleColumns,
  tableSize,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onAdjustStock,
  sortBy,
  sortOrder,
  onRequestSort,
}: IngredientTableProps) => {
  const allSelected = ingredients.length > 0 && ingredients.every((ing) => selectedIds.includes(ing.id))
  const isIndeterminate = selectedIds.length > 0 && !allSelected
  const isVisible = (column: IngredientColumnKey) => visibleColumns.includes(column)
  const columnCount = 1 + visibleColumns.length

  return (
    <Table size={tableSize} stickyHeader>
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
          {isVisible('name') && (
            <TableCell sortDirection={sortBy === 'name' ? sortOrder : false}>
              <TableSortLabel
                active={sortBy === 'name'}
                direction={sortBy === 'name' ? sortOrder : 'asc'}
                onClick={() => onRequestSort('name')}
              >
                Ingredient
              </TableSortLabel>
            </TableCell>
          )}
          {isVisible('manufacturer') && (
            <TableCell sortDirection={sortBy === 'manufacturer' ? sortOrder : false}>
              <TableSortLabel
                active={sortBy === 'manufacturer'}
                direction={sortBy === 'manufacturer' ? sortOrder : 'asc'}
                onClick={() => onRequestSort('manufacturer')}
              >
                Manufacturer
              </TableSortLabel>
            </TableCell>
          )}
          {isVisible('costPerUnit') && (
            <TableCell align="right" sortDirection={sortBy === 'costPerUnit' ? sortOrder : false}>
              <TableSortLabel
                active={sortBy === 'costPerUnit'}
                direction={sortBy === 'costPerUnit' ? sortOrder : 'asc'}
                onClick={() => onRequestSort('costPerUnit')}
              >
                Cost / Unit
              </TableSortLabel>
            </TableCell>
          )}
          {isVisible('stockQuantity') && (
            <TableCell align="right" sortDirection={sortBy === 'stockQuantity' ? sortOrder : false}>
              <TableSortLabel
                active={sortBy === 'stockQuantity'}
                direction={sortBy === 'stockQuantity' ? sortOrder : 'asc'}
                onClick={() => onRequestSort('stockQuantity')}
              >
                Stock
              </TableSortLabel>
            </TableCell>
          )}
          {isVisible('totalValue') && (
            <TableCell align="right" sortDirection={sortBy === 'totalValue' ? sortOrder : false}>
              <TableSortLabel
                active={sortBy === 'totalValue'}
                direction={sortBy === 'totalValue' ? sortOrder : 'asc'}
                onClick={() => onRequestSort('totalValue')}
              >
                Total Value
              </TableSortLabel>
            </TableCell>
          )}
          {isVisible('status') && <TableCell>Status</TableCell>}
          {isVisible('actions') && <TableCell align="center">Action</TableCell>}
        </TableRow>
      </TableHead>
      <TableBody>
        {ingredients.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columnCount} align="center">
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                No ingredients match your current filters.
              </Typography>
            </TableCell>
          </TableRow>
        ) : (
          ingredients.map((ingredient) => (
            <IngredientRow
              key={ingredient.id}
              ingredient={ingredient}
              visibleColumns={visibleColumns}
              selected={selectedIds.includes(ingredient.id)}
              onSelect={onToggleSelect}
              onEdit={onEdit}
              onAdjustStock={onAdjustStock}
            />
          ))
        )}
      </TableBody>
    </Table>
  )
}
