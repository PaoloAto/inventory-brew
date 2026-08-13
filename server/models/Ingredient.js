const mongoose = require('mongoose')
const {
  getBaseUnit,
  convertToBase,
  costPerDisplayUnitToBase,
} = require('../domain/units')

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
    baseUnit: {
      type: String,
      enum: ['pcs', 'g', 'ml'],
    },
    stockQuantityBase: {
      type: Number,
      min: 0,
    },
    costPerUnit: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    averageCostPerBaseUnit: {
      type: Number,
      min: 0,
    },
    reorderLevel: {
      type: Number,
      default: 0,
      min: 0,
    },
    reorderLevelBase: {
      type: Number,
      min: 0,
    },
    parLevel: {
      type: Number,
      min: 0,
    },
    parLevelBase: {
      type: Number,
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

ingredientSchema.pre('validate', function populateCanonicalIngredientFields() {
  if (!this.unit) return
  if (this.baseUnit === undefined) this.baseUnit = getBaseUnit(this.unit)
  if (this.stockQuantityBase === undefined) {
    this.stockQuantityBase = convertToBase(this.stockQuantity, this.unit)
  }
  if (this.reorderLevelBase === undefined) {
    this.reorderLevelBase = convertToBase(this.reorderLevel, this.unit)
  }
  if (this.parLevel !== undefined && this.parLevelBase === undefined) {
    this.parLevelBase = convertToBase(this.parLevel, this.unit)
  }
  if (this.averageCostPerBaseUnit === undefined) {
    this.averageCostPerBaseUnit = costPerDisplayUnitToBase(this.costPerUnit, this.unit)
  }
})

ingredientSchema.index({ isActive: 1, name: 1 })
ingredientSchema.index({ isActive: 1, category: 1 })
ingredientSchema.index({ updatedAt: -1 })

module.exports = mongoose.model('Ingredient', ingredientSchema)
