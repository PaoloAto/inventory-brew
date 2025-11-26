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
    },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model('Ingredient', ingredientSchema)
