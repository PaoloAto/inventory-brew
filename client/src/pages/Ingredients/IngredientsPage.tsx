import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  TableContainer,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import {
  adjustIngredientStock,
  archiveIngredient,
  createIngredient,
  listIngredients,
  restoreIngredient,
  updateIngredient,
} from '../../api/ingredients'
import { getErrorMessage } from '../../api/error'
import { IngredientDialog, type IngredientInput } from '../../components/inventory/IngredientDialog'
import {
  IngredientTable,
  type IngredientColumnKey,
  type IngredientSortField,
  type SortOrder,
} from '../../components/inventory/IngredientTable'
import { GradientCard } from '../../components/ui/GradientCard'
import {
  TableViewControls,
  type TableColumnOption,
  type TableDensity,
} from '../../components/ui/TableViewControls'
import { useAppSnackbar } from '../../context/snackbarContext'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import type { Ingredient } from '../../types/ingredient'

type StockFilter = 'all' | 'low' | 'healthy'

const ingredientColumnOptions: Array<TableColumnOption<IngredientColumnKey>> = [
  { key: 'name', label: 'Ingredient', locked: true },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'costPerUnit', label: 'Cost / Unit' },
  { key: 'stockQuantity', label: 'Stock' },
  { key: 'totalValue', label: 'Total Value' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions', locked: true },
]

const defaultIngredientColumns = ingredientColumnOptions.map((column) => column.key)
const sortFieldMap: Record<IngredientSortField, 'name' | 'manufacturer' | 'costPerUnit' | 'stockQuantity'> = {
  name: 'name',
  manufacturer: 'manufacturer',
  costPerUnit: 'costPerUnit',
  stockQuantity: 'stockQuantity',
}

const parsePositiveInt = (value: string | null, fallback: number) => {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) || parsed < 1 ? fallback : parsed
}

const parseStockFilter = (value: string | null): StockFilter => {
  if (value === 'low' || value === 'healthy') return value
  return 'all'
}

const parseSortOrder = (value: string | null): SortOrder => {
  return value === 'desc' ? 'desc' : 'asc'
}

const parseSortField = (value: string | null): IngredientSortField => {
  if (value === 'manufacturer' || value === 'costPerUnit' || value === 'stockQuantity') {
    return value
  }
  return 'name'
}

export const IngredientsPage = () => {
  const { showSnackbar } = useAppSnackbar()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialSearch = searchParams.get('q') ?? ''
  const initialStockFilter = parseStockFilter(searchParams.get('stock'))
  const initialCategoryFilter = searchParams.get('category') ?? 'all'
  const initialSortBy = parseSortField(searchParams.get('sortBy'))
  const initialSortOrder = parseSortOrder(searchParams.get('sortOrder'))
  const initialRowsPerPage = parsePositiveInt(searchParams.get('rows'), 10)
  const initialPage = Math.max(parsePositiveInt(searchParams.get('page'), 1) - 1, 0)

  const [searchInput, setSearchInput] = useState(initialSearch)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [totalIngredients, setTotalIngredients] = useState(0)
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [stockFilter, setStockFilter] = useState<StockFilter>(initialStockFilter)
  const [categoryFilter, setCategoryFilter] = useState<string>(initialCategoryFilter)
  const [sortBy, setSortBy] = useState<IngredientSortField>(initialSortBy)
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder)
  const [density, setDensity] = useState<TableDensity>('compact')
  const [visibleColumns, setVisibleColumns] = useState<IngredientColumnKey[]>(defaultIngredientColumns)
  const [page, setPage] = useState(initialPage)
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage)

  const debouncedSearch = useDebouncedValue(searchInput.trim(), 350)

  const loadIngredients = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await listIngredients({
        page: page + 1,
        limit: rowsPerPage,
        includeInactive: false,
        search: debouncedSearch || undefined,
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        lowStockOnly: stockFilter === 'low' ? true : undefined,
        healthyStockOnly: stockFilter === 'healthy' ? true : undefined,
        sortBy: sortFieldMap[sortBy],
        sortOrder,
      })

      setIngredients(response.items)
      setTotalIngredients(response.pagination.total)
      setSelectedIds((prev) => prev.filter((id) => response.items.some((item) => item.id === id)))
      setCategoryOptions((prev) => {
        const merged = new Set(prev)
        response.items.forEach((item) => {
          const category = item.category?.trim()
          if (category) merged.add(category)
        })
        if (categoryFilter !== 'all') merged.add(categoryFilter)
        return [...merged].sort((a, b) => a.localeCompare(b))
      })
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load ingredients'), { severity: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [categoryFilter, debouncedSearch, page, rowsPerPage, showSnackbar, sortBy, sortOrder, stockFilter])

  useEffect(() => {
    void loadIngredients()
  }, [loadIngredients])

  useEffect(() => {
    setPage(0)
  }, [debouncedSearch, stockFilter, categoryFilter, rowsPerPage])

  useEffect(() => {
    const nextParams = new URLSearchParams()
    const trimmedSearch = searchInput.trim()

    if (trimmedSearch) nextParams.set('q', trimmedSearch)
    if (stockFilter !== 'all') nextParams.set('stock', stockFilter)
    if (categoryFilter !== 'all') nextParams.set('category', categoryFilter)
    if (sortBy !== 'name') nextParams.set('sortBy', sortBy)
    if (sortOrder !== 'asc') nextParams.set('sortOrder', sortOrder)
    if (page > 0) nextParams.set('page', String(page + 1))
    if (rowsPerPage !== 10) nextParams.set('rows', String(rowsPerPage))

    const nextQuery = nextParams.toString()
    if (nextQuery !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [categoryFilter, page, rowsPerPage, searchInput, searchParams, setSearchParams, sortBy, sortOrder, stockFilter])

  const categoryChips = useMemo(() => categoryOptions, [categoryOptions])

  const handleToggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((value) => value !== id)))
  }

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      const pageIds = ingredients.map((item) => item.id)
      setSelectedIds((prev) => [...new Set([...prev, ...pageIds])])
    } else {
      const pageIds = new Set(ingredients.map((item) => item.id))
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)))
    }
  }

  const handleRequestSort = (field: IngredientSortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(field)
    setSortOrder('asc')
  }

  const handleToggleColumn = (column: IngredientColumnKey) => {
    setVisibleColumns((prev) => {
      if (prev.includes(column)) return prev.filter((current) => current !== column)

      const next = [...prev, column]
      return defaultIngredientColumns.filter((columnKey) => next.includes(columnKey))
    })
  }

  const openAddDialog = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEditDialog = (ingredient: Ingredient) => {
    setEditing(ingredient)
    setDialogOpen(true)
  }

  const handleSave = async (input: IngredientInput) => {
    try {
      if (input.id && editing) {
        await updateIngredient(input.id, {
          name: input.name,
          manufacturer: input.manufacturer,
          category: input.category,
          unit: input.unit,
          costPerUnit: input.costPerUnit,
          reorderLevel: input.reorderLevel,
          isActive: input.isActive,
        })

        if (input.stockQuantity !== editing.stockQuantity) {
          await adjustIngredientStock(input.id, {
            type: 'ADJUST',
            newStockQuantity: input.stockQuantity,
            reason: 'Adjusted from ingredient form',
          })
        }

        showSnackbar('Ingredient updated', { severity: 'success' })
      } else {
        await createIngredient({
          name: input.name,
          manufacturer: input.manufacturer,
          category: input.category,
          unit: input.unit,
          stockQuantity: input.stockQuantity,
          costPerUnit: input.costPerUnit,
          reorderLevel: input.reorderLevel,
          isActive: input.isActive,
        })
        showSnackbar('Ingredient added', { severity: 'success' })
      }

      if (input.category?.trim()) {
        setCategoryOptions((prev) => {
          const merged = new Set(prev)
          merged.add(input.category!.trim())
          return [...merged].sort((a, b) => a.localeCompare(b))
        })
      }

      setDialogOpen(false)
      setEditing(null)
      await loadIngredients()
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to save ingredient'), { severity: 'error' })
    }
  }

  const handleAdjustStock = async (ingredient: Ingredient, delta: number) => {
    if (delta === 0) return

    try {
      if (delta > 0) {
        await adjustIngredientStock(ingredient.id, {
          type: 'IN',
          quantity: delta,
          reason: 'Quick stock increase from table',
        })
      } else {
        await adjustIngredientStock(ingredient.id, {
          type: 'OUT',
          quantity: Math.abs(delta),
          reason: 'Quick stock decrease from table',
        })
      }

      showSnackbar('Stock adjusted', { severity: 'success' })
      await loadIngredients()
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to adjust stock'), { severity: 'error' })
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return

    const idsToDelete = [...selectedIds]

    try {
      await Promise.all(idsToDelete.map((id) => archiveIngredient(id)))
      setSelectedIds([])
      showSnackbar(`${idsToDelete.length} ingredient${idsToDelete.length > 1 ? 's' : ''} archived`, {
        severity: 'info',
        actionLabel: 'Undo',
        onAction: () => {
          void (async () => {
            try {
              await Promise.all(idsToDelete.map((id) => restoreIngredient(id)))
              await loadIngredients()
              showSnackbar('Ingredients restored', { severity: 'success' })
            } catch (error) {
              showSnackbar(getErrorMessage(error, 'Failed to restore ingredients'), { severity: 'error' })
            }
          })()
        },
      })
      await loadIngredients()
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to archive ingredients'), { severity: 'error' })
    }
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Ingredients
      </Typography>

      <GradientCard
        title="Ingredients Inventory"
        subtitle="Search, filter, sort, and maintain stock data quickly."
        rightContent={
          <Chip
            label={`${ingredients.length} on page / ${totalIngredients} total`}
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
                label="Search ingredient"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                sx={{ minWidth: { xs: '100%', sm: 260 } }}
              />
              <Button variant="contained" onClick={openAddDialog}>
                Add Ingredient
              </Button>
            </Stack>

            <TableViewControls
              columnOptions={ingredientColumnOptions}
              visibleColumns={visibleColumns}
              density={density}
              onDensityChange={setDensity}
              onToggleColumn={handleToggleColumn}
              onResetColumns={() => setVisibleColumns(defaultIngredientColumns)}
            />
          </Stack>

          <Stack direction="row" spacing={0.9} flexWrap="wrap" useFlexGap>
            <Chip
              label="All"
              color={stockFilter === 'all' ? 'primary' : 'default'}
              variant={stockFilter === 'all' ? 'filled' : 'outlined'}
              onClick={() => setStockFilter('all')}
            />
            <Chip
              label="Low Stock"
              color={stockFilter === 'low' ? 'error' : 'default'}
              variant={stockFilter === 'low' ? 'filled' : 'outlined'}
              onClick={() => setStockFilter('low')}
            />
            <Chip
              label="Healthy"
              color={stockFilter === 'healthy' ? 'success' : 'default'}
              variant={stockFilter === 'healthy' ? 'filled' : 'outlined'}
              onClick={() => setStockFilter('healthy')}
            />
            <Chip
              label={categoryFilter === 'all' ? 'All Categories' : categoryFilter}
              variant="outlined"
              onClick={() => setCategoryFilter('all')}
            />
            {categoryChips.map((category) => (
              <Chip
                key={category}
                label={category}
                color={categoryFilter === category ? 'primary' : 'default'}
                variant={categoryFilter === category ? 'filled' : 'outlined'}
                onClick={() => setCategoryFilter(category)}
              />
            ))}
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
              <IngredientTable
                ingredients={ingredients}
                selectedIds={selectedIds}
                visibleColumns={visibleColumns}
                tableSize={density === 'compact' ? 'small' : 'medium'}
                onToggleSelect={handleToggleSelect}
                onToggleSelectAll={handleToggleSelectAll}
                onEdit={openEditDialog}
                onAdjustStock={handleAdjustStock}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onRequestSort={handleRequestSort}
              />
            )}
          </TableContainer>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <Button
              variant="outlined"
              color="error"
              disabled={selectedIds.length === 0}
              onClick={handleDeleteSelected}
              sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
            >
              Archive selected
            </Button>

            <TablePagination
              component="div"
              count={totalIngredients}
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

      <IngredientDialog
        open={dialogOpen}
        initialData={editing ?? undefined}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />
    </Box>
  )
}

