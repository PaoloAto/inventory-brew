const express = require('express')
const mongoose = require('mongoose')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')
const { buildInventoryPlanning, compareUrgency } = require('../services/inventoryPlanningService')
const { getPrepPlan, previewPrepPlan } = require('../services/prepPlanningService')

const router = express.Router()
const LOOKBACK_DAYS = [7, 14, 30, 60, 90]
const MAX_LIMIT = 100
const SORT_FIELDS = ['urgency', 'daysRemaining', 'name', 'averageDailyDepletion']
const PREP_LOOKBACK_DAYS = [7, 14, 30]
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

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

const isValidDateOnly = (value) => {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

router.get('/prep', async (req, res) => {
  try {
    const unknownFields = Object.keys(req.query).filter((key) => !['asOf', 'lookbackDays'].includes(key))
    const details = []
    if (unknownFields.length > 0) details.push(`Unknown query field(s): ${unknownFields.join(', ')}`)
    if (!isValidDateOnly(req.query.asOf)) details.push('asOf must be a valid YYYY-MM-DD date')
    const lookbackRaw = req.query.lookbackDays === undefined ? '14' : req.query.lookbackDays
    if (typeof lookbackRaw !== 'string' || !PREP_LOOKBACK_DAYS.map(String).includes(lookbackRaw)) {
      details.push(`lookbackDays must be one of: ${PREP_LOOKBACK_DAYS.join(', ')}`)
    }
    if (details.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid prep planning query', details)
    }

    const result = await getPrepPlan({ asOf: req.query.asOf, lookbackDays: Number(lookbackRaw) })
    return res.json(result)
  } catch (err) {
    if (err?.isAppError) return sendError(res, err.status, err.code, err.message, err.details)
    console.error('Error fetching prep plan:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch prep plan')
  }
})

router.post('/prep/preview', async (req, res) => {
  try {
    const payload = req.body
    const details = []
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid prep preview payload', [
        'Request body must be an object',
      ])
    }
    const unknownFields = Object.keys(payload).filter((key) => key !== 'lines')
    if (unknownFields.length > 0) details.push(`Unknown field(s): ${unknownFields.join(', ')}`)
    if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
      details.push('lines must be a non-empty array')
    } else {
      const seenRecipeIds = new Set()
      payload.lines.forEach((line, index) => {
        if (!line || typeof line !== 'object' || Array.isArray(line)) {
          details.push(`lines[${index}] must be an object`)
          return
        }
        const unknownLineFields = Object.keys(line).filter(
          (key) => !['recipeId', 'servings'].includes(key),
        )
        if (unknownLineFields.length > 0) {
          details.push(`lines[${index}] has unknown field(s): ${unknownLineFields.join(', ')}`)
        }
        if (typeof line.recipeId !== 'string' || !mongoose.isValidObjectId(line.recipeId)) {
          details.push(`lines[${index}].recipeId must be a valid id`)
        } else if (seenRecipeIds.has(line.recipeId)) {
          details.push(`lines[${index}].recipeId duplicates another line`)
        } else {
          seenRecipeIds.add(line.recipeId)
        }
        if (
          typeof line.servings !== 'number' ||
          !Number.isFinite(line.servings) ||
          !Number.isInteger(line.servings) ||
          line.servings <= 0
        ) {
          details.push(`lines[${index}].servings must be a positive integer number`)
        }
      })
    }
    if (details.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid prep preview payload', details)
    }

    const preview = await previewPrepPlan(payload.lines)
    return res.json({ preview })
  } catch (err) {
    if (err?.isAppError) return sendError(res, err.status, err.code, err.message, err.details)
    console.error('Error previewing prep plan:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to preview prep plan')
  }
})

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
