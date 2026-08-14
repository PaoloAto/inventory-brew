const mongoose = require('mongoose')

const stocktakeLineSchema = new mongoose.Schema(
  {
    ingredientId: { type: mongoose.Schema.Types.ObjectId, required: true },
    ingredientNameSnapshot: { type: String, required: true },
    categorySnapshot: { type: String, default: '' },
    unit: { type: String, required: true, enum: ['pcs', 'g', 'kg', 'ml', 'l'] },
    baseUnit: { type: String, required: true, enum: ['pcs', 'g', 'ml'] },
    expectedStockQuantitySnapshot: { type: Number, required: true, min: 0 },
    expectedStockQuantityBaseSnapshot: { type: Number, required: true, min: 0 },
    countedQuantity: { type: Number, default: null, min: 0 },
    countedQuantityBase: { type: Number, default: null, min: 0 },
    varianceQuantity: { type: Number, default: null },
    varianceQuantityBase: { type: Number, default: null },
    unitCostSnapshot: { type: Number, default: null, min: 0 },
    varianceValue: { type: Number, default: null },
  },
  { _id: false },
)

const summarySchema = new mongoose.Schema(
  {
    lineCount: { type: Number, required: true, min: 0 },
    varianceLineCount: { type: Number, default: 0, min: 0 },
    shortageLineCount: { type: Number, default: 0, min: 0 },
    overageLineCount: { type: Number, default: 0, min: 0 },
    netVarianceValue: { type: Number, default: 0 },
    absoluteVarianceValue: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
)

const stocktakeSessionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    notes: { type: String, trim: true, default: '' },
    status: { type: String, required: true, enum: ['DRAFT', 'POSTED', 'CANCELLED'], default: 'DRAFT' },
    operationId: { type: String, default: null, index: true },
    startedAt: { type: Date, required: true },
    postedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    lines: { type: [stocktakeLineSchema], required: true },
    summary: { type: summarySchema, required: true },
  },
  { timestamps: true },
)

stocktakeSessionSchema.index({ startedAt: -1 })
stocktakeSessionSchema.index({ status: 1, startedAt: -1 })

module.exports = mongoose.model('StocktakeSession', stocktakeSessionSchema)
