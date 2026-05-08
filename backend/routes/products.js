const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const adminAuth = require('../middleware/adminAuth');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const upload = multer({ dest: 'uploads/' });

// ── Caching ──────────────────────────────────────────────
let productCache = new Map();
const CACHE_DURATION = 30 * 1000; // 30 seconds for better performance

function clearCache() {
  productCache.clear();
}

// ── Public ──────────────────────────────────────────────

// GET /api/products — list all (with pagination & collection filter)
router.get('/', async (req, res) => {
  try {
    const { page, limit, admin, collectionId, search, hasOptions } = req.query;
    
    // Simple caching for public requests
    const cacheKey = JSON.stringify({ page, limit, admin, collectionId, search, hasOptions });
    if (admin !== 'true' && productCache.has(cacheKey)) {
      const cached = productCache.get(cacheKey);
      if (Date.now() - cached.time < CACHE_DURATION) {
        return res.json(cached.data);
      }
    }

    const query = {};
    
    // If not admin request, only show active products
    if (admin !== 'true') {
      query.active = { $ne: false };
      query.status = { $ne: 'draft' };
      // Hide out-of-stock products (quantity === 0) from storefront
      // quantity: null or undefined means unlimited
      query.$and = [
        { $or: [{ quantity: null }, { quantity: { $gt: 0 } }] }
      ];
    }

    // Server-side search by name
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    // Filter by variable products (has options)
    if (hasOptions === 'true') {
      query.options = { $exists: true, $not: { $size: 0 } };
    }

    // Filter by collection
    if (collectionId) {
      const colFilter = {
        $or: [
          { collectionId: collectionId },
          { collectionIds: collectionId }
        ]
      };
      // Merge with existing $and if present
      if (query.$and) {
        query.$and.push(colFilter);
      } else {
        query.$and = [colFilter];
      }
    }

    let sortObj = { createdAt: -1 };
    
    // Support manual sorting if collectionId is provided
    let manualOrder = null;
    if (collectionId) {
      const Collection = require('../models/Collection');
      const col = await Collection.findById(collectionId).select('productOrder');
      if (col && col.productOrder && col.productOrder.length > 0) {
        manualOrder = col.productOrder.map(id => id.toString());
      }
    }

    // Optimization: Don't fetch description for listings
    const fieldsToSelect = admin === 'true' ? '' : '-description';

    if (page || limit) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const skip = (pageNum - 1) * limitNum;
      
      let products, total;
      if (manualOrder && !search) {
        // Fetch all matching products then sort and paginate manually or via $in
        // But $in doesn't guarantee order. 
        // Best for small/medium collections: fetch all matching IDs, then paginate.
        const allMatching = await Product.find(query).select(fieldsToSelect);
        total = allMatching.length;
        
        // Sort
        const orderMap = {};
        manualOrder.forEach((id, idx) => orderMap[id] = idx);
        allMatching.sort((a, b) => {
          const idxA = orderMap[a._id.toString()] !== undefined ? orderMap[a._id.toString()] : 9999;
          const idxB = orderMap[b._id.toString()] !== undefined ? orderMap[b._id.toString()] : 9999;
          return idxA - idxB;
        });
        
        products = allMatching.slice(skip, skip + limitNum);
      } else {
        [products, total] = await Promise.all([
          Product.find(query).select(fieldsToSelect).sort(sortObj).skip(skip).limit(limitNum),
          Product.countDocuments(query)
        ]);
      }
      
      const result = {
        products,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum)
      };

      if (admin !== 'true') {
        const cacheKey = JSON.stringify({ page, limit, admin, collectionId, search });
        productCache.set(cacheKey, { data: result, time: Date.now() });
      }
      
      res.json(result);
    } else {
      // For non-paginated requests (like the home page), still apply a reasonable limit of 500
      // unless it's an admin request.
      const queryExec = Product.find(query).select(fieldsToSelect).sort(sortObj);
      if (admin !== 'true') {
        queryExec.limit(500); 
      }
      const products = await queryExec;
      if (admin !== 'true') {
        const cacheKey = JSON.stringify({ page, limit, admin, collectionId, search });
        productCache.set(cacheKey, { data: products, time: Date.now() });
      }
      res.json(products);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/:id — single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// GET /api/products/handle/:handle — single product by handle
router.get('/handle/:handle', async (req, res) => {
  try {
    const product = await Product.findOne({ handle: req.params.handle });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product by handle' });
  }
});

const { uploadToCloudinary, isDriveUrl } = require('../utils/cloudinary');

// Helper to process drive images in payload
async function processDriveImages(body) {
  try {
    if (isDriveUrl(body.imageUrl)) {
      body.imageUrl = await uploadToCloudinary(body.imageUrl);
    }
    if (Array.isArray(body.images)) {
      for (let i = 0; i < body.images.length; i++) {
        if (isDriveUrl(body.images[i])) {
          body.images[i] = await uploadToCloudinary(body.images[i]);
        }
      }
    }
    if (Array.isArray(body.variants)) {
      for (let v of body.variants) {
        if (isDriveUrl(v.imageUrl)) {
          v.imageUrl = await uploadToCloudinary(v.imageUrl);
        }
      }
    }
  } catch (err) {
    console.error('Error processing drive images:', err);
  }
}

// ── Admin ───────────────────────────────────────────────

// POST /api/products — create
router.post('/', adminAuth, async (req, res) => {
  try {
    const body = req.body;
    const { name, basePrice } = body;

    if (!name || basePrice == null) {
      return res.status(400).json({ error: 'Name and basePrice are required' });
    }

    // Process images if they are from Google Drive
    await processDriveImages(body);

    const count = await Product.countDocuments();
    const product = new Product({ 
      ...body,
      sortOrder: count
    });
    
    await product.save();
    clearCache();
    res.status(201).json(product);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PUT /api/products/:id — update
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const body = req.body;
    
    // Process images if they are from Google Drive
    await processDriveImages(body);

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      body,
      { new: true, runValidators: true }
    );

    if (!product) return res.status(404).json({ error: 'Product not found' });
    clearCache();
    res.json(product);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE /api/products/:id — delete
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    clearCache();
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// POST /api/products/delete/batch — bulk delete
router.post('/delete/batch', adminAuth, async (req, res) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds)) return res.status(400).json({ error: 'productIds must be an array' });
    await Product.deleteMany({ _id: { $in: productIds } });
    clearCache();
    res.json({ message: 'Products deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete products' });
  }
});

// POST /api/products/deactivate/batch — bulk deactivate
router.post('/deactivate/batch', adminAuth, async (req, res) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds)) return res.status(400).json({ error: 'productIds must be an array' });
    await Product.updateMany(
      { _id: { $in: productIds } },
      { $set: { active: false, status: 'draft' } }
    );
    clearCache();
    res.json({ message: 'Products deactivated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate products' });
  }
});

// PUT /api/products/reorder/batch — reorder products
router.put('/reorder/batch', adminAuth, async (req, res) => {
  try {
    const { order } = req.body;
    if (!order || !Array.isArray(order)) {
      return res.status(400).json({ error: 'order array is required' });
    }
    const ops = order.map(item => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { sortOrder: item.sortOrder } }
      }
    }));
    await Product.bulkWrite(ops);
    clearCache();
    res.json({ message: 'Products reordered' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reorder products' });
  }
});

// PUT /api/products/collection/batch — bulk update collection
router.put('/collection/batch', adminAuth, async (req, res) => {
  try {
    const { productIds, collectionId, action } = req.body;
    if (!Array.isArray(productIds)) return res.status(400).json({ error: 'productIds must be an array' });
    
    if (action === 'add') {
      await Product.updateMany(
        { _id: { $in: productIds } },
        { $addToSet: { collectionIds: collectionId } }
      );
    } else if (action === 'remove') {
      await Product.updateMany(
        { _id: { $in: productIds } },
        { $pull: { collectionIds: collectionId } }
      );
    } else if (action === 'set') {
       // First remove this collection from all products that have it
       await Product.updateMany(
        { collectionIds: collectionId },
        { $pull: { collectionIds: collectionId } }
       );
       // Then add it only to the specified products
       if (productIds.length > 0) {
         await Product.updateMany(
           { _id: { $in: productIds } },
           { $addToSet: { collectionIds: collectionId } }
         );
       }
    } else {
      return res.status(400).json({ error: 'invalid action' });
    }
    
    clearCache();
    res.json({ message: 'Product collections updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product collections' });
  }
});

// POST /api/products/import — Bulk Import
router.post('/import', adminAuth, upload.single('file'), async (req, res) => {
  try {
    const { deleteAll, createCollections } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const cleanPrice = (val) => {
      if (val === null || val === undefined || val === '') return null;
      const cleaned = val.toString().replace(/[^\d.]/g, '');
      return cleaned === '' ? 0 : parseFloat(cleaned);
    };

    if (deleteAll === 'true') {
      await Product.deleteMany({});
      clearCache();
    }

    const normalizeArabic = (str) => {
      if (!str) return '';
      return str.trim()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .toLowerCase();
    };

    // Get all collections to map names
    const Collection = require('../models/Collection');
    let collections = await Collection.find({});
    const collectionMap = {};
    collections.forEach(c => {
      collectionMap[normalizeArabic(c.name)] = c._id;
    });

    const productsMap = new Map();
    let lastProduct = null;

    const stream = fs.createReadStream(req.file.path).pipe(csv({
      mapHeaders: ({ header }) => header.toLowerCase().replace(/\ufeff/g, '').trim()
    }));

    for await (const row of stream) {
      const title = row['title'] ? row['title'].trim() : '';
      
      if (title) {
        const product = {
          name: title,
          description: row['description'] || '',
          basePrice: cleanPrice(row['regular price']),
          salePrice: row['sale price'] ? cleanPrice(row['sale price']) : null,
          imageUrl: '',
          images: [],
          status: (row['status'] || 'active').toLowerCase(),
          quantity: (row['quantity'] === 'Available' || !row['quantity']) ? null : (parseInt(row['quantity']) || 0),
          collectionIds: [],
          options: []
        };

        const imagesVal = row['images'];
        if (imagesVal) {
          const imgs = imagesVal.split(/\s+/).filter(url => url.startsWith('http'));
          product.images = imgs;
          product.imageUrl = imgs[0] || '';
        }

        // Handle collections
        const collectionsVal = row['collections'];
        if (collectionsVal) {
          const names = collectionsVal.split(',').map(n => n.trim()).filter(Boolean);
          for (const name of names) {
            const normName = normalizeArabic(name);
            if (collectionMap[normName]) {
              product.collectionIds.push(collectionMap[normName]);
            } else if (createCollections === 'true') {
              // Create collection if missing
              try {
                const newCol = new Collection({ 
                  name, 
                  handle: name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]/g, '') || Date.now().toString()
                });
                await newCol.save();
                collectionMap[normName] = newCol._id;
                product.collectionIds.push(newCol._id);
              } catch (e) {
                console.error('Failed to auto-create collection:', name, e.message);
              }
            }
          }
        }

        productsMap.set(title, product);
        lastProduct = product;
      }

      // Handle Options (Option1, Option2, Option3)
      if (lastProduct) {
        for (let i = 1; i <= 3; i++) {
          const optName = row[`option${i} name`] ? row[`option${i} name`].trim() : '';
          const optValue = row[`option${i} value`] ? row[`option${i} value`].trim() : '';

          if (optName && optValue) {
            let group = lastProduct.options.find(g => g.name === optName);
            if (!group) {
              group = { name: optName, values: [] };
              lastProduct.options.push(group);
            }

            // Option pricing: use row prices if available, otherwise fallback to product prices
            const rowReg = row['regular price'];
            const rowSale = row['sale price'];
            
            const price = rowReg ? cleanPrice(rowReg) : lastProduct.basePrice;
            const sPrice = rowSale ? cleanPrice(rowSale) : lastProduct.salePrice;

            // Avoid duplicates in the same group
            if (!group.values.find(v => v.label === optValue)) {
              group.values.push({
                label: optValue,
                price: price,
                salePrice: sPrice
              });
            }
          }
        }
      }
    }

    // Now Upsert products
    const finalProducts = Array.from(productsMap.values());
    let index = 0;
    for (const pData of finalProducts) {
      // Find current count if creating new
      if (deleteAll !== 'true') {
         const existing = await Product.findOne({ name: pData.name });
         if (!existing) {
           pData.sortOrder = await Product.countDocuments();
         }
      } else {
        pData.sortOrder = index++;
      }
      
      await Product.findOneAndUpdate(
        { name: pData.name },
        pData,
        { upsert: true, new: true, runValidators: true }
      );
    }

    // Cleanup file
    try { fs.unlinkSync(req.file.path); } catch(e) {}
    clearCache();
    if (createCollections === 'true') {
      try {
        require('./collectionRoutes').clearCache();
      } catch (e) {}
    }

    res.json({ message: `تم استيراد ${finalProducts.length} منتج بنجاح`, count: finalProducts.length });
  } catch (err) {
    console.error('Import Error:', err);
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch(e) {}
    }
    res.status(500).json({ error: 'فشل استيراد المنتجات: ' + err.message });
  }
});

module.exports = router;
