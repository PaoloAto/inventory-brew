import { useCallback, useEffect, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import {
  Box,
  Button,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
} from '@mui/material'
import { useLocation } from 'react-router-dom'
import { getErrorCode, getErrorMessage } from '../../api/error'
import { listIngredients } from '../../api/ingredients'
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  listPurchaseOrders,
  listPurchaseReceipts,
  orderPurchaseOrder,
  receivePurchaseOrder,
  updatePurchaseOrder,
  type PurchaseOrder,
  type PurchaseOrderPayload,
  type PurchaseReceipt,
  type ReceivePayload,
} from '../../api/purchasing'
import {
  archiveSupplier,
  createSupplier,
  listSuppliers,
  restoreSupplier,
  type Supplier,
} from '../../api/suppliers'
import { PurchaseOrderDetailsDialog } from '../../components/purchasing/PurchaseOrderDetailsDialog'
import { PurchaseOrderDialog } from '../../components/purchasing/PurchaseOrderDialog'
import { ReceivePurchaseOrderDialog } from '../../components/purchasing/ReceivePurchaseOrderDialog'
import { LedgerEmptyState } from '../../components/ui/LedgerEmptyState'
import { LedgerPageHeader } from '../../components/ui/LedgerPageHeader'
import { LedgerTableContainer } from '../../components/ui/LedgerTableContainer'
import { formatNumber } from '../../components/ui/formatters'
import { useAppSnackbar } from '../../context/snackbarContext'
import type { Ingredient } from '../../types/ingredient'

type TabKey = 'orders' | 'suppliers' | 'receipts'
type DraftContext = {
  mode: 'create' | 'edit'
  orderId?: string
  initial?: Partial<PurchaseOrderPayload>
}

export const PurchasingPage = () => {
  const { showSnackbar } = useAppSnackbar()
  const location = useLocation()
  const prefill = (
    location.state as {
      prefill?: { ingredientId?: string; quantity?: number | null; supplierId?: string }
    } | null
  )?.prefill

  const planningInitial: Partial<PurchaseOrderPayload> | undefined = prefill
    ? {
        supplierId: prefill.supplierId,
        items: prefill.ingredientId
          ? [{
              ingredientId: prefill.ingredientId,
              orderedQuantity: prefill.quantity ?? 0,
              expectedUnitCost: 0,
            }]
          : [],
      }
    : undefined

  const [tab, setTab] = useState<TabKey>('orders')
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [poPage, setPoPage] = useState(0)
  const [poRowsPerPage, setPoRowsPerPage] = useState(20)
  const [poTotal, setPoTotal] = useState(0)
  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([])
  const [receiptPage, setReceiptPage] = useState(0)
  const [receiptRowsPerPage, setReceiptRowsPerPage] = useState(20)
  const [receiptTotal, setReceiptTotal] = useState(0)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [draftContext, setDraftContext] = useState<DraftContext | null>(() =>
    planningInitial ? { mode: 'create', initial: planningInitial } : null,
  )
  const [details, setDetails] = useState<PurchaseOrder | null>(null)
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null)
  const [saving, setSaving] = useState(false)
  const [supplierName, setSupplierName] = useState('')

  const loadOrders = useCallback(async () => {
    try {
      const response = await listPurchaseOrders({
        page: poPage + 1,
        limit: poRowsPerPage,
      })
      if (response.items.length === 0 && poPage > 0 && response.pagination.total > 0) {
        setPoPage((previous) => Math.max(0, previous - 1))
        return
      }
      setOrders(response.items)
      setPoTotal(response.pagination.total)
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load purchase orders'), { severity: 'error' })
    }
  }, [poPage, poRowsPerPage, showSnackbar])

  const loadReceipts = useCallback(async () => {
    try {
      const response = await listPurchaseReceipts({
        page: receiptPage + 1,
        limit: receiptRowsPerPage,
      })
      if (response.items.length === 0 && receiptPage > 0 && response.pagination.total > 0) {
        setReceiptPage((previous) => Math.max(0, previous - 1))
        return
      }
      setReceipts(response.items)
      setReceiptTotal(response.pagination.total)
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load purchase receipts'), { severity: 'error' })
    }
  }, [receiptPage, receiptRowsPerPage, showSnackbar])

  const loadSupplierCatalog = useCallback(async () => {
    const catalog: Supplier[] = []
    let supplierPage = 1
    let totalPages = 1
    try {
      do {
        const response = await listSuppliers({
          includeInactive: true,
          page: supplierPage,
          limit: 100,
          sortOrder: 'asc',
        })
        catalog.push(...response.items)
        totalPages = response.pagination.totalPages
        supplierPage += 1
      } while (supplierPage <= totalPages)
      setSuppliers(catalog)
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load suppliers'), { severity: 'error' })
    }
  }, [showSnackbar])

  useEffect(() => { void loadOrders() }, [loadOrders])
  useEffect(() => { void loadReceipts() }, [loadReceipts])
  useEffect(() => { void loadSupplierCatalog() }, [loadSupplierCatalog])
  useEffect(() => {
    void (async () => {
      const catalog: Ingredient[] = []
      let ingredientPage = 1
      let totalPages = 1
      try {
        do {
          const response = await listIngredients({
            page: ingredientPage,
            limit: 100,
            sortBy: 'name',
            sortOrder: 'asc',
          })
          catalog.push(...response.items)
          totalPages = response.pagination.totalPages
          ingredientPage += 1
        } while (ingredientPage <= totalPages)
        setIngredients(catalog)
      } catch (error) {
        showSnackbar(getErrorMessage(error, 'Failed to load ingredient catalog'), { severity: 'error' })
      }
    })()
  }, [showSnackbar])

  const handleSaveDraft = async (payload: PurchaseOrderPayload) => {
    if (!draftContext) return
    setSaving(true)
    try {
      if (draftContext.mode === 'edit' && draftContext.orderId) {
        await updatePurchaseOrder(draftContext.orderId, payload)
        showSnackbar('Draft purchase order updated', { severity: 'success' })
      } else {
        await createPurchaseOrder(payload)
        showSnackbar('Draft purchase order created', { severity: 'success' })
      }
      setDraftContext(null)
      setDetails(null)
      await loadOrders()
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to save purchase order'), { severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const applyOrderAction = async (action: () => Promise<PurchaseOrder>, success: string) => {
    setSaving(true)
    try {
      await action()
      setDetails(null)
      showSnackbar(success, { severity: 'success' })
      await loadOrders()
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Purchase order action failed'), { severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleReceipt = async (payload: ReceivePayload) => {
    if (!receiving) return
    setSaving(true)
    try {
      await receivePurchaseOrder(receiving._id, payload)
      setReceiving(null)
      setDetails(null)
      showSnackbar('Purchase receipt recorded', { severity: 'success' })
      await Promise.all([loadOrders(), loadReceipts()])
    } catch (error) {
      if (getErrorCode(error) === 'RECEIPT_CONFLICT') {
        setReceiving(null)
        setDetails(null)
        await Promise.all([loadOrders(), loadReceipts()])
        showSnackbar('Purchase order changed while you were receiving it. Current quantities have been refreshed.', {
          severity: 'warning',
        })
        return
      }
      showSnackbar(getErrorMessage(error, 'Failed to receive purchase order'), { severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleAddSupplier = async () => {
    if (!supplierName.trim()) return
    try {
      await createSupplier({ name: supplierName.trim() })
      setSupplierName('')
      await loadSupplierCatalog()
      showSnackbar('Supplier added', { severity: 'success' })
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to add supplier'), { severity: 'error' })
    }
  }

  const handleSupplierActiveState = async (supplier: Supplier) => {
    try {
      if (supplier.isActive) {
        await archiveSupplier(supplier._id)
        showSnackbar('Supplier archived', { severity: 'success' })
      } else {
        await restoreSupplier(supplier._id)
        showSnackbar('Supplier restored', { severity: 'success' })
      }
      await loadSupplierCatalog()
    } catch (error) {
      showSnackbar(
        getErrorMessage(error, supplier.isActive ? 'Failed to archive supplier' : 'Failed to restore supplier'),
        { severity: 'error' },
      )
    }
  }

  return (
    <Box>
      <LedgerPageHeader
        title="Purchasing"
        subtitle="Create controlled purchase orders, receive stock, and retain receipt history."
        actions={
          tab === 'orders' ? (
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={() => setDraftContext({ mode: 'create' })}
            >
              New purchase order
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onChange={(_event, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab value="orders" label="Purchase Orders" />
        <Tab value="suppliers" label="Suppliers" />
        <Tab value="receipts" label="Receipts" />
      </Tabs>

      {tab === 'orders' ? (
        <>
          <LedgerTableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>PO</TableCell>
                  <TableCell>Supplier</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Order date</TableCell>
                  <TableCell>Expected</TableCell>
                  <TableCell align="right">Received progress</TableCell>
                  <TableCell align="right">Expected value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order) => {
                  const expectedValue = order.items.reduce(
                    (total, item) => total + item.orderedQuantity * item.expectedUnitCost,
                    0,
                  )
                  const completedLines = order.items.filter(
                    (item) => item.remainingQuantity === 0,
                  ).length
                  return (
                    <TableRow
                      hover
                      key={order._id}
                      onClick={() => setDetails(order)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>{order.orderNumber}</TableCell>
                      <TableCell>{order.supplierNameSnapshot}</TableCell>
                      <TableCell>{order.status}</TableCell>
                      <TableCell>{order.orderedAt ? new Date(order.orderedAt).toLocaleDateString() : '-'}</TableCell>
                      <TableCell>{order.expectedAt ? new Date(order.expectedAt).toLocaleDateString() : '-'}</TableCell>
                      <TableCell align="right">{completedLines} / {order.items.length} lines</TableCell>
                      <TableCell align="right">{formatNumber(expectedValue, 2)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {!orders.length ? (
              <LedgerEmptyState
                title="No purchase orders"
                description="Create a draft from planning or start a new order."
              />
            ) : null}
          </LedgerTableContainer>
          <TablePagination
            component="div"
            count={poTotal}
            page={poPage}
            onPageChange={(_event, nextPage) => setPoPage(nextPage)}
            rowsPerPage={poRowsPerPage}
            onRowsPerPageChange={(event) => {
              setPoRowsPerPage(Number(event.target.value))
              setPoPage(0)
            }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </>
      ) : null}

      {tab === 'suppliers' ? (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              label="Supplier name"
              value={supplierName}
              onChange={(event) => setSupplierName(event.target.value)}
            />
            <Button variant="contained" onClick={() => void handleAddSupplier()}>Add supplier</Button>
          </Stack>
          <LedgerTableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Contact</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier._id}>
                    <TableCell>{supplier.name}</TableCell>
                    <TableCell>{supplier.contactName || supplier.email || supplier.phone || '-'}</TableCell>
                    <TableCell>{supplier.isActive ? 'Active' : 'Archived'}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => void handleSupplierActiveState(supplier)}>
                        {supplier.isActive ? 'Archive' : 'Restore'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </LedgerTableContainer>
        </Stack>
      ) : null}

      {tab === 'receipts' ? (
        <>
          <LedgerTableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date/time</TableCell>
                  <TableCell>PO</TableCell>
                  <TableCell>Supplier</TableCell>
                  <TableCell align="right">Value</TableCell>
                  <TableCell>Operation ID</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {receipts.map((receipt) => (
                  <TableRow key={receipt._id}>
                    <TableCell>{new Date(receipt.receivedAt).toLocaleString()}</TableCell>
                    <TableCell>{receipt.orderNumberSnapshot}</TableCell>
                    <TableCell>{receipt.supplierNameSnapshot}</TableCell>
                    <TableCell align="right">{formatNumber(receipt.totalValue, 2)}</TableCell>
                    <TableCell>{receipt.operationId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </LedgerTableContainer>
          <TablePagination
            component="div"
            count={receiptTotal}
            page={receiptPage}
            onPageChange={(_event, nextPage) => setReceiptPage(nextPage)}
            rowsPerPage={receiptRowsPerPage}
            onRowsPerPageChange={(event) => {
              setReceiptRowsPerPage(Number(event.target.value))
              setReceiptPage(0)
            }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </>
      ) : null}

      {draftContext ? (
        <PurchaseOrderDialog
          key={`${draftContext.mode}-${draftContext.orderId || 'new'}`}
          open
          mode={draftContext.mode}
          suppliers={suppliers.filter((supplier) => supplier.isActive)}
          ingredients={ingredients}
          initial={draftContext.initial}
          saving={saving}
          onClose={() => setDraftContext(null)}
          onSave={(payload) => void handleSaveDraft(payload)}
        />
      ) : null}
      <PurchaseOrderDetailsDialog
        order={details}
        onClose={() => setDetails(null)}
        onEdit={() => {
          if (!details) return
          setDraftContext({
            mode: 'edit',
            orderId: details._id,
            initial: {
              supplierId: details.supplierId,
              expectedAt: details.expectedAt,
              notes: details.notes,
              items: details.items.map((item) => ({
                ingredientId: item.ingredientId,
                orderedQuantity: item.orderedQuantity,
                expectedUnitCost: item.expectedUnitCost,
              })),
            },
          })
          setDetails(null)
        }}
        onOrder={() =>
          details
            ? void applyOrderAction(
                () => orderPurchaseOrder(details._id),
                'Purchase order marked ordered',
              )
            : undefined
        }
        onCancel={() =>
          details
            ? void applyOrderAction(
                () => cancelPurchaseOrder(details._id),
                'Purchase order cancelled',
              )
            : undefined
        }
        onReceive={() => {
          setReceiving(details)
          setDetails(null)
        }}
      />
      {receiving ? (
        <ReceivePurchaseOrderDialog
          key={receiving._id}
          open
          order={receiving}
          saving={saving}
          onClose={() => setReceiving(null)}
          onSave={(payload) => void handleReceipt(payload)}
        />
      ) : null}
    </Box>
  )
}
