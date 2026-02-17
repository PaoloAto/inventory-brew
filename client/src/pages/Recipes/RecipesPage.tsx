import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
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
import { useSearchParams } from 'react-router-dom'
import { getErrorMessage } from '../../api/error'
import { listIngredients } from '../../api/ingredients'
import {
  cookRecipe,
  createRecipe,
  getRecipeDetails,
  listRecipes,
  type RecipeDetails,
  updateRecipe,
} from '../../api/recipes'
import { RecipeDetailsDialog } from '../../components/recipes/RecipeDetailsDialog'
import { RecipeDialog } from '../../components/recipes/RecipeDialog'
import {
  RecipeTable,
  type RecipeColumnKey,
  type RecipeSortField,
  type SortOrder,
} from '../../components/recipes/RecipeTable'
import { GradientCard } from '../../components/ui/GradientCard'
import {
  TableViewControls,
  type TableColumnOption,
  type TableDensity,
} from '../../components/ui/TableViewControls'
import { useAppSnackbar } from '../../context/snackbarContext'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import type { Ingredient } from '../../types/ingredient'
import type { Recipe, RecipeIngredient } from '../../types/recipe'

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
const recipeSortFieldMap: Record<RecipeSortField, 'name' | 'sellingPrice'> = {
  name: 'name',
  sellingPrice: 'sellingPrice',
}

const parsePositiveInt = (value: string | null, fallback: number) => {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) || parsed < 1 ? fallback : parsed
}

const parseSortOrder = (value: string | null): SortOrder => {
  return value === 'desc' ? 'desc' : 'asc'
}

const parseSortField = (value: string | null): RecipeSortField => {
  return value === 'sellingPrice' ? 'sellingPrice' : 'name'
}

export const RecipesPage = () => {
  const { showSnackbar } = useAppSnackbar()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialSearch = searchParams.get('q') ?? ''
  const initialSortBy = parseSortField(searchParams.get('sortBy'))
  const initialSortOrder = parseSortOrder(searchParams.get('sortOrder'))
  const initialRowsPerPage = parsePositiveInt(searchParams.get('rows'), 10)
  const initialPage = Math.max(parsePositiveInt(searchParams.get('page'), 1) - 1, 0)

  const [searchInput, setSearchInput] = useState(initialSearch)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [totalRecipes, setTotalRecipes] = useState(0)
  const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [cookOpen, setCookOpen] = useState(false)
  const [cookServings, setCookServings] = useState(1)
  const [recipeToCook, setRecipeToCook] = useState<Recipe | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Recipe | null>(null)

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [recipeDetails, setRecipeDetails] = useState<RecipeDetails | null>(null)

  const [sortBy, setSortBy] = useState<RecipeSortField>(initialSortBy)
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder)
  const [density, setDensity] = useState<TableDensity>('compact')
  const [visibleColumns, setVisibleColumns] = useState<RecipeColumnKey[]>(defaultRecipeColumns)
  const [page, setPage] = useState(initialPage)
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage)

  const debouncedSearch = useDebouncedValue(searchInput.trim(), 350)

  const ingredientCostMap = useMemo(
    () => Object.fromEntries(availableIngredients.map((ingredient) => [ingredient.id, ingredient.costPerUnit])),
    [availableIngredients],
  )

  const computeCostPerServing = useCallback(
    (ingredients: RecipeIngredient[]) => {
      return ingredients.reduce((sum, recipeIngredient) => {
        const costPerUnit = ingredientCostMap[recipeIngredient.ingredientId] ?? 0
        return sum + costPerUnit * recipeIngredient.quantity
      }, 0)
    },
    [ingredientCostMap],
  )

  const loadAvailableIngredients = useCallback(async () => {
    try {
      const response = await listIngredients({
        page: 1,
        limit: 500,
        includeInactive: false,
        sortBy: 'name',
        sortOrder: 'asc',
      })
      setAvailableIngredients(response.items)
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load ingredient catalog'), { severity: 'error' })
    }
  }, [showSnackbar])

  const loadRecipes = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await listRecipes({
        page: page + 1,
        limit: rowsPerPage,
        includeInactive: false,
        search: debouncedSearch || undefined,
        sortBy: recipeSortFieldMap[sortBy],
        sortOrder,
      })

      setRecipes(response.items)
      setTotalRecipes(response.pagination.total)
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load recipes'), { severity: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [debouncedSearch, page, rowsPerPage, showSnackbar, sortBy, sortOrder])

  useEffect(() => {
    void loadAvailableIngredients()
  }, [loadAvailableIngredients])

  useEffect(() => {
    void loadRecipes()
  }, [loadRecipes])

  useEffect(() => {
    setPage(0)
  }, [debouncedSearch, rowsPerPage])

  useEffect(() => {
    const nextParams = new URLSearchParams()
    const trimmedSearch = searchInput.trim()

    if (trimmedSearch) nextParams.set('q', trimmedSearch)
    if (sortBy !== 'name') nextParams.set('sortBy', sortBy)
    if (sortOrder !== 'asc') nextParams.set('sortOrder', sortOrder)
    if (page > 0) nextParams.set('page', String(page + 1))
    if (rowsPerPage !== 10) nextParams.set('rows', String(rowsPerPage))

    const nextQuery = nextParams.toString()
    if (nextQuery !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [page, rowsPerPage, searchInput, searchParams, setSearchParams, sortBy, sortOrder])

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

  const handleSave = async (input: Omit<Recipe, 'id' | 'isActive'> & { id?: string; isActive?: boolean }) => {
    try {
      if (input.id) {
        await updateRecipe(input.id, {
          name: input.name,
          description: input.description,
          sellingPrice: input.sellingPrice,
          ingredients: input.ingredients,
        })
        showSnackbar('Recipe updated', { severity: 'success' })
      } else {
        await createRecipe({
          name: input.name,
          description: input.description,
          sellingPrice: input.sellingPrice,
          ingredients: input.ingredients,
          isActive: true,
        })
        showSnackbar('Recipe added', { severity: 'success' })
      }

      setDialogOpen(false)
      setEditing(null)
      await loadRecipes()
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to save recipe'), { severity: 'error' })
    }
  }

  const handleOpenDetails = async (recipe: Recipe) => {
    setDetailsOpen(true)
    setDetailsLoading(true)
    setRecipeDetails(null)

    try {
      const details = await getRecipeDetails(recipe.id)
      setRecipeDetails(details)
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load recipe details'), { severity: 'error' })
      setDetailsOpen(false)
    } finally {
      setDetailsLoading(false)
    }
  }

  const handleCloseDetails = () => {
    setRecipeDetails(null)
    setDetailsOpen(false)
  }

  const handleCloseCook = () => {
    setCookOpen(false)
    setRecipeToCook(null)
  }

  const handleConfirmCook = async () => {
    if (!recipeToCook) return

    try {
      const result = await cookRecipe(recipeToCook.id, cookServings)
      showSnackbar(`Cooked ${cookServings} servings of ${recipeToCook.name} (${result.executionMode})`, {
        severity: 'success',
      })
      setCookOpen(false)
      setRecipeToCook(null)
      await loadRecipes()
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to cook recipe'), { severity: 'error' })
    }
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Recipes
      </Typography>

      <GradientCard
        title="Recipe Book"
        subtitle="Review pricing, cost, and margin with backend-powered pagination."
        rightContent={
          <Chip
            label={`${recipes.length} on page / ${totalRecipes} total`}
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
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
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

          <TableContainer
            sx={{
              maxHeight: 460,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'rgba(255,255,255,0.72)',
            }}
          >
            {isLoading ? (
              <Stack alignItems="center" justifyContent="center" sx={{ py: 6 }}>
                <CircularProgress size={28} />
              </Stack>
            ) : (
              <RecipeTable
                recipes={recipes}
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
            )}
          </TableContainer>

          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end">
            <TablePagination
              component="div"
              count={totalRecipes}
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
        availableIngredients={availableIngredients}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />

      <RecipeDetailsDialog
        open={detailsOpen}
        details={recipeDetails}
        loading={detailsLoading}
        onClose={handleCloseDetails}
      />
    </Box>
  )
}

