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
} from '@mui/material'
import type { Recipe } from '../../types/recipe'

interface RecipeDetailsDialogProps {
  open: boolean
  recipe: Recipe | null
  onClose: () => void
  computeCostPerServing: (ingredients: Recipe['ingredients']) => number
  getCostPerUnit: (ingredientId: string) => number
  getIngredientName: (ingredientId: string) => string
}

export const RecipeDetailsDialog = ({
  open,
  recipe,
  onClose,
  computeCostPerServing,
  getCostPerUnit,
  getIngredientName,
}: RecipeDetailsDialogProps) => {
  if (!recipe) return null

  const cost = computeCostPerServing(recipe.ingredients)
  const margin = recipe.sellingPrice - cost
  const marginPercent = recipe.sellingPrice ? (margin / recipe.sellingPrice) * 100 : 0

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{recipe.name}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body1" sx={{ mb: 1 }}>
          {recipe.description || 'No description'}
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Chip label={`Price: ${recipe.sellingPrice.toFixed(2)}`} />
          <Chip label={`Cost: ${cost.toFixed(2)}`} />
          <Chip label={`Margin: ${margin.toFixed(2)} (${marginPercent.toFixed(0)}%)`} color={marginPercent < 20 ? 'error' : 'success'} />
        </Box>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Ingredients (per serving)
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Ingredient ID</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell>Unit</TableCell>
              <TableCell align="right">Cost / Unit</TableCell>
              <TableCell align="right">Cost Contribution</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recipe.ingredients.map((ri, idx) => {
              const costPerUnit = getCostPerUnit(ri.ingredientId)
              const contribution = costPerUnit * ri.quantity
              return (
                <TableRow key={`${ri.ingredientId}-${idx}`}>
                  <TableCell>{getIngredientName(ri.ingredientId)}</TableCell>
                  <TableCell align="right">{ri.quantity}</TableCell>
                  <TableCell>{ri.unit}</TableCell>
                  <TableCell align="right">{costPerUnit.toFixed(2)}</TableCell>
                  <TableCell align="right">{contribution.toFixed(2)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  )
}
