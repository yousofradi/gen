// check_product_variants.js
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

async function run() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce';
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const products = await Product.find({ 'options.0': { $exists: true } });
  console.log(`Found ${products.length} products with options:`);

  for (const p of products) {
    console.log(`\nProduct: ${p.name} (${p._id})`);
    console.log('Options:', JSON.stringify(p.options, null, 2));
    console.log('Variants:');
    p.variants.forEach((v, idx) => {
      console.log(`  Variant #${idx}:`);
      console.log(`    Combination:`, typeof v.combination, v.combination instanceof Map ? 'is Map' : 'not Map', JSON.stringify(v.combination));
      console.log(`    Price: ${v.price}`);
    });
  }

  await mongoose.disconnect();
}

run().catch(console.error);
