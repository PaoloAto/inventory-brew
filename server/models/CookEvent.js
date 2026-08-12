const mongoose = require('mongoose')

const cookIngredientSchema = new mongoose.Schema(
  {
    ingredientId: { type: mongoose.Schema.Types.ObjectId, required: true },
    ingredientNameSnapshot: { type: String, required: true },
    displayUnit: { type: String, required: true, enum: ['pcs', 'g', 'kg', 'ml', 'l'] },
    baseUnit: { type: String, required: true, enum: ['pcs', 'g', 'ml'] },
    quantity: { type: Number, required: true, min: 0 },
    quantityBase: { type: Number, required: true, min: 0 },
    costPerUnitSnapshot: { type: Number, required: true, min: 0 },
    averageCostPerBaseUnitSnapshot: { type: Number, required: true, min: 0 },
    lineCost: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const cookEventSchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, trim: true },
    recipeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    recipeNameSnapshot: { type: String, required: true },
    servings: { type: Number, required: true, min: 1, validate: Number.isInteger },
    yieldServingsSnapshot: { type: Number, required: true, min: 1, validate: Number.isInteger },
    sellingPricePerServingSnapshot: { type: Number, required: true, min: 0 },
    totalIngredientCost: { type: Number, required: true, min: 0 },
    expectedRevenue: { type: Number, required: true, min: 0 },
    grossMarginTotal: { type: Number, required: true },
    costPerServingSnapshot: { type: Number, required: true, min: 0 },
    grossMarginPerServingSnapshot: { type: Number, required: true },
    marginPercentSnapshot: { type: Number, default: null },
    ingredients: { type: [cookIngredientSchema], required: true },
  },
  { timestamps: true },
)

cookEventSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
)
cookEventSchema.index({ createdAt: -1 })
cookEventSchema.index({ recipeId: 1, createdAt: -1 })

module.exports = mongoose.model('CookEvent', cookEventSchema)
