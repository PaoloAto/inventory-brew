const express = require('express')
const mongoose = require('mongoose')
const CookEvent = require('../models/CookEvent')

const router = express.Router()
const MAX_LIMIT = 100
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const sendError = (res, status, code, message, details) => {
  const error = { code, message }
  if (details?.length) error.details = details
  return res.status(status).json({ error })
}

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) || parsed < 1 ? fallback : parsed
}

const parseDate = (value, boundary) => {
  if (!value) return undefined
  const normalized = String(value).trim()
  const dateOnly = DATE_ONLY_PATTERN.test(normalized)
  const date = new Date(
    dateOnly
      ? `${normalized}T${boundary === 'end' ? '23:59:59.999' : '00:00:00.000'}Z`
      : normalized,
  )
  if (Number.isNaN(date.getTime())) return undefined
  if (dateOnly && date.toISOString().slice(0, 10) !== normalized) return undefined
  return date
}

router.get('/', async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1)
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), MAX_LIMIT)
    const filters = {}

    if (req.query.recipeId) {
      const recipeId = String(req.query.recipeId).trim()
      if (!mongoose.isValidObjectId(recipeId)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid production query', [
          'recipeId must be a valid id',
        ])
      }
      filters.recipeId = recipeId
    }

    const createdAt = {}
    if (req.query.dateFrom) {
      const value = parseDate(req.query.dateFrom, 'start')
      if (!value) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid production query', ['dateFrom must be a valid date'])
      createdAt.$gte = value
    }
    if (req.query.dateTo) {
      const value = parseDate(req.query.dateTo, 'end')
      if (!value) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid production query', ['dateTo must be a valid date'])
      createdAt.$lte = value
    }
    if (createdAt.$gte && createdAt.$lte && createdAt.$gte > createdAt.$lte) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid production query', [
        'dateFrom must be earlier than or equal to dateTo',
      ])
    }
    if (Object.keys(createdAt).length) filters.createdAt = createdAt

    const sortOrder = String(req.query.sortOrder).toLowerCase() === 'asc' ? 1 : -1
    const [items, total] = await Promise.all([
      CookEvent.find(filters)
        .sort({ createdAt: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CookEvent.countDocuments(filters),
    ])

    return res.json({
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    })
  } catch (err) {
    console.error('Error fetching production history:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch production history')
  }
})

module.exports = router
