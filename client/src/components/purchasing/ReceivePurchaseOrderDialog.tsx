import { useMemo, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { PurchaseOrder, ReceivePayload } from '../../api/purchasing'
import { formatNumber } from '../ui/formatters'

interface Props {
  open: boolean
  order: PurchaseOrder
  saving?: boolean
  onClose: () => void
  onSave: (payload: ReceivePayload) => void
}

type ReceiptLine = {
  id: string
  remaining: number
  quantity: string
  unitCost: string
}

const withinRemaining = (quantity: number, remaining: number) =>
  quantity <= remaining || Math.abs(quantity - remaining) <= 1e-9

export const ReceivePurchaseOrderDialog = ({
  open,
  order,
  saving,
  onClose,
  onSave,
}: Props) => {
  const [lines, setLines] = useState<ReceiptLine[]>(() =>
    order.items
      .filter((item) => item.remainingQuantity > 0)
      .map((item) => ({
        id: item._id,
        remaining: item.remainingQuantity,
        quantity: String(item.remainingQuantity),
        unitCost: String(item.expectedUnitCost),
      })),
  )
  const [validationMessage, setValidationMessage] = useState('')

  const parsedLines = useMemo(
    () =>
      lines.map((line) => ({
        ...line,
        parsedQuantity: line.quantity.trim() === '' ? null : Number(line.quantity),
        parsedUnitCost: line.unitCost.trim() === '' ? null : Number(line.unitCost),
      })),
    [lines],
  )

  const getValidationMessage = () => {
    let selectedLineCount = 0
    for (const line of parsedLines) {
      if (line.parsedQuantity === null || line.parsedQuantity === 0) continue
      if (!Number.isFinite(line.parsedQuantity) || line.parsedQuantity < 0) {
        return 'Enter a positive quantity for every receipt line.'
      }
      selectedLineCount += 1
      if (!withinRemaining(line.parsedQuantity, line.remaining)) {
        return 'Receive quantity cannot exceed the remaining order quantity.'
      }
      if (line.parsedUnitCost === null || !Number.isFinite(line.parsedUnitCost) || line.parsedUnitCost < 0) {
        return 'Enter an actual unit cost for each item being received. Zero is allowed.'
      }
    }
    return selectedLineCount === 0 ? 'No receipt quantities entered.' : ''
  }

  const currentValidation = getValidationMessage()
  const displayedValidation = validationMessage || currentValidation
  const receiptValue = parsedLines.reduce(
    (total, line) =>
      total +
      (line.parsedQuantity !== null && line.parsedQuantity > 0 && Number.isFinite(line.parsedQuantity) &&
      line.parsedUnitCost !== null && Number.isFinite(line.parsedUnitCost)
        ? line.parsedQuantity * line.parsedUnitCost
        : 0),
    0,
  )

  const updateLine = (id: string, field: 'quantity' | 'unitCost', value: string) => {
    setLines((previous) =>
      previous.map((line) => (line.id === id ? { ...line, [field]: value } : line)),
    )
    setValidationMessage('')
  }

  const handleSubmit = () => {
    const message = getValidationMessage()
    if (message) {
      setValidationMessage(message)
      return
    }
    onSave({
      items: parsedLines.filter((line) => line.parsedQuantity !== null && line.parsedQuantity > 0).map((line) => ({
        purchaseOrderItemId: line.id,
        quantity: line.parsedQuantity as number,
        unitCost: line.parsedUnitCost as number,
      })),
    })
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Receive {order.orderNumber}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {order.items
            .filter((item) => item.remainingQuantity > 0)
            .map((item) => {
              const line = lines.find((entry) => entry.id === item._id)!
              return (
                <Grid container spacing={1} key={item._id}>
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="body2" fontWeight={500}>
                      {item.ingredientNameSnapshot} · {item.remainingQuantity} {item.unit} remaining
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Receive now"
                      value={line.quantity}
                      inputProps={{ min: 0, max: item.remainingQuantity, step: 'any' }}
                      onChange={(event) => updateLine(item._id, 'quantity', event.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Actual unit cost"
                      value={line.unitCost}
                      inputProps={{ min: 0, step: 'any' }}
                      onChange={(event) => updateLine(item._id, 'unitCost', event.target.value)}
                    />
                  </Grid>
                </Grid>
              )
            })}
          <Typography variant="body2" color="text.secondary">
            Receipt value: {formatNumber(receiptValue, 2)}
          </Typography>
          {displayedValidation ? (
            <Typography variant="body2" color="error">
              {displayedValidation}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          disabled={saving || Boolean(currentValidation)}
          onClick={handleSubmit}
        >
          {saving ? 'Receiving' : 'Record receipt'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
