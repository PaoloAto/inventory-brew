import {
  Dialog,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Box,
  Chip,
  CircularProgress,
  Stack,
} from '@mui/material'
import type { RecipeDetails } from '../../api/recipes'

interface RecipeDetailsDialogProps {
  open: boolean
  details: RecipeDetails | null
  loading: boolean
  onClose: () => void
}

export const RecipeDetailsDialog = ({ open, details, loading, onClose }: RecipeDetailsDialogProps) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{details?.recipe.name ?? 'Recipe Details'}</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Stack alignItems="center" justifyContent="center" sx={{ py: 6 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : !details ? (
          <Typography variant="body2" color="text.secondary">
            No recipe details available.
          </Typography>
        ) : (
          <>
            <Typography variant="body1" sx={{ mb: 1 }}>
              {details.recipe.description || 'No description'}
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
              <Chip label={`Price: ${details.recipe.sellingPrice.toFixed(2)}`} />
              <Chip label={`Cost: ${(details.computed?.costPerServing ?? 0).toFixed(2)}`} />
              <Chip
                label={`Margin: ${(details.computed?.margin ?? 0).toFixed(2)} (${(details.computed?.marginPercent ?? 0).toFixed(0)}%)`}
                color={(details.computed?.marginPercent ?? 0) < 20 ? 'error' : 'success'}
              />
            </Box>

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Ingredients (per serving)
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Ingredient</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell>Unit</TableCell>
                  <TableCell align="right">Cost / Unit</TableCell>
                  <TableCell align="right">Cost Contribution</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {details.ingredientDetails.map((line) => (
                  <TableRow key={`${line.ingredientId}-${line.unit}`}>
                    <TableCell>{line.ingredientName}</TableCell>
                    <TableCell align="right">{line.quantity}</TableCell>
                    <TableCell>{line.unit}</TableCell>
                    <TableCell align="right">{line.costPerUnit.toFixed(2)}</TableCell>
                    <TableCell align="right">{line.costContribution.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
