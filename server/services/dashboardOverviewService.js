const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')
const PurchaseOrder = require('../models/PurchaseOrder')
const Recipe = require('../models/Recipe')
const { STOCK_STATUS } = require('../domain/stockStatus')
const { WASTE_REASON_CODES } = require('../domain/inventoryReasonCodes')
const { getSalesSummary } = require('./salesService')
const { getPrepPlan, shiftDateOnly } = require('./prepPlanningService')
const { buildInventoryPlanning, compareUrgency } = require('./inventoryPlanningService')

const DAY_MS = 24 * 60 * 60 * 1000
const DISPLAY_LIMIT = 5
const RECENT_TRANSACTIONS_LIMIT = 6
const OPEN_PURCHASE_ORDER_STATUSES = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED']

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
    recipeReferenceIds.length
      ? Recipe.find({ _id: { $in: recipeReferenceIds } }).select('name isActive').lean()
      : [],
  ])
  const ingredientMap = new Map(
    ingredientDocs.map((ingredient) => [String(ingredient._id), ingredient]),
  )
  const recipeMap = new Map(recipeDocs.map((recipe) => [String(recipe._id), recipe]))

  return items.map((item) => {
    const ingredient = ingredientMap.get(String(item.ingredientId))
    const referenceId = item.referenceId ? String(item.referenceId) : undefined
    const recipe =
      item.referenceType === 'recipe' && referenceId ? recipeMap.get(referenceId) : undefined
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

const roundMoney = (value) => Number(value.toFixed(4))

const getDashboardOverview = async ({ asOf }) => {
  const generatedAt = new Date()
  const salesDateFrom = shiftDateOnly(asOf, -6)
  const salesDateTo = asOf
  const wasteDateFrom = salesDateFrom
  const wasteDateTo = asOf
  const wasteStart = new Date(`${wasteDateFrom}T00:00:00.000Z`)
  const wasteEnd = new Date(`${wasteDateTo}T23:59:59.999Z`)
  const inventoryLookbackDays = 30
  const inventoryWindowStart = new Date(generatedAt.getTime() - inventoryLookbackDays * DAY_MS)
  const asOfDayStart = new Date(`${asOf}T00:00:00.000Z`)

  const ingredients = await Ingredient.find({ isActive: true })
    .populate('preferredSupplierId', 'name isActive')
    .lean()
  const ingredientIds = ingredients.map((ingredient) => ingredient._id)
  const [salesResult, prepResult, inventoryTransactions, purchaseOrders, wasteGroups, recentRaw] =
    await Promise.all([
      getSalesSummary({ dateFrom: salesDateFrom, dateTo: salesDateTo }),
      getPrepPlan({ asOf, lookbackDays: 14 }),
      InventoryTransaction.find({
        ingredientId: { $in: ingredientIds },
        type: 'OUT',
        createdAt: { $gte: inventoryWindowStart, $lte: generatedAt },
      }).lean(),
      PurchaseOrder.find({ status: { $in: OPEN_PURCHASE_ORDER_STATUSES } }).lean(),
      InventoryTransaction.aggregate([
        {
          $match: {
            type: 'OUT',
            reasonCode: { $in: WASTE_REASON_CODES },
            createdAt: { $gte: wasteStart, $lte: wasteEnd },
          },
        },
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
      InventoryTransaction.find()
        .sort({ createdAt: -1, _id: -1 })
        .limit(RECENT_TRANSACTIONS_LIMIT)
        .lean(),
    ])

  const planningItems = buildInventoryPlanning({
    ingredients,
    transactions: inventoryTransactions,
    lookbackDays: inventoryLookbackDays,
    asOf: generatedAt,
  }).sort(compareUrgency)
  const reorderItems = planningItems.filter((item) => item.reorderTriggered)
  const outOfStockCount = planningItems.filter(
    (item) => item.stockStatus.code === STOCK_STATUS.OUT_OF_STOCK,
  ).length
  const totalStockValue = ingredients.reduce(
    (total, ingredient) =>
      total + ingredient.stockQuantityBase * ingredient.averageCostPerBaseUnit,
    0,
  )

  const shortages = prepResult.preview.ingredients.filter((item) => !item.canSatisfy)
  const recommendations = prepResult.recommendations.filter((item) => item.suggestedServings > 0)

  const normalizedPurchaseOrders = purchaseOrders
    .map((order) => {
      const overdue =
        ['ORDERED', 'PARTIALLY_RECEIVED'].includes(order.status) &&
        order.expectedAt &&
        new Date(order.expectedAt) < asOfDayStart
      return {
        id: String(order._id),
        _id: String(order._id),
        orderNumber: order.orderNumber,
        supplierNameSnapshot: order.supplierNameSnapshot,
        status: order.status,
        expectedAt: order.expectedAt ?? null,
        remainingLineCount: order.items.filter(
          (item) => item.orderedQuantity - item.receivedQuantity > 0,
        ).length,
        overdue: Boolean(overdue),
      }
    })
    .sort((left, right) => {
      if (left.overdue !== right.overdue) return left.overdue ? -1 : 1
      if (left.expectedAt && right.expectedAt) {
        const dateDifference = new Date(left.expectedAt) - new Date(right.expectedAt)
        if (dateDifference) return dateDifference
      } else if (left.expectedAt) return -1
      else if (right.expectedAt) return 1
      return left.id.localeCompare(right.id)
    })
  const draftCount = normalizedPurchaseOrders.filter((order) => order.status === 'DRAFT').length
  const onOrderCount = normalizedPurchaseOrders.filter((order) => order.status !== 'DRAFT').length
  const overdueCount = normalizedPurchaseOrders.filter((order) => order.overdue).length

  const byReason = wasteGroups
    .map((group) => ({
      reasonCode: group._id,
      eventCount: group.eventCount,
      totalWasteValue: roundMoney(group.totalWasteValue),
    }))
    .sort(
      (left, right) =>
        right.totalWasteValue - left.totalWasteValue ||
        left.reasonCode.localeCompare(right.reasonCode),
    )
  const wasteEventCount = byReason.reduce((total, item) => total + item.eventCount, 0)
  const totalWasteValue = byReason.reduce((total, item) => total + item.totalWasteValue, 0)
  const recentTransactions = await mapRecentTransactions(recentRaw)

  return {
    meta: {
      asOf,
      generatedAt: generatedAt.toISOString(),
      salesDateFrom,
      salesDateTo,
      salesDays: 7,
      prepLookbackDays: 14,
      inventoryLookbackDays,
      wasteDateFrom,
      wasteDateTo,
    },
    attention: {
      prepShortageIngredientCount: shortages.length,
      reorderTriggeredCount: reorderItems.length,
      outOfStockCount,
      openPurchaseOrderCount: normalizedPurchaseOrders.length,
      overduePurchaseOrderCount: overdueCount,
    },
    sales: {
      summary: salesResult.summary,
      topMenuItems: salesResult.items.slice(0, DISPLAY_LIMIT),
    },
    prep: {
      recordedDayCount: prepResult.meta.recordedDayCount,
      dataSufficient: prepResult.meta.dataSufficient,
      recommendationCount: recommendations.length,
      totalSuggestedServings: recommendations.reduce(
        (total, item) => total + item.suggestedServings,
        0,
      ),
      shortageIngredientCount: prepResult.preview.summary.shortageIngredientCount,
      canPrepare: prepResult.preview.summary.canPrepare,
      shortages: shortages.slice(0, DISPLAY_LIMIT),
    },
    inventory: {
      ingredientCount: planningItems.length,
      totalStockValue: roundMoney(totalStockValue),
      outOfStockCount,
      reorderTriggeredCount: reorderItems.length,
      items: reorderItems.slice(0, DISPLAY_LIMIT),
    },
    purchasing: {
      openCount: normalizedPurchaseOrders.length,
      draftCount,
      onOrderCount,
      overdueCount,
      items: normalizedPurchaseOrders.slice(0, DISPLAY_LIMIT),
    },
    waste: {
      eventCount: wasteEventCount,
      totalWasteValue: roundMoney(totalWasteValue),
      byReason: byReason.slice(0, DISPLAY_LIMIT),
    },
    recentTransactions,
  }
}

module.exports = { getDashboardOverview, mapRecentTransactions }
