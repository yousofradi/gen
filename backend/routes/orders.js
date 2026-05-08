const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Order = require('../models/Order');
const adminAuth = require('../middleware/adminAuth');
const sendWebhook = require('../utils/webhook');
const { sendPushToAdmins } = require('../utils/push');

// Helper: recalculate totals from items + shipping + discount
function calcTotals(items, shippingFee, orderDiscount = 0) {
  let subtotal = 0;
  for (const item of items) {
    // Standardized Pricing Model: finalPrice is the LINE TOTAL (unit * qty - disc)
    // We try to find the unit price from item.unitPrice, item.price, or item.basePrice
    const unitPrice = Number(item.unitPrice) || Number(item.price) || Number(item.basePrice) || 0;
    const itemDiscount = Number(item.discount) || 0;

    const rowTotal = Math.max(0, (unitPrice * item.quantity) - itemDiscount);
    item.finalPrice = rowTotal; // Store as line total in DB
    subtotal += rowTotal;
  }
  const totalPrice = Math.max(0, subtotal + (Number(shippingFee) || 0) - (Number(orderDiscount) || 0));
  return { subtotal, totalPrice };
}

// Helper to format invoice HTML for a single order (Exact logic from user)
async function generateInvoiceInnerHtml(order, settings) {
  const safe = (val) => (val === undefined || val === null) ? '' : String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const num = (val) => Number(val) || 0;

  const brandName = settings.invoicePrefix || settings.storeName || 'المتجر';

  // ================== PRODUCTS ==================
  const productsHtml = order.items.map((p) => {
    // Unit price derivation for display
    const unitPrice = Number(p.unitPrice) || Number(p.price) || Number(p.basePrice) || 0;
    const optionsText = (p.selectedOptions || []).map(o => o.label).join(' / ');
    return `
      <tr>
        <td style="text-align: right; padding-right: 8px;">
          ${safe(p.name)} ${optionsText ? `<br><small style="color:#666; font-size:10px;">${safe(optionsText)}</small>` : ''}
        </td>
        <td>${safe(p.quantity)}</td>
        <td>${num(unitPrice)}</td>
        <td>${num(p.finalPrice)} ج</td>
      </tr>
    `;
  }).join('');

  // ================== NOTES ==================
  const notesArray = order.customer.notes
    ? order.customer.notes.split('-').filter(n => n.trim() !== '')
    : [];

  const notesHtml = notesArray.length
    ? notesArray.map(n => `
      <div style="margin-bottom:4px;">• ${safe(n.replace(/^-/, '').trim())}</div>
    `).join('')
    : `<div>لا توجد ملاحظات</div>`;

  // ================== CALCULATIONS ==================
  const sub = order.items.reduce((s, i) => s + i.finalPrice, 0);
  const shipping = num(order.shippingFee);
  const total = num(order.totalPrice);
  const paid = num(order.paidAmount);
  const remaining = total - paid;

  // Add 10 EGP extra fee if not fully paid (COD fee)
  const codFee = remaining > 0 ? 10 : 0;
  const displayRemaining = remaining + codFee;

  // ================== PHONE ==================
  let phone = safe(order.customer.phone);
  if (order.customer.secondPhone) {
    phone += ` - ${order.customer.secondPhone}`;
  }

  // ================== REMAINING TEXT ==================
  let remtext = 'المتبقي عند الاستلام (+10 ج رسوم)';
  if (remaining === 0) {
    remtext = 'مدفوع بالكامل';
  }

  return `
<div class="invoice">
  <table class="customer-table">
    <tbody>
      <tr><td class="label-column">الاسم</td><td class="value-column">${safe(order.customer.name)}</td></tr>
      <tr><td class="label-column">الهاتف</td><td class="value-column">${phone}</td></tr>
      <tr><td class="label-column">المحافظة</td><td class="value-column">${safe(order.customer.government)}</td></tr>
      <tr><td class="label-column">العنوان</td><td class="value-column">${safe(order.customer.address)}</td></tr>
    </tbody>
  </table>

  <div class="order-section">
    <table class="items-table">
      <thead>
        <tr><th>المنتج</th><th>عدد</th><th>سعر</th><th>إجمالي</th></tr>
      </thead>
      <tbody>
        ${productsHtml}
      </tbody>
    </table>

    <div class="summary">
      <div class="row"><span>المبلغ الفرعي</span><span>${sub} ج</span></div>
      <div class="row"><span>مصاريف الشحن (${safe(order.customer.government)})</span><span>${shipping} ج</span></div>
      <div class="row grand"><span>الإجمالي</span><span>${total} ج</span></div>
    </div>

    <div class="paid-box">
      <div class="row green"><span>المدفوع</span><span>${paid} ج</span></div>
      <div class="row red"><span>${remtext}</span><span>${displayRemaining} ج</span></div>
    </div>

    <div class="notes-section">
      <div class="notes-title">ملاحظات :</div>
      <div style="line-height:1.6; font-weight:700;">
        ${notesHtml}
      </div>
    </div>

    <div class="footer">♡ شكراً لشرائك من متجر ${brandName} ♡</div>
  </div>
</div>
`;
}

// ── Public ──────────────────────────────────────────────

// POST /api/orders — create order (public from storefront OR admin)
router.post('/', async (req, res) => {
  try {
    const { customer, items, paymentMethod, discount = 0, paidAmount = 0 } = req.body;

    if (!customer || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Customer info and at least one item are required' });
    }
    if (!customer.name || !customer.phone || !customer.address || !customer.government) {
      return res.status(400).json({ error: 'Customer name, phone, address, and government are required' });
    }
    if (!paymentMethod) {
      return res.status(400).json({ error: 'Valid payment method is required' });
    }

    // Shipping fee: try DB first, fall back to static config
    let shippingFee = 0;
    try {
      const Shipping = require('../models/Shipping');
      const record = await Shipping.findOne({ governorate: customer.government });
      if (record) {
        shippingFee = record.fee;
      } else {
        const defaultFees = require('../config/shipping');
        shippingFee = defaultFees[customer.government] || 0;
      }
    } catch (e) {
      const defaultFees = require('../config/shipping');
      shippingFee = defaultFees[customer.government] || 0;
    }

    if (shippingFee === 0 && !customer.government) {
      return res.status(400).json({ error: `Unknown government: ${customer.government}` });
    }

    const { totalPrice } = calcTotals(items, shippingFee, discount);

    const Counter = require('../models/Counter');
    const counter = await Counter.findByIdAndUpdate(
      'orderSeq',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const generatedOrderId = `Order-${counter.seq}`;

    const order = new Order({
      orderId: generatedOrderId,
      customer,
      items,
      discount,
      totalPrice,
      shippingFee,
      paymentMethod,
      paidAmount: Number(paidAmount) || 0,
      paid: (Number(paidAmount) || 0) >= totalPrice
    });

    await order.save();

    // Fetch store logo for notification
    let storeLogo = '/admin/logo.png';
    try {
      const Setting = require('../models/Setting');
      const globalSettings = await Setting.findOne({ key: 'sundura_global_settings' });
      if (globalSettings && globalSettings.value.storeLogo) {
        storeLogo = globalSettings.value.storeLogo;
      }
    } catch (e) { }

    // Send push notification to admins
    sendPushToAdmins({
      title: 'طلب جديد! 📦',
      body: `طلب بقيمة ${order.totalPrice} ج.م من ${order.customer.name}`,
      icon: storeLogo,
      sound: 'https://cdn.pixabay.com/audio/2022/11/04/audio_7650b73fdb.mp3',
      data: {
        url: `/admin/order-details.html?id=${order.orderId}`,
        sound: 'https://cdn.pixabay.com/audio/2022/11/04/audio_7650b73fdb.mp3'
      }
    });

    await sendWebhook('order.created', order.toObject());
    res.status(201).json(order);
  } catch (err) {
    console.error('Order creation error:', err);
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// GET /api/orders/public/:orderId — single order (public for storefront)
router.get('/public/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// ── Admin ───────────────────────────────────────────────

// GET /api/orders/bulk/download-pdf — Bulk PDF download using PDFBolt
router.get('/bulk/download-pdf', adminAuth, async (req, res) => {
  try {
    const orders = await Order.find({ archived: { $ne: true }, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 });
    const Setting = require('../models/Setting');
    const globalSettings = await Setting.findOne({ key: 'sundura_global_settings' });
    const settings = globalSettings ? globalSettings.value : {};

    let pagesHtml = '';
    for (const order of orders) {
      const innerHtml = await generateInvoiceInnerHtml(order, settings);
      pagesHtml += `
        <div class="page" style="page-break-after: always;">
          <div class="invoice-wrapper">
            ${innerHtml}
          </div>
        </div>
      `;
    }

    const fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap');
* { font-family: 'Cairo', sans-serif !important; box-sizing: border-box; }
@page { size: A5; margin: 4mm; }
body { margin: 0; padding: 0; }
.page {
  page-break-after: always;
  break-after: page;
  width: 140mm;
  height: 202mm;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page:last-child { page-break-after: auto; break-after: auto; }
.invoice-wrapper { width: 100%; transform-origin: center center; }

/* USER CSS START */
.invoice { width: 500px; margin: 0 auto; direction: rtl; padding: 10px 5px; }
.customer-table { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 7px; }
.customer-table td { border: 1px solid #000; font-size: 10px; font-weight: 600; text-align: center; padding: 4px; }
.label-column { width: 25%; background: #fff; }
.value-column { width: 75%; }
.order-section { border: 1px solid #000; }
.items-table { width: 100%; border-collapse: collapse; }
.items-table thead { background: #f5ede0; }
.items-table th, .items-table td { padding: 6px 6px; font-weight: 600; font-size: 12px; text-align: center; border-bottom: 1px solid #a6a5a5; }
.items-table tbody tr:nth-child(even) { background-color: #f9f6ef; }
.items-table tbody tr:nth-child(odd) { background-color: #ffffff; }
.items-table td:first-child, .items-table th:first-child { text-align: right; }
.summary { background: #f5ede0; padding: 1px 6px; }
.row { display: flex; justify-content: space-between; font-size: 13px; margin: 2px; }
.grand { border-top: 2px solid #4a2c0a; font-weight: 700; margin-top: 4px; padding-top: 4px; }
.paid-box { background: #e8f5ed; padding: 1px 6px; }
.green { color: #1a7a45; font-weight: 700; }
.red { color: #b84a20; font-weight: 700; }
.notes-section { padding: 4px 6px; font-size: 11px; background: #f5ede0; }
.notes-title { font-weight: 700; color: #b84a20; text-decoration: underline; padding-bottom: 2px; }
.footer { background: #4a2c0a; color: #fff; text-align: center; padding: 7px; font-weight: 700; font-size: 13px; }
/* USER CSS END */
</style>
<script>
window.onload = function() {
  document.querySelectorAll('.page').forEach(function(page) {
    var wrapper = page.querySelector('.invoice-wrapper');
    if (!wrapper) return;
    var pageH = page.offsetHeight;
    var pageW = page.offsetWidth;
    var contentH = wrapper.scrollHeight;
    var contentW = wrapper.scrollWidth;
    var scaleH = pageH / contentH;
    var scaleW = pageW / contentW;
    var scale = Math.min(scaleH, scaleW);
    scale = Math.min(Math.max(scale, 0.55), 2.0);
    wrapper.style.transform = 'scale(' + scale + ')';
    wrapper.style.width = (100 / scale) + '%';
  });
};
</script>
</head>
<body>
${pagesHtml}
</body>
</html>`;

    // Call PDFBolt API
    const apiKey = process.env.PDFBOLT_API_KEY;
    if (!apiKey) throw new Error('PDFBOLT_API_KEY is missing');

    const response = await fetch('https://api.pdfbolt.com/v1/direct', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-KEY': apiKey
      },
      body: JSON.stringify({
        html: Buffer.from(fullHtml).toString('base64'),
        format: 'A5',
        printBackground: true,
        preferCssPageSize: true,
        compression: 'low'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`PDFBolt Error: ${errText}`);
    }

    const pdfBuffer = await response.arrayBuffer();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=all-invoices.pdf`);
    res.send(Buffer.from(pdfBuffer));

  } catch (err) {
    console.error('Bulk PDF Generation Error:', err);
    res.status(500).send('Failed to generate bulk PDF: ' + err.message);
  }
});

// GET /api/orders/:orderId/download-pdf — Automatic PDF download using PDFBolt
router.get('/:orderId/download-pdf', adminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    let query = { orderId: orderId };
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query = { $or: [{ orderId: orderId }, { _id: orderId }] };
    }

    const order = await Order.findOne(query);
    if (!order) return res.status(404).send('Order not found');

    const Setting = require('../models/Setting');
    const globalSettings = await Setting.findOne({ key: 'sundura_global_settings' });
    const settings = globalSettings ? globalSettings.value : {};

    const innerHtml = await generateInvoiceInnerHtml(order, settings);

    // Full HTML for PDFBolt
    const fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap');
* { font-family: 'Cairo', sans-serif !important; box-sizing: border-box; }
@page { size: A5; margin: 4mm; }
body { margin: 0; padding: 0; }
.page {
  width: 140mm;
  height: 202mm;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.invoice-wrapper { width: 100%; transform-origin: center center; }

/* USER CSS START */
.invoice { width: 500px; margin: 0 auto; direction: rtl; padding: 10px 5px; }
.customer-table { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 7px; }
.customer-table td { border: 1px solid #000; font-size: 10px; font-weight: 600; text-align: center; padding: 4px; }
.label-column { width: 25%; background: #fff; }
.value-column { width: 75%; }
.order-section { border: 1px solid #000; }
.items-table { width: 100%; border-collapse: collapse; }
.items-table thead { background: #f5ede0; }
.items-table th, .items-table td { padding: 6px 6px; font-weight: 600; font-size: 12px; text-align: center; border-bottom: 1px solid #a6a5a5; }
.items-table td:first-child, .items-table th:first-child { text-align: right; }
.summary { background: #f5ede0; padding: 1px 6px; }
.row { display: flex; justify-content: space-between; font-size: 13px; margin: 2px; }
.grand { border-top: 2px solid #4a2c0a; font-weight: 700; margin-top: 4px; padding-top: 4px; }
.paid-box { background: #e8f5ed; padding: 1px 6px; }
.green { color: #1a7a45; font-weight: 700; }
.red { color: #b84a20; font-weight: 700; }
.notes-section { padding: 4px 6px; font-size: 11px; background: #f5ede0; }
.notes-title { font-weight: 700; color: #b84a20; text-decoration: underline; padding-bottom: 2px; }
.footer { background: #4a2c0a; color: #fff; text-align: center; padding: 7px; font-weight: 700; font-size: 13px; }
/* USER CSS END */
</style>
<script>
window.onload = function() {
  var page = document.querySelector('.page');
  var wrapper = document.querySelector('.invoice-wrapper');
  if (!wrapper) return;
  var pageH = page.offsetHeight;
  var pageW = page.offsetWidth;
  var contentH = wrapper.scrollHeight;
  var contentW = wrapper.scrollWidth;
  var scaleH = pageH / contentH;
  var scaleW = pageW / contentW;
  var scale = Math.min(scaleH, scaleW);
  scale = Math.min(Math.max(scale, 0.55), 2.0);
  wrapper.style.transform = 'scale(' + scale + ')';
  wrapper.style.width = (100 / scale) + '%';
};
</script>
</head>
<body>
<div class="page">
  <div class="invoice-wrapper">
    ${innerHtml}
  </div>
</div>
</body>
</html>`;

    // Call PDFBolt API
    const apiKey = process.env.PDFBOLT_API_KEY;
    if (!apiKey) throw new Error('PDFBOLT_API_KEY is missing');

    const response = await fetch('https://api.pdfbolt.com/v1/direct', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-KEY': apiKey
      },
      body: JSON.stringify({
        html: Buffer.from(fullHtml).toString('base64'),
        format: 'A5',
        printBackground: true,
        preferCssPageSize: true,
        compression: 'low'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`PDFBolt Error: ${errText}`);
    }

    const pdfBuffer = await response.arrayBuffer();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
    res.send(Buffer.from(pdfBuffer));

  } catch (err) {
    console.error('PDF Generation Error:', err);
    res.status(500).send('Failed to generate PDF: ' + err.message);
  }
});

// GET /api/orders/:orderId/invoice — Raw HTML for preview (Native Print)
router.get('/:orderId/invoice', adminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    let query = { orderId: orderId };
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query = { $or: [{ orderId: orderId }, { _id: orderId }] };
    }

    const order = await Order.findOne(query);
    if (!order) return res.status(404).send('Order not found');

    const Setting = require('../models/Setting');
    const globalSettings = await Setting.findOne({ key: 'sundura_global_settings' });
    const settings = globalSettings ? globalSettings.value : {};

    const innerHtml = await generateInvoiceInnerHtml(order, settings);

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap');
* { font-family: 'Cairo', sans-serif !important; box-sizing: border-box; }
@page { size: A5; margin: 4mm; }
body { margin: 0; padding: 0; }
.page {
  width: 140mm;
  height: 202mm;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.invoice-wrapper { width: 100%; transform-origin: center center; }

/* USER CSS START */
.invoice { width: 500px; margin: 0 auto; direction: rtl; padding: 10px 5px; }
.customer-table { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 7px; }
.customer-table td { border: 1px solid #000; font-size: 10px; font-weight: 600; text-align: center; padding: 4px; }
.label-column { width: 25%; background: #fff; }
.value-column { width: 75%; }
.order-section { border: 1px solid #000; }
.items-table { width: 100%; border-collapse: collapse; }
.items-table thead { background: #f5ede0; }
.items-table th, .items-table td { padding: 6px 6px; font-weight: 600; font-size: 12px; text-align: center; border-bottom: 1px solid #a6a5a5; }
.items-table tbody tr:nth-child(even) { background-color: #f9f6ef; }
.items-table tbody tr:nth-child(odd) { background-color: #ffffff; }
.items-table td:first-child, .items-table th:first-child { text-align: right; }
.summary { background: #f5ede0; padding: 1px 6px; }
.row { display: flex; justify-content: space-between; font-size: 13px; margin: 2px; }
.grand { border-top: 2px solid #4a2c0a; font-weight: 700; margin-top: 4px; padding-top: 4px; }
.paid-box { background: #e8f5ed; padding: 1px 6px; }
.green { color: #1a7a45; font-weight: 700; }
.red { color: #b84a20; font-weight: 700; }
.notes-section { padding: 4px 6px; font-size: 11px; background: #f5ede0; }
.notes-title { font-weight: 700; color: #b84a20; text-decoration: underline; padding-bottom: 2px; }
.footer { background: #4a2c0a; color: #fff; text-align: center; padding: 7px; font-weight: 700; font-size: 13px; }
/* USER CSS END */
</style>
<script>
window.onload = function() {
  var page = document.querySelector('.page');
  var wrapper = document.querySelector('.invoice-wrapper');
  if (!wrapper) return;
  var pageH = page.offsetHeight;
  var pageW = page.offsetWidth;
  var contentH = wrapper.scrollHeight;
  var contentW = wrapper.scrollWidth;
  var scaleH = pageH / contentH;
  var scaleW = pageW / contentW;
  var scale = Math.min(scaleH, scaleW);
  scale = Math.min(Math.max(scale, 0.55), 2.0);
  wrapper.style.transform = 'scale(' + scale + ')';
  wrapper.style.width = (100 / scale) + '%';
};
</script>
</head>
<body>
<div class="page">
  <div class="invoice-wrapper">
    ${innerHtml}
  </div>
</div>
</body>
</html>`;
    res.send(html);
  } catch (err) {
    res.status(500).send('Failed to generate invoice');
  }
});

// GET /api/orders — list all
router.get('/', adminAuth, async (req, res) => {
  try {
    const { archived } = req.query;
    const query = {};
    if (archived === 'true') {
      query.archived = true;
    } else {
      query.archived = { $ne: true };
    }
    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// POST /api/orders/archive/batch — archive multiple orders
router.post('/archive/batch', adminAuth, async (req, res) => {
  try {
    const { orderIds } = req.body;
    if (!Array.isArray(orderIds)) return res.status(400).json({ error: 'orderIds must be an array' });
    await Order.updateMany({ orderId: { $in: orderIds } }, { $set: { archived: true } });
    res.json({ message: 'Orders archived' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to archive orders' });
  }
});

// POST /api/orders/unarchive/batch — unarchive multiple orders
router.post('/unarchive/batch', adminAuth, async (req, res) => {
  try {
    const { orderIds } = req.body;
    if (!Array.isArray(orderIds)) return res.status(400).json({ error: 'orderIds must be an array' });
    await Order.updateMany({ orderId: { $in: orderIds } }, { $set: { archived: false } });
    res.json({ message: 'Orders unarchived' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unarchive orders' });
  }
});

// POST /api/orders/cancel/batch — cancel multiple orders
router.post('/cancel/batch', adminAuth, async (req, res) => {
  try {
    const { orderIds } = req.body;
    if (!Array.isArray(orderIds)) return res.status(400).json({ error: 'orderIds must be an array' });
    await Order.updateMany({ orderId: { $in: orderIds } }, { $set: { status: 'cancelled' } });
    res.json({ message: 'Orders cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel orders' });
  }
});

// POST /api/orders/delete/batch — delete multiple orders
router.post('/delete/batch', adminAuth, async (req, res) => {
  try {
    const { orderIds } = req.body;
    if (!Array.isArray(orderIds)) return res.status(400).json({ error: 'orderIds must be an array' });
    await Order.deleteMany({ orderId: { $in: orderIds } });
    res.json({ message: 'Orders deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete orders' });
  }
});

// POST /api/orders/:orderId/cancel — cancel single order
router.post('/:orderId/cancel', adminAuth, async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate(
      { orderId: req.params.orderId },
      { $set: { status: 'cancelled' } },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ message: 'Order cancelled', order });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// GET /api/orders/:orderId — single order (GREEDY ROUTE - MUST BE AT BOTTOM)
router.get('/:orderId', adminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    let query = { orderId: orderId };
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query = { $or: [{ orderId: orderId }, { _id: orderId }] };
    }
    const order = await Order.findOne(query);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// PUT /api/orders/:orderId — update order
router.put('/:orderId', adminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    let updates = req.body;
    let query = { orderId: orderId };
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query = { $or: [{ orderId: orderId }, { _id: orderId }] };
    }
    const oldOrder = await Order.findOne(query);
    if (!oldOrder) return res.status(404).json({ error: 'Order not found' });

    // Recalculate totals if items, shipping, or discount changed
    const items = updates.items || oldOrder.items;
    const shippingFee = (updates.shippingFee !== undefined) ? updates.shippingFee : oldOrder.shippingFee;
    const discount = (updates.discount !== undefined) ? updates.discount : oldOrder.discount;

    const { totalPrice } = calcTotals(items, shippingFee, discount);
    updates.totalPrice = totalPrice;
    updates.paid = (Number(updates.paidAmount || oldOrder.paidAmount) >= totalPrice);

    const order = await Order.findOneAndUpdate(query, { $set: updates }, { new: true, runValidators: true });

    if (updates.forcePaymentWebhook || (!oldOrder.paid && order.paid)) {
      await sendWebhook('order.paid', order.toObject());
    }

    res.json(order);
  } catch (err) {
    console.error('Order update error:', err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// DELETE /api/orders/:orderId — delete order
router.delete('/:orderId', adminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    let query = { orderId: orderId };
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query = { $or: [{ orderId: orderId }, { _id: orderId }] };
    }
    const order = await Order.findOneAndDelete(query);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

module.exports = router;
