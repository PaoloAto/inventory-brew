const request = require('supertest')
const mongoose = require('mongoose')
const { MongoMemoryReplSet } = require('mongodb-memory-server')
const app = require('../app')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')
const Recipe = require('../models/Recipe')
const { calculateStockStatus } = require('../domain/stockStatus')

jest.setTimeout(120000)

describe('Inventory Brew API integration', () => {
  let mongoServer

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        storageEngine: 'wiredTiger',
      },
    })
    await mongoose.connect(mongoServer.getUri(), { dbName: 'inventory-brew-test' })
  })

  afterEach(async () => {
    await Promise.all([
      Ingredient.deleteMany({}),
      Recipe.deleteMany({}),
      InventoryTransaction.deleteMany({}),
    ])
  })

  afterAll(async () => {
    await mongoose.disconnect()
    if (mongoServer) {
      await mongoServer.stop()
    }
  })

  test('POST /api/ingredients rejects invalid unit', async () => {
    const response = await request(app).post('/api/ingredients').send({
      name: 'Invalid Ingredient',
      unit: 'box',
      stockQuantity: 10,
      costPerUnit: 2,
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(response.body.error.details.join(' ')).toContain('unit must be one of')
  })

  test('POST /api/ingredients atomically creates initial IN transaction when stock > 0', async () => {
    const createResponse = await request(app).post('/api/ingredients').send({
      name: 'Carrot',
      unit: 'pcs',
      stockQuantity: 25,
      costPerUnit: 3,
      reorderLevel: 5,
    })

    expect(createResponse.status).toBe(201)

    const transactions = await InventoryTransaction.find({ ingredientId: createResponse.body._id }).lean()
    expect(transactions).toHaveLength(1)
    expect(transactions[0].type).toBe('IN')
    expect(transactions[0].quantity).toBe(25)
    expect(transactions[0]).toMatchObject({
      deltaQuantity: 25,
      previousStock: 0,
      newStock: 25,
      reasonCode: 'INITIAL_STOCK',
      referenceType: 'system',
    })
    expect(transactions[0].operationId).toEqual(expect.any(String))
  })

  test('POST /api/ingredients with zero stock creates no initial transaction', async () => {
    const response = await request(app).post('/api/ingredients').send({
      name: 'Empty container',
      unit: 'pcs',
      stockQuantity: 0,
      costPerUnit: 1,
    })

    expect(response.status).toBe(201)
    expect(await InventoryTransaction.countDocuments({ ingredientId: response.body._id })).toBe(0)
  })

  test('POST /api/ingredients rolls back when initial transaction creation fails', async () => {
    const createSpy = jest
      .spyOn(InventoryTransaction, 'create')
      .mockRejectedValueOnce(new Error('forced initial transaction failure'))

    try {
      const response = await request(app).post('/api/ingredients').send({
        name: 'Rollback ingredient',
        unit: 'pcs',
        stockQuantity: 5,
        costPerUnit: 1,
      })

      expect(response.status).toBe(500)
      expect(await Ingredient.countDocuments({ name: 'Rollback ingredient' })).toBe(0)
      expect(await InventoryTransaction.countDocuments()).toBe(0)
    } finally {
      createSpy.mockRestore()
    }
  })

  test('manual IN and OUT are atomic with signed ledger deltas and insufficient OUT changes nothing', async () => {
    const createResponse = await request(app).post('/api/ingredients').send({
      name: 'Olive Oil',
      unit: 'ml',
      stockQuantity: 20,
      costPerUnit: 0.03,
      reorderLevel: 5,
    })

    const receiptResponse = await request(app)
      .post(`/api/ingredients/${createResponse.body._id}/adjust-stock`)
      .send({
        type: 'IN',
        quantity: 5,
        reason: 'Delivery',
      })
    expect(receiptResponse.status).toBe(200)
    expect(receiptResponse.body.ingredient.stockQuantity).toBe(25)
    expect(receiptResponse.body.transaction).toMatchObject({
      type: 'IN',
      quantity: 5,
      deltaQuantity: 5,
      previousStock: 20,
      newStock: 25,
      reasonCode: 'MANUAL_RECEIPT',
      referenceType: 'manual',
    })
    expect(receiptResponse.body.operationId).toEqual(expect.any(String))

    const usageResponse = await request(app)
      .post(`/api/ingredients/${createResponse.body._id}/adjust-stock`)
      .send({ type: 'OUT', quantity: 4, reason: 'Service' })
    expect(usageResponse.status).toBe(200)
    expect(usageResponse.body.ingredient.stockQuantity).toBe(21)
    expect(usageResponse.body.transaction).toMatchObject({
      type: 'OUT',
      quantity: 4,
      deltaQuantity: -4,
      previousStock: 25,
      newStock: 21,
      reasonCode: 'MANUAL_USAGE',
    })

    const transactionCount = await InventoryTransaction.countDocuments()
    const adjustResponse = await request(app)
      .post(`/api/ingredients/${createResponse.body._id}/adjust-stock`)
      .send({ type: 'OUT', quantity: 999, reason: 'Over-consume test' })
    expect(adjustResponse.status).toBe(400)
    expect(adjustResponse.body.error.code).toBe('INSUFFICIENT_STOCK')
    expect((await Ingredient.findById(createResponse.body._id)).stockQuantity).toBe(21)
    expect(await InventoryTransaction.countDocuments()).toBe(transactionCount)
  })

  test('stale ADJUST returns STOCK_CHANGED without stock or ledger changes', async () => {
    const createResponse = await request(app).post('/api/ingredients').send({
      name: 'Counted beans',
      unit: 'pcs',
      stockQuantity: 10,
      costPerUnit: 1,
    })
    await request(app)
      .post(`/api/ingredients/${createResponse.body._id}/adjust-stock`)
      .send({ type: 'IN', quantity: 1 })
    const transactionCount = await InventoryTransaction.countDocuments()

    const response = await request(app)
      .post(`/api/ingredients/${createResponse.body._id}/adjust-stock`)
      .send({ type: 'ADJUST', newStockQuantity: 8, expectedCurrentStock: 10 })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('STOCK_CHANGED')
    expect((await Ingredient.findById(createResponse.body._id)).stockQuantity).toBe(11)
    expect(await InventoryTransaction.countDocuments()).toBe(transactionCount)
  })

  test('concurrent OUT requests cannot overconsume shared stock', async () => {
    const createResponse = await request(app).post('/api/ingredients').send({
      name: 'Concurrent beans',
      unit: 'pcs',
      stockQuantity: 10,
      costPerUnit: 1,
    })

    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app).post(`/api/ingredients/${createResponse.body._id}/adjust-stock`).send({ type: 'OUT', quantity: 7 }),
      ),
    )

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400])
    expect((await Ingredient.findById(createResponse.body._id)).stockQuantity).toBe(3)
    expect(await InventoryTransaction.countDocuments({ ingredientId: createResponse.body._id, type: 'OUT' })).toBe(1)
  })

  test('GET /api/ingredients supports healthyStockOnly filter and rejects conflicting stock filters', async () => {
    await request(app).post('/api/ingredients').send({
      name: 'Low Stock Item',
      unit: 'pcs',
      stockQuantity: 2,
      costPerUnit: 1,
      reorderLevel: 10,
    })

    await request(app).post('/api/ingredients').send({
      name: 'Healthy Item',
      unit: 'pcs',
      stockQuantity: 25,
      costPerUnit: 1,
      reorderLevel: 10,
    })

    const healthyResponse = await request(app).get('/api/ingredients').query({ healthyStockOnly: true })
    expect(healthyResponse.status).toBe(200)
    expect(healthyResponse.body.items.every((item) => item.stockQuantity >= item.reorderLevel || item.reorderLevel <= 0)).toBe(true)

    const conflictingResponse = await request(app)
      .get('/api/ingredients')
      .query({ lowStockOnly: true, healthyStockOnly: true })

    expect(conflictingResponse.status).toBe(400)
    expect(conflictingResponse.body.error.code).toBe('VALIDATION_ERROR')
  })

  test('PATCH /api/ingredients/:id/restore re-activates an archived ingredient', async () => {
    const createResponse = await request(app).post('/api/ingredients').send({
      name: 'Tomato',
      unit: 'pcs',
      stockQuantity: 10,
      costPerUnit: 2.5,
      reorderLevel: 3,
    })

    const archiveResponse = await request(app).delete(`/api/ingredients/${createResponse.body._id}`)
    expect(archiveResponse.status).toBe(200)
    expect(archiveResponse.body.ingredient.isActive).toBe(false)

    const restoreResponse = await request(app).patch(`/api/ingredients/${createResponse.body._id}/restore`)
    expect(restoreResponse.status).toBe(200)
    expect(restoreResponse.body.ingredient.isActive).toBe(true)
  })

  test('recipe list and details return identical backend-computed metrics', async () => {
    const ingredient = await Ingredient.create({
      name: 'Coffee',
      unit: 'g',
      stockQuantity: 100,
      costPerUnit: 0.375,
      reorderLevel: 20,
    })
    const recipe = await Recipe.create({
      name: 'Double coffee',
      sellingPrice: 5,
      ingredients: [{ ingredientId: ingredient._id, quantity: 8, unit: 'g' }],
    })

    const listResponse = await request(app).get('/api/recipes').query({ includeComputed: true })
    const detailsResponse = await request(app)
      .get(`/api/recipes/${recipe._id}`)
      .query({ includeComputed: true })

    expect(listResponse.status).toBe(200)
    expect(detailsResponse.status).toBe(200)
    expect(listResponse.body.items[0].computed).toEqual({
      ingredientCost: 3,
      costPerServing: 3,
      grossMargin: 2,
      margin: 2,
      marginPercent: 40,
    })
    expect(detailsResponse.body.computed).toEqual(listResponse.body.items[0].computed)
    expect(detailsResponse.body.configuration).toEqual(listResponse.body.items[0].configuration)
    expect(detailsResponse.body.configuration.isValid).toBe(true)
  })

  test('recipe metrics return null marginPercent when sellingPrice is zero', async () => {
    const ingredient = await Ingredient.create({
      name: 'Water',
      unit: 'ml',
      stockQuantity: 1000,
      costPerUnit: 0.001,
    })
    const recipe = await Recipe.create({
      name: 'Water serving',
      sellingPrice: 0,
      ingredients: [{ ingredientId: ingredient._id, quantity: 250, unit: 'ml' }],
    })

    const response = await request(app)
      .get(`/api/recipes/${recipe._id}`)
      .query({ includeComputed: true })

    expect(response.status).toBe(200)
    expect(response.body.computed.marginPercent).toBeNull()
    expect(response.body.configuration.isValid).toBe(true)
  })

  test('missing recipe ingredients invalidate configuration instead of contributing zero cost', async () => {
    const missingIngredientId = new mongoose.Types.ObjectId()
    const recipe = await Recipe.create({
      name: 'Broken recipe',
      sellingPrice: 12,
      ingredients: [{ ingredientId: missingIngredientId, quantity: 2, unit: 'pcs' }],
    })

    const response = await request(app)
      .get(`/api/recipes/${recipe._id}`)
      .query({ includeComputed: true })

    expect(response.status).toBe(200)
    expect(response.body.computed).toBeNull()
    expect(response.body.configuration.isValid).toBe(false)
    expect(response.body.configuration.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MISSING_INGREDIENT',
          ingredientId: String(missingIngredientId),
        }),
      ]),
    )
  })

  test('inactive recipe ingredients invalidate configuration', async () => {
    const ingredient = await Ingredient.create({
      name: 'Archived spice',
      unit: 'g',
      stockQuantity: 5,
      costPerUnit: 2,
      isActive: false,
    })
    const recipe = await Recipe.create({
      name: 'Archived spice recipe',
      sellingPrice: 10,
      ingredients: [{ ingredientId: ingredient._id, quantity: 1, unit: 'g' }],
    })

    const response = await request(app).get('/api/recipes').query({ includeComputed: true })

    expect(response.status).toBe(200)
    expect(response.body.items[0].computed).toBeNull()
    expect(response.body.items[0].configuration.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'INACTIVE_INGREDIENT' })]),
    )
  })

  test('calculateStockStatus handles exact business-rule boundaries', () => {
    expect(calculateStockStatus({ stockQuantity: 0, reorderLevel: 0 }).code).toBe('OUT_OF_STOCK')
    expect(calculateStockStatus({ stockQuantity: 5, reorderLevel: 0 }).code).toBe('UNCONFIGURED')
    expect(calculateStockStatus({ stockQuantity: 2.5, reorderLevel: 10 }).code).toBe('CRITICAL')
    expect(calculateStockStatus({ stockQuantity: 10, reorderLevel: 10 }).code).toBe('LOW')
    expect(calculateStockStatus({ stockQuantity: 10.01, reorderLevel: 10 }).code).toBe('SUFFICIENT')

    expect(calculateStockStatus({ stockQuantity: 5, reorderLevel: undefined })).toMatchObject({
      code: 'UNCONFIGURED',
      stockRatio: null,
      shortfall: null,
    })
    expect(calculateStockStatus({ stockQuantity: 5, reorderLevel: Number.NaN }).code).toBe(
      'UNCONFIGURED',
    )
    expect(calculateStockStatus({ stockQuantity: undefined, reorderLevel: 10 })).toMatchObject({
      code: 'OUT_OF_STOCK',
      stockRatio: 0,
      shortfall: 10,
    })
    expect(calculateStockStatus({ stockQuantity: 0, reorderLevel: undefined }).code).toBe(
      'OUT_OF_STOCK',
    )

    const malformedResults = [
      calculateStockStatus({ stockQuantity: Number.NaN, reorderLevel: 10 }),
      calculateStockStatus({ stockQuantity: Number.POSITIVE_INFINITY, reorderLevel: 10 }),
      calculateStockStatus({ stockQuantity: 5, reorderLevel: Number.POSITIVE_INFINITY }),
    ]
    malformedResults.forEach((result) => {
      const numericFields = [result.stockRatio, result.shortfall].filter((value) => value !== null)
      numericFields.forEach((value) => expect(Number.isFinite(value)).toBe(true))
    })
  })

  test('ingredient metadata returns the complete active category catalog', async () => {
    await Ingredient.insertMany([
      { name: 'Milk', category: ' Dairy ', unit: 'ml', stockQuantity: 1, costPerUnit: 1 },
      { name: 'Cheddar', category: 'Dairy', unit: 'g', stockQuantity: 1, costPerUnit: 1 },
      { name: 'Apple', category: 'Produce', unit: 'pcs', stockQuantity: 1, costPerUnit: 1 },
      { name: 'Blank', category: '  ', unit: 'pcs', stockQuantity: 1, costPerUnit: 1 },
      {
        name: 'Archived meat',
        category: 'Meat',
        unit: 'g',
        stockQuantity: 1,
        costPerUnit: 1,
        isActive: false,
      },
    ])

    const response = await request(app).get('/api/ingredients/meta')

    expect(response.status).toBe(200)
    expect(response.body.categories).toEqual([
      { name: 'Dairy', activeCount: 2 },
      { name: 'Produce', activeCount: 1 },
    ])
    expect(response.body.units).toEqual(['pcs', 'g', 'kg', 'ml', 'l'])
  })

  test('healthyStockOnly excludes ingredients without a configured reorder point', async () => {
    await Ingredient.insertMany([
      {
        name: 'Unconfigured',
        unit: 'pcs',
        stockQuantity: 50,
        costPerUnit: 1,
        reorderLevel: 0,
      },
      {
        name: 'Sufficient',
        unit: 'pcs',
        stockQuantity: 11,
        costPerUnit: 1,
        reorderLevel: 10,
      },
      { name: 'At reorder', unit: 'pcs', stockQuantity: 10, costPerUnit: 1, reorderLevel: 10 },
    ])

    const response = await request(app).get('/api/ingredients').query({ healthyStockOnly: true })

    expect(response.status).toBe(200)
    expect(response.body.items.map((item) => item.name)).toEqual(['Sufficient'])
    expect(response.body.items[0].stockStatus.code).toBe('SUFFICIENT')
  })

  test('dateTo date-only filters include transactions through the end of that date', async () => {
    const ingredient = await Ingredient.create({
      name: 'Timed ingredient',
      unit: 'pcs',
      stockQuantity: 1,
      costPerUnit: 1,
    })
    await InventoryTransaction.create({
      ingredientId: ingredient._id,
      type: 'IN',
      quantity: 1,
      previousStock: 0,
      newStock: 1,
      reason: 'Late movement',
      createdAt: new Date('2026-07-15T23:45:00.000Z'),
    })

    const response = await request(app).get('/api/transactions').query({ dateTo: '2026-07-15' })

    expect(response.status).toBe(200)
    expect(response.body.items).toHaveLength(1)
    expect(response.body.items[0].reason).toBe('Late movement')
  })

  test('POST /api/recipes/:id/cook deducts stock and creates OUT transactions', async () => {
    const carrotResponse = await request(app).post('/api/ingredients').send({
      name: 'Carrot',
      unit: 'pcs',
      stockQuantity: 20,
      costPerUnit: 3,
      reorderLevel: 5,
    })
    const oilResponse = await request(app).post('/api/ingredients').send({
      name: 'Olive Oil',
      unit: 'ml',
      stockQuantity: 200,
      costPerUnit: 0.02,
      reorderLevel: 25,
    })

    const recipeResponse = await request(app).post('/api/recipes').send({
      name: 'Carrot Salad',
      description: 'Integration test recipe',
      sellingPrice: 120,
      ingredients: [
        { ingredientId: carrotResponse.body._id, quantity: 2, unit: 'pcs' },
        { ingredientId: oilResponse.body._id, quantity: 10, unit: 'ml' },
      ],
    })

    expect(recipeResponse.status).toBe(201)

    const cookResponse = await request(app).post(`/api/recipes/${recipeResponse.body._id}/cook`).send({
      servings: 3,
    })

    expect(cookResponse.status).toBe(200)
    expect(cookResponse.body.executionMode).toBe('transaction')
    expect(cookResponse.body.transactionsCreated).toBe(2)
    expect(cookResponse.body.operationId).toEqual(expect.any(String))

    const carrotAfter = await Ingredient.findById(carrotResponse.body._id).lean()
    const oilAfter = await Ingredient.findById(oilResponse.body._id).lean()

    expect(carrotAfter.stockQuantity).toBe(14)
    expect(oilAfter.stockQuantity).toBe(170)

    const outTransactions = await InventoryTransaction.find({
      referenceType: 'recipe',
      referenceId: recipeResponse.body._id,
      type: 'OUT',
    }).lean()

    expect(outTransactions).toHaveLength(2)
    expect(outTransactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deltaQuantity: -6, reasonCode: 'RECIPE_COOK' }),
        expect.objectContaining({ deltaQuantity: -30, reasonCode: 'RECIPE_COOK' }),
      ]),
    )
    expect(new Set(outTransactions.map((transaction) => transaction.operationId))).toEqual(
      new Set([cookResponse.body.operationId]),
    )
  })

  test('concurrent cooks leave one complete operation and no partial consumption', async () => {
    const [first, second] = await Promise.all(
      ['Cook first', 'Cook second'].map((name) =>
        request(app).post('/api/ingredients').send({ name, unit: 'pcs', stockQuantity: 2, costPerUnit: 1 }),
      ),
    )
    const recipeResponse = await request(app).post('/api/recipes').send({
      name: 'Limited cook',
      sellingPrice: 8,
      ingredients: [
        { ingredientId: first.body._id, quantity: 2, unit: 'pcs' },
        { ingredientId: second.body._id, quantity: 2, unit: 'pcs' },
      ],
    })

    const responses = await Promise.all(
      [1, 2].map(() => request(app).post(`/api/recipes/${recipeResponse.body._id}/cook`).send({ servings: 1 })),
    )

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400])
    expect((await Ingredient.findById(first.body._id)).stockQuantity).toBe(0)
    expect((await Ingredient.findById(second.body._id)).stockQuantity).toBe(0)

    const cookTransactions = await InventoryTransaction.find({ referenceId: recipeResponse.body._id, type: 'OUT' }).lean()
    expect(cookTransactions).toHaveLength(2)
    expect(new Set(cookTransactions.map((transaction) => transaction.operationId)).size).toBe(1)
  })

  test('PATCH /api/recipes/:id/restore re-activates an archived recipe', async () => {
    const ingredientResponse = await request(app).post('/api/ingredients').send({
      name: 'Chicken',
      unit: 'g',
      stockQuantity: 1000,
      costPerUnit: 0.15,
      reorderLevel: 200,
    })

    const recipeResponse = await request(app).post('/api/recipes').send({
      name: 'Chicken Bowl',
      sellingPrice: 220,
      ingredients: [
        {
          ingredientId: ingredientResponse.body._id,
          quantity: 150,
          unit: 'g',
        },
      ],
    })

    const archiveResponse = await request(app).delete(`/api/recipes/${recipeResponse.body._id}`)
    expect(archiveResponse.status).toBe(200)
    expect(archiveResponse.body.recipe.isActive).toBe(false)

    const restoreResponse = await request(app).patch(`/api/recipes/${recipeResponse.body._id}/restore`)
    expect(restoreResponse.status).toBe(200)
    expect(restoreResponse.body.recipe.isActive).toBe(true)
  })

  test('GET /api/dashboard/summary preserves replenishment count compatibility', async () => {
    await Ingredient.insertMany([
      {
        name: 'Configured out',
        unit: 'pcs',
        stockQuantity: 0,
        costPerUnit: 1,
        reorderLevel: 10,
      },
      {
        name: 'Unconfigured out',
        unit: 'pcs',
        stockQuantity: 0,
        costPerUnit: 1,
        reorderLevel: 0,
      },
      {
        name: 'Critical',
        unit: 'pcs',
        stockQuantity: 2.5,
        costPerUnit: 1,
        reorderLevel: 10,
      },
      { name: 'Low', unit: 'pcs', stockQuantity: 5, costPerUnit: 1, reorderLevel: 10 },
      { name: 'Sufficient', unit: 'pcs', stockQuantity: 11, costPerUnit: 1, reorderLevel: 10 },
      {
        name: 'Unconfigured positive',
        unit: 'pcs',
        stockQuantity: 5,
        costPerUnit: 1,
        reorderLevel: 0,
      },
    ])

    const response = await request(app).get('/api/dashboard/summary')

    expect(response.status).toBe(200)
    expect(response.body.summary).toMatchObject({
      outOfStockCount: 2,
      criticalStockCount: 1,
      lowOnlyCount: 1,
      lowStockCount: 3,
      unconfiguredReorderCount: 1,
      sufficientStockCount: 1,
      replenishmentRequiredCount: 3,
    })
    expect(response.body.summary.lowStockCount).toBe(
      response.body.summary.replenishmentRequiredCount,
    )
  })

  test('GET /api/dashboard/summary returns expected summary shape', async () => {
    await request(app).post('/api/ingredients').send({
      name: 'Rice',
      unit: 'g',
      stockQuantity: 1000,
      costPerUnit: 0.01,
      reorderLevel: 200,
    })

    const response = await request(app).get('/api/dashboard/summary')

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('summary')
    expect(response.body.summary).toHaveProperty('ingredientCount')
    expect(response.body.summary).toHaveProperty('recipeCount')
    expect(response.body.summary).toHaveProperty('lowStockCount')
    expect(response.body.summary).toMatchObject({
      outOfStockCount: 0,
      criticalStockCount: 0,
      lowOnlyCount: 0,
      lowStockCount: 0,
      unconfiguredReorderCount: 0,
      sufficientStockCount: 1,
      replenishmentRequiredCount: 0,
    })
    expect(response.body.summary).not.toHaveProperty('legacyLowStockCount')
    expect(response.body.summary).toHaveProperty('totalStockValue')
    expect(Array.isArray(response.body.lowStockItems)).toBe(true)
    expect(Array.isArray(response.body.recentTransactions)).toBe(true)
  })

  test('GET /api/health and /api/ready return service status', async () => {
    const healthResponse = await request(app).get('/api/health')
    expect(healthResponse.status).toBe(200)
    expect(healthResponse.body.status).toBe('ok')
    expect(healthResponse.body.service).toBe('Inventory Brew API')

    const readyResponse = await request(app).get('/api/ready')
    expect(readyResponse.status).toBe(200)
    expect(readyResponse.body.status).toBe('ready')
    expect(readyResponse.body.dbConnected).toBe(true)
    expect(readyResponse.body.transactionsSupported).toBe(true)
  })
})
