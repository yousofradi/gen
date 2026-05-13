const mongoose = require('mongoose');

const shippingSchema = new mongoose.Schema({
  city: { type: String, required: true, unique: true },
  cityOtherName: { type: String },
  bostaCityId: { type: String },
  fee: { type: Number, required: true, default: 0 },
  zones: [{
    name: { type: String },
    otherName: { type: String },
    bostaZoneId: { type: String }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Shipping', shippingSchema);
