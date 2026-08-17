const express = require('express')
const mongoose = require('mongoose')
const SalesRecord = require('../models/SalesRecord')
const { createSalesRecord, getSalesSummary } = require('../services/salesService')

const router = express.Router()
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_LIMIT = 100

const sendError = (res, status, code, message, details) => {
  const error = { code, message }
  if (details?.length) error.details = details
  return res.status(status).json({ error })
}

const isValidBusinessDate = (value) => {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

const validateDateRange = (query, { required = false } = {}) => {
  const details = []
  if (required || query.dateFrom !== undefined) {
    if (!isValidBusinessDate(query.dateFrom)) details.push('dateFrom must be a valid YYYY-MM-DD date')
  }
  if (required || query.dateTo !== undefined) {
    if (!isValidBusinessDate(query.dateTo)) details.push('dateTo must be a valid YYYY-MM-DD date')
  }
  if (details.length === 0 && query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
    details.push('dateFrom must be earlier than or equal to dateTo')
  }
  return details
}

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) || parsed < 1 ? fallback : parsed
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const toListItem = (record) => ({
  id: record._id,
  businessDate: record.businessDate,
  status: record.status,
  lineCount: record.lines.length,
  totalServings: record.totalServings,
  totalRevenue: record.totalRevenue,
  totalEstimatedFoodCost: record.totalEstimatedFoodCost,
  totalEstimatedGrossProfit: record.totalEstimatedGrossProfit,
  grossMarginPercent: record.grossMarginPercent,
  createdAt: record.createdAt,
  cancelledAt: record.cancelledAt,
})

router.post('/records', async (req, res) => {
  try {
    const payload = req.body
    const details = []
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid sales payload', ['Request body must be an object'])
    }
    const unknownFields = Object.keys(payload).filter((key) => !['businessDate', 'lines'].includes(key))
    if (unknownFields.length) details.push(`Unknown field(s): ${unknownFields.join(', ')}`)
    if (!isValidBusinessDate(payload.businessDate)) details.push('businessDate must be a valid YYYY-MM-DD date')
    if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
      details.push('lines must be a non-empty array')
    } else {
      const seen = new Set()
      payload.lines.forEach((line, index) => {
        if (!line || typeof line !== 'object' || Array.isArray(line)) {
          details.push(`lines[${index}] must be an object`)
          return
        }
        const unknownLineFields = Object.keys(line).filter((key) => !['recipeId', 'servingsSold'].includes(key))
        if (unknownLineFields.length) details.push(`lines[${index}] has unknown field(s): ${unknownLineFields.join(', ')}`)
        if (typeof line.recipeId !== 'string' || !mongoose.isValidObjectId(line.recipeId)) {
          details.push(`lines[${index}].recipeId must be a valid id`)
        } else if (seen.has(line.recipeId)) {
          details.push(`lines[${index}].recipeId duplicates another line`)
        } else {
          seen.add(line.recipeId)
        }
        if (typeof line.servingsSold !== 'number' || !Number.isFinite(line.servingsSold) || !Number.isInteger(line.servingsSold) || line.servingsSold <= 0) {
          details.push(`lines[${index}].servingsSold must be a positive integer number`)
        }
      })
    }
    if (details.length) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid sales payload', details)

    const record = await createSalesRecord(payload)
    return res.status(201).json({ record })
  } catch (err) {
    if (err?.isAppError) return sendError(res, err.status, err.code, err.message, err.details)
    console.error('Error recording sales:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to record sales')
  }
})

router.get('/records', async (req, res) => {
  try {
    const details = validateDateRange(req.query)
    if (req.query.status && !['ACTIVE', 'CANCELLED'].includes(req.query.status)) details.push('status must be ACTIVE or CANCELLED')
    if (details.length) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid sales query', details)

    const page = parsePositiveInt(req.query.page, 1)
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), MAX_LIMIT)
    const filters = {}
    if (req.query.status) filters.status = req.query.status
    if (req.query.dateFrom || req.query.dateTo) {
      filters.businessDate = {}
      if (req.query.dateFrom) filters.businessDate.$gte = req.query.dateFrom
      if (req.query.dateTo) filters.businessDate.$lte = req.query.dateTo
    }
    const search = String(req.query.search || '').trim()
    if (search) filters['lines.recipeNameSnapshot'] = new RegExp(escapeRegExp(search), 'i')
    const direction = String(req.query.sortOrder).toLowerCase() === 'asc' ? 1 : -1
    const [records, total] = await Promise.all([
      SalesRecord.find(filters).sort({ businessDate: direction, createdAt: direction }).skip((page - 1) * limit).limit(limit).lean(),
      SalesRecord.countDocuments(filters),
    ])
    return res.json({
      items: records.map(toListItem),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    })
  } catch (err) {
    console.error('Error listing sales:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to list sales')
  }
})

router.get('/records/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid sales record id')
    const record = await SalesRecord.findById(req.params.id).lean()
    if (!record) return sendError(res, 404, 'NOT_FOUND', 'Sales record not found')
    return res.json({ record })
  } catch (err) {
    console.error('Error fetching sales record:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch sales record')
  }
})

router.post('/records/:id/cancel', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid sales record id')
    if (Object.keys(req.body || {}).length > 0) return sendError(res, 400, 'VALIDATION_ERROR', 'Cancel request does not accept fields')
    const record = await SalesRecord.findOneAndUpdate(
      { _id: req.params.id, status: 'ACTIVE' },
      { $set: { status: 'CANCELLED', cancelledAt: new Date() } },
      { new: true, runValidators: true },
    )
    if (!record) {
      const exists = await SalesRecord.exists({ _id: req.params.id })
      if (!exists) return sendError(res, 404, 'NOT_FOUND', 'Sales record not found')
      return sendError(res, 409, 'INVALID_SALES_STATE', 'Only a recorded sales record can be cancelled')
    }
    return res.json({ record })
  } catch (err) {
    console.error('Error cancelling sales record:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to cancel sales record')
  }
})

router.get('/summary', async (req, res) => {
  try {
    const details = validateDateRange(req.query, { required: true })
    if (details.length) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid sales summary query', details)
    return res.json(await getSalesSummary({ dateFrom: req.query.dateFrom, dateTo: req.query.dateTo }))
  } catch (err) {
    console.error('Error summarizing sales:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to summarize sales')
  }
})

module.exports = router
