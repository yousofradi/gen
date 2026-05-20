const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const Collection = require('../models/Collection');
const Shipping = require('../models/Shipping');
const Setting = require('../models/Setting');
const adminAuth = require('../middleware/adminAuth');
const { uploadToCloudinary, isCloudinaryConfigured } = require('../utils/cloudinary');

// GET /api/seed/test — test endpoint
router.get('/test', (req, res) => res.json({ message: 'Seed route is active' }));

// POST /api/seed/collections — replaces existing collections with predefined list
router.post('/collections', adminAuth, async (req, res) => {
  try {
    const collectionsData = [
      { name: 'سكوب سندورة', imageUrl: 'https://assets.wuiltstore.com/cmo0fglem05nc01lzdnl9fvh8_scope.webp' },
      { name: 'ألعاب', imageUrl: 'https://assets.wuiltstore.com/cmo0gt4x805sk01n0exmd9zpl_Games.webp' },
      { name: 'أدوات فنية / تلوين', imageUrl: 'https://assets.wuiltstore.com/cmo0ghhw505rb01lw53u64q3m_Paint.webp' },
      { name: 'استيكرات', imageUrl: 'https://assets.wuiltstore.com/cmo0gm31705l401l7gsye6xl0_stickers.webp' },
      { name: 'ديكورالمكتب', imageUrl: 'https://assets.wuiltstore.com/cmo04f8v105qn01l8fi0tg23k_WhatsApp_Image_2026-04-15_at_3.59.46_PM.webp' },
      { name: 'المنظمات', imageUrl: 'https://assets.wuiltstore.com/cmo0f1b6005k401l7fifjhre2_organize.webp' },
      { name: 'شنط / توك / اكسسورات', imageUrl: 'https://assets.wuiltstore.com/cmo0ezw3z05n301lzcnujdmqp_bags.webp' },
      { name: 'لانش بوكس/مجات/زجاجات', imageUrl: 'https://assets.wuiltstore.com/cmo0gw54j05nx01lzbeay9u9s_Cups.webp' },
      { name: 'دفاتر / كشاكيل', imageUrl: 'https://assets.wuiltstore.com/cmo0gqr7g05rf01lw67ng3o0i_paper.webp' },
      { name: 'نوت بوك', imageUrl: 'https://assets.wuiltstore.com/cmo0erg2z05mz01lz872kai3p_note.webp' },
      { name: 'استيكي نوت', imageUrl: 'https://assets.wuiltstore.com/cmo0g29og05sc01n09wxm7lm7_stickynotes.webp' },
      { name: 'اقلام متعددة الالوان', imageUrl: 'https://assets.wuiltstore.com/cmo0g4sk405r401lw6l6k74ug_multicolor.webp' },
      { name: 'اقلام جاف / حبر', imageUrl: 'https://assets.wuiltstore.com/cmo0ducgq05mk01lz5hcx85zn_WhatsApp_Image_2026-04-15_at_8.26.26_PM.webp' },
      { name: 'اقلام رصاص / سنون', imageUrl: 'https://assets.wuiltstore.com/cmo0gdy5405r901lw46gq56o6_pencils.webp' },
      { name: 'اقلام هايلايتر', imageUrl: 'https://assets.wuiltstore.com/cmo0ga3u405r801lw8kwmhpz0_hightlighter.webp' },
      { name: 'كوريكتور', imageUrl: 'https://assets.wuiltstore.com/cmo0fxcpd05nj01lzer8ncltm_corrector.webp' },
      { name: 'ادوات التخطيط والتلخيص', imageUrl: 'https://assets.wuiltstore.com/cmo0fe5rz05rs01n088zzaw9p_plaining.webp' },
      { name: 'مقالم مستوردة', imageUrl: 'https://assets.wuiltstore.com/cmo0famk605kc01l7gaiv17yk_case.webp' },
      { name: 'الادوات الهندسيه', imageUrl: 'https://assets.wuiltstore.com/cmo0fz3tj05sa01n0du419tyw_engineeringTools.webp' },
      { name: 'برايات', imageUrl: 'https://assets.wuiltstore.com/cmo0f4fhy05n901lzdk9y3y1n_br.webp' },
      { name: 'أستيكه (جوما)', imageUrl: 'https://assets.wuiltstore.com/cmo0f7oqe05qm01lwbsay4oje_earser.webp' }
    ];

    await Collection.deleteMany({});
    await Product.updateMany({}, { collectionId: null, collectionIds: [] });

    for (const c of collectionsData) {
      c.handle = c.name.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-').replace(/(^-|-$)+/g, '');
      await Collection.create(c);
    }

    res.json({ message: 'Collections replaced successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Seed failed: ' + err.message });
  }
});

// POST /api/seed — import products from CSV (run on server)
router.post('/', adminAuth, async (req, res) => {
  try {
    const { clean, csvData } = req.body;

    if (!csvData) {
      return res.status(400).json({ error: 'csvData is required (CSV text content)' });
    }

    if (clean) {
      await Product.deleteMany({});
      await Collection.deleteMany({});
    }

    // Parse CSV
    const rows = parseCSV(csvData);
    const headers = rows[0];
    const dataRows = rows.slice(1);
    const idx = {};
    headers.forEach((h, i) => idx[h] = i);

    // Group by Handle
    const productGroups = {};
    const groupOrder = [];
    for (const row of dataRows) {
      const handle = (row[idx['Handle']] || '').trim();
      if (!handle) continue;
      if (!productGroups[handle]) { productGroups[handle] = []; groupOrder.push(handle); }
      productGroups[handle].push(row);
    }

    // Extract collections
    const collectionNames = new Set();
    for (const handle of groupOrder) {
      const mainRow = productGroups[handle][0];
      const colStr = (mainRow[idx['Collections']] || '').trim();
      if (colStr) colStr.split(',').map(c => c.trim()).filter(Boolean).forEach(c => collectionNames.add(c));
    }

    const collectionMap = {};
    let colOrder = 0;
    for (const name of collectionNames) {
      let existing = await Collection.findOne({ name });
      if (!existing) existing = await Collection.create({ name, sortOrder: colOrder });
      collectionMap[name] = existing._id;
      colOrder++;
    }

    // Create products
    let created = 0;
    let sortOrder = 0;
    for (const handle of groupOrder) {
      const rows = productGroups[handle];
      const mainRow = rows[0];
      const name = (mainRow[idx['Title']] || '').trim();
      if (!name) continue;

      const description = (mainRow[idx['Description']] || '').trim();
      const statusRaw = (mainRow[idx['Status']] || 'ACTIVE').trim().toUpperCase();
      const status = statusRaw === 'DRAFT' ? 'draft' : 'active';
      const imagesStr = (mainRow[idx['Images']] || '').trim();
      const images = imagesStr ? imagesStr.split(/\s+/).filter(u => u.startsWith('http')) : [];
      const regularPrice = parseFloat(mainRow[idx['Regular Price']] || '0') || 0;
      const salePrice = parseFloat(mainRow[idx['Sale Price']] || '') || null;
      const basePrice = regularPrice;

      const qtyRaw = (mainRow[idx['Quantity']] || '').trim();
      let quantity = null;
      if (qtyRaw && qtyRaw !== 'Available') {
        const parsed = parseInt(qtyRaw);
        if (!isNaN(parsed)) quantity = parsed;
      }

      const colStr = (mainRow[idx['Collections']] || '').trim();
      const colNames = colStr ? colStr.split(',').map(c => c.trim()).filter(Boolean) : [];
      const colIds = colNames.map(n => collectionMap[n]).filter(Boolean);
      const collectionId = colIds.length > 0 ? colIds[0] : null;

      // Build options
      const options = [];
      for (let optNum = 1; optNum <= 3; optNum++) {
        const optName = (mainRow[idx[`Option${optNum} Name`]] || '').trim();
        if (!optName) continue;
        const valuesMap = new Map();
        for (const row of rows) {
          const val = (row[idx[`Option${optNum} Value`]] || '').trim();
          if (!val) continue;
          const vr = parseFloat(row[idx['Regular Price']] || '') || regularPrice;
          const vs = parseFloat(row[idx['Sale Price']] || '') || null;
          const vp = vs || vr;
          const diff = vp - (salePrice || basePrice);
          if (!valuesMap.has(val)) valuesMap.set(val, { label: val, price: diff > 0 ? Math.round(diff) : 0 });
        }
        if (valuesMap.size > 0) options.push({ name: optName, required: false, values: Array.from(valuesMap.values()) });
      }

      // Variant quantities
      if (rows.length > 1 && quantity === null) {
        let totalQty = 0, hasNumeric = false;
        for (const row of rows) {
          const vq = (row[idx['Quantity']] || '').trim();
          if (vq && vq !== 'Available') {
            const parsed = parseInt(vq);
            if (!isNaN(parsed)) { totalQty += parsed; hasNumeric = true; }
          }
        }
        if (hasNumeric) quantity = totalQty;
      }

      try {
        await Product.create({
          name, handle, basePrice, salePrice,
          imageUrl: images[0] || '', images, description,
          collectionId, collectionIds: colIds, options,
          sortOrder, active: status === 'active', status, quantity
        });
        created++;
        sortOrder++;
      } catch (err) { /* skip invalid */ }
    }

    // Update collection images
    for (const [, colId] of Object.entries(collectionMap)) {
      const fp = await Product.findOne({
        $or: [{ collectionId: colId }, { collectionIds: colId }],
        images: { $exists: true, $ne: [] }
      }).sort({ sortOrder: 1 });
      if (fp && fp.images.length > 0) {
        await Collection.findByIdAndUpdate(colId, { imageUrl: fp.images[0] });
      }
    }

    res.json({ message: `Seed complete: ${created} products, ${Object.keys(collectionMap).length} collections` });
  } catch (err) {
    res.status(500).json({ error: 'Seed failed: ' + err.message });
  }
});

// POST /api/seed/shipping — replaces existing shipping with hierarchical list from Shipment.txt
router.post('/shipping', adminAuth, async (req, res) => {
  try {
    const filePath = path.join(__dirname, '../../Shipment.txt');
    console.log('Attempting to seed shipping from:', filePath);
    
    if (!fs.existsSync(filePath)) {
      console.error('Shipment.txt not found at:', filePath);
      return res.status(404).json({ error: 'Shipment.txt not found' });
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const rawData = JSON.parse(fileContent);
    
    // Support both [ { data: [] } ] and { data: [] } formats
    const rootData = Array.isArray(rawData) ? rawData[0] : rawData;
    const sourceData = rootData.data;

    if (!sourceData || !Array.isArray(sourceData)) {
      console.error('Invalid Shipment.txt structure: data array not found');
      return res.status(400).json({ error: 'Invalid data structure in Shipment.txt' });
    }

    console.log(`Found ${sourceData.length} cities in Shipment.txt`);

    const newData = sourceData.map(c => {
      const districts = c.districts || [];
      return {
        city: c.cityName,
        cityOtherName: c.cityOtherName,
        bostaCityId: c.cityId || c.cityCode,
        fee: 85,
        zones: districts.map(d => ({
          name: d.districtName || d.zoneName,
          otherName: d.districtOtherName || d.zoneOtherName,
          zoneName: d.zoneName,
          zoneOtherName: d.zoneOtherName,
          districtOtherName: d.districtOtherName,
          bostaZoneId: d.zoneId,
          bostaDistrictId: d.districtId,
          bostaAvailable: d.dropOffAvailability !== false,
          dropOffAvailability: d.dropOffAvailability !== false
        }))
      };
    });

    const totalZones = newData.reduce((acc, c) => acc + c.zones.length, 0);
    console.log(`Total zones to import: ${totalZones}`);

    // Drop all indexes to fix stale unique field errors
    try {
      await Shipping.collection.dropIndexes();
      console.log('Dropped existing indexes for Shipping collection');
    } catch (e) {
      console.warn('Could not drop indexes:', e.message);
    }

    await Shipping.deleteMany({});
    console.log('Cleared existing shipping data');

    const result = await Shipping.insertMany(newData);
    console.log(`Successfully inserted ${result.length} cities`);

    // Inject dropoff-false zones into Egypt Post shipping options setting
    const Setting = require('../models/Setting');
    let shippingOptionsRecord = await Setting.findOne({ key: 'shipping_options' });
    let options = shippingOptionsRecord ? shippingOptionsRecord.value : null;

    const EGYPT_GOVERNORATES = [
      "القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "البحر الأحمر", "البحيرة", 
      "الفيوم", "الغربية", "الإسماعيلية", "المنوفية", "المنيا", "القليوبية", 
      "الوادي الجديد", "السويس", "الشرقية", "أسوان", "أسيوط", "بني سويف", 
      "بورسعيد", "دمياط", "جنوب سيناء", "كفر الشيخ", "مطروح", "الأقصر", 
      "قنا", "شمال سيناء", "سوهاج", "الساحل الشمالي"
    ];

    if (!options || !Array.isArray(options) || options.length === 0) {
      options = [
        {
          name: "البريد المصري",
          cost: 80,
          cities: EGYPT_GOVERNORATES.map(gov => ({
            city: gov,
            fee: 80,
            zones: []
          }))
        },
        {
          name: "بوسطة",
          cost: 150,
          cities: EGYPT_GOVERNORATES.map(gov => ({
            city: gov,
            fee: 150,
            zones: []
          }))
        }
      ];
    }

    const normalizeCityName = (str) => {
      if (!str) return '';
      return str
        .replace(/[أإآا]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/\s+/g, '')
        .toLowerCase()
        .trim();
    };

    // 1. Seed Egypt Post (dropoff-false zones where Bosta doesn't deliver)
    const egyptPostOpt = options.find(o => o.name.includes('البريد') || o.name.toLowerCase().includes('post'));
    if (egyptPostOpt) {
      newData.forEach(c => {
        let matchingEgyptPostCity = egyptPostOpt.cities.find(ec => {
          const ecNorm = normalizeCityName(ec.city);
          const cNorm = normalizeCityName(c.city);
          const cOtherNorm = normalizeCityName(c.cityOtherName);
          return ecNorm === cNorm || ecNorm === cOtherNorm;
        });

        if (!matchingEgyptPostCity) {
          matchingEgyptPostCity = {
            city: c.cityOtherName || c.city,
            fee: egyptPostOpt.cost || 80,
            zones: []
          };
          egyptPostOpt.cities.push(matchingEgyptPostCity);
        }

        const dropoffFalseZones = c.zones
          .filter(z => z.dropOffAvailability === false)
          .map(z => z.otherName || z.name);

        matchingEgyptPostCity.zones = Array.from(new Set(dropoffFalseZones));
      });
    }

    // 2. Seed Bosta (dropoff-true zones where Bosta delivers)
    const bostaOpt = options.find(o => o.name.includes('بوسطة') || o.name.toLowerCase().includes('bosta'));
    if (bostaOpt) {
      newData.forEach(c => {
        let matchingBostaCity = bostaOpt.cities.find(ec => {
          const ecNorm = normalizeCityName(ec.city);
          const cNorm = normalizeCityName(c.city);
          const cOtherNorm = normalizeCityName(c.cityOtherName);
          return ecNorm === cNorm || ecNorm === cOtherNorm;
        });

        if (!matchingBostaCity) {
          matchingBostaCity = {
            city: c.cityOtherName || c.city,
            fee: bostaOpt.cost || 150,
            zones: []
          };
          bostaOpt.cities.push(matchingBostaCity);
        }

        const dropoffTrueZones = c.zones
          .filter(z => z.dropOffAvailability === true)
          .map(z => z.otherName || z.name);

        matchingBostaCity.zones = Array.from(new Set(dropoffTrueZones));
      });
    }

    await Setting.findOneAndUpdate(
      { key: 'shipping_options' },
      { value: options },
      { upsert: true }
    );
    console.log('Successfully injected zones into Egypt Post and Bosta shipping options');

    // Refresh cache
    const redis = require('../utils/redis');
    const fees = await Shipping.find({}, 'city cityOtherName fee');
    await redis.set('storefront:shipping:list', JSON.stringify(fees));
    await redis.del('storefront:settings:shipping_options');

    res.json({ message: `Successfully seeded ${newData.length} cities and ${totalZones} zones from Shipment.txt` });
  } catch (err) {
    console.error('Shipping seed failed:', err);
    res.status(500).json({ error: 'Seed failed: ' + err.message });
  }
});

// CSV parser
function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;
  function readField() {
    if (i >= len || text[i] === '\n' || text[i] === '\r') return '';
    if (text[i] === '"') {
      i++;
      let val = '';
      while (i < len) {
        if (text[i] === '"') {
          if (i + 1 < len && text[i + 1] === '"') { val += '"'; i += 2; }
          else { i++; break; }
        } else { val += text[i]; i++; }
      }
      return val;
    } else {
      let val = '';
      while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') { val += text[i]; i++; }
      return val;
    }
  }
  while (i < len) {
    const row = [];
    while (true) {
      row.push(readField());
      if (i < len && text[i] === ',') { i++; continue; }
      break;
    }
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

// GET /api/seed/migrate-cloudinary — Migrates all images from assets.wuiltstore.com to Cloudinary
router.get('/migrate-cloudinary', async (req, res) => {
  try {
    if (!isCloudinaryConfigured) {
      return res.status(400).json({
        error: 'Cloudinary is not configured! Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your backend environment variables (on Render) before running this migration.'
      });
    }

    console.log('🏁 Cloudinary migration started...');
    const report = {
      productsProcessed: 0,
      productsUpdated: 0,
      collectionsProcessed: 0,
      collectionsUpdated: 0,
      settingsUpdated: false,
      errors: []
    };

    // 1. Migrate Products
    const products = await Product.find({});
    report.productsProcessed = products.length;

    for (const product of products) {
      let isUpdated = false;

      // Migrate Main Image
      if (product.imageUrl && product.imageUrl.includes('assets.wuiltstore.com')) {
        try {
          console.log(`Uploading product image for: ${product.name}`);
          const newUrl = await uploadToCloudinary(product.imageUrl, 'ecommerce-products');
          if (newUrl && newUrl !== product.imageUrl) {
            product.imageUrl = newUrl;
            isUpdated = true;
          }
        } catch (err) {
          report.errors.push(`Product main image error (${product.name}): ${err.message}`);
        }
      }

      // Migrate Images Gallery
      if (product.images && product.images.length > 0) {
        const newImages = [];
        let galleryChanged = false;
        for (const imgUrl of product.images) {
          if (imgUrl && imgUrl.includes('assets.wuiltstore.com')) {
            try {
              console.log(`Uploading gallery image for product: ${product.name}`);
              const newUrl = await uploadToCloudinary(imgUrl, 'ecommerce-products');
              newImages.push(newUrl);
              galleryChanged = true;
            } catch (err) {
              newImages.push(imgUrl); // Keep original on error
              report.errors.push(`Product gallery image error (${product.name}): ${err.message}`);
            }
          } else {
            newImages.push(imgUrl);
          }
        }
        if (galleryChanged) {
          product.images = newImages;
          isUpdated = true;
        }
      }

      if (isUpdated) {
        await product.save();
        report.productsUpdated++;
      }
    }

    // 2. Migrate Collections
    const collections = await Collection.find({});
    report.collectionsProcessed = collections.length;

    for (const collection of collections) {
      if (collection.imageUrl && collection.imageUrl.includes('assets.wuiltstore.com')) {
        try {
          console.log(`Uploading collection image for: ${collection.name}`);
          const newUrl = await uploadToCloudinary(collection.imageUrl, 'ecommerce-collections');
          if (newUrl && newUrl !== collection.imageUrl) {
            collection.imageUrl = newUrl;
            await collection.save();
            report.collectionsUpdated++;
          }
        } catch (err) {
          report.errors.push(`Collection image error (${collection.name}): ${err.message}`);
        }
      }
    }

    // 3. Migrate Global Settings (Logo, Favicon, Preview)
    const globalSettings = await Setting.findOne({ key: 'sundura_global_settings' });
    if (globalSettings && globalSettings.value) {
      let settingsChanged = false;
      const settingsVal = { ...globalSettings.value };

      // Logo
      if (settingsVal.storeLogo && settingsVal.storeLogo.includes('assets.wuiltstore.com')) {
        try {
          console.log('Uploading store logo to Cloudinary...');
          const newUrl = await uploadToCloudinary(settingsVal.storeLogo, 'ecommerce-branding');
          settingsVal.storeLogo = newUrl;
          settingsChanged = true;
        } catch (err) {
          report.errors.push(`Logo upload error: ${err.message}`);
        }
      }

      // Favicon
      if (settingsVal.storeFavicon && settingsVal.storeFavicon.includes('assets.wuiltstore.com')) {
        try {
          console.log('Uploading store favicon to Cloudinary...');
          const newUrl = await uploadToCloudinary(settingsVal.storeFavicon, 'ecommerce-branding');
          settingsVal.storeFavicon = newUrl;
          settingsChanged = true;
        } catch (err) {
          report.errors.push(`Favicon upload error: ${err.message}`);
        }
      }

      // Preview Image
      if (settingsVal.storePreview && settingsVal.storePreview.includes('assets.wuiltstore.com')) {
        try {
          console.log('Uploading store preview image to Cloudinary...');
          const newUrl = await uploadToCloudinary(settingsVal.storePreview, 'ecommerce-branding');
          settingsVal.storePreview = newUrl;
          settingsChanged = true;
        } catch (err) {
          report.errors.push(`Preview image upload error: ${err.message}`);
        }
      }

      if (settingsChanged) {
        globalSettings.value = settingsVal;
        globalSettings.markModified('value'); // Tell Mongoose that the mixed type value was modified
        await globalSettings.save();
        report.settingsUpdated = true;
        
        // Also clear Redis cache if it exists so settings refresh instantly!
        try {
          const redis = require('../utils/redis');
          if (redis && typeof redis.del === 'function') {
            await redis.del('setting:sundura_global_settings');
            console.log('Cleared settings Redis cache');
          }
        } catch (e) {
          console.log('No Redis or couldn\'t clear settings cache:', e.message);
        }
      }
    }

    // Clear storefront list products and collections cache
    try {
      const cache = require('../utils/cache');
      await cache.clearPrefix('storefront:products:list:');
      await cache.del('storefront:collections:list');
      console.log('Cleared storefront products and collections cache after Cloudinary migration');
    } catch (e) {
      console.log('Failed to clear storefront cache after migration:', e.message);
    }

    console.log('🏁 Cloudinary migration complete!');
    res.json({
      success: true,
      message: 'Cloudinary migration complete!',
      report
    });

  } catch (err) {
    console.error('❌ Cloudinary migration failed:', err);
    res.status(500).json({ error: 'Migration failed: ' + err.message });
  }
});

module.exports = router;
