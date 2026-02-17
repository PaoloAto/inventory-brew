import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
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
import {
  listTransactions,
  type InventoryTransaction,
  type InventoryTransactionType,
} from '../../api/transactions'
import { getErrorMessage } from '../../api/error'
import { GradientCard } from '../../components/ui/GradientCard'
import { useAppSnackbar } from '../../context/snackbarContext'

type TypeFilter = 'all' | InventoryTransactionType

interface TransactionFilters {
  type: TypeFilter
  reason: string
  dateFrom: string
  dateTo: string
}

const defaultFilters: TransactionFilters = {
  type: 'all',
  reason: '',
  dateFrom: '',
  dateTo: '',
}

const formatDateTime = (input: string) => {
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return input
  return date.toLocaleString()
}

const getTypeColor = (type: InventoryTransactionType) => {
  if (type === 'IN') return 'success'
  if (type === 'OUT') return 'warning'
  return 'default'
}

export const TransactionsPage = () => {
  const { showSnackbar } = useAppSnackbar()

  const [rows, setRows] = useState<InventoryTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [draftFilters, setDraftFilters] = useState<TransactionFilters>(defaultFilters)
  const [filters, setFilters] = useState<TransactionFilters>(defaultFilters)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [totalRows, setTotalRows] = useState(0)

  const hasActiveFilters = useMemo(() => {
    return (
      filters.type !== 'all' ||
      Boolean(filters.reason) ||
      Boolean(filters.dateFrom) ||
      Boolean(filters.dateTo)
    )
  }, [filters])

  const loadTransactions = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await listTransactions({
        page: page + 1,
        limit: rowsPerPage,
        type: filters.type === 'all' ? undefined : filters.type,
        reason: filters.reason || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        includeRelated: true,
        sortBy: 'createdAt',
        sortOrder,
      })

      setRows(response.items)
      setTotalRows(response.pagination.total)
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load transactions'), { severity: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [filters, page, rowsPerPage, showSnackbar, sortOrder])

  useEffect(() => {
    void loadTransactions()
  }, [loadTransactions])

  const handleApplyFilters = () => {
    setFilters(draftFilters)
    setPage(0)
  }

  const handleResetFilters = () => {
    setDraftFilters(defaultFilters)
    setFilters(defaultFilters)
    setPage(0)
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Transactions
      </Typography>

      <GradientCard
        title="Inventory Movements"
        subtitle="Track every stock change with filterable audit history."
        accent="info"
        rightContent={
          <Chip
            label={`${totalRows} total record${totalRows === 1 ? '' : 's'}`}
            size="small"
            variant="outlined"
            sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.7)' }}
          />
        }
      >
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.2}
            alignItems={{ xs: 'stretch', md: 'center' }}
          >
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="transaction-type-label">Type</InputLabel>
              <Select
                labelId="transaction-type-label"
                label="Type"
                value={draftFilters.type}
                onChange={(event) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    type: event.target.value as TypeFilter,
                  }))
                }
              >
                <MenuItem value="all">All Types</MenuItem>
                <MenuItem value="IN">IN</MenuItem>
                <MenuItem value="OUT">OUT</MenuItem>
                <MenuItem value="ADJUST">ADJUST</MenuItem>
              </Select>
            </FormControl>

            <TextField
              size="small"
              label="Reason contains"
              value={draftFilters.reason}
              onChange={(event) =>
                setDraftFilters((prev) => ({
                  ...prev,
                  reason: event.target.value,
                }))
              }
              sx={{ minWidth: { xs: '100%', md: 220 } }}
            />

            <TextField
              size="small"
              label="Date from"
              type="date"
              value={draftFilters.dateFrom}
              onChange={(event) =>
                setDraftFilters((prev) => ({
                  ...prev,
                  dateFrom: event.target.value,
                }))
              }
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              size="small"
              label="Date to"
              type="date"
              value={draftFilters.dateTo}
              onChange={(event) =>
                setDraftFilters((prev) => ({
                  ...prev,
                  dateTo: event.target.value,
                }))
              }
              InputLabelProps={{ shrink: true }}
            />

            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleApplyFilters}>
                Apply
              </Button>
              <Button variant="outlined" onClick={handleResetFilters} disabled={!hasActiveFilters}>
                Reset
              </Button>
            </Stack>
          </Stack>

          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Chip
              label={sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
              onClick={() => {
                setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                setPage(0)
              }}
              color="primary"
              variant="outlined"
            />
          </Stack>

          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              overflow: 'auto',
              maxHeight: 500,
              backgroundColor: 'rgba(255,255,255,0.72)',
            }}
          >
            {isLoading ? (
              <Stack alignItems="center" justifyContent="center" sx={{ py: 6 }}>
                <CircularProgress size={28} />
              </Stack>
            ) : rows.length === 0 ? (
              <Stack alignItems="center" justifyContent="center" sx={{ py: 6 }}>
                <Typography variant="body2" color="text.secondary">
                  No transactions found for the selected filters.
                </Typography>
              </Stack>
            ) : (
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Ingredient</TableCell>
                    <TableCell align="center">Type</TableCell>
                    <TableCell align="right">Quantity</TableCell>
                    <TableCell align="right">Previous</TableCell>
                    <TableCell align="right">New</TableCell>
                    <TableCell>Reason</TableCell>
                    <TableCell>Reference</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((transaction) => (
                    <TableRow key={transaction.id} hover>
                      <TableCell>{formatDateTime(transaction.createdAt)}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {transaction.ingredient?.name ?? transaction.ingredientId}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          color={getTypeColor(transaction.type)}
                          label={transaction.type}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        {transaction.quantity} {transaction.ingredient?.unit ?? ''}
                      </TableCell>
                      <TableCell align="right">{transaction.previousStock}</TableCell>
                      <TableCell align="right">{transaction.newStock}</TableCell>
                      <TableCell>{transaction.reason || 'No reason'}</TableCell>
                      <TableCell>
                        {transaction.reference
                          ? `${transaction.reference.type}${transaction.reference.name ? `: ${transaction.reference.name}` : ''}`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end">
            <TablePagination
              component="div"
              count={totalRows}
              page={page}
              onPageChange={(_event, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(event) => {
                setRowsPerPage(parseInt(event.target.value, 10))
                setPage(0)
              }}
              rowsPerPageOptions={[5, 10, 20, 50]}
            />
          </Stack>
        </Stack>
      </GradientCard>
    </Box>
  )
}
