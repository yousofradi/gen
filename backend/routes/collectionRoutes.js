const express = require('express');
const router = express.Router();
const collectionController = require('../controllers/collectionController');
const adminAuth = require('../middleware/adminAuth');

const cache = require('../utils/cache');

router.get('/', async (req, res, next) => {
  const { admin } = req.query;
  const cacheKey = 'storefront:collections:list';

  if (admin !== 'true') {
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);
  }
  
  // Intercept the response to cache it
  const originalJson = res.json;
  res.json = function(data) {
    if (admin !== 'true' && (!res.statusCode || (res.statusCode >= 200 && res.statusCode < 300))) {
      cache.set(cacheKey, data);
    }
    return originalJson.call(this, data);
  };
  
  next();
}, collectionController.getCollections);

router.get('/:id', collectionController.getCollection);

// Admin only routes
router.post('/delete/batch', adminAuth, async (req, res, next) => {
  await cache.del('storefront:collections:list');
  next();
}, collectionController.deleteCollectionsBatch);

router.post('/', adminAuth, async (req, res, next) => {
  await cache.del('storefront:collections:list');
  next();
}, collectionController.createCollection);

router.put('/:id', adminAuth, async (req, res, next) => {
  await cache.del('storefront:collections:list');
  next();
}, collectionController.updateCollection);

router.delete('/:id', adminAuth, async (req, res, next) => {
  await cache.del('storefront:collections:list');
  next();
}, collectionController.deleteCollection);

router.put('/reorder/batch', adminAuth, async (req, res, next) => {
  await cache.del('storefront:collections:list');
  next();
}, collectionController.reorderCollectionsBatch);

module.exports = { router };
