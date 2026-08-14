import { useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { PurchaseOrderPayload } from '../../api/purchasing'
import type { Supplier } from '../../api/suppliers'
import type { Ingredient } from '../../types/ingredient'

interface Props {
  open: boolean
  mode?: 'create' | 'edit'
  suppliers: Supplier[]
  ingredients: Ingredient[]
  initial?: Partial<PurchaseOrderPayload>
  saving?: boolean
  onClose: () => void
  onSave: (payload: PurchaseOrderPayload) => void
}

type PurchaseLine = {
  ingredientId: string
  orderedQuantity: number
  expectedUnitCost: number
}

export const PurchaseOrderDialog = ({
  open,
  mode = 'create',
  suppliers,
  ingredients,
  initial,
  saving,
  onClose,
  onSave,
}: Props) => {
  const [supplierId, setSupplierId] = useState(initial?.supplierId || '')
  const [expectedAt, setExpectedAt] = useState(initial?.expectedAt?.slice(0, 10) || '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [lines, setLines] = useState<PurchaseLine[]>(initial?.items || [])
  const [error, setError] = useState('')

  const handleSave = () => {
    if (
      !supplierId ||
      !lines.length ||
      lines.some(
        (line) =>
          !line.ingredientId ||
          !Number.isFinite(line.orderedQuantity) ||
          line.orderedQuantity <= 0 ||
          !Number.isFinite(line.expectedUnitCost) ||
          line.expectedUnitCost < 0,
      )
    ) {
      setError('Choose a supplier and complete every purchase line.')
      return
    }
    if (new Set(lines.map((line) => line.ingredientId)).size !== lines.length) {
      setError('Each ingredient can appear only once.')
      return
    }
    onSave({
      supplierId,
      expectedAt: expectedAt || undefined,
      notes: notes || undefined,
      items: lines,
    })
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{mode === 'edit' ? 'Edit draft purchase order' : 'Create draft purchase order'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel id="po-supplier">Supplier</InputLabel>
                <Select
                  labelId="po-supplier"
                  label="Supplier"
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                >
                  {suppliers.map((supplier) => (
                    <MenuItem key={supplier._id} value={supplier._id}>{supplier.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Expected date"
                type="date"
                value={expectedAt}
                onChange={(event) => setExpectedAt(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                multiline
                minRows={2}
              />
            </Grid>
          </Grid>

          <Typography variant="subtitle2">Purchase lines</Typography>
          {lines.map((line, index) => (
            <Grid container spacing={1} key={`${line.ingredientId}-${index}`} alignItems="center">
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select
                  label="Ingredient"
                  fullWidth
                  value={line.ingredientId}
                  onChange={(event) =>
                    setLines((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, ingredientId: event.target.value } : row,
                      ),
                    )
                  }
                >
                  {ingredients.map((ingredient) => (
                    <MenuItem key={ingredient.id} value={ingredient.id}>
                      {ingredient.name} ({ingredient.unit})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 5, sm: 2 }}>
                <TextField
                  type="number"
                  label="Quantity"
                  fullWidth
                  value={line.orderedQuantity}
                  inputProps={{ min: 0, step: 'any' }}
                  onChange={(event) =>
                    setLines((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, orderedQuantity: Number(event.target.value) }
                          : row,
                      ),
                    )
                  }
                />
              </Grid>
              <Grid size={{ xs: 5, sm: 3 }}>
                <TextField
                  type="number"
                  label="Expected cost"
                  fullWidth
                  value={line.expectedUnitCost}
                  inputProps={{ min: 0, step: 'any' }}
                  onChange={(event) =>
                    setLines((rows) =>
                      rows.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, expectedUnitCost: Number(event.target.value) }
                          : row,
                      ),
                    )
                  }
                />
              </Grid>
              <Grid size={{ xs: 2, sm: 1 }}>
                <IconButton
                  aria-label="Remove purchase line"
                  onClick={() => setLines((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </Grid>
            </Grid>
          ))}
          <Button
            startIcon={<AddRoundedIcon />}
            onClick={() =>
              setLines((rows) => [
                ...rows,
                { ingredientId: '', orderedQuantity: 0, expectedUnitCost: 0 },
              ])
            }
            sx={{ alignSelf: 'flex-start' }}
          >
            Add line
          </Button>
          {error ? <Typography color="error" variant="body2">{error}</Typography> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving' : mode === 'edit' ? 'Save changes' : 'Save draft'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
