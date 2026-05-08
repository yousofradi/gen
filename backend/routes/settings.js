const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const adminAuth = require('../middleware/adminAuth');

router.get('/paymentMethods', async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: 'sundura_global_settings' });
    res.json(setting && setting.value ? (setting.value.paymentMethods || []) : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:key', async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: req.params.key });
    res.json(setting ? setting.value : null);
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
    res.json(setting.value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pwa/manifest.json', async (req, res) => {
  try {
    const settings = await Setting.findOne({ key: 'sundura_global_settings' });
    const logoUrl = settings?.value?.storeLogo || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
    const storeName = settings?.value?.storeName || 'Sundura Admin';

    const manifest = {
      id: "sundura-admin-v1",
      name: storeName + " Admin",
      short_name: "Admin",
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
    res.json(manifest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
