import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Pagination,
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
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listStocktakes, startStocktake, type StocktakeListItem } from '../../api/stocktakes'
import { getErrorMessage } from '../../api/error'
import { LedgerPageHeader } from '../../components/ui/LedgerPageHeader'
import { LedgerTableContainer } from '../../components/ui/LedgerTableContainer'
import { StatusLabel } from '../../components/ui/StatusLabel'
import { formatCurrency, formatDateTime } from '../../components/ui/formatters'
import { numericSx } from '../../theme'

const statusLabel = { DRAFT: 'In progress', POSTED: 'Completed', CANCELLED: 'Cancelled' } as const
const statusTone = { DRAFT: 'warning', POSTED: 'success', CANCELLED: 'neutral' } as const
const defaultName = () => `Stock Count - ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`

export const StocktakesPage = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState<StocktakeListItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(searchParams.get('start') === '1')
  const [name, setName] = useState(defaultName)
  const [notes, setNotes] = useState('')
  const [starting, setStarting] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      listStocktakes({ page, limit: 20, search: search || undefined })
        .then((response) => {
          if (!active) return
          setItems(response.items)
          setTotalPages(response.pagination.totalPages)
          setError('')
        })
        .catch((requestError: unknown) => active && setError(getErrorMessage(requestError, 'Could not load stock counts.')))
        .finally(() => active && setLoading(false))
    }, 200)
    return () => { active = false; window.clearTimeout(timer) }
  }, [page, search, reloadKey])

  const retryLoad = () => {
    setLoading(true)
    setError('')
    setReloadKey((current) => current + 1)
  }

  const closeDialog = () => {
    setOpen(false)
    if (searchParams.has('start')) setSearchParams({}, { replace: true })
  }

  const handleStart = async () => {
    if (!name.trim()) return
    setStarting(true)
    setError('')
    try {
      const created = await startStocktake({ name: name.trim(), notes: notes.trim() })
      navigate(`/stock-counts/${created._id}`)
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not start the stock count.'))
      setStarting(false)
    }
  }

  return (
    <>
      <LedgerPageHeader
        title="Stock Count"
        subtitle="Count what is physically on hand, then update inventory after a quick review."
        actions={<Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setOpen(true)}>Start Stock Count</Button>}
      />
      {error ? <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={retryLoad}>Retry</Button>}>{error}</Alert> : null}
      <TextField
        value={search}
        onChange={(event) => { setSearch(event.target.value); setPage(1) }}
        placeholder="Search stock counts"
        slotProps={{
          input: { startAdornment: <SearchRoundedIcon color="disabled" sx={{ mr: 1, fontSize: 19 }} /> },
          htmlInput: { 'aria-label': 'Search stock counts' },
        }}
        sx={{ width: { xs: '100%', sm: 320 }, mb: 1.5 }}
      />
      <LedgerTableContainer>
        <Table aria-label="Stock count history">
          <TableHead><TableRow><TableCell>Stock Count</TableCell><TableCell>Status</TableCell><TableCell>Date</TableCell><TableCell>Progress</TableCell><TableCell align="right">Difference</TableCell></TableRow></TableHead>
          <TableBody>
            {loading ? Array.from({ length: 4 }).map((_, index) => <TableRow key={index}>{Array.from({ length: 5 }).map((__, cell) => <TableCell key={cell}><Skeleton /></TableCell>)}</TableRow>) : null}
            {!loading && !error && items.length === 0 ? <TableRow><TableCell colSpan={5}><Box sx={{ py: 6, textAlign: 'center' }}><Typography variant="h6">No stock counts yet</Typography><Typography color="text.secondary" sx={{ mt: 0.5 }}>Start one when you are ready to check what is on hand.</Typography></Box></TableCell></TableRow> : null}
            {!loading ? items.map((item) => (
              <TableRow key={item.id} hover onClick={() => navigate(`/stock-counts/${item.id}`)} sx={{ cursor: 'pointer' }}>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{item.name}</Typography></TableCell>
                <TableCell><StatusLabel label={statusLabel[item.status]} tone={statusTone[item.status]} /></TableCell>
                <TableCell>{formatDateTime(item.startedAt)}</TableCell>
                <TableCell sx={numericSx}>{item.countedLineCount} / {item.lineCount}</TableCell>
                <TableCell align="right" sx={numericSx}>{item.status === 'POSTED' ? formatCurrency(item.netVarianceValue) : '—'}</TableCell>
              </TableRow>
            )) : null}
          </TableBody>
        </Table>
      </LedgerTableContainer>
      {totalPages > 1 ? <Stack alignItems="center" sx={{ mt: 2 }}><Pagination page={page} count={totalPages} onChange={(_, next) => setPage(next)} /></Stack> : null}

      <Dialog open={open} onClose={starting ? undefined : closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>Start Stock Count</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField autoFocus label="Stock count name" value={name} onChange={(event) => setName(event.target.value)} required />
            <TextField label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={3} />
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={closeDialog} disabled={starting}>Cancel</Button><Button variant="contained" disabled={starting || !name.trim()} onClick={handleStart}>{starting ? 'Starting…' : 'Start Stock Count'}</Button></DialogActions>
      </Dialog>
    </>
  )
}
