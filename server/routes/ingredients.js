const express = require('express')
const mongoose = require('mongoose')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')
const Recipe = require('../models/Recipe')
const { calculateStockStatus } = require('../domain/stockStatus')
const { convertToBase, costPerDisplayUnitToBase } = require('../domain/units')
const { WASTE_REASON_CODES, WASTE_REASON_LABELS } = require('../domain/inventoryReasonCodes')
const {
  createIngredientWithInitialStock,
  adjustIngredientStock,
  isTransactionUnsupportedError,
} = require('../services/inventoryService')

const router = express.Router()

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const ALLOWED_SORT_FIELDS = ['name', 'manufacturer', 'category', 'stockQuantity', 'costPerUnit', 'createdAt', 'updatedAt']
const ALLOWED_UNITS = ['pcs', 'g', 'kg', 'ml', 'l']
const CREATE_ALLOWED_FIELDS = new Set([
  'name',
  'manufacturer',
  'category',
  'unit',
  'stockQuantity',
  'costPerUnit',
  'reorderLevel',
  'parLevel',
  'isActive',
])
const UPDATE_ALLOWED_FIELDS = new Set(['name', 'manufacturer', 'category', 'unit', 'costPerUnit', 'reorderLevel', 'parLevel', 'isActive'])
const ADJUST_ALLOWED_FIELDS = new Set([
  'type',
  'quantity',
  'newStockQuantity',
  'expectedCurrentStock',
  'reason',
  'reasonCode',
  'unitCost',
])
const ADJUST_REASON_CODES = {
  IN: ['MANUAL_RECEIPT'],
  OUT: ['MANUAL_USAGE'],
  ADJUST: ['PHYSICAL_COUNT', 'MANUAL_CORRECTION'],
}
const WASTE_ALLOWED_FIELDS = new Set(['quantity', 'reasonCode', 'note'])

const normalizeIngredient = (ingredient) => {
  const normalized = typeof ingredient.toObject === 'function' ? ingredient.toObject() : ingredient
  return {
    ...normalized,
    stockStatus: calculateStockStatus(normalized),
  }
}

const sendError = (res, status, code, message, details) => {
  const error = { code, message }
  if (details && details.length > 0) error.details = details
  return res.status(status).json({ error })
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

const validateCreatePayload = (payload) => {
  const details = []
  const unknownFields = getUnknownFields(payload, CREATE_ALLOWED_FIELDS)
  if (unknownFields.length > 0) details.push(`Unknown field(s): ${unknownFields.join(', ')}`)

  const name = normalizeRequiredString(payload.name, 'name', details)
  const unit = normalizeRequiredString(payload.unit, 'unit', details)

  if (unit && !ALLOWED_UNITS.includes(unit)) {
    details.push(`unit must be one of: ${ALLOWED_UNITS.join(', ')}`)
  }

  const manufacturer = normalizeOptionalString(payload.manufacturer, 'manufacturer', details)
  const category = normalizeOptionalString(payload.category, 'category', details)
  const stockQuantity = normalizeNonNegativeNumber(payload.stockQuantity, 'stockQuantity', details, 0)
  const costPerUnit = normalizeNonNegativeNumber(payload.costPerUnit, 'costPerUnit', details, 0)
  const reorderLevel = normalizeNonNegativeNumber(payload.reorderLevel, 'reorderLevel', details, 0)
  const parLevel = normalizeNonNegativeNumber(payload.parLevel, 'parLevel', details, 0)
  if (parLevel > 0 && reorderLevel > 0 && parLevel < reorderLevel) {
    details.push('parLevel must be greater than or equal to reorderLevel when both are configured')
  }

  let isActive = true
  if (payload.isActive !== undefined) {
    if (typeof payload.isActive !== 'boolean') {
      details.push('isActive must be a boolean when provided')
    } else {
      isActive = payload.isActive
    }
  }

  return {
    details,
    value: {
      name,
      manufacturer,
      category,
      unit,
      stockQuantity,
      costPerUnit,
      reorderLevel,
      parLevel,
      isActive,
    },
  }
}

const validateUpdatePayload = (payload) => {
  const details = []
  const unknownFields = getUnknownFields(payload, UPDATE_ALLOWED_FIELDS)
  if (unknownFields.length > 0) details.push(`Unknown field(s): ${unknownFields.join(', ')}`)

  if (Object.keys(payload || {}).length === 0) {
    details.push('At least one updatable field is required')
  }

  const value = {}

  if (payload.name !== undefined) {
    const name = normalizeRequiredString(payload.name, 'name', details)
    if (name !== undefined) value.name = name
  }

  if (payload.manufacturer !== undefined) {
    const manufacturer = normalizeOptionalString(payload.manufacturer, 'manufacturer', details)
    value.manufacturer = manufacturer
  }

  if (payload.category !== undefined) {
    const category = normalizeOptionalString(payload.category, 'category', details)
    value.category = category
  }

  if (payload.unit !== undefined) {
    const unit = normalizeRequiredString(payload.unit, 'unit', details)
    if (unit && !ALLOWED_UNITS.includes(unit)) {
      details.push(`unit must be one of: ${ALLOWED_UNITS.join(', ')}`)
    }
    if (unit !== undefined) value.unit = unit
  }

  if (payload.costPerUnit !== undefined) {
    const costPerUnit = normalizeNonNegativeNumber(payload.costPerUnit, 'costPerUnit', details)
    if (costPerUnit !== undefined) value.costPerUnit = costPerUnit
  }

  if (payload.reorderLevel !== undefined) {
    const reorderLevel = normalizeNonNegativeNumber(payload.reorderLevel, 'reorderLevel', details)
    if (reorderLevel !== undefined) value.reorderLevel = reorderLevel
  }

  if (payload.parLevel !== undefined) {
    const parLevel = normalizeNonNegativeNumber(payload.parLevel, 'parLevel', details)
    if (parLevel !== undefined) value.parLevel = parLevel
  }

  if (payload.isActive !== undefined) {
    if (typeof payload.isActive !== 'boolean') {
      details.push('isActive must be a boolean when provided')
    } else {
      value.isActive = payload.isActive
    }
  }

  return { details, value }
}

const validateAdjustPayload = (payload) => {
  const details = []
  const unknownFields = getUnknownFields(payload, ADJUST_ALLOWED_FIELDS)
  if (unknownFields.length > 0) details.push(`Unknown field(s): ${unknownFields.join(', ')}`)

  const type = String(payload.type || 'ADJUST').toUpperCase()
  if (!['IN', 'OUT', 'ADJUST'].includes(type)) {
    details.push('type must be one of IN, OUT, ADJUST')
  }

  const reason = normalizeOptionalString(payload.reason, 'reason', details)

  let quantity
  let newStockQuantity
  let expectedCurrentStock

  if (type === 'IN' || type === 'OUT') {
    quantity = Number(payload.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      details.push('quantity must be a positive number for IN/OUT')
    }
  }

  if (type === 'ADJUST') {
    newStockQuantity = Number(payload.newStockQuantity)
    if (!Number.isFinite(newStockQuantity) || newStockQuantity < 0) {
      details.push('newStockQuantity must be a non-negative number for ADJUST')
    }

    expectedCurrentStock = Number(payload.expectedCurrentStock)
    if (!Number.isFinite(expectedCurrentStock)) {
      details.push('expectedCurrentStock must be a finite number for ADJUST')
    }
  }

  let reasonCode
  if (payload.reasonCode !== undefined && ADJUST_REASON_CODES[type]) {
    reasonCode = typeof payload.reasonCode === 'string' ? payload.reasonCode.trim() : ''
    if (!ADJUST_REASON_CODES[type]?.includes(reasonCode)) {
      details.push(`reasonCode must be one of: ${ADJUST_REASON_CODES[type].join(', ')}`)
    }
  }

  let unitCost
  if (payload.unitCost !== undefined) {
    unitCost = Number(payload.unitCost)
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      details.push('unitCost must be a non-negative number when provided')
    }
  }

  return {
    details,
    value: {
      type,
      quantity,
      newStockQuantity,
      expectedCurrentStock,
      reason,
      reasonCode,
      unitCost,
    },
  }
}

const validateWastePayload = (payload) => {
  const details = []
  const unknownFields = getUnknownFields(payload, WASTE_ALLOWED_FIELDS)
  if (unknownFields.length > 0) details.push(`Unknown field(s): ${unknownFields.join(', ')}`)

  const quantity = Number(payload.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    details.push('quantity must be a positive number')
  }

  const reasonCode = typeof payload.reasonCode === 'string' ? payload.reasonCode.trim() : ''
  if (!WASTE_REASON_CODES.includes(reasonCode)) {
    details.push(`reasonCode must be one of: ${WASTE_REASON_CODES.join(', ')}`)
  }

  const note = normalizeOptionalString(payload.note, 'note', details)
  return { details, value: { quantity, reasonCode, note } }
}

const ensureValidIngredientId = (res, id) => {
  if (!mongoose.isValidObjectId(id)) {
    sendError(res, 400, 'INVALID_ID', 'Invalid ingredient id')
    return false
  }
  return true
}

const findActiveRecipeDependencies = (ingredientId) =>
  Recipe.find({ isActive: true, 'ingredients.ingredientId': ingredientId }).select('name').lean()

const sendIngredientInUse = (res, dependentRecipes) =>
  sendError(
    res,
    409,
    'INGREDIENT_IN_USE',
    'Ingredient is used by active recipes and cannot be archived',
    dependentRecipes.map((recipe) => `${recipe.name} (${String(recipe._id)})`),
  )

// GET /api/ingredients - list ingredients with search/filter/sort/pagination
router.get('/', async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, DEFAULT_PAGE)
    const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT)
    const skip = (page - 1) * limit

    const search = String(req.query.search || '').trim()
    const category = String(req.query.category || '').trim()
    const lowStockOnly = parseBoolean(req.query.lowStockOnly) === true
    const healthyStockOnly = parseBoolean(req.query.healthyStockOnly) === true
    const includeInactive = parseBoolean(req.query.includeInactive) === true
    const onlyInactive = parseBoolean(req.query.onlyInactive) === true

    if (lowStockOnly && healthyStockOnly) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid ingredient query', [
        'lowStockOnly and healthyStockOnly cannot both be true',
      ])
    }

    const filterClauses = []

    if (onlyInactive) {
      filterClauses.push({ isActive: false })
    } else if (!includeInactive) {
      filterClauses.push({ isActive: true })
    }

    if (category && category.toLowerCase() !== 'all') {
      filterClauses.push({ category })
    }

    if (search) {
      const safeSearchRegex = new RegExp(escapeRegExp(search), 'i')
      filterClauses.push({
        $or: [{ name: safeSearchRegex }, { manufacturer: safeSearchRegex }, { category: safeSearchRegex }],
      })
    }

    if (lowStockOnly) {
      filterClauses.push({ reorderLevel: { $gt: 0 } })
      filterClauses.push({ $expr: { $lte: ['$stockQuantity', '$reorderLevel'] } })
    }

    if (healthyStockOnly) {
      filterClauses.push({ reorderLevel: { $gt: 0 } })
      filterClauses.push({ $expr: { $gt: ['$stockQuantity', '$reorderLevel'] } })
    }

    const filters = filterClauses.length > 0 ? { $and: filterClauses } : {}

    const sort = resolveSort(req.query.sortBy, req.query.sortOrder)

    const [items, total] = await Promise.all([
      Ingredient.find(filters).sort(sort).skip(skip).limit(limit).lean(),
      Ingredient.countDocuments(filters),
    ])

    res.json({
      items: items.map(normalizeIngredient),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    })
  } catch (err) {
    console.error('Error fetching ingredients:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch ingredients')
  }
})

// GET /api/ingredients/meta - complete active category and unit metadata
router.get('/meta', async (_req, res) => {
  try {
    const categories = await Ingredient.aggregate([
      { $match: { isActive: true } },
      { $project: { category: { $trim: { input: { $ifNull: ['$category', ''] } } } } },
      { $match: { category: { $ne: '' } } },
      { $group: { _id: '$category', activeCount: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, name: '$_id', activeCount: 1 } },
    ])

    return res.json({
      categories,
      units: ALLOWED_UNITS,
    })
  } catch (err) {
    console.error('Error fetching ingredient metadata:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch ingredient metadata')
  }
})

// POST /api/ingredients/:id/adjust-stock - stock in/out/manual adjust with transaction log
router.post('/:id/adjust-stock', async (req, res) => {
  try {
    if (!ensureValidIngredientId(res, req.params.id)) return

    const { details, value } = validateAdjustPayload(req.body || {})
    if (details.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stock adjustment payload', details)
    }

    const { ingredient, transaction, operationId } = await adjustIngredientStock({
      ingredientId: req.params.id,
      ...value,
    })

    res.json({
      message: 'Stock adjusted successfully',
      ingredient: normalizeIngredient(ingredient),
      transaction,
      operationId,
    })
  } catch (err) {
    if (err?.isAppError) {
      return sendError(res, err.status, err.code, err.message, err.details)
    }
    if (isTransactionUnsupportedError(err)) {
      return sendError(
        res,
        503,
        'TRANSACTIONS_UNAVAILABLE',
        'Inventory operations require MongoDB transaction support.',
      )
    }
    console.error('Error adjusting stock:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to adjust stock')
  }
})

// POST /api/ingredients/:id/waste - record a structured inventory loss
router.post('/:id/waste', async (req, res) => {
  try {
    if (!ensureValidIngredientId(res, req.params.id)) return

    const { details, value } = validateWastePayload(req.body || {})
    if (details.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid waste payload', details)
    }

    const { ingredient, transaction, operationId } = await adjustIngredientStock({
      ingredientId: req.params.id,
      type: 'OUT',
      quantity: value.quantity,
      reasonCode: value.reasonCode,
      reason: value.note || `Waste: ${WASTE_REASON_LABELS[value.reasonCode]}`,
    })
    const lossValue = transaction.quantity * transaction.unitCost

    return res.json({
      message: 'Waste recorded',
      ingredient: normalizeIngredient(ingredient),
      transaction,
      operationId,
      lossValue,
    })
  } catch (err) {
    if (err?.isAppError) {
      return sendError(res, err.status, err.code, err.message, err.details)
    }
    if (isTransactionUnsupportedError(err)) {
      return sendError(
        res,
        503,
        'TRANSACTIONS_UNAVAILABLE',
        'Inventory operations require MongoDB transaction support.',
      )
    }
    console.error('Error recording waste:', err)
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to record waste')
  }
})

// GET /api/ingredients/:id/transactions - list stock movement history
router.get('/:id/transactions', async (req, res) => {
  try {
    if (!ensureValidIngredientId(res, req.params.id)) return

    const page = parsePositiveInt(req.query.page, DEFAULT_PAGE)
    const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT)
    const skip = (page - 1) * limit

    const [items, total] = await Promise.all([
      InventoryTransaction.find({ ingredientId: req.params.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      InventoryTransaction.countDocuments({ ingredientId: req.params.id }),
    ])

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    })
  } catch (err) {
    console.error('Error fetching ingredient transactions:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch ingredient transactions')
  }
})

// PATCH /api/ingredients/:id/restore - restore a soft-deleted ingredient
router.patch('/:id/restore', async (req, res) => {
  try {
    if (!ensureValidIngredientId(res, req.params.id)) return

    const ingredient = await Ingredient.findById(req.params.id)
    if (!ingredient) {
      return sendError(res, 404, 'NOT_FOUND', 'Ingredient not found')
    }

    if (ingredient.isActive) {
      return res.json({ message: 'Ingredient is already active', ingredient: normalizeIngredient(ingredient) })
    }

    ingredient.isActive = true
    await ingredient.save()

    return res.json({ message: 'Ingredient restored', ingredient: normalizeIngredient(ingredient) })
  } catch (err) {
    console.error('Error restoring ingredient:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to restore ingredient')
  }
})

// GET /api/ingredients/:id - get one ingredient
router.get('/:id', async (req, res) => {
  try {
    if (!ensureValidIngredientId(res, req.params.id)) return

    const includeInactive = parseBoolean(req.query.includeInactive) === true

    const ingredient = await Ingredient.findById(req.params.id)
    if (!ingredient) {
      return sendError(res, 404, 'NOT_FOUND', 'Ingredient not found')
    }

    if (!includeInactive && !ingredient.isActive) {
      return sendError(res, 404, 'NOT_FOUND', 'Ingredient not found')
    }

    res.json(normalizeIngredient(ingredient))
  } catch (err) {
    console.error('Error fetching ingredient:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch ingredient')
  }
})

// POST /api/ingredients - create
router.post('/', async (req, res) => {
  try {
    const { details, value } = validateCreatePayload(req.body || {})
    if (details.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid ingredient payload', details)
    }

    const { ingredient: saved } = await createIngredientWithInitialStock({ ingredientData: value })

    res.status(201).json(normalizeIngredient(saved))
  } catch (err) {
    if (isTransactionUnsupportedError(err)) {
      return sendError(
        res,
        503,
        'TRANSACTIONS_UNAVAILABLE',
        'Inventory operations require MongoDB transaction support.',
      )
    }
    console.error('Error creating ingredient:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to create ingredient')
  }
})

// PUT /api/ingredients/:id - update ingredient details (stock changes must use adjust-stock endpoint)
router.put('/:id', async (req, res) => {
  try {
    if (!ensureValidIngredientId(res, req.params.id)) return

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'stockQuantity')) {
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Invalid ingredient payload',
        ['stockQuantity cannot be updated via PUT. Use POST /api/ingredients/:id/adjust-stock.'],
      )
    }

    const { details, value } = validateUpdatePayload(req.body || {})
    if (details.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid ingredient payload', details)
    }

    const existing = await Ingredient.findById(req.params.id)
    if (!existing) {
      return sendError(res, 404, 'NOT_FOUND', 'Ingredient not found')
    }

    if (value.unit !== undefined && value.unit !== existing.unit) {
      return sendError(res, 409, 'UNIT_CHANGE_NOT_ALLOWED', 'Ingredient unit cannot be changed after creation')
    }

    if (value.reorderLevel !== undefined) {
      value.reorderLevelBase = convertToBase(value.reorderLevel, existing.unit)
    }
    const nextReorderLevel = value.reorderLevel ?? existing.reorderLevel ?? 0
    const nextParLevel = value.parLevel ?? existing.parLevel ?? 0
    if (nextParLevel > 0 && nextReorderLevel > 0 && nextParLevel < nextReorderLevel) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid ingredient payload', [
        'parLevel must be greater than or equal to reorderLevel when both are configured',
      ])
    }
    if (value.parLevel !== undefined) {
      value.parLevelBase = convertToBase(value.parLevel, existing.unit)
    }
    if (value.costPerUnit !== undefined) {
      value.averageCostPerBaseUnit = costPerDisplayUnitToBase(value.costPerUnit, existing.unit)
    }
    if (value.isActive === false && existing.isActive) {
      const dependentRecipes = await findActiveRecipeDependencies(existing._id)
      if (dependentRecipes.length > 0) return sendIngredientInUse(res, dependentRecipes)
    }

    const updated = await Ingredient.findByIdAndUpdate(req.params.id, value, {
      new: true,
      runValidators: true,
    })

    res.json(normalizeIngredient(updated))
  } catch (err) {
    console.error('Error updating ingredient:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to update ingredient')
  }
})

// DELETE /api/ingredients/:id - soft delete (set isActive = false)
router.delete('/:id', async (req, res) => {
  try {
    if (!ensureValidIngredientId(res, req.params.id)) return

    const ingredient = await Ingredient.findById(req.params.id)
    if (!ingredient) {
      return sendError(res, 404, 'NOT_FOUND', 'Ingredient not found')
    }

    if (!ingredient.isActive) {
      return res.json({ message: 'Ingredient already inactive', ingredient: normalizeIngredient(ingredient) })
    }

    const dependentRecipes = await findActiveRecipeDependencies(ingredient._id)
    if (dependentRecipes.length > 0) {
      return sendIngredientInUse(res, dependentRecipes)
    }

    ingredient.isActive = false
    await ingredient.save()

    res.json({ message: 'Ingredient archived', ingredient: normalizeIngredient(ingredient) })
  } catch (err) {
    console.error('Error archiving ingredient:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to archive ingredient')
  }
})

module.exports = router
