import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { Recipe, RecipeIngredient } from '../../types/recipe'
import { RecipeTable } from '../../components/recipes/RecipeTable'
import { RecipeDialog } from '../../components/recipes/RecipeDialog'
import { RecipeDetailsDialog } from '../../components/recipes/RecipeDetailsDialog'
import { GradientCard } from '../../components/ui/GradientCard'
import { mockRecipes } from '../../mock/recipes'
import { ingredientCostMap, mockIngredients } from '../../mock/ingredients'

function computeCostPerServing(ingredients: RecipeIngredient[]): number {
  return ingredients.reduce((sum, ri) => {
    const costPerUnit = ingredientCostMap[ri.ingredientId] ?? 0
    return sum + costPerUnit * ri.quantity
  }, 0)
}

export const RecipesPage = () => {
  const [search, setSearch] = useState('')
  const [recipes, setRecipes] = useState<Recipe[]>(mockRecipes)

  const [cookOpen, setCookOpen] = useState(false)
  const [cookServings, setCookServings] = useState(1)
  const [recipeToCook, setRecipeToCook] = useState<Recipe | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Recipe | null>(null)

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [viewing, setViewing] = useState<Recipe | null>(null)

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'info' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const getCostPerUnit = (ingredientId: string) => ingredientCostMap[ingredientId] ?? 0
  const getIngredientName = (ingredientId: string) =>
    mockIngredients.find((ing) => ing.id === ingredientId)?.name ?? ingredientId

  const filtered = useMemo(
    () => recipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())),
    [recipes, search],
  )

  const handleOpenCook = (recipe: Recipe) => {
    setRecipeToCook(recipe)
    setCookServings(1)
    setCookOpen(true)
  }

  const handleOpenAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = (recipe: Recipe) => {
    setEditing(recipe)
    setDialogOpen(true)
  }

  const handleSave = (input: Omit<Recipe, 'id' | 'isActive'> & { id?: string; isActive?: boolean }) => {
    if (input.id) {
      setRecipes((prev) => prev.map((r) => (r.id === input.id ? { ...r, ...input } : r)))
      setSnackbar({ open: true, severity: 'success', message: 'Recipe updated' })
    } else {
      const newRecipe: Recipe = {
        ...input,
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        isActive: true,
      }
      setRecipes((prev) => [...prev, newRecipe])
      setSnackbar({ open: true, severity: 'success', message: 'Recipe added' })
    }
    setDialogOpen(false)
    setEditing(null)
  }

  const handleOpenDetails = (recipe: Recipe) => {
    setViewing(recipe)
    setDetailsOpen(true)
  }

  const handleCloseDetails = () => {
    setViewing(null)
    setDetailsOpen(false)
  }

  const handleCloseCook = () => {
    setCookOpen(false)
    setRecipeToCook(null)
  }

  const handleConfirmCook = () => {
    if (!recipeToCook) return
    // Stub for now; later call backend /recipes/:id/cook
    setSnackbar({ open: true, severity: 'info', message: `Cooked ${cookServings} servings of ${recipeToCook.name}` })
    handleCloseCook()
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Recipes
      </Typography>

      <GradientCard
        title="Recipe Book"
        subtitle="Link recipes to ingredient costs and estimate margins instantly."
        rightContent={
          <Chip
            label={`${filtered.length} shown / ${recipes.length} total`}
            size="small"
            variant="outlined"
            sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.7)' }}
          />
        }
      >
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
            sx={{ maxWidth: 320 }}
          />
          <Button variant="contained" onClick={handleOpenAdd}>
            Add Recipe
          </Button>
        </Stack>

        <RecipeTable
          recipes={filtered}
          computeCostPerServing={computeCostPerServing}
          onCook={handleOpenCook}
          onView={handleOpenDetails}
          onEdit={handleOpenEdit}
        />
      </GradientCard>

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

      <RecipeDialog
        open={dialogOpen}
        initialData={editing ?? undefined}
        availableIngredients={mockIngredients}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />

      <RecipeDetailsDialog
        open={detailsOpen}
        recipe={viewing}
        onClose={handleCloseDetails}
        computeCostPerServing={computeCostPerServing}
        getCostPerUnit={getCostPerUnit}
        getIngredientName={getIngredientName}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={2500}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
