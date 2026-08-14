const mongoose = require('mongoose')
const Ingredient = require('../models/Ingredient')
const StocktakeSession = require('../models/StocktakeSession')
const { convertToBase } = require('../domain/units')
const {
  adjustPhysicalCountInSession,
  createOperationId,
} = require('./inventoryService')

const ABS_EPSILON = 1e-9
const REL_EPSILON = 1e-9

const approximatelyEqual = (left, right) =>
  Math.abs(left - right) <=
  Math.max(ABS_EPSILON, REL_EPSILON * Math.max(Math.abs(left), Math.abs(right), 1))

const appError = (status, code, message, details) => {
  const error = new Error(message)
  error.isAppError = true
  error.status = status
  error.code = code
  error.details = details
  return error
}

const startStocktake = async ({ name, notes }) => {
  const ingredients = await Ingredient.find({ isActive: true }).sort({ name: 1 }).lean()
  if (!ingredients.length) throw appError(400, 'NO_ACTIVE_INGREDIENTS', 'No active ingredients are available to count')
  const startedAt = new Date()
  return StocktakeSession.create({
    name,
    notes,
    status: 'DRAFT',
    startedAt,
    lines: ingredients.map((ingredient) => ({
      ingredientId: ingredient._id,
      ingredientNameSnapshot: ingredient.name,
      categorySnapshot: ingredient.category || '',
      unit: ingredient.unit,
      baseUnit: ingredient.baseUnit,
      expectedStockQuantitySnapshot: ingredient.stockQuantity,
      expectedStockQuantityBaseSnapshot: ingredient.stockQuantityBase,
      countedQuantity: null,
    })),
    summary: { lineCount: ingredients.length },
  })
}

const saveStocktakeCounts = async ({ stocktakeId, counts }) => {
  const stocktake = await StocktakeSession.findById(stocktakeId)
  if (!stocktake) throw appError(404, 'NOT_FOUND', 'Stock count not found')
  if (stocktake.status !== 'DRAFT') throw appError(409, 'INVALID_STOCKTAKE_STATE', 'Only an in-progress stock count can be changed')
  const lineMap = new Map(stocktake.lines.map((line) => [String(line.ingredientId), line]))
  const unknown = counts.filter((count) => !lineMap.has(String(count.ingredientId)))
  if (unknown.length) throw appError(400, 'VALIDATION_ERROR', 'Some count lines do not belong to this stock count', unknown.map((line) => String(line.ingredientId)))
  for (const count of counts) lineMap.get(String(count.ingredientId)).countedQuantity = count.countedQuantity
  await stocktake.save()
  return stocktake
}

const cancelStocktake = async (stocktakeId) => {
  const stocktake = await StocktakeSession.findOneAndUpdate(
    { _id: stocktakeId, status: 'DRAFT' },
    { $set: { status: 'CANCELLED', cancelledAt: new Date() } },
    { new: true },
  )
  if (stocktake) return stocktake
  const exists = await StocktakeSession.exists({ _id: stocktakeId })
  if (!exists) throw appError(404, 'NOT_FOUND', 'Stock count not found')
  throw appError(409, 'INVALID_STOCKTAKE_STATE', 'Only an in-progress stock count can be cancelled')
}

const postStocktake = async (stocktakeId) => {
  const session = await mongoose.startSession()
  let result
  try {
    await session.withTransaction(async () => {
      const stocktake = await StocktakeSession.findById(stocktakeId).session(session)
      if (!stocktake) throw appError(404, 'NOT_FOUND', 'Stock count not found')
      if (stocktake.status !== 'DRAFT') throw appError(409, 'INVALID_STOCKTAKE_STATE', 'Only an in-progress stock count can be completed')
      const uncounted = stocktake.lines.filter((line) => line.countedQuantity === null)
      if (uncounted.length) {
        throw appError(400, 'STOCKTAKE_INCOMPLETE', 'Every item must be counted before finishing', uncounted.map((line) => ({ ingredientId: String(line.ingredientId), ingredientName: line.ingredientNameSnapshot })))
      }

      const ingredients = await Ingredient.find({ _id: { $in: stocktake.lines.map((line) => line.ingredientId) } })
        .select('name unit baseUnit isActive stockQuantity stockQuantityBase costPerUnit')
        .session(session)
      const ingredientMap = new Map(ingredients.map((ingredient) => [String(ingredient._id), ingredient]))
      const conflicts = stocktake.lines.flatMap((line) => {
        const ingredient = ingredientMap.get(String(line.ingredientId))
        if (ingredient?.isActive && ingredient.unit === line.unit && ingredient.baseUnit === line.baseUnit && ingredient.stockQuantityBase === line.expectedStockQuantityBaseSnapshot) return []
        return [{
          ingredientId: String(line.ingredientId),
          ingredientName: line.ingredientNameSnapshot,
          unit: line.unit,
          expectedQuantity: line.expectedStockQuantitySnapshot,
          currentQuantity: ingredient?.stockQuantity ?? null,
        }]
      })
      if (conflicts.length) throw appError(409, 'STOCKTAKE_CONFLICT', 'Inventory changed after this stock count started', conflicts)

      const operationId = createOperationId()
      const summary = {
        lineCount: stocktake.lines.length,
        varianceLineCount: 0,
        shortageLineCount: 0,
        overageLineCount: 0,
        netVarianceValue: 0,
        absoluteVarianceValue: 0,
      }
      for (const line of stocktake.lines) {
        const ingredient = ingredientMap.get(String(line.ingredientId))
        const countedQuantityBase = convertToBase(line.countedQuantity, line.unit)
        const isZeroVariance = approximatelyEqual(
          countedQuantityBase,
          line.expectedStockQuantityBaseSnapshot,
        )
        const varianceQuantity = isZeroVariance ? 0 : line.countedQuantity - line.expectedStockQuantitySnapshot
        const varianceQuantityBase = isZeroVariance ? 0 : countedQuantityBase - line.expectedStockQuantityBaseSnapshot
        const unitCostSnapshot = ingredient.costPerUnit
        const varianceValue = isZeroVariance ? 0 : varianceQuantity * unitCostSnapshot
        line.countedQuantityBase = countedQuantityBase
        line.varianceQuantity = varianceQuantity
        line.varianceQuantityBase = varianceQuantityBase
        line.unitCostSnapshot = unitCostSnapshot
        line.varianceValue = varianceValue
        if (!isZeroVariance) {
          summary.varianceLineCount += 1
          if (varianceQuantity < 0) summary.shortageLineCount += 1
          else summary.overageLineCount += 1
          summary.netVarianceValue += varianceValue
          summary.absoluteVarianceValue += Math.abs(varianceValue)
          await adjustPhysicalCountInSession({
            session,
            ingredientId: line.ingredientId,
            displayUnit: line.unit,
            baseUnit: line.baseUnit,
            expectedCurrentStock: line.expectedStockQuantitySnapshot,
            expectedCurrentStockBase: line.expectedStockQuantityBaseSnapshot,
            newStockQuantity: line.countedQuantity,
            reason: `Stock Count: ${stocktake.name}`,
            unitCost: unitCostSnapshot,
            referenceType: 'stocktake',
            referenceId: stocktake._id,
            operationId,
          })
        }
      }
      stocktake.summary = summary
      stocktake.operationId = operationId
      stocktake.status = 'POSTED'
      stocktake.postedAt = new Date()
      await stocktake.save({ session })
      result = stocktake
    })
    return result
  } finally {
    await session.endSession()
  }
}

module.exports = { appError, startStocktake, saveStocktakeCounts, cancelStocktake, postStocktake }
