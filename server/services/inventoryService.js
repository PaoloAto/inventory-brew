const crypto = require('crypto')
const mongoose = require('mongoose')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')
const {
  convertToBase,
  getBaseUnit,
  getConversionFactor,
  costPerDisplayUnitToBase,
  costPerBaseUnitToDisplay,
} = require('../domain/units')

const createOperationId = () => crypto.randomUUID()

const isTransactionUnsupportedError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  return (
    message.includes('transaction numbers are only allowed on a replica set member or mongos') ||
    message.includes('transaction support is not available') ||
    message.includes('does not support transactions')
  )
}

const createAppError = (status, code, message, details) => {
  const error = new Error(message)
  error.isAppError = true
  error.status = status
  error.code = code
  error.details = details
  return error
}

const getUnavailableIngredientError = async ({ ingredientId, session, type }) => {
  const ingredient = await Ingredient.findById(ingredientId)
    .select('isActive stockQuantity stockQuantityBase')
    .session(session)

  if (!ingredient) return createAppError(404, 'NOT_FOUND', 'Ingredient not found')
  if (!ingredient.isActive) {
    return createAppError(409, 'INACTIVE_RESOURCE', 'Cannot adjust stock for an inactive ingredient')
  }
  if (type === 'OUT') {
    return createAppError(400, 'INSUFFICIENT_STOCK', 'Stock cannot go negative', [
      `Current stock is ${ingredient.stockQuantity}`,
    ])
  }
  return createAppError(409, 'STOCK_CHANGED', 'Stock changed while this adjustment was being reviewed')
}

const createIngredientWithInitialStock = async ({ ingredientData }) => {
  const session = await mongoose.startSession()
  const operationId = createOperationId()
  let result

  try {
    await session.withTransaction(async () => {
      const canonicalData = {
        ...ingredientData,
        baseUnit: getBaseUnit(ingredientData.unit),
        stockQuantityBase: convertToBase(ingredientData.stockQuantity, ingredientData.unit),
        reorderLevelBase: convertToBase(ingredientData.reorderLevel, ingredientData.unit),
        parLevelBase: convertToBase(ingredientData.parLevel ?? 0, ingredientData.unit),
        averageCostPerBaseUnit: costPerDisplayUnitToBase(
          ingredientData.costPerUnit,
          ingredientData.unit,
        ),
      }
      const [ingredient] = await Ingredient.create([canonicalData], { session })
      let transaction = null

      if (ingredient.stockQuantity > 0 && ingredient.isActive) {
        ;[transaction] = await InventoryTransaction.create(
          [
            {
              ingredientId: ingredient._id,
              type: 'IN',
              quantity: ingredient.stockQuantity,
              deltaQuantity: ingredient.stockQuantity,
              previousStock: 0,
              newStock: ingredient.stockQuantity,
              reason: 'Initial stock',
              reasonCode: 'INITIAL_STOCK',
              unitCost: ingredient.costPerUnit,
              referenceType: 'system',
              operationId,
            },
          ],
          { session },
        )
      }

      result = { ingredient, transaction, operationId }
    })

    return result
  } finally {
    await session.endSession()
  }
}

const adjustIngredientStock = async ({
  ingredientId,
  type,
  quantity,
  newStockQuantity,
  expectedCurrentStock,
  reason,
  reasonCode,
  unitCost,
}) => {
  const session = await mongoose.startSession()
  const operationId = createOperationId()
  let result

  try {
    await session.withTransaction(async () => {
      const current = await Ingredient.findById(ingredientId)
        .select(
          'unit baseUnit isActive stockQuantity stockQuantityBase costPerUnit averageCostPerBaseUnit',
        )
        .session(session)
      if (!current || !current.isActive) {
        throw await getUnavailableIngredientError({ ingredientId, session, type })
      }

      const factor = getConversionFactor(current.unit)
      const expectedBaseUnit = getBaseUnit(current.unit)
      const currentStockBase =
        current.stockQuantityBase ?? convertToBase(current.stockQuantity, current.unit)
      const currentAverageBase =
        current.averageCostPerBaseUnit ?? costPerDisplayUnitToBase(current.costPerUnit, current.unit)
      const filter = { _id: ingredientId, isActive: true, unit: current.unit, baseUnit: expectedBaseUnit }
      let update
      let defaultReasonCode

      if (type === 'IN') {
        const quantityBase = convertToBase(quantity, current.unit)
        if (unitCost === undefined) {
          update = {
            $inc: { stockQuantity: quantity, stockQuantityBase: quantityBase },
          }
        } else {
          const receiptCostBase = costPerDisplayUnitToBase(unitCost, current.unit)
          const newAverageExpression = {
            $divide: [
              {
                $add: [
                  { $multiply: [{ $ifNull: ['$stockQuantityBase', currentStockBase] }, currentAverageBase] },
                  quantityBase * receiptCostBase,
                ],
              },
              { $add: [{ $ifNull: ['$stockQuantityBase', currentStockBase] }, quantityBase] },
            ],
          }
          update = [
            {
              $set: {
                stockQuantity: { $add: ['$stockQuantity', quantity] },
                stockQuantityBase: {
                  $add: [{ $ifNull: ['$stockQuantityBase', currentStockBase] }, quantityBase],
                },
                averageCostPerBaseUnit: newAverageExpression,
              },
            },
            { $set: { costPerUnit: { $multiply: ['$averageCostPerBaseUnit', factor] } } },
          ]
        }
        defaultReasonCode = 'MANUAL_RECEIPT'
      } else if (type === 'OUT') {
        const quantityBase = convertToBase(quantity, current.unit)
        filter.stockQuantityBase = { $gte: quantityBase }
        update = { $inc: { stockQuantity: -quantity, stockQuantityBase: -quantityBase } }
        defaultReasonCode = 'MANUAL_USAGE'
      } else {
        filter.stockQuantity = expectedCurrentStock
        update = {
          $set: {
            stockQuantity: newStockQuantity,
            stockQuantityBase: convertToBase(newStockQuantity, current.unit),
          },
        }
        defaultReasonCode = 'PHYSICAL_COUNT'
      }

      const previous = await Ingredient.findOneAndUpdate(filter, update, {
        new: false,
        session,
        updatePipeline: Array.isArray(update),
      })
      if (!previous) {
        throw await getUnavailableIngredientError({ ingredientId, session, type })
      }

      const previousStock = previous.stockQuantity
      const newStock = type === 'IN' ? previousStock + quantity : type === 'OUT' ? previousStock - quantity : newStockQuantity
      const deltaQuantity = newStock - previousStock
      const transactionQuantity = Math.abs(deltaQuantity)
      const [transaction] = await InventoryTransaction.create(
        [
          {
            ingredientId: previous._id,
            type,
            quantity: transactionQuantity,
            deltaQuantity,
            previousStock,
            newStock,
            reason,
            reasonCode: reasonCode || defaultReasonCode,
            unitCost:
              type === 'IN' || type === 'OUT'
                ? (unitCost ?? previous.costPerUnit)
                : unitCost,
            referenceType: 'manual',
            operationId,
          },
        ],
        { session },
      )

      const ingredient = await Ingredient.findById(previous._id).session(session)
      result = { ingredient, transaction, operationId }
    })

    return result
  } finally {
    await session.endSession()
  }
}

const consumeStockBatchInSession = async ({
  session,
  movements,
  reason,
  reasonCode,
  referenceType,
  referenceId,
  operationId = createOperationId(),
}) => {
  const consumption = []

  for (const movement of movements) {
    const previous = await Ingredient.findOneAndUpdate(
      {
        _id: movement.ingredientId,
        isActive: true,
        unit: movement.displayUnit,
        baseUnit: movement.baseUnit,
        stockQuantityBase: { $gte: movement.quantityBase },
      },
      {
        $inc: {
          stockQuantity: -movement.quantity,
          stockQuantityBase: -movement.quantityBase,
        },
      },
      { new: false, session },
    ).select('name stockQuantity stockQuantityBase costPerUnit averageCostPerBaseUnit')

    if (!previous) {
      throw createAppError(
        400,
        'INSUFFICIENT_STOCK',
        'Stock changed while cooking. Please try again.',
        [`${movement.ingredientName || String(movement.ingredientId)}: unable to reserve required quantity`],
      )
    }

    const previousStock = previous.stockQuantity
    const newStock = previousStock - movement.quantity
    consumption.push({
      ingredientId: previous._id,
      ingredientName: previous.name,
      unit: movement.displayUnit,
      requiredQuantity: movement.quantity,
      requiredQuantityBase: movement.quantityBase,
      previousStock,
      newStock,
      costPerUnit:
        movement.costPerUnit ??
        costPerBaseUnitToDisplay(previous.averageCostPerBaseUnit, movement.displayUnit),
    })
  }

  const transactions = await InventoryTransaction.insertMany(
    consumption.map((entry) => ({
      ingredientId: entry.ingredientId,
      type: 'OUT',
      quantity: entry.requiredQuantity,
      deltaQuantity: -entry.requiredQuantity,
      previousStock: entry.previousStock,
      newStock: entry.newStock,
      reason,
      reasonCode,
      unitCost: entry.costPerUnit,
      referenceType,
      referenceId,
      operationId,
    })),
    { session },
  )

  return { consumption, transactions, operationId }
}

// Caller-owned transaction helper for receipt workflows. Keeping this here makes
// every stock receipt use the same canonical weighted-average cost calculation.
const receiveStockBatchInSession = async ({
  session,
  movements,
  reason,
  reasonCode = 'PURCHASE_RECEIPT',
  referenceType = 'purchase',
  referenceId,
  operationId = createOperationId(),
}) => {
  const received = []

  for (const movement of movements) {
    const current = await Ingredient.findById(movement.ingredientId)
      .select('name unit baseUnit isActive stockQuantity stockQuantityBase costPerUnit averageCostPerBaseUnit')
      .session(session)
    if (!current || !current.isActive || current.unit !== movement.unit) {
      throw createAppError(409, 'STOCK_CHANGED', 'Ingredient is unavailable for this receipt')
    }

    const quantityBase = convertToBase(movement.quantity, current.unit)
    const factor = getConversionFactor(current.unit)
    const currentStockBase = current.stockQuantityBase ?? convertToBase(current.stockQuantity, current.unit)
    const currentAverageBase =
      current.averageCostPerBaseUnit ?? costPerDisplayUnitToBase(current.costPerUnit, current.unit)
    const receiptCostBase = costPerDisplayUnitToBase(movement.unitCost, current.unit)
    const newAverageExpression = {
      $divide: [
        {
          $add: [
            { $multiply: [{ $ifNull: ['$stockQuantityBase', currentStockBase] }, currentAverageBase] },
            quantityBase * receiptCostBase,
          ],
        },
        { $add: [{ $ifNull: ['$stockQuantityBase', currentStockBase] }, quantityBase] },
      ],
    }
    const previous = await Ingredient.findOneAndUpdate(
      { _id: current._id, isActive: true, unit: current.unit, baseUnit: getBaseUnit(current.unit) },
      [
        {
          $set: {
            stockQuantity: { $add: ['$stockQuantity', movement.quantity] },
            stockQuantityBase: { $add: [{ $ifNull: ['$stockQuantityBase', currentStockBase] }, quantityBase] },
            averageCostPerBaseUnit: newAverageExpression,
          },
        },
        { $set: { costPerUnit: { $multiply: ['$averageCostPerBaseUnit', factor] } } },
      ],
      { new: false, session, updatePipeline: true },
    )
    if (!previous) throw createAppError(409, 'STOCK_CHANGED', 'Stock changed while this receipt was being recorded')

    received.push({
      ingredientId: previous._id,
      ingredientName: previous.name,
      unit: current.unit,
      quantity: movement.quantity,
      unitCost: movement.unitCost,
      previousStock: previous.stockQuantity,
      newStock: previous.stockQuantity + movement.quantity,
    })
  }

  const transactions = await InventoryTransaction.insertMany(
    received.map((entry) => ({
      ingredientId: entry.ingredientId,
      type: 'IN',
      quantity: entry.quantity,
      deltaQuantity: entry.quantity,
      previousStock: entry.previousStock,
      newStock: entry.newStock,
      reason,
      reasonCode,
      unitCost: entry.unitCost,
      referenceType,
      referenceId,
      operationId,
    })),
    { session },
  )
  return { received, transactions, operationId }
}

module.exports = {
  createOperationId,
  createIngredientWithInitialStock,
  adjustIngredientStock,
  consumeStockBatchInSession,
  receiveStockBatchInSession,
  isTransactionUnsupportedError,
}
