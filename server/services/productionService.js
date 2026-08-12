const { areUnitsCompatible, convertFromBase, getBaseUnit } = require('../domain/units')

const FLOOR_EPSILON = 1e-9

const buildProductionPlan = ({ recipe, ingredients, servings }) => {
  const configurationErrors = []
  const ingredientMap = new Map(ingredients.map((ingredient) => [String(ingredient._id), ingredient]))
  const mergedLines = new Map()

  if (!Number.isInteger(recipe.yieldServings) || recipe.yieldServings < 1) {
    configurationErrors.push('Recipe batch yield must be a positive integer')
  }

  for (const [index, line] of (recipe.ingredients || []).entries()) {
    const ingredientId = String(line.ingredientId)
    if (!Number.isFinite(line.quantityBase) || line.quantityBase <= 0) {
      configurationErrors.push(`Recipe line ${index + 1} has an invalid canonical quantity`)
      continue
    }
    if (line.baseUnit !== getBaseUnit(line.unit)) {
      configurationErrors.push(`Recipe line ${index + 1} has an invalid canonical base unit`)
      continue
    }
    const existing = mergedLines.get(ingredientId)
    if (existing && existing.baseUnit !== line.baseUnit) {
      configurationErrors.push(`Recipe contains conflicting units for ingredient ${ingredientId}`)
      continue
    }
    if (existing) existing.quantityBasePerBatch += line.quantityBase
    else {
      mergedLines.set(ingredientId, {
        ingredientId: line.ingredientId,
        lineUnit: line.unit,
        baseUnit: line.baseUnit,
        quantityBasePerBatch: line.quantityBase,
      })
    }
  }

  const requirements = []
  for (const line of mergedLines.values()) {
    const ingredient = ingredientMap.get(String(line.ingredientId))
    if (!ingredient) {
      configurationErrors.push(`Ingredient ${String(line.ingredientId)} no longer exists`)
      continue
    }
    if (!ingredient.isActive) {
      configurationErrors.push(`Ingredient "${ingredient.name}" is inactive and cannot be consumed`)
      continue
    }
    if (
      !areUnitsCompatible(ingredient.unit, line.lineUnit) ||
      ingredient.baseUnit !== line.baseUnit ||
      !Number.isFinite(ingredient.stockQuantityBase) ||
      !Number.isFinite(ingredient.averageCostPerBaseUnit)
    ) {
      configurationErrors.push(`Ingredient "${ingredient.name}" has invalid canonical configuration`)
      continue
    }

    const requiredQuantityBase = (line.quantityBasePerBatch * servings) / recipe.yieldServings
    const requiredQuantity = convertFromBase(requiredQuantityBase, ingredient.unit)
    const availableQuantityBase = ingredient.stockQuantityBase
    const availableQuantity = convertFromBase(availableQuantityBase, ingredient.unit)
    const shortfallBase = Math.max(0, requiredQuantityBase - availableQuantityBase)
    requirements.push({
      ingredientId: ingredient._id,
      ingredientName: ingredient.name,
      unit: ingredient.unit,
      baseUnit: ingredient.baseUnit,
      quantityBasePerBatch: line.quantityBasePerBatch,
      requiredQuantity,
      requiredQuantityBase,
      availableQuantity,
      availableQuantityBase,
      shortfall: convertFromBase(shortfallBase, ingredient.unit),
      shortfallBase,
      canSatisfy: shortfallBase <= FLOOR_EPSILON,
      costPerUnit: ingredient.costPerUnit,
      averageCostPerBaseUnit: ingredient.averageCostPerBaseUnit,
      estimatedLineCost: requiredQuantityBase * ingredient.averageCostPerBaseUnit,
    })
  }

  return {
    configurationErrors,
    requirements,
    canCook: configurationErrors.length === 0 && requirements.every((item) => item.canSatisfy),
    estimatedIngredientCost: requirements.reduce((sum, item) => sum + item.estimatedLineCost, 0),
  }
}

const calculateMaxCookableServings = ({ recipe, requirements }) => {
  if (!Number.isInteger(recipe.yieldServings) || recipe.yieldServings < 1 || requirements.length === 0) {
    return 0
  }
  return Math.max(
    0,
    Math.min(
      ...requirements.map((item) =>
        Math.floor(
          (item.availableQuantityBase * recipe.yieldServings) / item.quantityBasePerBatch +
            FLOOR_EPSILON,
        ),
      ),
    ),
  )
}

const buildCookEventSnapshot = ({ recipe, servings, requirements, operationId, idempotencyKey }) => {
  const totalIngredientCost = requirements.reduce((sum, item) => sum + item.estimatedLineCost, 0)
  const expectedRevenue = recipe.sellingPrice * servings
  const grossMarginTotal = expectedRevenue - totalIngredientCost
  const costPerServingSnapshot = totalIngredientCost / servings
  const grossMarginPerServingSnapshot = grossMarginTotal / servings

  return {
    operationId,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    recipeId: recipe._id,
    recipeNameSnapshot: recipe.name,
    servings,
    yieldServingsSnapshot: recipe.yieldServings,
    sellingPricePerServingSnapshot: recipe.sellingPrice,
    totalIngredientCost,
    expectedRevenue,
    grossMarginTotal,
    costPerServingSnapshot,
    grossMarginPerServingSnapshot,
    marginPercentSnapshot:
      recipe.sellingPrice === 0
        ? null
        : (grossMarginPerServingSnapshot / recipe.sellingPrice) * 100,
    ingredients: requirements.map((item) => ({
      ingredientId: item.ingredientId,
      ingredientNameSnapshot: item.ingredientName,
      displayUnit: item.unit,
      baseUnit: item.baseUnit,
      quantity: item.requiredQuantity,
      quantityBase: item.requiredQuantityBase,
      costPerUnitSnapshot: item.costPerUnit,
      averageCostPerBaseUnitSnapshot: item.averageCostPerBaseUnit,
      lineCost: item.estimatedLineCost,
    })),
  }
}

module.exports = { buildProductionPlan, calculateMaxCookableServings, buildCookEventSnapshot }
