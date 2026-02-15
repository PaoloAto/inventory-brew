import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Snackbar,
  Stack,
  TableContainer,
  TextField,
  Typography,
} from '@mui/material'
import type { Ingredient } from '../../types/ingredient'
import { GradientCard } from '../../components/ui/GradientCard'
import { IngredientTable } from '../../components/inventory/IngredientTable'
import { IngredientDialog, type IngredientInput } from '../../components/inventory/IngredientDialog'
import { mockIngredients } from '../../mock/ingredients'

export const IngredientsPage = () => {
  const [search, setSearch] = useState('')
  const [ingredients, setIngredients] = useState<Ingredient[]>(mockIngredients)
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

      <GradientCard
        title="Ingredients Inventory"
        subtitle="Track stock, costs, and low-level alerts in one place."
        rightContent={
          <Chip
            label={`${filtered.length} shown / ${ingredients.length} total`}
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
            label="Search ingredient"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ maxWidth: 320 }}
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
      </GradientCard>

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
