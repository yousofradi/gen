const express = require('express');
const router = express.Router();
const AbandonedCart = require('../models/AbandonedCart');
const adminAuth = require('../middleware/adminAuth');

// ── 1. Save or Update Abandoned Cart (Public) ─────────────────
router.post('/', async (req, res) => {
  try {
    const { checkoutToken, customer, items } = req.body;
    if (!checkoutToken) {
      return res.status(400).json({ error: 'checkoutToken is required' });
    }

    // If items is empty or missing, delete the abandoned cart entry so it's not a ghost empty cart!
    if (!items || items.length === 0) {
      await AbandonedCart.findOneAndDelete({ checkoutToken });
      return res.json({ success: true, message: 'Abandoned cart removed since it is now empty' });
    }

    const updatedCart = await AbandonedCart.findOneAndUpdate(
      { checkoutToken },
      { customer, items },
      { new: true, upsert: true }
    );

    res.json({ success: true, cart: updatedCart });
  } catch (err) {
    console.error('Error saving abandoned cart:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 2. Get All Abandoned Carts (Admin) ────────────────────────
router.get('/', adminAuth, async (req, res) => {
  try {
    const carts = await AbandonedCart.find({
      $or: [
        { 'customer.name': { $exists: true, $ne: '', $ne: null } },
        { 'customer.phone': { $exists: true, $ne: '', $ne: null } }
      ]
    }).sort({ updatedAt: -1 });
    res.json(carts);
  } catch (err) {
    console.error('Error fetching abandoned carts:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 2.5 Delete All Abandoned Carts (Admin) ────────────────────
router.delete('/', adminAuth, async (req, res) => {
  try {
    await AbandonedCart.deleteMany({});
    res.json({ success: true, message: 'All abandoned carts deleted successfully' });
  } catch (err) {
    console.error('Error deleting all abandoned carts:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 3. Delete Abandoned Cart by ID (Admin) ────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const deleted = await AbandonedCart.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Abandoned cart not found' });
    }
    res.json({ success: true, message: 'Abandoned cart deleted successfully' });
  } catch (err) {
    console.error('Error deleting abandoned cart:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 4. Delete Abandoned Cart by Token (Public - on Order success)
router.delete('/token/:token', async (req, res) => {
  try {
    await AbandonedCart.findOneAndDelete({ checkoutToken: req.params.token });
    res.json({ success: true, message: 'Abandoned cart cleaned up successfully' });
  } catch (err) {
    console.error('Error cleaning up abandoned cart by token:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 5. Get Abandoned Cart by Token for Recovery (Public) ──────
router.get('/public/:token', async (req, res) => {
  try {
    const cart = await AbandonedCart.findOne({ checkoutToken: req.params.token });
    if (!cart) {
      return res.status(404).json({ error: 'Abandoned cart not found' });
    }
    res.json(cart);
  } catch (err) {
    console.error('Error fetching public abandoned cart by token:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
