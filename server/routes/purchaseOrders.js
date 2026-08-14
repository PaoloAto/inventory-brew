const express = require('express')
const crypto = require('crypto')
const mongoose = require('mongoose')
const PurchaseOrder = require('../models/PurchaseOrder')
const Supplier = require('../models/Supplier')
const Ingredient = require('../models/Ingredient')
const { receivePurchaseOrder } = require('../services/purchasingService')
const { isTransactionUnsupportedError } = require('../services/inventoryService')

const router = express.Router()
const MAX_LIMIT = 100
const sendError = (res, status, code, message, details) => res.status(status).json({ error: { code, message, ...(details?.length ? { details } : {}) } })
const validId = (res, id, label = 'purchase order') => mongoose.isValidObjectId(id) || (sendError(res, 400, 'INVALID_ID', `Invalid ${label} id`), false)
const escapeRegExp = (input) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const parsePositiveInt = (value, fallback, max) => { if (value === undefined) return fallback; const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 1 && (!max || parsed <= max) ? parsed : null }
const formatOrder = (order) => ({
  ...order.toObject ? order.toObject() : order,
  items: order.items.map((item) => ({ ...(item.toObject ? item.toObject() : item), remainingQuantity: Math.max(0, item.orderedQuantity - item.receivedQuantity) })),
})
const orderNumber = () => `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`

const validateDraft = async (payload) => {
  const allowed = new Set(['supplierId', 'expectedAt', 'notes', 'items'])
  const details = Object.keys(payload || {}).filter((field) => !allowed.has(field)).map((field) => `Unknown field: ${field}`)
  if (!mongoose.isValidObjectId(payload.supplierId)) details.push('supplierId must be a valid supplier id')
  if (!Array.isArray(payload.items) || payload.items.length === 0) details.push('items must contain at least one line')
  const expectedAt = payload.expectedAt === undefined || payload.expectedAt === '' ? undefined : new Date(payload.expectedAt)
  if (expectedAt && Number.isNaN(expectedAt.getTime())) details.push('expectedAt must be a valid date')
  const notes = payload.notes === undefined ? '' : typeof payload.notes === 'string' ? payload.notes.trim() : (details.push('notes must be a string'), '')
  const ids = new Set()
  const rawLines = []
  for (const line of payload.items || []) {
    if (!line || typeof line !== 'object') { details.push('Each item must be an object'); continue }
    const unknown = Object.keys(line).filter((field) => !['ingredientId', 'orderedQuantity', 'expectedUnitCost'].includes(field))
    if (unknown.length) details.push(`Unknown item field(s): ${unknown.join(', ')}`)
    if (!mongoose.isValidObjectId(line.ingredientId)) { details.push('ingredientId must be a valid ingredient id'); continue }
    if (ids.has(String(line.ingredientId))) details.push('Duplicate ingredient lines are not allowed')
    ids.add(String(line.ingredientId))
    const orderedQuantity = Number(line.orderedQuantity); const expectedUnitCost = Number(line.expectedUnitCost)
    if (!Number.isFinite(orderedQuantity) || orderedQuantity <= 0) details.push('orderedQuantity must be a positive number')
    if (!Number.isFinite(expectedUnitCost) || expectedUnitCost < 0) details.push('expectedUnitCost must be a non-negative number')
    rawLines.push({ ingredientId: line.ingredientId, orderedQuantity, expectedUnitCost })
  }
  if (details.length) return { details }
  const [supplier, ingredients] = await Promise.all([Supplier.findById(payload.supplierId).lean(), Ingredient.find({ _id: { $in: rawLines.map((line) => line.ingredientId) }, isActive: true }).lean()])
  if (!supplier) details.push('Supplier not found')
  else if (!supplier.isActive) details.push('Supplier must be active')
  if (ingredients.length !== rawLines.length) details.push('All purchase order ingredients must exist and be active')
  if (details.length) return { details }
  const ingredientMap = new Map(ingredients.map((ingredient) => [String(ingredient._id), ingredient]))
  return { value: { supplier, expectedAt, notes, items: rawLines.map((line) => ({ ...line, ingredient: ingredientMap.get(String(line.ingredientId)) })) } }
}

router.get('/', async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1); const limit = parsePositiveInt(req.query.limit, 20, MAX_LIMIT)
    if (!page || !limit) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase order query', ['page and limit must be positive integers; limit up to 100'])
    const filter = {}
    if (req.query.supplierId) { if (!mongoose.isValidObjectId(req.query.supplierId)) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase order query', ['supplierId must be valid']); filter.supplierId = req.query.supplierId }
    if (req.query.status) { if (!['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'].includes(req.query.status)) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase order query', ['Invalid status']); filter.status = req.query.status }
    const search = String(req.query.search || '').trim(); if (search) filter.$or = [{ orderNumber: new RegExp(escapeRegExp(search), 'i') }, { supplierNameSnapshot: new RegExp(escapeRegExp(search), 'i') }]
    const dateFilter = {}; if (req.query.dateFrom) dateFilter.$gte = new Date(req.query.dateFrom); if (req.query.dateTo) dateFilter.$lte = new Date(req.query.dateTo); if (Object.keys(dateFilter).length) { if (Object.values(dateFilter).some((date) => Number.isNaN(date.getTime()))) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase order query', ['Invalid date range']); filter.createdAt = dateFilter }
    const direction = req.query.sortOrder === 'asc' ? 1 : req.query.sortOrder === 'desc' || req.query.sortOrder === undefined ? -1 : null; if (!direction) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase order query', ['sortOrder must be asc or desc'])
    const [items, total] = await Promise.all([PurchaseOrder.find(filter).sort({ createdAt: direction }).skip((page - 1) * limit).limit(limit), PurchaseOrder.countDocuments(filter)])
    return res.json({ items: items.map(formatOrder), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } })
  } catch (error) { console.error('Error listing purchase orders:', error); return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch purchase orders') }
})
router.get('/:id', async (req, res) => { try { if (!validId(res, req.params.id)) return; const order = await PurchaseOrder.findById(req.params.id); if (!order) return sendError(res, 404, 'NOT_FOUND', 'Purchase order not found'); return res.json(formatOrder(order)) } catch (error) { console.error('Error fetching purchase order:', error); return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch purchase order') } })
router.post('/', async (req, res) => {
  try { const parsed = await validateDraft(req.body || {}); if (parsed.details) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase order payload', parsed.details); const { supplier, expectedAt, notes, items } = parsed.value; const order = await PurchaseOrder.create({ orderNumber: orderNumber(), supplierId: supplier._id, supplierNameSnapshot: supplier.name, expectedAt, notes, status: 'DRAFT', items: items.map((line) => ({ ingredientId: line.ingredient._id, ingredientNameSnapshot: line.ingredient.name, unit: line.ingredient.unit, orderedQuantity: line.orderedQuantity, receivedQuantity: 0, expectedUnitCost: line.expectedUnitCost })) }); return res.status(201).json(formatOrder(order)) } catch (error) { console.error('Error creating purchase order:', error); return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to create purchase order') }
})
router.put('/:id', async (req, res) => {
  try { if (!validId(res, req.params.id)) return; const current = await PurchaseOrder.findById(req.params.id); if (!current) return sendError(res, 404, 'NOT_FOUND', 'Purchase order not found'); if (current.status !== 'DRAFT') return sendError(res, 409, 'INVALID_PO_STATE', 'Only draft purchase orders can be edited'); const parsed = await validateDraft(req.body || {}); if (parsed.details) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase order payload', parsed.details); const { supplier, expectedAt, notes, items } = parsed.value; current.supplierId = supplier._id; current.supplierNameSnapshot = supplier.name; current.expectedAt = expectedAt; current.notes = notes; current.items = items.map((line) => ({ ingredientId: line.ingredient._id, ingredientNameSnapshot: line.ingredient.name, unit: line.ingredient.unit, orderedQuantity: line.orderedQuantity, receivedQuantity: 0, expectedUnitCost: line.expectedUnitCost })); await current.save(); return res.json(formatOrder(current)) } catch (error) { console.error('Error updating purchase order:', error); return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to update purchase order') }
})
router.post('/:id/order', async (req, res) => { try { if (!validId(res, req.params.id)) return; const order = await PurchaseOrder.findById(req.params.id); if (!order) return sendError(res, 404, 'NOT_FOUND', 'Purchase order not found'); if (order.status !== 'DRAFT') return sendError(res, 409, 'INVALID_PO_STATE', 'Only draft purchase orders can be ordered'); order.status = 'ORDERED'; order.orderedAt = new Date(); await order.save(); return res.json(formatOrder(order)) } catch (error) { console.error('Error ordering purchase order:', error); return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to order purchase order') } })
router.post('/:id/cancel', async (req, res) => { try { if (!validId(res, req.params.id)) return; const order = await PurchaseOrder.findById(req.params.id); if (!order) return sendError(res, 404, 'NOT_FOUND', 'Purchase order not found'); if (!['DRAFT', 'ORDERED'].includes(order.status) || order.items.some((item) => item.receivedQuantity > 0)) return sendError(res, 409, 'INVALID_PO_STATE', 'Only unreceived draft or ordered purchase orders can be cancelled'); order.status = 'CANCELLED'; order.cancelledAt = new Date(); await order.save(); return res.json(formatOrder(order)) } catch (error) { console.error('Error cancelling purchase order:', error); return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to cancel purchase order') } })
router.post('/:id/receive', async (req, res) => {
  try {
    if (!validId(res, req.params.id)) return
    const body = req.body || {}; const details = []; if (Object.keys(body).some((field) => field !== 'items')) details.push('Only items is allowed'); if (!Array.isArray(body.items) || !body.items.length) details.push('items must contain at least one receipt line')
    const seen = new Set(); const items = []
    for (const line of body.items || []) { const id = String(line?.purchaseOrderItemId || ''); const quantity = Number(line?.quantity); const unitCost = Number(line?.unitCost); if (!mongoose.isValidObjectId(id)) details.push('purchaseOrderItemId must be valid'); else if (seen.has(id)) details.push('Duplicate purchase order item lines are not allowed'); else seen.add(id); if (!Number.isFinite(quantity) || quantity <= 0) details.push('quantity must be a positive number'); if (!Number.isFinite(unitCost) || unitCost < 0) details.push('unitCost must be a non-negative number'); items.push({ purchaseOrderItemId: id, quantity, unitCost }) }
    if (details.length) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase receipt payload', details)
    const result = await receivePurchaseOrder({ purchaseOrderId: req.params.id, receiptItems: items })
    return res.json({ message: 'Purchase order received', purchaseOrder: formatOrder(result.purchaseOrder), purchaseReceipt: result.purchaseReceipt, transactionsCreated: result.transactions.length, operationId: result.operationId })
  } catch (error) { if (error?.isAppError) return sendError(res, error.status, error.code, error.message, error.details); if (isTransactionUnsupportedError(error)) return sendError(res, 503, 'TRANSACTIONS_UNAVAILABLE', 'Purchase receiving requires MongoDB transaction support.'); console.error('Error receiving purchase order:', error); return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to receive purchase order') }
})

module.exports = router
