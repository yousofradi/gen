const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const adminAuth = require('../middleware/adminAuth');

// GET /api/customers — List all unique customers with stats
router.get('/', adminAuth, async (req, res) => {
  try {
    const customers = await Order.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$customer.phone",
          name: { $first: "$customer.name" },
          phone: { $first: "$customer.phone" },
          secondPhone: { $first: "$customer.secondPhone" },
          government: { $first: "$customer.government" },
          zone: { $first: "$customer.zone" },
          address: { $first: "$customer.address" },
          totalSpent: { $sum: "$paidAmount" },
          orderCount: { $sum: 1 },
          lastOrderDate: { $max: "$createdAt" },
          firstOrderDate: { $min: "$createdAt" }
        }
      },
      { $sort: { lastOrderDate: -1 } }
    ]);
    res.json(customers);
  } catch (err) {
    console.error('Fetch customers error:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// GET /api/customers/:phone — Specific customer profile & history
router.get('/:phone', adminAuth, async (req, res) => {
  try {
    const phone = req.params.phone;
    
    // Get stats
    const statsArr = await Order.aggregate([
      { $match: { "customer.phone": phone } },
      {
        $group: {
          _id: "$customer.phone",
          name: { $first: "$customer.name" },
          phone: { $first: "$customer.phone" },
          secondPhone: { $first: "$customer.secondPhone" },
          government: { $first: "$customer.government" },
          zone: { $first: "$customer.zone" },
          address: { $first: "$customer.address" },
          notes: { $first: "$customer.notes" },
          totalSpent: { $sum: "$paidAmount" },
          orderCount: { $sum: 1 },
          lastOrderDate: { $max: "$createdAt" },
          firstOrderDate: { $min: "$createdAt" }
        }
      }
    ]);

    if (statsArr.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = statsArr[0];

    // Get order history
    const orders = await Order.find({ "customer.phone": phone }).sort({ createdAt: -1 });

    res.json({ customer, orders });
  } catch (err) {
    console.error('Fetch customer detail error:', err);
    res.status(500).json({ error: 'Failed to fetch customer details' });
  }
});

// PUT /api/customers/:phone — Update a customer's profile across all their orders
router.put('/:phone', adminAuth, async (req, res) => {
  try {
    const originalPhone = req.params.phone;
    const { name, phone, secondPhone, government, zone, address } = req.body;

    if (!name || !phone || !government || !zone || !address) {
      return res.status(400).json({ error: 'Name, phone, government, zone, and address are required' });
    }

    // Update all matching orders
    const result = await Order.updateMany(
      { "customer.phone": originalPhone },
      {
        $set: {
          "customer.name": name,
          "customer.phone": phone,
          "customer.secondPhone": secondPhone || '',
          "customer.government": government,
          "customer.zone": zone,
          "customer.address": address
        }
      }
    );

    res.json({ success: true, message: `Updated ${result.modifiedCount} orders for the customer` });
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

module.exports = router;
