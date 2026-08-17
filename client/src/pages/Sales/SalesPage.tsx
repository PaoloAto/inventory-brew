import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  InputAdornment, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import {
  cancelSalesRecord, getSalesRecord, getSalesSummary, listSalesRecords, recordSales,
  type MenuPerformanceItem, type SalesRecord, type SalesRecordListItem, type SalesSummary,
} from '../../api/sales'
import { getErrorMessage } from '../../api/error'
import { listRecipes } from '../../api/recipes'
import { LedgerEmptyState } from '../../components/ui/LedgerEmptyState'
import { LedgerPageHeader } from '../../components/ui/LedgerPageHeader'
import { LedgerSection } from '../../components/ui/LedgerSection'
import { MetricStrip } from '../../components/ui/MetricStrip'
import { StatusLabel } from '../../components/ui/StatusLabel'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAppSnackbar } from '../../context/snackbarContext'
import { numericSx } from '../../theme'
import type { Recipe } from '../../types/recipe'

type Period = 'today' | '7days' | '30days'
const emptySummary: SalesSummary = { totalServings: 0, totalRevenue: 0, totalEstimatedFoodCost: 0, totalEstimatedGrossProfit: 0, grossMarginPercent: null }
const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'TWD', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const integer = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const displayDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}
const periodRange = (period: Period) => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const offset = period === 'today' ? 0 : period === '7days' ? 6 : 29
  return { dateFrom: localDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)), dateTo: localDate(today) }
}
const margin = (value: number | null) => value === null ? '—' : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}%`
const recordStatus = (status: SalesRecord['status']) => status === 'ACTIVE'
  ? <StatusLabel label="Recorded" tone="success" />
  : <StatusLabel label="Cancelled" tone="neutral" />

export const SalesPage = () => {
  const { showSnackbar } = useAppSnackbar()
  const [period, setPeriod] = useState<Period>('7days')
  const [summary, setSummary] = useState(emptySummary)
  const [performance, setPerformance] = useState<MenuPerformanceItem[]>([])
  const [records, setRecords] = useState<SalesRecordListItem[]>([])
  const [totalRecords, setTotalRecords] = useState(0)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [recordOpen, setRecordOpen] = useState(false)
  const [businessDate, setBusinessDate] = useState(localDate(new Date()))
  const [menuSearch, setMenuSearch] = useState('')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [recordError, setRecordError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [details, setDetails] = useState<SalesRecord | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const analyticsRequestId = useRef(0)
  const range = useMemo(() => periodRange(period), [period])

  const loadAnalytics = useCallback(async () => {
    const requestId = analyticsRequestId.current + 1
    analyticsRequestId.current = requestId
    setAnalyticsLoading(true)
    setAnalyticsError(null)
    setSummary(emptySummary)
    setPerformance([])
    try {
      const response = await getSalesSummary(range.dateFrom, range.dateTo)
      if (requestId !== analyticsRequestId.current) return
      setSummary(response.summary)
      setPerformance(response.items)
    } catch (error) {
      if (requestId !== analyticsRequestId.current) return
      const message = getErrorMessage(error, 'Sales performance could not be loaded for this period.')
      setAnalyticsError(message)
      showSnackbar(message, { severity: 'error' })
    } finally {
      if (requestId === analyticsRequestId.current) setAnalyticsLoading(false)
    }
  }, [range, showSnackbar])

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true)
    try {
      const response = await listSalesRecords({ page: page + 1, limit: rowsPerPage })
      setRecords(response.items)
      setTotalRecords(response.pagination.total)
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load recent sales'), { severity: 'error' })
    } finally { setRecordsLoading(false) }
  }, [page, rowsPerPage, showSnackbar])

  useEffect(() => { void loadAnalytics() }, [loadAnalytics, refreshKey])
  useEffect(() => { void loadRecords() }, [loadRecords, refreshKey])
  useEffect(() => {
    let active = true
    const loadCatalog = async () => {
      setCatalogLoading(true)
      try {
        const catalog: Recipe[] = []
        let catalogPage = 1
        let totalPages = 1
        do {
          const response = await listRecipes({ page: catalogPage, limit: 100, includeInactive: false, sortBy: 'name', sortOrder: 'asc' })
          catalog.push(...response.items)
          totalPages = response.pagination.totalPages
          catalogPage += 1
        } while (catalogPage <= totalPages)
        if (active) setRecipes(catalog)
      } catch (error) {
        if (active) showSnackbar(getErrorMessage(error, 'Failed to load menu items'), { severity: 'error' })
      } finally { if (active) setCatalogLoading(false) }
    }
    void loadCatalog()
    return () => { active = false }
  }, [showSnackbar])

  const visibleRecipes = useMemo(() => {
    const query = menuSearch.trim().toLocaleLowerCase()
    return query ? recipes.filter((recipe) => recipe.name.toLocaleLowerCase().includes(query)) : recipes
  }, [menuSearch, recipes])
  const selectedLines = useMemo(() => recipes.flatMap((recipe) => {
    const raw = quantities[recipe.id] ?? ''
    const servingsSold = Number(raw)
    return raw !== '' && Number.isSafeInteger(servingsSold) && servingsSold > 0 ? [{ recipe, servingsSold }] : []
  }), [quantities, recipes])
  const previewServings = selectedLines.reduce((total, line) => total + line.servingsSold, 0)
  const previewRevenue = selectedLines.reduce((total, line) => total + line.servingsSold * line.recipe.sellingPrice, 0)

  const openRecord = () => {
    setBusinessDate(localDate(new Date()))
    setMenuSearch('')
    setQuantities({})
    setRecordError(null)
    setRecordOpen(true)
  }
  const submitSales = async () => {
    if (selectedLines.length === 0) return setRecordError('Enter servings sold for at least one menu item.')
    setSaving(true)
    setRecordError(null)
    try {
      await recordSales({ businessDate, lines: selectedLines.map(({ recipe, servingsSold }) => ({ recipeId: recipe.id, servingsSold })) })
      setRecordOpen(false)
      setQuantities({})
      setRefreshKey((value) => value + 1)
      showSnackbar('Sales recorded.', { severity: 'success' })
    } catch (error) { setRecordError(getErrorMessage(error, 'Sales could not be recorded')) }
    finally { setSaving(false) }
  }
  const openDetails = async (id: string) => {
    setDetailsOpen(true)
    setDetailsLoading(true)
    setDetails(null)
    try { setDetails(await getSalesRecord(id)) }
    catch (error) {
      setDetailsOpen(false)
      showSnackbar(getErrorMessage(error, 'Failed to load sales details'), { severity: 'error' })
    } finally { setDetailsLoading(false) }
  }
  const cancelRecord = async () => {
    if (!details) return
    setCancelling(true)
    try {
      await cancelSalesRecord(details.id)
      setConfirmCancelOpen(false)
      setDetailsOpen(false)
      setDetails(null)
      setRefreshKey((value) => value + 1)
      showSnackbar('Sales record cancelled.', { severity: 'success' })
    } catch (error) { showSnackbar(getErrorMessage(error, 'Sales record could not be cancelled'), { severity: 'error' }) }
    finally { setCancelling(false) }
  }

  return <Box>
    <LedgerPageHeader title="Sales" subtitle="Record servings sold and see which menu items are performing best." actions={
      <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openRecord}>Record Sales</Button>
    } />
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
        <Box>
          <Typography variant="overline" color="text.secondary">Performance period</Typography>
          <Typography variant="caption" display="block" color="text.secondary" sx={numericSx}>{displayDate(range.dateFrom)} — {displayDate(range.dateTo)}</Typography>
        </Box>
        <ToggleButtonGroup exclusive size="small" value={period} onChange={(_event, value: Period | null) => value && setPeriod(value)} aria-label="Sales performance period" sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, bgcolor: 'background.paper' }}>
          <ToggleButton value="today">Today</ToggleButton><ToggleButton value="7days">7 days</ToggleButton><ToggleButton value="30days">30 days</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {analyticsLoading ? <Paper sx={{ height: 98, border: '1px solid', borderColor: 'divider' }} /> : analyticsError ?
        <Alert severity="error">{analyticsError}</Alert> :
        <MetricStrip items={[
          { label: 'Estimated revenue', value: currency.format(summary.totalRevenue) },
          { label: 'Estimated food cost', value: currency.format(summary.totalEstimatedFoodCost) },
          { label: 'Estimated gross profit', value: currency.format(summary.totalEstimatedGrossProfit) },
          { label: 'Gross margin', value: margin(summary.grossMarginPercent), detail: `${integer.format(summary.totalServings)} servings sold` },
        ]} />}

      <LedgerSection title="Menu performance" subtitle="Based on recorded sales in the selected period." padded={false}>
        {analyticsLoading ? <TableSkeleton rows={6} /> : analyticsError ? <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Alert severity="error">{analyticsError}</Alert>
        </Box> : <TableContainer sx={{ overflowX: 'auto' }}><Table size="small" aria-label="Menu performance">
          <TableHead><TableRow><TableCell>Menu item</TableCell><TableCell align="right">Sold</TableCell><TableCell align="right">Est. revenue</TableCell><TableCell align="right">Est. food cost</TableCell><TableCell align="right">Est. gross profit</TableCell><TableCell align="right">Margin</TableCell></TableRow></TableHead>
          <TableBody>{performance.map((item) => <TableRow key={item.recipeId}>
            <TableCell sx={{ fontWeight: 500 }}>{item.recipeName}</TableCell><TableCell align="right" sx={numericSx}>{integer.format(item.servingsSold)}</TableCell><TableCell align="right" sx={numericSx}>{currency.format(item.estimatedRevenue)}</TableCell><TableCell align="right" sx={numericSx}>{currency.format(item.estimatedFoodCost)}</TableCell><TableCell align="right" sx={numericSx}>{currency.format(item.estimatedGrossProfit)}</TableCell><TableCell align="right" sx={numericSx}>{margin(item.grossMarginPercent)}</TableCell>
          </TableRow>)}{!analyticsLoading && performance.length === 0 ? <TableRow><TableCell colSpan={6} sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>No recorded sales in this period.</TableCell></TableRow> : null}</TableBody>
        </Table></TableContainer>}
      </LedgerSection>

      <LedgerSection title="Recent sales" subtitle="Open a row to review its recorded details." padded={false}>
        {recordsLoading ? <TableSkeleton rows={5} /> : records.length === 0 ?
          <LedgerEmptyState title="No sales recorded yet" description="Record servings sold to begin sales history." /> :
          <TableContainer sx={{ overflowX: 'auto' }}><Table size="small" aria-label="Recent sales records">
            <TableHead><TableRow><TableCell>Date</TableCell><TableCell align="right">Menu items</TableCell><TableCell align="right">Servings</TableCell><TableCell align="right">Estimated revenue</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
            <TableBody>{records.map((record) => <TableRow hover key={record.id} tabIndex={0} role="button" onClick={() => void openDetails(record.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') void openDetails(record.id) }} sx={{ cursor: 'pointer' }}>
              <TableCell>{displayDate(record.businessDate)}</TableCell><TableCell align="right" sx={numericSx}>{integer.format(record.lineCount)}</TableCell><TableCell align="right" sx={numericSx}>{integer.format(record.totalServings)}</TableCell><TableCell align="right" sx={numericSx}>{currency.format(record.totalRevenue)}</TableCell><TableCell>{recordStatus(record.status)}</TableCell>
            </TableRow>)}</TableBody>
          </Table></TableContainer>}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid', borderColor: 'divider' }}><TablePagination component="div" count={totalRecords} page={page} rowsPerPage={rowsPerPage} rowsPerPageOptions={[5, 10, 20]} onPageChange={(_event, value) => setPage(value)} onRowsPerPageChange={(event) => { setRowsPerPage(Number.parseInt(event.target.value, 10)); setPage(0) }} /></Box>
      </LedgerSection>
    </Stack>

    <Dialog open={recordOpen} onClose={saving ? undefined : () => setRecordOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle>Record Sales</DialogTitle><DialogContent dividers><Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField label="Date" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 190 } }} />
          <TextField label="Search menu items" value={menuSearch} onChange={(event) => setMenuSearch(event.target.value)} fullWidth InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }} />
        </Stack>
        <Box sx={{ border: '1px solid', borderColor: 'divider', maxHeight: 400, overflowY: 'auto' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px 150px', gap: 1.5, px: 2, py: 1, bgcolor: 'grey.100', borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">Menu item</Typography><Typography variant="caption" color="text.secondary" textAlign="right">Menu price</Typography><Typography variant="caption" color="text.secondary" textAlign="right">Servings sold</Typography>
          </Box>
          {catalogLoading ? <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress size={24} /></Stack> : visibleRecipes.length === 0 ? <Typography color="text.secondary" sx={{ py: 5, textAlign: 'center' }}>No matching active menu items.</Typography> : visibleRecipes.map((recipe) =>
            <Box key={recipe.id} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px 150px', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{recipe.name}</Typography><Typography variant="body2" textAlign="right" sx={numericSx}>{currency.format(recipe.sellingPrice)}</Typography>
              <TextField size="small" type="text" inputMode="numeric" placeholder="0" value={quantities[recipe.id] ?? ''} onChange={(event) => { const value = event.target.value; if (!/^\d*$/.test(value)) return; setQuantities((current) => ({ ...current, [recipe.id]: value })); setRecordError(null) }} inputProps={{ 'aria-label': `Servings sold for ${recipe.name}`, min: 0, step: 1, style: { textAlign: 'right', fontSize: 17 } }} />
            </Box>)}
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ px: 2, py: 1.5, bgcolor: 'grey.100', borderLeft: '3px solid', borderColor: 'primary.main' }}>
          <Typography variant="body2" sx={numericSx}>{selectedLines.length} menu item{selectedLines.length === 1 ? '' : 's'} · {integer.format(previewServings)} servings</Typography><Typography variant="body2" sx={{ ...numericSx, fontWeight: 500 }}>Estimated revenue {currency.format(previewRevenue)}</Typography>
        </Stack>
        {recordError ? <Alert severity="error">{recordError}</Alert> : null}
      </Stack></DialogContent><DialogActions><Button onClick={() => setRecordOpen(false)} disabled={saving}>Cancel</Button><Button variant="contained" onClick={() => void submitSales()} disabled={saving || catalogLoading}>{saving ? 'Recording…' : 'Record Sales'}</Button></DialogActions>
    </Dialog>

    <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle>Sales details</DialogTitle><DialogContent dividers>{detailsLoading ? <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress size={26} /></Stack> : details ? <Stack spacing={2.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="overline" color="text.secondary">Business date</Typography><Typography variant="h6">{displayDate(details.businessDate)}</Typography></Box>{recordStatus(details.status)}</Stack>
        <TableContainer sx={{ border: '1px solid', borderColor: 'divider' }}><Table size="small" aria-label="Sales line details"><TableHead><TableRow><TableCell>Recipe</TableCell><TableCell align="right">Servings sold</TableCell><TableCell align="right">Menu price</TableCell><TableCell align="right">Estimated revenue</TableCell><TableCell align="right">Cost / serving</TableCell><TableCell align="right">Est. food cost</TableCell><TableCell align="right">Est. gross profit</TableCell><TableCell align="right">Margin</TableCell></TableRow></TableHead><TableBody>{details.lines.map((line) => <TableRow key={line.recipeId}><TableCell sx={{ fontWeight: 500 }}>{line.recipeNameSnapshot}</TableCell><TableCell align="right" sx={numericSx}>{integer.format(line.servingsSold)}</TableCell><TableCell align="right" sx={numericSx}>{currency.format(line.sellingPricePerServingSnapshot)}</TableCell><TableCell align="right" sx={numericSx}>{currency.format(line.estimatedRevenue)}</TableCell><TableCell align="right" sx={numericSx}>{currency.format(line.costPerServingSnapshot)}</TableCell><TableCell align="right" sx={numericSx}>{currency.format(line.estimatedFoodCost)}</TableCell><TableCell align="right" sx={numericSx}>{currency.format(line.estimatedGrossProfit)}</TableCell><TableCell align="right" sx={numericSx}>{margin(line.grossMarginPercentSnapshot)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
        <Stack spacing={0.75} sx={{ alignSelf: 'flex-end', width: { xs: '100%', sm: 360 } }}>{[
          ['Total servings', integer.format(details.totalServings)], ['Estimated revenue', currency.format(details.totalRevenue)], ['Estimated food cost', currency.format(details.totalEstimatedFoodCost)], ['Estimated gross profit', currency.format(details.totalEstimatedGrossProfit)], ['Gross margin', margin(details.grossMarginPercent)],
        ].map(([label, value]) => <Stack key={label} direction="row" justifyContent="space-between" spacing={2}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{ ...numericSx, fontWeight: 500 }}>{value}</Typography></Stack>)}</Stack>
      </Stack> : null}</DialogContent><DialogActions><Button onClick={() => setDetailsOpen(false)}>Close</Button>{details?.status === 'ACTIVE' ? <Button color="error" onClick={() => setConfirmCancelOpen(true)}>Cancel record</Button> : null}</DialogActions>
    </Dialog>

    <Dialog open={confirmCancelOpen} onClose={cancelling ? undefined : () => setConfirmCancelOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle>Cancel sales record?</DialogTitle><DialogContent dividers><Typography>This record will stay in history but will no longer be included in sales performance totals.</Typography></DialogContent><DialogActions><Button onClick={() => setConfirmCancelOpen(false)} disabled={cancelling}>Keep record</Button><Button variant="contained" color="error" onClick={() => void cancelRecord()} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Cancel record'}</Button></DialogActions>
    </Dialog>
  </Box>
}
