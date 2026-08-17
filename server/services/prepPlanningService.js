const Ingredient = require('../models/Ingredient')
const Recipe = require('../models/Recipe')
const SalesRecord = require('../models/SalesRecord')
const { convertFromBase } = require('../domain/units')
const { buildProductionPlan } = require('./productionService')

const appError = (status, code, message, details) => {
  const error = new Error(message)
  error.isAppError = true
  error.status = status
  error.code = code
  error.details = details
  return error
}

const shiftDateOnly = (value, days) => {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

const emptyPreview = () => ({
  summary: {
    recipeCount: 0,
    totalPlannedServings: 0,
    ingredientCount: 0,
    shortageIngredientCount: 0,
    estimatedIngredientCost: 0,
    canPrepare: true,
  },
  ingredients: [],
})

const buildPrepPreview = async ({ recipes, lines }) => {
  if (lines.length === 0) return emptyPreview()

  const ingredientIds = [
    ...new Set(recipes.flatMap((recipe) => recipe.ingredients.map((line) => String(line.ingredientId)))),
  ]
  const ingredients = await Ingredient.find({ _id: { $in: ingredientIds } })
    .populate('preferredSupplierId', 'name isActive')
    .lean()
  const ingredientMap = new Map(ingredients.map((ingredient) => [String(ingredient._id), ingredient]))
  const recipeMap = new Map(recipes.map((recipe) => [String(recipe._id), recipe]))
  const aggregateRequirements = new Map()
  const configurationDetails = []

  for (const line of lines) {
    const recipe = recipeMap.get(String(line.recipeId))
    const plan = buildProductionPlan({ recipe, ingredients, servings: line.servings })
    if (plan.configurationErrors.length > 0) {
      configurationDetails.push(
        `Menu item "${recipe.name}" cannot be checked: ${plan.configurationErrors.join('; ')}`,
      )
      continue
    }

    for (const requirement of plan.requirements) {
      const ingredientId = String(requirement.ingredientId)
      const existing = aggregateRequirements.get(ingredientId)
      if (existing) existing.requiredQuantityBase += requirement.requiredQuantityBase
      else {
        aggregateRequirements.set(ingredientId, {
          ingredientId,
          requiredQuantityBase: requirement.requiredQuantityBase,
        })
      }
    }
  }

  if (configurationDetails.length > 0) {
    throw appError(
      409,
      'PREP_CONFIGURATION_UNAVAILABLE',
      'Ingredient needs are unavailable for one or more menu items',
      configurationDetails,
    )
  }

  const requirementRows = [...aggregateRequirements.values()]
    .map(({ ingredientId, requiredQuantityBase }) => {
      const ingredient = ingredientMap.get(ingredientId)
      const availableQuantityBase = ingredient.stockQuantityBase
      const shortfallBase = Math.max(0, requiredQuantityBase - availableQuantityBase)
      const preferredSupplier = ingredient.preferredSupplierId?.isActive === true
        ? {
            id: String(ingredient.preferredSupplierId._id),
            name: ingredient.preferredSupplierId.name,
          }
        : null

      return {
        ingredientId,
        ingredientName: ingredient.name,
        unit: ingredient.unit,
        baseUnit: ingredient.baseUnit,
        requiredQuantity: convertFromBase(requiredQuantityBase, ingredient.unit),
        requiredQuantityBase,
        availableQuantity: convertFromBase(availableQuantityBase, ingredient.unit),
        availableQuantityBase,
        shortfall: convertFromBase(shortfallBase, ingredient.unit),
        shortfallBase,
        canSatisfy: availableQuantityBase >= requiredQuantityBase,
        preferredSupplier,
        estimatedIngredientCost: requiredQuantityBase * ingredient.averageCostPerBaseUnit,
      }
    })
    .sort((left, right) => left.ingredientName.localeCompare(right.ingredientName))

  const shortageIngredientCount = requirementRows.filter((item) => !item.canSatisfy).length
  return {
    summary: {
      recipeCount: lines.length,
      totalPlannedServings: lines.reduce((sum, line) => sum + line.servings, 0),
      ingredientCount: requirementRows.length,
      shortageIngredientCount,
      estimatedIngredientCost: requirementRows.reduce(
        (sum, item) => sum + item.estimatedIngredientCost,
        0,
      ),
      canPrepare: shortageIngredientCount === 0,
    },
    ingredients: requirementRows.map(({ estimatedIngredientCost, ...item }) => item),
  }
}

const getPrepPlan = async ({ asOf, lookbackDays }) => {
  const historyDateFrom = shiftDateOnly(asOf, -lookbackDays)
  const historyDateTo = shiftDateOnly(asOf, -1)
  const [recipes, records] = await Promise.all([
    Recipe.find({ isActive: true }).sort({ name: 1 }).lean(),
    SalesRecord.find({
      status: 'ACTIVE',
      businessDate: { $gte: historyDateFrom, $lte: historyDateTo },
    })
      .select('businessDate lines.recipeId lines.servingsSold')
      .lean(),
  ])

  const recordedBusinessDates = new Set(records.map((record) => record.businessDate))
  const recordedDayCount = recordedBusinessDates.size
  const salesByRecipe = new Map()
  for (const record of records) {
    for (const line of record.lines) {
      const recipeId = String(line.recipeId)
      salesByRecipe.set(recipeId, (salesByRecipe.get(recipeId) || 0) + line.servingsSold)
    }
  }

  const recommendations = recipes
    .map((recipe) => {
      const recentServingsSold = salesByRecipe.get(String(recipe._id)) || 0
      const averageDailySales = recordedDayCount === 0 ? 0 : recentServingsSold / recordedDayCount
      return {
        recipeId: String(recipe._id),
        recipeName: recipe.name,
        recentServingsSold,
        averageDailySales: Number(averageDailySales.toFixed(4)),
        suggestedServings: recordedDayCount === 0 ? 0 : Math.ceil(averageDailySales),
      }
    })
    .sort(
      (left, right) =>
        right.suggestedServings - left.suggestedServings ||
        left.recipeName.localeCompare(right.recipeName),
    )

  const suggestedLines = recommendations
    .filter((item) => item.suggestedServings > 0)
    .map((item) => ({ recipeId: item.recipeId, servings: item.suggestedServings }))
  const previewRecipes = recipes.filter((recipe) =>
    suggestedLines.some((line) => line.recipeId === String(recipe._id)),
  )
  const preview = await buildPrepPreview({ recipes: previewRecipes, lines: suggestedLines })

  return {
    meta: {
      asOf,
      historyDateFrom,
      historyDateTo,
      lookbackDays,
      recordedDayCount,
      dataSufficient: recordedDayCount >= 5,
    },
    recommendations,
    preview,
  }
}

const previewPrepPlan = async (lines) => {
  const recipeIds = lines.map((line) => String(line.recipeId))
  const recipes = await Recipe.find({ _id: { $in: recipeIds } }).lean()
  const recipeMap = new Map(recipes.map((recipe) => [String(recipe._id), recipe]))
  const unavailable = recipeIds
    .filter((recipeId) => !recipeMap.get(recipeId)?.isActive)
    .map((recipeId) => {
      const recipe = recipeMap.get(recipeId)
      return recipe
        ? `Menu item "${recipe.name}" (${recipeId}) is inactive`
        : `Menu item ${recipeId} was not found`
    })
  if (unavailable.length > 0) {
    throw appError(
      409,
      'PREP_RECIPE_UNAVAILABLE',
      'One or more menu items are unavailable for prep planning',
      unavailable,
    )
  }

  return buildPrepPreview({ recipes, lines })
}

module.exports = { getPrepPlan, previewPrepPlan, shiftDateOnly }
