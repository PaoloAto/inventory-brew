import { useCallback, useEffect, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import {
  Box,
  Button,
  CircularProgress,
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
  previewCook,
  type CookPreviewResponse,
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
import { formatCurrency, formatQuantity } from '../../components/ui/formatters'
import {
  TableViewControls,
  type TableColumnOption,
  type TableDensity,
} from '../../components/ui/TableViewControls'
import { useAppSnackbar } from '../../context/snackbarContext'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { numericSx } from '../../theme'
import type { Ingredient } from '../../types/ingredient'
import type { Recipe } from '../../types/recipe'

const recipeColumnOptions: Array<TableColumnOption<RecipeColumnKey>> = [
  { key: 'name', label: 'Recipe', locked: true },
  { key: 'description', label: 'Description' },
  { key: 'sellingPrice', label: 'Selling price' },
  { key: 'costPerServing', label: 'Cost / serving' },
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
  const [cookPreview, setCookPreview] = useState<CookPreviewResponse | null>(null)
  const [cookPreviewError, setCookPreviewError] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [cookIdempotencyKey, setCookIdempotencyKey] = useState<string | null>(null)
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

  const loadAvailableIngredients = useCallback(async () => {
    try {
      const catalog: Ingredient[] = []
      let catalogPage = 1
      let totalPages = 1

      do {
        const response = await listIngredients({
          page: catalogPage,
          limit: 100,
          includeInactive: false,
          sortBy: 'name',
          sortOrder: 'asc',
        })
        catalog.push(...response.items)
        totalPages = response.pagination.totalPages
        catalogPage += 1
      } while (catalogPage <= totalPages)

      setAvailableIngredients(catalog)
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
        includeComputed: true,
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
    if (!cookOpen || !recipeToCook) return
    let active = true
    setIsPreviewLoading(true)
    setCookPreviewError(null)

    void previewCook(recipeToCook.id, cookServings)
      .then((preview) => {
        if (active) setCookPreview(preview)
      })
      .catch((error) => {
        if (!active) return
        setCookPreview(null)
        setCookPreviewError(getErrorMessage(error, 'Failed to preview this cook'))
      })
      .finally(() => {
        if (active) setIsPreviewLoading(false)
      })

    return () => {
      active = false
    }
  }, [cookOpen, cookServings, recipeToCook])

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
          yieldServings: input.yieldServings ?? 1,
          ingredients: input.ingredients,
        })
        showSnackbar('Recipe updated', { severity: 'success' })
      } else {
        await createRecipe({
          name: input.name,
          description: input.description,
          sellingPrice: input.sellingPrice,
          yieldServings: input.yieldServings ?? 1,
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
    if (!recipeToCook || !cookIdempotencyKey) return
    setIsCooking(true)
    try {
      const response = await cookRecipe(recipeToCook.id, cookServings, cookIdempotencyKey)
      showSnackbar(
        response.replayed
          ? `Cook already recorded for ${recipeToCook.name}`
          : `Cooked ${cookServings} serving${cookServings === 1 ? '' : 's'} of ${recipeToCook.name}`,
        { severity: 'success' },
      )
      setCookOpen(false)
      setRecipeToCook(null)
      setCookPreview(null)
      setCookIdempotencyKey(null)
      await Promise.all([loadRecipes(), loadAvailableIngredients()])
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to cook recipe'), { severity: 'error' })
    } finally {
      setIsCooking(false)
    }
  }

  const closeCookDialog = () => {
    setCookOpen(false)
    setRecipeToCook(null)
    setCookPreview(null)
    setCookPreviewError(null)
    setCookIdempotencyKey(null)
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
            onCook={(recipe) => {
              setRecipeToCook(recipe)
              setCookServings(1)
              setCookPreview(null)
              setCookPreviewError(null)
              setCookIdempotencyKey(crypto.randomUUID())
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
        onClose={isCooking ? undefined : closeCookDialog}
        maxWidth="sm"
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
              onChange={(event) => {
                const nextServings = Math.max(1, Math.floor(Number(event.target.value) || 1))
                if (nextServings !== cookServings) setCookIdempotencyKey(crypto.randomUUID())
                setCookServings(nextServings)
              }}
              inputProps={{ min: 1, step: 1 }}
            />
            {isPreviewLoading ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">Checking inventory…</Typography>
              </Stack>
            ) : cookPreviewError ? (
              <Typography variant="body2" color="error.main">{cookPreviewError}</Typography>
            ) : cookPreview ? (
              <Stack spacing={1.5}>
                <Typography variant="body2" color="text.secondary">
                  Maximum available: {cookPreview.maxCookableServings} servings
                </Typography>
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Ingredient requirements</Typography>
                  <Stack spacing={0.75}>
                    {cookPreview.requirements.map((requirement) => (
                      <Stack
                        key={requirement.ingredientId}
                        direction="row"
                        justifyContent="space-between"
                        spacing={2}
                      >
                        <Typography variant="body2" color={requirement.canSatisfy ? 'text.primary' : 'error.main'}>
                          {requirement.ingredientName}
                        </Typography>
                        <Typography variant="body2" sx={numericSx} color={requirement.canSatisfy ? 'text.secondary' : 'error.main'}>
                          {formatQuantity(requirement.requiredQuantity, requirement.unit)} / {formatQuantity(requirement.availableQuantity, requirement.unit)}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
                <Stack spacing={0.5} sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Estimated ingredient cost</Typography>
                    <Typography variant="body2" sx={numericSx}>{formatCurrency(cookPreview.estimatedIngredientCost)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Expected revenue</Typography>
                    <Typography variant="body2" sx={numericSx}>{formatCurrency(cookPreview.expectedRevenue)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Estimated gross margin</Typography>
                    <Typography variant="body2" sx={numericSx}>{formatCurrency(cookPreview.estimatedGrossMargin)}</Typography>
                  </Stack>
                </Stack>
                {!cookPreview.canCook ? (
                  <Typography variant="body2" color="error.main">Inventory is insufficient for this cook.</Typography>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCookDialog} disabled={isCooking}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void handleConfirmCook()}
            disabled={isCooking || isPreviewLoading || !cookPreview?.canCook}
          >
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
