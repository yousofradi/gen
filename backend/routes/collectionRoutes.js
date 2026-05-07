const express = require('express');
const router = express.Router();
const collectionController = require('../controllers/collectionController');
const adminAuth = require('../middleware/adminAuth');

// ── Caching ──────────────────────────────────────────────
let collectionCache = null;
let cacheTime = 0;
const CACHE_DURATION = 30 * 1000; // 30 seconds

function clearCache() {
  collectionCache = null;
  cacheTime = 0;
}

router.get('/', async (req, res, next) => {
  const { admin } = req.query;
  if (admin !== 'true' && collectionCache && (Date.now() - cacheTime < CACHE_DURATION)) {
    return res.json(collectionCache);
  }
  
  // Intercept the response to cache it
  const originalJson = res.json;
  res.json = function(data) {
    if (admin !== 'true' && !res.statusCode || (res.statusCode >= 200 && res.statusCode < 300)) {
      collectionCache = data;
      cacheTime = Date.now();
    }
    return originalJson.call(this, data);
  };
  
  next();
}, collectionController.getCollections);

router.get('/:id', collectionController.getCollection);

// Admin only routes
router.post('/delete/batch', adminAuth, async (req, res, next) => {
  clearCache();
  next();
}, collectionController.deleteCollectionsBatch);

router.post('/', adminAuth, async (req, res, next) => {
  clearCache();
  next();
}, collectionController.createCollection);

router.put('/:id', adminAuth, async (req, res, next) => {
  clearCache();
  next();
}, collectionController.updateCollection);

router.delete('/:id', adminAuth, async (req, res, next) => {
  clearCache();
  next();
}, collectionController.deleteCollection);

module.exports = { router, clearCache };
