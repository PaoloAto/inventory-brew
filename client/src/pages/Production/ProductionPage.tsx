import { useCallback, useEffect, useState } from 'react'
import SwapVertRoundedIcon from '@mui/icons-material/SwapVertRounded'
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { getErrorMessage } from '../../api/error'
import { listProduction, type CookEvent } from '../../api/production'
import { listRecipes } from '../../api/recipes'
import { DataToolbar } from '../../components/ui/DataToolbar'
import { formatCurrency, formatDateTime } from '../../components/ui/formatters'
import { LedgerEmptyState } from '../../components/ui/LedgerEmptyState'
import { LedgerPageHeader } from '../../components/ui/LedgerPageHeader'
import { LedgerTableContainer } from '../../components/ui/LedgerTableContainer'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAppSnackbar } from '../../context/snackbarContext'
import { numericSx } from '../../theme'
import type { Recipe } from '../../types/recipe'

interface Filters {
  recipeId: string
  dateFrom: string
  dateTo: string
}

const emptyFilters: Filters = { recipeId: '', dateFrom: '', dateTo: '' }

const toLocalDayBoundaryIso = (value: string, boundary: 'start' | 'end') => {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  return new Date(
    year,
    month - 1,
    day,
    boundary === 'start' ? 0 : 23,
    boundary === 'start' ? 0 : 59,
    boundary === 'start' ? 0 : 59,
    boundary === 'start' ? 0 : 999,
  ).toISOString()
}

export const ProductionPage = () => {
  const { showSnackbar } = useAppSnackbar()
  const [rows, setRows] = useState<CookEvent[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [totalRows, setTotalRows] = useState(0)

  const loadProduction = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await listProduction({
        page: page + 1,
        limit: rowsPerPage,
        recipeId: filters.recipeId || undefined,
        dateFrom: toLocalDayBoundaryIso(filters.dateFrom, 'start'),
        dateTo: toLocalDayBoundaryIso(filters.dateTo, 'end'),
        sortOrder,
      })
      setRows(response.items)
      setTotalRows(response.pagination.total)
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load production history'), {
        severity: 'error',
      })
    } finally {
      setIsLoading(false)
    }
  }, [filters, page, rowsPerPage, showSnackbar, sortOrder])

  useEffect(() => {
    void loadProduction()
  }, [loadProduction])

  useEffect(() => {
    let active = true
    const loadRecipeCatalog = async () => {
      try {
        const catalog: Recipe[] = []
        let catalogPage = 1
        let totalPages = 1

        do {
          const response = await listRecipes({
            includeInactive: true,
            page: catalogPage,
            limit: 100,
            sortBy: 'name',
            sortOrder: 'asc',
          })
          catalog.push(...response.items)
          totalPages = response.pagination.totalPages
          catalogPage += 1
        } while (catalogPage <= totalPages)

        if (active) setRecipes(catalog)
      } catch {
        if (active) setRecipes([])
      }
    }

    void loadRecipeCatalog()
    return () => {
      active = false
    }
  }, [])

  return (
    <Box>
      <LedgerPageHeader
        title="Production"
        subtitle="Completed cooks with their ingredient cost and margin snapshots."
        meta={
          <Typography component="span" sx={{ ...numericSx, fontSize: 'inherit' }}>
            {totalRows} production record{totalRows === 1 ? '' : 's'}
          </Typography>
        }
      />

      <DataToolbar
        primary={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
              <InputLabel id="production-recipe-label">Recipe</InputLabel>
              <Select
                labelId="production-recipe-label"
                label="Recipe"
                value={draftFilters.recipeId}
                onChange={(event) =>
                  setDraftFilters((previous) => ({ ...previous, recipeId: event.target.value }))
                }
              >
                <MenuItem value="">All recipes</MenuItem>
                {recipes.map((recipe) => (
                  <MenuItem key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="From"
              type="date"
              value={draftFilters.dateFrom}
              onChange={(event) =>
                setDraftFilters((previous) => ({ ...previous, dateFrom: event.target.value }))
              }
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              label="To"
              type="date"
              value={draftFilters.dateTo}
              onChange={(event) =>
                setDraftFilters((previous) => ({ ...previous, dateTo: event.target.value }))
              }
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        }
        secondary={
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button
              variant="contained"
              onClick={() => {
                setFilters(draftFilters)
                setPage(0)
              }}
            >
              Apply filters
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                setDraftFilters(emptyFilters)
                setFilters(emptyFilters)
                setPage(0)
              }}
              disabled={!filters.recipeId && !filters.dateFrom && !filters.dateTo}
            >
              Reset
            </Button>
            <Button
              variant="text"
              startIcon={<SwapVertRoundedIcon />}
              onClick={() => {
                setSortOrder((previous) => (previous === 'desc' ? 'asc' : 'desc'))
                setPage(0)
              }}
            >
              {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
            </Button>
          </Stack>
        }
      />

      <LedgerTableContainer maxHeight={590}>
        {isLoading ? (
          <TableSkeleton rows={9} />
        ) : rows.length === 0 ? (
          <LedgerEmptyState
            title="No production records found"
            description="Completed recipe cooks will appear here as durable production records."
            minHeight={220}
          />
        ) : (
          <Table size="small" stickyHeader aria-label="Production history">
            <TableHead>
              <TableRow>
                <TableCell>Date and time</TableCell>
                <TableCell>Recipe</TableCell>
                <TableCell align="right">Servings</TableCell>
                <TableCell align="right">Ingredient cost</TableCell>
                <TableCell align="right">Revenue</TableCell>
                <TableCell align="right">Gross margin</TableCell>
                <TableCell align="right">Cost / serving</TableCell>
                <TableCell>Operation</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((event) => (
                <TableRow key={event._id} hover>
                  <TableCell sx={{ ...numericSx, minWidth: 155, color: 'text.secondary' }}>
                    {formatDateTime(event.createdAt)}
                  </TableCell>
                  <TableCell sx={{ minWidth: 150, fontWeight: 500 }}>
                    {event.recipeNameSnapshot}
                  </TableCell>
                  <TableCell align="right" sx={numericSx}>{event.servings}</TableCell>
                  <TableCell align="right" sx={numericSx}>{formatCurrency(event.totalIngredientCost)}</TableCell>
                  <TableCell align="right" sx={numericSx}>{formatCurrency(event.expectedRevenue)}</TableCell>
                  <TableCell align="right" sx={numericSx}>{formatCurrency(event.grossMarginTotal)}</TableCell>
                  <TableCell align="right" sx={numericSx}>{formatCurrency(event.costPerServingSnapshot)}</TableCell>
                  <TableCell sx={{ ...numericSx, color: 'text.secondary' }} title={event.operationId}>
                    {event.operationId.slice(0, 8)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </LedgerTableContainer>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderTop: 0 }}>
        <TablePagination
          component="div"
          count={totalRows}
          page={page}
          onPageChange={(_event, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(Number.parseInt(event.target.value, 10))
            setPage(0)
          }}
          rowsPerPageOptions={[5, 10, 20, 50]}
        />
      </Box>
    </Box>
  )
}
