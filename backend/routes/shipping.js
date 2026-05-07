const express = require('express');
const router = express.Router();
const Shipping = require('../models/Shipping');
const adminAuth = require('../middleware/adminAuth');
const defaultShippingFees = require('../config/shipping');

// GET /api/shipping — return all shipping fees (or seed if empty)
router.get('/', async (req, res) => {
  try {
    let fees = await Shipping.find();
    if (fees.length === 0) {
      // Seed default
      const seedData = Object.entries(defaultShippingFees).map(([gov, fee]) => ({ governorate: gov, fee }));
      await Shipping.insertMany(seedData);
      fees = await Shipping.find();
    }
    
    // Return map format for frontend compatibility
    const map = {};
    fees.forEach(f => { map[f.governorate] = f.fee; });
    res.json(map);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get raw DB objects
router.get('/list', adminAuth, async (req, res) => {
  try {
    const fees = await Shipping.find().sort({ governorate: 1 });
    res.json(fees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Update fee
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const shipping = await Shipping.findByIdAndUpdate(req.params.id, { fee: req.body.fee }, { new: true });
    res.json(shipping);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: Add new governorate
router.post('/', adminAuth, async (req, res) => {
  try {
    const shipping = new Shipping(req.body);
    await shipping.save();
    res.json(shipping);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: Bulk update all to a single fee
router.post('/bulk-update', adminAuth, async (req, res) => {
  try {
    const { fee } = req.body;
    if (fee == null || isNaN(fee)) return res.status(400).json({ error: 'Valid fee is required' });

    const existingCount = await Shipping.countDocuments();
    if (existingCount === 0) {
      // Seed default with new fee
      const seedData = Object.entries(defaultShippingFees).map(([gov, _]) => ({ governorate: gov, fee }));
      await Shipping.insertMany(seedData);
    } else {
      // Update all existing
      await Shipping.updateMany({}, { $set: { fee } });
    }

    res.json({ success: true, message: 'All shipping fees updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
