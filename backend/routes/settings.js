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

module.exports = router;
