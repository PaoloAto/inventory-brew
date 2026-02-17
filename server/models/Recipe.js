const mongoose = require('mongoose')

const recipeIngredientSchema = new mongoose.Schema(
  {
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      required: true,
      enum: ['pcs', 'g', 'kg', 'ml', 'l'],
    },
  },
  { _id: false },
)

const recipeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    sellingPrice: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    ingredients: {
      type: [recipeIngredientSchema],
      default: [],
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: 'Recipe must contain at least one ingredient',
      },
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

recipeSchema.index({ name: 1 })
recipeSchema.index({ isActive: 1, name: 1 })
recipeSchema.index({ isActive: 1, updatedAt: -1 })
recipeSchema.index({ 'ingredients.ingredientId': 1 })

module.exports = mongoose.model('Recipe', recipeSchema)
