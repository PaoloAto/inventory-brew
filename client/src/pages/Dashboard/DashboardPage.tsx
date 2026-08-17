import { useCallback, useEffect, useRef, useState } from 'react'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import {
  Alert,
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
import { Link } from 'react-router-dom'
import {
  getDashboardOverview,
  type DashboardOverviewResponse,
} from '../../api/dashboard'
import { getErrorMessage } from '../../api/error'
import { wasteReasonLabels, type WasteReasonCode } from '../../api/waste'
import { AttentionRail } from '../../components/ui/AttentionRail'
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercentage,
  formatQuantity,
  formatSignedDelta,
  formatTime,
} from '../../components/ui/formatters'
import { LedgerEmptyState } from '../../components/ui/LedgerEmptyState'
import { LedgerPageHeader } from '../../components/ui/LedgerPageHeader'
import { LedgerSection } from '../../components/ui/LedgerSection'
import { MetricStrip } from '../../components/ui/MetricStrip'
import { StatusLabel } from '../../components/ui/StatusLabel'
import { StockRunway } from '../../components/ui/StockRunway'
import { useAppSnackbar } from '../../context/snackbarContext'
import { numericSx } from '../../theme'

const getLocalDateOnly = () => {
  const date = new Date()
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

const sectionAction = (label: string, to: string) => (
  <Button component={Link} to={to} size="small">
    {label}
  </Button>
)

const OverviewSkeleton = () => (
  <Box aria-label="Loading manager overview">
    <Skeleton variant="text" width={220} height={42} />
    <Skeleton variant="text" width={390} height={24} />
    <Skeleton variant="rectangular" height={48} sx={{ mt: 3 }} />
    <Skeleton variant="rectangular" height={118} sx={{ mt: 2 }} />
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 3, mt: 3 }}>
      <Skeleton variant="rectangular" height={330} />
      <Skeleton variant="rectangular" height={330} />
      <Skeleton variant="rectangular" height={330} />
      <Skeleton variant="rectangular" height={330} />
    </Box>
  </Box>
)

export const DashboardPage = () => {
  const { showSnackbar } = useAppSnackbar()
  const [data, setData] = useState<DashboardOverviewResponse | null>(null)
  const dataRef = useRef<DashboardOverviewResponse | null>(null)
  const latestRequestId = useRef(0)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [initialError, setInitialError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const loadOverview = useCallback(async () => {
    const requestId = latestRequestId.current + 1
    latestRequestId.current = requestId
    const hasExistingData = dataRef.current !== null
    if (hasExistingData) setIsRefreshing(true)
    else setIsInitialLoading(true)
    setRefreshError(null)
    try {
      const response = await getDashboardOverview(getLocalDateOnly())
      if (requestId !== latestRequestId.current) return
      dataRef.current = response
      setData(response)
      setInitialError(null)
    } catch (error) {
      if (requestId !== latestRequestId.current) return
      const message = getErrorMessage(error, 'Failed to load manager overview')
      if (hasExistingData) {
        setRefreshError(message)
        showSnackbar(message, { severity: 'warning' })
      } else {
        setInitialError(message)
      }
    } finally {
      if (requestId === latestRequestId.current) {
        setIsInitialLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [showSnackbar])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  if (isInitialLoading && !data) return <OverviewSkeleton />

  if (!data) {
    return (
      <Box>
        <LedgerPageHeader title="Overview" subtitle="What needs your attention today." />
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void loadOverview()}>
              Retry
            </Button>
          }
        >
          {initialError ?? 'The manager overview is unavailable.'}
        </Alert>
      </Box>
    )
  }

  const { attention, sales, prep, inventory, purchasing, waste, recentTransactions } = data

  return (
    <Box>
      <LedgerPageHeader
        title="Overview"
        subtitle="What needs your attention today."
        meta={`Updated ${formatDateTime(data.meta.generatedAt)}`}
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshRoundedIcon />}
            onClick={() => void loadOverview()}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing' : 'Refresh'}
          </Button>
        }
      />

      {refreshError ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Refresh failed. Showing the last update. {refreshError}
        </Alert>
      ) : null}

      <AttentionRail
        facts={[
          { value: attention.prepShortageIngredientCount, label: 'Prep shortages', tone: attention.prepShortageIngredientCount > 0 ? 'warning' : 'neutral' },
          { value: attention.outOfStockCount, label: 'Out of stock', tone: attention.outOfStockCount > 0 ? 'danger' : 'neutral' },
          { value: attention.reorderTriggeredCount, label: 'Reorder now', tone: attention.reorderTriggeredCount > 0 ? 'warning' : 'neutral' },
          { value: attention.overduePurchaseOrderCount, label: 'Overdue POs', tone: attention.overduePurchaseOrderCount > 0 ? 'danger' : 'neutral' },
          { value: attention.openPurchaseOrderCount, label: 'Open POs' },
        ]}
      />

      <Stack spacing={3} sx={{ mt: 3 }}>
        <LedgerSection
          title="Sales · Last 7 days"
          subtitle={`${data.meta.salesDateFrom} through ${data.meta.salesDateTo}`}
          actions={sectionAction('View Sales', '/sales')}
          padded={false}
        >
          <MetricStrip
            items={[
              { label: 'Estimated revenue', value: formatCurrency(sales.summary.totalRevenue) },
              { label: 'Estimated food cost', value: formatCurrency(sales.summary.totalEstimatedFoodCost) },
              { label: 'Estimated gross profit', value: formatCurrency(sales.summary.totalEstimatedGrossProfit) },
              { label: 'Gross margin', value: sales.summary.grossMarginPercent === null ? '—' : formatPercentage(sales.summary.grossMarginPercent, 1) },
            ]}
          />
          <Box sx={{ px: { xs: 2, sm: 2.5 }, pt: 2, pb: 1 }}>
            <Typography variant="overline" color="text.secondary">Menu performance</Typography>
          </Box>
          {sales.topMenuItems.length === 0 ? (
            <LedgerEmptyState title="No Sales recorded" description="Active Sales in this seven-day window will appear here." />
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label="Menu performance">
                <TableHead><TableRow><TableCell>Menu item</TableCell><TableCell align="right">Servings</TableCell><TableCell align="right">Revenue</TableCell><TableCell align="right">Gross profit</TableCell><TableCell align="right">Margin</TableCell></TableRow></TableHead>
                <TableBody>
                  {sales.topMenuItems.map((item) => (
                    <TableRow key={item.recipeId} hover>
                      <TableCell sx={{ fontWeight: 500 }}>{item.recipeName}</TableCell>
                      <TableCell align="right" sx={numericSx}>{formatNumber(item.servingsSold)}</TableCell>
                      <TableCell align="right" sx={numericSx}>{formatCurrency(item.estimatedRevenue)}</TableCell>
                      <TableCell align="right" sx={numericSx}>{formatCurrency(item.estimatedGrossProfit)}</TableCell>
                      <TableCell align="right" sx={numericSx}>{item.grossMarginPercent === null ? '—' : formatPercentage(item.grossMarginPercent, 1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </LedgerSection>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', xl: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
          <LedgerSection
            title="Prep readiness"
            subtitle={prep.dataSufficient ? `${prep.recordedDayCount} recorded demand days` : `Early data · ${prep.recordedDayCount} recorded days`}
            actions={sectionAction('Open Prep Plan', '/prep-plan')}
            padded={false}
          >
            <Stack direction="row" spacing={3} sx={{ px: { xs: 2, sm: 2.5 }, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box><Typography variant="caption" color="text.secondary">Suggested servings</Typography><Typography sx={{ ...numericSx, fontSize: '1.35rem', fontWeight: 500 }}>{formatNumber(prep.totalSuggestedServings, 0)}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Shortages</Typography><Typography sx={{ ...numericSx, fontSize: '1.35rem', fontWeight: 500 }}>{prep.shortageIngredientCount}</Typography></Box>
              <Box sx={{ ml: 'auto !important' }}><StatusLabel label={prep.canPrepare ? 'Ready' : 'Need more'} tone={prep.canPrepare ? 'success' : 'warning'} /></Box>
            </Stack>
            {prep.shortages.length === 0 ? (
              <LedgerEmptyState title={prep.recommendationCount === 0 ? 'No prep demand yet' : 'Ingredients are ready'} description={prep.recommendationCount === 0 ? 'Prep recommendations will appear as Sales history builds.' : 'Current inventory can cover the suggested prep.'} />
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" aria-label="Prep shortages">
                  <TableHead><TableRow><TableCell>Ingredient</TableCell><TableCell align="right">Need</TableCell><TableCell align="right">Available</TableCell><TableCell align="right">Short</TableCell></TableRow></TableHead>
                  <TableBody>{prep.shortages.map((item) => <TableRow key={item.ingredientId} hover><TableCell sx={{ fontWeight: 500 }}>{item.ingredientName}</TableCell><TableCell align="right" sx={numericSx}>{formatQuantity(item.requiredQuantity, item.unit)}</TableCell><TableCell align="right" sx={numericSx}>{formatQuantity(item.availableQuantity, item.unit)}</TableCell><TableCell align="right" sx={{ ...numericSx, color: 'warning.main' }}>{formatQuantity(item.shortfall, item.unit)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </Box>
            )}
          </LedgerSection>

          <LedgerSection
            title="Inventory attention"
            subtitle={`${formatCurrency(inventory.totalStockValue)} across ${inventory.ingredientCount} active ingredients`}
            actions={sectionAction('View Planning', '/planning')}
            padded={false}
          >
            {inventory.items.length === 0 ? (
              <LedgerEmptyState title="No reorder actions" description="No active ingredient is currently at its reorder point." />
            ) : (
              <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
                {inventory.items.map((item) => {
                  const canCreatePurchaseOrder = typeof item.suggestedReorderQuantity === 'number' && Number.isFinite(item.suggestedReorderQuantity) && item.suggestedReorderQuantity > 0
                  return (
                    <Box key={item.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(150px, 0.85fr) minmax(180px, 1fr) auto' }, gap: 2, alignItems: 'center', px: { xs: 2, sm: 2.5 }, py: 2 }}>
                      <Box><Typography variant="body2" sx={{ fontWeight: 500 }}>{item.name}</Typography><Typography variant="caption" sx={numericSx}>{formatQuantity(item.stockQuantity, item.unit)}</Typography></Box>
                      <Box><StockRunway current={item.stockQuantity} stockStatus={item.stockStatus} unit={item.unit} compact /><Typography variant="caption" color="text.secondary">{item.daysRemaining === null ? 'No depletion data' : `${formatNumber(item.daysRemaining, 1)} days remaining`}</Typography></Box>
                      {canCreatePurchaseOrder ? (
                        <Stack alignItems={{ xs: 'flex-start', sm: 'flex-end' }} spacing={0.25}>
                          <Typography variant="caption" color="text.secondary" sx={numericSx}>Reorder {formatQuantity(item.suggestedReorderQuantity as number, item.unit)}</Typography>
                          <Button component={Link} to="/purchasing" state={{ prefill: { ingredientId: item.id, quantity: item.suggestedReorderQuantity, supplierId: item.preferredSupplier?.id } }} size="small">Create PO</Button>
                        </Stack>
                      ) : null}
                    </Box>
                  )
                })}
              </Stack>
            )}
          </LedgerSection>

          <LedgerSection
            title="Open purchasing"
            subtitle={`${purchasing.draftCount} draft · ${purchasing.onOrderCount} on order · ${purchasing.overdueCount} overdue`}
            actions={sectionAction('View Purchasing', '/purchasing')}
            padded={false}
          >
            {purchasing.items.length === 0 ? (
              <LedgerEmptyState title="No open purchase orders" description="Draft and ordered purchase orders will appear here." />
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" aria-label="Open purchase orders">
                  <TableHead><TableRow><TableCell>PO number</TableCell><TableCell>Supplier</TableCell><TableCell>Status</TableCell><TableCell>Expected</TableCell><TableCell align="right">Open lines</TableCell></TableRow></TableHead>
                  <TableBody>{purchasing.items.map((item) => <TableRow key={item.id} hover><TableCell sx={{ ...numericSx, fontWeight: 500 }}>{item.orderNumber}</TableCell><TableCell>{item.supplierNameSnapshot}</TableCell><TableCell><StatusLabel label={item.overdue ? 'OVERDUE' : item.status.replace('_', ' ')} tone={item.overdue ? 'danger' : item.status === 'DRAFT' ? 'neutral' : 'warning'} /></TableCell><TableCell sx={numericSx}>{item.expectedAt ? formatDate(item.expectedAt) : 'No expected date'}</TableCell><TableCell align="right" sx={numericSx}>{item.remainingLineCount}</TableCell></TableRow>)}</TableBody>
                </Table>
              </Box>
            )}
          </LedgerSection>

          <LedgerSection
            title="Waste · Last 7 days"
            subtitle={`${data.meta.wasteDateFrom} through ${data.meta.wasteDateTo}`}
            actions={sectionAction('View Waste', '/waste')}
            padded={false}
          >
            <Stack direction="row" spacing={4} sx={{ px: { xs: 2, sm: 2.5 }, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box><Typography variant="caption" color="text.secondary">Waste value</Typography><Typography sx={{ ...numericSx, fontSize: '1.35rem', fontWeight: 500 }}>{formatCurrency(waste.totalWasteValue)}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Event count</Typography><Typography sx={{ ...numericSx, fontSize: '1.35rem', fontWeight: 500 }}>{waste.eventCount}</Typography></Box>
            </Stack>
            {waste.byReason.length === 0 ? (
              <LedgerEmptyState title="No Waste recorded" description="Waste events in this seven-day window will appear here." />
            ) : (
              <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
                {waste.byReason.map((item) => <Stack key={item.reasonCode} direction="row" justifyContent="space-between" alignItems="center" sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5 }}><Box><Typography variant="body2" sx={{ fontWeight: 500 }}>{wasteReasonLabels[item.reasonCode as WasteReasonCode] ?? item.reasonCode}</Typography><Typography variant="caption" color="text.secondary">{item.eventCount} events</Typography></Box><Typography sx={{ ...numericSx, fontWeight: 500 }}>{formatCurrency(item.totalWasteValue)}</Typography></Stack>)}
              </Stack>
            )}
          </LedgerSection>
        </Box>

        <LedgerSection title="Recent inventory movements" subtitle="Latest changes recorded in the inventory ledger." actions={sectionAction('View Transactions', '/transactions')} padded={false}>
          {recentTransactions.length === 0 ? (
            <LedgerEmptyState title="No movements recorded" description="Receipts, usage, Waste, and adjustments will appear here." />
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label="Recent inventory movements">
                <TableHead><TableRow><TableCell>Ingredient</TableCell><TableCell>Movement</TableCell><TableCell align="right">Before → after</TableCell><TableCell>Reason / reference</TableCell><TableCell align="right">Time</TableCell></TableRow></TableHead>
                <TableBody>
                  {recentTransactions.map((transaction) => {
                    const unit = transaction.ingredient?.unit
                    const reference = transaction.reference?.name
                    const delta = transaction.deltaQuantity ?? transaction.newStock - transaction.previousStock
                    return (
                      <TableRow key={transaction._id} hover>
                        <TableCell sx={{ minWidth: 145, fontWeight: 500 }}>{transaction.ingredient?.name ?? transaction.ingredientId}</TableCell>
                        <TableCell><Stack direction="row" spacing={1} alignItems="center"><StatusLabel label={transaction.type} tone={transaction.type === 'IN' ? 'success' : transaction.type === 'OUT' ? 'warning' : 'neutral'} /><Typography component="span" sx={{ ...numericSx, whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>{formatSignedDelta(delta, unit)}</Typography></Stack></TableCell>
                        <TableCell align="right" sx={{ ...numericSx, whiteSpace: 'nowrap' }}>{formatQuantity(transaction.previousStock, unit)} → {formatQuantity(transaction.newStock, unit)}</TableCell>
                        <TableCell sx={{ minWidth: 160 }}><Typography variant="body2">{transaction.reason || 'No reason recorded'}</Typography>{reference ? <Typography variant="caption" color="text.secondary">{reference}</Typography> : null}</TableCell>
                        <TableCell align="right" title={formatDateTime(transaction.createdAt)} sx={{ ...numericSx, color: 'text.secondary', whiteSpace: 'nowrap' }}>{formatTime(transaction.createdAt)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </LedgerSection>
      </Stack>
    </Box>
  )
}
