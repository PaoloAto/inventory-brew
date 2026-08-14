const express = require('express')
const mongoose = require('mongoose')
const Supplier = require('../models/Supplier')

const router = express.Router()
const MAX_LIMIT = 100
const FIELDS = new Set(['name', 'contactName', 'email', 'phone', 'notes'])
const sendError = (res, status, code, message, details) => res.status(status).json({ error: { code, message, ...(details?.length ? { details } : {}) } })
const escapeRegExp = (input) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const parseBool = (value) => ['true', '1', 'yes'].includes(String(value).toLowerCase())
const parsePage = (value, fallback, max) => {
  if (value === undefined) return fallback
  const number = Number(value)
  return Number.isInteger(number) && number >= 1 && (!max || number <= max) ? number : null
}
const validate = (payload, partial = false) => {
  const details = Object.keys(payload || {}).filter((key) => !FIELDS.has(key)).map((key) => `Unknown field: ${key}`)
  const value = {}
  for (const field of FIELDS) {
    if (payload[field] === undefined) continue
    if (typeof payload[field] !== 'string') details.push(`${field} must be a string`)
    else value[field] = payload[field].trim()
  }
  if (!partial || payload.name !== undefined) {
    if (!value.name) details.push('name is required and must be a non-empty string')
  }
  return { details, value }
}
const validId = (res, id) => mongoose.isValidObjectId(id) || (sendError(res, 400, 'INVALID_ID', 'Invalid supplier id'), false)

router.get('/', async (req, res) => {
  try {
    const page = parsePage(req.query.page, 1)
    const limit = parsePage(req.query.limit, 20, MAX_LIMIT)
    if (!page || !limit) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid supplier query', ['page and limit must be positive integers; limit up to 100'])
    const onlyInactive = parseBool(req.query.onlyInactive)
    const includeInactive = parseBool(req.query.includeInactive)
    const filter = onlyInactive ? { isActive: false } : includeInactive ? {} : { isActive: true }
    const search = String(req.query.search || '').trim()
    if (search) filter.$or = [{ name: new RegExp(escapeRegExp(search), 'i') }, { contactName: new RegExp(escapeRegExp(search), 'i') }]
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1
    const [items, total] = await Promise.all([Supplier.find(filter).sort({ name: sortOrder }).skip((page - 1) * limit).limit(limit).lean(), Supplier.countDocuments(filter)])
    return res.json({ items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } })
  } catch (error) { console.error('Error listing suppliers:', error); return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch suppliers') }
})
router.post('/', async (req, res) => {
  try { const { details, value } = validate(req.body || {}); if (details.length) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid supplier payload', details); const supplier = await Supplier.create(value); return res.status(201).json(supplier) } catch (error) { console.error('Error creating supplier:', error); return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to create supplier') }
})
router.put('/:id', async (req, res) => {
  try { if (!validId(res, req.params.id)) return; const { details, value } = validate(req.body || {}, true); if (!Object.keys(value).length) details.push('At least one updatable field is required'); if (details.length) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid supplier payload', details); const supplier = await Supplier.findByIdAndUpdate(req.params.id, value, { new: true, runValidators: true }); if (!supplier) return sendError(res, 404, 'NOT_FOUND', 'Supplier not found'); return res.json(supplier) } catch (error) { console.error('Error updating supplier:', error); return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to update supplier') }
})
router.delete('/:id', async (req, res) => {
  try { if (!validId(res, req.params.id)) return; const supplier = await Supplier.findById(req.params.id); if (!supplier) return sendError(res, 404, 'NOT_FOUND', 'Supplier not found'); supplier.isActive = false; await supplier.save(); return res.json({ message: 'Supplier archived', supplier }) } catch (error) { console.error('Error archiving supplier:', error); return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to archive supplier') }
})
router.patch('/:id/restore', async (req, res) => {
  try { if (!validId(res, req.params.id)) return; const supplier = await Supplier.findById(req.params.id); if (!supplier) return sendError(res, 404, 'NOT_FOUND', 'Supplier not found'); supplier.isActive = true; await supplier.save(); return res.json({ message: 'Supplier restored', supplier }) } catch (error) { console.error('Error restoring supplier:', error); return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to restore supplier') }
})

module.exports = router
