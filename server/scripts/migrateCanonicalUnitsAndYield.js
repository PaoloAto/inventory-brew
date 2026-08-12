require('dotenv').config()
const mongoose = require('mongoose')
const Ingredient = require('../models/Ingredient')
const Recipe = require('../models/Recipe')
const {
  UNIT_DEFINITIONS,
  getBaseUnit,
  convertToBase,
  costPerDisplayUnitToBase,
} = require('../domain/units')

const EPSILON = 1e-8
const isFiniteNonNegative = (value) => Number.isFinite(value) && value >= 0
const isMissing = (value) => value === undefined || value === null

const inspectDocuments = (ingredients, recipes, { projected = false } = {}) => {
  const invalid = []
  let displayValue = 0
  let canonicalValue = 0
  let ingredientsNeedingUpdate = 0
  let recipesNeedingUpdate = 0

  for (const ingredient of ingredients) {
    if (!UNIT_DEFINITIONS[ingredient.unit]) {
      invalid.push({ type: 'ingredient', id: String(ingredient._id), issue: `Unknown unit ${ingredient.unit}` })
      continue
    }
    const derived = {
      baseUnit: getBaseUnit(ingredient.unit),
      stockQuantityBase: convertToBase(ingredient.stockQuantity, ingredient.unit),
      reorderLevelBase: convertToBase(ingredient.reorderLevel ?? 0, ingredient.unit),
      averageCostPerBaseUnit: costPerDisplayUnitToBase(ingredient.costPerUnit, ingredient.unit),
    }
    if (Object.keys(derived).some((key) => isMissing(ingredient[key]))) ingredientsNeedingUpdate += 1
    displayValue += Number(ingredient.stockQuantity) * Number(ingredient.costPerUnit)
    const stockBase = projected && isMissing(ingredient.stockQuantityBase)
      ? derived.stockQuantityBase
      : ingredient.stockQuantityBase
    const averageBase = projected && isMissing(ingredient.averageCostPerBaseUnit)
      ? derived.averageCostPerBaseUnit
      : ingredient.averageCostPerBaseUnit
    if (Number.isFinite(stockBase) && Number.isFinite(averageBase)) canonicalValue += stockBase * averageBase
  }

  for (const recipe of recipes) {
    let needsUpdate = isMissing(recipe.yieldServings)
    if (!isMissing(recipe.yieldServings) && (!Number.isInteger(recipe.yieldServings) || recipe.yieldServings < 1)) {
      invalid.push({ type: 'recipe', id: String(recipe._id), issue: 'Invalid yieldServings' })
    }
    for (const [index, line] of (recipe.ingredients || []).entries()) {
      if (!UNIT_DEFINITIONS[line.unit]) {
        invalid.push({ type: 'recipeLine', id: String(recipe._id), index, issue: `Unknown unit ${line.unit}` })
        continue
      }
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        invalid.push({ type: 'recipeLine', id: String(recipe._id), index, issue: 'Invalid quantity' })
      }
      if (isMissing(line.quantityBase) || isMissing(line.baseUnit)) needsUpdate = true
    }
    if (needsUpdate) recipesNeedingUpdate += 1
  }

  return {
    ingredientCount: ingredients.length,
    recipeCount: recipes.length,
    ingredientsNeedingUpdate,
    recipesNeedingUpdate,
    displayValue,
    canonicalValue,
    valuationDifference: canonicalValue - displayValue,
    invalid,
    sample: {
      ingredients: ingredients.slice(0, 3).map((item) => ({
        id: String(item._id),
        unit: item.unit,
        stockQuantity: item.stockQuantity,
        stockQuantityBase: item.stockQuantityBase,
      })),
      recipes: recipes.slice(0, 3).map((item) => ({
        id: String(item._id),
        yieldServings: item.yieldServings,
        lineCount: item.ingredients?.length ?? 0,
      })),
    },
  }
}

const loadDocuments = async () =>
  Promise.all([
    Ingredient.collection.find({}).toArray(),
    Recipe.collection.find({}).toArray(),
  ])

const applyMigration = async (ingredients, recipes) => {
  for (const ingredient of ingredients) {
    const derived = {
      baseUnit: getBaseUnit(ingredient.unit),
      stockQuantityBase: convertToBase(ingredient.stockQuantity, ingredient.unit),
      reorderLevelBase: convertToBase(ingredient.reorderLevel ?? 0, ingredient.unit),
      averageCostPerBaseUnit: costPerDisplayUnitToBase(ingredient.costPerUnit, ingredient.unit),
    }
    const updates = Object.fromEntries(
      Object.entries(derived).filter(([key]) => isMissing(ingredient[key])),
    )
    if (Object.keys(updates).length > 0) {
      await Ingredient.collection.updateOne({ _id: ingredient._id }, { $set: updates })
    }
  }

  for (const recipe of recipes) {
    const updates = {}
    if (isMissing(recipe.yieldServings)) updates.yieldServings = 1
    if (
      (recipe.ingredients || []).some(
        (line) => isMissing(line.quantityBase) || isMissing(line.baseUnit),
      )
    ) {
      updates.ingredients = recipe.ingredients.map((line) => ({
        ...line,
        quantityBase: isMissing(line.quantityBase)
          ? convertToBase(line.quantity, line.unit)
          : line.quantityBase,
        baseUnit: isMissing(line.baseUnit) ? getBaseUnit(line.unit) : line.baseUnit,
      }))
    }
    if (Object.keys(updates).length > 0) {
      await Recipe.collection.updateOne({ _id: recipe._id }, { $set: updates })
    }
  }
}

const verifyDocuments = (ingredients, recipes) => {
  const report = inspectDocuments(ingredients, recipes)
  const errors = [...report.invalid]

  for (const ingredient of ingredients.filter((item) => item.isActive !== false)) {
    if (
      !UNIT_DEFINITIONS[ingredient.unit] ||
      ingredient.baseUnit !== getBaseUnit(ingredient.unit) ||
      !isFiniteNonNegative(ingredient.stockQuantityBase) ||
      !isFiniteNonNegative(ingredient.reorderLevelBase) ||
      !isFiniteNonNegative(ingredient.averageCostPerBaseUnit)
    ) {
      errors.push({ type: 'ingredient', id: String(ingredient._id), issue: 'Invalid canonical fields' })
    }
  }

  for (const recipe of recipes) {
    if (!Number.isInteger(recipe.yieldServings) || recipe.yieldServings < 1) {
      errors.push({ type: 'recipe', id: String(recipe._id), issue: 'Invalid yieldServings' })
    }
    for (const [index, line] of (recipe.ingredients || []).entries()) {
      if (
        !UNIT_DEFINITIONS[line.unit] ||
        line.baseUnit !== getBaseUnit(line.unit) ||
        !Number.isFinite(line.quantityBase) ||
        line.quantityBase <= 0
      ) {
        errors.push({ type: 'recipeLine', id: String(recipe._id), index, issue: 'Invalid canonical fields' })
      }
    }
  }

  if (Math.abs(report.valuationDifference) > EPSILON) {
    errors.push({
      type: 'valuation',
      issue: `Display and canonical valuation differ by ${report.valuationDifference}`,
    })
  }

  return { ...report, ok: errors.length === 0, errors }
}

const runMigration = async (mode) => {
  const [ingredients, recipes] = await loadDocuments()
  if (mode === 'dry-run') return { mode, ...inspectDocuments(ingredients, recipes, { projected: true }) }
  if (mode === 'verify') return { mode, ...verifyDocuments(ingredients, recipes) }
  if (mode !== 'apply') throw new Error(`Unknown migration mode: ${mode}`)

  const before = inspectDocuments(ingredients, recipes, { projected: true })
  if (before.invalid.length > 0) {
    throw new Error(`Migration refused ${before.invalid.length} invalid or unknown-unit record(s)`)
  }
  await applyMigration(ingredients, recipes)
  const [updatedIngredients, updatedRecipes] = await loadDocuments()
  return { mode, before, after: verifyDocuments(updatedIngredients, updatedRecipes) }
}

const runCli = async () => {
  const flags = process.argv.slice(2)
  const modes = { '--dry-run': 'dry-run', '--apply': 'apply', '--verify': 'verify' }
  const selected = flags.filter((flag) => modes[flag])
  if (selected.length !== 1) throw new Error('Specify exactly one of --dry-run, --apply, or --verify')
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/inventory-brew')
  try {
    const report = await runMigration(modes[selected[0]])
    console.log(JSON.stringify(report, null, 2))
    if (report.mode === 'verify' && !report.ok) process.exitCode = 1
    if (report.mode === 'apply' && !report.after.ok) process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { runMigration, inspectDocuments, verifyDocuments }
