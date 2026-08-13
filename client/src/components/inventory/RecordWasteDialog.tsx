import { useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { wasteReasonCodes, wasteReasonLabels, type RecordWastePayload, type WasteReasonCode } from '../../api/waste'
import { formatCurrency, formatQuantity } from '../ui/formatters'
import { numericSx } from '../../theme'
import type { Ingredient } from '../../types/ingredient'

interface RecordWasteDialogProps {
  open: boolean
  ingredient: Ingredient | null
  saving: boolean
  onClose: () => void
  onConfirm: (payload: RecordWastePayload) => void
}

export const RecordWasteDialog = ({
  open,
  ingredient,
  saving,
  onClose,
  onConfirm,
}: RecordWasteDialogProps) => {
  const [quantity, setQuantity] = useState<number | ''>('')
  const [reasonCode, setReasonCode] = useState<WasteReasonCode>('WASTE_SPOILAGE')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  if (!ingredient) return null

  const estimatedLoss = typeof quantity === 'number' ? quantity * ingredient.costPerUnit : 0
  const submit = () => {
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
      setError('Quantity must be greater than zero.')
      return
    }
    if (quantity > ingredient.stockQuantity) {
      setError(`Only ${formatQuantity(ingredient.stockQuantity, ingredient.unit)} is available.`)
      return
    }
    onConfirm({ quantity, reasonCode, note: note.trim() || undefined })
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Record waste</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle1">{ingredient.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              Current stock: {formatQuantity(ingredient.stockQuantity, ingredient.unit)} · Average cost: {formatCurrency(ingredient.costPerUnit)} / {ingredient.unit}
            </Typography>
          </Box>
          <TextField
            autoFocus
            label="Quantity wasted"
            type="number"
            fullWidth
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value === '' ? '' : Number(event.target.value))
              setError('')
            }}
            inputProps={{ min: 0, step: 'any' }}
          />
          <FormControl fullWidth>
            <InputLabel id="waste-reason-label">Reason</InputLabel>
            <Select
              labelId="waste-reason-label"
              label="Reason"
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value as WasteReasonCode)}
            >
              {wasteReasonCodes.map((code) => (
                <MenuItem key={code} value={code}>{wasteReasonLabels[code]}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
          <Box sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">Estimated loss</Typography>
            <Typography variant="h6" sx={numericSx}>{formatCurrency(estimatedLoss)}</Typography>
            <Typography variant="caption" color="text.secondary">The committed ledger cost is authoritative.</Typography>
          </Box>
          {error ? <Typography variant="body2" color="error.main">{error}</Typography> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={saving}>
          {saving ? 'Recording' : 'Record waste'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
