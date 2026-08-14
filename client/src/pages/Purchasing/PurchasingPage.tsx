import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AddRounded as AddIcon } from '@mui/icons-material'
import { Box, Button, Stack, Tab, Tabs, Table, TableBody, TableCell, TableHead, TableRow, TextField } from '@mui/material'
import { getErrorMessage } from '../../api/error'
import { listIngredients } from '../../api/ingredients'
import { cancelPurchaseOrder, createPurchaseOrder, listPurchaseOrders, listPurchaseReceipts, orderPurchaseOrder, receivePurchaseOrder, type PurchaseOrder, type PurchaseOrderPayload, type PurchaseReceipt, type ReceivePayload } from '../../api/purchasing'
import { archiveSupplier, createSupplier, listSuppliers, restoreSupplier, type Supplier } from '../../api/suppliers'
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
export const PurchasingPage = () => {
  const { showSnackbar } = useAppSnackbar(); const location = useLocation(); const prefill = (location.state as { prefill?: { ingredientId?: string; quantity?: number | null; supplierId?: string } } | null)?.prefill
  const [tab, setTab] = useState<TabKey>('orders'); const [orders, setOrders] = useState<PurchaseOrder[]>([]); const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]); const [suppliers, setSuppliers] = useState<Supplier[]>([]); const [ingredients, setIngredients] = useState<Ingredient[]>([]); const [draftOpen, setDraftOpen] = useState(false); const [details, setDetails] = useState<PurchaseOrder | null>(null); const [receiving, setReceiving] = useState<PurchaseOrder | null>(null); const [saving, setSaving] = useState(false); const [supplierName, setSupplierName] = useState('')
  const load = useCallback(async () => { try { const [ordersResponse, supplierResponse, receiptResponse] = await Promise.all([listPurchaseOrders({ limit: 100 }), listSuppliers({ includeInactive: true, limit: 100 }), listPurchaseReceipts({ limit: 100 })]); setOrders(ordersResponse.items); setSuppliers(supplierResponse.items); setReceipts(receiptResponse.items) } catch (error) { showSnackbar(getErrorMessage(error, 'Failed to load purchasing'), { severity: 'error' }) } }, [showSnackbar])
  useEffect(() => { void load() }, [load]); useEffect(() => { void (async () => { const catalog: Ingredient[] = []; let page = 1; let totalPages = 1; try { do { const response = await listIngredients({ page, limit: 100, sortBy: 'name', sortOrder: 'asc' }); catalog.push(...response.items); totalPages = response.pagination.totalPages; page += 1 } while (page <= totalPages); setIngredients(catalog) } catch { setIngredients([]) } })() }, [])
  useEffect(() => { if (prefill) setDraftOpen(true) }, [prefill])
  const draftInitial: Partial<PurchaseOrderPayload> | undefined = prefill ? { supplierId: prefill.supplierId, items: prefill.ingredientId ? [{ ingredientId: prefill.ingredientId, orderedQuantity: prefill.quantity ?? 0, expectedUnitCost: 0 }] : [] } : undefined
  const saveDraft = async (payload: PurchaseOrderPayload) => { setSaving(true); try { await createPurchaseOrder(payload); setDraftOpen(false); showSnackbar('Draft purchase order created', { severity: 'success' }); await load() } catch (error) { showSnackbar(getErrorMessage(error, 'Failed to create purchase order'), { severity: 'error' }) } finally { setSaving(false) } }
  const applyOrderAction = async (fn: () => Promise<PurchaseOrder>, success: string) => { setSaving(true); try { await fn(); setDetails(null); showSnackbar(success, { severity: 'success' }); await load() } catch (error) { showSnackbar(getErrorMessage(error, 'Purchase order action failed'), { severity: 'error' }) } finally { setSaving(false) } }
  const saveReceipt = async (payload: ReceivePayload) => { if (!receiving) return; setSaving(true); try { await receivePurchaseOrder(receiving._id, payload); setReceiving(null); setDetails(null); showSnackbar('Purchase receipt recorded', { severity: 'success' }); await load() } catch (error) { showSnackbar(getErrorMessage(error, 'Failed to receive purchase order'), { severity: 'error' }) } finally { setSaving(false) } }
  const addSupplier = async () => { if (!supplierName.trim()) return; try { await createSupplier({ name: supplierName.trim() }); setSupplierName(''); await load(); showSnackbar('Supplier added', { severity: 'success' }) } catch (error) { showSnackbar(getErrorMessage(error, 'Failed to add supplier'), { severity: 'error' }) } }
  return <Box>
<LedgerPageHeader title="Purchasing" subtitle="Create controlled purchase orders, receive stock, and retain receipt history." actions={tab === 'orders' ? <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDraftOpen(true)}>New purchase order</Button> : undefined} />
<Tabs value={tab} onChange={(_event, value) => setTab(value)} sx={{ mb: 2 }}>
<Tab value="orders" label="Purchase Orders" />
<Tab value="suppliers" label="Suppliers" />
<Tab value="receipts" label="Receipts" />
</Tabs>{tab === 'orders' ? <LedgerTableContainer>
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
<TableBody>{orders.map((order) => { const expected = order.items.reduce((total, item) => total + item.orderedQuantity * item.expectedUnitCost, 0); return <TableRow hover key={order._id} onClick={() => setDetails(order)} sx={{ cursor: 'pointer' }}>
<TableCell>{order.orderNumber}</TableCell>
<TableCell>{order.supplierNameSnapshot}</TableCell>
<TableCell>{order.status}</TableCell>
<TableCell>{order.orderedAt ? new Date(order.orderedAt).toLocaleDateString() : '-'}</TableCell>
<TableCell>{order.expectedAt ? new Date(order.expectedAt).toLocaleDateString() : '-'}</TableCell>
<TableCell align="right">{formatNumber(order.items.reduce((sum, item) => sum + item.receivedQuantity, 0))} / {formatNumber(order.items.reduce((sum, item) => sum + item.orderedQuantity, 0))}</TableCell>
<TableCell align="right">{formatNumber(expected, 2)}</TableCell>
</TableRow> })}</TableBody>
</Table>{!orders.length ? <LedgerEmptyState title="No purchase orders" description="Create a draft from planning or start a new order." /> : null}</LedgerTableContainer> : null}{tab === 'suppliers' ? <Stack spacing={2}>
<Stack direction="row" spacing={1}>
<TextField size="small" label="Supplier name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
<Button variant="contained" onClick={() => void addSupplier()}>Add supplier</Button>
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
<TableBody>{suppliers.map((supplier) => <TableRow key={supplier._id}>
<TableCell>{supplier.name}</TableCell>
<TableCell>{supplier.contactName || supplier.email || supplier.phone || '-'}</TableCell>
<TableCell>{supplier.isActive ? 'Active' : 'Archived'}</TableCell>
<TableCell align="right">
<Button size="small" onClick={() => void (supplier.isActive ? archiveSupplier(supplier._id) : restoreSupplier(supplier._id)).then(load)}> {supplier.isActive ? 'Archive' : 'Restore'} </Button>
</TableCell>
</TableRow>)}</TableBody>
</Table>
</LedgerTableContainer>
</Stack> : null}{tab === 'receipts' ? <LedgerTableContainer>
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
<TableBody>{receipts.map((receipt) => <TableRow key={receipt._id}>
<TableCell>{new Date(receipt.receivedAt).toLocaleString()}</TableCell>
<TableCell>{receipt.orderNumberSnapshot}</TableCell>
<TableCell>{receipt.supplierNameSnapshot}</TableCell>
<TableCell align="right">{formatNumber(receipt.totalValue, 2)}</TableCell>
<TableCell>{receipt.operationId}</TableCell>
</TableRow>)}</TableBody>
</Table>
</LedgerTableContainer> : null}{draftOpen ? <PurchaseOrderDialog open suppliers={suppliers.filter((supplier) => supplier.isActive)} ingredients={ingredients} initial={draftInitial} saving={saving} onClose={() => setDraftOpen(false)} onSave={(payload) => void saveDraft(payload)} /> : null}
<PurchaseOrderDetailsDialog order={details} onClose={() => setDetails(null)} onOrder={() => details ? void applyOrderAction(() => orderPurchaseOrder(details._id), 'Purchase order marked ordered') : undefined} onCancel={() => details ? void applyOrderAction(() => cancelPurchaseOrder(details._id), 'Purchase order cancelled') : undefined} onReceive={() => { setReceiving(details); setDetails(null) }} />
{receiving ? <ReceivePurchaseOrderDialog open order={receiving} saving={saving} onClose={() => setReceiving(null)} onSave={(payload) => void saveReceipt(payload)} /> : null}
</Box>
}
