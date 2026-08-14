const express = require('express')
const mongoose = require('mongoose')
const PurchaseReceipt = require('../models/PurchaseReceipt')
const router = express.Router()
const sendError = (res, status, code, message, details) => res.status(status).json({ error: { code, message, ...(details?.length ? { details } : {}) } })
const positiveInt = (value, fallback, max) => { if (value === undefined) return fallback; const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 1 && (!max || parsed <= max) ? parsed : null }
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const parseDate = (value, boundary) => {
  if (!value) return undefined
  const normalized = String(value).trim()
  const dateOnly = DATE_ONLY_PATTERN.test(normalized)
  const date = new Date(dateOnly ? `${normalized}T${boundary === 'end' ? '23:59:59.999' : '00:00:00.000'}Z` : normalized)
  if (Number.isNaN(date.getTime())) return undefined
  if (dateOnly && date.toISOString().slice(0, 10) !== normalized) return undefined
  return date
}
router.get('/', async (req, res) => {
  try { const page = positiveInt(req.query.page, 1); const limit = positiveInt(req.query.limit, 20, 100); if (!page || !limit) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase receipt query', ['page and limit must be positive integers; limit up to 100']); const filter = {}; for (const key of ['purchaseOrderId', 'supplierId']) if (req.query[key]) { if (!mongoose.isValidObjectId(req.query[key])) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase receipt query', [`${key} must be valid`]); filter[key] = req.query[key] }; const dates = {}; if (req.query.dateFrom) { const dateFrom = parseDate(req.query.dateFrom, 'start'); if (!dateFrom) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase receipt query', ['dateFrom must be a valid date']); dates.$gte = dateFrom } if (req.query.dateTo) { const dateTo = parseDate(req.query.dateTo, 'end'); if (!dateTo) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase receipt query', ['dateTo must be a valid date']); dates.$lte = dateTo } if (dates.$gte && dates.$lte && dates.$gte > dates.$lte) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase receipt query', ['dateFrom must be earlier than or equal to dateTo']); if (Object.keys(dates).length) filter.receivedAt = dates; const direction = req.query.sortOrder === 'asc' ? 1 : req.query.sortOrder === 'desc' || req.query.sortOrder === undefined ? -1 : null; if (!direction) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid purchase receipt query', ['sortOrder must be asc or desc']); const [items, total] = await Promise.all([PurchaseReceipt.find(filter).sort({ receivedAt: direction }).skip((page - 1) * limit).limit(limit).lean(), PurchaseReceipt.countDocuments(filter)]); return res.json({ items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } }) } catch (error) { console.error('Error listing purchase receipts:', error); return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch purchase receipts') }
})
module.exports = router
