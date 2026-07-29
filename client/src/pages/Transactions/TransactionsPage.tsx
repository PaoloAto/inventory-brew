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
import {
  listTransactions,
  type InventoryTransaction,
  type InventoryTransactionType,
} from '../../api/transactions'
import { getErrorMessage } from '../../api/error'
import { DataToolbar } from '../../components/ui/DataToolbar'
import {
  formatCurrency,
  formatDateTime,
  formatQuantity,
  formatSignedQuantity,
} from '../../components/ui/formatters'
import { LedgerEmptyState } from '../../components/ui/LedgerEmptyState'
import { LedgerPageHeader } from '../../components/ui/LedgerPageHeader'
import { LedgerTableContainer } from '../../components/ui/LedgerTableContainer'
import { StatusLabel } from '../../components/ui/StatusLabel'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAppSnackbar } from '../../context/snackbarContext'
import { numericSx } from '../../theme'

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

const toLocalDayBoundaryIso = (dateValue: string, boundary: 'start' | 'end') => {
  if (!dateValue) return undefined
  const [year, month, day] = dateValue.split('-').map(Number)
  const date =
    boundary === 'start'
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999)
  return date.toISOString()
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

  const hasActiveFilters = useMemo(
    () =>
      filters.type !== 'all' ||
      Boolean(filters.reason) ||
      Boolean(filters.dateFrom) ||
      Boolean(filters.dateTo),
    [filters],
  )

  const loadTransactions = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await listTransactions({
        page: page + 1,
        limit: rowsPerPage,
        type: filters.type === 'all' ? undefined : filters.type,
        reason: filters.reason || undefined,
        dateFrom: toLocalDayBoundaryIso(filters.dateFrom, 'start'),
        dateTo: toLocalDayBoundaryIso(filters.dateTo, 'end'),
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

  const resetFilters = () => {
    setDraftFilters(defaultFilters)
    setFilters(defaultFilters)
    setPage(0)
  }

  return (
    <Box>
      <LedgerPageHeader
        title="Transactions"
        subtitle="Every receipt, usage event, and stock correction in chronological order."
        meta={
          <Typography component="span" sx={{ ...numericSx, fontSize: 'inherit' }}>
            {totalRows} movement{totalRows === 1 ? '' : 's'}
          </Typography>
        }
      />

      <DataToolbar
        primary={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 145 } }}>
              <InputLabel id="transaction-type-label">Movement type</InputLabel>
              <Select
                labelId="transaction-type-label"
                label="Movement type"
                value={draftFilters.type}
                onChange={(event) =>
                  setDraftFilters((previous) => ({
                    ...previous,
                    type: event.target.value as TypeFilter,
                  }))
                }
              >
                <MenuItem value="all">All movements</MenuItem>
                <MenuItem value="IN">Received</MenuItem>
                <MenuItem value="OUT">Used</MenuItem>
                <MenuItem value="ADJUST">Adjusted</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Reason"
              value={draftFilters.reason}
              onChange={(event) =>
                setDraftFilters((previous) => ({ ...previous, reason: event.target.value }))
              }
              sx={{ minWidth: { xs: '100%', sm: 190 } }}
            />
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
            <Button variant="outlined" onClick={resetFilters} disabled={!hasActiveFilters}>
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
            title="No transactions found"
            description="Change the filters or date range to inspect a different part of the ledger."
            minHeight={220}
          />
        ) : (
          <Table size="small" stickyHeader aria-label="Inventory movement ledger">
            <TableHead>
              <TableRow>
                <TableCell>Date and time</TableCell>
                <TableCell>Ingredient</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Movement</TableCell>
                <TableCell align="right">Before → after</TableCell>
                <TableCell align="right">Unit cost</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Reference</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((transaction) => {
                const unit = transaction.ingredient?.unit
                return (
                  <TableRow key={transaction.id} hover>
                    <TableCell sx={{ ...numericSx, minWidth: 155, color: 'text.secondary' }}>
                      {formatDateTime(transaction.createdAt)}
                    </TableCell>
                    <TableCell sx={{ minWidth: 145, fontWeight: 500 }}>
                      {transaction.ingredient?.name ?? transaction.ingredientId}
                    </TableCell>
                    <TableCell>
                      <StatusLabel
                        label={transaction.type}
                        tone={
                          transaction.type === 'IN'
                            ? 'success'
                            : transaction.type === 'OUT'
                              ? 'warning'
                              : 'neutral'
                        }
                      />
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        ...numericSx,
                        minWidth: 115,
                        color:
                          transaction.type === 'IN'
                            ? 'success.main'
                            : transaction.type === 'OUT'
                              ? 'warning.main'
                              : 'text.primary',
                        fontWeight: 500,
                      }}
                    >
                      {formatSignedQuantity(transaction.quantity, transaction.type, unit)}
                    </TableCell>
                    <TableCell align="right" sx={{ ...numericSx, minWidth: 155, whiteSpace: 'nowrap' }}>
                      {formatQuantity(transaction.previousStock, unit)} →{' '}
                      {formatQuantity(transaction.newStock, unit)}
                    </TableCell>
                    <TableCell align="right" sx={numericSx}>
                      {transaction.unitCost === undefined ? '—' : formatCurrency(transaction.unitCost)}
                    </TableCell>
                    <TableCell sx={{ minWidth: 165 }}>
                      {transaction.reason || 'No reason recorded'}
                    </TableCell>
                    <TableCell sx={{ minWidth: 140 }}>
                      {transaction.reference
                        ? transaction.reference.name || transaction.reference.type
                        : transaction.referenceType || '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </LedgerTableContainer>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderTop: 0,
        }}
      >
        <TablePagination
          component="div"
          sx={{ maxWidth: '100%', overflowX: 'auto' }}
          count={totalRows}
          page={page}
          onPageChange={(_event, newPage) => setPage(newPage)}
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
