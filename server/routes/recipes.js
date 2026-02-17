const express = require('express')
const mongoose = require('mongoose')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')
const Recipe = require('../models/Recipe')

const router = express.Router()

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const ALLOWED_UNITS = ['pcs', 'g', 'kg', 'ml', 'l']
const ALLOWED_SORT_FIELDS = ['name', 'sellingPrice', 'createdAt', 'updatedAt']
const CREATE_ALLOWED_FIELDS = new Set(['name', 'description', 'sellingPrice', 'ingredients', 'isActive'])
const UPDATE_ALLOWED_FIELDS = new Set(['name', 'description', 'sellingPrice', 'ingredients'])

const sendError = (res, status, code, message, details) => {
  const error = { code, message }
  if (details && details.length > 0) error.details = details
  return res.status(status).json({ error })
}

const createAppError = (status, code, message, details) => {
  const error = new Error(message)
  error.isAppError = true
  error.status = status
  error.code = code
  error.details = details
  return error
}

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 1) return fallback
  return parsed
}

const parseBoolean = (value) => {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value

  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes'].includes(normalized)) return true
  if (['false', '0', 'no'].includes(normalized)) return false
  return undefined
}

const parsePositiveServings = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) return undefined
  return parsed
}

const escapeRegExp = (input) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const resolveSort = (sortBy, sortOrder) => {
  const normalizedSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'name'
  const normalizedSortOrder = String(sortOrder).toLowerCase() === 'desc' ? -1 : 1
  return { [normalizedSortBy]: normalizedSortOrder }
}

const getUnknownFields = (payload, allowedFields) => {
  return Object.keys(payload || {}).filter((field) => !allowedFields.has(field))
}

const normalizeOptionalString = (value, fieldName, details) => {
  if (value === undefined) return undefined
  if (value === null || value === '') return ''
  if (typeof value !== 'string') {
    details.push(`${fieldName} must be a string`)
    return undefined
  }
  return value.trim()
}

const normalizeRequiredString = (value, fieldName, details) => {
  if (typeof value !== 'string' || value.trim() === '') {
    details.push(`${fieldName} is required and must be a non-empty string`)
    return undefined
  }
  return value.trim()
}

const normalizeNonNegativeNumber = (value, fieldName, details, fallback) => {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    details.push(`${fieldName} must be a non-negative number`)
    return undefined
  }
  return parsed
}

const ensureValidRecipeId = (res, id) => {
  if (!mongoose.isValidObjectId(id)) {
    sendError(res, 400, 'INVALID_ID', 'Invalid recipe id')
    return false
  }
  return true
}

const normalizeIngredientLines = (rawLines, details, fieldName = 'ingredients') => {
  if (!Array.isArray(rawLines)) {
    details.push(`${fieldName} must be an array`)
    return []
  }

  if (rawLines.length === 0) {
    details.push(`${fieldName} must contain at least one ingredient line`)
    return []
  }

  const byIngredient = new Map()

  rawLines.forEach((line, index) => {
    const linePrefix = `${fieldName}[${index}]`

    if (!line || typeof line !== 'object') {
      details.push(`${linePrefix} must be an object`)
      return
    }

    const lineKeys = Object.keys(line)
    const unknown = lineKeys.filter((key) => !['ingredientId', 'quantity', 'unit'].includes(key))
    if (unknown.length > 0) {
      details.push(`${linePrefix} has unknown field(s): ${unknown.join(', ')}`)
    }

    const ingredientId = String(line.ingredientId || '')
    if (!mongoose.isValidObjectId(ingredientId)) {
      details.push(`${linePrefix}.ingredientId must be a valid id`)
      return
    }

    const quantity = Number(line.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      details.push(`${linePrefix}.quantity must be a positive number`)
      return
    }

    const unit = typeof line.unit === 'string' ? line.unit.trim() : ''
    if (!ALLOWED_UNITS.includes(unit)) {
      details.push(`${linePrefix}.unit must be one of: ${ALLOWED_UNITS.join(', ')}`)
      return
    }

    if (byIngredient.has(ingredientId)) {
      const existing = byIngredient.get(ingredientId)
      if (existing.unit !== unit) {
        details.push(`${linePrefix} duplicates ingredient ${ingredientId} with a different unit`)
        return
      }
      existing.quantity += quantity
      return
    }

    byIngredient.set(ingredientId, {
      ingredientId: new mongoose.Types.ObjectId(ingredientId),
      quantity,
      unit,
    })
  })

  return [...byIngredient.values()]
}

const validateRecipePayload = ({ payload, isCreate }) => {
  const details = []
  const allowedFields = isCreate ? CREATE_ALLOWED_FIELDS : UPDATE_ALLOWED_FIELDS
  const unknownFields = getUnknownFields(payload, allowedFields)
  if (unknownFields.length > 0) details.push(`Unknown field(s): ${unknownFields.join(', ')}`)

  if (!isCreate && Object.keys(payload || {}).length === 0) {
    details.push('At least one updatable field is required')
  }

  const value = {}

  if (isCreate || payload.name !== undefined) {
    const name = normalizeRequiredString(payload.name, 'name', details)
    if (name !== undefined) value.name = name
  }

  if (isCreate || payload.description !== undefined) {
    const description = normalizeOptionalString(payload.description, 'description', details)
    value.description = description ?? ''
  }

  if (isCreate || payload.sellingPrice !== undefined) {
    const sellingPrice = normalizeNonNegativeNumber(payload.sellingPrice, 'sellingPrice', details, 0)
    if (sellingPrice !== undefined) value.sellingPrice = sellingPrice
  }

  if (isCreate || payload.ingredients !== undefined) {
    const ingredientLines = normalizeIngredientLines(payload.ingredients, details)
    if (ingredientLines.length > 0) value.ingredients = ingredientLines
  }

  if (isCreate && payload.isActive !== undefined) {
    if (typeof payload.isActive !== 'boolean') {
      details.push('isActive must be a boolean when provided')
    } else {
      value.isActive = payload.isActive
    }
  }

  return { details, value }
}

const validateIngredientReferences = async (ingredientLines) => {
  const details = []

  const ingredientIds = ingredientLines.map((line) => line.ingredientId)
  const ingredientDocs = await Ingredient.find({ _id: { $in: ingredientIds } }).select('name unit isActive costPerUnit')

  const ingredientMap = new Map(ingredientDocs.map((ingredient) => [String(ingredient._id), ingredient]))

  ingredientLines.forEach((line) => {
    const ingredient = ingredientMap.get(String(line.ingredientId))

    if (!ingredient) {
      details.push(`Ingredient ${String(line.ingredientId)} does not exist`)
      return
    }

    if (!ingredient.isActive) {
      details.push(`Ingredient "${ingredient.name}" is inactive and cannot be used in recipes`)
      return
    }

    if (ingredient.unit !== line.unit) {
      details.push(`Unit mismatch for ingredient "${ingredient.name}": expected ${ingredient.unit}, got ${line.unit}`)
    }
  })

  return { details, ingredientMap }
}

const computeRecipeMetrics = (recipeDoc, ingredientMap) => {
  const ingredients = recipeDoc.ingredients || []
  const recipeCost = ingredients.reduce((sum, line) => {
    const ingredient = ingredientMap.get(String(line.ingredientId))
    const costPerUnit = ingredient ? ingredient.costPerUnit : 0
    return sum + line.quantity * costPerUnit
  }, 0)

  const margin = recipeDoc.sellingPrice - recipeCost
  const marginPercent = recipeDoc.sellingPrice > 0 ? (margin / recipeDoc.sellingPrice) * 100 : 0

  return {
    costPerServing: Number(recipeCost.toFixed(4)),
    margin: Number(margin.toFixed(4)),
    marginPercent: Number(marginPercent.toFixed(2)),
  }
}

const buildCookPlan = ({ recipe, ingredients, servings }) => {
  const configurationErrors = []
  const insufficientErrors = []

  const ingredientMap = new Map(ingredients.map((ingredient) => [String(ingredient._id), ingredient]))
  const mergedLines = new Map()

  ;(recipe.ingredients || []).forEach((line, index) => {
    const ingredientId = String(line.ingredientId)

    if (mergedLines.has(ingredientId)) {
      const existing = mergedLines.get(ingredientId)
      if (existing.unit !== line.unit) {
        configurationErrors.push(
          `Recipe contains conflicting units for ingredient ${ingredientId} at line ${index + 1}`,
        )
        return
      }

      existing.requiredQuantity = Number((existing.requiredQuantity + line.quantity * servings).toFixed(4))
      return
    }

    mergedLines.set(ingredientId, {
      ingredientId: line.ingredientId,
      unit: line.unit,
      requiredQuantity: Number((line.quantity * servings).toFixed(4)),
    })
  })

  const requirements = [...mergedLines.values()].map((line) => {
    const ingredient = ingredientMap.get(String(line.ingredientId))

    if (!ingredient) {
      configurationErrors.push(`Ingredient ${String(line.ingredientId)} no longer exists`)
      return null
    }

    if (!ingredient.isActive) {
      configurationErrors.push(`Ingredient "${ingredient.name}" is inactive and cannot be consumed`)
      return null
    }

    if (ingredient.unit !== line.unit) {
      configurationErrors.push(
        `Unit mismatch for ingredient "${ingredient.name}": recipe uses ${line.unit}, ingredient unit is ${ingredient.unit}`,
      )
      return null
    }

    if (ingredient.stockQuantity < line.requiredQuantity) {
      insufficientErrors.push(
        `${ingredient.name}: needed ${line.requiredQuantity} ${line.unit}, available ${ingredient.stockQuantity} ${line.unit}`,
      )
    }

    return {
      ingredientId: ingredient._id,
      ingredientName: ingredient.name,
      unit: line.unit,
      requiredQuantity: line.requiredQuantity,
      availableQuantity: ingredient.stockQuantity,
      costPerUnit: ingredient.costPerUnit,
      ingredientDoc: ingredient,
    }
  })

  return {
    configurationErrors,
    insufficientErrors,
    requirements: requirements.filter(Boolean),
  }
}

const isTransactionUnsupportedError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  return (
    message.includes('transaction numbers are only allowed on a replica set member or mongos') ||
    message.includes('transaction support is not available') ||
    message.includes('does not support transactions')
  )
}

const executeCookWithTransaction = async ({ recipeId, servings }) => {
  const session = await mongoose.startSession()
  let result

  try {
    await session.withTransaction(async () => {
      const recipe = await Recipe.findById(recipeId).session(session)
      if (!recipe) {
        throw createAppError(404, 'NOT_FOUND', 'Recipe not found')
      }

      if (!recipe.isActive) {
        throw createAppError(409, 'INACTIVE_RESOURCE', 'Cannot cook an inactive recipe')
      }

      if (!recipe.ingredients || recipe.ingredients.length === 0) {
        throw createAppError(409, 'INVALID_RECIPE_CONFIGURATION', 'Recipe has no ingredient lines to cook')
      }

      const ingredientIds = [...new Set(recipe.ingredients.map((line) => String(line.ingredientId)))]
      const ingredients = await Ingredient.find({ _id: { $in: ingredientIds } })
        .select('name unit isActive stockQuantity costPerUnit')
        .session(session)

      const plan = buildCookPlan({ recipe, ingredients, servings })
      if (plan.configurationErrors.length > 0) {
        throw createAppError(
          409,
          'INVALID_RECIPE_CONFIGURATION',
          'Recipe cannot be cooked due to ingredient configuration issues',
          plan.configurationErrors,
        )
      }

      if (plan.insufficientErrors.length > 0) {
        throw createAppError(
          400,
          'INSUFFICIENT_STOCK',
          'Insufficient stock to cook the requested servings',
          plan.insufficientErrors,
        )
      }

      const consumption = []

      for (const requirement of plan.requirements) {
        const ingredient = requirement.ingredientDoc
        const previousStock = ingredient.stockQuantity
        const newStock = Number((previousStock - requirement.requiredQuantity).toFixed(4))

        ingredient.stockQuantity = newStock
        await ingredient.save({ session })

        consumption.push({
          ingredientId: ingredient._id,
          ingredientName: ingredient.name,
          unit: requirement.unit,
          requiredQuantity: requirement.requiredQuantity,
          previousStock,
          newStock,
          costPerUnit: ingredient.costPerUnit,
        })
      }

      const reason = `Cook: ${recipe.name} x ${servings}`
      const transactions = await InventoryTransaction.insertMany(
        consumption.map((entry) => ({
          ingredientId: entry.ingredientId,
          type: 'OUT',
          quantity: entry.requiredQuantity,
          previousStock: entry.previousStock,
          newStock: entry.newStock,
          reason,
          unitCost: entry.costPerUnit,
          referenceType: 'recipe',
          referenceId: recipe._id,
        })),
        { session },
      )

      result = {
        recipe,
        servings,
        consumption,
        transactions,
        executionMode: 'transaction',
      }
    })

    return result
  } finally {
    await session.endSession()
  }
}

const executeCookWithoutTransaction = async ({ recipeId, servings }) => {
  const recipe = await Recipe.findById(recipeId)
  if (!recipe) {
    throw createAppError(404, 'NOT_FOUND', 'Recipe not found')
  }

  if (!recipe.isActive) {
    throw createAppError(409, 'INACTIVE_RESOURCE', 'Cannot cook an inactive recipe')
  }

  if (!recipe.ingredients || recipe.ingredients.length === 0) {
    throw createAppError(409, 'INVALID_RECIPE_CONFIGURATION', 'Recipe has no ingredient lines to cook')
  }

  const ingredientIds = [...new Set(recipe.ingredients.map((line) => String(line.ingredientId)))]
  const ingredients = await Ingredient.find({ _id: { $in: ingredientIds } }).select('name unit isActive stockQuantity costPerUnit')

  const plan = buildCookPlan({ recipe, ingredients, servings })
  if (plan.configurationErrors.length > 0) {
    throw createAppError(
      409,
      'INVALID_RECIPE_CONFIGURATION',
      'Recipe cannot be cooked due to ingredient configuration issues',
      plan.configurationErrors,
    )
  }

  if (plan.insufficientErrors.length > 0) {
    throw createAppError(
      400,
      'INSUFFICIENT_STOCK',
      'Insufficient stock to cook the requested servings',
      plan.insufficientErrors,
    )
  }

  const applied = []

  try {
    for (const requirement of plan.requirements) {
      const previous = await Ingredient.findOneAndUpdate(
        {
          _id: requirement.ingredientId,
          isActive: true,
          unit: requirement.unit,
          stockQuantity: { $gte: requirement.requiredQuantity },
        },
        { $inc: { stockQuantity: -requirement.requiredQuantity } },
        { new: false },
      ).select('name stockQuantity costPerUnit')

      if (!previous) {
        throw createAppError(
          400,
          'INSUFFICIENT_STOCK',
          'Stock changed while cooking. Please try again.',
          [`${requirement.ingredientName}: unable to reserve required quantity`],
        )
      }

      const previousStock = previous.stockQuantity
      const newStock = Number((previousStock - requirement.requiredQuantity).toFixed(4))

      applied.push({
        ingredientId: previous._id,
        ingredientName: previous.name,
        unit: requirement.unit,
        requiredQuantity: requirement.requiredQuantity,
        previousStock,
        newStock,
        costPerUnit: previous.costPerUnit,
      })
    }

    const reason = `Cook: ${recipe.name} x ${servings}`
    const transactions = await InventoryTransaction.insertMany(
      applied.map((entry) => ({
        ingredientId: entry.ingredientId,
        type: 'OUT',
        quantity: entry.requiredQuantity,
        previousStock: entry.previousStock,
        newStock: entry.newStock,
        reason,
        unitCost: entry.costPerUnit,
        referenceType: 'recipe',
        referenceId: recipe._id,
      })),
    )

    return {
      recipe,
      servings,
      consumption: applied,
      transactions,
      executionMode: 'fallback',
    }
  } catch (error) {
    if (applied.length > 0) {
      await Promise.allSettled(
        applied.map((entry) => Ingredient.updateOne({ _id: entry.ingredientId }, { $inc: { stockQuantity: entry.requiredQuantity } })),
      )
    }

    throw error
  }
}

// GET /api/recipes - list recipes with pagination/filter/sort
router.get('/', async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, DEFAULT_PAGE)
    const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT)
    const skip = (page - 1) * limit

    const search = String(req.query.search || '').trim()
    const includeInactive = parseBoolean(req.query.includeInactive) === true
    const onlyInactive = parseBoolean(req.query.onlyInactive) === true
    const includeComputed = parseBoolean(req.query.includeComputed) === true

    const filters = {}
    if (onlyInactive) {
      filters.isActive = false
    } else if (!includeInactive) {
      filters.isActive = true
    }

    if (search) {
      const safeSearchRegex = new RegExp(escapeRegExp(search), 'i')
      filters.$or = [{ name: safeSearchRegex }, { description: safeSearchRegex }]
    }

    const sort = resolveSort(req.query.sortBy, req.query.sortOrder)

    const [items, total] = await Promise.all([
      Recipe.find(filters).sort(sort).skip(skip).limit(limit).lean(),
      Recipe.countDocuments(filters),
    ])

    let normalizedItems = items

    if (includeComputed && items.length > 0) {
      const ingredientIds = [...new Set(items.flatMap((recipe) => recipe.ingredients.map((line) => String(line.ingredientId))))]
      const ingredientDocs = await Ingredient.find({ _id: { $in: ingredientIds } }).select('costPerUnit')
      const ingredientMap = new Map(ingredientDocs.map((ingredient) => [String(ingredient._id), ingredient]))

      normalizedItems = items.map((recipe) => {
        const recipeObject = recipe
        return {
          ...recipeObject,
          computed: computeRecipeMetrics(recipeObject, ingredientMap),
        }
      })
    }

    res.json({
      items: normalizedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    })
  } catch (err) {
    console.error('Error fetching recipes:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch recipes')
  }
})

// PATCH /api/recipes/:id/restore - restore archived recipe
router.patch('/:id/restore', async (req, res) => {
  try {
    if (!ensureValidRecipeId(res, req.params.id)) return

    const recipe = await Recipe.findById(req.params.id)
    if (!recipe) {
      return sendError(res, 404, 'NOT_FOUND', 'Recipe not found')
    }

    if (recipe.isActive) {
      return res.json({ message: 'Recipe is already active', recipe })
    }

    recipe.isActive = true
    await recipe.save()

    return res.json({ message: 'Recipe restored', recipe })
  } catch (err) {
    console.error('Error restoring recipe:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to restore recipe')
  }
})

// POST /api/recipes/:id/cook - consume ingredients for a recipe
router.post('/:id/cook', async (req, res) => {
  try {
    if (!ensureValidRecipeId(res, req.params.id)) return

    const servings = parsePositiveServings(req.body?.servings)
    if (servings === undefined) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid cook payload', [
        'servings is required and must be a positive integer',
      ])
    }

    let result

    try {
      result = await executeCookWithTransaction({ recipeId: req.params.id, servings })
    } catch (error) {
      if (isTransactionUnsupportedError(error)) {
        result = await executeCookWithoutTransaction({ recipeId: req.params.id, servings })
      } else {
        throw error
      }
    }

    return res.json({
      message: 'Recipe cooked successfully',
      executionMode: result.executionMode,
      recipe: {
        id: result.recipe._id,
        name: result.recipe.name,
      },
      servings: result.servings,
      consumption: result.consumption,
      transactionsCreated: result.transactions.length,
    })
  } catch (err) {
    if (err?.isAppError) {
      return sendError(res, err.status, err.code, err.message, err.details)
    }

    console.error('Error cooking recipe:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to cook recipe')
  }
})

// GET /api/recipes/:id - get one recipe with ingredient details and computed metrics
router.get('/:id', async (req, res) => {
  try {
    if (!ensureValidRecipeId(res, req.params.id)) return

    const includeInactive = parseBoolean(req.query.includeInactive) === true
    const includeComputed = parseBoolean(req.query.includeComputed)

    const recipe = await Recipe.findById(req.params.id)
    if (!recipe) {
      return sendError(res, 404, 'NOT_FOUND', 'Recipe not found')
    }

    if (!includeInactive && !recipe.isActive) {
      return sendError(res, 404, 'NOT_FOUND', 'Recipe not found')
    }

    const ingredientIds = recipe.ingredients.map((line) => line.ingredientId)
    const ingredientDocs = await Ingredient.find({ _id: { $in: ingredientIds } }).select('name unit costPerUnit isActive')
    const ingredientMap = new Map(ingredientDocs.map((ingredient) => [String(ingredient._id), ingredient]))

    const ingredientDetails = recipe.ingredients.map((line) => {
      const ingredient = ingredientMap.get(String(line.ingredientId))
      const costPerUnit = ingredient ? ingredient.costPerUnit : 0
      return {
        ingredientId: line.ingredientId,
        ingredientName: ingredient ? ingredient.name : '(Missing ingredient)',
        ingredientUnit: ingredient ? ingredient.unit : null,
        ingredientIsActive: ingredient ? ingredient.isActive : false,
        quantity: line.quantity,
        unit: line.unit,
        costPerUnit,
        costContribution: Number((line.quantity * costPerUnit).toFixed(4)),
      }
    })

    const recipeObject = recipe
    const shouldIncludeComputed = includeComputed !== false

    return res.json({
      recipe: recipeObject,
      ingredientDetails,
      computed: shouldIncludeComputed ? computeRecipeMetrics(recipeObject, ingredientMap) : undefined,
    })
  } catch (err) {
    console.error('Error fetching recipe:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch recipe')
  }
})

// POST /api/recipes - create recipe
router.post('/', async (req, res) => {
  try {
    const { details, value } = validateRecipePayload({ payload: req.body || {}, isCreate: true })
    if (details.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid recipe payload', details)
    }

    const ingredientCheck = await validateIngredientReferences(value.ingredients)
    if (ingredientCheck.details.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid recipe payload', ingredientCheck.details)
    }

    const recipe = new Recipe(value)
    const saved = await recipe.save()

    return res.status(201).json(saved)
  } catch (err) {
    console.error('Error creating recipe:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to create recipe')
  }
})

// PUT /api/recipes/:id - update recipe
router.put('/:id', async (req, res) => {
  try {
    if (!ensureValidRecipeId(res, req.params.id)) return

    const { details, value } = validateRecipePayload({ payload: req.body || {}, isCreate: false })
    if (details.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid recipe payload', details)
    }

    if (value.ingredients) {
      const ingredientCheck = await validateIngredientReferences(value.ingredients)
      if (ingredientCheck.details.length > 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid recipe payload', ingredientCheck.details)
      }
    }

    const recipe = await Recipe.findById(req.params.id)
    if (!recipe) {
      return sendError(res, 404, 'NOT_FOUND', 'Recipe not found')
    }

    Object.assign(recipe, value)
    await recipe.save()

    return res.json(recipe)
  } catch (err) {
    console.error('Error updating recipe:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to update recipe')
  }
})

// DELETE /api/recipes/:id - archive recipe
router.delete('/:id', async (req, res) => {
  try {
    if (!ensureValidRecipeId(res, req.params.id)) return

    const recipe = await Recipe.findById(req.params.id)
    if (!recipe) {
      return sendError(res, 404, 'NOT_FOUND', 'Recipe not found')
    }

    if (!recipe.isActive) {
      return res.json({ message: 'Recipe already inactive', recipe })
    }

    recipe.isActive = false
    await recipe.save()

    return res.json({ message: 'Recipe archived', recipe })
  } catch (err) {
    console.error('Error archiving recipe:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to archive recipe')
  }
})

module.exports = router
