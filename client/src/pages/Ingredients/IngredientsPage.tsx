import { useCallback, useEffect, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import {
  adjustIngredientStock,
  archiveIngredient,
  createIngredient,
  getIngredientMeta,
  listIngredients,
  restoreIngredient,
  updateIngredient,
  type AdjustStockPayload,
} from '../../api/ingredients'
import { getErrorMessage } from '../../api/error'
import { IngredientDialog, type IngredientInput } from '../../components/inventory/IngredientDialog'
import {
  IngredientTable,
  type IngredientColumnKey,
  type IngredientSortField,
  type SortOrder,
} from '../../components/inventory/IngredientTable'
import { StockAdjustmentDialog } from '../../components/inventory/StockAdjustmentDialog'
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

type StockFilter = 'all' | 'low' | 'healthy'

const ingredientColumnOptions: Array<TableColumnOption<IngredientColumnKey>> = [
  { key: 'name', label: 'Ingredient', locked: true },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'costPerUnit', label: 'Cost / unit' },
  { key: 'stockQuantity', label: 'Stock' },
  { key: 'totalValue', label: 'Total value' },
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

const parseSortOrder = (value: string | null): SortOrder => (value === 'desc' ? 'desc' : 'asc')

const parseSortField = (value: string | null): IngredientSortField => {
  if (value === 'manufacturer' || value === 'costPerUnit' || value === 'stockQuantity') {
    return value
  }
  return 'name'
}

export const IngredientsPage = () => {
  const { showSnackbar } = useAppSnackbar()
  const [searchParams, setSearchParams] = useSearchParams()

  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [totalIngredients, setTotalIngredients] = useState(0)
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [adjusting, setAdjusting] = useState<Ingredient | null>(null)
  const [stockFilter, setStockFilter] = useState<StockFilter>(parseStockFilter(searchParams.get('stock')))
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') ?? 'all')
  const [sortBy, setSortBy] = useState<IngredientSortField>(parseSortField(searchParams.get('sortBy')))
  const [sortOrder, setSortOrder] = useState<SortOrder>(parseSortOrder(searchParams.get('sortOrder')))
  const [density, setDensity] = useState<TableDensity>('compact')
  const [visibleColumns, setVisibleColumns] = useState<IngredientColumnKey[]>(defaultIngredientColumns)
  const [page, setPage] = useState(Math.max(parsePositiveInt(searchParams.get('page'), 1) - 1, 0))
  const [rowsPerPage, setRowsPerPage] = useState(parsePositiveInt(searchParams.get('rows'), 10))
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
      setSelectedIds((previous) =>
        previous.filter((id) => response.items.some((item) => item.id === id)),
      )
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load ingredients'), { severity: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [categoryFilter, debouncedSearch, page, rowsPerPage, showSnackbar, sortBy, sortOrder, stockFilter])

  const loadIngredientMeta = useCallback(async () => {
    try {
      const meta = await getIngredientMeta()
      setCategoryOptions(meta.categories.map((category) => category.name))
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load ingredient categories'), {
        severity: 'error',
      })
    }
  }, [showSnackbar])

  useEffect(() => {
    void loadIngredients()
  }, [loadIngredients])

  useEffect(() => {
    void loadIngredientMeta()
  }, [loadIngredientMeta])

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

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [categoryFilter, page, rowsPerPage, searchInput, searchParams, setSearchParams, sortBy, sortOrder, stockFilter])

  const handleToggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((previous) =>
      checked ? [...new Set([...previous, id])] : previous.filter((value) => value !== id),
    )
  }

  const handleToggleSelectAll = (checked: boolean) => {
    const pageIds = new Set(ingredients.map((item) => item.id))
    setSelectedIds((previous) =>
      checked
        ? [...new Set([...previous, ...pageIds])]
        : previous.filter((id) => !pageIds.has(id)),
    )
  }

  const handleRequestSort = (field: IngredientSortField) => {
    if (sortBy === field) {
      setSortOrder((previous) => (previous === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(field)
    setSortOrder('asc')
  }

  const handleToggleColumn = (column: IngredientColumnKey) => {
    setVisibleColumns((previous) => {
      if (previous.includes(column)) return previous.filter((current) => current !== column)
      const next = [...previous, column]
      return defaultIngredientColumns.filter((columnKey) => next.includes(columnKey))
    })
  }

  const handleSave = async (input: IngredientInput) => {
    setIsSaving(true)
    try {
      if (input.id && editing) {
        await updateIngredient(input.id, {
          name: input.name,
          manufacturer: input.manufacturer,
          category: input.category,
          costPerUnit: input.costPerUnit,
          reorderLevel: input.reorderLevel,
          isActive: input.isActive,
        })
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

      setDialogOpen(false)
      setEditing(null)
      await Promise.all([loadIngredients(), loadIngredientMeta()])
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to save ingredient'), { severity: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleAdjustStock = async (payload: AdjustStockPayload) => {
    if (!adjusting) return
    setIsSaving(true)
    try {
      await adjustIngredientStock(adjusting.id, payload)
      showSnackbar('Stock adjusted', { severity: 'success' })
      setAdjusting(null)
      await loadIngredients()
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to adjust stock'), { severity: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleArchiveSelected = async () => {
    if (selectedIds.length === 0) return
    const idsToArchive = [...selectedIds]
    try {
      await Promise.all(idsToArchive.map((id) => archiveIngredient(id)))
      setSelectedIds([])
      showSnackbar(`${idsToArchive.length} ingredient${idsToArchive.length === 1 ? '' : 's'} archived`, {
        severity: 'info',
        actionLabel: 'Undo',
        onAction: () => {
          void (async () => {
            try {
              await Promise.all(idsToArchive.map((id) => restoreIngredient(id)))
              await Promise.all([loadIngredients(), loadIngredientMeta()])
              showSnackbar('Ingredients restored', { severity: 'success' })
            } catch (error) {
              showSnackbar(getErrorMessage(error, 'Failed to restore ingredients'), { severity: 'error' })
            }
          })()
        },
      })
      await Promise.all([loadIngredients(), loadIngredientMeta()])
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to archive ingredients'), { severity: 'error' })
    }
  }

  return (
    <Box>
      <LedgerPageHeader
        title="Ingredients"
        subtitle="Track stock on hand, unit cost, and reorder pressure."
        meta={
          <Typography component="span" sx={{ ...numericSx, fontSize: 'inherit' }}>
            {totalIngredients} active ingredient{totalIngredients === 1 ? '' : 's'}
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
            Add ingredient
          </Button>
        }
      />

      <DataToolbar
        primary={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
            <TextField
              size="small"
              label="Search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              sx={{ minWidth: { xs: '100%', sm: 230 } }}
            />
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 } }}>
              <InputLabel id="stock-status-filter-label">Stock status</InputLabel>
              <Select
                labelId="stock-status-filter-label"
                label="Stock status"
                value={stockFilter}
                onChange={(event) => setStockFilter(event.target.value as StockFilter)}
              >
                <MenuItem value="all">All stock</MenuItem>
                <MenuItem value="low">Low stock</MenuItem>
                <MenuItem value="healthy">On target</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 160 } }}>
              <InputLabel id="category-filter-label">Category</InputLabel>
              <Select
                labelId="category-filter-label"
                label="Category"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <MenuItem value="all">All categories</MenuItem>
                {categoryOptions.map((category) => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        }
        secondary={
          <TableViewControls
            columnOptions={ingredientColumnOptions}
            visibleColumns={visibleColumns}
            density={density}
            onDensityChange={setDensity}
            onToggleColumn={handleToggleColumn}
            onResetColumns={() => setVisibleColumns(defaultIngredientColumns)}
          />
        }
      />

      <LedgerTableContainer maxHeight={560}>
        {isLoading ? (
          <TableSkeleton rows={8} />
        ) : (
          <IngredientTable
            ingredients={ingredients}
            selectedIds={selectedIds}
            visibleColumns={visibleColumns}
            tableSize={density === 'compact' ? 'small' : 'medium'}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onEdit={(ingredient) => {
              setEditing(ingredient)
              setDialogOpen(true)
            }}
            onAdjustStock={setAdjusting}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onRequestSort={handleRequestSort}
          />
        )}
      </LedgerTableContainer>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
        spacing={1}
        sx={{
          minHeight: 50,
          px: { xs: 1.5, sm: 2 },
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderTop: 0,
        }}
      >
        {selectedIds.length > 0 ? (
          <Stack direction="row" alignItems="center" spacing={1.25}>
            <Typography variant="body2">
              <Typography component="span" sx={{ ...numericSx, fontSize: 'inherit', fontWeight: 500 }}>
                {selectedIds.length}
              </Typography>{' '}
              selected
            </Typography>
            <Button color="error" size="small" onClick={() => void handleArchiveSelected()}>
              Archive selected
            </Button>
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Select rows for bulk actions
          </Typography>
        )}
        <TablePagination
          component="div"
          sx={{ maxWidth: '100%', overflowX: 'auto' }}
          count={totalIngredients}
          page={page}
          onPageChange={(_event, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(Number.parseInt(event.target.value, 10))
            setPage(0)
          }}
          rowsPerPageOptions={[5, 10, 20]}
        />
      </Stack>

      <IngredientDialog
        open={dialogOpen}
        initialData={editing ?? undefined}
        saving={isSaving}
        onClose={() => setDialogOpen(false)}
        onSave={(input) => void handleSave(input)}
      />
      <StockAdjustmentDialog
        open={Boolean(adjusting)}
        ingredient={adjusting}
        saving={isSaving}
        onClose={() => setAdjusting(null)}
        onConfirm={(payload) => void handleAdjustStock(payload)}
      />
    </Box>
  )
}
