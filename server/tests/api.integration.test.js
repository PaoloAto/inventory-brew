const request = require('supertest')
const mongoose = require('mongoose')
const { MongoMemoryReplSet } = require('mongodb-memory-server')
const app = require('../app')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')
const Recipe = require('../models/Recipe')
const CookEvent = require('../models/CookEvent')
const { calculateStockStatus } = require('../domain/stockStatus')
const {
  getBaseUnit,
  convertToBase,
  convertFromBase,
  areUnitsCompatible,
  costPerDisplayUnitToBase,
  costPerBaseUnitToDisplay,
} = require('../domain/units')
const { runMigration } = require('../scripts/migrateCanonicalUnitsAndYield')

jest.setTimeout(120000)

describe('Inventory Brew API integration', () => {
  let mongoServer

  const createProductionFixture = async (suffix = '') => {
    const ingredientResponse = await request(app).post('/api/ingredients').send({
      name: `Production flour${suffix}`,
      unit: 'kg',
      stockQuantity: 10,
      costPerUnit: 100,
    })
    const recipeResponse = await request(app).post('/api/recipes').send({
      name: `Production bread${suffix}`,
      sellingPrice: 100,
      yieldServings: 4,
      ingredients: [{ ingredientId: ingredientResponse.body._id, quantity: 2, unit: 'kg' }],
    })
    return { ingredientId: ingredientResponse.body._id, recipeId: recipeResponse.body._id }
  }

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        storageEngine: 'wiredTiger',
      },
    })
    await mongoose.connect(mongoServer.getUri(), { dbName: 'inventory-brew-test' })
    await CookEvent.init()
  })

  afterEach(async () => {
    await Promise.all([
      Ingredient.deleteMany({}),
      Recipe.deleteMany({}),
      InventoryTransaction.deleteMany({}),
      CookEvent.deleteMany({}),
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

  test('invalid movement type with reasonCode returns validation error', async () => {
    const ingredient = await Ingredient.create({
      name: 'Validation beans',
      unit: 'pcs',
      stockQuantity: 2,
      costPerUnit: 1,
    })

    const response = await request(app)
      .post(`/api/ingredients/${ingredient._id}/adjust-stock`)
      .send({ type: 'INVALID', reasonCode: 'WHATEVER' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  test('manual ledger failure rolls stock back and successful ADJUST records signed delta', async () => {
    const createResponse = await request(app).post('/api/ingredients').send({
      name: 'Atomic adjustment',
      unit: 'pcs',
      stockQuantity: 10,
      costPerUnit: 1,
    })
    const transactionCount = await InventoryTransaction.countDocuments()
    const createSpy = jest
      .spyOn(InventoryTransaction, 'create')
      .mockRejectedValueOnce(new Error('forced manual transaction failure'))

    try {
      const failed = await request(app)
        .post(`/api/ingredients/${createResponse.body._id}/adjust-stock`)
        .send({ type: 'IN', quantity: 5, unitCost: 2 })

      expect(failed.status).toBe(500)
      expect(await Ingredient.findById(createResponse.body._id).lean()).toMatchObject({
        stockQuantity: 10,
        stockQuantityBase: 10,
        costPerUnit: 1,
        averageCostPerBaseUnit: 1,
      })
      expect(await InventoryTransaction.countDocuments()).toBe(transactionCount)
    } finally {
      createSpy.mockRestore()
    }

    const adjusted = await request(app)
      .post(`/api/ingredients/${createResponse.body._id}/adjust-stock`)
      .send({ type: 'ADJUST', newStockQuantity: 7, expectedCurrentStock: 10 })

    expect(adjusted.status).toBe(200)
    expect(adjusted.body.transaction).toMatchObject({
      quantity: 3,
      deltaQuantity: -3,
      previousStock: 10,
      newStock: 7,
      reasonCode: 'PHYSICAL_COUNT',
    })
  })

  test('canonical unit helpers convert compatible units and reject incompatible dimensions', () => {
    expect(getBaseUnit('kg')).toBe('g')
    expect(convertToBase(2.5, 'kg')).toBe(2500)
    expect(convertFromBase(2500, 'kg')).toBe(2.5)
    expect(convertToBase(1.5, 'l')).toBe(1500)
    expect(areUnitsCompatible('kg', 'g')).toBe(true)
    expect(areUnitsCompatible('l', 'ml')).toBe(true)
    expect(areUnitsCompatible('kg', 'ml')).toBe(false)
    expect(costPerDisplayUnitToBase(120, 'kg')).toBe(0.12)
    expect(costPerBaseUnitToDisplay(0.12, 'kg')).toBe(120)
    expect(() => convertToBase(1, 'box')).toThrow('Unknown unit')
  })

  test('transaction-unavailable handling is consistent for ingredient creation and adjustment', async () => {
    const ingredient = await Ingredient.create({
      name: 'Transaction capability fixture',
      unit: 'pcs',
      stockQuantity: 2,
      costPerUnit: 1,
    })
    const unsupported = new Error('Transaction numbers are only allowed on a replica set member or mongos')
    const sessionSpy = jest.spyOn(mongoose, 'startSession').mockRejectedValue(unsupported)

    try {
      const createResponse = await request(app).post('/api/ingredients').send({
        name: 'Unsupported create',
        unit: 'pcs',
        stockQuantity: 1,
        costPerUnit: 1,
      })
      const adjustResponse = await request(app)
        .post(`/api/ingredients/${ingredient._id}/adjust-stock`)
        .send({ type: 'IN', quantity: 1, unitCost: 1 })

      for (const response of [createResponse, adjustResponse]) {
        expect(response.status).toBe(503)
        expect(response.body.error).toMatchObject({
          code: 'TRANSACTIONS_UNAVAILABLE',
          message: 'Inventory operations require MongoDB transaction support.',
        })
      }
    } finally {
      sessionSpy.mockRestore()
    }
  })

  test('ingredient unit changes are blocked and active recipe dependencies protect archive and restore', async () => {
    const ingredientResponse = await request(app).post('/api/ingredients').send({
      name: 'Protected flour',
      unit: 'kg',
      stockQuantity: 2,
      costPerUnit: 100,
    })
    const sameUnit = await request(app)
      .put(`/api/ingredients/${ingredientResponse.body._id}`)
      .send({ unit: 'kg' })
    expect(sameUnit.status).toBe(200)

    const changedUnit = await request(app)
      .put(`/api/ingredients/${ingredientResponse.body._id}`)
      .send({ unit: 'g' })
    expect(changedUnit.status).toBe(409)
    expect(changedUnit.body.error.code).toBe('UNIT_CHANGE_NOT_ALLOWED')

    const recipeResponse = await request(app).post('/api/recipes').send({
      name: 'Protected recipe',
      sellingPrice: 10,
      yieldServings: 2,
      ingredients: [{ ingredientId: ingredientResponse.body._id, quantity: 1, unit: 'kg' }],
    })
    const blockedArchive = await request(app).delete(`/api/ingredients/${ingredientResponse.body._id}`)
    expect(blockedArchive.status).toBe(409)
    expect(blockedArchive.body.error.code).toBe('INGREDIENT_IN_USE')
    expect(blockedArchive.body.error.details).toEqual(
      expect.arrayContaining([expect.stringContaining('Protected recipe')]),
    )
    const blockedPutArchive = await request(app)
      .put(`/api/ingredients/${ingredientResponse.body._id}`)
      .send({ isActive: false })
    expect(blockedPutArchive.status).toBe(409)
    expect(blockedPutArchive.body.error.code).toBe('INGREDIENT_IN_USE')

    await request(app).delete(`/api/recipes/${recipeResponse.body._id}`)
    expect((await request(app).delete(`/api/ingredients/${ingredientResponse.body._id}`)).status).toBe(200)
    const invalidRestore = await request(app).patch(`/api/recipes/${recipeResponse.body._id}/restore`)
    expect(invalidRestore.status).toBe(409)
    expect(invalidRestore.body.error.code).toBe('INVALID_RECIPE_CONFIGURATION')
  })

  test('weighted receipts handle zero stock, preserve average without price, and canonicalize kg/l', async () => {
    const kgResponse = await request(app).post('/api/ingredients').send({
      name: 'Zero stock flour',
      unit: 'kg',
      stockQuantity: 0,
      costPerUnit: 100,
      reorderLevel: 0.5,
    })
    expect(kgResponse.body).toMatchObject({
      baseUnit: 'g',
      stockQuantityBase: 0,
      reorderLevelBase: 500,
      averageCostPerBaseUnit: 0.1,
    })

    const pricedReceipt = await request(app)
      .post(`/api/ingredients/${kgResponse.body._id}/adjust-stock`)
      .send({ type: 'IN', quantity: 5, unitCost: 160 })
    expect(pricedReceipt.status).toBe(200)
    expect(pricedReceipt.body.ingredient).toMatchObject({
      stockQuantity: 5,
      stockQuantityBase: 5000,
      costPerUnit: 160,
      averageCostPerBaseUnit: 0.16,
    })

    const unpricedReceipt = await request(app)
      .post(`/api/ingredients/${kgResponse.body._id}/adjust-stock`)
      .send({ type: 'IN', quantity: 1 })
    expect(unpricedReceipt.status).toBe(200)
    expect(unpricedReceipt.body.ingredient).toMatchObject({
      stockQuantity: 6,
      stockQuantityBase: 6000,
      costPerUnit: 160,
      averageCostPerBaseUnit: 0.16,
    })

    const liters = await request(app).post('/api/ingredients').send({
      name: 'Syrup',
      unit: 'l',
      stockQuantity: 2,
      costPerUnit: 30,
      reorderLevel: 0.25,
    })
    expect(liters.body).toMatchObject({
      baseUnit: 'ml',
      stockQuantityBase: 2000,
      reorderLevelBase: 250,
      averageCostPerBaseUnit: 0.03,
    })
  })

  test('weighted average flows through canonical valuation, recipe yield metrics, and cooking', async () => {
    const ingredientResponse = await request(app).post('/api/ingredients').send({
      name: 'Audit fixture flour',
      unit: 'kg',
      stockQuantity: 10,
      costPerUnit: 100,
    })
    const receipt = await request(app)
      .post(`/api/ingredients/${ingredientResponse.body._id}/adjust-stock`)
      .send({ type: 'IN', quantity: 5, unitCost: 160 })
    expect(receipt.status).toBe(200)
    expect(receipt.body.ingredient).toMatchObject({
      stockQuantity: 15,
      stockQuantityBase: 15000,
      costPerUnit: 120,
      averageCostPerBaseUnit: 0.12,
    })

    const recipeResponse = await request(app).post('/api/recipes').send({
      name: 'Yield fixture',
      sellingPrice: 100,
      yieldServings: 4,
      ingredients: [{ ingredientId: ingredientResponse.body._id, quantity: 2, unit: 'kg' }],
    })
    expect(recipeResponse.status).toBe(201)
    expect(recipeResponse.body.ingredients[0]).toMatchObject({
      quantity: 2,
      unit: 'kg',
      quantityBase: 2000,
      baseUnit: 'g',
    })

    const details = await request(app).get(`/api/recipes/${recipeResponse.body._id}`)
    expect(details.body.computed).toEqual({
      batchCost: 240,
      ingredientCost: 240,
      costPerServing: 60,
      grossMargin: 40,
      margin: 40,
      marginPercent: 40,
    })
    const dashboard = await request(app).get('/api/dashboard/summary')
    expect(dashboard.body.summary.totalStockValue).toBe(1800)

    const cooked = await request(app)
      .post(`/api/recipes/${recipeResponse.body._id}/cook`)
      .send({ servings: 2 })
    expect(cooked.status).toBe(200)
    expect(cooked.body.executionMode).toBe('transaction')
    expect(cooked.body.consumption[0]).toMatchObject({
      unit: 'kg',
      requiredQuantity: 1,
      requiredQuantityBase: 1000,
    })
    const finalIngredient = await Ingredient.findById(ingredientResponse.body._id).lean()
    expect(finalIngredient).toMatchObject({
      stockQuantity: 14,
      stockQuantityBase: 14000,
      costPerUnit: 120,
      averageCostPerBaseUnit: 0.12,
    })
  })

  test('migration dry-run is additive and apply/verify preserve valuation while setting yield', async () => {
    const ingredientId = new mongoose.Types.ObjectId()
    await Ingredient.collection.insertOne({
      _id: ingredientId,
      name: 'Legacy kilograms',
      unit: 'kg',
      stockQuantity: 2,
      reorderLevel: 0.5,
      costPerUnit: 240,
      isActive: true,
    })
    await Recipe.collection.insertOne({
      _id: new mongoose.Types.ObjectId(),
      name: 'Legacy recipe',
      sellingPrice: 100,
      ingredients: [{ ingredientId, quantity: 0.5, unit: 'kg' }],
      isActive: true,
    })

    const dryRun = await runMigration('dry-run')
    expect(dryRun).toMatchObject({
      ingredientsNeedingUpdate: 1,
      recipesNeedingUpdate: 1,
      displayValue: 480,
      canonicalValue: 480,
      invalid: [],
    })
    expect((await Ingredient.collection.findOne({ _id: ingredientId })).stockQuantityBase).toBeUndefined()

    const applied = await runMigration('apply')
    expect(applied.after.ok).toBe(true)
    const verify = await runMigration('verify')
    expect(verify.ok).toBe(true)
    expect(verify.valuationDifference).toBeCloseTo(0, 10)
    const migratedIngredient = await Ingredient.collection.findOne({ _id: ingredientId })
    expect(migratedIngredient).toMatchObject({
      baseUnit: 'g',
      stockQuantityBase: 2000,
      reorderLevelBase: 500,
      averageCostPerBaseUnit: 0.24,
    })
    const migratedRecipe = await Recipe.collection.findOne({ name: 'Legacy recipe' })
    expect(migratedRecipe.yieldServings).toBe(1)
    expect(migratedRecipe.ingredients[0]).toMatchObject({ quantityBase: 500, baseUnit: 'g' })

    const rerun = await runMigration('apply')
    expect(rerun.after.ok).toBe(true)
    expect(rerun.before.ingredientsNeedingUpdate).toBe(0)
    expect(rerun.before.recipesNeedingUpdate).toBe(0)

    await Ingredient.collection.insertOne({
      _id: new mongoose.Types.ObjectId(),
      name: 'Unknown legacy unit',
      unit: 'box',
      stockQuantity: 1,
      reorderLevel: 0,
      costPerUnit: 1,
      isActive: true,
    })
    await expect(runMigration('apply')).rejects.toThrow('Migration refused')
  })

  test('migration verify detects canonical equivalence mismatches', async () => {
    const ingredient = await Ingredient.create({
      name: 'Mismatched canonical ingredient',
      unit: 'kg',
      stockQuantity: 2,
      reorderLevel: 1,
      costPerUnit: 100,
    })
    const recipe = await Recipe.create({
      name: 'Mismatched canonical recipe',
      sellingPrice: 10,
      ingredients: [{ ingredientId: ingredient._id, quantity: 1, unit: 'kg' }],
    })
    await Ingredient.collection.updateOne(
      { _id: ingredient._id },
      { $set: { stockQuantityBase: 1999 } },
    )
    await Recipe.collection.updateOne(
      { _id: recipe._id },
      { $set: { 'ingredients.0.quantityBase': 999 } },
    )

    const verification = await runMigration('verify')
    expect(verification.ok).toBe(false)
    expect(verification.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ingredient', issue: 'Invalid canonical fields' }),
        expect.objectContaining({ type: 'recipeLine', issue: 'Invalid canonical fields' }),
      ]),
    )
  })

  test('concurrent priced receipts preserve weighted-average valuation', async () => {
    const ingredientResponse = await request(app).post('/api/ingredients').send({
      name: 'Concurrent priced flour',
      unit: 'kg',
      stockQuantity: 10,
      costPerUnit: 100,
    })

    const responses = await Promise.all(
      [160, 200].map((unitCost) =>
        request(app)
          .post(`/api/ingredients/${ingredientResponse.body._id}/adjust-stock`)
          .send({ type: 'IN', quantity: 5, unitCost }),
      ),
    )
    expect(responses.map((response) => response.status)).toEqual([200, 200])
    expect(await Ingredient.findById(ingredientResponse.body._id).lean()).toMatchObject({
      stockQuantity: 20,
      stockQuantityBase: 20000,
      costPerUnit: 140,
      averageCostPerBaseUnit: 0.14,
    })
    expect(
      await InventoryTransaction.countDocuments({
        ingredientId: ingredientResponse.body._id,
        type: 'IN',
        reasonCode: 'MANUAL_RECEIPT',
      }),
    ).toBe(2)
  })

  test('recipe restore rejects invalid canonical lines before activation', async () => {
    const ingredient = await Ingredient.create({
      name: 'Restore canonical fixture',
      unit: 'kg',
      stockQuantity: 5,
      costPerUnit: 10,
    })
    const recipe = await Recipe.create({
      name: 'Broken archived recipe',
      sellingPrice: 20,
      ingredients: [{ ingredientId: ingredient._id, quantity: 1, unit: 'kg' }],
      isActive: false,
    })
    await Recipe.collection.updateOne(
      { _id: recipe._id },
      { $set: { 'ingredients.0.quantityBase': 0 } },
    )

    const response = await request(app).patch(`/api/recipes/${recipe._id}/restore`)
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('INVALID_RECIPE_CONFIGURATION')
    expect((await Recipe.findById(recipe._id)).isActive).toBe(false)
  })

  test('readiness reports canonical migration presence gaps including explicit null fields', async () => {
    await Ingredient.collection.insertOne({
      _id: new mongoose.Types.ObjectId(),
      name: 'Incomplete canonical active ingredient',
      unit: 'kg',
      stockQuantity: 1,
      costPerUnit: 1,
      reorderLevel: 0,
      baseUnit: 'g',
      stockQuantityBase: 1000,
      reorderLevelBase: 0,
      averageCostPerBaseUnit: null,
      isActive: true,
    })

    const response = await request(app).get('/api/ready')
    expect(response.status).toBe(503)
    expect(response.body).toMatchObject({
      status: 'not_ready',
      dbConnected: true,
      transactionsSupported: true,
      canonicalDataReady: false,
    })
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
      batchCost: 3,
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
    expect(await CookEvent.countDocuments({ recipeId: recipeResponse.body._id })).toBe(1)
  })

  test('cook preview is read-only, reports maximum servings, and returns shortages as data', async () => {
    const fixture = await createProductionFixture(' preview')
    const beforeTransactions = await InventoryTransaction.countDocuments()

    const preview = await request(app)
      .post(`/api/recipes/${fixture.recipeId}/cook-preview`)
      .send({ servings: 2 })
    expect(preview.status).toBe(200)
    expect(preview.body).toMatchObject({
      requestedServings: 2,
      canCook: true,
      maxCookableServings: 20,
      estimatedIngredientCost: 100,
      expectedRevenue: 200,
      estimatedGrossMargin: 100,
    })
    expect(preview.body.requirements[0]).toMatchObject({
      unit: 'kg',
      requiredQuantity: 1,
      requiredQuantityBase: 1000,
      availableQuantity: 10,
      availableQuantityBase: 10000,
      shortfall: 0,
      canSatisfy: true,
      estimatedLineCost: 100,
    })
    expect((await Ingredient.findById(fixture.ingredientId)).stockQuantity).toBe(10)
    expect(await InventoryTransaction.countDocuments()).toBe(beforeTransactions)
    expect(await CookEvent.countDocuments()).toBe(0)

    const shortage = await request(app)
      .post(`/api/recipes/${fixture.recipeId}/cook-preview`)
      .send({ servings: 21 })
    expect(shortage.status).toBe(200)
    expect(shortage.body.canCook).toBe(false)
    expect(shortage.body.maxCookableServings).toBe(20)
    expect(shortage.body.requirements[0]).toMatchObject({ canSatisfy: false, shortfall: 0.5 })
  })

  test('idempotent cooking stores immutable economic snapshots and mutates inventory once', async () => {
    const fixture = await createProductionFixture(' idempotent')
    const idempotencyKey = '11111111-1111-4111-8111-111111111111'

    const first = await request(app)
      .post(`/api/recipes/${fixture.recipeId}/cook`)
      .send({ servings: 2, idempotencyKey })
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ replayed: false, transactionsCreated: 1 })
    expect(first.body.consumption[0]).toMatchObject({
      ingredientId: fixture.ingredientId,
      ingredientName: 'Production flour idempotent',
      unit: 'kg',
      requiredQuantity: 1,
      requiredQuantityBase: 1000,
      previousStock: 10,
      newStock: 9,
      costPerUnit: 100,
    })

    const event = await CookEvent.findById(first.body.cookEventId).lean()
    expect(event).toMatchObject({
      operationId: first.body.operationId,
      idempotencyKey,
      recipeId: expect.any(mongoose.Types.ObjectId),
      servings: 2,
      yieldServingsSnapshot: 4,
      sellingPricePerServingSnapshot: 100,
      totalIngredientCost: 100,
      expectedRevenue: 200,
      grossMarginTotal: 100,
      costPerServingSnapshot: 50,
      grossMarginPerServingSnapshot: 50,
      marginPercentSnapshot: 50,
    })
    expect(event.ingredients[0]).toMatchObject({
      ingredientNameSnapshot: 'Production flour idempotent',
      displayUnit: 'kg',
      baseUnit: 'g',
      quantity: 1,
      quantityBase: 1000,
      costPerUnitSnapshot: 100,
      averageCostPerBaseUnitSnapshot: 0.1,
      lineCost: 100,
    })
    expect((await Ingredient.findById(fixture.ingredientId)).stockQuantity).toBe(9)
    expect(
      await InventoryTransaction.countDocuments({ referenceId: fixture.recipeId, type: 'OUT' }),
    ).toBe(1)

    await request(app).put(`/api/ingredients/${fixture.ingredientId}`).send({ costPerUnit: 200 })
    const replay = await request(app)
      .post(`/api/recipes/${fixture.recipeId}/cook`)
      .send({ servings: 2, idempotencyKey })
    expect(replay.status).toBe(200)
    expect(replay.body).toMatchObject({
      replayed: true,
      cookEventId: String(event._id),
      operationId: first.body.operationId,
    })
    expect(replay.body.consumption[0]).toMatchObject({
      ingredientId: fixture.ingredientId,
      ingredientName: 'Production flour idempotent',
      unit: 'kg',
      requiredQuantity: 1,
      requiredQuantityBase: 1000,
      previousStock: 10,
      newStock: 9,
      costPerUnit: 100,
    })
    expect(replay.body.consumption).toEqual(first.body.consumption)
    expect((await Ingredient.findById(fixture.ingredientId)).stockQuantity).toBe(9)
    expect(await CookEvent.countDocuments({ idempotencyKey })).toBe(1)
    expect(
      await InventoryTransaction.countDocuments({ referenceId: fixture.recipeId, type: 'OUT' }),
    ).toBe(1)
    expect((await CookEvent.findById(event._id)).totalIngredientCost).toBe(100)

    const reused = await request(app)
      .post(`/api/recipes/${fixture.recipeId}/cook`)
      .send({ servings: 3, idempotencyKey })
    expect(reused.status).toBe(409)
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
  })

  test('idempotent replay rejects incomplete production ledger history without mutating stock', async () => {
    const fixture = await createProductionFixture(' incomplete replay')
    const idempotencyKey = '66666666-6666-4666-8666-666666666666'
    const first = await request(app)
      .post(`/api/recipes/${fixture.recipeId}/cook`)
      .send({ servings: 2, idempotencyKey })
    expect(first.status).toBe(200)

    await InventoryTransaction.deleteOne({
      operationId: first.body.operationId,
      referenceType: 'recipe',
      referenceId: fixture.recipeId,
      type: 'OUT',
    })

    const replay = await request(app)
      .post(`/api/recipes/${fixture.recipeId}/cook`)
      .send({ servings: 2, idempotencyKey })
    expect(replay.status).toBe(500)
    expect(replay.body.error).toMatchObject({
      code: 'PRODUCTION_HISTORY_INCOMPLETE',
      message: 'Production history is incomplete for this idempotent replay',
    })
    expect((await Ingredient.findById(fixture.ingredientId)).stockQuantity).toBe(9)
    expect(await CookEvent.countDocuments({ idempotencyKey })).toBe(1)
  })

  test('cook preview uses the transactional stock sufficiency boundary exactly', async () => {
    const fixture = await createProductionFixture(' exact preview boundary')
    await Ingredient.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(fixture.ingredientId) },
      { $set: { stockQuantityBase: 500 - 1e-10 } },
    )

    const preview = await request(app)
      .post(`/api/recipes/${fixture.recipeId}/cook-preview`)
      .send({ servings: 1 })
    expect(preview.status).toBe(200)
    expect(preview.body).toMatchObject({ canCook: false, maxCookableServings: 0 })
    expect(preview.body.requirements[0]).toMatchObject({
      requiredQuantityBase: 500,
      availableQuantityBase: 500 - 1e-10,
      canSatisfy: false,
    })

    const cook = await request(app)
      .post(`/api/recipes/${fixture.recipeId}/cook`)
      .send({ servings: 1, idempotencyKey: '77777777-7777-4777-8777-777777777777' })
    expect(cook.status).toBe(400)
    expect(cook.body.error.code).toBe('INSUFFICIENT_STOCK')
  })

  test('recording waste atomically snapshots weighted-average cost and preserves historical valuation', async () => {
    const createResponse = await request(app).post('/api/ingredients').send({
      name: 'Chicken breast',
      unit: 'kg',
      stockQuantity: 10,
      costPerUnit: 180,
    })
    const ingredientId = createResponse.body._id
    const waste = await request(app)
      .post(`/api/ingredients/${ingredientId}/waste`)
      .send({ quantity: 1.5, reasonCode: 'WASTE_SPOILAGE', note: 'Walk-in refrigerator issue' })

    expect(waste.status).toBe(200)
    expect(waste.body).toMatchObject({ message: 'Waste recorded', lossValue: 270 })
    expect(waste.body.ingredient).toMatchObject({ stockQuantity: 8.5, stockQuantityBase: 8500 })
    expect(waste.body.transaction).toMatchObject({
      type: 'OUT',
      quantity: 1.5,
      deltaQuantity: -1.5,
      previousStock: 10,
      newStock: 8.5,
      unitCost: 180,
      reasonCode: 'WASTE_SPOILAGE',
    })

    await request(app).put(`/api/ingredients/${ingredientId}`).send({ costPerUnit: 220 })
    const history = await request(app).get('/api/waste').query({ ingredientId })
    expect(history.status).toBe(200)
    expect(history.body.items[0]).toMatchObject({
      ingredientId,
      ingredientName: 'Chicken breast',
      unit: 'kg',
      quantity: 1.5,
      unitCost: 180,
      lossValue: 270,
      reasonCode: 'WASTE_SPOILAGE',
      note: 'Walk-in refrigerator issue',
    })
  })

  test('waste validation and insufficient stock leave inventory and the waste ledger unchanged', async () => {
    const createResponse = await request(app).post('/api/ingredients').send({
      name: 'Waste validation chicken',
      unit: 'kg',
      stockQuantity: 1,
      costPerUnit: 50,
    })
    const ingredientId = createResponse.body._id
    const beforeWasteCount = await InventoryTransaction.countDocuments({
      type: 'OUT',
      reasonCode: { $in: ['WASTE_SPOILAGE', 'WASTE_EXPIRED', 'WASTE_PREP', 'WASTE_DAMAGE', 'WASTE_OTHER'] },
    })

    const invalid = await request(app)
      .post(`/api/ingredients/${ingredientId}/waste`)
      .send({ quantity: 0.5, reasonCode: 'MANUAL_USAGE' })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR')

    const insufficient = await request(app)
      .post(`/api/ingredients/${ingredientId}/waste`)
      .send({ quantity: 2, reasonCode: 'WASTE_DAMAGE' })
    expect(insufficient.status).toBe(400)
    expect(insufficient.body.error.code).toBe('INSUFFICIENT_STOCK')
    expect((await Ingredient.findById(ingredientId)).stockQuantity).toBe(1)
    expect(
      await InventoryTransaction.countDocuments({
        type: 'OUT',
        reasonCode: { $in: ['WASTE_SPOILAGE', 'WASTE_EXPIRED', 'WASTE_PREP', 'WASTE_DAMAGE', 'WASTE_OTHER'] },
      }),
    ).toBe(beforeWasteCount)
  })

  test('waste history filters ledger entries and summarizes all filtered events beyond the page', async () => {
    const createResponse = await request(app).post('/api/ingredients').send({
      name: 'Waste summary chicken',
      unit: 'kg',
      stockQuantity: 10,
      costPerUnit: 180,
    })
    const ingredientId = createResponse.body._id
    const first = await request(app)
      .post(`/api/ingredients/${ingredientId}/waste`)
      .send({ quantity: 1.5, reasonCode: 'WASTE_SPOILAGE' })
    await request(app).put(`/api/ingredients/${ingredientId}`).send({ costPerUnit: 220 })
    const second = await request(app)
      .post(`/api/ingredients/${ingredientId}/waste`)
      .send({ quantity: 0.5, reasonCode: 'WASTE_EXPIRED' })
    await request(app)
      .post(`/api/ingredients/${ingredientId}/adjust-stock`)
      .send({ type: 'OUT', quantity: 0.5 })

    await InventoryTransaction.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(first.body.transaction._id) },
      { $set: { createdAt: new Date('2026-08-01T12:00:00.000Z') } },
    )
    await InventoryTransaction.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(second.body.transaction._id) },
      { $set: { createdAt: new Date('2026-08-02T12:00:00.000Z') } },
    )

    const allWaste = await request(app).get('/api/waste').query({
      ingredientId,
      dateFrom: '2026-08-01',
      dateTo: '2026-08-02',
      page: 1,
      limit: 1,
      sortOrder: 'asc',
    })
    expect(allWaste.status).toBe(200)
    expect(allWaste.body.items).toHaveLength(1)
    expect(allWaste.body.items[0].note).toBe('')
    expect(allWaste.body.pagination).toMatchObject({ total: 2, totalPages: 2 })
    expect(allWaste.body.summary).toMatchObject({ eventCount: 2, totalWasteValue: 380 })
    expect(allWaste.body.summary.byReason).toEqual(
      expect.arrayContaining([
        { reasonCode: 'WASTE_SPOILAGE', eventCount: 1, totalWasteValue: 270 },
        { reasonCode: 'WASTE_EXPIRED', eventCount: 1, totalWasteValue: 110 },
      ]),
    )

    const expiredOnly = await request(app).get('/api/waste').query({ ingredientId, reasonCode: 'WASTE_EXPIRED' })
    expect(expiredOnly.status).toBe(200)
    expect(expiredOnly.body).toMatchObject({
      summary: { eventCount: 1, totalWasteValue: 110 },
    })
    expect(expiredOnly.body.items[0].reasonCode).toBe('WASTE_EXPIRED')
  })

  test('ingredient par levels save with canonical units and reject targets below reorder level', async () => {
    const created = await request(app).post('/api/ingredients').send({
      name: 'Par level flour',
      unit: 'kg',
      stockQuantity: 2,
      costPerUnit: 100,
      reorderLevel: 0.5,
      parLevel: 2,
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ parLevel: 2, parLevelBase: 2000 })

    const updated = await request(app)
      .put(`/api/ingredients/${created.body._id}`)
      .send({ parLevel: 3 })
    expect(updated.status).toBe(200)
    expect(updated.body).toMatchObject({ parLevel: 3, parLevelBase: 3000 })

    const invalid = await request(app).post('/api/ingredients').send({
      name: 'Invalid par level flour',
      unit: 'kg',
      stockQuantity: 1,
      costPerUnit: 10,
      reorderLevel: 2,
      parLevel: 1,
    })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR')
  })

  test('inventory planning classifies depletion from the ledger and keeps summaries outside pagination', async () => {
    const now = new Date()
    const oldEnough = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
    const recent = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const outsideWindow = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000)
    const chickenResponse = await request(app).post('/api/ingredients').send({
      name: 'Planning chicken breast',
      category: 'Planning',
      unit: 'kg',
      stockQuantity: 3,
      costPerUnit: 180,
      reorderLevel: 4,
      parLevel: 12,
    })
    const legacyResponse = await request(app).post('/api/ingredients').send({
      name: 'Planning legacy stock',
      category: 'Planning',
      unit: 'kg',
      stockQuantity: 10,
      costPerUnit: 10,
      reorderLevel: 4,
    })
    const noDepletionResponse = await request(app).post('/api/ingredients').send({
      name: 'Planning quiet stock',
      category: 'Planning',
      unit: 'kg',
      stockQuantity: 10,
      costPerUnit: 10,
      reorderLevel: 4,
    })
    await Ingredient.collection.updateMany(
      { _id: { $in: [
        new mongoose.Types.ObjectId(chickenResponse.body._id),
        new mongoose.Types.ObjectId(legacyResponse.body._id),
        new mongoose.Types.ObjectId(noDepletionResponse.body._id),
      ] } },
      { $set: { createdAt: oldEnough } },
    )
    await InventoryTransaction.collection.insertMany([
      {
        ingredientId: new mongoose.Types.ObjectId(chickenResponse.body._id),
        type: 'OUT', quantity: 18, deltaQuantity: -18, previousStock: 21, newStock: 3,
        reasonCode: 'RECIPE_COOK', reason: 'Cook', unitCost: 180, referenceType: 'recipe', createdAt: recent, updatedAt: recent,
      },
      {
        ingredientId: new mongoose.Types.ObjectId(chickenResponse.body._id),
        type: 'OUT', quantity: 3, deltaQuantity: -3, previousStock: 6, newStock: 3,
        reasonCode: 'MANUAL_USAGE', reason: 'Use', unitCost: 180, referenceType: 'manual', createdAt: recent, updatedAt: recent,
      },
      {
        ingredientId: new mongoose.Types.ObjectId(chickenResponse.body._id),
        type: 'OUT', quantity: 3, deltaQuantity: -3, previousStock: 6, newStock: 3,
        reasonCode: 'WASTE_SPOILAGE', reason: 'Waste', unitCost: 180, referenceType: 'manual', createdAt: recent, updatedAt: recent,
      },
      {
        ingredientId: new mongoose.Types.ObjectId(chickenResponse.body._id),
        type: 'OUT', quantity: 99, deltaQuantity: -99, previousStock: 102, newStock: 3,
        reasonCode: 'RECIPE_COOK', reason: 'Old cook', unitCost: 180, referenceType: 'recipe', createdAt: outsideWindow, updatedAt: outsideWindow,
      },
      {
        ingredientId: new mongoose.Types.ObjectId(chickenResponse.body._id),
        type: 'IN', quantity: 10, deltaQuantity: 10, previousStock: 3, newStock: 13,
        reasonCode: 'MANUAL_RECEIPT', reason: 'Receipt', unitCost: 180, referenceType: 'manual', createdAt: recent, updatedAt: recent,
      },
      {
        ingredientId: new mongoose.Types.ObjectId(chickenResponse.body._id),
        type: 'ADJUST', quantity: 2, deltaQuantity: 2, previousStock: 1, newStock: 3,
        reasonCode: 'PHYSICAL_COUNT', reason: 'Count', unitCost: 180, referenceType: 'manual', createdAt: recent, updatedAt: recent,
      },
      {
        ingredientId: new mongoose.Types.ObjectId(legacyResponse.body._id),
        type: 'OUT', quantity: 2, deltaQuantity: -2, previousStock: 12, newStock: 10,
        reason: 'Legacy use', unitCost: 10, referenceType: 'manual', createdAt: recent, updatedAt: recent,
      },
    ])

    const planning = await request(app).get('/api/planning/inventory').query({
      lookbackDays: 30,
      search: 'Planning chicken breast',
    })
    expect(planning.status).toBe(200)
    expect(planning.body.items).toHaveLength(1)
    expect(planning.body.items[0]).toMatchObject({
      consumptionQuantity: 21,
      wasteQuantity: 3,
      otherOutQuantity: 0,
      depletionQuantity: 24,
      historyCoverageDays: 30,
      dataSufficient: true,
      reorderTriggered: true,
      parConfigured: true,
      suggestedReorderQuantity: 9,
      daysUntilReorder: 0,
    })
    expect(planning.body.items[0].averageDailyConsumption).toBeCloseTo(0.7)
    expect(planning.body.items[0].averageDailyWaste).toBeCloseTo(0.1)
    expect(planning.body.items[0].averageDailyDepletion).toBeCloseTo(0.8)
    expect(planning.body.items[0].daysRemaining).toBeCloseTo(3.75)

    const legacy = await request(app).get('/api/planning/inventory').query({ lookbackDays: 30, search: 'legacy stock' })
    expect(legacy.status).toBe(200)
    expect(legacy.body.items[0]).toMatchObject({ consumptionQuantity: 2, wasteQuantity: 0, depletionQuantity: 2 })

    const paged = await request(app).get('/api/planning/inventory').query({ category: 'Planning', page: 1, limit: 1 })
    expect(paged.status).toBe(200)
    expect(paged.body.items).toHaveLength(1)
    expect(paged.body.summary).toMatchObject({ ingredientCount: 3, reorderTriggeredCount: 1, parUnconfiguredCount: 2, noDepletionDataCount: 1 })
    const quiet = await request(app).get('/api/planning/inventory').query({ search: 'quiet stock' })
    expect(quiet.body.items[0]).toMatchObject({ averageDailyDepletion: 0, daysRemaining: null, daysUntilReorder: null })
  })

  test('CookEvent failure rolls stock and ledger back together', async () => {
    const fixture = await createProductionFixture(' rollback')
    const transactionCount = await InventoryTransaction.countDocuments()
    const eventSpy = jest.spyOn(CookEvent, 'create').mockRejectedValueOnce(new Error('forced event failure'))

    try {
      const response = await request(app)
        .post(`/api/recipes/${fixture.recipeId}/cook`)
        .send({ servings: 2, idempotencyKey: '22222222-2222-4222-8222-222222222222' })
      expect(response.status).toBe(500)
      expect((await Ingredient.findById(fixture.ingredientId)).stockQuantity).toBe(10)
      expect(await InventoryTransaction.countDocuments()).toBe(transactionCount)
      expect(await CookEvent.countDocuments()).toBe(0)
    } finally {
      eventSpy.mockRestore()
    }
  })

  test('simultaneous identical idempotency keys create one production operation', async () => {
    const fixture = await createProductionFixture(' race')
    const idempotencyKey = '33333333-3333-4333-8333-333333333333'
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post(`/api/recipes/${fixture.recipeId}/cook`)
          .send({ servings: 2, idempotencyKey }),
      ),
    )

    expect(responses.map((response) => response.status)).toEqual([200, 200])
    expect(responses.map((response) => response.body.replayed).sort()).toEqual([false, true])
    expect(new Set(responses.map((response) => response.body.operationId)).size).toBe(1)
    expect((await Ingredient.findById(fixture.ingredientId)).stockQuantity).toBe(9)
    expect(await CookEvent.countDocuments({ idempotencyKey })).toBe(1)
    expect(
      await InventoryTransaction.countDocuments({ referenceId: fixture.recipeId, type: 'OUT' }),
    ).toBe(1)
  })

  test('production history filters immutable snapshots with pagination and dates', async () => {
    const first = await createProductionFixture(' history one')
    const second = await createProductionFixture(' history two')
    await request(app)
      .post(`/api/recipes/${first.recipeId}/cook`)
      .send({ servings: 1, idempotencyKey: '44444444-4444-4444-8444-444444444444' })
    await request(app)
      .post(`/api/recipes/${second.recipeId}/cook`)
      .send({ servings: 2, idempotencyKey: '55555555-5555-4555-8555-555555555555' })
    await CookEvent.collection.updateOne(
      { recipeId: new mongoose.Types.ObjectId(first.recipeId) },
      { $set: { createdAt: new Date('2026-08-01T12:00:00.000Z') } },
    )
    await CookEvent.collection.updateOne(
      { recipeId: new mongoose.Types.ObjectId(second.recipeId) },
      { $set: { createdAt: new Date('2026-08-10T12:00:00.000Z') } },
    )

    const filtered = await request(app).get('/api/production').query({
      recipeId: first.recipeId,
      dateFrom: '2026-08-01',
      dateTo: '2026-08-01',
      page: 1,
      limit: 1,
      sortOrder: 'asc',
    })
    expect(filtered.status).toBe(200)
    expect(filtered.body.pagination).toMatchObject({ page: 1, limit: 1, total: 1 })
    expect(filtered.body.items).toHaveLength(1)
    expect(filtered.body.items[0]).toMatchObject({
      recipeNameSnapshot: 'Production bread history one',
      servings: 1,
    })
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
    expect(readyResponse.body.canonicalDataReady).toBe(true)
  })
})
