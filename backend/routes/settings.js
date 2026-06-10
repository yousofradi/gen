const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const adminAuth = require('../middleware/adminAuth');
const cache = require('../utils/cache');
const Product = require('../models/Product');

router.post('/clear-cache', adminAuth, async (req, res) => {
  try {
    await cache.clearPrefix(''); // Clear everything
    res.json({ message: 'Cache cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

router.get('/paymentMethods', async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: 'admin_global_settings' });

    res.json(setting && setting.value ? (setting.value.paymentMethods || []) : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const bypassCache = req.query.admin === 'true' || req.query.bypassCache === 'true' || req.query.t !== undefined;
    const cacheKey = `storefront:settings:${key}`;
    
    if (!bypassCache) {
      const cached = await cache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const setting = await Setting.findOne({ key });
    const value = setting ? setting.value : null;
    
    if (!bypassCache) {
      const ttl = key === 'homepage_sections' ? null : undefined;
      await cache.set(cacheKey, value, ttl);
    }
    res.json(value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:key', adminAuth, async (req, res) => {
  try {
    const setting = await Setting.findOneAndUpdate(
      { key: req.params.key },
      { value: req.body.value },
      { upsert: true, new: true }
    );
    
    // Clear cache
    await cache.del(`storefront:settings:${req.params.key}`);

    // Synchronize shipping options back to individual Shipping documents in MongoDB
    if (req.params.key === 'shipping_options') {
      try {
        const Shipping = require('../models/Shipping');
        const SHIPPING_CACHE_KEY = 'storefront:shipping:list';
        
        const options = req.body.value || [];
        const bostaOption = options.find(o => 
          o.name.includes('بوسطة') || o.name.toLowerCase().includes('bosta')
        ) || options[0];

        if (bostaOption && Array.isArray(bostaOption.cities)) {
          const isCityEqual = (a, b) => {
            if (!a || !b) return false;
            const norm = (s) => s.replace(/[أإآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase().trim();
            return norm(a) === norm(b);
          };

          for (const cityObj of bostaOption.cities) {
            const newFee = Number(cityObj.fee);
            const record = await Shipping.findOne({
              $or: [
                { city: cityObj.city },
                { cityOtherName: cityObj.city }
              ]
            });
            if (record) {
              let updated = false;
              if (!isNaN(newFee) && record.fee !== newFee) {
                record.fee = newFee;
                updated = true;
              }
              if (cityObj.zones && Array.isArray(cityObj.zones)) {
                record.zones = cityObj.zones;
                updated = true;
              }
              if (updated) {
                await record.save();
              }
            }
          }
          
          // Clear cache so `/api/shipping` immediately reflects the new fees!
          await cache.del(SHIPPING_CACHE_KEY);
          await cache.clearPrefix('storefront:shipping:zones:');
        }
      } catch (syncErr) {
        console.error('[Sync] Failed to synchronize shipping options to DB collection:', syncErr.message);
      }
    }
    
    res.json(setting.value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pwa/manifest.json', async (req, res) => {
  try {
    const settings = await Setting.findOne({ key: 'admin_global_settings' });
    const logoUrl = settings?.value?.storeLogo || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
    const storeName = settings?.value?.storeName || 'admin Store';


    const manifest = {
      id: "admin-v1",
      name: storeName,
      short_name: storeName.slice(0, 10),

      description: "Store Management Dashboard",
      start_url: "/admin/index.html",
      scope: "/admin/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#64748b",
      orientation: "portrait",
      icons: [
        {
          src: logoUrl,
          sizes: "192x192",
          type: "image/png",
          purpose: "any"
        },
        {
          src: logoUrl,
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable"
        }
      ]
    };

    res.header('Content-Type', 'application/manifest+json');
    res.header('Access-Control-Allow-Origin', '*');
    res.json(manifest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
