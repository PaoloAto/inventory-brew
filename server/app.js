const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')

const ingredientRoutes = require('./routes/ingredients')
const recipeRoutes = require('./routes/recipes')
const transactionRoutes = require('./routes/transactions')
const dashboardRoutes = require('./routes/dashboard')
const productionRoutes = require('./routes/production')
const wasteRoutes = require('./routes/waste')
const planningRoutes = require('./routes/planning')
const supplierRoutes = require('./routes/suppliers')
const purchaseOrderRoutes = require('./routes/purchaseOrders')
const purchaseReceiptRoutes = require('./routes/purchaseReceipts')
const stocktakeRoutes = require('./routes/stocktakes')
const Ingredient = require('./models/Ingredient')
const Recipe = require('./models/Recipe')

const app = express()

const parseCorsOrigins = () => {
  const raw = process.env.CORS_ORIGIN || ''
  const parsed = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (parsed.length > 0) return parsed

  return ['http://localhost:5173', 'http://127.0.0.1:5173']
}

const allowedCorsOrigins = parseCorsOrigins()

app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (allowedCorsOrigins.includes(origin)) return callback(null, true)
      return callback(new Error(`Origin not allowed by CORS: ${origin}`))
    },
  }),
)

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Inventory Brew API',
    uptimeSeconds: Number(process.uptime().toFixed(2)),
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/ready', async (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1

  if (!dbConnected) {
    return res.status(503).json({
      status: 'not_ready',
      service: 'Inventory Brew API',
      dbConnected,
      transactionsSupported: false,
      canonicalDataReady: false,
    })
  }

  let transactionsSupported = false
  let canonicalDataReady = false
  try {
    const [hello, incompleteIngredient, incompleteRecipe] = await Promise.all([
      mongoose.connection.db.admin().command({ hello: 1 }),
      Ingredient.exists({
        isActive: true,
        $or: [
          { baseUnit: { $in: [null, ''] } },
          { baseUnit: { $nin: ['pcs', 'g', 'ml'] } },
          { stockQuantityBase: { $in: [null] } },
          { reorderLevelBase: { $in: [null] } },
          { averageCostPerBaseUnit: { $in: [null] } },
          { baseUnit: { $exists: false } },
          { stockQuantityBase: { $exists: false } },
          { reorderLevelBase: { $exists: false } },
          { averageCostPerBaseUnit: { $exists: false } },
        ],
      }),
      Recipe.exists({
        $or: [
          { yieldServings: { $in: [null] } },
          { yieldServings: { $exists: false } },
          { yieldServings: { $lt: 1 } },
          {
            ingredients: {
              $elemMatch: {
                $or: [
                  { quantityBase: { $in: [null] } },
                  { baseUnit: { $in: [null, ''] } },
                  { baseUnit: { $nin: ['pcs', 'g', 'ml'] } },
                  { quantityBase: { $exists: false } },
                  { baseUnit: { $exists: false } },
                ],
              },
            },
          },
        ],
      }),
    ])
    transactionsSupported = Boolean(hello.setName || hello.msg === 'isdbgrid')
    canonicalDataReady = !incompleteIngredient && !incompleteRecipe
  } catch (err) {
    console.error('Error checking MongoDB transaction capability:', err)
  }

  if (!transactionsSupported) {
    return res.status(503).json({
      status: 'not_ready',
      service: 'Inventory Brew API',
      dbConnected,
      transactionsSupported,
      canonicalDataReady,
    })
  }

  if (!canonicalDataReady) {
    return res.status(503).json({
      status: 'not_ready',
      service: 'Inventory Brew API',
      dbConnected,
      transactionsSupported,
      canonicalDataReady,
    })
  }

  return res.json({
    status: 'ready',
    service: 'Inventory Brew API',
    dbConnected,
    transactionsSupported,
    canonicalDataReady,
  })
})

app.use('/api/ingredients', ingredientRoutes)
app.use('/api/recipes', recipeRoutes)
app.use('/api/transactions', transactionRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/production', productionRoutes)
app.use('/api/waste', wasteRoutes)
app.use('/api/planning', planningRoutes)
app.use('/api/suppliers', supplierRoutes)
app.use('/api/purchase-orders', purchaseOrderRoutes)
app.use('/api/purchase-receipts', purchaseReceiptRoutes)
app.use('/api/stocktakes', stocktakeRoutes)

app.use('/api', (_req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'API route not found',
    },
  })
})

app.use((err, _req, res, _next) => {
  const isCorsError =
    typeof err?.message === 'string' && err.message.toLowerCase().includes('origin not allowed by cors')

  if (isCorsError) {
    return res.status(403).json({
      error: {
        code: 'CORS_FORBIDDEN',
        message: err.message,
      },
    })
  }

  console.error('Unhandled app error:', err)
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected server error',
    },
  })
})

module.exports = app
