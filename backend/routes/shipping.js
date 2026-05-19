const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Shipping = require('../models/Shipping');
const adminAuth = require('../middleware/adminAuth');

const redis = require('../utils/redis');
const SHIPPING_CACHE_KEY = 'storefront:shipping:list';

async function refreshShippingCache() {
  try {
    const fees = await Shipping.find({}, 'city cityOtherName fee zones');
    
    // Resolve active fees dynamically from shipping_options setting
    const Setting = require('../models/Setting');
    const shippingOptionsRecord = await Setting.findOne({ key: 'shipping_options' });
    const shippingOptions = shippingOptionsRecord ? shippingOptionsRecord.value : [];
    const bostaOption = shippingOptions.find(o => 
      o.name.includes('بوسطة') || o.name.toLowerCase().includes('bosta')
    ) || shippingOptions[0];

    const isCityEqual = (a, b) => {
      if (!a || !b) return false;
      const norm = (s) => s.replace(/[أإآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase().trim();
      return norm(a) === norm(b);
    };

    const finalFees = fees.map(record => {
      const cityObj = bostaOption ? (bostaOption.cities || []).find(c => 
        isCityEqual(c.city, record.city) || isCityEqual(c.city, record.cityOtherName)
      ) : null;
      
      const resolvedFee = cityObj ? Number(cityObj.fee) : record.fee;
      
      return {
        _id: record._id,
        city: record.city,
        cityOtherName: record.cityOtherName,
        fee: isNaN(resolvedFee) ? record.fee : resolvedFee,
        zones: record.zones || []
      };
    });

    await redis.set(SHIPPING_CACHE_KEY, JSON.stringify(finalFees));

    // Also clear all cached zones to keep them in sync
    try {
      const keys = await redis.keys('storefront:shipping:zones:*');
      if (keys && keys.length > 0) {
        await redis.del(keys);
      }
    } catch (redisErr) {
      console.warn('[Redis] Failed to clear zone keys during refresh:', redisErr.message);
    }
  } catch (err) {
    console.error('[Redis] Shipping cache refresh failed:', err.message);
  }
}

// GET /api/shipping — return all governorates (minimal data with zones cached)
router.get('/', async (req, res) => {
  try {
    // 1. Try Cache
    try {
      const cached = await redis.get(SHIPPING_CACHE_KEY);
      if (cached) return res.json(JSON.parse(cached));
    } catch (err) {
      console.error('[Redis] Shipping cache get failed:', err.message);
    }

    // 2. Fetch from DB (Include zones for immediate caching)
    const fees = await Shipping.find({}, 'city cityOtherName fee zones');

    // 3. Resolve active fees dynamically from shipping_options setting
    const Setting = require('../models/Setting');
    const shippingOptionsRecord = await Setting.findOne({ key: 'shipping_options' });
    const shippingOptions = shippingOptionsRecord ? shippingOptionsRecord.value : [];
    const bostaOption = shippingOptions.find(o => 
      o.name.includes('بوسطة') || o.name.toLowerCase().includes('bosta')
    ) || shippingOptions[0];

    const isCityEqual = (a, b) => {
      if (!a || !b) return false;
      const norm = (s) => s.replace(/[أإآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase().trim();
      return norm(a) === norm(b);
    };

    const finalFees = fees.map(record => {
      const cityObj = bostaOption ? (bostaOption.cities || []).find(c => 
        isCityEqual(c.city, record.city) || isCityEqual(c.city, record.cityOtherName)
      ) : null;
      
      const resolvedFee = cityObj ? Number(cityObj.fee) : record.fee;
      
      return {
        _id: record._id,
        city: record.city,
        cityOtherName: record.cityOtherName,
        fee: isNaN(resolvedFee) ? record.fee : resolvedFee,
        zones: record.zones || []
      };
    });
    
    // 4. Set Cache (24 hour TTL for persistent feel)
    try {
      await redis.set(SHIPPING_CACHE_KEY, JSON.stringify(finalFees));
    } catch (err) {
      console.error('[Redis] Shipping cache set failed:', err.message);
    }

    res.json(finalFees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/shipping/egyptpost — return all Egypt Post governorates & fees
router.get('/egyptpost', async (req, res) => {
  try {
    const Setting = require('../models/Setting');
    const Shipping = require('../models/Shipping');
    
    // 1. Fetch governorates from DB
    const fees = await Shipping.find({}, 'city cityOtherName fee');

    // 2. Resolve Egypt Post options
    const shippingOptionsRecord = await Setting.findOne({ key: 'shipping_options' });
    const shippingOptions = shippingOptionsRecord ? shippingOptionsRecord.value : [];
    const postOption = shippingOptions.find(o => 
      o.name.includes('البريد') || o.name.toLowerCase().includes('post')
    ) || shippingOptions[0];

    const isCityEqual = (a, b) => {
      if (!a || !b) return false;
      const norm = (s) => s.replace(/[أإآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase().trim();
      return norm(a) === norm(b);
    };

    const egyptPostFees = fees.map(record => {
      const cityObj = postOption ? (postOption.cities || []).find(c => 
        isCityEqual(c.city, record.city) || isCityEqual(c.city, record.cityOtherName)
      ) : null;
      
      const resolvedFee = cityObj ? Number(cityObj.fee) : (postOption ? postOption.cost : 80);
      
      return {
        _id: record._id,
        city: record.city,
        cityOtherName: record.cityOtherName,
        fee: isNaN(resolvedFee) ? 80 : resolvedFee
      };
    });

    res.json(egyptPostFees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/shipping/zones/:cityId — return zones for a gov (fetched instantly from Redis cache)
router.get('/zones/:cityId', async (req, res) => {
  try {
    const { cityId } = req.params;
    
    // 1. Try Redis Cache first
    const cacheKey = `storefront:shipping:zones:${cityId}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));
    } catch (err) {
      console.error('[Redis] Zones cache get failed:', err.message);
    }

    // 2. Fallback to DB
    let gov;
    // Support both ID and Name lookup for robustness
    if (mongoose.Types.ObjectId.isValid(cityId)) {
      gov = await Shipping.findById(cityId);
    } else {
      gov = await Shipping.findOne({ $or: [{ city: cityId }, { cityOtherName: cityId }] });
    }

    if (!gov) return res.status(404).json({ error: 'Governorate not found' });
    const zones = gov.zones || [];

    // 3. Set Cache (24 hour TTL)
    try {
      await redis.set(cacheKey, JSON.stringify(zones));
    } catch (err) {
      console.error('[Redis] Zones cache set failed:', err.message);
    }

    res.json(zones);
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
    const { city, cityOtherName, bostaCityId, fee, zones } = req.body;
    const updateData = {};
    if (city !== undefined) updateData.city = city;
    if (cityOtherName !== undefined) updateData.cityOtherName = cityOtherName;
    if (bostaCityId !== undefined) updateData.bostaCityId = bostaCityId;
    if (fee !== undefined) updateData.fee = fee;
    if (zones !== undefined) updateData.zones = zones;

    const shipping = await Shipping.findByIdAndUpdate(req.params.id, updateData, { new: true });
    
    // Write-Through: Refresh the list cache
    await refreshShippingCache();
    
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
    
    // Write-Through: Refresh the list cache
    await refreshShippingCache();
    
    res.json(shipping);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: Delete city
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await Shipping.findByIdAndDelete(req.params.id);
    
    // Write-Through: Refresh the list cache
    await refreshShippingCache();
    
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
    
    // Write-Through: Refresh the list cache
    await refreshShippingCache();
    
    res.json({ success: true, message: 'All shipping fees updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
