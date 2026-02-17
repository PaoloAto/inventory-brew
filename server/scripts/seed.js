require('dotenv').config()
const mongoose = require('mongoose')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')
const Recipe = require('../models/Recipe')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/inventory-brew'

const INGREDIENT_SEED = [
  { name: 'Carrot', manufacturer: 'Fresh Farms', category: 'Vegetable', unit: 'pcs', stockQuantity: 120, costPerUnit: 3.2, reorderLevel: 30, isActive: true },
  { name: 'Olive Oil', manufacturer: 'Mediterranea', category: 'Oil', unit: 'ml', stockQuantity: 5000, costPerUnit: 0.03, reorderLevel: 800, isActive: true },
  { name: 'Chicken Breast', manufacturer: 'Poultry Co.', category: 'Meat', unit: 'g', stockQuantity: 10000, costPerUnit: 0.12, reorderLevel: 2000, isActive: true },
  { name: 'Lettuce', manufacturer: 'Green Leaf', category: 'Vegetable', unit: 'g', stockQuantity: 2500, costPerUnit: 0.02, reorderLevel: 500, isActive: true },
  { name: 'Garlic', manufacturer: 'Spice Valley', category: 'Spice', unit: 'g', stockQuantity: 800, costPerUnit: 0.05, reorderLevel: 150, isActive: true },
  { name: 'Rice', manufacturer: 'Golden Grain', category: 'Grain', unit: 'g', stockQuantity: 12000, costPerUnit: 0.01, reorderLevel: 3000, isActive: true },
]

const RECIPE_TEMPLATES = [
  {
    name: 'Carrot Salad',
    description: 'Light salad with fresh carrots and olive oil.',
    sellingPrice: 115,
    ingredients: [
      { ingredientName: 'Carrot', quantity: 2, unit: 'pcs' },
      { ingredientName: 'Lettuce', quantity: 80, unit: 'g' },
      { ingredientName: 'Olive Oil', quantity: 15, unit: 'ml' },
    ],
  },
  {
    name: 'Chicken Rice Bowl',
    description: 'Grilled chicken with garlic rice.',
    sellingPrice: 240,
    ingredients: [
      { ingredientName: 'Chicken Breast', quantity: 180, unit: 'g' },
      { ingredientName: 'Rice', quantity: 250, unit: 'g' },
      { ingredientName: 'Garlic', quantity: 8, unit: 'g' },
      { ingredientName: 'Olive Oil', quantity: 5, unit: 'ml' },
    ],
  },
  {
    name: 'Garlic Rice',
    description: 'Aromatic garlic rice side dish.',
    sellingPrice: 95,
    ingredients: [
      { ingredientName: 'Rice', quantity: 200, unit: 'g' },
      { ingredientName: 'Garlic', quantity: 12, unit: 'g' },
      { ingredientName: 'Olive Oil', quantity: 4, unit: 'ml' },
    ],
  },
]

const dryRun = process.argv.includes('--dry-run')

const buildRecipeDocs = (ingredientMap) => {
  return RECIPE_TEMPLATES.map((template) => ({
    name: template.name,
    description: template.description,
    sellingPrice: template.sellingPrice,
    isActive: true,
    ingredients: template.ingredients.map((line) => {
      const ingredient = ingredientMap.get(line.ingredientName)
      if (!ingredient) {
        throw new Error(`Missing ingredient "${line.ingredientName}" required by recipe "${template.name}"`)
      }
      return {
        ingredientId: ingredient._id,
        quantity: line.quantity,
        unit: line.unit,
      }
    }),
  }))
}

const applySampleCook = async ({ recipe, servings }) => {
  const ingredientDocs = await Ingredient.find({
    _id: { $in: recipe.ingredients.map((line) => line.ingredientId) },
  }).select('stockQuantity costPerUnit name')

  const ingredientMap = new Map(ingredientDocs.map((doc) => [String(doc._id), doc]))
  const reason = `Cook: ${recipe.name} x ${servings} (seed)`
  const transactions = []

  for (const line of recipe.ingredients) {
    const ingredient = ingredientMap.get(String(line.ingredientId))
    if (!ingredient) continue

    const quantity = Number((line.quantity * servings).toFixed(4))
    const previousStock = ingredient.stockQuantity
    const newStock = Number((previousStock - quantity).toFixed(4))

    ingredient.stockQuantity = newStock
    await ingredient.save()

    transactions.push({
      ingredientId: ingredient._id,
      type: 'OUT',
      quantity,
      previousStock,
      newStock,
      reason,
      unitCost: ingredient.costPerUnit,
      referenceType: 'recipe',
      referenceId: recipe._id,
    })
  }

  if (transactions.length > 0) {
    await InventoryTransaction.insertMany(transactions)
  }
}

const seed = async () => {
  await mongoose.connect(MONGO_URI)
  console.log(`Connected to MongoDB: ${MONGO_URI}`)

  try {
    if (dryRun) {
      console.log('[dry-run] Seed preview')
      console.log(`Ingredients: ${INGREDIENT_SEED.length}`)
      console.log(`Recipes: ${RECIPE_TEMPLATES.length}`)
      return
    }

    await Promise.all([Ingredient.deleteMany({}), Recipe.deleteMany({}), InventoryTransaction.deleteMany({})])

    const ingredients = await Ingredient.insertMany(INGREDIENT_SEED)
    const ingredientMap = new Map(ingredients.map((item) => [item.name, item]))

    const initialTransactions = ingredients.map((ingredient) => ({
      ingredientId: ingredient._id,
      type: 'IN',
      quantity: ingredient.stockQuantity,
      previousStock: 0,
      newStock: ingredient.stockQuantity,
      reason: 'Initial stock (seed)',
      unitCost: ingredient.costPerUnit,
      referenceType: 'system',
    }))
    await InventoryTransaction.insertMany(initialTransactions)

    const recipeDocs = buildRecipeDocs(ingredientMap)
    const recipes = await Recipe.insertMany(recipeDocs)

    const chickenRiceBowl = recipes.find((recipe) => recipe.name === 'Chicken Rice Bowl')
    if (chickenRiceBowl) {
      await applySampleCook({ recipe: chickenRiceBowl, servings: 3 })
    }

    const [ingredientCount, recipeCount, transactionCount] = await Promise.all([
      Ingredient.countDocuments({}),
      Recipe.countDocuments({}),
      InventoryTransaction.countDocuments({}),
    ])

    console.log('Seed completed')
    console.log(`Ingredients: ${ingredientCount}`)
    console.log(`Recipes: ${recipeCount}`)
    console.log(`Transactions: ${transactionCount}`)
  } finally {
    await mongoose.disconnect()
    console.log('Disconnected from MongoDB')
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error.message)
  process.exit(1)
})
