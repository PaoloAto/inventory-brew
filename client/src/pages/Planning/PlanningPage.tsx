import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SwapVertRoundedIcon from '@mui/icons-material/SwapVertRounded'
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
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
import { getIngredientMeta } from '../../api/ingredients'
import { getInventoryPlanning, type InventoryPlanningItem } from '../../api/planning'
import { DataToolbar } from '../../components/ui/DataToolbar'
import { formatNumber, formatQuantity } from '../../components/ui/formatters'
import { LedgerEmptyState } from '../../components/ui/LedgerEmptyState'
import { LedgerPageHeader } from '../../components/ui/LedgerPageHeader'
import { LedgerTableContainer } from '../../components/ui/LedgerTableContainer'
import { MetricStrip } from '../../components/ui/MetricStrip'
import { StatusLabel } from '../../components/ui/StatusLabel'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAppSnackbar } from '../../context/snackbarContext'
import { numericSx } from '../../theme'

type LookbackDays = 7 | 14 | 30 | 60 | 90

interface Filters {
  search: string
  category: string
  reorderOnly: boolean
}

const emptyFilters: Filters = { search: '', category: 'all', reorderOnly: false }

const statusPresentation = (item: InventoryPlanningItem) => {
  if (item.stockStatus.code === 'OUT_OF_STOCK') return { label: 'Out of stock', tone: 'danger' as const }
  if (item.reorderTriggered) return { label: 'Reorder now', tone: 'warning' as const }
  if (item.stockStatus.code === 'UNCONFIGURED') return { label: 'Set reorder point', tone: 'neutral' as const }
  return { label: 'On track', tone: 'success' as const }
}

export const PlanningPage = () => {
  const { showSnackbar } = useAppSnackbar()
  const [rows, setRows] = useState<InventoryPlanningItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [lookbackDays, setLookbackDays] = useState<LookbackDays>(30)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [totalRows, setTotalRows] = useState(0)
  const [summary, setSummary] = useState({
    ingredientCount: 0,
    outOfStockCount: 0,
    reorderTriggeredCount: 0,
    parUnconfiguredCount: 0,
    noDepletionDataCount: 0,
  })

  const loadPlanning = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await getInventoryPlanning({
        lookbackDays,
        search: filters.search.trim() || undefined,
        category: filters.category === 'all' ? undefined : filters.category,
        reorderOnly: filters.reorderOnly || undefined,
        page: page + 1,
        limit: rowsPerPage,
        sortBy: 'urgency',
        sortOrder,
      })
      setRows(response.items)
      setTotalRows(response.pagination.total)
      setSummary(response.summary)
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load inventory planning'), { severity: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [filters, lookbackDays, page, rowsPerPage, showSnackbar, sortOrder])

  useEffect(() => {
    void loadPlanning()
  }, [loadPlanning])

  useEffect(() => {
    void getIngredientMeta()
      .then((meta) => setCategories(meta.categories.map((category) => category.name)))
      .catch(() => setCategories([]))
  }, [])

  const applyFilters = () => {
    setFilters(draftFilters)
    setPage(0)
  }

  return (
    <Box>
      <LedgerPageHeader
        title="Inventory Planning"
        subtitle="Use recent inventory depletion and par levels to prioritize replenishment."
        meta={
          <Typography component="span" sx={{ ...numericSx, fontSize: 'inherit' }}>
            {totalRows} active ingredient{totalRows === 1 ? '' : 's'}
          </Typography>
        }
      />

      <Stack spacing={2}>
        <MetricStrip
          items={[
            { label: 'Reorder now', value: String(summary.reorderTriggeredCount) },
            { label: 'Out of stock', value: String(summary.outOfStockCount) },
            { label: 'Par not set', value: String(summary.parUnconfiguredCount) },
          ]}
        />

        <DataToolbar
          primary={
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 135 } }}>
                <InputLabel id="planning-lookback-label">Lookback</InputLabel>
                <Select
                  labelId="planning-lookback-label"
                  label="Lookback"
                  value={lookbackDays}
                  onChange={(event) => {
                    setLookbackDays(Number(event.target.value) as LookbackDays)
                    setPage(0)
                  }}
                >
                  {[7, 14, 30, 60, 90].map((days) => <MenuItem key={days} value={days}>{days} days</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Search"
                value={draftFilters.search}
                onChange={(event) => setDraftFilters((previous) => ({ ...previous, search: event.target.value }))}
                sx={{ minWidth: { xs: '100%', sm: 200 } }}
              />
              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 160 } }}>
                <InputLabel id="planning-category-label">Category</InputLabel>
                <Select
                  labelId="planning-category-label"
                  label="Category"
                  value={draftFilters.category}
                  onChange={(event) => setDraftFilters((previous) => ({ ...previous, category: event.target.value }))}
                >
                  <MenuItem value="all">All categories</MenuItem>
                  {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControlLabel
                control={<Checkbox checked={draftFilters.reorderOnly} onChange={(event) => setDraftFilters((previous) => ({ ...previous, reorderOnly: event.target.checked }))} />}
                label="Reorder only"
                sx={{ ml: 0.25 }}
              />
            </Stack>
          }
          secondary={
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button variant="contained" onClick={applyFilters}>Apply filters</Button>
              <Button
                variant="outlined"
                disabled={!filters.search && filters.category === 'all' && !filters.reorderOnly}
                onClick={() => { setDraftFilters(emptyFilters); setFilters(emptyFilters); setPage(0) }}
              >
                Reset
              </Button>
              <Button
                variant="text"
                startIcon={<SwapVertRoundedIcon />}
                onClick={() => { setSortOrder((previous) => (previous === 'asc' ? 'desc' : 'asc')); setPage(0) }}
              >
                {sortOrder === 'asc' ? 'Most urgent first' : 'Least urgent first'}
              </Button>
            </Stack>
          }
        />

        <LedgerTableContainer maxHeight={590}>
          {isLoading ? (
            <TableSkeleton rows={9} />
          ) : rows.length === 0 ? (
            <LedgerEmptyState title="No planning items found" description="Change the filters to inspect a different set of active ingredients." minHeight={220} />
          ) : (
            <Table size="small" stickyHeader aria-label="Inventory planning">
              <TableHead>
                <TableRow>
                  <TableCell>Ingredient</TableCell>
                  <TableCell align="right">Stock</TableCell>
                  <TableCell align="right">Reorder point</TableCell>
                  <TableCell align="right">Par level</TableCell>
                  <TableCell align="right">Avg daily depletion</TableCell>
                  <TableCell align="right">Days remaining</TableCell>
                  <TableCell align="right">Suggested reorder</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((item) => {
                  const status = statusPresentation(item)
                  return (
                    <TableRow key={item.id} hover>
                      <TableCell sx={{ minWidth: 155, fontWeight: 500 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{item.name}</Typography>
                        {!item.dataSufficient ? <Typography variant="caption" color="text.secondary">Early data</Typography> : null}
                      </TableCell>
                      <TableCell align="right" sx={numericSx}>{formatQuantity(item.stockQuantity, item.unit)}</TableCell>
                      <TableCell align="right" sx={numericSx}>{item.reorderLevel > 0 ? formatQuantity(item.reorderLevel, item.unit) : '—'}</TableCell>
                      <TableCell align="right" sx={numericSx}>{item.parConfigured ? formatQuantity(item.parLevel, item.unit) : '—'}</TableCell>
                      <TableCell align="right" sx={numericSx}>{item.averageDailyDepletion > 0 ? `${formatNumber(item.averageDailyDepletion)} ${item.unit}/day` : '—'}</TableCell>
                      <TableCell align="right" sx={numericSx}>{item.daysRemaining === null ? '—' : `${formatNumber(item.daysRemaining, 1)} days`}</TableCell>
                      <TableCell align="right" sx={numericSx}>
                        {item.suggestedReorderQuantity !== null
                          ? formatQuantity(item.suggestedReorderQuantity, item.unit)
                          : item.reorderTriggered && !item.parConfigured
                            ? 'Set par'
                            : '—'}
                      </TableCell>
                      <TableCell><StatusLabel label={status.label} tone={status.tone} /></TableCell>
                      <TableCell align="right">
                        {item.reorderTriggered ? (
                          <Button component={Link} to="/purchasing" state={{ prefill: { ingredientId: item.id, quantity: item.suggestedReorderQuantity, supplierId: item.preferredSupplier?.id } }} size="small">Create PO</Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
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
            onRowsPerPageChange={(event) => { setRowsPerPage(Number.parseInt(event.target.value, 10)); setPage(0) }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </Box>
      </Stack>
    </Box>
  )
}
