import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/http'
import { getErrorMessage } from '../../api/error'
import {
  cancelStocktake,
  finishStocktake,
  getStocktake,
  saveStocktake,
  type Stocktake,
  type StocktakeConflict,
  type StocktakeLine,
} from '../../api/stocktakes'
import { LedgerPageHeader } from '../../components/ui/LedgerPageHeader'
import { LedgerTableContainer } from '../../components/ui/LedgerTableContainer'
import { StatusLabel } from '../../components/ui/StatusLabel'
import { formatCurrency, formatQuantity, formatSignedDelta } from '../../components/ui/formatters'
import { ledgerTokens, numericSx } from '../../theme'

type CountValues = Record<string, string>
const statusLabel = { DRAFT: 'In progress', POSTED: 'Completed', CANCELLED: 'Cancelled' } as const
const statusTone = { DRAFT: 'warning', POSTED: 'success', CANCELLED: 'neutral' } as const
const ABS_EPSILON = 1e-9
const REL_EPSILON = 1e-9

const valuesFrom = (stocktake: Stocktake): CountValues => Object.fromEntries(
  stocktake.lines.map((line) => [line.ingredientId, line.countedQuantity === null ? '' : String(line.countedQuantity)]),
)
const parseCount = (value: string) => {
  if (value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}
const isValidCount = (value: string) => typeof parseCount(value) === 'number'
const approximatelyEqual = (left: number, right: number) =>
  Math.abs(left - right) <=
  Math.max(ABS_EPSILON, REL_EPSILON * Math.max(Math.abs(left), Math.abs(right), 1))
const displayDifference = (count: number, expected: number) =>
  approximatelyEqual(count, expected) ? 0 : count - expected
const completedIdsFrom = (stocktake: Stocktake) => new Set(
  stocktake.lines.filter((line) => line.countedQuantity !== null).map((line) => line.ingredientId),
)

export const StocktakeDetailPage = () => {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [stocktake, setStocktake] = useState<Stocktake | null>(null)
  const [values, setValues] = useState<CountValues>({})
  const [completedInputIds, setCompletedInputIds] = useState<Set<string>>(() => new Set())
  const [editingInputId, setEditingInputId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [uncountedOnly, setUncountedOnly] = useState(false)
  const [step, setStep] = useState<'counts' | 'review'>('counts')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<{ severity: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [conflicts, setConflicts] = useState<StocktakeConflict[]>([])
  const inputRefs = useRef(new Map<string, HTMLInputElement>())

  useEffect(() => {
    let active = true
    getStocktake(id)
      .then((response) => {
        if (!active) return
        setStocktake(response)
        setValues(valuesFrom(response))
        setCompletedInputIds(completedIdsFrom(response))
      })
      .catch((error: unknown) => active && setMessage({ severity: 'error', text: getErrorMessage(error, 'Could not load this stock count.') }))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [id])

  const visibleLines = useMemo(() => {
    if (!stocktake) return []
    const query = search.trim().toLowerCase()
    return stocktake.lines.filter((line) => {
      const matchesSearch = !query || line.ingredientNameSnapshot.toLowerCase().includes(query) || line.categorySnapshot.toLowerCase().includes(query)
      const remainsVisibleWhileEditing = editingInputId === line.ingredientId
      return matchesSearch && (!uncountedOnly || !completedInputIds.has(line.ingredientId) || remainsVisibleWhileEditing)
    })
  }, [stocktake, search, uncountedOnly, completedInputIds, editingInputId])

  const countedLineCount = stocktake?.lines.filter((line) => isValidCount(values[line.ingredientId] ?? '')).length ?? 0
  const progress = stocktake?.lines.length ? (countedLineCount / stocktake.lines.length) * 100 : 0
  const differences = useMemo(() => stocktake?.lines.filter((line) => {
    const count = parseCount(values[line.ingredientId] ?? '')
    return typeof count === 'number' && displayDifference(count, line.expectedStockQuantitySnapshot) !== 0
  }) ?? [], [stocktake, values])

  const payload = () => {
    if (!stocktake) return null
    const counts = stocktake.lines.map((line) => ({ ingredientId: line.ingredientId, countedQuantity: parseCount(values[line.ingredientId] ?? '') }))
    if (counts.some((line) => line.countedQuantity === undefined)) return null
    return counts as Array<{ ingredientId: string; countedQuantity: number | null }>
  }

  const handleSave = async (showSuccess = true) => {
    const counts = payload()
    if (!counts) { setMessage({ severity: 'error', text: 'Enter a number of zero or more for each physical count.' }); return null }
    setWorking(true)
    try {
      const saved = await saveStocktake(id, counts)
      setStocktake(saved)
      setValues(valuesFrom(saved))
      setCompletedInputIds(completedIdsFrom(saved))
      if (showSuccess) setMessage({ severity: 'success', text: 'Stock count saved for later.' })
      return saved
    } catch (error) {
      setMessage({ severity: 'error', text: getErrorMessage(error, 'Could not save this stock count.') })
      return null
    } finally {
      setWorking(false)
    }
  }

  const handleReview = async () => {
    if (!stocktake) return
    const missing = stocktake.lines.filter((line) => !isValidCount(values[line.ingredientId] ?? '')).length
    if (missing) {
      setUncountedOnly(true)
      setMessage({ severity: 'warning', text: `${missing} ${missing === 1 ? 'item still needs' : 'items still need'} to be counted.` })
      return
    }
    if (await handleSave(false)) { setMessage(null); setStep('review'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  }

  const handleFinish = async () => {
    setWorking(true)
    try {
      const completed = await finishStocktake(id)
      setStocktake(completed)
      setValues(valuesFrom(completed))
      setCompletedInputIds(completedIdsFrom(completed))
      setStep('counts')
      setMessage({ severity: 'success', text: 'Stock Count completed. Inventory is up to date.' })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'STOCKTAKE_CONFLICT') {
        setStep('counts')
        setConflicts((error.details ?? []) as unknown as StocktakeConflict[])
      } else setMessage({ severity: 'error', text: getErrorMessage(error, 'Could not update inventory.') })
    } finally {
      setWorking(false)
    }
  }

  const handleCancel = async () => {
    setWorking(true)
    try {
      const cancelled = await cancelStocktake(id)
      setStocktake(cancelled)
      setCancelOpen(false)
      setMessage({ severity: 'success', text: 'Stock count cancelled.' })
    } catch (error) {
      setMessage({ severity: 'error', text: getErrorMessage(error, 'Could not cancel this stock count.') })
    } finally { setWorking(false) }
  }

  const focusNext = (lineId: string) => {
    const index = visibleLines.findIndex((line) => line.ingredientId === lineId)
    const next = visibleLines[index + 1]
    if (next) inputRefs.current.get(next.ingredientId)?.focus()
  }

  const completeInput = (lineId: string) => {
    setEditingInputId((current) => current === lineId ? null : current)
    setCompletedInputIds((current) => {
      const next = new Set(current)
      if (isValidCount(values[lineId] ?? '')) next.add(lineId)
      else next.delete(lineId)
      return next
    })
  }

  if (loading) return <Stack spacing={2}><Skeleton width={260} height={48} /><Skeleton height={12} /><Skeleton variant="rectangular" height={360} /></Stack>
  if (!stocktake) return <><Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate('/stock-counts')}>Back to Stock Count</Button>{message ? <Alert severity="error" sx={{ mt: 2 }}>{message.text}</Alert> : null}</>

  const readOnly = stocktake.status !== 'DRAFT'

  if (readOnly) return (
    <>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate('/stock-counts')} sx={{ mb: 2 }}>Back to Stock Count</Button>
      <LedgerPageHeader title={stocktake.name} subtitle={stocktake.notes || undefined} meta={<StatusLabel label={statusLabel[stocktake.status]} tone={statusTone[stocktake.status]} />} />
      {message ? <Alert severity={message.severity} sx={{ mb: 2 }}>{message.text}</Alert> : null}
      {stocktake.status === 'POSTED' ? (
        <Box sx={{ border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', p: { xs: 2, sm: 2.5 }, mb: 2.5 }}>
          <Typography variant="h5">Stock Count completed</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 4 }} sx={{ mt: 1.5 }}>
            <Typography><Box component="span" sx={numericSx}>{stocktake.summary.lineCount}</Box> items counted</Typography>
            <Typography><Box component="span" sx={numericSx}>{stocktake.summary.varianceLineCount}</Box> items had differences</Typography>
            <Typography color="text.secondary">Lower than expected: <Box component="span" sx={numericSx}>{stocktake.summary.shortageLineCount}</Box></Typography>
            <Typography color="text.secondary">Higher than expected: <Box component="span" sx={numericSx}>{stocktake.summary.overageLineCount}</Box></Typography>
          </Stack>
          <Typography sx={{ mt: 2, fontWeight: 500 }}>Inventory difference: <Box component="span" sx={numericSx}>{formatCurrency(stocktake.summary.netVarianceValue)}</Box></Typography>
        </Box>
      ) : <Alert severity="info" sx={{ mb: 2.5 }}>This stock count was cancelled. No inventory was changed.</Alert>}
      <LedgerTableContainer>
        <Table aria-label="Stock count details">
          <TableHead><TableRow><TableCell>Ingredient</TableCell><TableCell align="right">System quantity</TableCell><TableCell align="right">Physical count</TableCell><TableCell align="right">Difference</TableCell><TableCell align="right">Unit cost</TableCell><TableCell align="right">Difference value</TableCell></TableRow></TableHead>
          <TableBody>{stocktake.lines.map((line) => <TableRow key={line.ingredientId}>
            <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{line.ingredientNameSnapshot}</Typography><Typography variant="caption" color="text.secondary">{line.categorySnapshot}</Typography></TableCell>
            <TableCell align="right" sx={numericSx}>{formatQuantity(line.expectedStockQuantitySnapshot, line.unit)}</TableCell>
            <TableCell align="right" sx={numericSx}>{line.countedQuantity === null ? 'Not counted' : formatQuantity(line.countedQuantity, line.unit)}</TableCell>
            <TableCell align="right" sx={numericSx}>{line.varianceQuantity === null ? '—' : formatSignedDelta(line.varianceQuantity, line.unit)}</TableCell>
            <TableCell align="right" sx={numericSx}>{line.unitCostSnapshot === null ? '—' : formatCurrency(line.unitCostSnapshot)}</TableCell>
            <TableCell align="right" sx={numericSx}>{line.varianceValue === null ? '—' : formatCurrency(line.varianceValue)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </LedgerTableContainer>
    </>
  )

  if (step === 'review') return (
    <>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => setStep('counts')} sx={{ mb: 2 }}>Back to counts</Button>
      <LedgerPageHeader title="Review differences" subtitle={`${differences.length} ${differences.length === 1 ? 'item has' : 'items have'} differences.`} />
      {differences.length === 0 ? <Alert severity="success" sx={{ mb: 2 }}>Everything matches the system quantities.</Alert> : (
        <Stack spacing={1.25} sx={{ mb: 3 }}>{differences.map((line) => {
          const count = parseCount(values[line.ingredientId]) as number
          const difference = displayDifference(count, line.expectedStockQuantitySnapshot)
          return <Box key={line.ingredientId} sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', p: { xs: 2, sm: 2.5 } }}>
            <Typography sx={{ fontWeight: 500 }}>{line.ingredientNameSnapshot}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 4 }} sx={{ mt: 1 }}>
              <Typography color="text.secondary">System <Box component="span" color="text.primary" sx={numericSx}>{formatQuantity(line.expectedStockQuantitySnapshot, line.unit)}</Box></Typography>
              <Typography color="text.secondary">Counted <Box component="span" color="text.primary" sx={numericSx}>{formatQuantity(count, line.unit)}</Box></Typography>
              <Typography color="text.secondary">Difference <Box component="span" color={difference < 0 ? 'error.main' : 'success.main'} sx={numericSx}>{formatSignedDelta(difference, line.unit)}</Box></Typography>
            </Stack>
          </Box>
        })}</Stack>
      )}
      <Stack direction={{ xs: 'column-reverse', sm: 'row' }} justifyContent="flex-end" spacing={1}>
        <Button onClick={() => setStep('counts')}>Back to counts</Button>
        <Button variant="contained" disabled={working} onClick={handleFinish}>Confirm & update inventory</Button>
      </Stack>
    </>
  )

  return (
    <>
      <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate('/stock-counts')} sx={{ mb: 2 }}>Back to Stock Count</Button>
      <LedgerPageHeader title="Stock Count" subtitle={stocktake.name} meta={stocktake.notes || undefined} />
      <Box sx={{ mb: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}><Typography variant="body2" sx={{ fontWeight: 500 }}>{countedLineCount} of {stocktake.lines.length} items counted</Typography><Typography variant="caption" color="text.secondary" sx={numericSx}>{Math.round(progress)}%</Typography></Stack>
        <LinearProgress variant="determinate" value={progress} sx={{ height: 5, bgcolor: ledgerTokens.surfaceSecondary, '& .MuiLinearProgress-bar': { bgcolor: progress === 100 ? 'success.main' : 'primary.main' } }} />
      </Box>
      {message ? <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message.text}</Alert> : null}
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1.5} sx={{ mb: 1.5 }}>
        <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items" aria-label="Search items" slotProps={{ input: { startAdornment: <SearchRoundedIcon color="disabled" sx={{ mr: 1, fontSize: 19 }} /> } }} sx={{ flex: 1, maxWidth: 420 }} />
        <FormControlLabel control={<Checkbox checked={uncountedOnly} onChange={(event) => setUncountedOnly(event.target.checked)} />} label="Show uncounted only" />
      </Stack>
      <Box sx={{ border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Box sx={{ display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: 'minmax(180px, 1fr) 180px minmax(220px, 0.8fr)', px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: ledgerTokens.surfaceSecondary }}><Typography variant="caption">Item</Typography><Typography variant="caption" align="right">System quantity</Typography><Typography variant="caption" sx={{ pl: 3 }}>Physical count</Typography></Box>
        {visibleLines.length === 0 ? <Typography color="text.secondary" align="center" sx={{ py: 5 }}>No items match these controls.</Typography> : visibleLines.map((line: StocktakeLine) => <Box key={line.ingredientId} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(180px, 1fr) 180px minmax(220px, 0.8fr)' }, gap: { xs: 1.25, sm: 0 }, alignItems: 'center', px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
          <Box><Typography variant="body2" sx={{ fontWeight: 500 }}>{line.ingredientNameSnapshot}</Typography>{line.categorySnapshot ? <Typography variant="caption" color="text.secondary">{line.categorySnapshot}</Typography> : null}</Box>
          <Typography sx={{ ...numericSx, textAlign: { xs: 'left', sm: 'right' } }}><Box component="span" sx={{ display: { xs: 'inline', sm: 'none' }, color: 'text.secondary', fontFamily: 'inherit' }}>System: </Box>{formatQuantity(line.expectedStockQuantitySnapshot, line.unit)}</Typography>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: { sm: 3 } }}><TextField
            value={values[line.ingredientId] ?? ''}
            onChange={(event) => setValues((current) => ({ ...current, [line.ingredientId]: event.target.value }))}
            onFocus={() => setEditingInputId(line.ingredientId)}
            onBlur={() => completeInput(line.ingredientId)}
            inputRef={(node: HTMLInputElement | null) => { if (node) inputRefs.current.set(line.ingredientId, node); else inputRefs.current.delete(line.ingredientId) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && isValidCount(values[line.ingredientId] ?? '')) {
                event.preventDefault()
                completeInput(line.ingredientId)
                focusNext(line.ingredientId)
              }
            }}
            type="number" inputMode="decimal" placeholder="Not counted"
            slotProps={{ htmlInput: { 'aria-label': `Physical count for ${line.ingredientNameSnapshot}`, min: 0, step: 'any' } }}
            sx={{ width: 150, '& input': { ...numericSx, fontSize: '1rem' } }}
          /><Typography sx={numericSx}>{line.unit}</Typography></Stack>
        </Box>)}
      </Box>
      <Stack direction={{ xs: 'column-reverse', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mt: 2.5 }}>
        <Button color="error" onClick={() => setCancelOpen(true)}>Cancel stock count</Button>
        <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1}><Button variant="outlined" disabled={working} onClick={() => handleSave(true)}>Save for later</Button><Button variant="contained" disabled={working} onClick={handleReview}>Review & finish</Button></Stack>
      </Stack>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)}><DialogTitle>Cancel stock count?</DialogTitle><DialogContent><Typography>Your saved counts will stay in history, but inventory will not change.</Typography></DialogContent><DialogActions><Button onClick={() => setCancelOpen(false)}>Keep counting</Button><Button color="error" disabled={working} onClick={handleCancel}>Cancel stock count</Button></DialogActions></Dialog>
      <Dialog open={conflicts.length > 0} onClose={() => setConflicts([])} fullWidth maxWidth="sm"><DialogTitle>Inventory changed while you were counting</DialogTitle><DialogContent><Typography color="text.secondary">Some stock changed after this count started. Your saved counts were not applied.</Typography><Stack spacing={1.5} sx={{ mt: 2 }}>{conflicts.map((conflict) => <Box key={conflict.ingredientId} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.5 }}><Typography sx={{ fontWeight: 500 }}>{conflict.ingredientName}</Typography><Typography variant="body2" color="text.secondary">Started: <Box component="span" color="text.primary" sx={numericSx}>{formatQuantity(conflict.expectedQuantity, conflict.unit)}</Box> · Now: <Box component="span" color="text.primary" sx={numericSx}>{conflict.currentQuantity === null ? 'Unavailable' : formatQuantity(conflict.currentQuantity, conflict.unit)}</Box></Typography></Box>)}</Stack></DialogContent><DialogActions><Button onClick={() => setConflicts([])}>Close</Button><Button variant="contained" onClick={() => navigate('/stock-counts?start=1')}>Start a new stock count</Button></DialogActions></Dialog>
    </>
  )
}
