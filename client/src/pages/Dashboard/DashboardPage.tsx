import {
  Box,
  Card,
  CardContent,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Chip,
} from '@mui/material'
import type { Ingredient } from '../../types/ingredient'
import { mockIngredients, computeTotalStockValue } from '../../mock/ingredients'
import { mockRecipes } from '../../mock/recipes'

export const DashboardPage = () => {
  const totalIngredients = mockIngredients.length
  const totalRecipes = mockRecipes.length
  const totalStockValue = computeTotalStockValue(mockIngredients)
  const lowStock = mockIngredients.filter((ing) =>
    ing.reorderLevel !== undefined ? ing.stockQuantity < ing.reorderLevel : ing.stockQuantity <= 3,
  )

  const stats = [
    { label: 'Ingredients', value: totalIngredients, sub: 'Tracked items', color: '#1A73E8' },
    { label: 'Total Stock Value', value: totalStockValue.toFixed(2), sub: 'Based on cost/unit', color: '#3BB5FF' },
    { label: 'Low Stock', value: lowStock.length, sub: 'Below reorder level', color: '#E53935' },
    { label: 'Recipes', value: totalRecipes, sub: 'Available dishes', color: '#43A047' },
  ]

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Dashboard
      </Typography>

      <Grid container spacing={2} mb={3}>
        {stats.map((stat) => (
          <Grid item xs={12} sm={6} md={3} key={stat.label}>
            <Card
              sx={{
                borderRadius: 3,
                background: `linear-gradient(135deg, ${stat.color}, ${stat.color}CC)`,
                color: 'common.white',
                boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
              }}
            >
              <CardContent>
                <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>
                  {stat.label}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {stat.value}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  {stat.sub}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <CardContent sx={{ p: 0 }}>
              <Box
                sx={{
                  px: 3,
                  py: 2,
                  background: 'linear-gradient(to right, #1A73E8, #42A5F5)',
                  color: 'common.white',
                }}
              >
                <Typography variant="h6">Low Stock Overview</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  Items below reorder level
                </Typography>
              </Box>
              <Box sx={{ p: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Ingredient</TableCell>
                      <TableCell>Unit</TableCell>
                      <TableCell align="right">Stock</TableCell>
                      <TableCell align="right">Reorder</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lowStock.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          <Typography variant="body2" color="text.secondary">
                            All ingredients meet the reorder level.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      lowStock.map((ing) => (
                        <TableRow key={ing.id} hover>
                          <TableCell sx={{ fontWeight: 500 }}>{ing.name}</TableCell>
                          <TableCell>{ing.unit}</TableCell>
                          <TableCell align="right">{ing.stockQuantity}</TableCell>
                          <TableCell align="right">{ing.reorderLevel ?? '—'}</TableCell>
                          <TableCell>
                            <Chip label="Low" color="error" size="small" variant="outlined" />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card sx={{ borderRadius: 3, overflow: 'hidden', height: '100%' }}>
            <CardContent sx={{ p: 0 }}>
              <Box
                sx={{
                  px: 3,
                  py: 2,
                  background: 'linear-gradient(to right, #43A047, #66BB6A)',
                  color: 'common.white',
                }}
              >
                <Typography variant="h6">Quick Snapshot</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  Inventory health at a glance
                </Typography>
              </Box>
              <Box sx={{ p: 3 }}>
                <Stack spacing={1.5}>
                  <Typography variant="body2">
                    Average cost per ingredient:{' '}
                    <strong>
                      {(totalStockValue / Math.max(totalIngredients, 1)).toFixed(2)}
                    </strong>
                  </Typography>
                  <Typography variant="body2">
                    Recipes available:{' '}
                    <Chip size="small" label={`${totalRecipes} recipes`} color="primary" variant="outlined" />
                  </Typography>
                  <Typography variant="body2">
                    Stock coverage:{' '}
                    <Chip
                      size="small"
                      label={lowStock.length === 0 ? 'Good' : 'Needs attention'}
                      color={lowStock.length === 0 ? 'success' : 'warning'}
                      variant="outlined"
                    />
                  </Typography>
                </Stack>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
