import { useCallback, useEffect, useMemo, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
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
import { DataToolbar } from '../../components/ui/DataToolbar'
import { LedgerPageHeader } from '../../components/ui/LedgerPageHeader'
import { LedgerTableContainer } from '../../components/ui/LedgerTableContainer'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import {
  TableViewControls,
  type TableColumnOption,
  type TableDensity,
} from '../../components/ui/TableViewControls'
import { useAppSnackbar } from '../../context/snackbarContext'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { numericSx } from '../../theme'
import type { Ingredient } from '../../types/ingredient'
import type { Recipe, RecipeIngredient } from '../../types/recipe'

const recipeColumnOptions: Array<TableColumnOption<RecipeColumnKey>> = [
  { key: 'name', label: 'Recipe', locked: true },
  { key: 'description', label: 'Description' },
  { key: 'sellingPrice', label: 'Selling price' },
  { key: 'costPerServing', label: 'Ingredient cost' },
  { key: 'margin', label: 'Gross margin' },
  { key: 'marginPercent', label: 'Margin %' },
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

const parseSortOrder = (value: string | null): SortOrder => (value === 'desc' ? 'desc' : 'asc')
const parseSortField = (value: string | null): RecipeSortField =>
  value === 'sellingPrice' ? 'sellingPrice' : 'name'

export const RecipesPage = () => {
  const { showSnackbar } = useAppSnackbar()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [totalRecipes, setTotalRecipes] = useState(0)
  const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isCooking, setIsCooking] = useState(false)
  const [cookOpen, setCookOpen] = useState(false)
  const [cookServings, setCookServings] = useState(1)
  const [recipeToCook, setRecipeToCook] = useState<Recipe | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [recipeDetails, setRecipeDetails] = useState<RecipeDetails | null>(null)
  const [sortBy, setSortBy] = useState<RecipeSortField>(parseSortField(searchParams.get('sortBy')))
  const [sortOrder, setSortOrder] = useState<SortOrder>(parseSortOrder(searchParams.get('sortOrder')))
  const [density, setDensity] = useState<TableDensity>('compact')
  const [visibleColumns, setVisibleColumns] = useState<RecipeColumnKey[]>(defaultRecipeColumns)
  const [page, setPage] = useState(Math.max(parsePositiveInt(searchParams.get('page'), 1) - 1, 0))
  const [rowsPerPage, setRowsPerPage] = useState(parsePositiveInt(searchParams.get('rows'), 10))
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 350)

  const ingredientCostMap = useMemo(
    () => Object.fromEntries(availableIngredients.map((ingredient) => [ingredient.id, ingredient.costPerUnit])),
    [availableIngredients],
  )

  const computeCostPerServing = useCallback(
    (ingredients: RecipeIngredient[]) =>
      ingredients.reduce((sum, recipeIngredient) => {
        const costPerUnit = ingredientCostMap[recipeIngredient.ingredientId] ?? 0
        return sum + costPerUnit * recipeIngredient.quantity
      }, 0),
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
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [page, rowsPerPage, searchInput, searchParams, setSearchParams, sortBy, sortOrder])

  const handleRequestSort = (field: RecipeSortField) => {
    if (sortBy === field) {
      setSortOrder((previous) => (previous === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(field)
    setSortOrder('asc')
  }

  const handleToggleColumn = (column: RecipeColumnKey) => {
    setVisibleColumns((previous) => {
      if (previous.includes(column)) return previous.filter((current) => current !== column)
      const next = [...previous, column]
      return defaultRecipeColumns.filter((columnKey) => next.includes(columnKey))
    })
  }

  const handleSave = async (
    input: Omit<Recipe, 'id' | 'isActive'> & { id?: string; isActive?: boolean },
  ) => {
    setIsSaving(true)
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
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenDetails = async (recipe: Recipe) => {
    setDetailsOpen(true)
    setDetailsLoading(true)
    setRecipeDetails(null)
    try {
      setRecipeDetails(await getRecipeDetails(recipe.id))
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load recipe details'), { severity: 'error' })
      setDetailsOpen(false)
    } finally {
      setDetailsLoading(false)
    }
  }

  const handleConfirmCook = async () => {
    if (!recipeToCook) return
    setIsCooking(true)
    try {
      await cookRecipe(recipeToCook.id, cookServings)
      showSnackbar(`Cooked ${cookServings} serving${cookServings === 1 ? '' : 's'} of ${recipeToCook.name}`, {
        severity: 'success',
      })
      setCookOpen(false)
      setRecipeToCook(null)
      await loadRecipes()
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to cook recipe'), { severity: 'error' })
    } finally {
      setIsCooking(false)
    }
  }

  return (
    <Box>
      <LedgerPageHeader
        title="Recipes"
        subtitle="A costing ledger for dish formulas, selling price, and margin."
        meta={
          <Typography component="span" sx={{ ...numericSx, fontSize: 'inherit' }}>
            {totalRecipes} active recipe{totalRecipes === 1 ? '' : 's'}
          </Typography>
        }
        actions={
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            Add recipe
          </Button>
        }
      />

      <DataToolbar
        primary={
          <TextField
            size="small"
            label="Search recipes"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 260 } }}
          />
        }
        secondary={
          <TableViewControls
            columnOptions={recipeColumnOptions}
            visibleColumns={visibleColumns}
            density={density}
            onDensityChange={setDensity}
            onToggleColumn={handleToggleColumn}
            onResetColumns={() => setVisibleColumns(defaultRecipeColumns)}
          />
        }
      />

      <LedgerTableContainer maxHeight={560}>
        {isLoading ? (
          <TableSkeleton rows={8} />
        ) : (
          <RecipeTable
            recipes={recipes}
            visibleColumns={visibleColumns}
            tableSize={density === 'compact' ? 'small' : 'medium'}
            computeCostPerServing={computeCostPerServing}
            onCook={(recipe) => {
              setRecipeToCook(recipe)
              setCookServings(1)
              setCookOpen(true)
            }}
            onView={(recipe) => void handleOpenDetails(recipe)}
            onEdit={(recipe) => {
              setEditing(recipe)
              setDialogOpen(true)
            }}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onRequestSort={handleRequestSort}
          />
        )}
      </LedgerTableContainer>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderTop: 0,
        }}
      >
        <TablePagination
          component="div"
          sx={{ maxWidth: '100%', overflowX: 'auto' }}
          count={totalRecipes}
          page={page}
          onPageChange={(_event, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(Number.parseInt(event.target.value, 10))
            setPage(0)
          }}
          rowsPerPageOptions={[5, 10, 20]}
        />
      </Box>

      <Dialog
        open={cookOpen}
        onClose={isCooking ? undefined : () => setCookOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Cook recipe</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle1">{recipeToCook?.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                Cooking records ingredient usage and reduces stock.
              </Typography>
            </Box>
            <TextField
              autoFocus
              label="Servings"
              type="number"
              fullWidth
              value={cookServings}
              onChange={(event) => setCookServings(Math.max(1, Number(event.target.value) || 1))}
              inputProps={{ min: 1, step: 1 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCookOpen(false)} disabled={isCooking}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleConfirmCook()} disabled={isCooking}>
            {isCooking ? 'Cooking' : 'Cook recipe'}
          </Button>
        </DialogActions>
      </Dialog>

      <RecipeDialog
        open={dialogOpen}
        initialData={editing ?? undefined}
        availableIngredients={availableIngredients}
        saving={isSaving}
        onClose={() => setDialogOpen(false)}
        onSave={(input) => void handleSave(input)}
      />
      <RecipeDetailsDialog
        open={detailsOpen}
        details={recipeDetails}
        loading={detailsLoading}
        onClose={() => {
          setRecipeDetails(null)
          setDetailsOpen(false)
        }}
      />
    </Box>
  )
}
