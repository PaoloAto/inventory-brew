import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Paper,
  Snackbar,
  Stack,
  TableContainer,
  TextField,
  Typography,
} from '@mui/material'
import type { Ingredient } from '../../types/ingredient'
import { IngredientTable } from '../../components/inventory/IngredientTable'
import { IngredientDialog, type IngredientInput } from '../../components/inventory/IngredientDialog'

const MOCK_INGREDIENTS: Ingredient[] = [
  {
    id: '1',
    name: 'Carrot',
    manufacturer: 'Fresh Farms',
    unit: 'pcs',
    stockQuantity: 30,
    costPerUnit: 3.5,
    reorderLevel: 10,
    isActive: true,
  },
  {
    id: '2',
    name: 'Chicken Breast',
    manufacturer: 'Poultry Co.',
    unit: 'g',
    stockQuantity: 5000,
    costPerUnit: 0.12,
    reorderLevel: 1200,
    isActive: true,
  },
  {
    id: '3',
    name: 'Olive Oil',
    manufacturer: 'Mediterranea',
    unit: 'ml',
    stockQuantity: 3200,
    costPerUnit: 0.03,
    reorderLevel: 600,
    isActive: true,
  },
]

export const IngredientsPage = () => {
  const [search, setSearch] = useState('')
  const [ingredients, setIngredients] = useState<Ingredient[]>(MOCK_INGREDIENTS)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'info' }>(
    { open: false, message: '', severity: 'success' },
  )

  const filtered = useMemo(
    () =>
      ingredients.filter((ingredient) =>
        ingredient.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [ingredients, search],
  )

  const handleToggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((i) => i !== id)))
  }

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filtered.map((i) => i.id))
    } else {
      setSelectedIds([])
    }
  }

  const openAddDialog = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEditDialog = (ingredient: Ingredient) => {
    setEditing(ingredient)
    setDialogOpen(true)
  }

  const handleSave = (input: IngredientInput) => {
    if (input.id) {
      setIngredients((prev) => prev.map((ing) => (ing.id === input.id ? { ...ing, ...input } : ing)))
      setSnackbar({ open: true, severity: 'success', message: 'Ingredient updated' })
    } else {
      const newIngredient: Ingredient = {
        ...input,
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        isActive: true,
      }
      setIngredients((prev) => [...prev, newIngredient])
      setSnackbar({ open: true, severity: 'success', message: 'Ingredient added' })
    }
    setDialogOpen(false)
    setEditing(null)
  }

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return
    setIngredients((prev) => prev.filter((ing) => !selectedIds.includes(ing.id)))
    setSelectedIds([])
    setSnackbar({ open: true, severity: 'info', message: 'Selected ingredients removed' })
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Ingredients
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
          <Typography variant="h6">Ingredients Inventory</Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            Track your restaurant stock levels and ingredient costs.
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
              label="Search ingredient"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ maxWidth: 300 }}
            />
            <Button variant="contained" onClick={openAddDialog}>
              Add Ingredient
            </Button>
          </Stack>

          <TableContainer>
            <IngredientTable
              ingredients={filtered}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
              onEdit={openEditDialog}
            />
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <Button
              variant="outlined"
              color="error"
              disabled={selectedIds.length === 0}
              onClick={handleDeleteSelected}
            >
              Delete selected
            </Button>
          </Box>
        </Box>
      </Paper>

      <IngredientDialog open={dialogOpen} initialData={editing ?? undefined} onClose={() => setDialogOpen(false)} onSave={handleSave} />

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
