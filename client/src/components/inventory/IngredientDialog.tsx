import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  TextField,
} from '@mui/material'
import type { Ingredient, Unit } from '../../types/ingredient'

export type IngredientInput = Omit<Ingredient, 'id' | 'isActive' | 'stockStatus'> & {
  id?: string
  isActive?: boolean
}

interface IngredientDialogProps {
  open: boolean
  initialData?: Ingredient | null
  saving?: boolean
  onClose: () => void
  onSave: (input: IngredientInput) => void
}

const UNITS: Unit[] = ['pcs', 'g', 'kg', 'ml', 'l']

const getInitialValues = (initialData?: Ingredient | null): IngredientInput => {
  if (initialData) {
    return { ...initialData }
  }

  return {
    id: '',
    name: '',
    manufacturer: '',
    unit: 'pcs',
    stockQuantity: 0,
    costPerUnit: 0,
    reorderLevel: 0,
    parLevel: 0,
    category: '',
    isActive: true,
  }
}

export const IngredientDialog = ({
  open,
  initialData,
  saving = false,
  onClose,
  onSave,
}: IngredientDialogProps) => {
  const [values, setValues] = useState<IngredientInput>(() => getInitialValues(initialData))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleReset = () => {
    setValues(getInitialValues(initialData))
    setErrors({})
  }

  const handleChange = (field: keyof IngredientInput, value: string | number) => {
    setValues((prev) => ({ ...prev, [field]: value }))
  }

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    if (!values.name.trim()) nextErrors.name = 'Name is required'
    if (!values.unit) nextErrors.unit = 'Unit is required'
    if (!initialData && values.stockQuantity < 0) nextErrors.stockQuantity = 'Must be non-negative'
    if (values.costPerUnit < 0) nextErrors.costPerUnit = 'Must be non-negative'
    if (values.reorderLevel !== undefined && values.reorderLevel < 0) {
      nextErrors.reorderLevel = 'Must be non-negative'
    }
    if (values.parLevel !== undefined && values.parLevel < 0) {
      nextErrors.parLevel = 'Must be non-negative'
    }
    if (
      (values.parLevel ?? 0) > 0 &&
      (values.reorderLevel ?? 0) > 0 &&
      (values.parLevel ?? 0) < (values.reorderLevel ?? 0)
    ) {
      nextErrors.parLevel = 'Must be at least the reorder point when both are configured'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    onSave(values)
  }

  const mode = initialData ? 'Edit' : 'Add'

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      TransitionProps={{ onEnter: handleReset }}
    >
      <DialogTitle>{mode} ingredient</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField
              label="Name"
              value={values.name}
              onChange={(e) => handleChange('name', e.target.value)}
              fullWidth
              error={Boolean(errors.name)}
              helperText={errors.name}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            {initialData ? (
              <TextField
                label="Unit"
                value={values.unit}
                fullWidth
                slotProps={{ input: { readOnly: true } }}
                helperText="Unit cannot be changed after creation."
              />
            ) : (
              <TextField
                select
                label="Unit"
                value={values.unit}
                onChange={(e) => handleChange('unit', e.target.value as Unit)}
                fullWidth
                error={Boolean(errors.unit)}
                helperText={errors.unit}
              >
                {UNITS.map((unit) => (
                  <MenuItem key={unit} value={unit}>
                    {unit}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Manufacturer"
              value={values.manufacturer ?? ''}
              onChange={(e) => handleChange('manufacturer', e.target.value)}
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Category"
              value={values.category ?? ''}
              onChange={(e) => handleChange('category', e.target.value)}
              fullWidth
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 4 }}>
            {initialData ? (
              <TextField
                label="Current stock"
                value={`${values.stockQuantity} ${values.unit}`}
                fullWidth
                slotProps={{ input: { readOnly: true } }}
                helperText="Use Adjust stock to record inventory changes."
              />
            ) : (
              <TextField
                type="number"
                label="Initial stock"
                value={values.stockQuantity}
                onChange={(e) => handleChange('stockQuantity', Number(e.target.value))}
                fullWidth
                error={Boolean(errors.stockQuantity)}
                helperText={errors.stockQuantity}
                inputProps={{ min: 0 }}
              />
            )}
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              type="number"
              label="Cost per unit"
              value={values.costPerUnit}
              onChange={(e) => handleChange('costPerUnit', Number(e.target.value))}
              fullWidth
              error={Boolean(errors.costPerUnit)}
              helperText={errors.costPerUnit}
              inputProps={{ min: 0, step: 0.01 }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              type="number"
              label={`Reorder point (${values.unit})`}
              value={values.reorderLevel ?? 0}
              onChange={(e) => handleChange('reorderLevel', Number(e.target.value))}
              fullWidth
              error={Boolean(errors.reorderLevel)}
              helperText={errors.reorderLevel || 'When replenishment should begin.'}
              inputProps={{ min: 0 }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              type="number"
              label={`Par level (${values.unit})`}
              value={values.parLevel ?? 0}
              onChange={(e) => handleChange('parLevel', Number(e.target.value))}
              fullWidth
              error={Boolean(errors.parLevel)}
              helperText={errors.parLevel || 'Stock quantity to restore toward.'}
              inputProps={{ min: 0 }}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving' : 'Save ingredient'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
