const request = require('supertest')
const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')
const app = require('../app')
const Ingredient = require('../models/Ingredient')
const InventoryTransaction = require('../models/InventoryTransaction')
const Recipe = require('../models/Recipe')

jest.setTimeout(120000)

describe('Inventory Brew API integration', () => {
  let mongoServer

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
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

  test('POST /api/ingredients creates initial IN transaction when stock > 0', async () => {
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
  })

  test('POST /api/ingredients/:id/adjust-stock blocks negative stock', async () => {
    const createResponse = await request(app).post('/api/ingredients').send({
      name: 'Olive Oil',
      unit: 'ml',
      stockQuantity: 20,
      costPerUnit: 0.03,
      reorderLevel: 5,
    })

    const adjustResponse = await request(app)
      .post(`/api/ingredients/${createResponse.body._id}/adjust-stock`)
      .send({
        type: 'OUT',
        quantity: 999,
        reason: 'Over-consume test',
      })

    expect(adjustResponse.status).toBe(400)
    expect(adjustResponse.body.error.code).toBe('INSUFFICIENT_STOCK')
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
    expect(['fallback', 'transaction']).toContain(cookResponse.body.executionMode)
    expect(cookResponse.body.transactionsCreated).toBe(2)

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
  })
})
