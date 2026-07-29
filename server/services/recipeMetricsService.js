const roundTo = (value, decimalPlaces) => Number(value.toFixed(decimalPlaces))

const calculateRecipeMetrics = (recipe, ingredientMap) => {
  const issues = []
  let ingredientCost = 0

  for (const line of recipe.ingredients || []) {
    const ingredientId = String(line.ingredientId)
    const ingredient = ingredientMap.get(ingredientId)
    const quantity = Number(line.quantity)

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

    if (ingredient.unit !== line.unit) {
      issues.push({
        code: 'UNIT_MISMATCH',
        ingredientId,
        ingredientName: ingredient.name,
        message: `Unit mismatch for "${ingredient.name}": expected ${ingredient.unit}, got ${line.unit}`,
      })
    }

    if (Number.isFinite(quantity) && quantity > 0) {
      ingredientCost += quantity * ingredient.costPerUnit
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
  const grossMargin = sellingPrice - ingredientCost
  const roundedGrossMargin = roundTo(grossMargin, 4)

  return {
    computed: {
      ingredientCost: roundTo(ingredientCost, 4),
      costPerServing: roundTo(ingredientCost, 4),
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
