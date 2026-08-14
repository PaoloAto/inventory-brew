const mongoose = require('mongoose')

const purchaseOrderItemSchema = new mongoose.Schema(
  {
    ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
    ingredientNameSnapshot: { type: String, required: true },
    unit: { type: String, required: true, enum: ['pcs', 'g', 'kg', 'ml', 'l'] },
    orderedQuantity: { type: Number, required: true, min: 0 },
    receivedQuantity: { type: Number, required: true, default: 0, min: 0 },
    expectedUnitCost: { type: Number, required: true, min: 0 },
  },
  { _id: true },
)

const purchaseOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    supplierNameSnapshot: { type: String, required: true },
    status: { type: String, enum: ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'], required: true, default: 'DRAFT', index: true },
    notes: { type: String, trim: true, default: '' },
    orderedAt: Date,
    expectedAt: Date,
    closedAt: Date,
    cancelledAt: Date,
    items: { type: [purchaseOrderItemSchema], required: true, validate: [(items) => items.length > 0, 'At least one item is required'] },
  },
  { timestamps: true },
)

purchaseOrderSchema.index({ createdAt: -1 })
purchaseOrderSchema.index({ supplierId: 1, createdAt: -1 })

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema)
