import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { Recipe, RecipeIngredient } from '../../types/recipe'
import { RecipeTable } from '../../components/recipes/RecipeTable'

const MOCK_INGREDIENT_COSTS: Record<string, number> = {
  'ing-1': 2000,
  'ing-2': 1500,
  'ing-3': 1000,
}

const MOCK_RECIPES: Recipe[] = [
  {
    id: 'r-1',
    name: 'Chicken Pasta',
    description: 'Creamy pasta with grilled chicken.',
    sellingPrice: 320,
    isActive: true,
    ingredients: [
      { ingredientId: 'ing-1', quantity: 1, unit: 'pcs' },
      { ingredientId: 'ing-2', quantity: 0.5, unit: 'kg' },
    ],
  },
  {
    id: 'r-2',
    name: 'Garden Salad',
    description: 'Fresh mixed greens with vinaigrette.',
    sellingPrice: 180,
    isActive: true,
    ingredients: [
      { ingredientId: 'ing-2', quantity: 0.2, unit: 'kg' },
      { ingredientId: 'ing-3', quantity: 0.1, unit: 'kg' },
    ],
  },
]

function computeCostPerServing(ingredients: RecipeIngredient[]): number {
  return ingredients.reduce((sum, ri) => {
    const costPerUnit = MOCK_INGREDIENT_COSTS[ri.ingredientId] ?? 0
    return sum + costPerUnit * ri.quantity
  }, 0)
}

export const RecipesPage = () => {
  const [search, setSearch] = useState('')
  const [recipes] = useState<Recipe[]>(MOCK_RECIPES)

  const [cookOpen, setCookOpen] = useState(false)
  const [cookServings, setCookServings] = useState(1)
  const [recipeToCook, setRecipeToCook] = useState<Recipe | null>(null)

  const filtered = useMemo(
    () => recipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())),
    [recipes, search],
  )

  const handleOpenCook = (recipe: Recipe) => {
    setRecipeToCook(recipe)
    setCookServings(1)
    setCookOpen(true)
  }

  const handleCloseCook = () => {
    setCookOpen(false)
    setRecipeToCook(null)
  }

  const handleConfirmCook = () => {
    if (!recipeToCook) return
    // Stub for now; later call backend /recipes/:id/cook
    console.info(`Cook ${cookServings} servings of`, recipeToCook.name)
    handleCloseCook()
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Recipes
      </Typography>

      <Paper
        elevation={3}
        sx={{
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            px: 3,
            py: 2,
            background: 'linear-gradient(to right, #1A73E8, #42A5F5)',
            color: 'common.white',
          }}
        >
          <Typography variant="h6">Recipe Book</Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            Link recipes to ingredients and see cost & margin per serving.
          </Typography>
        </Box>

        <Box sx={{ p: 3 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
            mb={2}
          >
            <TextField
              size="small"
              label="Search recipe"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ maxWidth: 300 }}
            />
            <Button variant="contained">Add Recipe</Button>
          </Stack>

          <RecipeTable
            recipes={filtered}
            computeCostPerServing={computeCostPerServing}
            onCook={handleOpenCook}
          />
        </Box>
      </Paper>

      <Dialog open={cookOpen} onClose={handleCloseCook} maxWidth="xs" fullWidth>
        <DialogTitle>{recipeToCook ? `Cook "${recipeToCook.name}"` : 'Cook Recipe'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            autoFocus
            margin="dense"
            label="Number of servings"
            type="number"
            fullWidth
            value={cookServings}
            onChange={(e) => setCookServings(Number(e.target.value) || 1)}
            inputProps={{ min: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCook}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirmCook}>
            Cook
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
