const express = require('express')
const mongoose = require('mongoose')
const StocktakeSession = require('../models/StocktakeSession')
const {
  startStocktake,
  saveStocktakeCounts,
  cancelStocktake,
  postStocktake,
} = require('../services/stocktakeService')
const { isTransactionUnsupportedError } = require('../services/inventoryService')

const router = express.Router()
const MAX_LIMIT = 100
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const sendError = (res, status, code, message, details) =>
  res.status(status).json({ error: { code, message, ...(details?.length ? { details } : {}) } })
const validId = (res, id) => mongoose.isValidObjectId(id) || (sendError(res, 400, 'INVALID_ID', 'Invalid stock count id'), false)
const escapeRegExp = (input) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const parsePositiveInt = (value, fallback, max) => {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && (!max || parsed <= max) ? parsed : null
}
const parseDate = (value, boundary) => {
  const normalized = String(value || '').trim()
  const dateOnly = DATE_ONLY_PATTERN.test(normalized)
  const date = new Date(dateOnly ? `${normalized}T${boundary === 'end' ? '23:59:59.999' : '00:00:00.000'}Z` : normalized)
  if (Number.isNaN(date.getTime())) return null
  if (dateOnly && date.toISOString().slice(0, 10) !== normalized) return null
  return date
}
const formatStocktake = (stocktake) => {
  const value = typeof stocktake.toObject === 'function' ? stocktake.toObject() : stocktake
  return { ...value, id: String(value._id), countedLineCount: value.lines.filter((line) => line.countedQuantity !== null).length }
}
const handleError = (res, error, fallback) => {
  if (error?.isAppError) return sendError(res, error.status, error.code, error.message, error.details)
  if (isTransactionUnsupportedError(error)) return sendError(res, 503, 'TRANSACTIONS_UNAVAILABLE', 'Completing a stock count requires MongoDB transaction support.')
  console.error(fallback, error)
  return sendError(res, 500, 'INTERNAL_SERVER_ERROR', fallback)
}

router.get('/', async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1)
    const limit = parsePositiveInt(req.query.limit, 20, MAX_LIMIT)
    if (!page || !limit) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stock count query', ['page and limit must be positive integers; limit up to 100'])
    const filter = {}
    if (req.query.status) {
      if (!['DRAFT', 'POSTED', 'CANCELLED'].includes(req.query.status)) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stock count query', ['status is invalid'])
      filter.status = req.query.status
    }
    const search = String(req.query.search || '').trim()
    if (search) filter.name = new RegExp(escapeRegExp(search), 'i')
    const startedAt = {}
    if (req.query.dateFrom) {
      const date = parseDate(req.query.dateFrom, 'start')
      if (!date) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stock count query', ['dateFrom must be a valid date'])
      startedAt.$gte = date
    }
    if (req.query.dateTo) {
      const date = parseDate(req.query.dateTo, 'end')
      if (!date) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stock count query', ['dateTo must be a valid date'])
      startedAt.$lte = date
    }
    if (startedAt.$gte && startedAt.$lte && startedAt.$gte > startedAt.$lte) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stock count query', ['dateFrom must be earlier than or equal to dateTo'])
    if (Object.keys(startedAt).length) filter.startedAt = startedAt
    const direction = req.query.sortOrder === 'asc' ? 1 : req.query.sortOrder === 'desc' || req.query.sortOrder === undefined ? -1 : null
    if (!direction) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stock count query', ['sortOrder must be asc or desc'])
    const [items, total] = await Promise.all([
      StocktakeSession.find(filter).sort({ startedAt: direction }).skip((page - 1) * limit).limit(limit).lean(),
      StocktakeSession.countDocuments(filter),
    ])
    return res.json({
      items: items.map((item) => {
        const formatted = formatStocktake(item)
        return {
          id: formatted.id,
          name: formatted.name,
          status: formatted.status,
          startedAt: formatted.startedAt,
          postedAt: formatted.postedAt,
          cancelledAt: formatted.cancelledAt,
          lineCount: formatted.summary.lineCount,
          countedLineCount: formatted.countedLineCount,
          varianceLineCount: formatted.summary.varianceLineCount,
          netVarianceValue: formatted.summary.netVarianceValue,
          absoluteVarianceValue: formatted.summary.absoluteVarianceValue,
        }
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    })
  } catch (error) {
    return handleError(res, error, 'Failed to fetch stock counts')
  }
})

router.get('/:id', async (req, res) => {
  try {
    if (!validId(res, req.params.id)) return
    const stocktake = await StocktakeSession.findById(req.params.id)
    if (!stocktake) return sendError(res, 404, 'NOT_FOUND', 'Stock count not found')
    return res.json(formatStocktake(stocktake))
  } catch (error) {
    return handleError(res, error, 'Failed to fetch stock count')
  }
})

router.post('/', async (req, res) => {
  try {
    const body = req.body || {}
    const details = Object.keys(body).filter((field) => !['name', 'notes'].includes(field)).map((field) => `Unknown field: ${field}`)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const notes = body.notes === undefined ? '' : typeof body.notes === 'string' ? body.notes.trim() : (details.push('notes must be a string'), '')
    if (!name) details.push('name is required and must be a non-empty string')
    if (details.length) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stock count payload', details)
    const stocktake = await startStocktake({ name, notes })
    return res.status(201).json(formatStocktake(stocktake))
  } catch (error) {
    return handleError(res, error, 'Failed to start stock count')
  }
})

router.put('/:id', async (req, res) => {
  try {
    if (!validId(res, req.params.id)) return
    const body = req.body || {}
    const details = Object.keys(body).filter((field) => field !== 'counts').map((field) => `Unknown field: ${field}`)
    if (!Array.isArray(body.counts)) details.push('counts must be an array')
    const seen = new Set()
    const counts = []
    for (const line of body.counts || []) {
      if (!line || typeof line !== 'object' || Array.isArray(line)) { details.push('Each count must be an object'); continue }
      const unknown = Object.keys(line).filter((field) => !['ingredientId', 'countedQuantity'].includes(field))
      if (unknown.length) details.push(`Unknown count field(s): ${unknown.join(', ')}`)
      if (!mongoose.isValidObjectId(line.ingredientId)) { details.push('ingredientId must be a valid id'); continue }
      const id = String(line.ingredientId)
      if (seen.has(id)) details.push('Duplicate ingredient count lines are not allowed')
      seen.add(id)
      const quantity = line.countedQuantity
      if (quantity !== null && (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0)) details.push('countedQuantity must be null or a non-negative finite number')
      counts.push({ ingredientId: id, countedQuantity: quantity })
    }
    if (details.length) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stock count payload', details)
    const stocktake = await saveStocktakeCounts({ stocktakeId: req.params.id, counts })
    return res.json(formatStocktake(stocktake))
  } catch (error) {
    return handleError(res, error, 'Failed to save stock count')
  }
})

router.post('/:id/post', async (req, res) => {
  try {
    if (!validId(res, req.params.id)) return
    if (Object.keys(req.body || {}).length) return sendError(res, 400, 'VALIDATION_ERROR', 'This request does not accept a body')
    const stocktake = await postStocktake(req.params.id)
    return res.json(formatStocktake(stocktake))
  } catch (error) {
    return handleError(res, error, 'Failed to complete stock count')
  }
})

router.post('/:id/cancel', async (req, res) => {
  try {
    if (!validId(res, req.params.id)) return
    if (Object.keys(req.body || {}).length) return sendError(res, 400, 'VALIDATION_ERROR', 'This request does not accept a body')
    return res.json(formatStocktake(await cancelStocktake(req.params.id)))
  } catch (error) {
    return handleError(res, error, 'Failed to cancel stock count')
  }
})

module.exports = router
