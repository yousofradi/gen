const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  subscription: {
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    }
  },
  adminId: { type: String, default: 'primary_admin' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
