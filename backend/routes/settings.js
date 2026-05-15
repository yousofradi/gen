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
    const cacheKey = `storefront:settings:${key}`;
    
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const setting = await Setting.findOne({ key });
    const value = setting ? setting.value : null;
    
    await cache.set(cacheKey, value);
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
