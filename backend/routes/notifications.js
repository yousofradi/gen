const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const { publicKey, privateKey } = require('../config/notifications');
const adminAuth = require('../middleware/adminAuth');

webpush.setVapidDetails(
  'mailto:support@sundura.com',
  publicKey,
  privateKey
);

// Register a new subscription
router.post('/subscribe', adminAuth, async (req, res) => {
  try {
    const subscription = req.body;
    await PushSubscription.findOneAndUpdate(
      { 'subscription.endpoint': subscription.endpoint },
      { subscription, createdAt: new Date() },
      { upsert: true }
    );
    res.status(201).json({ message: 'Subscribed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test notification
router.post('/test', adminAuth, async (req, res) => {
  try {
    const subscriptions = await PushSubscription.find();
    const payload = JSON.stringify({
      title: 'Sundura Admin',
      body: 'Notifications are working! 🚀',
      icon: '/admin/logo.png'
    });

    const results = await Promise.all(
      subscriptions.map(sub => 
        webpush.sendNotification(sub.subscription, payload)
          .catch(err => {
            if (err.statusCode === 410) return PushSubscription.deleteOne({ _id: sub._id });
            throw err;
          })
      )
    );
    res.json({ success: true, count: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
