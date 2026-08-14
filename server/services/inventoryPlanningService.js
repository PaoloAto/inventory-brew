const { calculateStockStatus, STOCK_STATUS } = require('../domain/stockStatus')
const {
  CONSUMPTION_REASON_CODES,
  WASTE_REASON_CODES,
} = require('../domain/inventoryReasonCodes')

const DAY_MS = 24 * 60 * 60 * 1000

const finiteOrZero = (value) => (Number.isFinite(value) ? value : 0)

const getHistoryCoverageDays = ({ ingredient, lookbackDays, asOf, windowStart }) => {
  const createdAt = new Date(ingredient.createdAt)
  const coverageStart = Number.isNaN(createdAt.getTime()) || createdAt < windowStart ? windowStart : createdAt
  const days = Math.ceil((asOf - coverageStart) / DAY_MS)
  return Math.min(lookbackDays, Math.max(1, days))
}

const getCoverageStart = (ingredient, windowStart) => {
  const createdAt = new Date(ingredient.createdAt)
  return Number.isNaN(createdAt.getTime()) || createdAt < windowStart ? windowStart : createdAt
}

const classifyOutTransaction = (reasonCode) => {
  if (WASTE_REASON_CODES.includes(reasonCode)) return 'waste'
  if (!reasonCode || CONSUMPTION_REASON_CODES.includes(reasonCode)) return 'consumption'
  return 'otherOut'
}

const buildInventoryPlanning = ({ ingredients, transactions, lookbackDays, asOf = new Date() }) => {
  const currentAsOf = new Date(asOf)
  const windowStart = new Date(currentAsOf.getTime() - lookbackDays * DAY_MS)
  const transactionsByIngredient = new Map()

  for (const transaction of transactions) {
    const transactionDate = new Date(transaction.createdAt)
    if (Number.isNaN(transactionDate.getTime()) || transactionDate > currentAsOf) continue
    const ingredientId = String(transaction.ingredientId)
    const existing = transactionsByIngredient.get(ingredientId) || []
    existing.push(transaction)
    transactionsByIngredient.set(ingredientId, existing)
  }

  return ingredients.map((ingredient) => {
    const stockQuantity = finiteOrZero(ingredient.stockQuantity)
    const reorderLevel = finiteOrZero(ingredient.reorderLevel)
    const parLevel = finiteOrZero(ingredient.parLevel)
    const coverageStart = getCoverageStart(ingredient, windowStart)
    const metrics = { consumptionQuantity: 0, wasteQuantity: 0, otherOutQuantity: 0 }

    for (const transaction of transactionsByIngredient.get(String(ingredient._id)) || []) {
      const createdAt = new Date(transaction.createdAt)
      if (Number.isNaN(createdAt.getTime()) || createdAt < coverageStart) continue
      const quantity = finiteOrZero(transaction.quantity)
      const bucket = classifyOutTransaction(transaction.reasonCode)
      if (bucket === 'consumption') metrics.consumptionQuantity += quantity
      else if (bucket === 'waste') metrics.wasteQuantity += quantity
      else metrics.otherOutQuantity += quantity
    }

    const historyCoverageDays = getHistoryCoverageDays({ ingredient, lookbackDays, asOf: currentAsOf, windowStart })
    const depletionQuantity =
      metrics.consumptionQuantity + metrics.wasteQuantity + metrics.otherOutQuantity
    const averageDailyConsumption = metrics.consumptionQuantity / historyCoverageDays
    const averageDailyWaste = metrics.wasteQuantity / historyCoverageDays
    const averageDailyDepletion = depletionQuantity / historyCoverageDays
    const daysRemaining =
      stockQuantity <= 0
        ? 0
        : averageDailyDepletion > 0
          ? stockQuantity / averageDailyDepletion
          : null
    const reorderTriggered = reorderLevel > 0 && stockQuantity <= reorderLevel
    const daysUntilReorder =
      reorderLevel <= 0
        ? null
        : stockQuantity <= reorderLevel
          ? 0
          : averageDailyDepletion > 0
            ? (stockQuantity - reorderLevel) / averageDailyDepletion
            : null

    return {
      id: String(ingredient._id),
      name: ingredient.name,
      category: ingredient.category,
      unit: ingredient.unit,
      stockQuantity,
      reorderLevel,
      parLevel,
      preferredSupplier: ingredient.preferredSupplierId
        ? { id: String(ingredient.preferredSupplierId._id || ingredient.preferredSupplierId), name: ingredient.preferredSupplierId.name || '' }
        : null,
      stockStatus: calculateStockStatus({ stockQuantity, reorderLevel }),
      historyCoverageDays,
      dataSufficient: historyCoverageDays >= Math.min(7, lookbackDays),
      ...metrics,
      depletionQuantity,
      averageDailyConsumption,
      averageDailyWaste,
      averageDailyDepletion,
      daysRemaining,
      daysUntilReorder,
      reorderTriggered,
      parConfigured: parLevel > 0,
      suggestedReorderQuantity: reorderTriggered && parLevel > 0 ? Math.max(0, parLevel - stockQuantity) : null,
    }
  })
}

const compareUrgency = (left, right) => {
  const urgencyRank = (item) => {
    if (item.stockStatus.code === STOCK_STATUS.OUT_OF_STOCK) return 0
    if (item.reorderTriggered) return 1
    if (item.daysRemaining !== null) return 2
    return 3
  }
  const rankDifference = urgencyRank(left) - urgencyRank(right)
  if (rankDifference) return rankDifference
  if (left.daysRemaining !== null && right.daysRemaining !== null) {
    const runwayDifference = left.daysRemaining - right.daysRemaining
    if (runwayDifference) return runwayDifference
  }
  return left.name.localeCompare(right.name)
}

module.exports = { buildInventoryPlanning, compareUrgency, classifyOutTransaction }
