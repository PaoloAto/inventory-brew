import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import type { Recipe, RecipeIngredient } from '../../types/recipe'
import type { Ingredient, Unit } from '../../types/ingredient'

type RecipeInput = Omit<Recipe, 'id' | 'isActive'> & { id?: string; isActive?: boolean }

interface RecipeDialogProps {
  open: boolean
  initialData?: Recipe | null
  availableIngredients: Ingredient[]
  onClose: () => void
  onSave: (input: RecipeInput) => void
}

const UNITS: Unit[] = ['pcs', 'g', 'kg', 'ml', 'l']

const blankIngredient: RecipeIngredient = { ingredientId: '', quantity: 0, unit: 'pcs' }

export const RecipeDialog = ({ open, initialData, availableIngredients, onClose, onSave }: RecipeDialogProps) => {
  const [values, setValues] = useState<RecipeInput>({
    id: '',
    name: '',
    description: '',
    sellingPrice: 0,
    ingredients: [blankIngredient],
    isActive: true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      if (initialData) {
        setValues({ ...initialData })
      } else {
        setValues({
          id: '',
          name: '',
          description: '',
          sellingPrice: 0,
          ingredients: [blankIngredient],
          isActive: true,
        })
      }
      setErrors({})
    }
  }, [open, initialData])

  const handleChange = (field: keyof RecipeInput, value: unknown) => {
    setValues((prev) => ({ ...prev, [field]: value as never }))
  }

  const handleIngredientChange = (index: number, field: keyof RecipeIngredient, value: string | number) => {
    setValues((prev) => {
      const next = [...prev.ingredients]
      next[index] = { ...next[index], [field]: value } as RecipeIngredient
      return { ...prev, ingredients: next }
    })
  }

  const addIngredientRow = () => {
    setValues((prev) => ({ ...prev, ingredients: [...prev.ingredients, { ...blankIngredient }] }))
  }

  const removeIngredientRow = (index: number) => {
    setValues((prev) => {
      const next = prev.ingredients.filter((_, idx) => idx !== index)
      return { ...prev, ingredients: next.length > 0 ? next : [{ ...blankIngredient }] }
    })
  }

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    if (!values.name.trim()) nextErrors.name = 'Name is required'
    if (values.sellingPrice < 0) nextErrors.sellingPrice = 'Must be non-negative'
    values.ingredients.forEach((ri, idx) => {
      if (!ri.ingredientId.trim()) nextErrors[`ingredientId-${idx}`] = 'Ingredient required'
      if (ri.quantity <= 0) nextErrors[`quantity-${idx}`] = 'Quantity must be > 0'
    })
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    onSave(values)
  }

  const mode = initialData ? 'Edit' : 'Add'

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{mode} Recipe</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12} sm={8}>
            <TextField
              label="Name"
              value={values.name}
              onChange={(e) => handleChange('name', e.target.value)}
              fullWidth
              error={Boolean(errors.name)}
              helperText={errors.name}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              type="number"
              label="Selling Price"
              value={values.sellingPrice}
              onChange={(e) => handleChange('sellingPrice', Number(e.target.value))}
              fullWidth
              error={Boolean(errors.sellingPrice)}
              helperText={errors.sellingPrice}
              inputProps={{ min: 0, step: 0.01 }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Description"
              value={values.description ?? ''}
              onChange={(e) => handleChange('description', e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Grid>
        </Grid>

        <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
          Ingredients (per serving)
        </Typography>
        <Grid container spacing={1.5}>
          {values.ingredients.map((ri, idx) => (
            <Grid container item spacing={1.5} key={idx}>
              <Grid item xs={12} sm={5}>
                <TextField
                  select
                  label="Ingredient"
                  value={ri.ingredientId}
                  onChange={(e) => handleIngredientChange(idx, 'ingredientId', e.target.value)}
                  fullWidth
                  error={Boolean(errors[`ingredientId-${idx}`])}
                  helperText={errors[`ingredientId-${idx}`]}
                >
                  {availableIngredients.map((ing) => (
                    <MenuItem key={ing.id} value={ing.id}>
                      {ing.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  type="number"
                  label="Quantity"
                  value={ri.quantity}
                  onChange={(e) => handleIngredientChange(idx, 'quantity', Number(e.target.value))}
                  fullWidth
                  error={Boolean(errors[`quantity-${idx}`])}
                  helperText={errors[`quantity-${idx}`]}
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
              <Grid item xs={4} sm={2}>
                <TextField
                  select
                  label="Unit"
                  value={ri.unit}
                  onChange={(e) => handleIngredientChange(idx, 'unit', e.target.value as Unit)}
                  fullWidth
                >
                  {UNITS.map((u) => (
                    <MenuItem key={u} value={u}>
                      {u}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={2} sm={2} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <IconButton color="error" onClick={() => removeIngredientRow(idx)}>
                  <DeleteOutlineIcon />
                </IconButton>
              </Grid>
            </Grid>
          ))}
          <Grid item xs={12}>
            <Button startIcon={<AddIcon />} onClick={addIngredientRow}>
              Add ingredient row
            </Button>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}
