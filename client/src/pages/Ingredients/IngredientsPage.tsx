import { useEffect, useMemo, useState } from 'react'
import { Box, Button, Chip, Stack, TableContainer, TablePagination, TextField, Typography } from '@mui/material'
import { GradientCard } from '../../components/ui/GradientCard'
import {
  IngredientTable,
  type IngredientColumnKey,
  type IngredientSortField,
  type SortOrder,
} from '../../components/inventory/IngredientTable'
import { IngredientDialog, type IngredientInput } from '../../components/inventory/IngredientDialog'
import {
  TableViewControls,
  type TableColumnOption,
  type TableDensity,
} from '../../components/ui/TableViewControls'
import { useAppSnackbar } from '../../context/AppSnackbarContext'
import { mockIngredients } from '../../mock/ingredients'
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

const getIngredientValue = (ingredient: Ingredient) => ingredient.stockQuantity * ingredient.costPerUnit

export const IngredientsPage = () => {
  const { showSnackbar } = useAppSnackbar()

  const [search, setSearch] = useState('')
  const [ingredients, setIngredients] = useState<Ingredient[]>(mockIngredients)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<IngredientSortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [density, setDensity] = useState<TableDensity>('compact')
  const [visibleColumns, setVisibleColumns] = useState<IngredientColumnKey[]>(defaultIngredientColumns)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(6)

  const categories = useMemo(
    () => [...new Set(ingredients.map((item) => item.category).filter(Boolean) as string[])],
    [ingredients],
  )

  const filtered = useMemo(() => {
    return ingredients.filter((ingredient) => {
      const matchesSearch = ingredient.name.toLowerCase().includes(search.toLowerCase())
      const isLowStock =
        ingredient.reorderLevel !== undefined
          ? ingredient.stockQuantity < ingredient.reorderLevel
          : ingredient.stockQuantity <= 3
      const matchesStock =
        stockFilter === 'all' || (stockFilter === 'low' ? isLowStock : !isLowStock)
      const matchesCategory = categoryFilter === 'all' || ingredient.category === categoryFilter

      return matchesSearch && matchesStock && matchesCategory
    })
  }, [ingredients, search, stockFilter, categoryFilter])

  const sorted = useMemo(() => {
    const sortedData = [...filtered].sort((a, b) => {
      let result = 0
      if (sortBy === 'name') result = a.name.localeCompare(b.name)
      if (sortBy === 'manufacturer') result = (a.manufacturer ?? '').localeCompare(b.manufacturer ?? '')
      if (sortBy === 'costPerUnit') result = a.costPerUnit - b.costPerUnit
      if (sortBy === 'stockQuantity') result = a.stockQuantity - b.stockQuantity
      if (sortBy === 'totalValue') result = getIngredientValue(a) - getIngredientValue(b)
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
  }, [search, stockFilter, categoryFilter, rowsPerPage])

  useEffect(() => {
    const maxPage = Math.max(Math.ceil(sorted.length / rowsPerPage) - 1, 0)
    if (page > maxPage) setPage(maxPage)
  }, [sorted.length, rowsPerPage, page])

  const handleToggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((value) => value !== id)))
  }

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      const pageIds = paginated.map((item) => item.id)
      setSelectedIds((prev) => [...new Set([...prev, ...pageIds])])
    } else {
      const pageIds = new Set(paginated.map((item) => item.id))
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

  const handleSave = (input: IngredientInput) => {
    if (input.id) {
      setIngredients((prev) => prev.map((ing) => (ing.id === input.id ? { ...ing, ...input } : ing)))
      showSnackbar('Ingredient updated', { severity: 'success' })
    } else {
      const newIngredient: Ingredient = {
        ...input,
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        isActive: true,
      }
      setIngredients((prev) => [...prev, newIngredient])
      showSnackbar('Ingredient added', { severity: 'success' })
    }
    setDialogOpen(false)
    setEditing(null)
  }

  const handleAdjustStock = (ingredient: Ingredient, delta: number) => {
    const nextQuantity = Math.max(ingredient.stockQuantity + delta, 0)
    if (nextQuantity === ingredient.stockQuantity) return

    const snapshot = ingredients
    setIngredients((prev) =>
      prev.map((item) =>
        item.id === ingredient.id
          ? {
              ...item,
              stockQuantity: nextQuantity,
            }
          : item,
      ),
    )

    const directionLabel = delta > 0 ? 'increased' : 'decreased'
    showSnackbar(
      `${ingredient.name} stock ${directionLabel}: ${ingredient.stockQuantity} -> ${nextQuantity} ${ingredient.unit}`,
      {
        severity: 'info',
        actionLabel: 'Undo',
        onAction: () => {
          setIngredients(snapshot)
          showSnackbar('Stock adjustment reverted', { severity: 'success' })
        },
      },
    )
  }

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return
    const snapshot = ingredients
    const deletedCount = selectedIds.length

    setIngredients((prev) => prev.filter((ing) => !selectedIds.includes(ing.id)))
    setSelectedIds([])

    showSnackbar(`${deletedCount} ingredient${deletedCount > 1 ? 's' : ''} removed`, {
      severity: 'info',
      actionLabel: 'Undo',
      onAction: () => {
        setIngredients(snapshot)
        showSnackbar('Changes reverted', { severity: 'success' })
      },
    })
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
            label={`${filtered.length} filtered / ${ingredients.length} total`}
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
            {categories.map((category) => (
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
            <IngredientTable
              ingredients={paginated}
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
          </TableContainer>

          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Button
              variant="outlined"
              color="error"
              disabled={selectedIds.length === 0}
              onClick={handleDeleteSelected}
              sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
            >
              Delete selected
            </Button>

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

      <IngredientDialog
        open={dialogOpen}
        initialData={editing ?? undefined}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />
    </Box>
  )
}
