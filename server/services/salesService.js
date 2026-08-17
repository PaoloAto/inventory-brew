const Ingredient = require('../models/Ingredient')
const Recipe = require('../models/Recipe')
const SalesRecord = require('../models/SalesRecord')
const { calculateRecipeMetrics } = require('./recipeMetricsService')

const appError = (status, code, message, details) => {
  const error = new Error(message)
  error.isAppError = true
  error.status = status
  error.code = code
  error.details = details
  return error
}

const createSalesRecord = async ({ businessDate, lines }) => {
  const recipeIds = lines.map((line) => String(line.recipeId))
  const recipes = await Recipe.find({ _id: { $in: recipeIds } })
  const recipeMap = new Map(recipes.map((recipe) => [String(recipe._id), recipe]))
  const unavailable = recipeIds
    .filter((id) => !recipeMap.get(id)?.isActive)
    .map((id) => {
      const recipe = recipeMap.get(id)
      return recipe ? `Menu item "${recipe.name}" (${id}) is inactive` : `Menu item ${id} was not found`
    })

  if (unavailable.length > 0) {
    throw appError(
      409,
      'SALES_RECIPE_UNAVAILABLE',
      'One or more menu items are no longer available for sales recording',
      unavailable,
    )
  }

  const ingredientIds = [
    ...new Set(recipes.flatMap((recipe) => recipe.ingredients.map((line) => String(line.ingredientId)))),
  ]
  const ingredients = await Ingredient.find({ _id: { $in: ingredientIds } }).select(
    'name unit baseUnit isActive averageCostPerBaseUnit',
  )
  const ingredientMap = new Map(ingredients.map((ingredient) => [String(ingredient._id), ingredient]))

  const metricsByRecipe = new Map()
  const costingIssues = []
  for (const recipe of recipes) {
    const result = calculateRecipeMetrics(recipe, ingredientMap)
    if (!result.configuration.isValid || !result.computed) {
      const issues = result.configuration.issues.map((issue) => issue.message).join('; ')
      costingIssues.push(`Menu item "${recipe.name}" (${recipe._id}) cannot be costed: ${issues}`)
    } else {
      metricsByRecipe.set(String(recipe._id), result.computed)
    }
  }

  if (costingIssues.length > 0) {
    throw appError(
      409,
      'SALES_COSTING_UNAVAILABLE',
      'Cost information is unavailable for one or more menu items',
      costingIssues,
    )
  }

  const snapshotLines = lines.map(({ recipeId, servingsSold }) => {
    const recipe = recipeMap.get(String(recipeId))
    const computed = metricsByRecipe.get(String(recipeId))
    const sellingPrice = recipe.sellingPrice
    const costPerServing = computed.costPerServing
    const estimatedRevenue = servingsSold * sellingPrice
    const estimatedFoodCost = servingsSold * costPerServing
    const estimatedGrossProfit = estimatedRevenue - estimatedFoodCost

    return {
      recipeId: recipe._id,
      recipeNameSnapshot: recipe.name,
      yieldServingsSnapshot: recipe.yieldServings,
      servingsSold,
      sellingPricePerServingSnapshot: sellingPrice,
      costPerServingSnapshot: costPerServing,
      estimatedRevenue,
      estimatedFoodCost,
      estimatedGrossProfit,
      grossMarginPercentSnapshot:
        estimatedRevenue === 0 ? null : (estimatedGrossProfit / estimatedRevenue) * 100,
    }
  })

  const totals = snapshotLines.reduce(
    (sum, line) => ({
      totalServings: sum.totalServings + line.servingsSold,
      totalRevenue: sum.totalRevenue + line.estimatedRevenue,
      totalEstimatedFoodCost: sum.totalEstimatedFoodCost + line.estimatedFoodCost,
      totalEstimatedGrossProfit: sum.totalEstimatedGrossProfit + line.estimatedGrossProfit,
    }),
    { totalServings: 0, totalRevenue: 0, totalEstimatedFoodCost: 0, totalEstimatedGrossProfit: 0 },
  )

  return SalesRecord.create({
    businessDate,
    lines: snapshotLines,
    ...totals,
    grossMarginPercent:
      totals.totalRevenue === 0 ? null : (totals.totalEstimatedGrossProfit / totals.totalRevenue) * 100,
  })
}

const getSalesSummary = async ({ dateFrom, dateTo }) => {
  const items = await SalesRecord.aggregate([
    { $match: { status: 'ACTIVE', businessDate: { $gte: dateFrom, $lte: dateTo } } },
    { $sort: { businessDate: -1, createdAt: -1 } },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.recipeId',
        recipeName: { $first: '$lines.recipeNameSnapshot' },
        servingsSold: { $sum: '$lines.servingsSold' },
        estimatedRevenue: { $sum: '$lines.estimatedRevenue' },
        estimatedFoodCost: { $sum: '$lines.estimatedFoodCost' },
        estimatedGrossProfit: { $sum: '$lines.estimatedGrossProfit' },
      },
    },
    {
      $addFields: {
        grossMarginPercent: {
          $cond: [
            { $eq: ['$estimatedRevenue', 0] },
            null,
            { $multiply: [{ $divide: ['$estimatedGrossProfit', '$estimatedRevenue'] }, 100] },
          ],
        },
      },
    },
    { $sort: { estimatedRevenue: -1, recipeName: 1 } },
    {
      $project: {
        _id: 0,
        recipeId: '$_id',
        recipeName: 1,
        servingsSold: 1,
        estimatedRevenue: 1,
        estimatedFoodCost: 1,
        estimatedGrossProfit: 1,
        grossMarginPercent: 1,
      },
    },
  ])
  const summary = items.reduce(
    (sum, item) => ({
      totalServings: sum.totalServings + item.servingsSold,
      totalRevenue: sum.totalRevenue + item.estimatedRevenue,
      totalEstimatedFoodCost: sum.totalEstimatedFoodCost + item.estimatedFoodCost,
      totalEstimatedGrossProfit: sum.totalEstimatedGrossProfit + item.estimatedGrossProfit,
      grossMarginPercent: null,
    }),
    {
      totalServings: 0,
      totalRevenue: 0,
      totalEstimatedFoodCost: 0,
      totalEstimatedGrossProfit: 0,
      grossMarginPercent: null,
    },
  )
  summary.grossMarginPercent =
    summary.totalRevenue === 0
      ? null
      : (summary.totalEstimatedGrossProfit / summary.totalRevenue) * 100
  return { summary, items }
}

module.exports = { createSalesRecord, getSalesSummary }
