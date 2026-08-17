const request = require('supertest')
const mongoose = require('mongoose')
const { MongoMemoryReplSet } = require('mongodb-memory-server')
const app = require('../app')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')
const Recipe = require('../models/Recipe')
const CookEvent = require('../models/CookEvent')
const Supplier = require('../models/Supplier')
const PurchaseOrder = require('../models/PurchaseOrder')
const PurchaseReceipt = require('../models/PurchaseReceipt')
const StocktakeSession = require('../models/StocktakeSession')
const SalesRecord = require('../models/SalesRecord')
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
  let databaseReady = false

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

  const createSalesFixture = async () => {
    const chickenIngredient = await request(app).post('/api/ingredients').send({
      name: 'Chicken Rice portion',
      unit: 'pcs',
      stockQuantity: 2,
      costPerUnit: 45,
    })
    const teaIngredient = await request(app).post('/api/ingredients').send({
      name: 'Iced Tea portion',
      unit: 'pcs',
      stockQuantity: 2,
      costPerUnit: 12,
    })
    const chicken = await request(app).post('/api/recipes').send({
      name: 'Chicken Rice',
      sellingPrice: 180,
      yieldServings: 1,
      ingredients: [{ ingredientId: chickenIngredient.body._id, quantity: 1, unit: 'pcs' }],
    })
    const tea = await request(app).post('/api/recipes').send({
      name: 'Iced Tea',
      sellingPrice: 60,
      yieldServings: 1,
      ingredients: [{ ingredientId: teaIngredient.body._id, quantity: 1, unit: 'pcs' }],
    })
    return {
      ingredientIds: [chickenIngredient.body._id, teaIngredient.body._id],
      recipeIds: [chicken.body._id, tea.body._id],
    }
  }

  const createPrepFixture = async ({ stockQuantity = 1.5 } = {}) => {
    const rice = await request(app).post('/api/ingredients').send({
      name: 'Prep rice',
      unit: 'kg',
      stockQuantity,
      costPerUnit: 60,
    })
    const bowl = await request(app).post('/api/recipes').send({
      name: 'Rice Bowl',
      sellingPrice: 180,
      yieldServings: 1,
      ingredients: [{ ingredientId: rice.body._id, quantity: 0.1, unit: 'kg' }],
    })
    const soup = await request(app).post('/api/recipes').send({
      name: 'Rice Soup',
      sellingPrice: 120,
      yieldServings: 1,
      ingredients: [{ ingredientId: rice.body._id, quantity: 0.25, unit: 'kg' }],
    })
    return { ingredientId: rice.body._id, bowlId: bowl.body._id, soupId: soup.body._id }
  }

  const createPrepSalesRecord = async ({ businessDate, lines, status = 'ACTIVE' }) => {
    const recipes = await Recipe.find({ _id: { $in: lines.map((line) => line.recipeId) } }).lean()
    const recipeMap = new Map(recipes.map((recipe) => [String(recipe._id), recipe]))
    const snapshots = lines.map((line) => {
      const recipe = recipeMap.get(String(line.recipeId))
      return {
        recipeId: recipe._id,
        recipeNameSnapshot: recipe.name,
        yieldServingsSnapshot: recipe.yieldServings,
        servingsSold: line.servings,
        sellingPricePerServingSnapshot: recipe.sellingPrice,
        costPerServingSnapshot: 0,
        estimatedRevenue: line.servings * recipe.sellingPrice,
        estimatedFoodCost: 0,
        estimatedGrossProfit: line.servings * recipe.sellingPrice,
        grossMarginPercentSnapshot: 100,
      }
    })
    const totalServings = snapshots.reduce((sum, line) => sum + line.servingsSold, 0)
    const totalRevenue = snapshots.reduce((sum, line) => sum + line.estimatedRevenue, 0)
    return SalesRecord.create({
      businessDate,
      status,
      cancelledAt: status === 'CANCELLED' ? new Date() : null,
      lines: snapshots,
      totalServings,
      totalRevenue,
      totalEstimatedFoodCost: 0,
      totalEstimatedGrossProfit: totalRevenue,
      grossMarginPercent: 100,
    })
  }

  const seedPrepAcceptanceSales = async (fixture) => {
    for (const businessDate of ['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-16']) {
      await createPrepSalesRecord({
        businessDate,
        lines: [
          { recipeId: fixture.bowlId, servings: 10 },
          { recipeId: fixture.soupId, servings: 4 },
        ],
      })
    }
  }

  beforeAll(async () => {
    try {
      mongoServer = await MongoMemoryReplSet.create({
        replSet: {
          count: 1,
          storageEngine: 'wiredTiger',
        },
      })
      await mongoose.connect(mongoServer.getUri(), { dbName: 'inventory-brew-test' })
      await CookEvent.init()
      databaseReady = true
    } catch (error) {
      console.error(`Test database startup failed: ${error.message}`)
      throw error
    }
  })

  afterEach(async () => {
    if (!databaseReady || mongoose.connection.readyState !== 1) {
      return
    }

    await Promise.all([
      Ingredient.deleteMany({}),
      Recipe.deleteMany({}),
      InventoryTransaction.deleteMany({}),
      CookEvent.deleteMany({}),
      Supplier.deleteMany({}),
      PurchaseOrder.deleteMany({}),
      PurchaseReceipt.deleteMany({}),
      StocktakeSession.deleteMany({}),
      SalesRecord.deleteMany({}),
    ])
  })

  afterAll(async () => {
    if (!databaseReady) {
      await Promise.allSettled([
        mongoose.connection.readyState !== 0 ? mongoose.disconnect() : Promise.resolve(),
        mongoServer ? mongoServer.stop() : Promise.resolve(),
      ])
      return
    }

    try {
      await mongoose.disconnect()
    } finally {
      if (mongoServer) {
        await mongoServer.stop()
      }
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

  test('Stock Count start snapshots active display and canonical quantities without inventory movement', async () => {
    await Ingredient.create([
      { name: 'Chicken', category: 'Protein', unit: 'kg', stockQuantity: 10, costPerUnit: 180 },
      { name: 'Eggs', unit: 'pcs', stockQuantity: 30, costPerUnit: 8 },
      { name: 'Archived rice', unit: 'kg', stockQuantity: 20, costPerUnit: 60, isActive: false },
    ])
    const before = await Ingredient.find().sort({ name: 1 }).lean()
    const ledgerCount = await InventoryTransaction.countDocuments()

    const response = await request(app).post('/api/stocktakes').send({ name: 'Weekly count', notes: 'Close' })

    expect(response.status).toBe(201)
    expect(response.body.status).toBe('DRAFT')
    expect(response.body.operationId).toBeNull()
    expect(response.body.lines).toHaveLength(2)
    expect(response.body.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredientNameSnapshot: 'Chicken', categorySnapshot: 'Protein', unit: 'kg', baseUnit: 'g', expectedStockQuantitySnapshot: 10, expectedStockQuantityBaseSnapshot: 10000, countedQuantity: null }),
      expect.objectContaining({ ingredientNameSnapshot: 'Eggs', unit: 'pcs', baseUnit: 'pcs', expectedStockQuantitySnapshot: 30, expectedStockQuantityBaseSnapshot: 30, countedQuantity: null }),
    ]))
    expect(await Ingredient.find().sort({ name: 1 }).lean()).toEqual(before)
    expect(await InventoryTransaction.countDocuments()).toBe(ledgerCount)
  })

  test('Stock Count drafts preserve null versus zero and reject strings without changing stock', async () => {
    const ingredients = await Ingredient.create([
      { name: 'Draft flour', unit: 'kg', stockQuantity: 4, costPerUnit: 20 },
      { name: 'Draft eggs', unit: 'pcs', stockQuantity: 12, costPerUnit: 2 },
    ])
    const started = await request(app).post('/api/stocktakes').send({ name: 'Draft validation' })
    const response = await request(app).put(`/api/stocktakes/${started.body._id}`).send({ counts: [
      { ingredientId: String(ingredients[0]._id), countedQuantity: 0 },
      { ingredientId: String(ingredients[1]._id), countedQuantity: null },
    ] })
    expect(response.status).toBe(200)
    const byId = new Map(response.body.lines.map((line) => [line.ingredientId, line.countedQuantity]))
    expect(byId.get(String(ingredients[0]._id))).toBe(0)
    expect(byId.get(String(ingredients[1]._id))).toBeNull()
    for (const invalid of ['9.5', '']) {
      const rejected = await request(app).put(`/api/stocktakes/${started.body._id}`).send({ counts: [{ ingredientId: String(ingredients[1]._id), countedQuantity: invalid }] })
      expect(rejected.status).toBe(400)
      expect(rejected.body.error.code).toBe('VALIDATION_ERROR')
    }
    expect((await Ingredient.findById(ingredients[0]._id)).stockQuantity).toBe(4)
    expect(await InventoryTransaction.countDocuments()).toBe(0)
  })

  test('Stock Count cannot finish with an uncounted item while explicit zero is complete', async () => {
    const ingredients = await Ingredient.create([
      { name: 'Zero item', unit: 'pcs', stockQuantity: 2, costPerUnit: 1 },
      { name: 'Blank item', unit: 'pcs', stockQuantity: 3, costPerUnit: 1 },
    ])
    const started = await request(app).post('/api/stocktakes').send({ name: 'Incomplete count' })
    await request(app).put(`/api/stocktakes/${started.body._id}`).send({ counts: [
      { ingredientId: String(ingredients[0]._id), countedQuantity: 0 },
      { ingredientId: String(ingredients[1]._id), countedQuantity: null },
    ] })
    const response = await request(app).post(`/api/stocktakes/${started.body._id}/post`).send()
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('STOCKTAKE_INCOMPLETE')
    expect(response.body.error.details).toEqual([expect.objectContaining({ ingredientName: 'Blank item' })])
    expect((await StocktakeSession.findById(started.body._id)).status).toBe('DRAFT')
    expect(await InventoryTransaction.countDocuments()).toBe(0)
  })

  test('Stock Count posts kg and pcs acceptance fixture with signed immutable economics and two ledger rows', async () => {
    const ingredients = await Ingredient.create([
      { name: 'Chicken', unit: 'kg', stockQuantity: 10, costPerUnit: 180 },
      { name: 'Rice', unit: 'kg', stockQuantity: 20, costPerUnit: 60 },
      { name: 'Eggs', unit: 'pcs', stockQuantity: 30, costPerUnit: 8 },
    ])
    const started = await request(app).post('/api/stocktakes').send({ name: 'Acceptance count' })
    await request(app).put(`/api/stocktakes/${started.body._id}`).send({ counts: [
      { ingredientId: String(ingredients[0]._id), countedQuantity: 9 },
      { ingredientId: String(ingredients[1]._id), countedQuantity: 20 },
      { ingredientId: String(ingredients[2]._id), countedQuantity: 32 },
    ] })
    const posted = await request(app).post(`/api/stocktakes/${started.body._id}/post`).send()
    expect(posted.status).toBe(200)
    expect(posted.body.status).toBe('POSTED')
    expect(posted.body.operationId).toEqual(expect.any(String))
    const lines = new Map(posted.body.lines.map((line) => [line.ingredientNameSnapshot, line]))
    expect(lines.get('Chicken')).toMatchObject({ countedQuantity: 9, countedQuantityBase: 9000, varianceQuantity: -1, varianceQuantityBase: -1000, unitCostSnapshot: 180, varianceValue: -180 })
    expect(lines.get('Rice')).toMatchObject({ countedQuantity: 20, countedQuantityBase: 20000, varianceQuantity: 0, varianceQuantityBase: 0, unitCostSnapshot: 60, varianceValue: 0 })
    expect(lines.get('Eggs')).toMatchObject({ countedQuantity: 32, countedQuantityBase: 32, varianceQuantity: 2, varianceQuantityBase: 2, unitCostSnapshot: 8, varianceValue: 16 })
    expect(posted.body.summary).toMatchObject({ lineCount: 3, varianceLineCount: 2, shortageLineCount: 1, overageLineCount: 1, netVarianceValue: -164, absoluteVarianceValue: 196 })
    const final = await Ingredient.find().sort({ name: 1 }).lean()
    expect(final.find((item) => item.name === 'Chicken')).toMatchObject({ stockQuantity: 9, stockQuantityBase: 9000 })
    expect(final.find((item) => item.name === 'Rice')).toMatchObject({ stockQuantity: 20, stockQuantityBase: 20000 })
    expect(final.find((item) => item.name === 'Eggs')).toMatchObject({ stockQuantity: 32, stockQuantityBase: 32 })
    const ledger = await InventoryTransaction.find({ referenceType: 'stocktake', referenceId: started.body._id }).lean()
    expect(ledger).toHaveLength(2)
    expect(new Set(ledger.map((entry) => entry.operationId))).toEqual(new Set([posted.body.operationId]))
    expect(ledger).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'ADJUST', reasonCode: 'PHYSICAL_COUNT', quantity: 1, deltaQuantity: -1, previousStock: 10, newStock: 9 }),
      expect.objectContaining({ type: 'ADJUST', reasonCode: 'PHYSICAL_COUNT', quantity: 2, deltaQuantity: 2, previousStock: 30, newStock: 32 }),
    ]))
  })

  test('Stock Count treats decimal-equivalent canonical quantities as a no-op', async () => {
    const created = await request(app).post('/api/ingredients').send({
      name: 'Decimal count flour',
      unit: 'kg',
      stockQuantity: 0,
      costPerUnit: 100,
    })
    expect(created.status).toBe(201)
    for (const quantity of [0.1, 0.2]) {
      expect((await request(app)
        .post(`/api/ingredients/${created.body._id}/adjust-stock`)
        .send({ type: 'IN', quantity, reason: 'Decimal receipt' })).status).toBe(200)
    }
    const started = await request(app).post('/api/stocktakes').send({ name: 'Decimal no-op count' })
    expect((await request(app).put(`/api/stocktakes/${started.body._id}`).send({
      counts: [{ ingredientId: created.body._id, countedQuantity: 0.3 }],
    })).status).toBe(200)

    const posted = await request(app).post(`/api/stocktakes/${started.body._id}/post`).send()

    expect(posted.status).toBe(200)
    expect(posted.body.status).toBe('POSTED')
    expect(posted.body.lines[0]).toMatchObject({
      countedQuantity: 0.3,
      countedQuantityBase: 300,
      varianceQuantity: 0,
      varianceQuantityBase: 0,
      varianceValue: 0,
    })
    expect(posted.body.summary).toMatchObject({
      varianceLineCount: 0,
      shortageLineCount: 0,
      overageLineCount: 0,
      netVarianceValue: 0,
      absoluteVarianceValue: 0,
    })
    expect(await Ingredient.findById(created.body._id).lean()).toMatchObject({ stockQuantityBase: 300 })
    expect(await InventoryTransaction.countDocuments({ referenceType: 'stocktake', referenceId: started.body._id })).toBe(0)
  })

  test('Stock Count detects canonical stale stock and applies none of its adjustments', async () => {
    const ingredients = await Ingredient.create([
      { name: 'Conflict chicken', unit: 'kg', stockQuantity: 10, costPerUnit: 180 },
      { name: 'Unaffected eggs', unit: 'pcs', stockQuantity: 30, costPerUnit: 8 },
    ])
    const started = await request(app).post('/api/stocktakes').send({ name: 'Stale count' })
    await request(app).put(`/api/stocktakes/${started.body._id}`).send({ counts: [
      { ingredientId: String(ingredients[0]._id), countedQuantity: 9 },
      { ingredientId: String(ingredients[1]._id), countedQuantity: 28 },
    ] })
    await request(app).post(`/api/ingredients/${ingredients[0]._id}/adjust-stock`).send({ type: 'IN', quantity: 5, reason: 'Delivery' })
    const beforeStocktakeLedger = await InventoryTransaction.countDocuments()
    const response = await request(app).post(`/api/stocktakes/${started.body._id}/post`).send()
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('STOCKTAKE_CONFLICT')
    expect(response.body.error.details).toEqual([expect.objectContaining({ ingredientName: 'Conflict chicken', expectedQuantity: 10, currentQuantity: 15, unit: 'kg' })])
    expect(await InventoryTransaction.countDocuments()).toBe(beforeStocktakeLedger)
    expect(await Ingredient.findById(ingredients[0]._id).lean()).toMatchObject({ stockQuantity: 15, stockQuantityBase: 15000 })
    expect(await Ingredient.findById(ingredients[1]._id).lean()).toMatchObject({ stockQuantity: 30, stockQuantityBase: 30 })
    expect((await StocktakeSession.findById(started.body._id)).status).toBe('DRAFT')
  })

  test('Stock Count finalization failure rolls back display/base stock, ledger, and session state', async () => {
    const ingredient = await Ingredient.create({ name: 'Rollback chicken', unit: 'kg', stockQuantity: 10, costPerUnit: 180 })
    const started = await request(app).post('/api/stocktakes').send({ name: 'Rollback count' })
    await request(app).put(`/api/stocktakes/${started.body._id}`).send({ counts: [{ ingredientId: String(ingredient._id), countedQuantity: 9 }] })
    const originalSave = StocktakeSession.prototype.save
    const saveSpy = jest.spyOn(StocktakeSession.prototype, 'save').mockImplementation(function mockedSave(options) {
      if (this.status === 'POSTED') return Promise.reject(new Error('forced stocktake finalization failure'))
      return originalSave.call(this, options)
    })
    try {
      const response = await request(app).post(`/api/stocktakes/${started.body._id}/post`).send()
      expect(response.status).toBe(500)
      expect(await Ingredient.findById(ingredient._id).lean()).toMatchObject({ stockQuantity: 10, stockQuantityBase: 10000 })
      expect(await InventoryTransaction.countDocuments({ referenceType: 'stocktake' })).toBe(0)
      expect(await StocktakeSession.findById(started.body._id).lean()).toMatchObject({ status: 'DRAFT', operationId: null, postedAt: null })
    } finally {
      saveSpy.mockRestore()
    }
  })

  test('Stock Count completed detail remains an immutable name, quantity, cost, and difference snapshot', async () => {
    const ingredient = await Ingredient.create({ name: 'Historical chicken', category: 'Protein', unit: 'kg', stockQuantity: 10, costPerUnit: 180 })
    const started = await request(app).post('/api/stocktakes').send({ name: 'Historical count' })
    await request(app).put(`/api/stocktakes/${started.body._id}`).send({ counts: [{ ingredientId: String(ingredient._id), countedQuantity: 9 }] })
    expect((await request(app).post(`/api/stocktakes/${started.body._id}/post`).send()).status).toBe(200)
    await Ingredient.updateOne({ _id: ingredient._id }, { $set: { name: 'Renamed chicken', category: 'Other', costPerUnit: 999, stockQuantity: 22, stockQuantityBase: 22000 } })
    const detail = await request(app).get(`/api/stocktakes/${started.body._id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.lines[0]).toMatchObject({ ingredientNameSnapshot: 'Historical chicken', categorySnapshot: 'Protein', unit: 'kg', baseUnit: 'g', expectedStockQuantitySnapshot: 10, expectedStockQuantityBaseSnapshot: 10000, countedQuantity: 9, countedQuantityBase: 9000, varianceQuantity: -1, varianceQuantityBase: -1000, unitCostSnapshot: 180, varianceValue: -180 })
  })

  test('Stock Count posted and cancelled sessions are read-only across lifecycle actions', async () => {
    const ingredient = await Ingredient.create({ name: 'Lifecycle item', unit: 'pcs', stockQuantity: 2, costPerUnit: 1 })
    const completed = await request(app).post('/api/stocktakes').send({ name: 'Completed lifecycle' })
    await request(app).put(`/api/stocktakes/${completed.body._id}`).send({ counts: [{ ingredientId: String(ingredient._id), countedQuantity: 2 }] })
    await request(app).post(`/api/stocktakes/${completed.body._id}/post`).send()
    for (const response of [
      await request(app).put(`/api/stocktakes/${completed.body._id}`).send({ counts: [] }),
      await request(app).post(`/api/stocktakes/${completed.body._id}/post`).send(),
      await request(app).post(`/api/stocktakes/${completed.body._id}/cancel`).send(),
    ]) expect(response.status).toBe(409)
    const cancelled = await request(app).post('/api/stocktakes').send({ name: 'Cancelled lifecycle' })
    expect((await request(app).post(`/api/stocktakes/${cancelled.body._id}/cancel`).send()).status).toBe(200)
    expect((await request(app).put(`/api/stocktakes/${cancelled.body._id}`).send({ counts: [] })).status).toBe(409)
    expect((await request(app).post(`/api/stocktakes/${cancelled.body._id}/post`).send()).status).toBe(409)
    const list = await request(app).get('/api/stocktakes?sortOrder=desc&page=1&limit=10')
    expect(list.status).toBe(200)
    expect(list.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Completed lifecycle', status: 'POSTED', lineCount: 1, countedLineCount: 1 }),
      expect.objectContaining({ name: 'Cancelled lifecycle', status: 'CANCELLED', lineCount: 1, countedLineCount: 0 }),
    ]))
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

  test('planning excludes future transactions, uses young coverage, and validates sort order', async () => {
    const ingredient = await Ingredient.create({ name: 'Young planning stock', unit: 'kg', stockQuantity: 20, costPerUnit: 10, reorderLevel: 4, createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) })
    await InventoryTransaction.create([
      { ingredientId: ingredient._id, type: 'OUT', quantity: 10, deltaQuantity: -10, previousStock: 20, newStock: 10, reasonCode: 'MANUAL_USAGE', createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      { ingredientId: ingredient._id, type: 'OUT', quantity: 7, deltaQuantity: -7, previousStock: 10, newStock: 3, reasonCode: 'MANUAL_CORRECTION', createdAt: new Date(Date.now() - 60 * 60 * 1000) },
      { ingredientId: ingredient._id, type: 'OUT', quantity: 99, deltaQuantity: -99, previousStock: 3, newStock: 0, reasonCode: 'MANUAL_USAGE', createdAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    ])
    const response = await request(app).get('/api/planning/inventory').query({ search: 'Young planning stock', lookbackDays: 30 })
    expect(response.status).toBe(200)
    expect(response.body.items[0]).toMatchObject({ consumptionQuantity: 10, otherOutQuantity: 7, depletionQuantity: 17 })
    expect(response.body.items[0].historyCoverageDays).toBeGreaterThanOrEqual(4)
    expect(response.body.items[0].historyCoverageDays).toBeLessThanOrEqual(6)
    expect(response.body.items[0].averageDailyDepletion).toBeCloseTo(17 / response.body.items[0].historyCoverageDays)
    const invalidSort = await request(app).get('/api/planning/inventory').query({ sortOrder: 'sideways' })
    expect(invalidSort.status).toBe(400)
    expect(invalidSort.body.error.code).toBe('VALIDATION_ERROR')
  })

  test('suppliers archive and restore, and draft orders retain creation snapshots', async () => {
    const supplier = await request(app).post('/api/suppliers').send({ name: 'Metro Foods', contactName: 'Pat' })
    expect(supplier.status).toBe(201)
    const ingredient = await request(app).post('/api/ingredients').send({ name: 'PO chicken', unit: 'kg', stockQuantity: 10, costPerUnit: 100, preferredSupplierId: supplier.body._id })
    const duplicate = await request(app).post('/api/purchase-orders').send({ supplierId: supplier.body._id, items: [{ ingredientId: ingredient.body._id, orderedQuantity: 2, expectedUnitCost: 150 }, { ingredientId: ingredient.body._id, orderedQuantity: 1, expectedUnitCost: 150 }] })
    expect(duplicate.status).toBe(400)
    const draft = await request(app).post('/api/purchase-orders').send({ supplierId: supplier.body._id, items: [{ ingredientId: ingredient.body._id, orderedQuantity: 10, expectedUnitCost: 150 }] })
    expect(draft.status).toBe(201)
    expect(draft.body).toMatchObject({ status: 'DRAFT', supplierNameSnapshot: 'Metro Foods' })
    expect(draft.body.items[0]).toMatchObject({ ingredientNameSnapshot: 'PO chicken', unit: 'kg', receivedQuantity: 0 })
    const archive = await request(app).delete(`/api/suppliers/${supplier.body._id}`)
    expect(archive.status).toBe(200)
    const restore = await request(app).patch(`/api/suppliers/${supplier.body._id}/restore`)
    expect(restore.status).toBe(200)
  })

  test('purchase receipts atomically update stock, weighted average, order state, ledger and immutable snapshots', async () => {
    const supplier = await request(app).post('/api/suppliers').send({ name: 'Receipt supplier' })
    const ingredient = await request(app).post('/api/ingredients').send({ name: 'Receipt chicken', unit: 'kg', stockQuantity: 10, costPerUnit: 100 })
    const draft = await request(app).post('/api/purchase-orders').send({ supplierId: supplier.body._id, items: [{ ingredientId: ingredient.body._id, orderedQuantity: 10, expectedUnitCost: 150 }] })
    const ordered = await request(app).post(`/api/purchase-orders/${draft.body._id}/order`)
    expect(ordered.status).toBe(200)
    const itemId = ordered.body.items[0]._id
    const first = await request(app).post(`/api/purchase-orders/${ordered.body._id}/receive`).send({ items: [{ purchaseOrderItemId: itemId, quantity: 6, unitCost: 160 }] })
    expect(first.status).toBe(200)
    expect(first.body.purchaseOrder).toMatchObject({ status: 'PARTIALLY_RECEIVED' })
    expect(first.body.purchaseOrder.items[0].receivedQuantity).toBeCloseTo(6)
    const current = await Ingredient.findById(ingredient.body._id).lean()
    expect(current.stockQuantity).toBeCloseTo(16)
    expect(current.costPerUnit).toBeCloseTo(122.5)
    const ledger = await InventoryTransaction.findOne({ operationId: first.body.operationId }).lean()
    expect(ledger).toMatchObject({ type: 'IN', reasonCode: 'PURCHASE_RECEIPT', unitCost: 160, referenceType: 'purchase' })
    const second = await request(app).post(`/api/purchase-orders/${ordered.body._id}/receive`).send({ items: [{ purchaseOrderItemId: itemId, quantity: 4, unitCost: 170 }] })
    expect(second.status).toBe(200)
    expect(second.body.purchaseOrder.status).toBe('RECEIVED')
    const completed = await Ingredient.findById(ingredient.body._id).lean()
    expect(completed.costPerUnit).toBeCloseTo(132)
    await Supplier.findByIdAndUpdate(supplier.body._id, { name: 'Renamed supplier' })
    await Ingredient.findByIdAndUpdate(ingredient.body._id, { name: 'Renamed chicken' })
    const receipts = await request(app).get('/api/purchase-receipts').query({ purchaseOrderId: ordered.body._id })
    expect(receipts.body.items).toHaveLength(2)
    expect(receipts.body.items[0]).toMatchObject({ supplierNameSnapshot: 'Receipt supplier' })
    expect(receipts.body.items.flatMap((receipt) => receipt.items).map((line) => line.ingredientNameSnapshot)).toContain('Receipt chicken')
  })

  test('decimal partial receipts normalize exact completion while meaningful over-receipt remains rejected', async () => {
    const supplier = await request(app).post('/api/suppliers').send({ name: 'Decimal supplier' })
    const ingredient = await request(app).post('/api/ingredients').send({ name: 'Decimal spice', unit: 'kg', stockQuantity: 1, costPerUnit: 5 })
    const draft = await request(app).post('/api/purchase-orders').send({ supplierId: supplier.body._id, items: [{ ingredientId: ingredient.body._id, orderedQuantity: 0.3, expectedUnitCost: 5 }] })
    const ordered = await request(app).post(`/api/purchase-orders/${draft.body._id}/order`)
    const itemId = ordered.body.items[0]._id

    const first = await request(app).post(`/api/purchase-orders/${draft.body._id}/receive`).send({ items: [{ purchaseOrderItemId: itemId, quantity: 0.1, unitCost: 5 }] })
    expect(first.status).toBe(200)
    expect(first.body.purchaseOrder.status).toBe('PARTIALLY_RECEIVED')
    expect(first.body.purchaseOrder.items[0].receivedQuantity).toBeCloseTo(0.1)

    const second = await request(app).post(`/api/purchase-orders/${draft.body._id}/receive`).send({ items: [{ purchaseOrderItemId: itemId, quantity: 0.2, unitCost: 5 }] })
    expect(second.status).toBe(200)
    expect(second.body.purchaseOrder.status).toBe('RECEIVED')
    expect(second.body.purchaseOrder.items[0].receivedQuantity).toBe(0.3)
    expect(second.body.purchaseOrder.items[0].remainingQuantity).toBe(0)
    expect((await Ingredient.findById(ingredient.body._id)).stockQuantity).toBeCloseTo(1.3)

    const extraDraft = await request(app).post('/api/purchase-orders').send({ supplierId: supplier.body._id, items: [{ ingredientId: ingredient.body._id, orderedQuantity: 0.3, expectedUnitCost: 5 }] })
    const extraOrdered = await request(app).post(`/api/purchase-orders/${extraDraft.body._id}/order`)
    const extraItemId = extraOrdered.body.items[0]._id
    await request(app).post(`/api/purchase-orders/${extraDraft.body._id}/receive`).send({ items: [{ purchaseOrderItemId: extraItemId, quantity: 0.1, unitCost: 5 }] })
    const rejected = await request(app).post(`/api/purchase-orders/${extraDraft.body._id}/receive`).send({ items: [{ purchaseOrderItemId: extraItemId, quantity: 0.201, unitCost: 5 }] })
    expect(rejected.status).toBe(409)
    expect(rejected.body.error.code).toBe('RECEIPT_CONFLICT')
    expect((await PurchaseOrder.findById(extraDraft.body._id)).items[0].receivedQuantity).toBeCloseTo(0.1)
  })

  test('PurchaseReceipt failure rolls stock, canonical cost, PO, and ledger back together', async () => {
    const supplier = await request(app).post('/api/suppliers').send({ name: 'Rollback supplier' })
    const ingredientResponse = await request(app).post('/api/ingredients').send({ name: 'Rollback purchase stock', unit: 'kg', stockQuantity: 10, costPerUnit: 100 })
    const draft = await request(app).post('/api/purchase-orders').send({ supplierId: supplier.body._id, items: [{ ingredientId: ingredientResponse.body._id, orderedQuantity: 5, expectedUnitCost: 150 }] })
    const ordered = await request(app).post(`/api/purchase-orders/${draft.body._id}/order`)
    const beforeIngredient = await Ingredient.findById(ingredientResponse.body._id).lean()
    const receiptCount = await PurchaseReceipt.countDocuments()
    const ledgerCount = await InventoryTransaction.countDocuments({ reasonCode: 'PURCHASE_RECEIPT' })
    const receiptSpy = jest.spyOn(PurchaseReceipt, 'create').mockRejectedValueOnce(new Error('forced receipt failure'))

    try {
      const response = await request(app).post(`/api/purchase-orders/${draft.body._id}/receive`).send({ items: [{ purchaseOrderItemId: ordered.body.items[0]._id, quantity: 5, unitCost: 160 }] })
      expect(response.status).toBe(500)
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR')
    } finally {
      receiptSpy.mockRestore()
    }

    const afterIngredient = await Ingredient.findById(ingredientResponse.body._id).lean()
    expect(afterIngredient).toMatchObject({
      stockQuantity: beforeIngredient.stockQuantity,
      stockQuantityBase: beforeIngredient.stockQuantityBase,
      costPerUnit: beforeIngredient.costPerUnit,
      averageCostPerBaseUnit: beforeIngredient.averageCostPerBaseUnit,
    })
    const afterOrder = await PurchaseOrder.findById(draft.body._id).lean()
    expect(afterOrder.status).toBe('ORDERED')
    expect(afterOrder.items[0].receivedQuantity).toBe(0)
    expect(await InventoryTransaction.countDocuments({ reasonCode: 'PURCHASE_RECEIPT' })).toBe(ledgerCount)
    expect(await PurchaseReceipt.countDocuments()).toBe(receiptCount)
  })

  test('concurrent final receipts commit the remaining quantity exactly once', async () => {
    const supplier = await request(app).post('/api/suppliers').send({ name: 'Concurrent PO supplier' })
    const ingredient = await request(app).post('/api/ingredients').send({ name: 'Concurrent PO stock', unit: 'kg', stockQuantity: 10, costPerUnit: 100 })
    const draft = await request(app).post('/api/purchase-orders').send({ supplierId: supplier.body._id, items: [{ ingredientId: ingredient.body._id, orderedQuantity: 10, expectedUnitCost: 150 }] })
    const ordered = await request(app).post(`/api/purchase-orders/${draft.body._id}/order`)
    const itemId = ordered.body.items[0]._id
    await request(app).post(`/api/purchase-orders/${draft.body._id}/receive`).send({ items: [{ purchaseOrderItemId: itemId, quantity: 6, unitCost: 160 }] })

    const responses = await Promise.all([1, 2].map(() => request(app).post(`/api/purchase-orders/${draft.body._id}/receive`).send({ items: [{ purchaseOrderItemId: itemId, quantity: 4, unitCost: 170 }] })))
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1)
    const conflict = responses.find((response) => response.status !== 200)
    expect(conflict.status).toBe(409)
    expect(conflict.body.error.code).toBe('RECEIPT_CONFLICT')

    const finalOrder = await PurchaseOrder.findById(draft.body._id).lean()
    expect(finalOrder.status).toBe('RECEIVED')
    expect(finalOrder.items[0].receivedQuantity).toBe(10)
    expect((await Ingredient.findById(ingredient.body._id)).stockQuantity).toBeCloseTo(20)
    expect(await PurchaseReceipt.countDocuments({ purchaseOrderId: draft.body._id })).toBe(2)
    expect(await InventoryTransaction.countDocuments({ referenceId: draft.body._id, reasonCode: 'PURCHASE_RECEIPT' })).toBe(2)
  })

  test('archived preferred suppliers are hidden from planning but unchanged references can remain or be cleared', async () => {
    const supplier = await request(app).post('/api/suppliers').send({ name: 'Archived planning supplier' })
    const ingredient = await request(app).post('/api/ingredients').send({ name: 'Archived supplier ingredient', unit: 'kg', stockQuantity: 1, costPerUnit: 10, reorderLevel: 2, parLevel: 5, preferredSupplierId: supplier.body._id })
    await request(app).delete(`/api/suppliers/${supplier.body._id}`)

    const planning = await request(app).get('/api/planning/inventory').query({ search: 'Archived supplier ingredient' })
    expect(planning.status).toBe(200)
    expect(planning.body.items[0].preferredSupplier).toBeNull()

    const unchanged = await request(app).put(`/api/ingredients/${ingredient.body._id}`).send({ name: 'Archived supplier ingredient updated', preferredSupplierId: supplier.body._id })
    expect(unchanged.status).toBe(200)
    expect(String(unchanged.body.preferredSupplierId)).toBe(supplier.body._id)

    const newlyAssignedIngredient = await request(app).post('/api/ingredients').send({ name: 'No supplier ingredient', unit: 'kg', stockQuantity: 0, costPerUnit: 1 })
    const rejected = await request(app).put(`/api/ingredients/${newlyAssignedIngredient.body._id}`).send({ preferredSupplierId: supplier.body._id })
    expect(rejected.status).toBe(400)

    const cleared = await request(app).put(`/api/ingredients/${ingredient.body._id}`).send({ preferredSupplierId: null })
    expect(cleared.status).toBe(200)
    expect(cleared.body.preferredSupplierId).toBeNull()
  })

  test('purchase order and receipt date-only filters include the full day and reject inverted ranges', async () => {
    const supplier = await request(app).post('/api/suppliers').send({ name: 'Date supplier' })
    const ingredient = await request(app).post('/api/ingredients').send({ name: 'Date ingredient', unit: 'pcs', stockQuantity: 1, costPerUnit: 2 })
    const draft = await request(app).post('/api/purchase-orders').send({ supplierId: supplier.body._id, items: [{ ingredientId: ingredient.body._id, orderedQuantity: 1, expectedUnitCost: 2 }] })
    const ordered = await request(app).post(`/api/purchase-orders/${draft.body._id}/order`)
    const received = await request(app).post(`/api/purchase-orders/${draft.body._id}/receive`).send({ items: [{ purchaseOrderItemId: ordered.body.items[0]._id, quantity: 1, unitCost: 2 }] })
    await PurchaseOrder.findByIdAndUpdate(draft.body._id, { createdAt: new Date('2026-08-14T23:30:00.000Z') }, { timestamps: false })
    await PurchaseReceipt.findByIdAndUpdate(received.body.purchaseReceipt._id, { receivedAt: new Date('2026-08-14T23:45:00.000Z') })

    const orders = await request(app).get('/api/purchase-orders').query({ dateFrom: '2026-08-14', dateTo: '2026-08-14' })
    expect(orders.status).toBe(200)
    expect(orders.body.items.map((item) => item._id)).toContain(draft.body._id)
    const receipts = await request(app).get('/api/purchase-receipts').query({ dateFrom: '2026-08-14', dateTo: '2026-08-14' })
    expect(receipts.status).toBe(200)
    expect(receipts.body.items.map((item) => item._id)).toContain(received.body.purchaseReceipt._id)
    const invertedOrders = await request(app).get('/api/purchase-orders').query({ dateFrom: '2026-08-15', dateTo: '2026-08-14' })
    const invertedReceipts = await request(app).get('/api/purchase-receipts').query({ dateFrom: '2026-08-15', dateTo: '2026-08-14' })
    expect(invertedOrders.status).toBe(400)
    expect(invertedReceipts.status).toBe(400)
  })

  test('purchase receipts can receive selected PO lines without touching skipped lines', async () => {
    const supplier = await request(app).post('/api/suppliers').send({ name: 'Selected lines supplier' })
    const chicken = await request(app).post('/api/ingredients').send({ name: 'Selected chicken', unit: 'kg', stockQuantity: 10, costPerUnit: 50 })
    const oil = await request(app).post('/api/ingredients').send({ name: 'Selected oil', unit: 'l', stockQuantity: 5, costPerUnit: 30 })
    const draft = await request(app).post('/api/purchase-orders').send({
      supplierId: supplier.body._id,
      items: [
        { ingredientId: chicken.body._id, orderedQuantity: 10, expectedUnitCost: 100 },
        { ingredientId: oil.body._id, orderedQuantity: 5, expectedUnitCost: 40 },
      ],
    })
    const ordered = await request(app).post(`/api/purchase-orders/${draft.body._id}/order`)
    const chickenLine = ordered.body.items.find((item) => item.ingredientId === chicken.body._id)
    const oilLine = ordered.body.items.find((item) => item.ingredientId === oil.body._id)

    const receipt = await request(app)
      .post(`/api/purchase-orders/${draft.body._id}/receive`)
      .send({ items: [{ purchaseOrderItemId: chickenLine._id, quantity: 4, unitCost: 100 }] })

    expect(receipt.status).toBe(200)
    expect(receipt.body.purchaseOrder.status).toBe('PARTIALLY_RECEIVED')
    expect(receipt.body.purchaseOrder.items.find((item) => item._id === chickenLine._id).receivedQuantity).toBe(4)
    expect(receipt.body.purchaseOrder.items.find((item) => item._id === oilLine._id).receivedQuantity).toBe(0)
    expect((await Ingredient.findById(chicken.body._id)).stockQuantity).toBeCloseTo(14)
    expect((await Ingredient.findById(oil.body._id)).stockQuantity).toBeCloseTo(5)
    expect(await InventoryTransaction.countDocuments({ operationId: receipt.body.operationId, reasonCode: 'PURCHASE_RECEIPT' })).toBe(1)
    expect(receipt.body.purchaseReceipt.items).toHaveLength(1)
    expect(String(receipt.body.purchaseReceipt.items[0].ingredientId)).toBe(chicken.body._id)
  })

  test('purchase receipt inputs require explicit numeric values while numeric zero cost remains valid', async () => {
    const supplier = await request(app).post('/api/suppliers').send({ name: 'Strict receipt supplier' })
    const ingredient = await request(app).post('/api/ingredients').send({ name: 'Strict receipt ingredient', unit: 'kg', stockQuantity: 2, costPerUnit: 10 })
    const draft = await request(app).post('/api/purchase-orders').send({ supplierId: supplier.body._id, items: [{ ingredientId: ingredient.body._id, orderedQuantity: 2, expectedUnitCost: 10 }] })
    const ordered = await request(app).post(`/api/purchase-orders/${draft.body._id}/order`)
    const lineId = ordered.body.items[0]._id
    const beforeStock = (await Ingredient.findById(ingredient.body._id)).stockQuantity

    const blankCost = await request(app).post(`/api/purchase-orders/${draft.body._id}/receive`).send({ items: [{ purchaseOrderItemId: lineId, quantity: 1, unitCost: '' }] })
    const stringQuantity = await request(app).post(`/api/purchase-orders/${draft.body._id}/receive`).send({ items: [{ purchaseOrderItemId: lineId, quantity: '1', unitCost: 0 }] })
    expect(blankCost.status).toBe(400)
    expect(stringQuantity.status).toBe(400)
    expect(blankCost.body.error.code).toBe('VALIDATION_ERROR')
    expect(stringQuantity.body.error.code).toBe('VALIDATION_ERROR')
    expect((await Ingredient.findById(ingredient.body._id)).stockQuantity).toBe(beforeStock)
    expect(await InventoryTransaction.countDocuments({ reasonCode: 'PURCHASE_RECEIPT' })).toBe(0)
    expect(await PurchaseReceipt.countDocuments()).toBe(0)
    expect((await PurchaseOrder.findById(draft.body._id)).items[0].receivedQuantity).toBe(0)

    const zeroCost = await request(app).post(`/api/purchase-orders/${draft.body._id}/receive`).send({ items: [{ purchaseOrderItemId: lineId, quantity: 1, unitCost: 0 }] })
    expect(zeroCost.status).toBe(200)
    expect(zeroCost.body.purchaseReceipt.items[0].unitCost).toBe(0)
  })

  test('Sales creation snapshots multi-menu-item economics without changing inventory', async () => {
    const fixture = await createSalesFixture()
    const beforeIngredients = await Ingredient.find({ _id: { $in: fixture.ingredientIds } }).sort({ name: 1 }).lean()
    const beforeTransactions = await InventoryTransaction.countDocuments()
    const beforeCookEvents = await CookEvent.countDocuments()

    const response = await request(app).post('/api/sales/records').send({
      businessDate: '2026-08-14',
      lines: [
        { recipeId: fixture.recipeIds[0], servingsSold: 20 },
        { recipeId: fixture.recipeIds[1], servingsSold: 30 },
      ],
    })

    expect(response.status).toBe(201)
    expect(response.body.record.lines).toEqual([
      expect.objectContaining({
        recipeNameSnapshot: 'Chicken Rice',
        yieldServingsSnapshot: 1,
        servingsSold: 20,
        sellingPricePerServingSnapshot: 180,
        costPerServingSnapshot: 45,
        estimatedRevenue: 3600,
        estimatedFoodCost: 900,
        estimatedGrossProfit: 2700,
        grossMarginPercentSnapshot: 75,
      }),
      expect.objectContaining({
        recipeNameSnapshot: 'Iced Tea',
        yieldServingsSnapshot: 1,
        servingsSold: 30,
        sellingPricePerServingSnapshot: 60,
        costPerServingSnapshot: 12,
        estimatedRevenue: 1800,
        estimatedFoodCost: 360,
        estimatedGrossProfit: 1440,
        grossMarginPercentSnapshot: 80,
      }),
    ])
    expect(response.body.record).toMatchObject({
      totalServings: 50,
      totalRevenue: 5400,
      totalEstimatedFoodCost: 1260,
      totalEstimatedGrossProfit: 4140,
    })
    expect(response.body.record.grossMarginPercent).toBeCloseTo(76.6667, 4)

    const afterIngredients = await Ingredient.find({ _id: { $in: fixture.ingredientIds } }).sort({ name: 1 }).lean()
    expect(afterIngredients.map(({ stockQuantity, stockQuantityBase }) => ({ stockQuantity, stockQuantityBase }))).toEqual(
      beforeIngredients.map(({ stockQuantity, stockQuantityBase }) => ({ stockQuantity, stockQuantityBase })),
    )
    expect(await InventoryTransaction.countDocuments()).toBe(beforeTransactions)
    expect(await CookEvent.countDocuments()).toBe(beforeCookEvents)
  })

  test('Sales create validation rejects coercion, invalid dates, duplicates, and unknown fields', async () => {
    const fixture = await createSalesFixture()
    const validLine = { recipeId: fixture.recipeIds[0], servingsSold: 1 }
    const invalidPayloads = [
      { businessDate: '2026-08-14', lines: [{ ...validLine, servingsSold: '' }] },
      { businessDate: '2026-08-14', lines: [{ ...validLine, servingsSold: '23' }] },
      { businessDate: '2026-08-14', lines: [{ ...validLine, servingsSold: 1.5 }] },
      { businessDate: '2026-08-14', lines: [{ ...validLine, servingsSold: 0 }] },
      { businessDate: '2026-08-14', lines: [validLine, validLine] },
      { businessDate: '2026-13-40', lines: [validLine] },
      { businessDate: '2026-08-14T00:00:00Z', lines: [validLine] },
      { businessDate: '2026-08-14', lines: [validLine], totalRevenue: 999 },
      { businessDate: '2026-08-14', lines: [{ ...validLine, menuPrice: 1 }] },
    ]

    for (const payload of invalidPayloads) {
      const response = await request(app).post('/api/sales/records').send(payload)
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    }
    expect(await SalesRecord.countDocuments()).toBe(0)
  })

  test('Sales detail remains an immutable historical name, price, cost, and margin snapshot', async () => {
    const fixture = await createSalesFixture()
    const created = await request(app).post('/api/sales/records').send({
      businessDate: '2026-08-14',
      lines: [{ recipeId: fixture.recipeIds[0], servingsSold: 20 }],
    })
    await Recipe.updateOne({ _id: fixture.recipeIds[0] }, { $set: { name: 'Renamed Rice', sellingPrice: 999 } })
    await Ingredient.updateOne({ _id: fixture.ingredientIds[0] }, { $set: { costPerUnit: 99, averageCostPerBaseUnit: 99 } })

    const detail = await request(app).get(`/api/sales/records/${created.body.record._id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.record.lines[0]).toMatchObject({
      recipeNameSnapshot: 'Chicken Rice',
      sellingPricePerServingSnapshot: 180,
      costPerServingSnapshot: 45,
      estimatedRevenue: 3600,
      estimatedFoodCost: 900,
      estimatedGrossProfit: 2700,
      grossMarginPercentSnapshot: 75,
    })
  })

  test('Sales rejects unavailable recipes and invalid costing without partial records', async () => {
    const fixture = await createSalesFixture()
    await Recipe.updateOne({ _id: fixture.recipeIds[0] }, { $set: { isActive: false } })
    const inactive = await request(app).post('/api/sales/records').send({
      businessDate: '2026-08-14',
      lines: [{ recipeId: fixture.recipeIds[0], servingsSold: 1 }],
    })
    expect(inactive.status).toBe(409)
    expect(inactive.body.error.code).toBe('SALES_RECIPE_UNAVAILABLE')

    await Recipe.updateOne({ _id: fixture.recipeIds[0] }, { $set: { isActive: true } })
    await Ingredient.updateOne({ _id: fixture.ingredientIds[0] }, { $set: { isActive: false } })
    const uncostable = await request(app).post('/api/sales/records').send({
      businessDate: '2026-08-14',
      lines: [{ recipeId: fixture.recipeIds[0], servingsSold: 1 }],
    })
    expect(uncostable.status).toBe(409)
    expect(uncostable.body.error.code).toBe('SALES_COSTING_UNAVAILABLE')
    expect(await SalesRecord.countDocuments()).toBe(0)
  })

  test('Sales cancellation preserves history and only allows ACTIVE to CANCELLED', async () => {
    const fixture = await createSalesFixture()
    const created = await request(app).post('/api/sales/records').send({
      businessDate: '2026-08-14',
      lines: [{ recipeId: fixture.recipeIds[0], servingsSold: 2 }],
    })
    const cancelled = await request(app).post(`/api/sales/records/${created.body.record._id}/cancel`).send({})
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.record.status).toBe('CANCELLED')
    expect(cancelled.body.record.cancelledAt).toEqual(expect.any(String))

    const repeated = await request(app).post(`/api/sales/records/${created.body.record._id}/cancel`).send({})
    expect(repeated.status).toBe(409)
    expect(repeated.body.error.code).toBe('INVALID_SALES_STATE')
    const detail = await request(app).get(`/api/sales/records/${created.body.record._id}`)
    expect(detail.body.record.lines[0].estimatedRevenue).toBe(360)
  })

  test('Sales summary aggregates snapshot money, derives weighted margin, and excludes cancelled records', async () => {
    const fixture = await createSalesFixture()
    await request(app).post('/api/sales/records').send({
      businessDate: '2026-08-14',
      lines: [
        { recipeId: fixture.recipeIds[0], servingsSold: 20 },
        { recipeId: fixture.recipeIds[1], servingsSold: 30 },
      ],
    })
    const cancelledRecord = await request(app).post('/api/sales/records').send({
      businessDate: '2026-08-14',
      lines: [{ recipeId: fixture.recipeIds[0], servingsSold: 100 }],
    })
    await request(app).post(`/api/sales/records/${cancelledRecord.body.record._id}/cancel`).send({})

    const response = await request(app).get('/api/sales/summary?dateFrom=2026-08-14&dateTo=2026-08-14')
    expect(response.status).toBe(200)
    expect(response.body.summary).toMatchObject({
      totalServings: 50,
      totalRevenue: 5400,
      totalEstimatedFoodCost: 1260,
      totalEstimatedGrossProfit: 4140,
    })
    expect(response.body.summary.grossMarginPercent).toBeCloseTo(4140 / 5400 * 100)
    expect(response.body.items).toHaveLength(2)
    expect(response.body.items[0]).toMatchObject({ recipeName: 'Chicken Rice', servingsSold: 20, estimatedRevenue: 3600 })
  })

  test('Sales list and summary use inclusive business-date ranges and reject invalid ranges', async () => {
    const fixture = await createSalesFixture()
    for (const businessDate of ['2026-08-13', '2026-08-14', '2026-08-15']) {
      await request(app).post('/api/sales/records').send({
        businessDate,
        lines: [{ recipeId: fixture.recipeIds[0], servingsSold: 1 }],
      })
    }
    const list = await request(app).get('/api/sales/records?dateFrom=2026-08-14&dateTo=2026-08-15&limit=1&page=1')
    expect(list.status).toBe(200)
    expect(list.body.pagination.total).toBe(2)
    expect(list.body.items[0].businessDate).toBe('2026-08-15')
    const summary = await request(app).get('/api/sales/summary?dateFrom=2026-08-14&dateTo=2026-08-15')
    expect(summary.body.summary.totalServings).toBe(2)

    for (const path of [
      '/api/sales/records?dateFrom=2026-08-16&dateTo=2026-08-15',
      '/api/sales/records?dateFrom=08/14/2026',
      '/api/sales/summary?dateFrom=2026-08-16&dateTo=2026-08-15',
    ]) {
      const invalid = await request(app).get(path)
      expect(invalid.status).toBe(400)
      expect(invalid.body.error.code).toBe('VALIDATION_ERROR')
    }
  })

  test('Prep Plan recommendations sum multiple records while counting each recorded business date once', async () => {
    const fixture = await createPrepFixture()
    await createPrepSalesRecord({
      businessDate: '2026-08-11',
      lines: [{ recipeId: fixture.bowlId, servings: 4 }],
    })
    await createPrepSalesRecord({
      businessDate: '2026-08-11',
      lines: [
        { recipeId: fixture.bowlId, servings: 6 },
        { recipeId: fixture.soupId, servings: 4 },
      ],
    })
    for (const businessDate of ['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-16']) {
      await createPrepSalesRecord({
        businessDate,
        lines: [
          { recipeId: fixture.bowlId, servings: 10 },
          { recipeId: fixture.soupId, servings: 4 },
        ],
      })
    }

    const response = await request(app).get('/api/planning/prep?asOf=2026-08-17&lookbackDays=14')
    expect(response.status).toBe(200)
    expect(response.body.meta).toMatchObject({
      historyDateFrom: '2026-08-03',
      historyDateTo: '2026-08-16',
      recordedDayCount: 5,
      dataSufficient: true,
    })
    expect(response.body.recommendations).toEqual([
      expect.objectContaining({
        recipeName: 'Rice Bowl',
        recentServingsSold: 50,
        averageDailySales: 10,
        suggestedServings: 10,
      }),
      expect.objectContaining({
        recipeName: 'Rice Soup',
        recentServingsSold: 20,
        averageDailySales: 4,
        suggestedServings: 4,
      }),
    ])
  })

  test('Prep Plan history excludes missing, cancelled, as-of, and future business dates', async () => {
    const fixture = await createPrepFixture()
    for (const businessDate of ['2026-08-03', '2026-08-10', '2026-08-16']) {
      await createPrepSalesRecord({
        businessDate,
        lines: [{ recipeId: fixture.bowlId, servings: 3 }],
      })
    }
    await createPrepSalesRecord({
      businessDate: '2026-08-12',
      status: 'CANCELLED',
      lines: [{ recipeId: fixture.bowlId, servings: 100 }],
    })
    await createPrepSalesRecord({
      businessDate: '2026-08-17',
      lines: [{ recipeId: fixture.bowlId, servings: 100 }],
    })
    await createPrepSalesRecord({
      businessDate: '2026-08-18',
      lines: [{ recipeId: fixture.bowlId, servings: 100 }],
    })

    const response = await request(app).get('/api/planning/prep?asOf=2026-08-17&lookbackDays=14')
    const bowl = response.body.recommendations.find((item) => item.recipeId === fixture.bowlId)
    expect(response.body.meta.recordedDayCount).toBe(3)
    expect(bowl).toMatchObject({ recentServingsSold: 9, averageDailySales: 3, suggestedServings: 3 })
  })

  test('Prep Plan returns all active recipes with zero suggestions when no sales days are recorded', async () => {
    await createPrepFixture()
    const response = await request(app).get('/api/planning/prep?asOf=2026-08-17&lookbackDays=14')
    expect(response.status).toBe(200)
    expect(response.body.meta).toMatchObject({ recordedDayCount: 0, dataSufficient: false })
    expect(response.body.recommendations).toHaveLength(2)
    expect(response.body.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recentServingsSold: 0, averageDailySales: 0, suggestedServings: 0 }),
      ]),
    )
    expect(response.body.preview).toEqual({
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
  })

  test('Prep Plan aggregates shared canonical Ingredient needs before checking stock', async () => {
    const fixture = await createPrepFixture()
    await seedPrepAcceptanceSales(fixture)
    const response = await request(app).get('/api/planning/prep?asOf=2026-08-17&lookbackDays=14')
    expect(response.status).toBe(200)
    expect(response.body.preview.summary).toMatchObject({
      recipeCount: 2,
      totalPlannedServings: 14,
      ingredientCount: 1,
      shortageIngredientCount: 1,
      canPrepare: false,
    })
    expect(response.body.preview.ingredients).toEqual([
      expect.objectContaining({
        ingredientName: 'Prep rice',
        unit: 'kg',
        baseUnit: 'g',
        requiredQuantity: 2,
        requiredQuantityBase: 2000,
        availableQuantity: 1.5,
        availableQuantityBase: 1500,
        shortfall: 0.5,
        shortfallBase: 500,
        canSatisfy: false,
      }),
    ])
  })

  test('Prep Plan GET and preview remain read-only across inventory and purchasing collections', async () => {
    const fixture = await createPrepFixture()
    await seedPrepAcceptanceSales(fixture)
    const beforeIngredient = await Ingredient.findById(fixture.ingredientId).lean()
    const beforeCounts = {
      transactions: await InventoryTransaction.countDocuments(),
      cooks: await CookEvent.countDocuments(),
      orders: await PurchaseOrder.countDocuments(),
    }

    expect((await request(app).get('/api/planning/prep?asOf=2026-08-17&lookbackDays=14')).status).toBe(200)
    expect(
      (
        await request(app).post('/api/planning/prep/preview').send({
          lines: [
            { recipeId: fixture.bowlId, servings: 10 },
            { recipeId: fixture.soupId, servings: 4 },
          ],
        })
      ).status,
    ).toBe(200)

    const afterIngredient = await Ingredient.findById(fixture.ingredientId).lean()
    expect(afterIngredient.stockQuantity).toBe(beforeIngredient.stockQuantity)
    expect(afterIngredient.stockQuantityBase).toBe(beforeIngredient.stockQuantityBase)
    expect(await InventoryTransaction.countDocuments()).toBe(beforeCounts.transactions)
    expect(await CookEvent.countDocuments()).toBe(beforeCounts.cooks)
    expect(await PurchaseOrder.countDocuments()).toBe(beforeCounts.orders)
  })

  test('Prep Plan preview strictly rejects coercion, duplicates, invalid ids, and unknown fields', async () => {
    const fixture = await createPrepFixture()
    const validLine = { recipeId: fixture.bowlId, servings: 10 }
    const payloads = [
      { lines: [{ ...validLine, servings: '10' }] },
      { lines: [{ ...validLine, servings: 1.5 }] },
      { lines: [{ ...validLine, servings: 0 }] },
      { lines: [validLine, validLine] },
      { lines: [{ recipeId: 'not-an-id', servings: 10 }] },
      { lines: [{ ...validLine, unit: 'kg' }] },
      { lines: [validLine], totalServings: 10 },
    ]
    for (const payload of payloads) {
      const response = await request(app).post('/api/planning/prep/preview').send(payload)
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    }
    for (const path of [
      '/api/planning/prep?asOf=2026-13-40&lookbackDays=14',
      '/api/planning/prep?asOf=2026-08-17&lookbackDays=10',
      '/api/planning/prep?asOf=2026-08-17&lookbackDays=14&extra=true',
    ]) {
      const response = await request(app).get(path)
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    }
  })

  test('Prep Plan reports unavailable Recipes and configuration errors without partial previews', async () => {
    const fixture = await createPrepFixture()
    await Recipe.updateOne({ _id: fixture.bowlId }, { $set: { isActive: false } })
    const inactive = await request(app).post('/api/planning/prep/preview').send({
      lines: [{ recipeId: fixture.bowlId, servings: 10 }],
    })
    expect(inactive.status).toBe(409)
    expect(inactive.body.error.code).toBe('PREP_RECIPE_UNAVAILABLE')

    const missing = await request(app).post('/api/planning/prep/preview').send({
      lines: [{ recipeId: new mongoose.Types.ObjectId().toString(), servings: 10 }],
    })
    expect(missing.status).toBe(409)
    expect(missing.body.error.code).toBe('PREP_RECIPE_UNAVAILABLE')

    await Recipe.updateOne({ _id: fixture.bowlId }, { $set: { isActive: true } })
    await Ingredient.updateOne({ _id: fixture.ingredientId }, { $set: { isActive: false } })
    const invalid = await request(app).post('/api/planning/prep/preview').send({
      lines: [{ recipeId: fixture.bowlId, servings: 10 }],
    })
    expect(invalid.status).toBe(409)
    expect(invalid.body.error.code).toBe('PREP_CONFIGURATION_UNAVAILABLE')
  })

  test('Prep Plan ready preview sums current ingredient cost and returns an active preferred supplier', async () => {
    const fixture = await createPrepFixture({ stockQuantity: 3 })
    const supplier = await Supplier.create({ name: 'Prep Foods' })
    await Ingredient.updateOne(
      { _id: fixture.ingredientId },
      { $set: { preferredSupplierId: supplier._id } },
    )
    const response = await request(app).post('/api/planning/prep/preview').send({
      lines: [
        { recipeId: fixture.bowlId, servings: 10 },
        { recipeId: fixture.soupId, servings: 4 },
      ],
    })
    expect(response.status).toBe(200)
    expect(response.body.preview.summary).toMatchObject({
      totalPlannedServings: 14,
      shortageIngredientCount: 0,
      estimatedIngredientCost: 120,
      canPrepare: true,
    })
    expect(response.body.preview.ingredients[0]).toMatchObject({
      requiredQuantity: 2,
      availableQuantity: 3,
      shortfall: 0,
      canSatisfy: true,
      preferredSupplier: { id: String(supplier._id), name: 'Prep Foods' },
    })
  })
})
