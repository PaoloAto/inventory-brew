const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')

const ingredientRoutes = require('./routes/ingredients')
const recipeRoutes = require('./routes/recipes')
const transactionRoutes = require('./routes/transactions')
const dashboardRoutes = require('./routes/dashboard')

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

app.get('/api/ready', (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1

  if (!dbConnected) {
    return res.status(503).json({
      status: 'not_ready',
      service: 'Inventory Brew API',
      dbConnected,
    })
  }

  return res.json({
    status: 'ready',
    service: 'Inventory Brew API',
    dbConnected,
  })
})

app.use('/api/ingredients', ingredientRoutes)
app.use('/api/recipes', recipeRoutes)
app.use('/api/transactions', transactionRoutes)
app.use('/api/dashboard', dashboardRoutes)

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
