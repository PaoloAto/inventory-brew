const mongoose = require('mongoose')

const ingredientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    manufacturer: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    unit: {
      type: String,
      required: true,
      enum: ['pcs', 'g', 'kg', 'ml', 'l'],
    },
    stockQuantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    costPerUnit: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    reorderLevel: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
)

ingredientSchema.index({ isActive: 1, name: 1 })
ingredientSchema.index({ isActive: 1, category: 1 })
ingredientSchema.index({ updatedAt: -1 })

module.exports = mongoose.model('Ingredient', ingredientSchema)
