import { useState } from 'react'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { AdjustStockPayload } from '../../api/ingredients'
import type { Ingredient } from '../../types/ingredient'
import { numericSx } from '../../theme'
import { formatQuantity, formatSignedDelta } from '../ui/formatters'

interface StockAdjustmentDialogProps {
  open: boolean
  ingredient: Ingredient | null
  saving: boolean
  onClose: () => void
  onConfirm: (payload: AdjustStockPayload) => void
}

type AdjustmentType = 'IN' | 'OUT' | 'ADJUST'

export const StockAdjustmentDialog = ({
  open,
  ingredient,
  saving,
  onClose,
  onConfirm,
}: StockAdjustmentDialogProps) => {
  const [type, setType] = useState<AdjustmentType>('IN')
  const [amount, setAmount] = useState(1)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const reset = () => {
    setType('IN')
    setAmount(1)
    setReason('')
    setError('')
  }

  const handleConfirm = () => {
    if (!ingredient) return
    if (type === 'ADJUST' && amount < 0) {
      setError('New stock cannot be negative.')
      return
    }
    if (type !== 'ADJUST' && amount <= 0) {
      setError('Quantity must be greater than zero.')
      return
    }
    if (type === 'OUT' && amount > ingredient.stockQuantity) {
      setError(`Only ${formatQuantity(ingredient.stockQuantity, ingredient.unit)} is available.`)
      return
    }

    const trimmedReason = reason.trim() || 'Manual stock adjustment'
    onConfirm(
      type === 'ADJUST'
        ? {
            type,
            newStockQuantity: amount,
            expectedCurrentStock: ingredient.stockQuantity,
            reason: trimmedReason,
          }
        : { type, quantity: amount, reason: trimmedReason },
    )
  }

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      TransitionProps={{ onEnter: reset }}
    >
      <DialogTitle>Adjust stock</DialogTitle>
      <DialogContent dividers>
        {ingredient ? (
          <Stack spacing={2.25}>
            <Stack spacing={0.25}>
              <Typography variant="subtitle1">{ingredient.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                Current stock{' '}
                <Typography component="span" sx={{ ...numericSx, fontSize: 'inherit', color: 'text.primary' }}>
                  {formatQuantity(ingredient.stockQuantity, ingredient.unit)}
                </Typography>
              </Typography>
            </Stack>

            {error ? <Alert severity="error">{error}</Alert> : null}

            <TextField
              select
              label="Movement type"
              value={type}
              onChange={(event) => {
                setType(event.target.value as AdjustmentType)
                setAmount(event.target.value === 'ADJUST' ? ingredient.stockQuantity : 1)
                setError('')
              }}
              fullWidth
            >
              <MenuItem value="IN">Receive stock</MenuItem>
              <MenuItem value="OUT">Remove stock</MenuItem>
              <MenuItem value="ADJUST">Set exact stock</MenuItem>
            </TextField>

            <TextField
              autoFocus
              type="number"
              label={type === 'ADJUST' ? 'New stock quantity' : 'Quantity'}
              value={amount}
              onChange={(event) => {
                setAmount(Number(event.target.value))
                setError('')
              }}
              fullWidth
              inputProps={{ min: type === 'ADJUST' ? 0 : 0.01, step: 0.01 }}
              helperText={`Unit: ${ingredient.unit}`}
            />

            {type === 'ADJUST' ? (
              <Stack spacing={0.5} sx={{ px: 0.25 }}>
                <Typography variant="body2" color="text.secondary">
                  Current stock{' '}
                  <Typography component="span" sx={{ ...numericSx, fontSize: 'inherit', color: 'text.primary' }}>
                    {formatQuantity(ingredient.stockQuantity, ingredient.unit)}
                  </Typography>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Counted stock{' '}
                  <Typography component="span" sx={{ ...numericSx, fontSize: 'inherit', color: 'text.primary' }}>
                    {formatQuantity(amount, ingredient.unit)}
                  </Typography>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Difference{' '}
                  <Typography component="span" sx={{ ...numericSx, fontSize: 'inherit', color: 'text.primary' }}>
                    {formatSignedDelta(amount - ingredient.stockQuantity, ingredient.unit)}
                  </Typography>
                </Typography>
              </Stack>
            ) : null}

            <TextField
              label="Reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Supplier delivery, waste, stock count…"
              fullWidth
            />
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleConfirm} disabled={saving || !ingredient}>
          {saving ? 'Saving' : 'Save adjustment'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
