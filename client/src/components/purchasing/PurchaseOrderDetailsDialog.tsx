import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type { PurchaseOrder } from '../../api/purchasing'
import { formatNumber, formatQuantity } from '../ui/formatters'

interface Props {
  order: PurchaseOrder | null
  onClose: () => void
  onEdit: () => void
  onOrder: () => void
  onCancel: () => void
  onReceive: () => void
}

export const PurchaseOrderDetailsDialog = ({
  order,
  onClose,
  onEdit,
  onOrder,
  onCancel,
  onReceive,
}: Props) => {
  if (!order) return null
  const mayCancel = order.status === 'DRAFT' || order.status === 'ORDERED'

  return (
    <Dialog open fullWidth maxWidth="md" onClose={onClose}>
      <DialogTitle>{order.orderNumber}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            {order.supplierNameSnapshot} · {order.status}
          </Typography>
          {order.expectedAt ? (
            <Typography variant="body2">Expected {new Date(order.expectedAt).toLocaleDateString()}</Typography>
          ) : null}
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Ingredient</TableCell>
                <TableCell align="right">Ordered</TableCell>
                <TableCell align="right">Received</TableCell>
                <TableCell align="right">Remaining</TableCell>
                <TableCell align="right">Expected cost</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item._id}>
                  <TableCell>{item.ingredientNameSnapshot}</TableCell>
                  <TableCell align="right">{formatQuantity(item.orderedQuantity, item.unit)}</TableCell>
                  <TableCell align="right">{formatQuantity(item.receivedQuantity, item.unit)}</TableCell>
                  <TableCell align="right">{formatQuantity(item.remainingQuantity, item.unit)}</TableCell>
                  <TableCell align="right">{formatNumber(item.expectedUnitCost, 2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {order.notes ? <Typography variant="body2">{order.notes}</Typography> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        {order.status === 'DRAFT' ? <Button onClick={onEdit}>Edit</Button> : null}
        {order.status === 'DRAFT' ? <Button onClick={onOrder}>Mark ordered</Button> : null}
        {['ORDERED', 'PARTIALLY_RECEIVED'].includes(order.status) ? (
          <Button variant="contained" onClick={onReceive}>Receive</Button>
        ) : null}
        {mayCancel ? <Button color="error" onClick={onCancel}>Cancel order</Button> : null}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
