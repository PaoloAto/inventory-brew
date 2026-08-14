const crypto = require('crypto')
const mongoose = require('mongoose')
const PurchaseOrder = require('../models/PurchaseOrder')
const PurchaseReceipt = require('../models/PurchaseReceipt')
const { receiveStockBatchInSession, isTransactionUnsupportedError } = require('./inventoryService')

const createAppError = (status, code, message, details) => {
  const error = new Error(message)
  error.isAppError = true
  error.status = status
  error.code = code
  error.details = details
  return error
}

const getReceiptStatus = (items) => {
  if (items.every((item) => item.receivedQuantity === item.orderedQuantity)) return 'RECEIVED'
  if (items.some((item) => item.receivedQuantity > 0)) return 'PARTIALLY_RECEIVED'
  return 'ORDERED'
}

const receivePurchaseOrder = async ({ purchaseOrderId, receiptItems }) => {
  const session = await mongoose.startSession()
  const operationId = crypto.randomUUID()
  let result
  try {
    await session.withTransaction(async () => {
      const order = await PurchaseOrder.findById(purchaseOrderId).session(session)
      if (!order) throw createAppError(404, 'NOT_FOUND', 'Purchase order not found')
      if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(order.status)) {
        throw createAppError(409, 'INVALID_PO_STATE', 'Purchase order cannot receive stock in its current state')
      }
      const linesById = new Map(order.items.map((item) => [String(item._id), item]))
      const receiptLines = receiptItems.map((input) => {
        const item = linesById.get(String(input.purchaseOrderItemId))
        if (!item) throw createAppError(400, 'VALIDATION_ERROR', 'Receipt item does not belong to this purchase order')
        const remaining = item.orderedQuantity - item.receivedQuantity
        if (input.quantity > remaining) {
          throw createAppError(409, 'RECEIPT_CONFLICT', 'Receipt quantity exceeds the remaining purchase order quantity')
        }
        return { item, quantity: input.quantity, unitCost: input.unitCost }
      })

      const stockReceipt = await receiveStockBatchInSession({
        session,
        movements: receiptLines.map(({ item, quantity, unitCost }) => ({
          ingredientId: item.ingredientId,
          unit: item.unit,
          quantity,
          unitCost,
        })),
        reason: `Purchase receipt ${order.orderNumber}`,
        referenceId: order._id,
        operationId,
      })

      for (const { item, quantity } of receiptLines) item.receivedQuantity += quantity
      order.status = getReceiptStatus(order.items)
      if (order.status === 'RECEIVED') order.closedAt = new Date()
      await order.save({ session })

      const receiptItemsSnapshot = receiptLines.map(({ item, quantity, unitCost }) => ({
        purchaseOrderItemId: item._id,
        ingredientId: item.ingredientId,
        ingredientNameSnapshot: item.ingredientNameSnapshot,
        unit: item.unit,
        quantity,
        unitCost,
        lineTotal: quantity * unitCost,
      }))
      const [receipt] = await PurchaseReceipt.create(
        [{
          purchaseOrderId: order._id,
          orderNumberSnapshot: order.orderNumber,
          supplierId: order.supplierId,
          supplierNameSnapshot: order.supplierNameSnapshot,
          operationId,
          receivedAt: new Date(),
          items: receiptItemsSnapshot,
          totalValue: receiptItemsSnapshot.reduce((total, item) => total + item.lineTotal, 0),
        }],
        { session },
      )
      result = { purchaseOrder: order, purchaseReceipt: receipt, transactions: stockReceipt.transactions, operationId }
    })
    return result
  } catch (error) {
    if (error?.isAppError || isTransactionUnsupportedError(error)) throw error
    const message = String(error?.message || '').toLowerCase()
    if (message.includes('writeconflict') || message.includes('transienttransactionerror')) {
      throw createAppError(409, 'RECEIPT_CONFLICT', 'Purchase order receipt conflicted with another receipt. Please refresh and try again.')
    }
    throw error
  } finally {
    await session.endSession()
  }
}

module.exports = { receivePurchaseOrder, createAppError, getReceiptStatus }
