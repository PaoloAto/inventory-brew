const express = require('express')
const { calculateStockStatus, STOCK_STATUS } = require('../domain/stockStatus')
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
    recipeReferenceIds.length > 0
      ? Recipe.find({ _id: { $in: recipeReferenceIds } }).select('name isActive').lean()
      : [],
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
    const lowStockLimit = Math.min(
      parsePositiveInt(req.query.lowStockLimit, DEFAULT_LOW_STOCK_LIMIT),
      MAX_LIMIT,
    )
    const recentTransactionsLimit = Math.min(
      parsePositiveInt(req.query.recentTransactionsLimit, DEFAULT_RECENT_TRANSACTIONS_LIMIT),
      MAX_LIMIT,
    )
    const includeInactive = parseBoolean(req.query.includeInactive) === true
    const includeRelated = parseBoolean(req.query.includeRelated) !== false
    const ingredientMatch = includeInactive ? {} : { isActive: true }
    const recipeMatch = includeInactive ? {} : { isActive: true }

    const [ingredients, recipeCount, recentTransactionsRaw] = await Promise.all([
      Ingredient.find(ingredientMatch)
        .select(
          'name unit stockQuantity stockQuantityBase costPerUnit averageCostPerBaseUnit reorderLevel isActive',
        )
        .lean(),
      Recipe.countDocuments(recipeMatch),
      InventoryTransaction.find().sort({ createdAt: -1 }).limit(recentTransactionsLimit).lean(),
    ])

    const statusCounts = {
      outOfStockCount: 0,
      criticalStockCount: 0,
      lowOnlyCount: 0,
      unconfiguredReorderCount: 0,
      sufficientStockCount: 0,
      replenishmentRequiredCount: 0,
    }

    const normalizedIngredients = ingredients.map((ingredient) => {
      const stockStatus = calculateStockStatus(ingredient)

      if (stockStatus.code === STOCK_STATUS.OUT_OF_STOCK) statusCounts.outOfStockCount += 1
      if (stockStatus.code === STOCK_STATUS.CRITICAL) statusCounts.criticalStockCount += 1
      if (stockStatus.code === STOCK_STATUS.LOW) statusCounts.lowOnlyCount += 1
      if (stockStatus.code === STOCK_STATUS.UNCONFIGURED) statusCounts.unconfiguredReorderCount += 1
      if (stockStatus.code === STOCK_STATUS.SUFFICIENT) statusCounts.sufficientStockCount += 1

      if (
        (stockStatus.code === STOCK_STATUS.OUT_OF_STOCK && stockStatus.shortfall !== null) ||
        stockStatus.code === STOCK_STATUS.CRITICAL ||
        stockStatus.code === STOCK_STATUS.LOW
      ) {
        statusCounts.replenishmentRequiredCount += 1
      }

      return {
        ...ingredient,
        stockStatus,
        stockValue: ingredient.stockQuantityBase * ingredient.averageCostPerBaseUnit,
      }
    })

    const lowStockItems = normalizedIngredients
      .filter(
        (ingredient) =>
          ingredient.reorderLevel > 0 &&
          [STOCK_STATUS.OUT_OF_STOCK, STOCK_STATUS.CRITICAL, STOCK_STATUS.LOW].includes(
            ingredient.stockStatus.code,
          ),
      )
      .sort(
        (left, right) =>
          right.stockStatus.shortfall - left.stockStatus.shortfall ||
          left.stockQuantity - right.stockQuantity,
      )
      .slice(0, lowStockLimit)
      .map((ingredient) => ({
        id: ingredient._id,
        name: ingredient.name,
        unit: ingredient.unit,
        stockQuantity: ingredient.stockQuantity,
        reorderLevel: ingredient.reorderLevel,
        shortfall: ingredient.stockStatus.shortfall,
        stockValue: Number(ingredient.stockValue.toFixed(4)),
        stockStatus: ingredient.stockStatus,
        isActive: ingredient.isActive,
      }))

    const recentTransactions = includeRelated
      ? await mapRecentTransactions(recentTransactionsRaw)
      : recentTransactionsRaw
    const totalStockValue = normalizedIngredients.reduce(
      (total, ingredient) => total + ingredient.stockValue,
      0,
    )

    return res.json({
      summary: {
        ingredientCount: ingredients.length,
        recipeCount,
        totalStockValue: Number(totalStockValue.toFixed(4)),
        ...statusCounts,
        lowStockCount: statusCounts.replenishmentRequiredCount,
      },
      lowStockItems,
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
