const mongoose = require('mongoose');

const optionValueSchema = new mongoose.Schema({
  label: { type: String, required: true },
  price: { type: Number, required: true, default: 0 },
  salePrice: { type: Number, default: null }
}, { _id: false });

const optionGroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  required: { type: Boolean, default: false },
  values: { type: [optionValueSchema], required: true, validate: v => v.length > 0 }
}, { _id: false });

const variantSchema = new mongoose.Schema({
  combination: { type: Map, of: String }, // e.g. { "اللون": "اسود", "الطول": "قصير" }
  price: { type: Number, default: 0 },
  salePrice: { type: Number, default: null },
  cost: { type: Number, default: null },
  quantity: { type: Number, default: null },
  imageUrl: { type: String, default: '' },
  active: { type: Boolean, default: true }
}, { _id: false });


const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  handle: { type: String, default: '' },
  basePrice: { type: Number, required: true, min: 0 },
  salePrice: { type: Number, default: null },
  imageUrl: { type: String, default: '' },
  images: { type: [String], default: [] },
  description: { type: String, default: '' },
  collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection', default: null },
  collectionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collection' }],
  options: { type: [optionGroupSchema], default: [] },
  variants: { type: [variantSchema], default: [] },
  sortOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  status: { type: String, enum: ['active', 'draft'], default: 'active' },
  quantity: { type: Number, default: null }
}, { timestamps: true });


productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ active: 1, status: 1 });
productSchema.index({ collectionId: 1 });
productSchema.index({ collectionIds: 1 });
productSchema.index({ handle: 1 });
productSchema.index({ sortOrder: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
