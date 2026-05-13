const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const Collection = require('../models/Collection');
const Shipping = require('../models/Shipping');
const adminAuth = require('../middleware/adminAuth');

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
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Shipment.txt not found' });
    }

    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const sourceData = rawData[0].data;

    const newData = sourceData.map(c => ({
      city: c.cityName,
      cityOtherName: c.cityOtherName,
      bostaCityId: c.cityCode,
      fee: 85,
      zones: c.districts.map(d => ({
        name: d.districtName,
        otherName: d.districtOtherName,
        bostaZoneId: d.zoneId
      }))
    }));

    // Drop all indexes to fix stale unique field errors
    try {
      await Shipping.collection.dropIndexes();
    } catch (e) {
      console.warn('Could not drop indexes:', e.message);
    }

    await Shipping.deleteMany({});
    await Shipping.insertMany(newData);

    res.json({ message: `Successfully seeded ${newData.length} cities from Shipment.txt` });
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

module.exports = router;
