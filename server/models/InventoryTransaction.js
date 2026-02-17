const mongoose = require('mongoose')

const inventoryTransactionSchema = new mongoose.Schema(
  {
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['IN', 'OUT', 'ADJUST'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    previousStock: {
      type: Number,
      required: true,
      min: 0,
    },
    newStock: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      trim: true,
      default: '',
    },
    unitCost: {
      type: Number,
      min: 0,
    },
    referenceType: {
      type: String,
      enum: ['recipe', 'manual', 'purchase', 'system'],
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
  },
  {
    timestamps: true,
  },
)

inventoryTransactionSchema.index({ ingredientId: 1, createdAt: -1 })
inventoryTransactionSchema.index({ type: 1, createdAt: -1 })
inventoryTransactionSchema.index({ createdAt: -1 })
inventoryTransactionSchema.index({ referenceType: 1, referenceId: 1, createdAt: -1 })

module.exports = mongoose.model('InventoryTransaction', inventoryTransactionSchema)
