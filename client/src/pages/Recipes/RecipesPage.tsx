import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TableContainer,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material'
import type { Recipe, RecipeIngredient } from '../../types/recipe'
import {
  RecipeTable,
  type RecipeColumnKey,
  type RecipeSortField,
  type SortOrder,
} from '../../components/recipes/RecipeTable'
import { RecipeDialog } from '../../components/recipes/RecipeDialog'
import { RecipeDetailsDialog } from '../../components/recipes/RecipeDetailsDialog'
import { GradientCard } from '../../components/ui/GradientCard'
import {
  TableViewControls,
  type TableColumnOption,
  type TableDensity,
} from '../../components/ui/TableViewControls'
import { useAppSnackbar } from '../../context/AppSnackbarContext'
import { mockRecipes } from '../../mock/recipes'
import { ingredientCostMap, mockIngredients } from '../../mock/ingredients'

type MarginFilter = 'all' | 'high' | 'medium' | 'low'

const recipeColumnOptions: Array<TableColumnOption<RecipeColumnKey>> = [
  { key: 'name', label: 'Recipe', locked: true },
  { key: 'description', label: 'Description' },
  { key: 'sellingPrice', label: 'Price / Serving' },
  { key: 'costPerServing', label: 'Cost / Serving' },
  { key: 'margin', label: 'Margin' },
  { key: 'ingredientCount', label: 'Ingredients' },
  { key: 'actions', label: 'Actions', locked: true },
]

const defaultRecipeColumns = recipeColumnOptions.map((column) => column.key)

function computeCostPerServing(ingredients: RecipeIngredient[]): number {
  return ingredients.reduce((sum, ri) => {
    const costPerUnit = ingredientCostMap[ri.ingredientId] ?? 0
    return sum + costPerUnit * ri.quantity
  }, 0)
}

const getMarginPercent = (recipe: Recipe) => {
  const cost = computeCostPerServing(recipe.ingredients)
  if (!recipe.sellingPrice) return 0
  return ((recipe.sellingPrice - cost) / recipe.sellingPrice) * 100
}

export const RecipesPage = () => {
  const { showSnackbar } = useAppSnackbar()

  const [search, setSearch] = useState('')
  const [recipes, setRecipes] = useState<Recipe[]>(mockRecipes)

  const [cookOpen, setCookOpen] = useState(false)
  const [cookServings, setCookServings] = useState(1)
  const [recipeToCook, setRecipeToCook] = useState<Recipe | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Recipe | null>(null)

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [viewing, setViewing] = useState<Recipe | null>(null)
  const [marginFilter, setMarginFilter] = useState<MarginFilter>('all')
  const [sortBy, setSortBy] = useState<RecipeSortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [density, setDensity] = useState<TableDensity>('compact')
  const [visibleColumns, setVisibleColumns] = useState<RecipeColumnKey[]>(defaultRecipeColumns)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(6)

  const getCostPerUnit = (ingredientId: string) => ingredientCostMap[ingredientId] ?? 0
  const getIngredientName = (ingredientId: string) =>
    mockIngredients.find((ing) => ing.id === ingredientId)?.name ?? ingredientId

  const filtered = useMemo(() => {
    return recipes.filter((recipe) => {
      const matchesSearch = recipe.name.toLowerCase().includes(search.toLowerCase())
      const marginPercent = getMarginPercent(recipe)
      const matchesMargin =
        marginFilter === 'all' ||
        (marginFilter === 'high' && marginPercent >= 40) ||
        (marginFilter === 'medium' && marginPercent >= 20 && marginPercent < 40) ||
        (marginFilter === 'low' && marginPercent < 20)

      return matchesSearch && matchesMargin
    })
  }, [recipes, search, marginFilter])

  const sorted = useMemo(() => {
    const sortedData = [...filtered].sort((a, b) => {
      const costA = computeCostPerServing(a.ingredients)
      const costB = computeCostPerServing(b.ingredients)
      const marginA = a.sellingPrice - costA
      const marginB = b.sellingPrice - costB
      let result = 0

      if (sortBy === 'name') result = a.name.localeCompare(b.name)
      if (sortBy === 'sellingPrice') result = a.sellingPrice - b.sellingPrice
      if (sortBy === 'costPerServing') result = costA - costB
      if (sortBy === 'margin') result = marginA - marginB
      if (sortBy === 'ingredientCount') result = a.ingredients.length - b.ingredients.length

      return sortOrder === 'asc' ? result : -result
    })

    return sortedData
  }, [filtered, sortBy, sortOrder])

  const paginated = useMemo(() => {
    const start = page * rowsPerPage
    return sorted.slice(start, start + rowsPerPage)
  }, [sorted, page, rowsPerPage])

  useEffect(() => {
    setPage(0)
  }, [search, marginFilter, rowsPerPage])

  useEffect(() => {
    const maxPage = Math.max(Math.ceil(sorted.length / rowsPerPage) - 1, 0)
    if (page > maxPage) setPage(maxPage)
  }, [sorted.length, rowsPerPage, page])

  const handleRequestSort = (field: RecipeSortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(field)
    setSortOrder('asc')
  }

  const handleToggleColumn = (column: RecipeColumnKey) => {
    setVisibleColumns((prev) => {
      if (prev.includes(column)) return prev.filter((current) => current !== column)

      const next = [...prev, column]
      return defaultRecipeColumns.filter((columnKey) => next.includes(columnKey))
    })
  }

  const handleOpenCook = (recipe: Recipe) => {
    setRecipeToCook(recipe)
    setCookServings(1)
    setCookOpen(true)
  }

  const handleOpenAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = (recipe: Recipe) => {
    setEditing(recipe)
    setDialogOpen(true)
  }

  const handleSave = (input: Omit<Recipe, 'id' | 'isActive'> & { id?: string; isActive?: boolean }) => {
    if (input.id) {
      setRecipes((prev) => prev.map((recipe) => (recipe.id === input.id ? { ...recipe, ...input } : recipe)))
      showSnackbar('Recipe updated', { severity: 'success' })
    } else {
      const newRecipe: Recipe = {
        ...input,
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        isActive: true,
      }
      setRecipes((prev) => [...prev, newRecipe])
      showSnackbar('Recipe added', { severity: 'success' })
    }
    setDialogOpen(false)
    setEditing(null)
  }

  const handleOpenDetails = (recipe: Recipe) => {
    setViewing(recipe)
    setDetailsOpen(true)
  }

  const handleCloseDetails = () => {
    setViewing(null)
    setDetailsOpen(false)
  }

  const handleCloseCook = () => {
    setCookOpen(false)
    setRecipeToCook(null)
  }

  const handleConfirmCook = () => {
    if (!recipeToCook) return
    showSnackbar(`Cooked ${cookServings} servings of ${recipeToCook.name}`, { severity: 'info' })
    handleCloseCook()
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Recipes
      </Typography>

      <GradientCard
        title="Recipe Book"
        subtitle="Filter by profitability, sort by key metrics, and act quickly."
        rightContent={
          <Chip
            label={`${filtered.length} filtered / ${recipes.length} total`}
            size="small"
            variant="outlined"
            sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.7)' }}
          />
        }
      >
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', xl: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', xl: 'center' }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
              <TextField
                size="small"
                label="Search recipe"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ minWidth: { xs: '100%', sm: 260 } }}
              />
              <Button variant="contained" onClick={handleOpenAdd}>
                Add Recipe
              </Button>
            </Stack>

            <TableViewControls
              columnOptions={recipeColumnOptions}
              visibleColumns={visibleColumns}
              density={density}
              onDensityChange={setDensity}
              onToggleColumn={handleToggleColumn}
              onResetColumns={() => setVisibleColumns(defaultRecipeColumns)}
            />
          </Stack>

          <Stack direction="row" spacing={0.9} flexWrap="wrap" useFlexGap>
            <Chip
              label="All Margins"
              color={marginFilter === 'all' ? 'primary' : 'default'}
              variant={marginFilter === 'all' ? 'filled' : 'outlined'}
              onClick={() => setMarginFilter('all')}
            />
            <Chip
              label="High Margin"
              color={marginFilter === 'high' ? 'success' : 'default'}
              variant={marginFilter === 'high' ? 'filled' : 'outlined'}
              onClick={() => setMarginFilter('high')}
            />
            <Chip
              label="Medium Margin"
              color={marginFilter === 'medium' ? 'warning' : 'default'}
              variant={marginFilter === 'medium' ? 'filled' : 'outlined'}
              onClick={() => setMarginFilter('medium')}
            />
            <Chip
              label="Low Margin"
              color={marginFilter === 'low' ? 'error' : 'default'}
              variant={marginFilter === 'low' ? 'filled' : 'outlined'}
              onClick={() => setMarginFilter('low')}
            />
          </Stack>

          <TableContainer
            sx={{
              maxHeight: 460,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'rgba(255,255,255,0.72)',
            }}
          >
            <RecipeTable
              recipes={paginated}
              visibleColumns={visibleColumns}
              tableSize={density === 'compact' ? 'small' : 'medium'}
              computeCostPerServing={computeCostPerServing}
              onCook={handleOpenCook}
              onView={handleOpenDetails}
              onEdit={handleOpenEdit}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onRequestSort={handleRequestSort}
            />
          </TableContainer>

          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end">
            <TablePagination
              component="div"
              count={sorted.length}
              page={page}
              onPageChange={(_event, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(event) => {
                setRowsPerPage(parseInt(event.target.value, 10))
                setPage(0)
              }}
              rowsPerPageOptions={[5, 10, 20]}
            />
          </Stack>
        </Stack>
      </GradientCard>

      <Dialog open={cookOpen} onClose={handleCloseCook} maxWidth="xs" fullWidth>
        <DialogTitle>{recipeToCook ? `Cook "${recipeToCook.name}"` : 'Cook Recipe'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            autoFocus
            margin="dense"
            label="Number of servings"
            type="number"
            fullWidth
            value={cookServings}
            onChange={(e) => setCookServings(Number(e.target.value) || 1)}
            inputProps={{ min: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCook}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirmCook}>
            Cook
          </Button>
        </DialogActions>
      </Dialog>

      <RecipeDialog
        open={dialogOpen}
        initialData={editing ?? undefined}
        availableIngredients={mockIngredients}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />

      <RecipeDetailsDialog
        open={detailsOpen}
        recipe={viewing}
        onClose={handleCloseDetails}
        computeCostPerServing={computeCostPerServing}
        getCostPerUnit={getCostPerUnit}
        getIngredientName={getIngredientName}
      />
    </Box>
  )
}
