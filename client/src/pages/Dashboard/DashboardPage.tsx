import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import AutoGraphRoundedIcon from '@mui/icons-material/AutoGraphRounded'
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded'
import LocalDiningRoundedIcon from '@mui/icons-material/LocalDiningRounded'
import MonetizationOnRoundedIcon from '@mui/icons-material/MonetizationOnRounded'
import PendingActionsRoundedIcon from '@mui/icons-material/PendingActionsRounded'
import SyncAltRoundedIcon from '@mui/icons-material/SyncAltRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
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
import { PageHeader } from '../../components/ui/PageHeader'
import { SectionCard } from '../../components/ui/SectionCard'
import { useAppSnackbar } from '../../context/snackbarContext'

interface SnapshotMetricCardProps {
  title: string
  value: string
  subtitle: string
  icon: React.ReactNode
  accent: string
}

const SnapshotMetricCard = ({ title, value, subtitle, icon, accent }: SnapshotMetricCardProps) => {
  return (
    <Box
      sx={{
        borderRadius: 3.2,
        p: 2.25,
        background: 'linear-gradient(165deg, rgba(255,255,255,0.98), rgba(245,249,255,0.9))',
        border: '1px solid rgba(26,115,232,0.12)',
        boxShadow: '0 12px 28px rgba(17, 24, 39, 0.08)',
        transition: 'transform 180ms ease, box-shadow 220ms ease, border-color 220ms ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 20px 45px rgba(17, 24, 39, 0.12)',
          borderColor: 'rgba(45,127,249,0.28)',
        },
      }}
    >
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="overline" sx={{ letterSpacing: 0.9, color: 'text.secondary' }}>
            {title}
          </Typography>
          <Typography variant="h5" sx={{ lineHeight: 1.2, mb: 0.6 }}>
            {value}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>
        <Avatar
          variant="rounded"
          sx={{
            width: 42,
            height: 42,
            borderRadius: 2.5,
            background: accent,
            color: 'white',
            boxShadow: '0 8px 20px rgba(17,24,39,0.22)',
          }}
        >
          {icon}
        </Avatar>
      </Stack>
    </Box>
  )
}

interface PrimaryMetricCardProps {
  totalStockValue: number
  ingredientCount: number
  lowStockCount: number
  healthScore: number
}

const PrimaryMetricCard = ({
  totalStockValue,
  ingredientCount,
  lowStockCount,
  healthScore,
}: PrimaryMetricCardProps) => {
  return (
    <Box
      sx={{
        borderRadius: 4.2,
        p: 3,
        color: 'common.white',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 220,
        background: 'linear-gradient(140deg, #1E67DB 0%, #2D7FF9 48%, #4AA4FF 100%)',
        boxShadow: '0 24px 52px rgba(24, 78, 170, 0.34)',
        transition: 'transform 220ms ease, box-shadow 220ms ease',
        '&:before, &:after': {
          content: '""',
          position: 'absolute',
          borderRadius: '50%',
          pointerEvents: 'none',
        },
        '&:before': {
          width: 220,
          height: 220,
          right: -90,
          top: -90,
          background: 'rgba(255,255,255,0.15)',
        },
        '&:after': {
          width: 160,
          height: 160,
          right: 34,
          bottom: -96,
          background: 'rgba(255,255,255,0.1)',
        },
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: '0 30px 60px rgba(24, 78, 170, 0.38)',
        },
      }}
    >
      <Stack spacing={2.6} sx={{ position: 'relative', zIndex: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="overline" sx={{ letterSpacing: 0.9, opacity: 0.9 }}>
              Inventory Valuation
            </Typography>
            <Typography variant="h4" sx={{ lineHeight: 1.12 }}>
              {totalStockValue.toFixed(2)}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.92 }}>
              Across {ingredientCount} tracked ingredient{ingredientCount === 1 ? '' : 's'}
            </Typography>
          </Box>
          <Avatar
            variant="rounded"
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2.6,
              bgcolor: 'rgba(255,255,255,0.2)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <MonetizationOnRoundedIcon />
          </Avatar>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            label={`${lowStockCount} low-stock alert${lowStockCount === 1 ? '' : 's'}`}
            icon={<WarningAmberRoundedIcon fontSize="small" />}
            sx={{
              color: 'white',
              bgcolor: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.28)',
            }}
          />
          <Chip
            size="small"
            label={`${healthScore}% healthy`}
            icon={<AutoGraphRoundedIcon fontSize="small" />}
            sx={{
              color: 'white',
              bgcolor: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.28)',
            }}
          />
        </Stack>

        <Box>
          <Typography variant="caption" sx={{ opacity: 0.88 }}>
            Stock Health Index
          </Typography>
          <LinearProgress
            variant="determinate"
            value={healthScore}
            sx={{
              mt: 0.8,
              height: 8,
              borderRadius: 999,
              bgcolor: 'rgba(255,255,255,0.25)',
              '& .MuiLinearProgress-bar': {
                borderRadius: 999,
                background: 'linear-gradient(90deg, #E8F3FF, #FFFFFF)',
              },
            }}
          />
        </Box>
      </Stack>
    </Box>
  )
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

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
      showSnackbar(getErrorMessage(error, 'Failed to load dashboard summary'), { severity: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [showSnackbar])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const healthScore = useMemo(() => {
    if (!data) return 0
    const { ingredientCount, lowStockCount } = data.summary
    if (ingredientCount === 0) return 100
    return Math.max(0, Math.round(((ingredientCount - lowStockCount) / ingredientCount) * 100))
  }, [data])

  if (isLoading && !data) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ py: 10 }}>
        <CircularProgress size={32} />
      </Stack>
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
  const generatedAt = data?.meta.generatedAt ? formatDateTime(data.meta.generatedAt) : 'Unavailable'
  const recentOutCount = recentTransactions.filter((transaction) => transaction.type === 'OUT').length

  return (
    <Box sx={{ pb: 2 }}>
      <PageHeader
        title="Inventory Command Center"
        subtitle="Live snapshot from your backend inventory data."
        actions={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              icon={<SyncAltRoundedIcon fontSize="small" />}
              label={`Health Score ${healthScore}%`}
              color={healthScore >= 80 ? 'success' : healthScore >= 60 ? 'warning' : 'error'}
              variant="outlined"
              sx={{ fontWeight: 700, px: 0.6, bgcolor: 'rgba(255,255,255,0.72)' }}
            />
            <Chip
              icon={<PendingActionsRoundedIcon fontSize="small" />}
              label={`Updated ${generatedAt}`}
              variant="outlined"
              sx={{ fontWeight: 600, bgcolor: 'rgba(255,255,255,0.72)' }}
            />
          </Stack>
        }
      />

      <Grid container spacing={2.2} sx={{ mb: 2.8 }}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <PrimaryMetricCard
            totalStockValue={summary.totalStockValue}
            ingredientCount={summary.ingredientCount}
            lowStockCount={summary.lowStockCount}
            healthScore={healthScore}
          />
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }}>
          <Grid container spacing={2.2}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <SnapshotMetricCard
                title="Ingredients"
                value={`${summary.ingredientCount}`}
                subtitle="Tracked inventory items"
                icon={<Inventory2RoundedIcon fontSize="small" />}
                accent="linear-gradient(145deg, #1A73E8, #56A8FF)"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <SnapshotMetricCard
                title="Low Stock Alerts"
                value={`${summary.lowStockCount}`}
                subtitle={summary.lowStockCount === 0 ? 'No urgent replenishment' : 'Needs replenishment'}
                icon={<WarningAmberRoundedIcon fontSize="small" />}
                accent="linear-gradient(145deg, #EA4335, #FF6B6B)"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <SnapshotMetricCard
                title="Active Recipes"
                value={`${summary.recipeCount}`}
                subtitle="Linked to ingredients"
                icon={<LocalDiningRoundedIcon fontSize="small" />}
                accent="linear-gradient(145deg, #2CA24D, #19C160)"
              />
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      <Grid container spacing={2.4}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <SectionCard
            title="Low Stock Queue"
            subtitle="Ingredients that need replenishment now."
            actions={
              <Chip
                size="small"
                color={lowStockItems.length > 0 ? 'error' : 'success'}
                variant="outlined"
                label={lowStockItems.length > 0 ? `${lowStockItems.length} urgent` : 'All healthy'}
              />
            }
            padded={false}
          >
            {lowStockItems.length === 0 ? (
              <Box sx={{ p: 2.4 }}>
                <Typography variant="body2" color="text.secondary">
                  No critical low stock items right now.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Ingredient</TableCell>
                      <TableCell align="right">Stock</TableCell>
                      <TableCell align="right">Reorder</TableCell>
                      <TableCell align="right">Gap</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lowStockItems.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{item.name}</TableCell>
                        <TableCell align="right">
                          {item.stockQuantity} {item.unit}
                        </TableCell>
                        <TableCell align="right">
                          {item.reorderLevel} {item.unit}
                        </TableCell>
                        <TableCell align="right">
                          <Chip size="small" color="error" variant="outlined" label={`${item.shortfall} ${item.unit}`} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </SectionCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <SectionCard
            title="Recent Transactions"
            subtitle="Latest inventory movements from the ledger."
            actions={
              <Chip
                size="small"
                variant="outlined"
                label={`${recentTransactions.length} total / ${recentOutCount} outbound`}
              />
            }
            padded={false}
          >
            {recentTransactions.length === 0 ? (
              <Box sx={{ p: 2.4 }}>
                <Typography variant="body2" color="text.secondary">
                  No transaction history yet.
                </Typography>
              </Box>
            ) : (
              <List dense sx={{ px: 2.2, py: 1 }}>
                {recentTransactions.map((transaction) => (
                  <Fragment key={transaction._id}>
                    <ListItem disableGutters sx={{ py: 1.1 }}>
                      <ListItemText
                        primary={
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {transaction.ingredient?.name ?? transaction.ingredientId}
                            </Typography>
                            <Chip
                              size="small"
                              label={transaction.type}
                              color={transaction.type === 'IN' ? 'success' : transaction.type === 'OUT' ? 'warning' : 'default'}
                              variant={transaction.type === 'ADJUST' ? 'outlined' : 'filled'}
                            />
                          </Stack>
                        }
                        secondary={
                          <>
                            <Typography component="span" variant="caption" color="text.secondary">
                              {transaction.reason || 'No reason'}
                            </Typography>
                            <br />
                            <Typography component="span" variant="caption" color="text.secondary">
                              {formatDateTime(transaction.createdAt)}
                            </Typography>
                          </>
                        }
                      />
                    </ListItem>
                    <Divider component="li" />
                  </Fragment>
                ))}
              </List>
            )}
          </SectionCard>
        </Grid>
      </Grid>
    </Box>
  )
}
