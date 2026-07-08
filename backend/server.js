require('dotenv').config();

// Programmatically suppress Bull/BullMQ automatic Redis eviction policy warning logs
const originalWarn = console.warn;
console.warn = function (...args) {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('Eviction policy is')) {
    return;
  }
  originalWarn.apply(console, args);
};
const originalError = console.error;
console.error = function (...args) {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('Eviction policy is')) {
    return;
  }
  originalError.apply(console, args);
};
const originalLog = console.log;
console.log = function (...args) {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('Eviction policy is')) {
    return;
  }
  originalLog.apply(console, args);
};
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Initialize background worker
require('./utils/queue');

const app = express();

// ── Middleware ───────────────────────────────────────────
const compression = require('compression');
app.use(compression()); // gzip all responses

// ── CORS Configuration ──────────────────────────────────
const corsOptions = {
  origin: true, // Reflect request origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
  exposedHeaders: ['Content-Disposition'],
  credentials: true,
  maxAge: 86400
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));

// ── Routes ──────────────────────────────────────────────
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/shipping', require('./routes/shipping'));
app.use('/api/collections', require('./routes/collectionRoutes').router);
app.use('/api/webhooks', require('./routes/webhookRoutes'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/seed', require('./routes/seed'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/abandoned-carts', require('./routes/abandonedCarts'));
app.use('/api/visitors', require('./routes/visitors'));

// Serve static uploads with long cache
app.use('/uploads', express.static('uploads', {
  maxAge: '30d',
  immutable: true
}));

// ── Root route ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'SunduraShop API is running',
    endpoints: {
      health: 'GET /api/health',
      products: 'GET /api/products',
      collections: 'GET /api/collections',
      shipping: 'GET /api/shipping',
      orders: 'POST /api/orders'
    }
  });
});

// ── Health check ────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 handler ─────────────────────────────────────────
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Error handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(` Server running on port ${PORT}`);
  });
});
