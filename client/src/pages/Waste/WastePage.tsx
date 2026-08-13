import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { listIngredients } from '../../api/ingredients'
import {
  listWaste,
  wasteReasonCodes,
  wasteReasonLabels,
  type WasteItem,
  type WasteReasonCode,
  type WasteSummary,
} from '../../api/waste'
import { DataToolbar } from '../../components/ui/DataToolbar'
import { formatCurrency, formatDateTime, formatQuantity } from '../../components/ui/formatters'
import { LedgerEmptyState } from '../../components/ui/LedgerEmptyState'
import { LedgerPageHeader } from '../../components/ui/LedgerPageHeader'
import { LedgerTableContainer } from '../../components/ui/LedgerTableContainer'
import { MetricStrip } from '../../components/ui/MetricStrip'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAppSnackbar } from '../../context/snackbarContext'
import { numericSx } from '../../theme'
import type { Ingredient } from '../../types/ingredient'

interface Filters {
  ingredientId: string
  reasonCode: '' | WasteReasonCode
  dateFrom: string
  dateTo: string
}

const emptyFilters: Filters = { ingredientId: '', reasonCode: '', dateFrom: '', dateTo: '' }

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

export const WastePage = () => {
  const { showSnackbar } = useAppSnackbar()
  const [rows, setRows] = useState<WasteItem[]>([])
  const [summary, setSummary] = useState<WasteSummary>({ eventCount: 0, totalWasteValue: 0, byReason: [] })
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [totalRows, setTotalRows] = useState(0)

  const loadWaste = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await listWaste({
        page: page + 1,
        limit: rowsPerPage,
        ingredientId: filters.ingredientId || undefined,
        reasonCode: filters.reasonCode || undefined,
        dateFrom: toLocalDayBoundaryIso(filters.dateFrom, 'start'),
        dateTo: toLocalDayBoundaryIso(filters.dateTo, 'end'),
        sortOrder,
      })
      setRows(response.items)
      setSummary(response.summary)
      setTotalRows(response.pagination.total)
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load waste history'), { severity: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [filters, page, rowsPerPage, showSnackbar, sortOrder])

  useEffect(() => {
    void loadWaste()
  }, [loadWaste])

  useEffect(() => {
    let active = true
    const loadIngredientCatalog = async () => {
      try {
        const catalog: Ingredient[] = []
        let catalogPage = 1
        let totalPages = 1
        do {
          const response = await listIngredients({
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
        if (active) setIngredients(catalog)
      } catch {
        if (active) setIngredients([])
      }
    }
    void loadIngredientCatalog()
    return () => {
      active = false
    }
  }, [])

  const mostCommonReason = useMemo(() => {
    const leading = summary.byReason.reduce<WasteSummary['byReason'][number] | undefined>(
      (current, entry) => (!current || entry.eventCount > current.eventCount ? entry : current),
      undefined,
    )
    return leading ? wasteReasonLabels[leading.reasonCode] : '—'
  }, [summary.byReason])

  return (
    <Box>
      <LedgerPageHeader
        title="Waste"
        subtitle="Track spoilage, expired stock, prep loss, and damaged inventory."
        meta={
          <Typography component="span" sx={{ ...numericSx, fontSize: 'inherit' }}>
            {totalRows} waste event{totalRows === 1 ? '' : 's'}
          </Typography>
        }
      />

      <Stack spacing={2}>
        <MetricStrip
          items={[
            { label: 'Waste value', value: formatCurrency(summary.totalWasteValue) },
            { label: 'Waste events', value: String(summary.eventCount) },
            { label: 'Most common reason', value: mostCommonReason },
          ]}
        />

        <DataToolbar
          primary={
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
                <InputLabel id="waste-ingredient-label">Ingredient</InputLabel>
                <Select
                  labelId="waste-ingredient-label"
                  label="Ingredient"
                  value={draftFilters.ingredientId}
                  onChange={(event) => setDraftFilters((previous) => ({ ...previous, ingredientId: event.target.value }))}
                >
                  <MenuItem value="">All ingredients</MenuItem>
                  {ingredients.map((ingredient) => (
                    <MenuItem key={ingredient.id} value={ingredient.id}>{ingredient.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 155 } }}>
                <InputLabel id="waste-reason-filter-label">Reason</InputLabel>
                <Select
                  labelId="waste-reason-filter-label"
                  label="Reason"
                  value={draftFilters.reasonCode}
                  onChange={(event) => setDraftFilters((previous) => ({
                    ...previous,
                    reasonCode: event.target.value as Filters['reasonCode'],
                  }))}
                >
                  <MenuItem value="">All reasons</MenuItem>
                  {wasteReasonCodes.map((code) => (
                    <MenuItem key={code} value={code}>{wasteReasonLabels[code]}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="From"
                type="date"
                value={draftFilters.dateFrom}
                onChange={(event) => setDraftFilters((previous) => ({ ...previous, dateFrom: event.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                size="small"
                label="To"
                type="date"
                value={draftFilters.dateTo}
                onChange={(event) => setDraftFilters((previous) => ({ ...previous, dateTo: event.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          }
          secondary={
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button variant="contained" onClick={() => { setFilters(draftFilters); setPage(0) }}>Apply filters</Button>
              <Button
                variant="outlined"
                disabled={!filters.ingredientId && !filters.reasonCode && !filters.dateFrom && !filters.dateTo}
                onClick={() => { setDraftFilters(emptyFilters); setFilters(emptyFilters); setPage(0) }}
              >
                Reset
              </Button>
              <Button
                variant="text"
                startIcon={<SwapVertRoundedIcon />}
                onClick={() => { setSortOrder((previous) => (previous === 'desc' ? 'asc' : 'desc')); setPage(0) }}
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
              title="No waste records found"
              description="Recorded spoilage, expiry, prep loss, and damage will appear here."
              minHeight={220}
            />
          ) : (
            <Table size="small" stickyHeader aria-label="Waste history">
              <TableHead>
                <TableRow>
                  <TableCell>Date and time</TableCell>
                  <TableCell>Ingredient</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell align="right">Unit cost</TableCell>
                  <TableCell align="right">Loss value</TableCell>
                  <TableCell>Note</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell sx={{ ...numericSx, minWidth: 155, color: 'text.secondary' }}>{formatDateTime(item.createdAt)}</TableCell>
                    <TableCell sx={{ minWidth: 145, fontWeight: 500 }}>{item.ingredientName}</TableCell>
                    <TableCell>{wasteReasonLabels[item.reasonCode]}</TableCell>
                    <TableCell align="right" sx={numericSx}>{formatQuantity(item.quantity, item.unit)}</TableCell>
                    <TableCell align="right" sx={numericSx}>{item.unitCost === undefined ? '—' : formatCurrency(item.unitCost)}</TableCell>
                    <TableCell align="right" sx={numericSx}>{formatCurrency(item.lossValue)}</TableCell>
                    <TableCell sx={{ minWidth: 180 }}>{item.note || '—'}</TableCell>
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
            onRowsPerPageChange={(event) => { setRowsPerPage(Number.parseInt(event.target.value, 10)); setPage(0) }}
            rowsPerPageOptions={[5, 10, 20, 50]}
          />
        </Box>
      </Stack>
    </Box>
  )
}
