const mongoose = require('mongoose')

const isValidBusinessDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const salesLineSchema = new mongoose.Schema(
  {
    recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', required: true, immutable: true },
    recipeNameSnapshot: { type: String, required: true, immutable: true },
    yieldServingsSnapshot: { type: Number, required: true, min: 1, immutable: true },
    servingsSold: { type: Number, required: true, min: 1, immutable: true },
    sellingPricePerServingSnapshot: { type: Number, required: true, min: 0, immutable: true },
    costPerServingSnapshot: { type: Number, required: true, min: 0, immutable: true },
    estimatedRevenue: { type: Number, required: true, min: 0, immutable: true },
    estimatedFoodCost: { type: Number, required: true, min: 0, immutable: true },
    estimatedGrossProfit: { type: Number, required: true, immutable: true },
    grossMarginPercentSnapshot: { type: Number, default: null, immutable: true },
  },
  { _id: false },
)

const salesRecordSchema = new mongoose.Schema(
  {
    businessDate: {
      type: String,
      required: true,
      immutable: true,
      index: true,
      validate: { validator: isValidBusinessDate, message: 'businessDate must be a valid YYYY-MM-DD date' },
    },
    status: { type: String, enum: ['ACTIVE', 'CANCELLED'], default: 'ACTIVE', index: true },
    cancelledAt: { type: Date, default: null },
    lines: {
      type: [salesLineSchema],
      required: true,
      immutable: true,
      validate: { validator: (lines) => lines.length > 0, message: 'At least one sales line is required' },
    },
    totalServings: { type: Number, required: true, min: 1, immutable: true },
    totalRevenue: { type: Number, required: true, min: 0, immutable: true },
    totalEstimatedFoodCost: { type: Number, required: true, min: 0, immutable: true },
    totalEstimatedGrossProfit: { type: Number, required: true, immutable: true },
    grossMarginPercent: { type: Number, default: null, immutable: true },
  },
  { timestamps: true },
)

salesRecordSchema.index({ businessDate: -1, createdAt: -1 })
salesRecordSchema.index({ status: 1, businessDate: 1 })
salesRecordSchema.index({ 'lines.recipeId': 1, businessDate: 1 })

module.exports = mongoose.model('SalesRecord', salesRecordSchema)
