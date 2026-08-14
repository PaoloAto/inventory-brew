const express = require('express')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')
const { buildInventoryPlanning, compareUrgency } = require('../services/inventoryPlanningService')

const router = express.Router()
const LOOKBACK_DAYS = [7, 14, 30, 60, 90]
const MAX_LIMIT = 100
const SORT_FIELDS = ['urgency', 'daysRemaining', 'name', 'averageDailyDepletion']

const sendError = (res, status, code, message, details) => {
  const error = { code, message }
  if (details?.length) error.details = details
  return res.status(status).json({ error })
}

const parsePositiveInt = (value, fallback, field, max) => {
  if (value === undefined) return { value: fallback }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || (max && parsed > max)) {
    return { error: `${field} must be a positive integer${max ? ` up to ${max}` : ''}` }
  }
  return { value: parsed }
}

const parseBoolean = (value) => {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes'].includes(normalized)) return true
  if (['false', '0', 'no'].includes(normalized)) return false
  return undefined
}

const escapeRegExp = (input) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

router.get('/inventory', async (req, res) => {
  try {
    const parsedPage = parsePositiveInt(req.query.page, 1, 'page')
    const parsedLimit = parsePositiveInt(req.query.limit, 20, 'limit', MAX_LIMIT)
    if (parsedPage.error || parsedLimit.error) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid planning query', [parsedPage.error || parsedLimit.error])
    }

    const lookbackDays = Number(req.query.lookbackDays ?? 30)
    if (!LOOKBACK_DAYS.includes(lookbackDays)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid planning query', [
        `lookbackDays must be one of: ${LOOKBACK_DAYS.join(', ')}`,
      ])
    }
    const sortBy = req.query.sortBy === undefined ? 'urgency' : String(req.query.sortBy)
    if (!SORT_FIELDS.includes(sortBy)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid planning query', [
        `sortBy must be one of: ${SORT_FIELDS.join(', ')}`,
      ])
    }
    const sortOrder = req.query.sortOrder === undefined ? 'asc' : String(req.query.sortOrder)
    if (!['asc', 'desc'].includes(sortOrder)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid planning query', ['sortOrder must be asc or desc'])
    }
    const search = String(req.query.search || '').trim()
    const category = String(req.query.category || '').trim()
    const reorderOnly = parseBoolean(req.query.reorderOnly) === true
    const ingredientFilters = { isActive: true }
    if (category && category.toLowerCase() !== 'all') ingredientFilters.category = category
    if (search) {
      const safeSearch = new RegExp(escapeRegExp(search), 'i')
      ingredientFilters.$or = [{ name: safeSearch }, { manufacturer: safeSearch }, { category: safeSearch }]
    }

    const asOf = new Date()
    const windowStart = new Date(asOf.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
    const ingredients = await Ingredient.find(ingredientFilters)
      .populate('preferredSupplierId', 'name isActive')
      .lean()
    const ingredientIds = ingredients.map((ingredient) => ingredient._id)
    const transactions = ingredientIds.length
      ? await InventoryTransaction.find({
          ingredientId: { $in: ingredientIds },
          type: 'OUT',
          createdAt: { $gte: windowStart, $lte: asOf },
        }).lean()
      : []
    let results = buildInventoryPlanning({ ingredients, transactions, lookbackDays, asOf })
    if (reorderOnly) results = results.filter((item) => item.reorderTriggered)

    const direction = sortOrder === 'desc' ? -1 : 1
    results.sort((left, right) => {
      if (sortBy === 'urgency') return compareUrgency(left, right) * direction
      if (sortBy === 'name') return left.name.localeCompare(right.name) * direction
      const leftValue = left[sortBy]
      const rightValue = right[sortBy]
      if (leftValue === null && rightValue === null) return left.name.localeCompare(right.name)
      if (leftValue === null) return 1
      if (rightValue === null) return -1
      return (leftValue - rightValue || left.name.localeCompare(right.name)) * direction
    })

    const summary = {
      ingredientCount: results.length,
      outOfStockCount: results.filter((item) => item.stockStatus.code === 'OUT_OF_STOCK').length,
      reorderTriggeredCount: results.filter((item) => item.reorderTriggered).length,
      parUnconfiguredCount: results.filter((item) => !item.parConfigured).length,
      noDepletionDataCount: results.filter((item) => item.averageDailyDepletion <= 0).length,
    }
    const start = (parsedPage.value - 1) * parsedLimit.value
    return res.json({
      items: results.slice(start, start + parsedLimit.value),
      summary,
      meta: { lookbackDays },
      pagination: {
        page: parsedPage.value,
        limit: parsedLimit.value,
        total: results.length,
        totalPages: Math.ceil(results.length / parsedLimit.value) || 1,
      },
    })
  } catch (err) {
    console.error('Error fetching inventory planning:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch inventory planning')
  }
})

module.exports = router
