const express = require('express')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')
const Recipe = require('../models/Recipe')

const router = express.Router()

const DEFAULT_LOW_STOCK_LIMIT = 5
const DEFAULT_RECENT_TRANSACTIONS_LIMIT = 8
const MAX_LIMIT = 50

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

const mapRecentTransactions = async (items) => {
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
    const recipe = item.referenceType === 'recipe' && referenceId ? recipeMap.get(referenceId) : undefined

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
            name: recipe?.name ?? null,
            isActive: recipe?.isActive ?? null,
          }
        : null,
    }
  })
}

// GET /api/dashboard/summary - dashboard metrics and lightweight widgets
router.get('/summary', async (req, res) => {
  try {
    const lowStockLimit = Math.min(parsePositiveInt(req.query.lowStockLimit, DEFAULT_LOW_STOCK_LIMIT), MAX_LIMIT)
    const recentTransactionsLimit = Math.min(
      parsePositiveInt(req.query.recentTransactionsLimit, DEFAULT_RECENT_TRANSACTIONS_LIMIT),
      MAX_LIMIT,
    )
    const includeInactive = parseBoolean(req.query.includeInactive) === true
    const includeRelated = parseBoolean(req.query.includeRelated) !== false

    const ingredientMatch = includeInactive ? {} : { isActive: true }
    const recipeMatch = includeInactive ? {} : { isActive: true }

    const [ingredientSummaryResult, recipeCount, lowStockItemsRaw, recentTransactionsRaw] = await Promise.all([
      Ingredient.aggregate([
        { $match: ingredientMatch },
        {
          $group: {
            _id: null,
            ingredientCount: { $sum: 1 },
            totalStockValue: { $sum: { $multiply: ['$stockQuantity', '$costPerUnit'] } },
            lowStockCount: {
              $sum: {
                $cond: [{ $and: [{ $gt: ['$reorderLevel', 0] }, { $lt: ['$stockQuantity', '$reorderLevel'] }] }, 1, 0],
              },
            },
          },
        },
      ]),
      Recipe.countDocuments(recipeMatch),
      Ingredient.aggregate([
        {
          $match: {
            ...ingredientMatch,
            reorderLevel: { $gt: 0 },
          },
        },
        {
          $match: {
            $expr: { $lt: ['$stockQuantity', '$reorderLevel'] },
          },
        },
        {
          $project: {
            name: 1,
            unit: 1,
            stockQuantity: 1,
            reorderLevel: 1,
            isActive: 1,
            stockValue: { $multiply: ['$stockQuantity', '$costPerUnit'] },
            shortfall: { $subtract: ['$reorderLevel', '$stockQuantity'] },
          },
        },
        { $sort: { shortfall: -1, stockQuantity: 1 } },
        { $limit: lowStockLimit },
      ]),
      InventoryTransaction.find().sort({ createdAt: -1 }).limit(recentTransactionsLimit).lean(),
    ])

    const ingredientSummary = ingredientSummaryResult[0] || {
      ingredientCount: 0,
      totalStockValue: 0,
      lowStockCount: 0,
    }

    const recentTransactions = includeRelated
      ? await mapRecentTransactions(recentTransactionsRaw)
      : recentTransactionsRaw

    return res.json({
      summary: {
        ingredientCount: ingredientSummary.ingredientCount,
        recipeCount,
        lowStockCount: ingredientSummary.lowStockCount,
        totalStockValue: Number((ingredientSummary.totalStockValue || 0).toFixed(4)),
      },
      lowStockItems: lowStockItemsRaw.map((item) => ({
        id: item._id,
        name: item.name,
        unit: item.unit,
        stockQuantity: item.stockQuantity,
        reorderLevel: item.reorderLevel,
        shortfall: item.shortfall,
        stockValue: Number((item.stockValue || 0).toFixed(4)),
        isActive: item.isActive,
      })),
      recentTransactions,
      meta: {
        includeInactive,
        lowStockLimit,
        recentTransactionsLimit,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('Error fetching dashboard summary:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch dashboard summary')
  }
})

module.exports = router
