import { Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, Typography } from '@mui/material'
import type { Recipe } from '../../types/recipe'
import { RecipeRow } from './RecipeRow'

export type RecipeSortField = 'name' | 'sellingPrice' | 'costPerServing' | 'margin' | 'ingredientCount'
export type SortOrder = 'asc' | 'desc'
export type RecipeColumnKey =
  | 'name'
  | 'description'
  | 'sellingPrice'
  | 'costPerServing'
  | 'margin'
  | 'ingredientCount'
  | 'actions'

interface RecipeTableProps {
  recipes: Recipe[]
  visibleColumns: RecipeColumnKey[]
  tableSize: 'small' | 'medium'
  computeCostPerServing: (ingredients: Recipe['ingredients']) => number
  onCook: (recipe: Recipe) => void
  onView: (recipe: Recipe) => void
  onEdit: (recipe: Recipe) => void
  sortBy: RecipeSortField
  sortOrder: SortOrder
  onRequestSort: (field: RecipeSortField) => void
}

export const RecipeTable = ({
  recipes,
  visibleColumns,
  tableSize,
  computeCostPerServing,
  onCook,
  onView,
  onEdit,
  sortBy,
  sortOrder,
  onRequestSort,
}: RecipeTableProps) => {
  const isVisible = (column: RecipeColumnKey) => visibleColumns.includes(column)
  const columnCount = visibleColumns.length

  return (
    <Table size={tableSize} stickyHeader>
      <TableHead>
        <TableRow>
          {isVisible('name') && (
            <TableCell sortDirection={sortBy === 'name' ? sortOrder : false}>
              <TableSortLabel
                active={sortBy === 'name'}
                direction={sortBy === 'name' ? sortOrder : 'asc'}
                onClick={() => onRequestSort('name')}
              >
                Recipe
              </TableSortLabel>
            </TableCell>
          )}
          {isVisible('description') && <TableCell>Description</TableCell>}
          {isVisible('sellingPrice') && (
            <TableCell align="right" sortDirection={sortBy === 'sellingPrice' ? sortOrder : false}>
              <TableSortLabel
                active={sortBy === 'sellingPrice'}
                direction={sortBy === 'sellingPrice' ? sortOrder : 'asc'}
                onClick={() => onRequestSort('sellingPrice')}
              >
                Price / Serving
              </TableSortLabel>
            </TableCell>
          )}
          {isVisible('costPerServing') && (
            <TableCell align="right" sortDirection={sortBy === 'costPerServing' ? sortOrder : false}>
              <TableSortLabel
                active={sortBy === 'costPerServing'}
                direction={sortBy === 'costPerServing' ? sortOrder : 'asc'}
                onClick={() => onRequestSort('costPerServing')}
              >
                Cost / Serving
              </TableSortLabel>
            </TableCell>
          )}
          {isVisible('margin') && (
            <TableCell align="right" sortDirection={sortBy === 'margin' ? sortOrder : false}>
              <TableSortLabel
                active={sortBy === 'margin'}
                direction={sortBy === 'margin' ? sortOrder : 'asc'}
                onClick={() => onRequestSort('margin')}
              >
                Margin
              </TableSortLabel>
            </TableCell>
          )}
          {isVisible('ingredientCount') && (
            <TableCell align="center" sortDirection={sortBy === 'ingredientCount' ? sortOrder : false}>
              <TableSortLabel
                active={sortBy === 'ingredientCount'}
                direction={sortBy === 'ingredientCount' ? sortOrder : 'asc'}
                onClick={() => onRequestSort('ingredientCount')}
              >
                Ingredients
              </TableSortLabel>
            </TableCell>
          )}
          {isVisible('actions') && <TableCell align="center">Action</TableCell>}
        </TableRow>
      </TableHead>
      <TableBody>
        {recipes.length === 0 ? (
          <TableRow>
            <TableCell colSpan={Math.max(columnCount, 1)} align="center">
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                No recipes match your current filters.
              </Typography>
            </TableCell>
          </TableRow>
        ) : (
          recipes.map((recipe) => (
            <RecipeRow
              key={recipe.id}
              recipe={recipe}
              visibleColumns={visibleColumns}
              computeCostPerServing={computeCostPerServing}
              onCook={() => onCook(recipe)}
              onView={() => onView(recipe)}
              onEdit={() => onEdit(recipe)}
            />
          ))
        )}
      </TableBody>
    </Table>
  )
}
