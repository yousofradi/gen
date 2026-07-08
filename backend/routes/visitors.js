const express = require('express');
const router = express.Router();
const VisitorStat = require('../models/VisitorStat');
const adminAuth = require('../middleware/adminAuth');

// Public route to track a visitor
router.post('/track', async (req, res) => {
  try {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Upsert the visitor count for the current month
    await VisitorStat.findOneAndUpdate(
      { month },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error tracking visitor:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin route to get all visitor stats
router.get('/', adminAuth, async (req, res) => {
  try {
    const stats = await VisitorStat.find({}).sort({ month: -1 });
    res.json(stats);
  } catch (err) {
    console.error('Error fetching visitor stats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
