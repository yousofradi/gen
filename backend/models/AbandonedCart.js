const mongoose = require('mongoose');

const selectedOptionSchema = new mongoose.Schema({
  groupName: { type: String, required: true },
  label: { type: String, required: true }
});

const abandonedCartItemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  key: { type: String, required: true },
  name: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  unitPrice: { type: Number, required: true },
  basePrice: { type: Number, required: true },
  salePrice: { type: Number, default: null },
  quantity: { type: Number, required: true, default: 1 },
  selectedOptions: { type: [selectedOptionSchema], default: [] }
});

const customerSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  phone: { type: String, default: '' },
  secondPhone: { type: String, default: '' },
  address: { type: String, default: '' },
  government: { type: String, default: '' },
  zone: { type: String, default: '' },
  notes: { type: String, default: '' }
});

const abandonedCartSchema = new mongoose.Schema({
  checkoutToken: { type: String, required: true, unique: true },
  customer: { type: customerSchema, default: () => ({}) },
  items: { type: [abandonedCartItemSchema], default: [] }
}, {
  timestamps: true // Automatically handles createdAt and updatedAt
});

abandonedCartSchema.index({ checkoutToken: 1 });
abandonedCartSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('AbandonedCart', abandonedCartSchema);
