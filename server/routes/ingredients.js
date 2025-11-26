const express = require('express')
const Ingredient = require('../models/Ingredient')

const router = express.Router()

// GET /api/ingredients - list all ingredients
router.get('/', async (_req, res) => {
  try {
    const ingredients = await Ingredient.find().sort({ name: 1 })
    res.json(ingredients)
  } catch (err) {
    console.error('Error fetching ingredients:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// GET /api/ingredients/:id - get one ingredient
router.get('/:id', async (req, res) => {
  try {
    const ingredient = await Ingredient.findById(req.params.id)
    if (!ingredient) {
      return res.status(404).json({ message: 'Ingredient not found' })
    }
    res.json(ingredient)
  } catch (err) {
    console.error('Error fetching ingredient:', err)
    res.status(400).json({ message: 'Invalid id', error: err.message })
  }
})

// POST /api/ingredients - create
router.post('/', async (req, res) => {
  try {
    const ingredient = new Ingredient(req.body)
    const saved = await ingredient.save()
    res.status(201).json(saved)
  } catch (err) {
    console.error('Error creating ingredient:', err)
    res.status(400).json({ message: 'Invalid data', error: err.message })
  }
})

// PUT /api/ingredients/:id - update
router.put('/:id', async (req, res) => {
  try {
    const updated = await Ingredient.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
    if (!updated) {
      return res.status(404).json({ message: 'Ingredient not found' })
    }
    res.json(updated)
  } catch (err) {
    console.error('Error updating ingredient:', err)
    res.status(400).json({ message: 'Invalid data', error: err.message })
  }
})

// DELETE /api/ingredients/:id - hard delete for now
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Ingredient.findByIdAndDelete(req.params.id)
    if (!deleted) {
      return res.status(404).json({ message: 'Ingredient not found' })
    }
    res.json({ message: 'Ingredient deleted', ingredient: deleted })
  } catch (err) {
    console.error('Error deleting ingredient:', err)
    res.status(400).json({ message: 'Invalid id', error: err.message })
  }
})

module.exports = router
