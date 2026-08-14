const mongoose = require('mongoose')

const receiptItemSchema = new mongoose.Schema(
  {
    purchaseOrderItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
    ingredientNameSnapshot: { type: String, required: true },
    unit: { type: String, required: true, enum: ['pcs', 'g', 'kg', 'ml', 'l'] },
    quantity: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const purchaseReceiptSchema = new mongoose.Schema(
  {
    purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true, index: true },
    orderNumberSnapshot: { type: String, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    supplierNameSnapshot: { type: String, required: true },
    operationId: { type: String, required: true, unique: true, index: true },
    receivedAt: { type: Date, required: true },
    items: { type: [receiptItemSchema], required: true },
    totalValue: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
)

purchaseReceiptSchema.index({ receivedAt: -1 })

module.exports = mongoose.model('PurchaseReceipt', purchaseReceiptSchema)
