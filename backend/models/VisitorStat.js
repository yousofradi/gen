const mongoose = require('mongoose');

const visitorStatSchema = new mongoose.Schema({
  month: { type: String, required: true, unique: true }, // e.g. "2026-07"
  count: { type: Number, default: 0 }
});

module.exports = mongoose.model('VisitorStat', visitorStatSchema);
