const mongoose = require('mongoose');

const shippingSchema = new mongoose.Schema({
  city: { type: String, required: true, unique: true },
  fee: { type: Number, required: true, default: 0 },
  zones: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Shipping', shippingSchema);
