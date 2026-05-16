const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Order = require('../models/Order');
const adminAuth = require('../middleware/adminAuth');
const sendWebhook = require('../utils/webhook');
const { sendPushToAdmins } = require('../utils/push');
const { adjustStock } = require('../utils/inventory');
const { createBostaDelivery } = require('../utils/bosta');
const { orderQueue } = require('../utils/queue');
const { generateInvoiceInnerHtml } = require('../utils/invoice');


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


// ── Public ──────────────────────────────────────────────

// POST /api/orders — create order (public from storefront OR admin)
router.post('/', async (req, res) => {
  try {
    const { customer, items, paymentMethod, discount = 0, paidAmount = 0, shippingFee: providedShippingFee } = req.body;

    if (!customer || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Customer info and at least one item are required' });
    }
    if (!customer.name || !customer.phone || !customer.address || !customer.government) {
      return res.status(400).json({ error: 'Customer name, phone, address, and government are required' });
    }
    if (!paymentMethod) {
      return res.status(400).json({ error: 'Valid payment method is required' });
    }

    // Shipping fee: try provided, then DB, then fallback to static config
    let shippingFee = providedShippingFee !== undefined ? Number(providedShippingFee) : 0;
    
    if (providedShippingFee === undefined) {
      try {
        const Shipping = require('../models/Shipping');
        // Search by city or cityOtherName
        const record = await Shipping.findOne({ $or: [{ city: customer.government }, { cityOtherName: customer.government }] });
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
      paid: (Number(paidAmount) || 0) >= totalPrice,
      processingStatus: 'pending'
    });

    await order.save();
    
    
    // Decrease stock
    for (const item of items) {
      try {
        await adjustStock(item.productId, item.selectedOptions, -item.quantity);
      } catch (err) {
        console.error(`[Inventory] Failed to decrease stock for ${item.productId}:`, err.message);
      }
    }


    // 4. Background processing (Notifications, Webhooks, etc.)
    await orderQueue.add('process_new_order', { order: order.toObject() });

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
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap');
* { font-family: 'Tajawal', sans-serif !important; box-sizing: border-box; }
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
        preferCssPageSize: true
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

// GET /api/orders/:orderId/download-image — Download invoice as image using SnapRender
router.get('/:orderId/download-image', adminAuth, async (req, res) => {
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

    const fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap');
* { font-family: 'Tajawal', sans-serif !important; box-sizing: border-box; }
body { margin: 0; padding: 0; background: #fff; }
.invoice-container { width: 500px; margin: 0 auto; background: #fff; padding: 10px; }

/* USER CSS START */
.invoice { width: 100%; direction: rtl; padding: 10px 5px; }
.customer-table { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 7px; }
.customer-table td { border: 1px solid #000; font-size: 11px; font-weight: 600; text-align: center; padding: 6px; }
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
</head>
<body>
<div class="invoice-container">
  ${innerHtml}
</div>
</body>
</html>`;

    // Call SnapRender API
    const apiKey = process.env.SNAPRENDER_API_KEY;
    if (!apiKey) throw new Error('SNAPRENDER_API_KEY is missing');
    const response = await fetch('https://app.snap-render.com/v1/screenshot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.SNAPRENDER_API_KEY
      },
      body: JSON.stringify({
        html: await generateInvoiceInnerHtml(order, settings),
        type: 'png',
        width: 500,
        fullPage: true,
        deviceScaleFactor: 2
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`SnapRender Error: ${errText}`);
    }

    const imageBuffer = await response.arrayBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.png`);
    res.send(Buffer.from(imageBuffer));

  } catch (err) {
    console.error('Image Generation Error:', err);
    res.status(500).send('Failed to generate image invoice: ' + err.message);
  }
});

// Alias for compatibility or if you want to keep the old path
router.get('/:orderId/download-pdf', adminAuth, async (req, res) => {
  res.redirect(`/api/orders/${req.params.orderId}/download-image`);
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
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap');
* { font-family: 'Tajawal', sans-serif !important; box-sizing: border-box; }
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
    
    // Restore stock for each order before cancelling
    for (const id of orderIds) {
      const order = await Order.findOne({ orderId: id });
      if (order && order.status !== 'cancelled') {
        for (const item of order.items) {
          await adjustStock(item.productId, item.selectedOptions, item.quantity);
        }
      }
    }

    await Order.updateMany({ orderId: { $in: orderIds } }, { $set: { status: 'cancelled' } });

    // Trigger webhooks for each cancelled order
    res.json({ message: 'Orders cancelled successfully' });

    // Background notifications
    (async () => {
      for (const id of orderIds) {
        try {
          const order = await Order.findOne({ orderId: id });
          if (order) {
            await sendWebhook('order.cancelled', order.toObject());
          }
        } catch (whErr) {
          console.error(`[Webhook] Cancel background fail for ${id}:`, whErr.message);
        }
      }
    })();
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel orders' });
  }
});

// POST /api/orders/delete/batch — delete multiple orders
router.post('/delete/batch', adminAuth, async (req, res) => {
  try {
    const { orderIds } = req.body;
    if (!Array.isArray(orderIds)) return res.status(400).json({ error: 'orderIds must be an array' });

    // Restore stock for each order before deleting
    for (const id of orderIds) {
      const order = await Order.findOne({ orderId: id });
      if (order && order.status !== 'cancelled') {
        for (const item of order.items) {
          await adjustStock(item.productId, item.selectedOptions, item.quantity);
        }
      }
    }

    await Order.deleteMany({ orderId: { $in: orderIds } });

    res.json({ message: 'Orders deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete orders' });
  }
});

// POST /api/orders/:orderId/cancel — cancel single order
router.post('/:orderId/cancel', adminAuth, async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status !== 'cancelled') {
      // Restore stock
      for (const item of order.items) {
        await adjustStock(item.productId, item.selectedOptions, item.quantity);
      }
      order.status = 'cancelled';
      await order.save();
      res.json({ message: 'Order cancelled', order });

      // Background notification
      (async () => {
        try {
          await sendWebhook('order.cancelled', order.toObject());
        } catch (whErr) {
          console.error('[Webhook] Cancel background fail:', whErr.message);
        }
      })();
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// POST /api/orders/bulk/ship — ship multiple orders via Bosta Bulk API
router.post('/bulk/ship', adminAuth, async (req, res) => {
  try {
    const { orderIds } = req.body;
    if (!Array.isArray(orderIds)) return res.status(400).json({ error: 'orderIds must be an array' });

    const orders = await Order.find({ orderId: { $in: orderIds }, bostaDeliveryId: { $exists: false } });
    if (!orders.length) return res.json({ message: 'No eligible orders to ship', count: 0 });

    const { createBulkBostaDeliveries } = require('../utils/bosta');
    const result = await createBulkBostaDeliveries(orders);

    // Bosta returns results in the same order as the input deliveries
    // Support both { deliveries: [] } and direct array [ ... ]
    let successCount = 0;
    const deliveries = Array.isArray(result) ? result : (result.deliveries || []);

    if (deliveries && deliveries.length > 0) {
      for (let i = 0; i < orders.length; i++) {
        // Find matching response by businessReference (orderId) or by index
        const bostaRes = deliveries[i];
        if (bostaRes && (bostaRes._id || bostaRes.id)) {
          const deliveryId = bostaRes._id || bostaRes.id;
          await Order.updateOne({ _id: orders[i]._id }, {
            $set: {
              bostaDeliveryId: deliveryId,
              bostaTrackingNumber: bostaRes.trackingNumber
            }
          });
          successCount++;
        }
      }
    }

    res.json({ message: `تم شحن ${successCount} طلبات بنجاح`, count: successCount });
  } catch (err) {
    console.error('Bulk ship error:', err);
    res.status(500).json({ error: 'Failed to ship orders bulk: ' + err.message });
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
    const order = await Order.findOne(query);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Handle stock adjustment if items changed and order is not cancelled
    if (updates.items && order.status !== 'cancelled') {
      // 1. Restore old stock
      for (const item of order.items) {
        await adjustStock(item.productId, item.selectedOptions, item.quantity);
      }
      // 2. Deduct new stock
      for (const item of updates.items) {
        await adjustStock(item.productId, item.selectedOptions, -item.quantity);
      }
    }

    // Recalculate totals if items, shipping, or discount changed
    const items = updates.items || order.items;
    const shippingFee = (updates.shippingFee !== undefined) ? updates.shippingFee : order.shippingFee;
    const discount = (updates.discount !== undefined) ? updates.discount : order.discount;

    const { totalPrice } = calcTotals(items, shippingFee, discount);
    updates.totalPrice = totalPrice;
    updates.paid = (Number(updates.paidAmount || order.paidAmount) >= totalPrice);

    const updatedOrder = await Order.findOneAndUpdate(query, { $set: updates }, { new: true, runValidators: true });
    res.json(updatedOrder);

    // 4. Trigger Webhooks (WhatsApp, etc.) - Background
    if (updatedOrder && (updates.forcePaymentWebhook || (!order.paid && updatedOrder.paid))) {
      // Fire and forget, but with its own error handling to avoid "headers already sent"
      (async () => {
        try {
          const event = (updatedOrder.paidAmount > 0) ? 'order.paid' : 'order.created';
          console.log(`[Webhook] Force triggering ${event} for order ${updatedOrder.orderId}`);
          await sendWebhook(event, updatedOrder.toObject());
        } catch (whErr) {
          console.error('[Webhook] Background trigger failed:', whErr.message);
        }
      })();
    }
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
    const order = await Order.findOne(query);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status !== 'cancelled') {
      // Restore stock
      for (const item of order.items) {
        await adjustStock(item.productId, item.selectedOptions, item.quantity);
      }
    }

    await Order.deleteOne(query);
    res.json({ message: 'Order deleted' });

  } catch (err) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

module.exports = router;
