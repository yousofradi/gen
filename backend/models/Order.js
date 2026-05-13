const mongoose = require('mongoose');


const selectedOptionSchema = new mongoose.Schema({
  groupName: { type: String, required: true },
  label: { type: String, required: true },
  price: { type: Number, required: true, default: 0 }
}, { _id: false });

const orderItemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  name: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  basePrice: { type: Number, required: true },
  selectedOptions: { type: [selectedOptionSchema], default: [] },
  finalPrice: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  discount: { type: Number, default: 0 }  // per-item discount in EGP
}, { _id: false });

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  secondPhone: { type: String, default: '', trim: true },
  address: { type: String, required: true, trim: true },
  government: { type: String, required: true, trim: true },
  zone: { type: String, trim: true },
  notes: { type: String, default: '', trim: true }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, index: true },
  customer: { type: customerSchema, required: true },
  items: {
    type: [orderItemSchema],
    required: true,
    validate: v => v.length > 0
  },
  discount: { type: Number, default: 0 },    // total order discount in EGP
  totalPrice: { type: Number, required: true, min: 0 },
  shippingFee: { type: Number, required: true, min: 0 },
  paymentMethod: {
    type: String,
    required: true
  },
  paid: { type: Boolean, default: false },
  paidAmount: { type: Number, default: 0, min: 0 },
  archived: { type: Boolean, default: false },
  status: { type: String, enum: ['pending', 'cancelled', 'ready'], default: 'pending' }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
