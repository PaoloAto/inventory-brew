const express = require('express')
const mongoose = require('mongoose')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')
const Recipe = require('../models/Recipe')

const router = express.Router()

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const ALLOWED_TYPES = ['IN', 'OUT', 'ADJUST']
const ALLOWED_REFERENCE_TYPES = ['recipe', 'manual', 'purchase', 'system']
const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'type', 'quantity', 'previousStock', 'newStock', 'unitCost']

const sendError = (res, status, code, message, details) => {
  const error = { code, message }
  if (details && details.length > 0) error.details = details
  return res.status(status).json({ error })
}

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 1) return fallback
  return parsed
}

const parseBoolean = (value) => {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value

  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes'].includes(normalized)) return true
  if (['false', '0', 'no'].includes(normalized)) return false
  return undefined
}

const parseDate = (value) => {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date
}

const escapeRegExp = (input) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const resolveSort = (sortBy, sortOrder) => {
  const normalizedSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt'
  const normalizedSortOrder = String(sortOrder).toLowerCase() === 'asc' ? 1 : -1
  return { [normalizedSortBy]: normalizedSortOrder }
}

const mapWithRelatedData = async (items) => {
  if (items.length === 0) return items

  const ingredientIds = [...new Set(items.map((item) => String(item.ingredientId)))]
  const recipeReferenceIds = [
    ...new Set(
      items
        .filter((item) => item.referenceType === 'recipe' && item.referenceId)
        .map((item) => String(item.referenceId)),
    ),
  ]

  const [ingredientDocs, recipeDocs] = await Promise.all([
    Ingredient.find({ _id: { $in: ingredientIds } }).select('name unit isActive').lean(),
    recipeReferenceIds.length > 0 ? Recipe.find({ _id: { $in: recipeReferenceIds } }).select('name isActive').lean() : [],
  ])

  const ingredientMap = new Map(ingredientDocs.map((ingredient) => [String(ingredient._id), ingredient]))
  const recipeMap = new Map(recipeDocs.map((recipe) => [String(recipe._id), recipe]))

  return items.map((item) => {
    const ingredient = ingredientMap.get(String(item.ingredientId))
    const referenceId = item.referenceId ? String(item.referenceId) : undefined
    const relatedRecipe = item.referenceType === 'recipe' && referenceId ? recipeMap.get(referenceId) : undefined

    return {
      ...item,
      ingredient: ingredient
        ? {
            id: ingredient._id,
            name: ingredient.name,
            unit: ingredient.unit,
            isActive: ingredient.isActive,
          }
        : null,
      reference: item.referenceType
        ? {
            type: item.referenceType,
            id: item.referenceId ?? null,
            name: relatedRecipe?.name ?? null,
            isActive: relatedRecipe?.isActive ?? null,
          }
        : null,
    }
  })
}

// GET /api/transactions - list inventory transactions with filters/pagination/sort
router.get('/', async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, DEFAULT_PAGE)
    const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT)
    const skip = (page - 1) * limit

    const filters = {}

    if (req.query.ingredientId) {
      const ingredientId = String(req.query.ingredientId).trim()
      if (!mongoose.isValidObjectId(ingredientId)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid transaction query', [
          'ingredientId must be a valid id',
        ])
      }
      filters.ingredientId = ingredientId
    }

    if (req.query.type) {
      const type = String(req.query.type).trim().toUpperCase()
      if (!ALLOWED_TYPES.includes(type)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid transaction query', [
          `type must be one of: ${ALLOWED_TYPES.join(', ')}`,
        ])
      }
      filters.type = type
    }

    if (req.query.referenceType) {
      const referenceType = String(req.query.referenceType).trim().toLowerCase()
      if (!ALLOWED_REFERENCE_TYPES.includes(referenceType)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid transaction query', [
          `referenceType must be one of: ${ALLOWED_REFERENCE_TYPES.join(', ')}`,
        ])
      }
      filters.referenceType = referenceType
    }

    if (req.query.referenceId) {
      const referenceId = String(req.query.referenceId).trim()
      if (!mongoose.isValidObjectId(referenceId)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid transaction query', [
          'referenceId must be a valid id',
        ])
      }
      filters.referenceId = referenceId
    }

    if (req.query.reason) {
      const reason = String(req.query.reason).trim()
      filters.reason = { $regex: new RegExp(escapeRegExp(reason), 'i') }
    }

    const createdAt = {}
    if (req.query.dateFrom) {
      const dateFrom = parseDate(req.query.dateFrom)
      if (!dateFrom) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid transaction query', [
          'dateFrom must be a valid date (ISO format recommended)',
        ])
      }
      createdAt.$gte = dateFrom
    }

    if (req.query.dateTo) {
      const dateTo = parseDate(req.query.dateTo)
      if (!dateTo) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid transaction query', [
          'dateTo must be a valid date (ISO format recommended)',
        ])
      }
      createdAt.$lte = dateTo
    }

    if (createdAt.$gte && createdAt.$lte && createdAt.$gte > createdAt.$lte) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid transaction query', [
        'dateFrom must be earlier than or equal to dateTo',
      ])
    }

    if (Object.keys(createdAt).length > 0) {
      filters.createdAt = createdAt
    }

    const includeRelated = parseBoolean(req.query.includeRelated) !== false
    const sort = resolveSort(req.query.sortBy, req.query.sortOrder)

    const [rawItems, total] = await Promise.all([
      InventoryTransaction.find(filters).sort(sort).skip(skip).limit(limit).lean(),
      InventoryTransaction.countDocuments(filters),
    ])

    const items = includeRelated ? await mapWithRelatedData(rawItems) : rawItems

    return res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    })
  } catch (err) {
    console.error('Error fetching transactions:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch transactions')
  }
})

module.exports = router
