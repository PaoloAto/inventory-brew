import type { ReactNode } from 'react'
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded'
import LocalDiningRoundedIcon from '@mui/icons-material/LocalDiningRounded'
import MonetizationOnRoundedIcon from '@mui/icons-material/MonetizationOnRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import {
  Avatar,
  Box,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { GradientCard } from '../../components/ui/GradientCard'
import { computeTotalStockValue, mockIngredients } from '../../mock/ingredients'
import { mockRecipes } from '../../mock/recipes'

interface MetricCardProps {
  title: string
  value: string
  subtitle: string
  icon: ReactNode
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

export const DashboardPage = () => {
  const totalIngredients = mockIngredients.length
  const totalRecipes = mockRecipes.length
  const totalStockValue = computeTotalStockValue(mockIngredients)

  const ingredientsWithMetrics = mockIngredients.map((ing) => {
    const stockValue = ing.stockQuantity * ing.costPerUnit
    const reorderLevel = ing.reorderLevel ?? 0
    const healthRatio = reorderLevel > 0 ? (ing.stockQuantity / reorderLevel) * 100 : 100
    return {
      ...ing,
      stockValue,
      reorderLevel,
      healthRatio,
    }
  })

  const lowStock = ingredientsWithMetrics.filter((ing) => ing.reorderLevel > 0 && ing.stockQuantity < ing.reorderLevel)
  const watchList = [...ingredientsWithMetrics]
    .sort((a, b) => a.healthRatio - b.healthRatio)
    .slice(0, Math.min(4, ingredientsWithMetrics.length))
  const topValueItems = [...ingredientsWithMetrics]
    .sort((a, b) => b.stockValue - a.stockValue)
    .slice(0, Math.min(5, ingredientsWithMetrics.length))

  const averageIngredientCost = totalIngredients > 0 ? totalStockValue / totalIngredients : 0
  const healthScore = Math.round(
    ingredientsWithMetrics.reduce((acc, item) => acc + Math.min(item.healthRatio, 140), 0) /
      Math.max(ingredientsWithMetrics.length, 1),
  )

  return (
    <Box sx={{ pb: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.2} mb={2.8}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
            Inventory Command Center
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Live snapshot of ingredient health, value concentration, and operational risk.
          </Typography>
        </Box>
        <Chip
          icon={<TrendingUpRoundedIcon fontSize="small" />}
          label={`Health Score ${healthScore}%`}
          color={healthScore >= 100 ? 'success' : 'warning'}
          variant="outlined"
          sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, fontWeight: 600, px: 0.6 }}
        />
      </Stack>

      <Grid container spacing={2.2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title="Ingredients"
            value={`${totalIngredients}`}
            subtitle="Tracked inventory items"
            icon={<Inventory2RoundedIcon fontSize="small" />}
            accent="linear-gradient(145deg, #1A73E8, #56A8FF)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title="Total Stock Value"
            value={totalStockValue.toFixed(2)}
            subtitle="Current on-hand valuation"
            icon={<MonetizationOnRoundedIcon fontSize="small" />}
            accent="linear-gradient(145deg, #00ACC1, #42A5F5)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title="Low Stock Alerts"
            value={`${lowStock.length}`}
            subtitle={lowStock.length === 0 ? 'No urgent replenishment' : 'Needs replenishment'}
            icon={<WarningAmberRoundedIcon fontSize="small" />}
            accent="linear-gradient(145deg, #EA4335, #FF6B6B)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            title="Active Recipes"
            value={`${totalRecipes}`}
            subtitle="Linked to ingredients"
            icon={<LocalDiningRoundedIcon fontSize="small" />}
            accent="linear-gradient(145deg, #2CA24D, #19C160)"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2.4}>
        <Grid size={{ xs: 12, xl: 8 }}>
          <GradientCard
            title="Stock Health Matrix"
            subtitle="Stock level versus reorder threshold"
            accent="primary"
            rightContent={
              <Chip
                size="small"
                label={`${watchList.length} monitored`}
                variant="outlined"
                sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.6)' }}
              />
            }
          >
            <Stack spacing={2.2}>
              {watchList.map((item) => {
                const progressValue = Math.max(0, Math.min(item.healthRatio, 160))
                const chipColor =
                  item.healthRatio < 100 ? 'error' : item.healthRatio < 130 ? 'warning' : 'success'
                return (
                  <Box key={item.id}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.7}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {item.name}
                      </Typography>
                      <Stack direction="row" spacing={0.8} alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                          {item.stockQuantity} {item.unit}
                        </Typography>
                        <Chip size="small" label={`${Math.round(item.healthRatio)}%`} color={chipColor} />
                      </Stack>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={progressValue}
                      color={chipColor}
                      sx={{ height: 9, borderRadius: 99, backgroundColor: 'rgba(148,163,184,0.22)' }}
                    />
                  </Box>
                )
              })}
            </Stack>
          </GradientCard>
        </Grid>

        <Grid size={{ xs: 12, xl: 4 }}>
          <GradientCard title="Cost Concentration" subtitle="Highest value ingredients" accent="info">
            <Stack spacing={1.6}>
              {topValueItems.map((item) => {
                const percentage = totalStockValue > 0 ? (item.stockValue / totalStockValue) * 100 : 0
                return (
                  <Box key={item.id}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {item.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.stockValue.toFixed(2)}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(percentage, 100)}
                      color="secondary"
                      sx={{ height: 8, borderRadius: 99, backgroundColor: 'rgba(15,23,42,0.08)' }}
                    />
                  </Box>
                )
              })}
            </Stack>
          </GradientCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }}>
          <GradientCard title="Low Stock Queue" subtitle="Ingredients that need attention now" accent="error">
            {lowStock.length === 0 ? (
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  No critical low stock items right now.
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Tip: monitor the health matrix above for ingredients approaching reorder level.
                </Typography>
              </Stack>
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
                  {lowStock.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{item.name}</TableCell>
                      <TableCell align="right">
                        {item.stockQuantity} {item.unit}
                      </TableCell>
                      <TableCell align="right">
                        {item.reorderLevel} {item.unit}
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          size="small"
                          color="error"
                          variant="outlined"
                          label={`${Math.max(item.reorderLevel - item.stockQuantity, 0)} ${item.unit}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </GradientCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <GradientCard title="Operational Snapshot" subtitle="Quick strategic indicators" accent="success">
            <Stack spacing={1.6}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Average ingredient value
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {averageIngredientCost.toFixed(2)}
                </Typography>
              </Stack>
              <Divider />
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Recipes available
                </Typography>
                <Chip size="small" label={`${totalRecipes} recipes`} color="primary" variant="outlined" />
              </Stack>
              <Divider />
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Stock coverage
                </Typography>
                <Chip
                  size="small"
                  label={lowStock.length === 0 ? 'Healthy' : 'Watch closely'}
                  color={lowStock.length === 0 ? 'success' : 'warning'}
                  variant="outlined"
                />
              </Stack>
              <Divider />
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Portfolio mix
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {totalIngredients} ingredients / {totalRecipes} recipes
                </Typography>
              </Stack>
            </Stack>
          </GradientCard>
        </Grid>
      </Grid>
    </Box>
  )
}
