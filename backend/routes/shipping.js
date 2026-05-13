const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Shipping = require('../models/Shipping');
const adminAuth = require('../middleware/adminAuth');

// GET /api/shipping — return all governorates (minimal data)
router.get('/', async (req, res) => {
  try {
    const fees = await Shipping.find({}, 'city cityOtherName fee');
    res.json(fees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/shipping/zones/:cityId — return zones for a gov
router.get('/zones/:cityId', async (req, res) => {
  try {
    const { cityId } = req.params;
    let gov;
    
    // Support both ID and Name lookup for robustness
    if (mongoose.Types.ObjectId.isValid(cityId)) {
      gov = await Shipping.findById(cityId, 'zones');
    } else {
      gov = await Shipping.findOne({ $or: [{ city: cityId }, { cityOtherName: cityId }] }, 'zones');
    }

    if (!gov) return res.status(404).json({ error: 'Governorate not found' });
    res.json(gov.zones || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get raw DB objects
router.get('/list', adminAuth, async (req, res) => {
  try {
    const fees = await Shipping.find().sort({ city: 1 });
    res.json(fees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Update fee and zones
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { fee, zones } = req.body;
    const updateData = {};
    if (fee !== undefined) updateData.fee = fee;
    if (zones !== undefined) updateData.zones = zones;

    const shipping = await Shipping.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(shipping);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: Add new city
router.post('/', adminAuth, async (req, res) => {
  try {
    const shipping = new Shipping(req.body);
    await shipping.save();
    res.json(shipping);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: Delete city
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await Shipping.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Bulk update all to a single fee
router.post('/bulk-update', adminAuth, async (req, res) => {
  try {
    const { fee } = req.body;
    if (fee == null || isNaN(fee)) return res.status(400).json({ error: 'Valid fee is required' });

    await Shipping.updateMany({}, { $set: { fee } });
    res.json({ success: true, message: 'All shipping fees updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
