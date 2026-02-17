import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded'
import LocalDiningRoundedIcon from '@mui/icons-material/LocalDiningRounded'
import MonetizationOnRoundedIcon from '@mui/icons-material/MonetizationOnRounded'
import SyncAltRoundedIcon from '@mui/icons-material/SyncAltRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Grid,
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
import { GradientCard } from '../../components/ui/GradientCard'
import { useAppSnackbar } from '../../context/snackbarContext'

interface MetricCardProps {
  title: string
  value: string
  subtitle: string
  icon: React.ReactNode
  accent: string
}

const MetricCard = ({ title, value, subtitle, icon, accent }: MetricCardProps) => {
  return (
    <Box
      sx={{
        borderRadius: 4,
        p: 2.25,
        background: 'linear-gradient(165deg, rgba(255,255,255,0.98), rgba(245,249,255,0.9))',
        border: '1px solid rgba(26,115,232,0.12)',
        boxShadow: '0 14px 32px rgba(17, 24, 39, 0.08)',
        transition: 'transform 180ms ease, box-shadow 220ms ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 20px 45px rgba(17, 24, 39, 0.12)',
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

  return (
    <Box sx={{ pb: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.2} mb={2.8}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
            Inventory Command Center
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Live snapshot from your backend inventory data.
          </Typography>
        </Box>
        <Chip
          icon={<SyncAltRoundedIcon fontSize="small" />}
          label={`Health Score ${healthScore}%`}
          color={healthScore >= 80 ? 'success' : healthScore >= 60 ? 'warning' : 'error'}
          variant="outlined"
          sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, fontWeight: 600, px: 0.6 }}
        />
      </Stack>

      <Grid container spacing={2.2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title="Ingredients"
            value={`${summary.ingredientCount}`}
            subtitle="Tracked inventory items"
            icon={<Inventory2RoundedIcon fontSize="small" />}
            accent="linear-gradient(145deg, #1A73E8, #56A8FF)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title="Total Stock Value"
            value={summary.totalStockValue.toFixed(2)}
            subtitle="Current on-hand valuation"
            icon={<MonetizationOnRoundedIcon fontSize="small" />}
            accent="linear-gradient(145deg, #00ACC1, #42A5F5)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title="Low Stock Alerts"
            value={`${summary.lowStockCount}`}
            subtitle={summary.lowStockCount === 0 ? 'No urgent replenishment' : 'Needs replenishment'}
            icon={<WarningAmberRoundedIcon fontSize="small" />}
            accent="linear-gradient(145deg, #EA4335, #FF6B6B)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title="Active Recipes"
            value={`${summary.recipeCount}`}
            subtitle="Linked to ingredients"
            icon={<LocalDiningRoundedIcon fontSize="small" />}
            accent="linear-gradient(145deg, #2CA24D, #19C160)"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2.4}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <GradientCard title="Low Stock Queue" subtitle="Ingredients that need attention now" accent="error">
            {lowStockItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No critical low stock items right now.
              </Typography>
            ) : (
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
            )}
          </GradientCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <GradientCard title="Recent Transactions" subtitle="Latest inventory movements" accent="info">
            {recentTransactions.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No transaction history yet.
              </Typography>
            ) : (
              <List dense sx={{ p: 0 }}>
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
          </GradientCard>
        </Grid>
      </Grid>
    </Box>
  )
}
