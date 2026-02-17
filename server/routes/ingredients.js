const express = require('express')
const mongoose = require('mongoose')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')

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
  'isActive',
])
const UPDATE_ALLOWED_FIELDS = new Set(['name', 'manufacturer', 'category', 'unit', 'costPerUnit', 'reorderLevel', 'isActive'])
const ADJUST_ALLOWED_FIELDS = new Set(['type', 'quantity', 'newStockQuantity', 'reason', 'unitCost'])

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
      reason,
      unitCost,
    },
  }
}

const ensureValidIngredientId = (res, id) => {
  if (!mongoose.isValidObjectId(id)) {
    sendError(res, 400, 'INVALID_ID', 'Invalid ingredient id')
    return false
  }
  return true
}

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
      filterClauses.push({ $expr: { $lt: ['$stockQuantity', '$reorderLevel'] } })
    }

    if (healthyStockOnly) {
      filterClauses.push({
        $or: [{ reorderLevel: { $lte: 0 } }, { $expr: { $gte: ['$stockQuantity', '$reorderLevel'] } }],
      })
    }

    const filters = filterClauses.length > 0 ? { $and: filterClauses } : {}

    const sort = resolveSort(req.query.sortBy, req.query.sortOrder)

    const [items, total] = await Promise.all([
      Ingredient.find(filters).sort(sort).skip(skip).limit(limit).lean(),
      Ingredient.countDocuments(filters),
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
    console.error('Error fetching ingredients:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to fetch ingredients')
  }
})

// POST /api/ingredients/:id/adjust-stock - stock in/out/manual adjust with transaction log
router.post('/:id/adjust-stock', async (req, res) => {
  try {
    if (!ensureValidIngredientId(res, req.params.id)) return

    const ingredient = await Ingredient.findById(req.params.id)
    if (!ingredient) {
      return sendError(res, 404, 'NOT_FOUND', 'Ingredient not found')
    }

    if (!ingredient.isActive) {
      return sendError(res, 409, 'INACTIVE_RESOURCE', 'Cannot adjust stock for an inactive ingredient')
    }

    const { details, value } = validateAdjustPayload(req.body || {})
    if (details.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stock adjustment payload', details)
    }

    const previousStock = ingredient.stockQuantity
    const nextStock =
      value.type === 'IN'
        ? previousStock + value.quantity
        : value.type === 'OUT'
          ? previousStock - value.quantity
          : value.newStockQuantity

    if (nextStock < 0) {
      return sendError(res, 400, 'INSUFFICIENT_STOCK', 'Stock cannot go negative', [
        `Current stock is ${previousStock}`,
      ])
    }

    ingredient.stockQuantity = nextStock
    await ingredient.save()

    const normalizedQuantity =
      value.type === 'ADJUST' ? Math.abs(value.newStockQuantity - previousStock) : value.quantity

    const transaction = await InventoryTransaction.create({
      ingredientId: ingredient._id,
      type: value.type,
      quantity: normalizedQuantity,
      previousStock,
      newStock: nextStock,
      reason: value.reason,
      unitCost: value.type === 'IN' ? (value.unitCost ?? ingredient.costPerUnit) : value.unitCost,
    })

    res.json({
      message: 'Stock adjusted successfully',
      ingredient,
      transaction,
    })
  } catch (err) {
    console.error('Error adjusting stock:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to adjust stock')
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
      return res.json({ message: 'Ingredient is already active', ingredient })
    }

    ingredient.isActive = true
    await ingredient.save()

    return res.json({ message: 'Ingredient restored', ingredient })
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

    res.json(ingredient)
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

    const ingredient = new Ingredient(value)
    const saved = await ingredient.save()

    if (saved.stockQuantity > 0 && saved.isActive) {
      await InventoryTransaction.create({
        ingredientId: saved._id,
        type: 'IN',
        quantity: saved.stockQuantity,
        previousStock: 0,
        newStock: saved.stockQuantity,
        reason: 'Initial stock',
        unitCost: saved.costPerUnit,
      })
    }

    res.status(201).json(saved)
  } catch (err) {
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

    const updated = await Ingredient.findByIdAndUpdate(req.params.id, value, {
      new: true,
      runValidators: true,
    })

    if (!updated) {
      return sendError(res, 404, 'NOT_FOUND', 'Ingredient not found')
    }

    res.json(updated)
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
      return res.json({ message: 'Ingredient already inactive', ingredient })
    }

    ingredient.isActive = false
    await ingredient.save()

    res.json({ message: 'Ingredient archived', ingredient })
  } catch (err) {
    console.error('Error archiving ingredient:', err)
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to archive ingredient')
  }
})

module.exports = router
