const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const adminAuth = require('../middleware/adminAuth');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const upload = multer({ dest: 'uploads/' });
const { uploadToCloudinary, isDriveUrl, optimizeCloudinaryUrl } = require('../utils/cloudinary');

// Helper to optimize product images for delivery
function optimizeProductData(p) {
  if (!p) return p;
  if (p.imageUrl) p.imageUrl = optimizeCloudinaryUrl(p.imageUrl);
  if (Array.isArray(p.images)) {
    p.images = p.images.map(img => optimizeCloudinaryUrl(img));
  }
  if (Array.isArray(p.variants)) {
    p.variants.forEach(v => {
      if (v.imageUrl) v.imageUrl = optimizeCloudinaryUrl(v.imageUrl);
    });
  }
  return p;
}

const cache = require('../utils/cache');

const REDIS_TTL = 2592000; // 30 days ("Never violate")

async function updateStorefrontCache(productId, productData) {
  try {
    // Always clear storefront list page caches when a product changes
    await clearListCache();
  } catch (err) {
    console.error('[Redis] Cache update failed:', err);
  }
}

async function clearListCache() {
  await cache.clearPrefix('storefront:products:list:');
}

// ── Public ──────────────────────────────────────────────

// GET /api/products — list all (with pagination & collection filter)
router.get('/', async (req, res) => {
  try {
    const { page, limit, admin, collectionId, search, hasOptions, status } = req.query;
    
    // Define cacheKey at the top scope of the route
    let cacheKey = `storefront:products:list:${JSON.stringify({ page, limit, collectionId, search, hasOptions, status })}`;

    // 1. ADMIN BYPASS: Skip Redis entirely for admin requests
    if (admin !== 'true') {
      const cached = await cache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const query = {};
    
    // If admin request, allow filtering by status
    if (admin === 'true') {
      if (status === 'draft') {
        // Show both draft status AND explicitly inactive products
        query.$or = [{ status: 'draft' }, { active: false }];
      } else if (status === 'active') {
        query.status = 'active';
        query.active = { $ne: false };
      }
      // If no status provided, show both active and draft products for admin
    } 
    // If not admin request, only show active products
    else if (admin !== 'true') {
      query.active = { $ne: false };
      query.status = 'active'; // Strictly active
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

    // Filter by variable products (has at least one option group)
    if (hasOptions === 'true') {
      query.options = { $exists: true, $type: 'array', $ne: [] };
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

    let sortObj = { updatedAt: -1 };
    
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
        const allMatching = await Product.find(query).select(fieldsToSelect).lean();
        total = allMatching.length;
        
        // Sort
        const orderMap = {};
        manualOrder.forEach((id, idx) => orderMap[id] = idx);
        allMatching.sort((a, b) => {
          const idxA = orderMap[a._id.toString()] !== undefined ? orderMap[a._id.toString()] : 9999;
          const idxB = orderMap[b._id.toString()] !== undefined ? orderMap[b._id.toString()] : 9999;
          return idxA - idxB;
        });
        
        products = allMatching.slice(skip, skip + limitNum).map(optimizeProductData);
      } else {
        [products, total] = await Promise.all([
          Product.find(query).select(fieldsToSelect).sort(sortObj).skip(skip).limit(limitNum).lean(),
          Product.countDocuments(query)
        ]);
        products = products.map(optimizeProductData);
      }
      
      const result = {
        products,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum)
      };

      if (admin !== 'true') {
        await cache.set(cacheKey, result, REDIS_TTL);
      }
      
      res.json(result);
    } else {
      // For non-paginated requests (like the home page), still apply a reasonable limit of 500
      // unless it's an admin request.
      const queryExec = Product.find(query).select(fieldsToSelect).sort(sortObj).lean();
      if (admin !== 'true') {
        queryExec.limit(500); 
      }
      let products = await queryExec;
      products = products.map(optimizeProductData);
      if (admin !== 'true') {
        await cache.set(cacheKey, products, REDIS_TTL);
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
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(optimizeProductData(product));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// GET /api/products/handle/:handle — single product by handle
router.get('/handle/:handle', async (req, res) => {
  try {
    const product = await Product.findOne({ handle: req.params.handle }).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(optimizeProductData(product));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product by handle' });
  }
});

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
    
    // Write-Through: Update specific product cache with clean, lean data
    const cleanProduct = await Product.findById(product._id).lean();
    await updateStorefrontCache(product._id, optimizeProductData(cleanProduct));
    
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
    
    // Write-Through: Update specific product cache with clean, lean data
    const cleanProduct = await Product.findById(product._id).lean();
    await updateStorefrontCache(product._id, optimizeProductData(cleanProduct));
    
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
    
    // Write-Through: Remove from cache
    await updateStorefrontCache(req.params.id, null);
    
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
    
    // Write-Through: Remove affected products from cache
    for (const id of productIds) {
      await updateStorefrontCache(id, null);
    }
    await clearListCache();
    
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

    // Write-Through: Update affected products
    const updated = await Product.find({ _id: { $in: productIds } }).lean();
    for (const p of updated) {
      await updateStorefrontCache(p._id, optimizeProductData(p));
    }
    
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
        update: { $set: { sortOrder: item.sortOrder } },
        timestamps: false // Prevent updatedAt from changing during manual reorder
      }
    }));
    await Product.bulkWrite(ops);
    
    // Write-Through: Update affected products
    const ids = order.map(item => item.id);
    const updated = await Product.find({ _id: { $in: ids } }).lean();
    for (const p of updated) {
      await updateStorefrontCache(p._id, optimizeProductData(p));
    }
    
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
    
    // Write-Through: Update affected products
    const updatedProducts = await Product.find({ _id: { $in: productIds } }).lean();
    for (const p of updatedProducts) {
      await updateStorefrontCache(p._id, optimizeProductData(p));
    }
    
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
      await clearListCache();
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

    const productsToSave = [];
    let currentProduct = null;

    const stream = fs.createReadStream(req.file.path).pipe(csv({
      mapHeaders: ({ header }) => header.toLowerCase().replace(/\ufeff/g, '').trim()
    }));

    for await (const row of stream) {
      const title = row['title'] ? row['title'].trim() : '';
      
      // 1. Detect New Product
      if (title) {
        currentProduct = {
          name: title,
          description: row['description'] || '',
          basePrice: cleanPrice(row['p-price']),
          salePrice: row['p-sale-price'] ? cleanPrice(row['p-sale-price']) : null,
          imageUrl: '',
          images: [],
          status: (row['status'] || 'active').toLowerCase(),
          quantity: (row['quantity'] === 'Available' || !row['quantity']) ? null : (parseInt(row['quantity']) || 0),
          collectionIds: [],
          options: [],
          variants: []
        };

        const imagesVal = row['images'];
        if (imagesVal) {
          const imgs = imagesVal.split(/\s+/).filter(url => url.startsWith('http'));
          currentProduct.images = imgs;
          currentProduct.imageUrl = imgs[0] || '';
        }

        const collectionsVal = row['collections'];
        if (collectionsVal) {
          const names = collectionsVal.split(',').map(n => n.trim()).filter(Boolean);
          for (const name of names) {
            const normName = normalizeArabic(name);
            if (collectionMap[normName]) {
              currentProduct.collectionIds.push(collectionMap[normName]);
            } else if (createCollections === 'true') {
              try {
                const newCol = new Collection({ 
                  name, 
                  handle: name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]/g, '') || Date.now().toString()
                });
                await newCol.save();
                collectionMap[normName] = newCol._id;
                currentProduct.collectionIds.push(newCol._id);
              } catch (e) {
                console.error('Failed to auto-create collection:', name, e.message);
              }
            }
          }
        }
        productsToSave.push(currentProduct);
      }

      // 2. Extract Variant from CURRENT row
      if (currentProduct) {
        const combination = {};
        let hasVariantInfo = false;

        for (let i = 1; i <= 3; i++) {
          const optName = row[`option${i} name`] ? row[`option${i} name`].trim() : '';
          const optValue = row[`option${i} value`] ? row[`option${i} value`].trim() : '';

          if (optName && optValue) {
            hasVariantInfo = true;
            combination[optName] = optValue;

            // Aggregated Options (for UI selection)
            let group = currentProduct.options.find(g => g.name === optName);
            if (!group) {
              group = { name: optName, values: [] };
              currentProduct.options.push(group);
            }
            if (!group.values.find(v => v.label === optValue)) {
              group.values.push({ label: optValue, price: 0 });
            }
          }
        }

        // Only add to variants if it's a variable product row
        if (hasVariantInfo) {
          const variantPrice = cleanPrice(row['p-price']);
          const variantSalePrice = row['p-sale-price'] ? cleanPrice(row['p-sale-price']) : null;
          
          const variantData = {
            combination,
            price: variantPrice || currentProduct.basePrice,
            salePrice: variantSalePrice !== null ? variantSalePrice : currentProduct.salePrice,
            quantity: (row['quantity'] === 'Available' || !row['quantity']) ? null : (parseInt(row['quantity']) || 0),
            active: true,
            imageUrl: ''
          };

          // If the row has specific images, use the first one for this variant
          const rowImages = row['images'];
          if (rowImages) {
            const imgs = rowImages.split(/\s+/).filter(url => url.startsWith('http'));
            if (imgs.length > 0) variantData.imageUrl = imgs[0];
          }

          currentProduct.variants.push(variantData);
        }
      }
    }

    // 3. Persist to DB
    let index = 0;
    const initialSortOrder = (deleteAll === 'true') ? 0 : await Product.countDocuments();

    for (const p of productsToSave) {
      p.sortOrder = initialSortOrder + index++;
      
      const saved = await Product.findOneAndUpdate(
        { name: p.name },
        p,
        { upsert: true, new: true, runValidators: true }
      ).lean();

      if (saved) {
        await updateStorefrontCache(saved._id, optimizeProductData(saved));
      }
    }

    try { fs.unlinkSync(req.file.path); } catch(e) {}
    if (createCollections === 'true') {
      try { require('./collectionRoutes').clearCache(); } catch (e) {}
    }

    res.json({ message: `تم استيراد ${productsToSave.length} منتج بنجاح`, count: productsToSave.length });
  } catch (err) {
    console.error('Import Error:', err);
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch(e) {}
    }
    res.status(500).json({ error: 'فشل استيراد المنتجات: ' + err.message });
  }
});

module.exports = router;
