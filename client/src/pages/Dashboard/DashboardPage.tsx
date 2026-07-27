import { useCallback, useEffect, useState } from 'react'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import {
  Box,
  Button,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { getDashboardSummary, type DashboardSummaryResponse } from '../../api/dashboard'
import { getErrorMessage } from '../../api/error'
import { AttentionRail } from '../../components/ui/AttentionRail'
import { formatCurrency, formatDateTime, formatQuantity, formatSignedQuantity, formatTime } from '../../components/ui/formatters'
import { LedgerEmptyState } from '../../components/ui/LedgerEmptyState'
import { LedgerPageHeader } from '../../components/ui/LedgerPageHeader'
import { LedgerSection } from '../../components/ui/LedgerSection'
import { MetricStrip } from '../../components/ui/MetricStrip'
import { StatusLabel } from '../../components/ui/StatusLabel'
import { StockRunway } from '../../components/ui/StockRunway'
import { useAppSnackbar } from '../../context/snackbarContext'
import { numericSx } from '../../theme'

export const DashboardPage = () => {
  const { showSnackbar } = useAppSnackbar()
  const [data, setData] = useState<DashboardSummaryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadSummary = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await getDashboardSummary({
        lowStockLimit: 6,
        recentTransactionsLimit: 8,
        includeRelated: true,
      })
      setData(response)
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load inventory overview'), { severity: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [showSnackbar])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  if (isLoading && !data) {
    return (
      <Box aria-label="Loading inventory overview">
        <Skeleton variant="text" width={260} height={42} />
        <Skeleton variant="text" width={440} height={24} />
        <Skeleton variant="rectangular" height={48} sx={{ mt: 3 }} />
        <Skeleton variant="rectangular" height={105} sx={{ mt: 2 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3, mt: 3 }}>
          <Skeleton variant="rectangular" height={330} />
          <Skeleton variant="rectangular" height={330} />
        </Box>
      </Box>
    )
  }

  const summary = data?.summary ?? {
    ingredientCount: 0,
    recipeCount: 0,
    lowStockCount: 0,
    totalStockValue: 0,
  }
  const lowStockItems = data?.lowStockItems ?? []
  const recentTransactions = data?.recentTransactions ?? []
  const generatedAt = data?.meta.generatedAt

  return (
    <Box>
      <LedgerPageHeader
        title="Inventory overview"
        subtitle="What needs attention before the next service."
        meta={generatedAt ? `Updated ${formatDateTime(generatedAt)}` : 'Update time unavailable'}
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshRoundedIcon />}
            onClick={() => void loadSummary()}
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing' : 'Refresh'}
          </Button>
        }
      />

      <Stack spacing={2}>
        <AttentionRail
          facts={[
            {
              value: summary.lowStockCount,
              label: `low-stock item${summary.lowStockCount === 1 ? '' : 's'}`,
              tone: summary.lowStockCount > 0 ? 'warning' : 'neutral',
            },
            {
              value: summary.recipeCount,
              label: `active recipe${summary.recipeCount === 1 ? '' : 's'}`,
            },
          ]}
        />

        <MetricStrip
          items={[
            { label: 'Inventory value', value: formatCurrency(summary.totalStockValue) },
            { label: 'Ingredients', value: String(summary.ingredientCount) },
            {
              label: 'Low stock',
              value: String(summary.lowStockCount),
              detail: summary.lowStockCount > 0 ? 'Replenishment required' : 'No current alerts',
            },
            { label: 'Active recipes', value: String(summary.recipeCount) },
          ]}
        />
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', xl: 'minmax(0, 0.9fr) minmax(0, 1.1fr)' },
          gap: 3,
          mt: 3,
          alignItems: 'start',
        }}
      >
        <LedgerSection
          title="Low-stock queue"
          subtitle="Stock on hand relative to each reorder target."
          padded={false}
        >
          {lowStockItems.length === 0 ? (
            <LedgerEmptyState
              title="Stock levels are on target"
              description="No ingredients currently need replenishment."
            />
          ) : (
            <Box>
              {lowStockItems.map((item, index) => (
                <Box
                  key={item.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'minmax(150px, 0.8fr) minmax(190px, 1.2fr)' },
                    gap: { xs: 1.25, sm: 2.5 },
                    alignItems: 'center',
                    px: { xs: 2, sm: 2.5 },
                    py: 2,
                    borderTop: index === 0 ? 0 : '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {item.name}
                    </Typography>
                    <Typography sx={{ ...numericSx, mt: 0.25, fontSize: '0.8125rem' }}>
                      {formatQuantity(item.stockQuantity, item.unit)}
                    </Typography>
                  </Box>
                  <StockRunway
                    current={item.stockQuantity}
                    reorderLevel={item.reorderLevel}
                    unit={item.unit}
                  />
                </Box>
              ))}
            </Box>
          )}
        </LedgerSection>

        <LedgerSection
          title="Recent movements"
          subtitle="Latest stock changes recorded in the inventory ledger."
          padded={false}
        >
          {recentTransactions.length === 0 ? (
            <LedgerEmptyState
              title="No movements recorded"
              description="Stock receipts, usage, and adjustments will appear here."
            />
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label="Recent inventory movements">
                <TableHead>
                  <TableRow>
                    <TableCell>Ingredient</TableCell>
                    <TableCell>Movement</TableCell>
                    <TableCell align="right">Before → after</TableCell>
                    <TableCell>Reason / reference</TableCell>
                    <TableCell align="right">Time</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentTransactions.map((transaction) => {
                    const unit = transaction.ingredient?.unit
                    const reference = transaction.reference?.name
                    return (
                      <TableRow key={transaction._id} hover>
                        <TableCell sx={{ minWidth: 145, fontWeight: 500 }}>
                          {transaction.ingredient?.name ?? transaction.ingredientId}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
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
                            <Typography
                              component="span"
                              sx={{
                                ...numericSx,
                                color:
                                  transaction.type === 'IN'
                                    ? 'success.main'
                                    : transaction.type === 'OUT'
                                      ? 'warning.main'
                                      : 'text.primary',
                                whiteSpace: 'nowrap',
                                fontSize: '0.8125rem',
                              }}
                            >
                              {formatSignedQuantity(transaction.quantity, transaction.type, unit)}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ ...numericSx, whiteSpace: 'nowrap' }}>
                          {formatQuantity(transaction.previousStock, unit)} →{' '}
                          {formatQuantity(transaction.newStock, unit)}
                        </TableCell>
                        <TableCell sx={{ minWidth: 160 }}>
                          <Typography variant="body2">
                            {transaction.reason || 'No reason recorded'}
                          </Typography>
                          {reference ? (
                            <Typography variant="caption" color="text.secondary">
                              {reference}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell
                          align="right"
                          title={formatDateTime(transaction.createdAt)}
                          sx={{ ...numericSx, color: 'text.secondary', whiteSpace: 'nowrap' }}
                        >
                          {formatTime(transaction.createdAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </LedgerSection>
      </Box>
    </Box>
  )
}
