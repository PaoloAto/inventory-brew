import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type { RecipeDetails } from '../../api/recipes'
import { numericSx } from '../../theme'
import { formatCurrency, formatPercentage, formatQuantity } from '../ui/formatters'
import { StatusLabel } from '../ui/StatusLabel'

interface RecipeDetailsDialogProps {
  open: boolean
  details: RecipeDetails | null
  loading: boolean
  onClose: () => void
}

export const RecipeDetailsDialog = ({
  open,
  details,
  loading,
  onClose,
}: RecipeDetailsDialogProps) => {
  const metrics = details?.configuration?.isValid === true ? details.computed : null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{details?.recipe.name ?? 'Recipe cost sheet'}</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Stack spacing={1.5} aria-label="Loading recipe details">
            <Skeleton variant="text" width="70%" height={28} />
            <Skeleton variant="rectangular" height={92} />
            <Skeleton variant="rectangular" height={230} />
          </Stack>
        ) : !details ? (
          <Typography variant="body2" color="text.secondary">
            Recipe details are unavailable.
          </Typography>
        ) : (
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              {details.recipe.description || 'No description recorded.'}
            </Typography>

            {details.configuration?.isValid === false && (
              <Stack spacing={0.75} alignItems="flex-start">
                <StatusLabel label="Configuration issue" tone="warning" />
                {details.configuration.issues.map((issue, index) => (
                  <Typography
                    key={`${issue.code}-${issue.ingredientId}-${index}`}
                    variant="caption"
                    color="text.secondary"
                  >
                    {issue.message}
                  </Typography>
                ))}
              </Stack>
            )}

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
                borderBlock: '1px solid',
                borderColor: 'divider',
              }}
            >
              {[
                ['Selling price', formatCurrency(details.recipe.sellingPrice)],
                ['Ingredient cost', metrics ? formatCurrency(metrics.ingredientCost) : '—'],
                ['Gross margin', metrics ? formatCurrency(metrics.grossMargin) : '—'],
                [
                  'Margin',
                  metrics?.marginPercent === null || metrics?.marginPercent === undefined
                    ? '—'
                    : formatPercentage(metrics.marginPercent),
                ],
              ].map(([label, value], index) => (
                <Box
                  key={label}
                  sx={{
                    px: 1.5,
                    py: 1.5,
                    borderLeft: {
                      xs: index % 2 === 0 ? 0 : '1px solid',
                      sm: index === 0 ? 0 : '1px solid',
                    },
                    borderTop: { xs: index > 1 ? '1px solid' : 0, sm: 0 },
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography sx={{ ...numericSx, mt: 0.35, fontSize: '0.9375rem', fontWeight: 500 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Formula per serving
              </Typography>
              <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Ingredient</TableCell>
                      <TableCell align="right">Quantity</TableCell>
                      <TableCell align="right">Unit cost</TableCell>
                      <TableCell align="right">Contribution</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {details.ingredientDetails.map((line) => (
                      <TableRow key={`${line.ingredientId}-${line.unit}`}>
                        <TableCell sx={{ fontWeight: 500 }}>{line.ingredientName}</TableCell>
                        <TableCell align="right" sx={numericSx}>
                          {formatQuantity(line.quantity, line.unit)}
                        </TableCell>
                        <TableCell align="right" sx={numericSx}>
                          {line.costPerUnit === null ? '—' : formatCurrency(line.costPerUnit)}
                        </TableCell>
                        <TableCell align="right" sx={numericSx}>
                          {line.costContribution === null ? '—' : formatCurrency(line.costContribution)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3} sx={{ fontWeight: 500 }}>
                        Total ingredient cost
                      </TableCell>
                      <TableCell align="right" sx={{ ...numericSx, fontWeight: 500 }}>
                        {metrics ? formatCurrency(metrics.ingredientCost) : '—'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
