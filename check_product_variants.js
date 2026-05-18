// check_product_variants.js
require('dotenv').config({ path: 'backend/.env' });
const mongoose = require('mongoose');
const Product = require('./backend/models/Product');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('Connected to DB');

  const products = await Product.find({ 'options.0': { $exists: true } });
  console.log(`Found ${products.length} products with options:`);

  for (const p of products) {
    console.log(`\nProduct: ${p.name} (${p._id})`);
    console.log('Options:', JSON.stringify(p.options, null, 2));
    console.log('Variants:');
    p.variants.forEach((v, idx) => {
      console.log(`  Variant #${idx}:`);
      console.log(`    Combination:`, typeof v.combination, JSON.stringify(v.combination));
      console.log(`    Price: ${v.price}`);
    });
  }

  await mongoose.disconnect();
}

run().catch(console.error);
