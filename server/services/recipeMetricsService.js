const { areUnitsCompatible } = require('../domain/units')

const roundTo = (value, decimalPlaces) => Number(value.toFixed(decimalPlaces))

const calculateRecipeMetrics = (recipe, ingredientMap) => {
  const issues = []
  let batchCost = 0

  for (const line of recipe.ingredients || []) {
    const ingredientId = String(line.ingredientId)
    const ingredient = ingredientMap.get(ingredientId)
    const quantity = Number(line.quantity)
    const quantityBase = Number(line.quantityBase)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      issues.push({
        code: 'INVALID_QUANTITY',
        ingredientId,
        ingredientName: ingredient?.name,
        message: `Ingredient quantity must be greater than 0 for "${ingredient?.name || ingredientId}"`,
      })
    }

    if (!ingredient) {
      issues.push({
        code: 'MISSING_INGREDIENT',
        ingredientId,
        message: `Ingredient ${ingredientId} does not exist`,
      })
      continue
    }

    if (!ingredient.isActive) {
      issues.push({
        code: 'INACTIVE_INGREDIENT',
        ingredientId,
        ingredientName: ingredient.name,
        message: `Ingredient "${ingredient.name}" is inactive`,
      })
    }

    if (!areUnitsCompatible(ingredient.unit, line.unit)) {
      issues.push({
        code: 'UNIT_MISMATCH',
        ingredientId,
        ingredientName: ingredient.name,
        message: `Unit mismatch for "${ingredient.name}": expected ${ingredient.unit}, got ${line.unit}`,
      })
    }

    if (!Number.isFinite(quantityBase) || quantityBase <= 0) {
      issues.push({
        code: 'INVALID_QUANTITY',
        ingredientId,
        ingredientName: ingredient.name,
        message: `Canonical ingredient quantity is missing or invalid for "${ingredient.name}"`,
      })
    } else if (!Number.isFinite(ingredient.averageCostPerBaseUnit)) {
      issues.push({
        code: 'INVALID_COST',
        ingredientId,
        ingredientName: ingredient.name,
        message: `Canonical ingredient cost is missing or invalid for "${ingredient.name}"`,
      })
    } else {
      batchCost += quantityBase * ingredient.averageCostPerBaseUnit
    }
  }

  const configuration = {
    isValid: issues.length === 0,
    issues,
  }

  if (!configuration.isValid) {
    return {
      computed: null,
      configuration,
    }
  }

  const sellingPrice = Number(recipe.sellingPrice)
  const yieldServings = Number(recipe.yieldServings)
  if (!Number.isInteger(yieldServings) || yieldServings < 1) {
    return {
      computed: null,
      configuration: {
        isValid: false,
        issues: [
          ...issues,
          {
            code: 'INVALID_YIELD',
            message: 'Recipe batch yield must be a positive integer',
          },
        ],
      },
    }
  }
  const costPerServing = batchCost / yieldServings
  const grossMargin = sellingPrice - costPerServing
  const roundedGrossMargin = roundTo(grossMargin, 4)

  return {
    computed: {
      batchCost: roundTo(batchCost, 4),
      ingredientCost: roundTo(batchCost, 4),
      costPerServing: roundTo(costPerServing, 4),
      grossMargin: roundedGrossMargin,
      // Temporary compatibility alias for clients using the previous field name.
      margin: roundedGrossMargin,
      marginPercent: sellingPrice === 0 ? null : roundTo((grossMargin / sellingPrice) * 100, 2),
    },
    configuration,
  }
}

module.exports = {
  calculateRecipeMetrics,
}
