const crypto = require('crypto')
const mongoose = require('mongoose')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')

const createOperationId = () => crypto.randomUUID()

const createAppError = (status, code, message, details) => {
  const error = new Error(message)
  error.isAppError = true
  error.status = status
  error.code = code
  error.details = details
  return error
}

const getUnavailableIngredientError = async ({ ingredientId, session, type }) => {
  const ingredient = await Ingredient.findById(ingredientId).select('isActive stockQuantity').session(session)

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
      const [ingredient] = await Ingredient.create([ingredientData], { session })
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

const adjustIngredientStock = async ({ ingredientId, type, quantity, newStockQuantity, expectedCurrentStock, reason, reasonCode, unitCost }) => {
  const session = await mongoose.startSession()
  const operationId = createOperationId()
  let result

  try {
    await session.withTransaction(async () => {
      const filter = { _id: ingredientId, isActive: true }
      let update
      let defaultReasonCode

      if (type === 'IN') {
        update = { $inc: { stockQuantity: quantity } }
        defaultReasonCode = 'MANUAL_RECEIPT'
      } else if (type === 'OUT') {
        filter.stockQuantity = { $gte: quantity }
        update = { $inc: { stockQuantity: -quantity } }
        defaultReasonCode = 'MANUAL_USAGE'
      } else {
        filter.stockQuantity = expectedCurrentStock
        update = { $set: { stockQuantity: newStockQuantity } }
        defaultReasonCode = 'PHYSICAL_COUNT'
      }

      const previous = await Ingredient.findOneAndUpdate(filter, update, { new: false, session })
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
            unitCost: type === 'IN' ? (unitCost ?? previous.costPerUnit) : unitCost,
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
        unit: movement.unit,
        stockQuantity: { $gte: movement.quantity },
      },
      { $inc: { stockQuantity: -movement.quantity } },
      { new: false, session },
    ).select('name stockQuantity costPerUnit')

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
      unit: movement.unit,
      requiredQuantity: movement.quantity,
      previousStock,
      newStock,
      costPerUnit: movement.costPerUnit ?? previous.costPerUnit,
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

module.exports = {
  createOperationId,
  createIngredientWithInitialStock,
  adjustIngredientStock,
  consumeStockBatchInSession,
}
