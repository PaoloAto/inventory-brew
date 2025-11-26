require('dotenv').config()
const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')

const ingredientRoutes = require('./routes/ingredients')

const app = express()

app.use(express.json())
app.use(cors())

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/inventory-brew'

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err.message))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Inventory Brew API' })
})

app.use('/api/ingredients', ingredientRoutes)

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})
