const express = require('express')
const mongoose = require('mongoose')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')

const router = express.Router()
const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const WASTE_REASON_CODES = [
  'WASTE_SPOILAGE',
  'WASTE_EXPIRED',
  'WASTE_PREP',
  'WASTE_DAMAGE',
  'WASTE_OTHER',
]
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

const buildFilters = (query) => {
  const filters = {
    type: 'OUT',
    reasonCode: { $in: WASTE_REASON_CODES },
  }

  if (query.ingredientId) {
    const ingredientId = String(query.ingredientId).trim()
    if (!mongoose.isValidObjectId(ingredientId)) {
      return { error: ['ingredientId must be a valid id'] }
    }
    filters.ingredientId = new mongoose.Types.ObjectId(ingredientId)
  }

  if (query.reasonCode) {
    const reasonCode = String(query.reasonCode).trim()
    if (!WASTE_REASON_CODES.includes(reasonCode)) {
      return { error: [`reasonCode must be one of: ${WASTE_REASON_CODES.join(', ')}`] }
    }
    filters.reasonCode = reasonCode
  }

  const createdAt = {}
  if (query.dateFrom) {
    const dateFrom = parseDate(query.dateFrom, 'start')
    if (!dateFrom) return { error: ['dateFrom must be a valid date (ISO format recommended)'] }
    createdAt.$gte = dateFrom
  }
  if (query.dateTo) {
    const dateTo = parseDate(query.dateTo, 'end')
    if (!dateTo) return { error: ['dateTo must be a valid date (ISO format recommended)'] }
    createdAt.$lte = dateTo
  }
  if (createdAt.$gte && createdAt.$lte && createdAt.$gte > createdAt.$lte) {
    return { error: ['dateFrom must be earlier than or equal to dateTo'] }
  }
  if (Object.keys(createdAt).length) filters.createdAt = createdAt

  return { filters }
}

const getLossValue = (transaction) =>
  Number.isFinite(transaction.quantity) && Number.isFinite(transaction.unitCost)
    ? transaction.quantity * transaction.unitCost
    : 0

router.get('/', async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, DEFAULT_PAGE)
    const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT)
    const { filters, error } = buildFilters(req.query)
    if (error) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid waste query', error)

    const sortOrder = String(req.query.sortOrder).toLowerCase() === 'asc' ? 1 : -1
    const [transactions, total, summaryGroups] = await Promise.all([
      InventoryTransaction.find(filters)
        .sort({ createdAt: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      InventoryTransaction.countDocuments(filters),
      InventoryTransaction.aggregate([
        { $match: filters },
        {
          $group: {
            _id: '$reasonCode',
            eventCount: { $sum: 1 },
            totalWasteValue: {
              $sum: { $multiply: ['$quantity', { $ifNull: ['$unitCost', 0] }] },
            },
          },
        },
      ]),
    ])

    const ingredientIds = [...new Set(transactions.map((transaction) => String(transaction.ingredientId)))]
    const ingredients = ingredientIds.length
      ? await Ingredient.find({ _id: { $in: ingredientIds } }).select('name unit').lean()
      : []
    const ingredientMap = new Map(ingredients.map((ingredient) => [String(ingredient._id), ingredient]))
    const byReason = summaryGroups.map((group) => ({
      reasonCode: group._id,
      eventCount: group.eventCount,
      totalWasteValue: group.totalWasteValue,
    }))

    return res.json({
      items: transactions.map((transaction) => {
        const ingredient = ingredientMap.get(String(transaction.ingredientId))
        return {
          id: String(transaction._id),
          ingredientId: String(transaction.ingredientId),
          ingredientName: ingredient?.name ?? 'Unknown ingredient',
          unit: ingredient?.unit ?? '',
          quantity: transaction.quantity,
          unitCost: transaction.unitCost,
          lossValue: getLossValue(transaction),
          reasonCode: transaction.reasonCode,
          note: transaction.reason || '',
          previousStock: transaction.previousStock,
          newStock: transaction.newStock,
          operationId: transaction.operationId,
          createdAt: transaction.createdAt,
        }
      }),
      summary: {
        eventCount: summaryGroups.reduce((sum, group) => sum + group.eventCount, 0),
        totalWasteValue: summaryGroups.reduce((sum, group) => sum + group.totalWasteValue, 0),
        byReason,
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    })
  } catch (err) {
    console.error('Error fetching waste history:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch waste history')
  }
})

module.exports = router
