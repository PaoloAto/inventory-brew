import { useMemo, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Stack, TextField, Typography } from '@mui/material'
import type { PurchaseOrder, ReceivePayload } from '../../api/purchasing'
import { formatNumber } from '../ui/formatters'

interface Props {
  open: boolean
  order: PurchaseOrder
  saving?: boolean
  onClose: () => void
  onSave: (payload: ReceivePayload) => void
}

type ReceiptLine = { id: string; quantity: number; unitCost: number }

export const ReceivePurchaseOrderDialog = ({ open, order, saving, onClose, onSave }: Props) => {
  const defaults = useMemo<ReceiptLine[]>(
    () => order.items.filter((item) => item.remainingQuantity > 0).map((item) => ({ id: item._id, quantity: item.remainingQuantity, unitCost: item.expectedUnitCost })),
    [order],
  )
  const [edits, setEdits] = useState<ReceiptLine[]>([])
  const lines = edits.length ? edits : defaults
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0)
  const update = (id: string, change: (line: ReceiptLine) => ReceiptLine) => setEdits((previous) => (previous.length ? previous : defaults).map((line) => line.id === id ? change(line) : line))

  return <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm"><DialogTitle>Receive {order.orderNumber}</DialogTitle><DialogContent dividers><Stack spacing={1.5}>{order.items.filter((item) => item.remainingQuantity > 0).map((item) => { const line = lines.find((entry) => entry.id === item._id)!; return <Grid container spacing={1} key={item._id}><Grid size={{ xs: 12 }}><Typography variant="body2" fontWeight={500}>{item.ingredientNameSnapshot} · {item.remainingQuantity} {item.unit} remaining</Typography></Grid><Grid size={{ xs: 6 }}><TextField fullWidth type="number" label="Receive now" value={line.quantity} inputProps={{ min: 0, max: item.remainingQuantity, step: 'any' }} onChange={(event) => update(item._id, (entry) => ({ ...entry, quantity: Math.min(item.remainingQuantity, Math.max(0, Number(event.target.value))) }))} /></Grid><Grid size={{ xs: 6 }}><TextField fullWidth type="number" label="Actual unit cost" value={line.unitCost} inputProps={{ min: 0, step: 'any' }} onChange={(event) => update(item._id, (entry) => ({ ...entry, unitCost: Number(event.target.value) }))} /></Grid></Grid> })}<Typography variant="body2" color="text.secondary">Receipt value: {formatNumber(total, 2)}</Typography></Stack></DialogContent><DialogActions><Button onClick={onClose} disabled={saving}>Cancel</Button><Button variant="contained" disabled={saving || !lines.some((line) => line.quantity > 0)} onClick={() => onSave({ items: lines.filter((line) => line.quantity > 0).map((line) => ({ purchaseOrderItemId: line.id, quantity: line.quantity, unitCost: line.unitCost })) })}>{saving ? 'Receiving' : 'Record receipt'}</Button></DialogActions></Dialog>
}
